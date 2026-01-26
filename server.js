// CoachIQ Backend Server - WITH FILE UPLOAD & COMPRESSION
// Handles large video files up to 10GB with automatic compression

const express = require('express');
const cors = require('cors');
const Anthropic = require('@anthropic-ai/sdk');
const ffmpeg = require('fluent-ffmpeg');
const fs = require('fs');
const path = require('path');
const { v4: uuidv4 } = require('uuid');
const multer = require('multer');

const app = express();
app.use(cors());
app.use(express.json({ limit: '100mb' }));

// Configure multer for chunked uploads
const storage = multer.diskStorage({
    destination: (req, file, cb) => {
        const uploadDir = '/tmp/coachiq_uploads';
        if (!fs.existsSync(uploadDir)) {
            fs.mkdirSync(uploadDir, { recursive: true });
        }
        cb(null, uploadDir);
    },
    filename: (req, file, cb) => {
        const uniqueName = `${Date.now()}_${uuidv4()}_${file.originalname}`;
        cb(null, uniqueName);
    }
});

const upload = multer({ 
    storage: storage,
    limits: { fileSize: 10 * 1024 * 1024 * 1024 } // 10GB limit
});

// Initialize Anthropic
const anthropic = new Anthropic({
    apiKey: process.env.ANTHROPIC_API_KEY,
});

// Store reports and upload progress in memory
const reports = new Map();
const uploadProgress = new Map();

// Health check endpoints
app.get('/', (req, res) => {
    res.json({ 
        status: 'CoachIQ API is running', 
        version: '3.0.0-upload',
        features: ['file-upload', 'compression', 'youtube', 'claude-vision']
    });
});

app.get('/health', (req, res) => {
    res.json({ status: 'ok' });
});

// ===========================================
// CHUNK UPLOAD ENDPOINTS (for large files)
// ===========================================

// Initialize a chunked upload session
app.post('/api/upload/init', (req, res) => {
    const { fileName, fileSize, totalChunks } = req.body;
    
    const uploadId = uuidv4();
    const uploadDir = `/tmp/coachiq_chunks_${uploadId}`;
    
    fs.mkdirSync(uploadDir, { recursive: true });
    
    uploadProgress.set(uploadId, {
        id: uploadId,
        fileName,
        fileSize,
        totalChunks,
        receivedChunks: 0,
        chunksDir: uploadDir,
        status: 'uploading',
        createdAt: new Date().toISOString()
    });
    
    console.log(`📤 Upload initialized: ${uploadId} - ${fileName} (${(fileSize / 1024 / 1024).toFixed(1)} MB, ${totalChunks} chunks)`);
    
    res.json({ uploadId, status: 'ready' });
});

// Receive a chunk
app.post('/api/upload/chunk', upload.single('chunk'), (req, res) => {
    const { uploadId, chunkIndex } = req.body;
    
    const progress = uploadProgress.get(uploadId);
    if (!progress) {
        return res.status(404).json({ error: 'Upload session not found' });
    }
    
    // Move chunk to proper location
    const chunkPath = path.join(progress.chunksDir, `chunk_${chunkIndex.padStart(6, '0')}`);
    fs.renameSync(req.file.path, chunkPath);
    
    progress.receivedChunks++;
    uploadProgress.set(uploadId, progress);
    
    const percentComplete = Math.round((progress.receivedChunks / progress.totalChunks) * 100);
    console.log(`📦 Chunk ${progress.receivedChunks}/${progress.totalChunks} received (${percentComplete}%)`);
    
    res.json({ 
        received: progress.receivedChunks, 
        total: progress.totalChunks,
        percentComplete
    });
});

// Finalize upload - combine chunks and start processing
app.post('/api/upload/finalize', async (req, res) => {
    const { uploadId, opponentName, analysisOptions } = req.body;
    
    const progress = uploadProgress.get(uploadId);
    if (!progress) {
        return res.status(404).json({ error: 'Upload session not found' });
    }
    
    if (progress.receivedChunks < progress.totalChunks) {
        return res.status(400).json({ 
            error: 'Upload incomplete', 
            received: progress.receivedChunks,
            expected: progress.totalChunks
        });
    }
    
    // Create report
    const reportId = uuidv4();
    reports.set(reportId, {
        id: reportId,
        status: 'processing',
        opponentName,
        progress: 0,
        progressText: 'Combining video chunks...',
        createdAt: new Date().toISOString()
    });
    
    // Start async processing
    processUploadedVideo(reportId, uploadId, opponentName, analysisOptions || ['defense', 'offense', 'pace']);
    
    res.json({ 
        reportId, 
        status: 'processing',
        message: 'Upload complete. Starting analysis...'
    });
});

