// CoachIQ Backend Server - ENHANCED UX VERSION
// Background processing with email notifications

const express = require('express');
const cors = require('cors');
const Anthropic = require('@anthropic-ai/sdk');
const ffmpeg = require('fluent-ffmpeg');
const fs = require('fs');
const path = require('path');
const { v4: uuidv4 } = require('uuid');
const multer = require('multer');
const { Resend } = require('resend');

const app = express();
app.use(cors());
app.use(express.json({ limit: '100mb' }));

// Configure multer for file uploads
const storage = multer.diskStorage({
    destination: (req, file, cb) => {
        const uploadDir = '/tmp/coachiq_uploads';
        if (!fs.existsSync(uploadDir)) {
            fs.mkdirSync(uploadDir, { recursive: true });
        }
        cb(null, uploadDir);
    },
    filename: (req, file, cb) => {
        cb(null, `${Date.now()}_${uuidv4()}_${file.originalname}`);
    }
});

const upload = multer({ 
    storage: storage,
    limits: { fileSize: 10 * 1024 * 1024 * 1024 }
});

// Initialize services
const anthropic = new Anthropic({
    apiKey: process.env.ANTHROPIC_API_KEY,
});

const resend = new Resend(process.env.RESEND_API_KEY);

// In-memory storage (use database in production)
const reports = new Map();
const users = new Map();
const uploadSessions = new Map();

// ===========================================
// HEALTH CHECK
// ===========================================
app.get('/', (req, res) => {
    res.json({ 
        status: 'CoachIQ API is running', 
        version: '4.0.0-email',
        features: ['background-processing', 'email-notifications', 'dashboard']
    });
});

app.get('/health', (req, res) => {
    res.json({ status: 'ok' });
});

// ===========================================
// USER MANAGEMENT (simplified - use real auth in production)
// ===========================================
app.post('/api/users/register', (req, res) => {
    const { email, name, teamName } = req.body;
    
    if (!email) {
        return res.status(400).json({ error: 'Email is required' });
    }
    
    const userId = uuidv4();
    const user = {
        id: userId,
        email,
        name: name || 'Coach',
        teamName: teamName || '',
        reportsRemaining: 3,
        subscription: 'free',
        createdAt: new Date().toISOString()
    };
    
    users.set(userId, user);
    users.set(email, user);
    
    console.log(`👤 New user registered: ${email}`);
    
    res.json({ user: { id: userId, email, name: user.name, reportsRemaining: user.reportsRemaining } });
});

app.get('/api/users/:email', (req, res) => {
    const user = users.get(req.params.email);
    if (!user) {
        return res.status(404).json({ error: 'User not found' });
    }
    res.json({ user });
});

// ===========================================
// GET USER'S REPORTS (Dashboard)
// ===========================================
app.get('/api/users/:email/reports', (req, res) => {
    const userEmail = req.params.email;
    const userReports = [];
    
    reports.forEach((report, id) => {
        if (report.userEmail === userEmail) {
            userReports.push({
                id: report.id,
                opponentName: report.opponentName,
                status: report.status,
                progress: report.progress,
                progressText: report.progressText,
                createdAt: report.createdAt,
                completedAt: report.completedAt,
                hasReport: !!report.report
            });
        }
    });
    
    // Sort by date, newest first
    userReports.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
    
    res.json({ reports: userReports });
});

// ===========================================
// CHUNKED UPLOAD ENDPOINTS
// ===========================================
app.post('/api/upload/init', (req, res) => {
    const { fileName, fileSize, totalChunks, userEmail } = req.body;
    
    const uploadId = uuidv4();
    const uploadDir = `/tmp/coachiq_chunks_${uploadId}`;
    
    fs.mkdirSync(uploadDir, { recursive: true });
    
    uploadSessions.set(uploadId, {
        id: uploadId,
        fileName,
        fileSize,
        totalChunks,
        receivedChunks: 0,
        chunksDir: uploadDir,
        userEmail,
        status: 'uploading',
        createdAt: new Date().toISOString()
    });
    
    console.log(`📤 Upload initialized: ${uploadId} - ${fileName}`);
    
    res.json({ uploadId, status: 'ready' });
});

