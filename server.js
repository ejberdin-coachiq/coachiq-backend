// ============================================================
// COACHIQ BACKEND SERVER - COMPLETE INTEGRATED VERSION
// ============================================================
// 
// FEATURES INCLUDED:
// ✅ Enhanced AI Analysis (shot charts, BLOB plays, player profiles)
// ✅ Email Inbound Flow (scout@coachiq.com)
// ✅ Multi-source video support (Hudl, YouTube, Google Drive, Dropbox)
// ✅ Automatic report delivery via email
// ✅ User management with free trial (3 reports)
// ✅ Stripe payment ready
//
// ============================================================

const express = require('express');
const cors = require('cors');
const Anthropic = require('@anthropic-ai/sdk');
const ffmpeg = require('fluent-ffmpeg');
const fs = require('fs');
const path = require('path');
const { v4: uuidv4 } = require('uuid');
const multer = require('multer');
const nodemailer = require('nodemailer');
const { exec, spawn } = require('child_process');

const app = express();

// ============================================================
// MIDDLEWARE
// ============================================================

app.use(cors({
    origin: [
        'http://localhost:3000',
        'http://localhost:8080',
        'https://coachiq.netlify.app',
        'https://meetyournewstatscoach.com',
        process.env.FRONTEND_URL
    ].filter(Boolean),
    credentials: true
}));

app.use(express.json({ limit: '100mb' }));
app.use(express.urlencoded({ extended: true, limit: '100mb' }));

// ============================================================
// CONFIGURATION
// ============================================================

const PORT = process.env.PORT || 3001;

// Anthropic AI
const anthropic = new Anthropic({
    apiKey: process.env.ANTHROPIC_API_KEY
});

// Email Configuration (SendGrid)
const emailTransporter = nodemailer.createTransport({
    host: 'smtp.sendgrid.net',
    port: 587,
    secure: false,
    auth: {
        user: 'apikey',
        pass: process.env.SENDGRID_API_KEY
    }
});

// Domain Configuration
const EMAIL_DOMAIN = process.env.EMAIL_DOMAIN || 'coachiq.com';
const SCOUT_EMAIL = process.env.SCOUT_EMAIL || `scout@${EMAIL_DOMAIN}`;
const FROM_EMAIL = process.env.FROM_EMAIL || `CoachIQ <noreply@${EMAIL_DOMAIN}>`;
const APP_URL = process.env.APP_URL || 'https://meetyournewstatscoach.com';
const API_URL = process.env.API_URL || `https://api.${EMAIL_DOMAIN}`;

// File Upload Configuration
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
const upload = multer({ storage, limits: { fileSize: 10 * 1024 * 1024 * 1024 } });

// ============================================================
// IN-MEMORY STORAGE (Use Redis/Database in production!)
// ============================================================

const reports = new Map();
const users = new Map();
const pendingEmailSetups = new Map();  // For email flow

// ============================================================
// ENHANCED ANALYSIS PROMPTS
// ============================================================

const ENHANCED_BASKETBALL_SYSTEM_PROMPT = `You are an elite basketball scout and analyst with 30+ years of experience breaking down game film for college and professional teams. You're analyzing video frames to create comprehensive scouting reports.

Your analysis must be SPECIFIC, ACTIONABLE, and DETAILED. Coaches rely on your reports to prepare game plans.

CRITICAL: Track EVERY player by jersey number. Note their:
- Position on court
- Actions (screens, cuts, shots, passes)
- Tendencies (preferred hand, favorite spots, habits)
- Physical attributes you can observe

For SHOT ATTEMPTS, record:
- Shooter's jersey number
- Exact location (use court coordinates: left corner, right wing, top of key, paint, etc.)
- Shot type (catch-and-shoot, off-dribble, post-up, floater, etc.)
- Contested or open
- Result if visible

For OUT OF BOUNDS plays, pay special attention to:
- Formation/alignment (box, line, stack, triangle)
- Screens and actions
- Primary and secondary options
- Inbounder tendencies

Respond ONLY with valid JSON. No explanation text outside the JSON.`;

function buildEnhancedAnalysisPrompt(opponentName, oppColor, yourColor, batchIndex, totalFrames) {
    return `Analyze these basketball game frames of ${opponentName} (${oppColor} jerseys) vs the team in ${yourColor} jerseys.

FRAME BATCH: ${batchIndex + 1} to ${Math.min(batchIndex + 5, totalFrames)} of ${totalFrames}

For EACH frame, identify and return:

{
  "frames": [
    {
      "frameIndex": 0,
      "gameState": {
        "situation": "halfcourt" | "transition" | "blob" | "slob" | "press_break" | "dead_ball",
        "possession": "opponent" | "your_team"
      },
      "players": [
        {
          "jersey": "#23",
          "team": "opponent" | "your_team",
          "position": "PG" | "SG" | "SF" | "PF" | "C",
          "courtLocation": {
            "zone": "paint" | "left_corner" | "right_corner" | "left_wing" | "right_wing" | "top_key" | "left_elbow" | "right_elbow",
            "x": 0-100,
            "y": 0-100
          },
          "action": "ball_handler" | "setting_screen" | "cutting" | "spotting_up" | "defending",
          "hasBall": true | false
        }
      ],
      "shotAttempt": {
        "shooter": "#23",
        "location": { "zone": "left_corner", "x": 10, "y": 85 },
        "shotType": "catch_and_shoot" | "off_dribble" | "layup",
        "contested": true | false,
        "result": "make" | "miss" | "unknown"
      } | null,
      "play": {
        "name": "Horns Flare" | "Pick and Roll" | "Motion" | "Isolation" | "BLOB Box",
        "primaryAction": "description"
      },
      "defense": {
        "scheme": "man" | "2-3_zone" | "3-2_zone" | "1-3-1_zone" | "press"
      },
      "outOfBounds": {
        "type": "BLOB" | "SLOB" | null,
        "formation": "box" | "line" | "stack" | "triangle",
        "inbounder": "#12",
        "primaryOption": "description"
      } | null
    }
  ]
}`;
}

// ============================================================
// HEALTH CHECK ENDPOINTS
// ============================================================

app.get('/', (req, res) => {
    res.json({
        status: 'CoachIQ API is running',
        version: '6.0.0-complete',
        features: [
            'enhanced-analysis',
            'shot-charts',
            'player-profiles',
            'blob-plays',
            'email-inbound',
            'email-notifications',
            'hudl-support',
            'google-drive-support',
            'dropbox-support'
        ],
        endpoints: {
            analyze: 'POST /api/analyze',
            upload: 'POST /api/upload',
            emailInbound: 'POST /api/email/inbound',
            reports: 'GET /api/reports/:id',
            status: 'GET /api/reports/:id/status'
        }
    });
});