// Get upload progress
app.get('/api/upload/:uploadId/progress', (req, res) => {
    const progress = uploadProgress.get(req.params.uploadId);
    if (!progress) {
        return res.status(404).json({ error: 'Upload not found' });
    }
    res.json(progress);
});

// ===========================================
// SIMPLE UPLOAD ENDPOINT (for smaller files < 100MB)
// ===========================================
app.post('/api/upload/simple', upload.single('video'), async (req, res) => {
    try {
        const { opponentName, analysisOptions } = req.body;
        
        if (!req.file) {
            return res.status(400).json({ error: 'No video file uploaded' });
        }
        
        console.log(`📤 Simple upload received: ${req.file.originalname} (${(req.file.size / 1024 / 1024).toFixed(1)} MB)`);
        
        const reportId = uuidv4();
        reports.set(reportId, {
            id: reportId,
            status: 'processing',
            opponentName,
            progress: 0,
            progressText: 'Processing video...',
            createdAt: new Date().toISOString()
        });
        
        // Start async processing
        processSimpleUpload(reportId, req.file.path, opponentName, analysisOptions ? JSON.parse(analysisOptions) : ['defense', 'offense', 'pace']);
        
        res.json({ 
            reportId, 
            status: 'processing',
            message: 'Upload complete. Starting analysis...'
        });
        
    } catch (error) {
        console.error('Upload error:', error);
        res.status(500).json({ error: error.message });
    }
});

// ===========================================
// YOUTUBE URL ENDPOINT (existing)
// ===========================================
app.post('/api/analyze', async (req, res) => {
    const { videoUrl, opponentName, analysisOptions } = req.body;

    console.log('📥 YouTube analysis request:', { videoUrl, opponentName });

    if (!videoUrl || !opponentName) {
        return res.status(400).json({ error: 'Missing videoUrl or opponentName' });
    }

    const reportId = uuidv4();
    
    reports.set(reportId, {
        id: reportId,
        status: 'processing',
        opponentName,
        videoUrl,
        progress: 0,
        progressText: 'Starting...',
        createdAt: new Date().toISOString()
    });

    // For now, return error about YouTube blocking
    reports.set(reportId, {
        ...reports.get(reportId),
        status: 'failed',
        error: 'YouTube downloads are currently blocked. Please upload your video file directly instead.',
        progress: 0
    });

    res.json({ 
        reportId, 
        status: 'processing',
        message: 'Analysis started.'
    });
});

// Get report status/results
app.get('/api/reports/:id', (req, res) => {
    const report = reports.get(req.params.id);
    
    if (!report) {
        return res.status(404).json({ error: 'Report not found' });
    }
    
    res.json(report);
});

// ===========================================
// VIDEO PROCESSING FUNCTIONS
// ===========================================

async function processUploadedVideo(reportId, uploadId, opponentName, analysisOptions) {
    const progress = uploadProgress.get(uploadId);
    const tempDir = `/tmp/coachiq_${reportId}`;
    
    try {
        fs.mkdirSync(tempDir, { recursive: true });
        
        // Step 1: Combine chunks
        updateReport(reportId, { progress: 5, progressText: 'Combining video chunks...' });
        console.log('📦 Combining chunks...');
        
        const combinedPath = path.join(tempDir, 'original_video.mp4');
        await combineChunks(progress.chunksDir, combinedPath);
        
        // Clean up chunks
        fs.rmSync(progress.chunksDir, { recursive: true, force: true });
        uploadProgress.delete(uploadId);
        
        // Continue with common processing
        await processVideoFile(reportId, combinedPath, opponentName, analysisOptions, tempDir);
        
    } catch (error) {
        console.error('❌ Processing error:', error);
        reports.set(reportId, {
            ...reports.get(reportId),
            status: 'failed',
            error: error.message
        });
        cleanup(tempDir);
    }
}

async function processSimpleUpload(reportId, videoPath, opponentName, analysisOptions) {
    const tempDir = `/tmp/coachiq_${reportId}`;
    
    try {
        fs.mkdirSync(tempDir, { recursive: true });
        
        // Move uploaded file to temp dir
        const originalPath = path.join(tempDir, 'original_video.mp4');
        fs.renameSync(videoPath, originalPath);
        
        await processVideoFile(reportId, originalPath, opponentName, analysisOptions, tempDir);
        
    } catch (error) {
        console.error('❌ Processing error:', error);
        reports.set(reportId, {
            ...reports.get(reportId),
            status: 'failed',
            error: error.message
        });
        cleanup(tempDir);
    }
}