app.post('/api/upload/chunk', upload.single('chunk'), (req, res) => {
    const { uploadId, chunkIndex } = req.body;
    
    const session = uploadSessions.get(uploadId);
    if (!session) {
        return res.status(404).json({ error: 'Upload session not found' });
    }
    
    const chunkPath = path.join(session.chunksDir, `chunk_${chunkIndex.padStart(6, '0')}`);
    fs.renameSync(req.file.path, chunkPath);
    
    session.receivedChunks++;
    uploadSessions.set(uploadId, session);
    
    const percentComplete = Math.round((session.receivedChunks / session.totalChunks) * 100);
    
    res.json({ 
        received: session.receivedChunks, 
        total: session.totalChunks,
        percentComplete
    });
});

// ===========================================
// FINALIZE UPLOAD - Returns immediately, processes in background
// ===========================================
app.post('/api/upload/finalize', async (req, res) => {
    const { uploadId, opponentName, analysisOptions, userEmail, userName } = req.body;
    
    const session = uploadSessions.get(uploadId);
    if (!session) {
        return res.status(404).json({ error: 'Upload session not found' });
    }
    
    if (session.receivedChunks < session.totalChunks) {
        return res.status(400).json({ 
            error: 'Upload incomplete', 
            received: session.receivedChunks,
            expected: session.totalChunks
        });
    }
    
    // Create report entry
    const reportId = uuidv4();
    reports.set(reportId, {
        id: reportId,
        userEmail,
        userName: userName || 'Coach',
        opponentName,
        fileName: session.fileName,
        fileSize: session.fileSize,
        status: 'queued',
        progress: 0,
        progressText: 'Video received. Processing will begin shortly...',
        createdAt: new Date().toISOString()
    });
    
    console.log(`📋 Report queued: ${reportId} for ${userEmail}`);
    
    // Send confirmation email immediately
    await sendConfirmationEmail(userEmail, userName, opponentName, reportId);
    
    // Start background processing (don't await - let it run async)
    processVideoInBackground(reportId, uploadId, opponentName, analysisOptions, userEmail, userName);
    
    // Return immediately to user
    res.json({ 
        reportId, 
        status: 'queued',
        message: 'Video received! We\'ll email you when the analysis is ready. You can also check your dashboard for updates.'
    });
});

// ===========================================
// SIMPLE UPLOAD (for smaller files)
// ===========================================
app.post('/api/upload/simple', upload.single('video'), async (req, res) => {
    try {
        const { opponentName, analysisOptions, userEmail, userName } = req.body;
        
        if (!req.file) {
            return res.status(400).json({ error: 'No video file uploaded' });
        }
        
        const reportId = uuidv4();
        reports.set(reportId, {
            id: reportId,
            userEmail,
            userName: userName || 'Coach',
            opponentName,
            fileName: req.file.originalname,
            fileSize: req.file.size,
            status: 'queued',
            progress: 0,
            progressText: 'Video received. Processing will begin shortly...',
            createdAt: new Date().toISOString()
        });
        
        console.log(`📋 Report queued (simple upload): ${reportId}`);
        
        // Send confirmation email
        await sendConfirmationEmail(userEmail, userName, opponentName, reportId);
        
        // Process in background
        processSimpleUploadInBackground(reportId, req.file.path, opponentName, 
            analysisOptions ? JSON.parse(analysisOptions) : ['defense', 'offense', 'pace'],
            userEmail, userName);
        
        res.json({ 
            reportId, 
            status: 'queued',
            message: 'Video received! We\'ll email you when the analysis is ready.'
        });
        
    } catch (error) {
        console.error('Upload error:', error);
        res.status(500).json({ error: error.message });
    }
});

// ===========================================
// GET SINGLE REPORT
// ===========================================
app.get('/api/reports/:id', (req, res) => {
    const report = reports.get(req.params.id);
    
    if (!report) {
        return res.status(404).json({ error: 'Report not found' });
    }
    
    res.json(report);
});

