// CoachIQ Backend Server - STABLE VERSION
// Better error handling, lower memory usage

const express = require('express');
const cors = require('cors');
const Anthropic = require('@anthropic-ai/sdk');
const ytdl = require('@distube/ytdl-core');
const ffmpeg = require('fluent-ffmpeg');
const fs = require('fs');
const path = require('path');
const { v4: uuidv4 } = require('uuid');

const app = express();
app.use(cors());
app.use(express.json({ limit: '50mb' }));

// Initialize Anthropic
const anthropic = new Anthropic({
    apiKey: process.env.ANTHROPIC_API_KEY,
});

// Store reports in memory
const reports = new Map();

// Health check endpoints
app.get('/', (req, res) => {
    res.json({ status: 'CoachIQ API is running', version: '2.1.0-stable' });
});

app.get('/health', (req, res) => {
    res.json({ status: 'ok' });
});

// Main analysis endpoint
app.post('/api/analyze', async (req, res) => {
    const { videoUrl, opponentName, analysisOptions } = req.body;

    console.log('📥 Received analysis request:', { videoUrl, opponentName });

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

    // Start async processing - wrapped in try/catch
    processVideo(reportId, videoUrl, opponentName, analysisOptions || ['defense', 'offense', 'pace']);

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

// Main processing function with full error handling
async function processVideo(reportId, videoUrl, opponentName, analysisOptions) {
    const tempDir = `/tmp/coachiq_${reportId}`;
    
    try {
        console.log('🏀 Starting analysis for report:', reportId);
        
        // Create temp directory
        if (!fs.existsSync(tempDir)) {
            fs.mkdirSync(tempDir, { recursive: true });
        }

        // Step 1: Download video
        updateReport(reportId, { progress: 5, progressText: 'Downloading video...' });
        console.log('📥 Downloading video...');
        
        const videoPath = path.join(tempDir, 'video.mp4');
        await downloadYouTubeVideo(videoUrl, videoPath);
        console.log('✅ Video downloaded');
        
        // Step 2: Extract frames - REDUCED for stability
        updateReport(reportId, { progress: 25, progressText: 'Extracting frames...' });
        console.log('🎞️ Extracting frames...');
        
        const frames = await extractFrames(videoPath, tempDir);
        console.log(`✅ Extracted ${frames.length} frames`);
        
        // Step 3: Analyze with Claude
        updateReport(reportId, { progress: 40, progressText: 'AI analyzing video...' });
        console.log('🤖 Sending to Claude...');
        
        const analysis = await analyzeWithClaude(frames, opponentName);
        console.log('✅ Claude analysis complete');
        
        // Step 4: Generate report
        updateReport(reportId, { progress: 80, progressText: 'Generating report...' });
        console.log('📋 Generating report...');
        
        const report = generateReport(analysis, opponentName, frames.length);
        
        // Step 5: Save final report
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
        console.error('❌ Processing error:', error.message);
        console.error(error.stack);
        
        reports.set(reportId, {
            ...reports.get(reportId),
            status: 'failed',
            error: error.message,
            progress: 0,
            progressText: 'Failed: ' + error.message
        });
    } finally {
        // Always cleanup
        cleanup(tempDir);
    }
}

function updateReport(reportId, updates) {
    const current = reports.get(reportId);
    if (current) {
        reports.set(reportId, { ...current, ...updates });
    }
}

// Download YouTube video - with timeout and error handling
async function downloadYouTubeVideo(url, outputPath) {
    return new Promise((resolve, reject) => {
        const timeout = setTimeout(() => {
            reject(new Error('Download timeout after 3 minutes'));
        }, 3 * 60 * 1000);

        try {
            console.log('🔗 Fetching video info...');
            
            const video = ytdl(url, { 
                quality: 'lowest',
                filter: 'videoandaudio'
            });
            
            const writeStream = fs.createWriteStream(outputPath);
            
            video.on('info', (info) => {
                console.log('📹 Video:', info.videoDetails.title);
                console.log('⏱️ Duration:', info.videoDetails.lengthSeconds, 'seconds');
            });

            video.on('error', (err) => {
                clearTimeout(timeout);
                console.error('❌ Video stream error:', err.message);
                reject(err);
            });

            writeStream.on('error', (err) => {
                clearTimeout(timeout);
                console.error('❌ Write stream error:', err.message);
                reject(err);
            });

            writeStream.on('finish', () => {
                clearTimeout(timeout);
                console.log('✅ Download complete');
                resolve(outputPath);
            });

            video.pipe(writeStream);
            
        } catch (error) {
            clearTimeout(timeout);
            reject(error);
        }
    });
}

// Extract frames - OPTIMIZED for low memory
async function extractFrames(videoPath, outputDir) {
    return new Promise((resolve, reject) => {
        const frames = [];
        const framesDir = path.join(outputDir, 'frames');
        
        try {
            if (!fs.existsSync(framesDir)) {
                fs.mkdirSync(framesDir, { recursive: true });
            }

            // Extract only 12 frames, every 8 seconds - much lighter on memory
            ffmpeg(videoPath)
                .outputOptions([
                    '-vf', 'fps=1/8,scale=640:-1',  // 1 frame per 8 sec, scaled down
                    '-frames:v', '12',              // Max 12 frames
                    '-q:v', '5'                     // Lower quality = smaller files
                ])
                .output(path.join(framesDir, 'frame_%03d.jpg'))
                .on('start', (cmd) => {
                    console.log('🎬 FFmpeg started');
                })
                .on('end', () => {
                    console.log('🎬 FFmpeg finished');
                    
                    try {
                        const files = fs.readdirSync(framesDir)
                            .filter(f => f.endsWith('.jpg'))
                            .sort();
                        
                        console.log(`📁 Found ${files.length} frame files`);
                        
                        for (const file of files) {
                            const filePath = path.join(framesDir, file);
                            const data = fs.readFileSync(filePath);
                            frames.push({
                                filename: file,
                                base64: data.toString('base64')
                            });
                            // Delete file immediately to save memory
                            fs.unlinkSync(filePath);
                        }
                        
                        resolve(frames);
                    } catch (readError) {
                        reject(readError);
                    }
                })
                .on('error', (err) => {
                    console.error('❌ FFmpeg error:', err.message);
                    reject(err);
                })
                .run();
                
        } catch (error) {
            reject(error);
        }
    });
}

// Analyze with Claude - simplified and more robust
async function analyzeWithClaude(frames, opponentName) {
    if (frames.length === 0) {
        throw new Error('No frames to analyze');
    }

    console.log(`🤖 Analyzing ${frames.length} frames...`);
    
    // Send all frames in ONE request to minimize API calls
    const imageContent = frames.map(frame => ({
        type: 'image',
        source: {
            type: 'base64',
            media_type: 'image/jpeg',
            data: frame.base64
        }
    }));

    const prompt = `You are an expert basketball scout analyzing game film of "${opponentName}".

Analyze these ${frames.length} frames from a basketball game and provide a comprehensive scouting report.

For the overall video, identify:

1. **DEFENSIVE SCHEMES**: What defense do they primarily run? (man-to-man, 2-3 zone, 3-2 zone, 1-3-1, press, etc.)

2. **OFFENSIVE PLAYS**: What offensive sets/plays do you see? (pick and roll, motion, horns, flex, isolation, fast break, etc.)

3. **KEY PLAYERS**: Any players who stand out? (jersey numbers if visible, positions, roles)

4. **PACE/TEMPO**: Do they play fast or slow? Push transition or set up half-court?

5. **STRENGTHS**: What do they do well?

6. **WEAKNESSES**: What can be exploited?

Respond with this JSON format:
{
  "defense": {
    "primary": "main defensive scheme",
    "secondary": "backup scheme if any",
    "breakdown": [
      {"name": "scheme name", "percentage": 60},
      {"name": "other scheme", "percentage": 40}
    ],
    "notes": "defensive tendencies and observations"
  },
  "offense": {
    "primaryStyle": "main offensive approach",
    "topPlays": [
      {"name": "play name", "percentage": 30, "notes": "how they run it"},
      {"name": "another play", "percentage": 25, "notes": "details"}
    ],
    "ballMovement": "good/average/poor",
    "spacing": "good/average/poor"
  },
  "keyPlayers": [
    {"name": "#23 or PG", "role": "primary ball handler", "percentage": 40, "notes": "tendencies"}
  ],
  "pace": {
    "rating": 65,
    "description": "description of their tempo"
  },
  "strengths": ["strength 1", "strength 2"],
  "weaknesses": ["weakness 1", "weakness 2"],
  "recommendations": {
    "offensiveKeys": ["how to attack them", "specific strategies"],
    "defensiveKeys": ["how to defend them", "specific strategies"],
    "practiceEmphasis": ["what to work on in practice"]
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
            const parsed = JSON.parse(jsonMatch[0]);
            console.log('✅ Parsed Claude response successfully');
            return parsed;
        } else {
            console.warn('⚠️ No JSON found in Claude response');
            return null;
        }
        
    } catch (error) {
        console.error('❌ Claude API error:', error.message);
        throw error;
    }
}

// Generate final report
function generateReport(analysis, opponentName, frameCount) {
    const defaultReport = {
        opponent: opponentName,
        generatedAt: new Date().toISOString(),
        framesAnalyzed: frameCount,
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
        pace: {
            rating: 50,
            description: 'Moderate tempo'
        },
        recommendations: {
            offensiveKeys: ['Move the ball', 'Attack in transition'],
            defensiveKeys: ['Communicate', 'Contest shots'],
            practiceEmphasis: ['Defensive rotations']
        }
    };

    if (!analysis) {
        console.warn('⚠️ No analysis data, using defaults');
        return defaultReport;
    }

    // Merge analysis with defaults
    return {
        opponent: opponentName,
        generatedAt: new Date().toISOString(),
        framesAnalyzed: frameCount,
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

// Cleanup temp files
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

// Global error handlers to prevent crashes
process.on('uncaughtException', (error) => {
    console.error('❌ Uncaught Exception:', error.message);
    console.error(error.stack);
});

process.on('unhandledRejection', (reason, promise) => {
    console.error('❌ Unhandled Rejection:', reason);
});

// Start server
const PORT = process.env.PORT || 3001;
app.listen(PORT, () => {
    console.log(`🏀 CoachIQ API v2.1-stable running on port ${PORT}`);
});