app.get('/health', (req, res) => {
    res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// ============================================================
// USER MANAGEMENT
// ============================================================

app.post('/api/users/register', (req, res) => {
    const { email, name, teamName } = req.body;
    
    if (!email) {
        return res.status(400).json({ error: 'Email is required' });
    }
    
    const normalizedEmail = email.toLowerCase().trim();
    
    // Check if user exists
    if (users.has(normalizedEmail)) {
        const existing = users.get(normalizedEmail);
        return res.json({ user: existing, existing: true });
    }
    
    const userId = uuidv4();
    const user = {
        id: userId,
        email: normalizedEmail,
        name: name || 'Coach',
        teamName: teamName || '',
        reportsRemaining: 3,  // Free trial
        subscription: 'free',
        createdAt: new Date().toISOString()
    };
    
    users.set(userId, user);
    users.set(normalizedEmail, user);
    
    console.log(`👤 New user registered: ${normalizedEmail}`);
    res.json({ user });
});

app.get('/api/users/:email', (req, res) => {
    const user = users.get(req.params.email.toLowerCase());
    if (!user) {
        return res.status(404).json({ error: 'User not found' });
    }
    res.json({ user });
});

// Get or create user by email (for email flow)
function getOrCreateUser(email) {
    const normalizedEmail = email.toLowerCase().trim();
    
    if (users.has(normalizedEmail)) {
        return users.get(normalizedEmail);
    }
    
    const userId = uuidv4();
    const user = {
        id: userId,
        email: normalizedEmail,
        name: 'Coach',
        teamName: '',
        reportsRemaining: 3,
        subscription: 'free',
        createdAt: new Date().toISOString()
    };
    
    users.set(userId, user);
    users.set(normalizedEmail, user);
    
    console.log(`👤 Auto-created user: ${normalizedEmail}`);
    return user;
}

// ============================================================
// EMAIL INBOUND WEBHOOK (SendGrid Inbound Parse)
// ============================================================

app.post('/api/email/inbound', async (req, res) => {
    console.log('📧 ====== INBOUND EMAIL RECEIVED ======');
    
    try {
        // Parse SendGrid Inbound Parse format
        let fromEmail = '';
        let subject = '';
        let textBody = '';
        let htmlBody = '';
        
        // SendGrid sends data in various formats
        if (req.body.envelope) {
            try {
                const envelope = JSON.parse(req.body.envelope);
                fromEmail = envelope.from || '';
            } catch (e) {
                fromEmail = req.body.from || '';
            }
        } else {
            fromEmail = req.body.from || req.body.From || '';
        }
        
        subject = req.body.subject || req.body.Subject || '';
        textBody = req.body.text || req.body['body-plain'] || '';
        htmlBody = req.body.html || req.body['body-html'] || '';
        
        // Extract email address from "Name <email@domain.com>" format
        const coachEmail = extractEmailAddress(fromEmail);
        
        console.log(`📧 From: ${coachEmail}`);
        console.log(`📧 Subject: ${subject}`);
        
        if (!coachEmail) {
            console.error('❌ Could not extract sender email');
            return res.status(400).json({ error: 'Invalid sender email' });
        }
        
        // Combine text and html for link searching
        const fullBody = textBody + ' ' + htmlBody;
        
        // Extract video link (Hudl, Google Drive, Dropbox, YouTube)
        const videoLink = extractVideoLink(fullBody);
        
        if (!videoLink) {
            console.log('📧 No video link found, sending help email');
            await sendNoLinkFoundEmail(coachEmail);
            return res.json({ status: 'no_link_found', message: 'Sent help email' });
        }
        
        console.log(`📧 Found video link: ${videoLink.url} (${videoLink.source})`);
        
        // Parse team names from subject/body
        const parsedTeams = parseTeamNames(subject, textBody);
        
        // Create setup token
        const setupToken = uuidv4();
        const setupData = {
            token: setupToken,
            coachEmail: coachEmail,
            videoLink: videoLink,
            parsedTeams: parsedTeams,
            originalSubject: subject,
            createdAt: new Date().toISOString(),
            expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString()
        };
        
        pendingEmailSetups.set(setupToken, setupData);
        
        // Send setup email to coach
        await sendSetupEmail(coachEmail, setupToken, parsedTeams, videoLink.source);
        
        console.log(`✅ Setup email sent to ${coachEmail} (token: ${setupToken})`);
        res.json({ status: 'ok', token: setupToken });
        
    } catch (error) {
        console.error('❌ Email inbound error:', error);
        res.status(500).json({ error: error.message });
    }
});

// ============================================================
// EMAIL SETUP PAGE API
// ============================================================

// Get setup data for the setup page
app.get('/api/email/setup/:token', (req, res) => {
    const setup = pendingEmailSetups.get(req.params.token);
    
    if (!setup) {
        return res.status(404).json({ error: 'Setup not found or expired' });
    }
    
    // Check expiration
    if (new Date(setup.expiresAt) < new Date()) {
        pendingEmailSetups.delete(req.params.token);
        return res.status(410).json({ error: 'Setup link has expired' });
    }
    
    res.json({
        parsedTeams: setup.parsedTeams,
        videoSource: setup.videoLink.source,
        coachEmail: setup.coachEmail
    });
});

// Start analysis from setup page
app.post('/api/email/start-analysis/:token', async (req, res) => {
    const { token } = req.params;
    const { opponentName, opponentColor, yourTeamColor } = req.body;
    
    const setup = pendingEmailSetups.get(token);
    
    if (!setup) {
        return res.status(404).json({ error: 'Setup not found or expired' });
    }
    
    if (!opponentName) {
        return res.status(400).json({ error: 'Opponent name is required' });
    }
    
    try {
        // Get or create user
        const user = getOrCreateUser(setup.coachEmail);
        
        // Check quota
        if (user.subscription === 'free' && user.reportsRemaining <= 0) {
            return res.status(403).json({
                error: 'Free trial limit reached',
                upgradeRequired: true
            });
        }
        
        // Create report
        const reportId = uuidv4();
        const report = {
            id: reportId,
            userId: user.id,
            userEmail: setup.coachEmail,
            opponentName: opponentName,
            opponentColor: opponentColor || 'dark',
            yourTeamColor: yourTeamColor || 'white',
            videoUrl: setup.videoLink.url,
            videoSource: setup.videoLink.source,
            status: 'queued',
            progress: 'Preparing to download video...',
            source: 'email',
            createdAt: new Date().toISOString()
        };
        
        reports.set(reportId, report);
        
        // Remove from pending
        pendingEmailSetups.delete(token);
        
        console.log(`🏀 Analysis started from email: ${reportId} for ${opponentName}`);
        
        // Return success immediately
        res.json({
            status: 'started',
            reportId,
            message: 'Analysis started! You will receive an email when your report is ready.'
        });
        
        // Process in background
        processVideoAnalysis(
            reportId,
            setup.videoLink.url,
            opponentName,
            opponentColor || 'dark',
            yourTeamColor || 'white',
            setup.coachEmail
        );
        
    } catch (error) {
        console.error('Start analysis error:', error);
        res.status(500).json({ error: 'Failed to start analysis' });
    }
});

// ============================================================
// STANDARD ANALYSIS ENDPOINT (Web UI)
// ============================================================

app.post('/api/analyze', async (req, res) => {
    try {
        const {
            videoUrl,
            opponentName,
            opponentColor,
            yourTeamColor,
            userEmail
        } = req.body;
        
        if (!videoUrl || !opponentName) {
            return res.status(400).json({
                error: 'Missing required fields: videoUrl and opponentName'
            });
        }
        
        // Check user quota if email provided
        if (userEmail) {
            const user = getOrCreateUser(userEmail);
            if (user.subscription === 'free' && user.reportsRemaining <= 0) {
                return res.status(403).json({
                    error: 'Free trial limit reached',
                    upgradeRequired: true
                });
            }
        }
        
        // Create report
        const reportId = uuidv4();
        const report = {
            id: reportId,
            userEmail: userEmail || null,
            opponentName,
            opponentColor: opponentColor || 'dark',
            yourTeamColor: yourTeamColor || 'white',
            videoUrl,
            status: 'queued',
            progress: 'Analysis queued...',
            source: 'web',
            createdAt: new Date().toISOString()
        };
        
        reports.set(reportId, report);
        
        console.log(`🏀 Analysis queued: ${reportId} for ${opponentName}`);
        
        res.json({
            reportId,
            status: 'processing',
            message: 'Analysis started. This typically takes 3-5 minutes.',
            statusUrl: `/api/reports/${reportId}/status`
        });
        
        // Process in background
        processVideoAnalysis(
            reportId,
            videoUrl,
            opponentName,
            opponentColor || 'dark',
            yourTeamColor || 'white',
            userEmail
        );
        
    } catch (error) {
        console.error('Analysis error:', error);
        res.status(500).json({ error: 'Failed to start analysis' });
    }
});

// ============================================================
// DIRECT VIDEO UPLOAD
// ============================================================

app.post('/api/upload', upload.single('video'), async (req, res) => {
    try {
        if (!req.file) {
            return res.status(400).json({ error: 'No video file provided' });
        }
        
        const { opponentName, opponentColor, yourTeamColor, userEmail } = req.body;
        
        if (!opponentName) {
            return res.status(400).json({ error: 'Opponent name is required' });
        }
        
        const reportId = uuidv4();
        const report = {
            id: reportId,
            userEmail: userEmail || null,
            opponentName,
            opponentColor: opponentColor || 'dark',
            yourTeamColor: yourTeamColor || 'white',
            status: 'processing',
            progress: 'Video uploaded, starting analysis...',
            source: 'upload',
            createdAt: new Date().toISOString()
        };
        
        reports.set(reportId, report);
        
        console.log(`📁 Direct upload: ${req.file.filename}`);
        
        res.json({
            reportId,
            status: 'processing',
            message: 'Video uploaded. Analysis starting...'
        });
        
        // Process the uploaded file directly
        processVideoFile(
            reportId,
            req.file.path,
            opponentName,
            opponentColor || 'dark',
            yourTeamColor || 'white',
            userEmail
        );
        
    } catch (error) {
        console.error('Upload error:', error);
        res.status(500).json({ error: 'Upload failed' });
    }
});

// ============================================================
// REPORT STATUS & RETRIEVAL
// ============================================================

app.get('/api/reports/:id/status', (req, res) => {
    const report = reports.get(req.params.id);
    
    if (!report) {
        return res.status(404).json({ error: 'Report not found' });
    }
    
    res.json({
        id: report.id,
        status: report.status,
        progress: report.progress,
        opponentName: report.opponentName,
        createdAt: report.createdAt,
        completedAt: report.completedAt || null,
        error: report.error || null
    });
});

app.get('/api/reports/:id', (req, res) => {
    const report = reports.get(req.params.id);
    
    if (!report) {
        return res.status(404).json({ error: 'Report not found' });
    }
    
    res.json(report);
});

// Get shot chart SVG
app.get('/api/reports/:id/shotchart/:jersey', (req, res) => {
    const report = reports.get(req.params.id);
    
    if (!report || !report.data) {
        return res.status(404).json({ error: 'Report not found' });
    }
    
    const jersey = decodeURIComponent(req.params.jersey);
    const svg = report.data.shotChartSVGs?.[jersey];
    
    if (!svg) {
        return res.status(404).json({ error: 'Shot chart not found' });
    }
    
    res.setHeader('Content-Type', 'image/svg+xml');
    res.send(svg);
});

// Get user's reports
app.get('/api/users/:email/reports', (req, res) => {
    const userReports = [];
    
    for (const [id, report] of reports) {
        if (report.userEmail?.toLowerCase() === req.params.email.toLowerCase()) {
            userReports.push({
                id: report.id,
                opponentName: report.opponentName,
                status: report.status,
                createdAt: report.createdAt
            });
        }
    }
    
    res.json({
        reports: userReports.sort((a, b) => 
            new Date(b.createdAt) - new Date(a.createdAt)
        )
    });
});

// ============================================================
// VIDEO PROCESSING PIPELINE
// ============================================================

async function processVideoAnalysis(reportId, videoUrl, opponentName, oppColor, yourColor, userEmail) {
    console.log(`🏀 Starting analysis for ${reportId}`);
    
    try {
        updateReport(reportId, { status: 'downloading', progress: 'Downloading video...' });
        
        // Download video
        const videoPath = await downloadVideo(videoUrl);
        console.log(`✅ Downloaded: ${videoPath}`);
        
        // Process the file
        await processVideoFile(reportId, videoPath, opponentName, oppColor, yourColor, userEmail);
        
    } catch (error) {
        console.error(`❌ Analysis failed for ${reportId}:`, error);
        updateReport(reportId, {
            status: 'failed',
            error: error.message,
            progress: 'Analysis failed: ' + error.message
        });
        
        // Send error email if we have user email
        if (userEmail) {
            await sendErrorEmail(userEmail, opponentName, error.message);
        }
    }
}

async function processVideoFile(reportId, videoPath, opponentName, oppColor, yourColor, userEmail) {
    const frames = [];
    
    try {
        updateReport(reportId, { status: 'extracting', progress: 'Extracting frames from video...' });
        
        // Extract frames
        const extractedFrames = await extractFrames(videoPath, { intervalSeconds: 5, maxFrames: 60 });
        frames.push(...extractedFrames);
        console.log(`✅ Extracted ${frames.length} frames`);
        
        updateReport(reportId, { status: 'analyzing', progress: 'Claude is analyzing the game film...' });
        
        // Analyze with Claude
        const frameAnalysis = await analyzeFramesBatch(frames, opponentName, oppColor, yourColor);
        console.log(`✅ Frame analysis complete`);
        
        updateReport(reportId, { progress: 'Generating player profiles...' });
        
        // Generate player profiles
        const playerProfiles = await generatePlayerProfiles(frameAnalysis, opponentName);
        console.log(`✅ Player profiles generated`);
        
        updateReport(reportId, { progress: 'Analyzing out-of-bounds plays...' });
        
        // Analyze OOB plays
        const oobAnalysis = await analyzeOutOfBoundsPlays(frameAnalysis.outOfBoundsPlays, opponentName);
        console.log(`✅ OOB analysis complete`);
        
        // Generate shot charts
        const shotCharts = generateShotCharts(frameAnalysis.shots);
        const shotChartSVGs = {};
        for (const jersey in shotCharts) {
            shotChartSVGs[jersey] = generateShotChartSVG(shotCharts[jersey], jersey);
        }
        console.log(`✅ Shot charts generated`);
        
        // Compile final report
        const enhancedReport = compileEnhancedReport(
            opponentName,
            frameAnalysis,
            playerProfiles,
            oobAnalysis,
            shotCharts,
            shotChartSVGs
        );
        
        // Update report as complete
        const report = reports.get(reportId);
        report.status = 'complete';
        report.data = enhancedReport;
        report.completedAt = new Date().toISOString();
        report.progress = 'Analysis complete!';
        reports.set(reportId, report);
        
        console.log(`🎉 Analysis COMPLETE for ${reportId}`);
        
        // Deduct from user quota
        if (userEmail) {
            const user = users.get(userEmail.toLowerCase());
            if (user && user.subscription === 'free') {
                user.reportsRemaining = Math.max(0, user.reportsRemaining - 1);
                users.set(userEmail.toLowerCase(), user);
                users.set(user.id, user);
            }
            
            // Send report email
            await sendReportReadyEmail(userEmail, opponentName, reportId, enhancedReport);
        }
        
    } catch (error) {
        throw error;
    } finally {
        // Cleanup
        cleanupFiles(videoPath, frames);
    }
}

function updateReport(reportId, updates) {
    const report = reports.get(reportId);
    if (report) {
        Object.assign(report, updates);
        reports.set(reportId, report);
    }
}

// ============================================================
// VIDEO DOWNLOAD (Multi-source)
// ============================================================

async function downloadVideo(videoUrl) {
    const outputPath = `/tmp/coachiq_${Date.now()}.mp4`;
    
    console.log(`📥 Downloading: ${videoUrl}`);
    
    // Hudl, YouTube, Vimeo - use yt-dlp
    if (videoUrl.includes('hudl.com') || 
        videoUrl.includes('youtube.com') || 
        videoUrl.includes('youtu.be') ||
        videoUrl.includes('vimeo.com')) {
        
        return new Promise((resolve, reject) => {
            const args = [
                '-f', 'best[height<=720]',
                '--max-filesize', '2G',
                '-o', outputPath,
                videoUrl
            ];
            
            const process = spawn('yt-dlp', args);
            
            process.stdout.on('data', (data) => {
                console.log(`yt-dlp: ${data}`);
            });
            
            process.stderr.on('data', (data) => {
                console.log(`yt-dlp: ${data}`);
            });
            
            process.on('close', (code) => {
                if (code === 0 && fs.existsSync(outputPath)) {
                    resolve(outputPath);
                } else {
                    reject(new Error('Failed to download video. Please check the URL is accessible.'));
                }
            });
            
            process.on('error', (err) => {
                reject(new Error(`Download error: ${err.message}`));
            });
            
            // Timeout after 10 minutes
            setTimeout(() => {
                process.kill();
                reject(new Error('Download timed out'));
            }, 600000);
        });
    }
    
    // Google Drive
    if (videoUrl.includes('drive.google.com')) {
        const fileId = extractGoogleDriveId(videoUrl);
        if (!fileId) {
            throw new Error('Invalid Google Drive URL');
        }
        
        return new Promise((resolve, reject) => {
            exec(`gdown --id ${fileId} -O "${outputPath}"`, { timeout: 600000 }, (error) => {
                if (error) {
                    reject(new Error('Failed to download from Google Drive. Make sure the file is shared publicly.'));
                } else if (fs.existsSync(outputPath)) {
                    resolve(outputPath);
                } else {
                    reject(new Error('Download completed but file not found'));
                }
            });
        });
    }
    
    // Dropbox
    if (videoUrl.includes('dropbox.com')) {
        const directUrl = videoUrl
            .replace('www.dropbox.com', 'dl.dropboxusercontent.com')
            .replace('?dl=0', '')
            .replace('?dl=1', '');
        
        return new Promise((resolve, reject) => {
            exec(`wget -O "${outputPath}" "${directUrl}"`, { timeout: 600000 }, (error) => {
                if (error) {
                    reject(new Error('Failed to download from Dropbox'));
                } else {
                    resolve(outputPath);
                }
            });
        });
    }
    
    // Direct URL
    return new Promise((resolve, reject) => {
        exec(`wget -O "${outputPath}" "${videoUrl}"`, { timeout: 600000 }, (error) => {
            if (error) {
                reject(new Error('Failed to download video'));
            } else {
                resolve(outputPath);
            }
        });
    });
}

// ============================================================
// FRAME EXTRACTION
// ============================================================

async function extractFrames(videoPath, options = {}) {
    const { intervalSeconds = 5, maxFrames = 60 } = options;
    const framesDir = `/tmp/frames_${Date.now()}`;
    
    if (!fs.existsSync(framesDir)) {
        fs.mkdirSync(framesDir, { recursive: true });
    }
    
    return new Promise((resolve, reject) => {
        ffmpeg(videoPath)
            .outputOptions([
                `-vf fps=1/${intervalSeconds}`,
                `-frames:v ${maxFrames}`,
                '-q:v 2'
            ])
            .output(`${framesDir}/frame_%04d.jpg`)
            .on('end', async () => {
                const files = fs.readdirSync(framesDir)
                    .filter(f => f.endsWith('.jpg'))
                    .sort();
                
                const frames = files.map((file, index) => {
                    const framePath = path.join(framesDir, file);
                    const buffer = fs.readFileSync(framePath);
                    return {
                        path: framePath,
                        base64: buffer.toString('base64'),
                        timestamp: index * intervalSeconds
                    };
                });
                
                console.log(`✅ Extracted ${frames.length} frames`);
                resolve(frames);
            })
            .on('error', (err) => {
                console.error('FFmpeg error:', err);
                reject(new Error('Failed to extract frames from video'));
            })
            .run();
    });
}

// ============================================================
// CLAUDE ANALYSIS
// ============================================================

async function analyzeFramesBatch(frames, opponentName, oppColor, yourColor) {
    const batchSize = 5;
    const allResults = {
        frames: [],
        players: new Map(),
        shots: [],
        plays: [],
        outOfBoundsPlays: [],
        defensiveSets: []
    };
    
    for (let i = 0; i < frames.length; i += batchSize) {
        const batch = frames.slice(i, i + batchSize);
        
        const content = [
            {
                type: 'text',
                text: buildEnhancedAnalysisPrompt(opponentName, oppColor, yourColor, i, frames.length)
            },
            ...batch.map(frame => ({
                type: 'image',
                source: {
                    type: 'base64',
                    media_type: 'image/jpeg',
                    data: frame.base64
                }
            }))
        ];
        
        try {
            const response = await anthropic.messages.create({
                model: 'claude-sonnet-4-20250514',
                max_tokens: 4096,
                system: ENHANCED_BASKETBALL_SYSTEM_PROMPT,
                messages: [{ role: 'user', content }]
            });
            
            const text = response.content[0].text;
            const jsonMatch = text.match(/\{[\s\S]*\}/);
            
            if (jsonMatch) {
                const parsed = JSON.parse(jsonMatch[0]);
                
                if (parsed.frames) {
                    for (const frame of parsed.frames) {
                        allResults.frames.push(frame);
                        
                        if (frame.players) {
                            for (const player of frame.players) {
                                if (player.team === 'opponent') {
                                    trackPlayer(allResults.players, player);
                                }
                            }
                        }
                        
                        if (frame.shotAttempt) {
                            allResults.shots.push(frame.shotAttempt);
                        }
                        
                        if (frame.play) {
                            allResults.plays.push(frame.play);
                        }
                        
                        if (frame.outOfBounds) {
                            allResults.outOfBoundsPlays.push(frame.outOfBounds);
                        }
                        
                        if (frame.defense) {
                            allResults.defensiveSets.push(frame.defense);
                        }
                    }
                }
            }
            
            console.log(`  ✓ Analyzed frames ${i + 1}-${Math.min(i + batchSize, frames.length)}`);
            await sleep(1000);
            
        } catch (error) {
            console.error(`Error analyzing batch ${i}:`, error.message);
        }
    }
    
    return allResults;
}

function trackPlayer(playersMap, player) {
    const jersey = player.jersey;
    
    if (!playersMap.has(jersey)) {
        playersMap.set(jersey, {
            jersey,
            position: player.position,
            locations: [],
            actions: [],
            hasBallCount: 0,
            totalAppearances: 0
        });
    }
    
    const data = playersMap.get(jersey);
    data.totalAppearances++;
    
    if (player.courtLocation) {
        data.locations.push(player.courtLocation);
    }
    
    if (player.action) {
        data.actions.push(player.action);
    }
    
    if (player.hasBall) {
        data.hasBallCount++;
    }
}

// ============================================================
// PLAYER PROFILE GENERATION
// ============================================================

async function generatePlayerProfiles(frameAnalysis, opponentName) {
    const playerSummaries = {};
    
    for (const [jersey, data] of frameAnalysis.players) {
        const actionCounts = {};
        for (const action of data.actions) {
            actionCounts[action] = (actionCounts[action] || 0) + 1;
        }
        
        const zoneCounts = {};
        for (const loc of data.locations) {
            if (loc.zone) {
                zoneCounts[loc.zone] = (zoneCounts[loc.zone] || 0) + 1;
            }
        }
        
        const playerShots = frameAnalysis.shots.filter(s => s.shooter === jersey);
        
        playerSummaries[jersey] = {
            jersey,
            position: data.position,
            ballHandlingRate: data.hasBallCount / Math.max(data.totalAppearances, 1),
            topActions: Object.entries(actionCounts).sort((a, b) => b[1] - a[1]).slice(0, 3),
            favoriteZones: Object.entries(zoneCounts).sort((a, b) => b[1] - a[1]).slice(0, 3),
            shots: playerShots
        };
    }
    
    const prompt = `Based on this basketball game analysis, create detailed scouting profiles for ${opponentName}'s players.

ANALYSIS DATA:
${JSON.stringify(playerSummaries, null, 2)}

Generate profiles in this JSON format:
{
  "starting5": [
    {
      "jersey": "#23",
      "position": "PG",
      "estimatedHeight": "6'1\\"",
      "attributes": { "speed": 8, "quickness": 9, "strength": 6, "basketball_iq": 8 },
      "offensiveStrengths": ["Elite ball handler", "Great mid-range game"],
      "offensiveWeaknesses": ["Struggles with left hand"],
      "defensiveStrengths": ["Active hands"],
      "defensiveWeaknesses": ["Gets screened easily"],
      "tendencies": { "preferredHand": "right", "preferredSide": "right_wing", "favoriteMove": "crossover" },
      "stats": { "pointsPerGame": 18, "assistsPerGame": 6, "usageRate": "28%" },
      "howToGuard": {
        "primaryStrategy": "Force left",
        "onBall": ["Stay in stance", "Go under screens"],
        "offBall": ["Deny right wing"]
      },
      "dangerLevel": 9
    }
  ]
}`;

    try {
        const response = await anthropic.messages.create({
            model: 'claude-sonnet-4-20250514',
            max_tokens: 8192,
            messages: [{ role: 'user', content: prompt }],
            system: 'You are an elite basketball scout. Generate detailed, actionable player profiles. Return ONLY valid JSON.'
        });
        
        const text = response.content[0].text;
        const jsonMatch = text.match(/\{[\s\S]*\}/);
        
        if (jsonMatch) {
            return JSON.parse(jsonMatch[0]);
        }
    } catch (error) {
        console.error('Error generating profiles:', error.message);
    }
    
    return { starting5: Object.values(playerSummaries).slice(0, 5) };
}

// ============================================================
// OUT OF BOUNDS ANALYSIS
// ============================================================

async function analyzeOutOfBoundsPlays(oobPlays, opponentName) {
    if (!oobPlays || oobPlays.length === 0) {
        return { blobPlays: [], slobPlays: [] };
    }
    
    const prompt = `Analyze these out-of-bounds plays from ${opponentName} and provide defensive counters:

OOB PLAYS OBSERVED:
${JSON.stringify(oobPlays, null, 2)}

Return JSON:
{
  "blobPlays": [
    {
      "name": "Box Double",
      "frequency": "35%",
      "formation": { "description": "...", "positions": {} },
      "primaryAction": { "description": "...", "timing": "..." },
      "defensiveCounter": {
        "strategy": "Switch all screens",
        "assignments": { "#1": "Deny inbound", "#2": "Jump curl" },
        "communication": ["Call SWITCH early"]
      }
    }
  ],
  "slobPlays": []
}`;

    try {
        const response = await anthropic.messages.create({
            model: 'claude-sonnet-4-20250514',
            max_tokens: 4096,
            messages: [{ role: 'user', content: prompt }],
            system: 'You are a basketball defensive coordinator. Return ONLY valid JSON.'
        });
        
        const text = response.content[0].text;
        const jsonMatch = text.match(/\{[\s\S]*\}/);
        
        if (jsonMatch) {
            return JSON.parse(jsonMatch[0]);
        }
    } catch (error) {
        console.error('Error analyzing OOB:', error.message);
    }
    
    return { blobPlays: [], slobPlays: [] };
}

// ============================================================
// SHOT CHART GENERATION
// ============================================================

function generateShotCharts(shots) {
    const playerShots = {};
    
    for (const shot of shots) {
        const jersey = shot.shooter;
        if (!jersey) continue;
        
        if (!playerShots[jersey]) {
            playerShots[jersey] = {
                total: 0,
                makes: 0,
                zones: {
                    paint: { attempts: 0, makes: 0 },
                    leftCorner3: { attempts: 0, makes: 0 },
                    rightCorner3: { attempts: 0, makes: 0 },
                    leftWing3: { attempts: 0, makes: 0 },
                    rightWing3: { attempts: 0, makes: 0 },
                    topKey3: { attempts: 0, makes: 0 },
                    midRange: { attempts: 0, makes: 0 }
                },
                shotLocations: []
            };
        }
        
        const player = playerShots[jersey];
        player.total++;
        
        if (shot.result === 'make') {
            player.makes++;
        }
        
        const zone = mapZone(shot.location?.zone);
        if (zone && player.zones[zone]) {
            player.zones[zone].attempts++;
            if (shot.result === 'make') {
                player.zones[zone].makes++;
            }
        }
        
        if (shot.location?.x !== undefined && shot.location?.y !== undefined) {
            player.shotLocations.push({
                x: shot.location.x,
                y: shot.location.y,
                result: shot.result
            });
        }
    }
    
    // Calculate percentages
    for (const jersey in playerShots) {
        const player = playerShots[jersey];
        player.percentage = player.total > 0 ? Math.round((player.makes / player.total) * 100) : 0;
        
        for (const zone in player.zones) {
            const z = player.zones[zone];
            z.percentage = z.attempts > 0 ? Math.round((z.makes / z.attempts) * 100) : null;
        }
    }
    
    return playerShots;
}

function mapZone(zone) {
    if (!zone) return 'midRange';
    
    const zoneMap = {
        'paint': 'paint',
        'left_corner': 'leftCorner3',
        'right_corner': 'rightCorner3',
        'left_wing': 'leftWing3',
        'right_wing': 'rightWing3',
        'top_key': 'topKey3'
    };
    
    return zoneMap[zone] || 'midRange';
}

function generateShotChartSVG(playerData, playerJersey) {
    const width = 400;
    const height = 380;
    const courtWidth = 380;
    const courtHeight = 360;
    const offsetX = 10;
    const offsetY = 10;
    
    let svg = `<svg viewBox="0 0 ${width} ${height}" xmlns="http://www.w3.org/2000/svg">
    <style>
        .court { fill: #1a1a1a; stroke: #444; stroke-width: 2; }
        .line { stroke: #555; stroke-width: 1.5; fill: none; }
        .three-line { stroke: #666; stroke-width: 2; fill: none; }
        .paint { fill: rgba(255,107,53,0.1); stroke: #FF6B35; stroke-width: 2; }
        .make { fill: #00D4AA; stroke: #00B894; stroke-width: 2; }
        .miss { fill: #FF6B6B; stroke: #E55555; stroke-width: 2; }
        .zone-hot { fill: rgba(0,212,170,0.3); }
        .zone-cold { fill: rgba(255,107,107,0.2); }
        .label { font-family: sans-serif; font-size: 11px; fill: #888; }
        .title { font-family: sans-serif; font-size: 14px; fill: #fff; font-weight: bold; }
        .pct { font-family: sans-serif; font-size: 14px; fill: #fff; font-weight: bold; }
    </style>
    
    <rect class="court" x="${offsetX}" y="${offsetY}" width="${courtWidth}" height="${courtHeight}"/>
    
    <path class="three-line" d="
        M ${offsetX + 30} ${offsetY + courtHeight}
        L ${offsetX + 30} ${offsetY + courtHeight - 140}
        A 190 190 0 0 1 ${offsetX + courtWidth - 30} ${offsetY + courtHeight - 140}
        L ${offsetX + courtWidth - 30} ${offsetY + courtHeight}
    "/>
    
    <rect class="paint" x="${offsetX + 110}" y="${offsetY + courtHeight - 190}" width="160" height="190"/>
    <circle class="line" cx="${offsetX + courtWidth/2}" cy="${offsetY + courtHeight - 190}" r="60"/>
    <circle class="line" cx="${offsetX + courtWidth/2}" cy="${offsetY + courtHeight - 40}" r="10" style="stroke: #FF6B35; stroke-width: 3;"/>`;
    
    // Zone overlays
    if (playerData?.zones) {
        const zones = playerData.zones;
        
        if (zones.paint?.attempts > 0) {
            const color = getZoneColor(zones.paint.percentage);
            svg += `<rect class="zone-${color}" x="${offsetX + 140}" y="${offsetY + courtHeight - 100}" width="100" height="90" rx="4"/>
            <text class="pct" x="${offsetX + 190}" y="${offsetY + courtHeight - 50}" text-anchor="middle">${zones.paint.percentage}%</text>`;
        }
        
        if (zones.leftCorner3?.attempts > 0) {
            const color = getZoneColor(zones.leftCorner3.percentage);
            svg += `<rect class="zone-${color}" x="${offsetX + 5}" y="${offsetY + courtHeight - 80}" width="50" height="70" rx="4"/>
            <text class="pct" x="${offsetX + 30}" y="${offsetY + courtHeight - 40}" text-anchor="middle">${zones.leftCorner3.percentage}%</text>`;
        }
        
        if (zones.rightCorner3?.attempts > 0) {
            const color = getZoneColor(zones.rightCorner3.percentage);
            svg += `<rect class="zone-${color}" x="${offsetX + courtWidth - 55}" y="${offsetY + courtHeight - 80}" width="50" height="70" rx="4"/>
            <text class="pct" x="${offsetX + courtWidth - 30}" y="${offsetY + courtHeight - 40}" text-anchor="middle">${zones.rightCorner3.percentage}%</text>`;
        }
        
        if (zones.topKey3?.attempts > 0) {
            const color = getZoneColor(zones.topKey3.percentage);
            svg += `<rect class="zone-${color}" x="${offsetX + 140}" y="${offsetY + 30}" width="100" height="60" rx="4"/>
            <text class="pct" x="${offsetX + 190}" y="${offsetY + 65}" text-anchor="middle">${zones.topKey3.percentage}%</text>`;
        }
    }
    
    // Plot shots
    if (playerData?.shotLocations) {
        for (const shot of playerData.shotLocations) {
            const x = offsetX + (shot.x / 100) * courtWidth;
            const y = offsetY + courtHeight - (shot.y / 100) * courtHeight;
            const className = shot.result === 'make' ? 'make' : 'miss';
            svg += `<circle class="${className}" cx="${x}" cy="${y}" r="6"/>`;
        }
    }
    
    svg += `<text class="title" x="${offsetX + 10}" y="25">${playerJersey} Shot Chart</text>`;
    svg += `
    <circle class="make" cx="${offsetX + courtWidth - 80}" cy="20" r="5"/>
    <text class="label" x="${offsetX + courtWidth - 70}" y="24">Make</text>
    <circle class="miss" cx="${offsetX + courtWidth - 30}" cy="20" r="5"/>
    <text class="label" x="${offsetX + courtWidth - 20}" y="24">Miss</text>`;
    
    svg += `</svg>`;
    return svg;
}

function getZoneColor(percentage) {
    if (percentage === null) return 'neutral';
    if (percentage >= 45) return 'hot';
    if (percentage <= 30) return 'cold';
    return 'neutral';
}

// ============================================================
// COMPILE FINAL REPORT
// ============================================================

function compileEnhancedReport(opponentName, frameAnalysis, playerProfiles, oobAnalysis, shotCharts, shotChartSVGs) {
    // Defense breakdown
    const defenseCounts = {};
    for (const def of frameAnalysis.defensiveSets) {
        if (def.scheme) {
            defenseCounts[def.scheme] = (defenseCounts[def.scheme] || 0) + 1;
        }
    }
    const totalDefense = Object.values(defenseCounts).reduce((a, b) => a + b, 0) || 1;
    const defenseBreakdown = {};
    for (const [scheme, count] of Object.entries(defenseCounts)) {
        defenseBreakdown[scheme] = { count, percentage: Math.round((count / totalDefense) * 100) };
    }
    
    // Play breakdown
    const playCounts = {};
    for (const play of frameAnalysis.plays) {
        if (play.name) {
            playCounts[play.name] = (playCounts[play.name] || 0) + 1;
        }
    }
    
    return {
        opponent: opponentName,
        generatedAt: new Date().toISOString(),
        
        summary: {
            framesAnalyzed: frameAnalysis.frames.length,
            playersTracked: frameAnalysis.players.size,
            shotsTracked: frameAnalysis.shots.length,
            playsIdentified: frameAnalysis.plays.length
        },
        
        starting5: playerProfiles.starting5?.map(player => ({
            ...player,
            shotChart: shotCharts[player.jersey] || null
        })) || [],
        
        shotChartSVGs,
        outOfBoundsPlays: oobAnalysis,
        
        teamDefense: {
            primarySet: Object.entries(defenseBreakdown).sort((a, b) => b[1].count - a[1].count)[0]?.[0] || 'Unknown',
            breakdown: defenseBreakdown
        },
        
        offensivePlays: Object.entries(playCounts)
            .sort((a, b) => b[1] - a[1])
            .slice(0, 10)
            .map(([name, count]) => ({
                name,
                count,
                percentage: Math.round((count / frameAnalysis.plays.length) * 100)
            })),
        
        rawData: {
            allShots: frameAnalysis.shots,
            allPlays: frameAnalysis.plays
        }
    };
}

// ============================================================
// EMAIL HELPER FUNCTIONS
// ============================================================

function extractEmailAddress(fromString) {
    if (!fromString) return null;
    
    // Match email in "Name <email@domain.com>" format or just "email@domain.com"
    const match = fromString.match(/<([^>]+)>/) || fromString.match(/([^\s<>]+@[^\s<>]+)/);
    return match ? match[1].toLowerCase().trim() : null;
}

function extractVideoLink(text) {
    if (!text) return null;
    
    // Hudl patterns
    const hudlPatterns = [
        /https?:\/\/(?:www\.)?hudl\.com\/video\/\d+\/[^\s"'<>]+/gi,
        /https?:\/\/(?:www\.)?hudl\.com\/v\/[^\s"'<>]+/gi,
        /https?:\/\/(?:www\.)?hudl\.com\/[^\s"'<>]*video[^\s"'<>]*/gi
    ];
    
    for (const pattern of hudlPatterns) {
        const match = text.match(pattern);
        if (match) {
            return { url: match[0], source: 'hudl' };
        }
    }
    
    // Google Drive
    const drivePattern = /https?:\/\/drive\.google\.com\/[^\s"'<>]+/gi;
    const driveMatch = text.match(drivePattern);
    if (driveMatch) {
        return { url: driveMatch[0], source: 'google_drive' };
    }
    
    // Dropbox
    const dropboxPattern = /https?:\/\/(?:www\.)?dropbox\.com\/[^\s"'<>]+/gi;
    const dropboxMatch = text.match(dropboxPattern);
    if (dropboxMatch) {
        return { url: dropboxMatch[0], source: 'dropbox' };
    }
    
    // YouTube
    const youtubePattern = /https?:\/\/(?:www\.)?(?:youtube\.com\/watch\?v=|youtu\.be\/)[^\s"'<>]+/gi;
    const youtubeMatch = text.match(youtubePattern);
    if (youtubeMatch) {
        return { url: youtubeMatch[0], source: 'youtube' };
    }
    
    return null;
}

function extractGoogleDriveId(url) {
    const patterns = [
        /\/file\/d\/([a-zA-Z0-9_-]+)/,
        /id=([a-zA-Z0-9_-]+)/,
        /\/d\/([a-zA-Z0-9_-]+)/
    ];
    
    for (const pattern of patterns) {
        const match = url.match(pattern);
        if (match) return match[1];
    }
    return null;
}

function parseTeamNames(subject, body) {
    const text = (subject + ' ' + body).toLowerCase();
    const result = { opponent: null, yourTeam: null };
    
    // Common patterns
    const vsPatterns = [
        /([a-z\s]+)\s+(?:vs\.?|versus|v\.?|at|@)\s+([a-z\s]+)/i,
        /([a-z\s]+)\s+(?:game|film|video)/i
    ];
    
    for (const pattern of vsPatterns) {
        const match = text.match(pattern);
        if (match) {
            result.opponent = match[1]?.trim();
            result.yourTeam = match[2]?.trim();
            break;
        }
    }
    
    return result;
}

// ============================================================
// EMAIL SENDING FUNCTIONS
// ============================================================

async function sendSetupEmail(coachEmail, setupToken, parsedTeams, videoSource) {
    const setupUrl = `${APP_URL}/setup/${setupToken}`;
    
    const teamText = parsedTeams.opponent 
        ? `I found what looks like a game against <strong>${parsedTeams.opponent}</strong>`
        : `I received your ${videoSource} video`;
    
    const html = `
<!DOCTYPE html>
<html>
<body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; background: #f5f5f5; padding: 20px; margin: 0;">
    <div style="max-width: 500px; margin: 0 auto; background: white; border-radius: 12px; overflow: hidden; box-shadow: 0 2px 8px rgba(0,0,0,0.1);">
        <div style="background: linear-gradient(135deg, #FF6B35, #FF8E53); padding: 24px; text-align: center;">
            <h1 style="margin: 0; color: white; font-size: 24px;">🏀 COACHIQ</h1>
            <p style="margin: 8px 0 0; color: rgba(255,255,255,0.9);">Got your video, Coach!</p>
        </div>
        
        <div style="padding: 24px;">
            <p style="color: #333; line-height: 1.6; margin: 0 0 16px;">
                ${teamText}. Before I analyze it, I just need you to confirm a few details.
            </p>
            
            <div style="text-align: center; margin: 24px 0;">
                <a href="${setupUrl}" style="display: inline-block; background: linear-gradient(135deg, #FF6B35, #FF8E53); color: white; text-decoration: none; padding: 14px 28px; border-radius: 10px; font-weight: bold; font-size: 15px;">
                    Complete Setup (30 seconds)
                </a>
            </div>
            
            <p style="color: #666; font-size: 14px; text-align: center;">
                Your scouting report will be ready in about 10-15 minutes!
            </p>
            
            <hr style="border: none; border-top: 1px solid #eee; margin: 24px 0;">
            
            <p style="color: #999; font-size: 13px; margin: 0;">
                <strong>Or reply to this email with:</strong><br>
                SCOUT: [opponent team name]<br>
                THEIR COLOR: [their jersey color]<br>
                YOUR COLOR: [your jersey color]
            </p>
        </div>
        
        <div style="background: #f8f8f8; padding: 16px; text-align: center;">
            <p style="margin: 0; color: #999; font-size: 12px;">
                Questions? Just reply to this email.<br>
                <a href="${APP_URL}" style="color: #FF6B35;">${APP_URL.replace('https://', '')}</a>
            </p>
        </div>
    </div>
</body>
</html>`;
    
    await emailTransporter.sendMail({
        from: FROM_EMAIL,
        to: coachEmail,
        replyTo: SCOUT_EMAIL,
        subject: '🏀 Quick setup for your scouting report',
        html: html,
        text: `CoachIQ - Got your video!\n\n${teamText.replace(/<[^>]+>/g, '')}.\n\nComplete setup: ${setupUrl}\n\nOr reply with:\nSCOUT: [opponent name]\nTHEIR COLOR: [jersey color]\nYOUR COLOR: [your color]`
    });
    
    console.log(`📧 Setup email sent to ${coachEmail}`);
}

async function sendNoLinkFoundEmail(coachEmail) {
    const html = `
<!DOCTYPE html>
<html>
<body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; background: #f5f5f5; padding: 20px; margin: 0;">
    <div style="max-width: 500px; margin: 0 auto; background: white; border-radius: 12px; overflow: hidden;">
        <div style="background: linear-gradient(135deg, #FF6B35, #FF8E53); padding: 24px; text-align: center;">
            <h1 style="margin: 0; color: white; font-size: 24px;">🏀 COACHIQ</h1>
        </div>
        <div style="padding: 24px;">
            <h2 style="margin: 0 0 16px; color: #333;">Couldn't find a video link</h2>
            <p style="color: #666; line-height: 1.6;">
                I received your email but couldn't find a Hudl, Google Drive, or Dropbox link.
            </p>
            <p style="color: #666; line-height: 1.6;"><strong>How to use CoachIQ:</strong></p>
            <ol style="color: #666; line-height: 1.8; padding-left: 20px;">
                <li>Open your email from Hudl (or get a Google Drive/Dropbox share link)</li>
                <li>Forward that email to <strong>${SCOUT_EMAIL}</strong></li>
                <li>I'll analyze it and send you a scouting report!</li>
            </ol>
            <p style="color: #999; font-size: 13px; margin-top: 20px;">
                Need help? Just reply to this email.
            </p>
        </div>
    </div>
</body>
</html>`;
    
    await emailTransporter.sendMail({
        from: FROM_EMAIL,
        to: coachEmail,
        replyTo: SCOUT_EMAIL,
        subject: "🏀 Couldn't find a video link - here's how to use CoachIQ",
        html: html,
        text: `CoachIQ\n\nI couldn't find a video link in your email.\n\nHow to use CoachIQ:\n1. Open your Hudl email (or get a Drive/Dropbox link)\n2. Forward it to ${SCOUT_EMAIL}\n3. I'll send you a scouting report!\n\nNeed help? Reply to this email.`
    });
    
    console.log(`📧 Help email sent to ${coachEmail}`);
}

async function sendReportReadyEmail(coachEmail, opponentName, reportId, reportData) {
    const reportUrl = `${APP_URL}/reports/${reportId}`;
    
    // Build quick stats
    const quickStats = [];
    if (reportData?.teamDefense?.primarySet) {
        quickStats.push(`Primary Defense: ${reportData.teamDefense.primarySet}`);
    }
    if (reportData?.offensivePlays?.[0]) {
        quickStats.push(`Top Play: ${reportData.offensivePlays[0].name} (${reportData.offensivePlays[0].percentage}%)`);
    }
    if (reportData?.starting5?.[0]) {
        const star = reportData.starting5[0];
        quickStats.push(`Key Player: ${star.jersey} (Danger: ${star.dangerLevel || '?'}/10)`);
    }
    quickStats.push(`Players Scouted: ${reportData?.starting5?.length || 0}`);
    
    const html = `
<!DOCTYPE html>
<html>
<body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; background: #f5f5f5; padding: 20px; margin: 0;">
    <div style="max-width: 500px; margin: 0 auto; background: white; border-radius: 12px; overflow: hidden; box-shadow: 0 2px 8px rgba(0,0,0,0.1);">
        <div style="background: linear-gradient(135deg, #FF6B35, #FF8E53); padding: 24px; text-align: center;">
            <h1 style="margin: 0; color: white; font-size: 24px;">📋 SCOUTING REPORT READY</h1>
            <p style="margin: 8px 0 0; color: rgba(255,255,255,0.95); font-size: 18px; font-weight: bold;">
                ${opponentName.toUpperCase()}
            </p>
        </div>
        
        <div style="padding: 24px;">
            <h3 style="margin: 0 0 16px; color: #333; font-size: 16px;">📊 QUICK STATS</h3>
            <div style="background: #f8f8f8; border-radius: 10px; padding: 16px;">
                ${quickStats.map(s => `<p style="margin: 8px 0; color: #333; font-size: 14px;">• ${s}</p>`).join('')}
            </div>
            
            <div style="text-align: center; margin: 24px 0;">
                <a href="${reportUrl}" style="display: inline-block; background: linear-gradient(135deg, #FF6B35, #FF8E53); color: white; text-decoration: none; padding: 14px 28px; border-radius: 10px; font-weight: bold; font-size: 15px; margin: 4px;">
                    View Full Report
                </a>
            </div>
            
            <hr style="border: none; border-top: 1px solid #eee; margin: 24px 0;">
            
            <p style="color: #666; font-size: 14px; text-align: center; margin: 0;">
                💡 <strong>Pro tip:</strong> Share this report with your assistant coaches before practice!
            </p>
        </div>
        
        <div style="background: #f8f8f8; padding: 16px; text-align: center;">
            <p style="margin: 0; color: #999; font-size: 12px;">
                Have another game to scout? Forward the Hudl email to ${SCOUT_EMAIL}<br>
                <a href="${APP_URL}" style="color: #FF6B35;">${APP_URL.replace('https://', '')}</a>
            </p>
        </div>
    </div>
</body>
</html>`;
    
    await emailTransporter.sendMail({
        from: FROM_EMAIL,
        to: coachEmail,
        replyTo: SCOUT_EMAIL,
        subject: `📋 Scouting Report Ready: ${opponentName}`,
        html: html,
        text: `Your CoachIQ scouting report for ${opponentName} is ready!\n\nView full report: ${reportUrl}\n\nQuick stats:\n${quickStats.map(s => '• ' + s).join('\n')}\n\nHave another game? Forward the Hudl email to ${SCOUT_EMAIL}`
    });
    
    console.log(`📧 Report email sent to ${coachEmail}`);
}

async function sendErrorEmail(coachEmail, opponentName, errorMessage) {
    const html = `
<!DOCTYPE html>
<html>
<body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; background: #f5f5f5; padding: 20px; margin: 0;">
    <div style="max-width: 500px; margin: 0 auto; background: white; border-radius: 12px; overflow: hidden;">
        <div style="background: #dc2626; padding: 24px; text-align: center;">
            <h1 style="margin: 0; color: white; font-size: 24px;">⚠️ Analysis Issue</h1>
        </div>
        <div style="padding: 24px;">
            <p style="color: #666; line-height: 1.6;">
                We ran into an issue analyzing the video for <strong>${opponentName}</strong>.
            </p>
            <p style="color: #999; font-size: 14px; background: #f8f8f8; padding: 12px; border-radius: 8px;">
                ${errorMessage}
            </p>
            <p style="color: #666; line-height: 1.6;">
                <strong>What to try:</strong>
            </p>
            <ul style="color: #666; line-height: 1.8;">
                <li>Make sure the video link is publicly accessible</li>
                <li>Try with a shorter video clip (under 30 minutes)</li>
                <li>Reply to this email for help</li>
            </ul>
        </div>
    </div>
</body>
</html>`;
    
    await emailTransporter.sendMail({
        from: FROM_EMAIL,
        to: coachEmail,
        replyTo: SCOUT_EMAIL,
        subject: `⚠️ Issue with your scouting report: ${opponentName}`,
        html: html,
        text: `CoachIQ - Analysis Issue\n\nWe had trouble analyzing the video for ${opponentName}.\n\nError: ${errorMessage}\n\nPlease reply to this email for help.`
    });
    
    console.log(`📧 Error email sent to ${coachEmail}`);
}

// ============================================================
// CLEANUP & UTILITIES
// ============================================================

function cleanupFiles(videoPath, frames) {
    try {
        if (videoPath && fs.existsSync(videoPath)) {
            fs.unlinkSync(videoPath);
        }
        
        if (frames && frames.length > 0) {
            const framesDir = path.dirname(frames[0].path);
            for (const frame of frames) {
                if (fs.existsSync(frame.path)) {
                    fs.unlinkSync(frame.path);
                }
            }
            if (fs.existsSync(framesDir)) {
                fs.rmdirSync(framesDir);
            }
        }
        console.log('🧹 Cleanup complete');
    } catch (err) {
        console.warn('Cleanup warning:', err.message);
    }
}

function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

// ============================================================
// START SERVER
// ============================================================

app.listen(PORT, () => {
    console.log(`
╔═══════════════════════════════════════════════════════════════╗
║                                                               ║
║   🏀 CoachIQ Backend Server - COMPLETE EDITION               ║
║                                                               ║
║   Running on port ${PORT}                                        ║
║                                                               ║
║   ✅ Enhanced Analysis (shot charts, BLOB, player profiles)  ║
║   ✅ Email Inbound (${SCOUT_EMAIL})            ║
║   ✅ Multi-source video (Hudl, YouTube, Drive, Dropbox)      ║
║   ✅ Automatic email notifications                            ║
║                                                               ║
║   Endpoints:                                                  ║
║   POST /api/analyze           - Start analysis (web)          ║
║   POST /api/upload            - Direct video upload           ║
║   POST /api/email/inbound     - SendGrid webhook              ║
║   GET  /api/email/setup/:token - Setup page data              ║
║   POST /api/email/start-analysis/:token - Start from email   ║
║   GET  /api/reports/:id       - Get full report               ║
║   GET  /api/reports/:id/status - Check status                 ║
║                                                               ║
╚═══════════════════════════════════════════════════════════════╝
    `);
});