// ===========================================
// EMAIL FUNCTIONS
// ===========================================
async function sendConfirmationEmail(email, name, opponentName, reportId) {
    if (!process.env.RESEND_API_KEY) {
        console.log('📧 [SKIP] No RESEND_API_KEY - would send confirmation to:', email);
        return;
    }
    
    try {
        await resend.emails.send({
            from: 'CoachIQ <reports@coachiq.com>',
            to: email,
            subject: `🏀 Scouting Report Started: ${opponentName}`,
            html: `
                <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
                    <div style="background: linear-gradient(135deg, #FF6B35, #FF8E53); padding: 30px; text-align: center;">
                        <h1 style="color: white; margin: 0;">🏀 CoachIQ</h1>
                    </div>
                    <div style="padding: 30px; background: #f9f9f9;">
                        <h2 style="color: #333;">Hey ${name || 'Coach'}!</h2>
                        <p style="color: #666; font-size: 16px; line-height: 1.6;">
                            We've received your game film for <strong>${opponentName}</strong> and our AI is getting to work!
                        </p>
                        <div style="background: white; border-radius: 10px; padding: 20px; margin: 20px 0; border-left: 4px solid #FF6B35;">
                            <p style="margin: 0; color: #333;"><strong>What happens next:</strong></p>
                            <ul style="color: #666; margin-top: 10px;">
                                <li>Your video is being compressed and optimized</li>
                                <li>AI will analyze defensive schemes, offensive plays, and key players</li>
                                <li>A detailed scouting report will be generated</li>
                                <li>We'll email you when it's ready (usually 5-15 minutes)</li>
                            </ul>
                        </div>
                        <p style="color: #666;">
                            You can also check the status anytime on your 
                            <a href="https://coachiq.com/dashboard" style="color: #FF6B35;">dashboard</a>.
                        </p>
                        <p style="color: #999; font-size: 14px; margin-top: 30px;">
                            Report ID: ${reportId}
                        </p>
                    </div>
                    <div style="background: #333; padding: 20px; text-align: center;">
                        <p style="color: #999; margin: 0; font-size: 12px;">
                            © 2026 CoachIQ • Built for coaches who want to win
                        </p>
                    </div>
                </div>
            `
        });
        console.log(`📧 Confirmation email sent to ${email}`);
    } catch (error) {
        console.error('Email error:', error);
    }
}

async function sendCompletionEmail(email, name, opponentName, reportId, report) {
    if (!process.env.RESEND_API_KEY) {
        console.log('📧 [SKIP] No RESEND_API_KEY - would send completion to:', email);
        return;
    }
    
    try {
        const primaryDefense = report.defense?.primary || 'Unknown';
        const paceRating = report.pace?.rating || '--';
        const topPlay = report.offense?.topPlays?.[0]?.name || 'Motion Offense';
        
        await resend.emails.send({
            from: 'CoachIQ <reports@coachiq.com>',
            to: email,
            subject: `✅ Scouting Report Ready: ${opponentName}`,
            html: `
                <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
                    <div style="background: linear-gradient(135deg, #00D4AA, #00B894); padding: 30px; text-align: center;">
                        <h1 style="color: white; margin: 0;">✅ Report Ready!</h1>
                    </div>
                    <div style="padding: 30px; background: #f9f9f9;">
                        <h2 style="color: #333;">Great news, ${name || 'Coach'}!</h2>
                        <p style="color: #666; font-size: 16px; line-height: 1.6;">
                            Your scouting report for <strong>${opponentName}</strong> is ready to view.
                        </p>
                        
                        <div style="background: white; border-radius: 10px; padding: 20px; margin: 20px 0;">
                            <h3 style="color: #333; margin-top: 0;">Quick Preview:</h3>
                            <table style="width: 100%; border-collapse: collapse;">
                                <tr>
                                    <td style="padding: 10px; border-bottom: 1px solid #eee; color: #666;">Primary Defense</td>
                                    <td style="padding: 10px; border-bottom: 1px solid #eee; color: #FF6B35; font-weight: bold; text-align: right;">${primaryDefense}</td>
                                </tr>
                                <tr>
                                    <td style="padding: 10px; border-bottom: 1px solid #eee; color: #666;">Pace Rating</td>
                                    <td style="padding: 10px; border-bottom: 1px solid #eee; color: #00D4AA; font-weight: bold; text-align: right;">${paceRating}/100</td>
                                </tr>
                                <tr>
                                    <td style="padding: 10px; color: #666;">Top Offensive Play</td>
                                    <td style="padding: 10px; color: #FF6B35; font-weight: bold; text-align: right;">${topPlay}</td>
                                </tr>
                            </table>
                        </div>
                        
                        <div style="text-align: center; margin: 30px 0;">
                            <a href="https://coachiq.com/reports/${reportId}" 
                               style="background: linear-gradient(135deg, #FF6B35, #FF8E53); color: white; padding: 15px 40px; text-decoration: none; border-radius: 8px; font-weight: bold; display: inline-block;">
                                View Full Report →
                            </a>
                        </div>
                        
                        ${report.recommendations?.offensiveKeys?.length > 0 ? `
                        <div style="background: white; border-radius: 10px; padding: 20px; margin: 20px 0; border-left: 4px solid #00D4AA;">
                            <p style="margin: 0 0 10px 0; color: #333;"><strong>💡 Top Recommendation:</strong></p>
                            <p style="margin: 0; color: #666;">${report.recommendations.offensiveKeys[0]}</p>
                        </div>
                        ` : ''}
                        
                        <p style="color: #666; margin-top: 20px;">
                            Good luck with your game prep! 🏀
                        </p>
                    </div>
                    <div style="background: #333; padding: 20px; text-align: center;">
                        <p style="color: #999; margin: 0; font-size: 12px;">
                            © 2026 CoachIQ • Built for coaches who want to win
                        </p>
                    </div>
                </div>
            `
        });
        console.log(`📧 Completion email sent to ${email}`);
    } catch (error) {
        console.error('Email error:', error);
    }
}