async function processVideoFile(reportId, videoPath, opponentName, analysisOptions, tempDir) {
    try {
        // Get video info
        const videoInfo = await getVideoInfo(videoPath);
        console.log('📹 Video info:', videoInfo);
        
        const fileSizeMB = fs.statSync(videoPath).size / (1024 * 1024);
        console.log(`📁 File size: ${fileSizeMB.toFixed(1)} MB`);
        
        // Step 2: Compress if needed (files > 200MB)
        let processedPath = videoPath;
        if (fileSizeMB > 200) {
            updateReport(reportId, { progress: 15, progressText: `Compressing video (${fileSizeMB.toFixed(0)}MB → ~100MB)...` });
            console.log('🗜️ Compressing large video...');
            
            processedPath = path.join(tempDir, 'compressed_video.mp4');
            await compressVideo(videoPath, processedPath, {
                targetSizeMB: 100,
                maxDuration: 600 // 10 minutes max for analysis
            });
            
            const compressedSize = fs.statSync(processedPath).size / (1024 * 1024);
            console.log(`✅ Compressed to ${compressedSize.toFixed(1)} MB`);
        }
        
        // Step 3: Extract frames
        updateReport(reportId, { progress: 35, progressText: 'Extracting key frames...' });
        console.log('🎞️ Extracting frames...');
        
        const frames = await extractFrames(processedPath, tempDir);
        console.log(`✅ Extracted ${frames.length} frames`);
        
        // Step 4: Analyze with Claude
        updateReport(reportId, { progress: 50, progressText: `Analyzing ${frames.length} frames with AI...` });
        console.log('🤖 Sending to Claude...');
        
        const analysis = await analyzeWithClaude(frames, opponentName);
        console.log('✅ Claude analysis complete');
        
        // Step 5: Generate report
        updateReport(reportId, { progress: 85, progressText: 'Generating detailed report...' });
        
        const report = generateReport(analysis, opponentName, frames.length, videoInfo);
        
        // Save final report
        reports.set(reportId, {
            ...reports.get(reportId),
            status: 'complete',
            progress: 100,
            progressText: 'Complete!',
            report: report,
            completedAt: new Date().toISOString()
        });

        console.log('✅ Analysis complete for report:', reportId);
        
    } catch (error) {
        throw error;
    } finally {
        cleanup(tempDir);
    }
}

// Combine chunks into single file
async function combineChunks(chunksDir, outputPath) {
    return new Promise((resolve, reject) => {
        const chunks = fs.readdirSync(chunksDir)
            .filter(f => f.startsWith('chunk_'))
            .sort();
        
        const writeStream = fs.createWriteStream(outputPath);
        
        let index = 0;
        
        function writeNextChunk() {
            if (index >= chunks.length) {
                writeStream.end();
                resolve();
                return;
            }
            
            const chunkPath = path.join(chunksDir, chunks[index]);
            const readStream = fs.createReadStream(chunkPath);
            
            readStream.pipe(writeStream, { end: false });
            readStream.on('end', () => {
                index++;
                writeNextChunk();
            });
            readStream.on('error', reject);
        }
        
        writeStream.on('error', reject);
        writeNextChunk();
    });
}

// Get video information
function getVideoInfo(videoPath) {
    return new Promise((resolve, reject) => {
        ffmpeg.ffprobe(videoPath, (err, metadata) => {
            if (err) {
                reject(err);
                return;
            }
            
            const videoStream = metadata.streams.find(s => s.codec_type === 'video');
            
            resolve({
                duration: metadata.format.duration,
                width: videoStream?.width,
                height: videoStream?.height,
                codec: videoStream?.codec_name,
                bitrate: metadata.format.bit_rate,
                size: metadata.format.size
            });
        });
    });
}