async function sendErrorEmail(email, name, opponentName, errorMessage) {
    if (!process.env.RESEND_API_KEY) {
        console.log('📧 [SKIP] No RESEND_API_KEY - would send error email to:', email);
        return;
    }
    
    try {
        await resend.emails.send({
            from: 'CoachIQ <reports@coachiq.com>',
            to: email,
            subject: `⚠️ Issue with Scouting Report: ${opponentName}`,
            html: `
                <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
                    <div style="background: #FF6B6B; padding: 30px; text-align: center;">
                        <h1 style="color: white; margin: 0;">⚠️ Processing Issue</h1>
                    </div>
                    <div style="padding: 30px; background: #f9f9f9;">
                        <h2 style="color: #333;">Hey ${name || 'Coach'},</h2>
                        <p style="color: #666; font-size: 16px; line-height: 1.6;">
                            We encountered an issue while processing your game film for <strong>${opponentName}</strong>.
                        </p>
                        <div style="background: white; border-radius: 10px; padding: 20px; margin: 20px 0; border-left: 4px solid #FF6B6B;">
                            <p style="margin: 0; color: #666;"><strong>Error:</strong> ${errorMessage}</p>
                        </div>
                        <p style="color: #666;">
                            <strong>What you can try:</strong>
                        </p>
                        <ul style="color: #666;">
                            <li>Re-upload a shorter clip (5-10 minutes works best)</li>
                            <li>Try a different video format (MP4 recommended)</li>
                            <li>Make sure the video isn't corrupted</li>
                        </ul>
                        <p style="color: #666;">
                            If the problem persists, reply to this email and we'll help you out!
                        </p>
                    </div>
                </div>
            `
        });
        console.log(`📧 Error email sent to ${email}`);
    } catch (error) {
        console.error('Email error:', error);
    }
}

// ===========================================
// BACKGROUND PROCESSING
// ===========================================
async function processVideoInBackground(reportId, uploadId, opponentName, analysisOptions, userEmail, userName) {
    const session = uploadSessions.get(uploadId);
    const tempDir = `/tmp/coachiq_${reportId}`;
    
    try {
        fs.mkdirSync(tempDir, { recursive: true });
        
        updateReport(reportId, { status: 'processing', progress: 5, progressText: 'Combining video chunks...' });
        
        const combinedPath = path.join(tempDir, 'original_video.mp4');
        await combineChunks(session.chunksDir, combinedPath);
        
        // Cleanup chunks
        fs.rmSync(session.chunksDir, { recursive: true, force: true });
        uploadSessions.delete(uploadId);
        
        await processVideoFile(reportId, combinedPath, opponentName, analysisOptions, userEmail, userName, tempDir);
        
    } catch (error) {
        console.error('❌ Processing error:', error);
        updateReport(reportId, { status: 'failed', error: error.message, progress: 0 });
        await sendErrorEmail(userEmail, userName, opponentName, error.message);
        cleanup(tempDir);
    }
}

async function processSimpleUploadInBackground(reportId, videoPath, opponentName, analysisOptions, userEmail, userName) {
    const tempDir = `/tmp/coachiq_${reportId}`;
    
    try {
        fs.mkdirSync(tempDir, { recursive: true });
        
        const originalPath = path.join(tempDir, 'original_video.mp4');
        fs.renameSync(videoPath, originalPath);
        
        await processVideoFile(reportId, originalPath, opponentName, analysisOptions, userEmail, userName, tempDir);
        
    } catch (error) {
        console.error('❌ Processing error:', error);
        updateReport(reportId, { status: 'failed', error: error.message, progress: 0 });
        await sendErrorEmail(userEmail, userName, opponentName, error.message);
        cleanup(tempDir);
    }
}

async function processVideoFile(reportId, videoPath, opponentName, analysisOptions, userEmail, userName, tempDir) {
    try {
        const videoInfo = await getVideoInfo(videoPath);
        const fileSizeMB = fs.statSync(videoPath).size / (1024 * 1024);
        
        console.log(`📹 Processing: ${fileSizeMB.toFixed(1)}MB, ${Math.round(videoInfo.duration)}s`);
        
        // Compress if needed
        let processedPath = videoPath;
        if (fileSizeMB > 200) {
            updateReport(reportId, { progress: 15, progressText: 'Compressing video for analysis...' });
            processedPath = path.join(tempDir, 'compressed_video.mp4');
            await compressVideo(videoPath, processedPath);
        }
        
        // Extract frames
        updateReport(reportId, { progress: 35, progressText: 'Extracting key frames...' });
        const frames = await extractFrames(processedPath, tempDir);
        
        // Analyze with Claude
        updateReport(reportId, { progress: 50, progressText: 'AI analyzing game film...' });
        const analysis = await analyzeWithClaude(frames, opponentName);
        
        // Generate report
        updateReport(reportId, { progress: 85, progressText: 'Generating scouting report...' });
        const report = generateReport(analysis, opponentName, frames.length, videoInfo);
        
        // Save completed report
        const finalReport = {
            ...reports.get(reportId),
            status: 'complete',
            progress: 100,
            progressText: 'Complete!',
            report: report,
            completedAt: new Date().toISOString()
        };
        reports.set(reportId, finalReport);
        
        console.log(`✅ Report complete: ${reportId}`);
        
        // Send completion email
        await sendCompletionEmail(userEmail, userName, opponentName, reportId, report);
        
    } catch (error) {
        throw error;
    } finally {
        cleanup(tempDir);
    }
}

// ===========================================
// HELPER FUNCTIONS
// ===========================================
function updateReport(reportId, updates) {
    const current = reports.get(reportId);
    if (current) {
        reports.set(reportId, { ...current, ...updates });
    }
}

async function combineChunks(chunksDir, outputPath) {
    return new Promise((resolve, reject) => {
        const chunks = fs.readdirSync(chunksDir).filter(f => f.startsWith('chunk_')).sort();
        const writeStream = fs.createWriteStream(outputPath);
        
        let index = 0;
        function writeNext() {
            if (index >= chunks.length) { writeStream.end(); resolve(); return; }
            const readStream = fs.createReadStream(path.join(chunksDir, chunks[index]));
            readStream.pipe(writeStream, { end: false });
            readStream.on('end', () => { index++; writeNext(); });
            readStream.on('error', reject);
        }
        writeStream.on('error', reject);
        writeNext();
    });
}

function getVideoInfo(videoPath) {
    return new Promise((resolve, reject) => {
        ffmpeg.ffprobe(videoPath, (err, metadata) => {
            if (err) { reject(err); return; }
            const video = metadata.streams.find(s => s.codec_type === 'video');
            resolve({
                duration: metadata.format.duration,
                width: video?.width,
                height: video?.height,
                size: metadata.format.size
            });
        });
    });
}

function compressVideo(inputPath, outputPath) {
    return new Promise((resolve, reject) => {
        ffmpeg(inputPath)
            .outputOptions([
                '-c:v libx264', '-preset fast', '-crf 28',
                '-vf scale=854:-2', '-t 600', '-an', '-y'
            ])
            .output(outputPath)
            .on('end', () => resolve(outputPath))
            .on('error', reject)
            .run();
    });
}

async function extractFrames(videoPath, outputDir) {
    return new Promise((resolve, reject) => {
        const frames = [];
        const framesDir = path.join(outputDir, 'frames');
        fs.mkdirSync(framesDir, { recursive: true });

        ffmpeg(videoPath)
            .outputOptions(['-vf', 'fps=1/8,scale=640:-1', '-frames:v', '15', '-q:v', '5'])
            .output(path.join(framesDir, 'frame_%03d.jpg'))
            .on('end', () => {
                const files = fs.readdirSync(framesDir).filter(f => f.endsWith('.jpg')).sort();
                for (const file of files) {
                    const filePath = path.join(framesDir, file);
                    frames.push({ filename: file, base64: fs.readFileSync(filePath).toString('base64') });
                    fs.unlinkSync(filePath);
                }
                resolve(frames);
            })
            .on('error', reject)
            .run();
    });
}