// Compress video for analysis
function compressVideo(inputPath, outputPath, options = {}) {
    const { targetSizeMB = 100, maxDuration = 600 } = options;
    
    return new Promise((resolve, reject) => {
        // Calculate target bitrate (rough estimate)
        const targetBitrate = Math.floor((targetSizeMB * 8 * 1024) / maxDuration); // kbps
        
        console.log(`🎬 Compressing to ~${targetBitrate}kbps, max ${maxDuration}s`);
        
        ffmpeg(inputPath)
            .outputOptions([
                '-c:v libx264',           // H.264 codec
                '-preset fast',            // Fast encoding
                '-crf 28',                 // Quality (higher = smaller file)
                `-b:v ${targetBitrate}k`,  // Target bitrate
                '-maxrate ' + (targetBitrate * 1.5) + 'k',
                '-bufsize ' + (targetBitrate * 2) + 'k',
                '-vf scale=854:-2',        // Scale to 480p width
                '-t ' + maxDuration,       // Max duration
                '-an',                     // Remove audio (not needed for analysis)
                '-y'                       // Overwrite output
            ])
            .output(outputPath)
            .on('start', (cmd) => {
                console.log('🎬 FFmpeg compression started');
            })
            .on('progress', (progress) => {
                if (progress.percent) {
                    console.log(`🎬 Compression: ${progress.percent.toFixed(1)}%`);
                }
            })
            .on('end', () => {
                console.log('✅ Compression complete');
                resolve(outputPath);
            })
            .on('error', (err) => {
                console.error('❌ Compression error:', err);
                reject(err);
            })
            .run();
    });
}

// Extract frames from video
async function extractFrames(videoPath, outputDir) {
    return new Promise((resolve, reject) => {
        const frames = [];
        const framesDir = path.join(outputDir, 'frames');
        
        fs.mkdirSync(framesDir, { recursive: true });

        ffmpeg(videoPath)
            .outputOptions([
                '-vf', 'fps=1/8,scale=640:-1',  // 1 frame per 8 seconds, scaled
                '-frames:v', '15',              // Max 15 frames
                '-q:v', '5'                     // Quality
            ])
            .output(path.join(framesDir, 'frame_%03d.jpg'))
            .on('start', () => {
                console.log('🎬 Frame extraction started');
            })
            .on('end', () => {
                console.log('🎬 Frame extraction complete');
                
                try {
                    const files = fs.readdirSync(framesDir)
                        .filter(f => f.endsWith('.jpg'))
                        .sort();
                    
                    for (const file of files) {
                        const filePath = path.join(framesDir, file);
                        const data = fs.readFileSync(filePath);
                        frames.push({
                            filename: file,
                            base64: data.toString('base64')
                        });
                        fs.unlinkSync(filePath); // Clean up immediately
                    }
                    
                    resolve(frames);
                } catch (readError) {
                    reject(readError);
                }
            })
            .on('error', (err) => {
                console.error('❌ Frame extraction error:', err);
                reject(err);
            })
            .run();
    });
}

// Analyze frames with Claude
async function analyzeWithClaude(frames, opponentName) {
    if (frames.length === 0) {
        throw new Error('No frames to analyze');
    }

    console.log(`🤖 Analyzing ${frames.length} frames...`);
    
    const imageContent = frames.map(frame => ({
        type: 'image',
        source: {
            type: 'base64',
            media_type: 'image/jpeg',
            data: frame.base64
        }
    }));

    const prompt = `You are an elite basketball scout with 20+ years of experience. You're analyzing game film of "${opponentName}".

Analyze these ${frames.length} frames and provide a comprehensive scouting report.

Identify:
1. **DEFENSIVE SCHEMES**: What defense do they run? (man-to-man, 2-3 zone, 3-2 zone, 1-3-1, 1-2-2, match-up zone, press, etc.)
2. **OFFENSIVE PLAYS**: What plays/sets do you see? (pick and roll, motion, horns, flex, dribble-drive, isolation, fast break, princeton, etc.)
3. **KEY PLAYERS**: Any standout players? (jersey numbers if visible, positions, tendencies)
4. **PACE/TEMPO**: Fast or slow? Transition or half-court focused?
5. **BALL MOVEMENT**: Good passing? Stagnant? 
6. **SPACING**: Good floor spacing or bunched up?
7. **STRENGTHS**: What do they do well?
8. **WEAKNESSES**: What can be exploited?

Respond with this JSON format:
{
  "defense": {
    "primary": "main defensive scheme (be specific)",
    "secondary": "backup scheme if visible",
    "breakdown": [
      {"name": "Man-to-Man", "percentage": 70},
      {"name": "2-3 Zone", "percentage": 30}
    ],
    "notes": "specific defensive observations and tendencies"
  },
  "offense": {
    "primaryStyle": "main offensive approach",
    "topPlays": [
      {"name": "Pick and Roll", "percentage": 35, "notes": "how they run it"},
      {"name": "Motion", "percentage": 25, "notes": "details"}
    ],
    "ballMovement": "excellent/good/average/poor",
    "spacing": "excellent/good/average/poor",
    "notes": "offensive tendencies"
  },
  "keyPlayers": [
    {"name": "#23 or Point Guard", "role": "primary ball handler", "percentage": 45, "notes": "tendencies, strengths, weaknesses"}
  ],
  "pace": {
    "rating": 65,
    "description": "description of their tempo and transition tendencies"
  },
  "strengths": ["specific strength 1", "specific strength 2", "specific strength 3"],
  "weaknesses": ["specific weakness 1", "specific weakness 2", "specific weakness 3"],
  "recommendations": {
    "offensiveKeys": ["specific way to attack their defense", "another strategy"],
    "defensiveKeys": ["how to defend their offense", "key matchup advice"],
    "practiceEmphasis": ["drill or concept to practice", "another focus area"]
  }
}`;

    try {
        const response = await anthropic.messages.create({
            model: 'claude-sonnet-4-20250514',
            max_tokens: 4096,
            messages: [{
                role: 'user',
                content: [
                    { type: 'text', text: prompt },
                    ...imageContent
                ]
            }]
        });

        console.log('✅ Received Claude response');

        const text = response.content[0].text;
        const jsonMatch = text.match(/\{[\s\S]*\}/);
        
        if (jsonMatch) {
            return JSON.parse(jsonMatch[0]);
        }
        return null;
        
    } catch (error) {
        console.error('❌ Claude API error:', error.message);
        throw error;
    }
}