async function analyzeWithClaude(frames, opponentName) {
    if (frames.length === 0) throw new Error('No frames to analyze');

    const imageContent = frames.map(frame => ({
        type: 'image',
        source: { type: 'base64', media_type: 'image/jpeg', data: frame.base64 }
    }));

    const prompt = `You are an elite basketball scout analyzing game film of "${opponentName}".

Analyze these ${frames.length} frames and provide a comprehensive scouting report.

Identify:
1. DEFENSIVE SCHEMES (man-to-man, 2-3 zone, 3-2 zone, 1-3-1, press, etc.)
2. OFFENSIVE PLAYS (pick and roll, motion, horns, flex, isolation, fast break, etc.)
3. KEY PLAYERS (jersey numbers, positions, tendencies)
4. PACE/TEMPO
5. STRENGTHS and WEAKNESSES

Respond with JSON:
{
  "defense": {
    "primary": "main scheme",
    "secondary": "backup scheme",
    "breakdown": [{"name": "Man-to-Man", "percentage": 70}],
    "notes": "tendencies"
  },
  "offense": {
    "primaryStyle": "main approach",
    "topPlays": [{"name": "Pick and Roll", "percentage": 35, "notes": "details"}],
    "ballMovement": "good/average/poor",
    "spacing": "good/average/poor",
    "notes": "tendencies"
  },
  "keyPlayers": [{"name": "#23 PG", "role": "ball handler", "percentage": 45, "notes": "tendencies"}],
  "pace": {"rating": 65, "description": "tempo description"},
  "strengths": ["strength 1", "strength 2"],
  "weaknesses": ["weakness 1", "weakness 2"],
  "recommendations": {
    "offensiveKeys": ["how to attack them"],
    "defensiveKeys": ["how to defend them"],
    "practiceEmphasis": ["what to practice"]
  }
}`;

    const response = await anthropic.messages.create({
        model: 'claude-sonnet-4-20250514',
        max_tokens: 4096,
        messages: [{ role: 'user', content: [{ type: 'text', text: prompt }, ...imageContent] }]
    });

    const jsonMatch = response.content[0].text.match(/\{[\s\S]*\}/);
    return jsonMatch ? JSON.parse(jsonMatch[0]) : null;
}

function generateReport(analysis, opponentName, frameCount, videoInfo) {
    const defaults = {
        defense: { primary: 'Man-to-Man', breakdown: [{ name: 'Man-to-Man', percentage: 100 }] },
        offense: { topPlays: [{ name: 'Motion', percentage: 50 }], primaryStyle: 'Motion' },
        pace: { rating: 50, description: 'Moderate tempo' },
        recommendations: { offensiveKeys: ['Move the ball'], defensiveKeys: ['Communicate'], practiceEmphasis: ['Rotations'] }
    };

    return {
        opponent: opponentName,
        generatedAt: new Date().toISOString(),
        framesAnalyzed: frameCount,
        videoDuration: videoInfo?.duration ? Math.round(videoInfo.duration) : null,
        confidence: Math.min(95, 70 + frameCount * 2),
        defense: analysis?.defense || defaults.defense,
        offense: analysis?.offense || defaults.offense,
        keyPlayers: analysis?.keyPlayers || [],
        pace: analysis?.pace || defaults.pace,
        strengths: analysis?.strengths || [],
        weaknesses: analysis?.weaknesses || [],
        recommendations: analysis?.recommendations || defaults.recommendations
    };
}

function cleanup(dir) {
    try {
        if (fs.existsSync(dir)) {
            fs.rmSync(dir, { recursive: true, force: true });
        }
    } catch (e) {}
}

process.on('uncaughtException', (error) => console.error('Uncaught:', error.message));
process.on('unhandledRejection', (reason) => console.error('Unhandled:', reason));

const PORT = process.env.PORT || 3001;
app.listen(PORT, () => {
    console.log(`🏀 CoachIQ API v4.0 running on port ${PORT}`);
    console.log(`📧 Email notifications: ${process.env.RESEND_API_KEY ? 'ENABLED' : 'DISABLED (set RESEND_API_KEY)'}`);
});