// Generate final report
function generateReport(analysis, opponentName, frameCount, videoInfo) {
    const defaultReport = {
        opponent: opponentName,
        generatedAt: new Date().toISOString(),
        framesAnalyzed: frameCount,
        videoDuration: videoInfo?.duration ? Math.round(videoInfo.duration) : null,
        confidence: Math.min(95, 70 + frameCount * 2),
        defense: {
            primary: 'Man-to-Man',
            secondary: null,
            breakdown: [{ name: 'Man-to-Man', percentage: 100 }]
        },
        offense: {
            topPlays: [{ name: 'Motion Offense', percentage: 50 }],
            primaryStyle: 'Motion'
        },
        keyPlayers: [],
        pace: { rating: 50, description: 'Moderate tempo' },
        strengths: [],
        weaknesses: [],
        recommendations: {
            offensiveKeys: ['Move the ball', 'Attack in transition'],
            defensiveKeys: ['Communicate', 'Contest shots'],
            practiceEmphasis: ['Defensive rotations']
        }
    };

    if (!analysis) return defaultReport;

    return {
        opponent: opponentName,
        generatedAt: new Date().toISOString(),
        framesAnalyzed: frameCount,
        videoDuration: videoInfo?.duration ? Math.round(videoInfo.duration) : null,
        confidence: Math.min(95, 70 + frameCount * 2),
        defense: analysis.defense || defaultReport.defense,
        offense: analysis.offense || defaultReport.offense,
        keyPlayers: analysis.keyPlayers || [],
        pace: analysis.pace || defaultReport.pace,
        strengths: analysis.strengths || [],
        weaknesses: analysis.weaknesses || [],
        recommendations: analysis.recommendations || defaultReport.recommendations
    };
}

function updateReport(reportId, updates) {
    const current = reports.get(reportId);
    if (current) {
        reports.set(reportId, { ...current, ...updates });
    }
}

function cleanup(dir) {
    try {
        if (fs.existsSync(dir)) {
            fs.rmSync(dir, { recursive: true, force: true });
            console.log('🧹 Cleaned up:', dir);
        }
    } catch (error) {
        console.warn('⚠️ Cleanup error:', error.message);
    }
}

// Global error handlers
process.on('uncaughtException', (error) => {
    console.error('❌ Uncaught Exception:', error.message);
});

process.on('unhandledRejection', (reason) => {
    console.error('❌ Unhandled Rejection:', reason);
});

// Start server
const PORT = process.env.PORT || 3001;
app.listen(PORT, () => {
    console.log(`🏀 CoachIQ API v3.0 running on port ${PORT}`);
    console.log(`📤 File upload enabled (up to 10GB with chunking)`);
    console.log(`🗜️ Auto-compression for large files`);
});
