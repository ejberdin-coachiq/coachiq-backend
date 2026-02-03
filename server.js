/**
 * CoachIQ Backend Server
 * 
 * Handles:
 * - Email inbound processing (SendGrid webhook)
 * - Video downloading (YouTube, Hudl, Google Drive)
 * - Frame extraction (ffmpeg)
 * - AI analysis (Claude)
 * - PDF report generation
 * - Email delivery
 */

const express = require('express');
const cors = require('cors');
const Anthropic = require('@anthropic-ai/sdk');
const sgMail = require('@sendgrid/mail');
const { simpleParser } = require('mailparser');
const PDFDocument = require('pdfkit');
const { exec } = require('child_process');
const { promisify } = require('util');
const fs = require('fs').promises;
const fsSync = require('fs');
const path = require('path');
const sharp = require('sharp');
const { v4: uuidv4 } = require('uuid');
const multer = require('multer');

const execAsync = promisify(exec);

// Initialize Express
const app = express();

// Middleware for different content types
app.use(cors());
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true, limit: '50mb' }));

// Multer for form data (SendGrid webhook)
const upload = multer();

// Initialize APIs
const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
sgMail.setApiKey(process.env.SENDGRID_API_KEY);

// In-memory storage (use a database like Supabase for production)
const reports = new Map();
const users = new Map();

// ============================================
// HEALTH CHECK
// ============================================
app.get('/health', (req, res) => {
  res.json({ 
    status: 'ok', 
    timestamp: new Date().toISOString(),
    service: 'CoachIQ Backend',
    version: '1.0.0'
  });
});

app.get('/', (req, res) => {
  res.json({ 
    message: 'CoachIQ API Server',
    endpoints: {
      health: '/health',
      emailInbound: '/api/email/inbound',
      analyze: '/api/analyze',
      reportStatus: '/api/reports/:id/status',
      report: '/api/reports/:id'
    }
  });
});

// ============================================
// EMAIL INBOUND WEBHOOK (SendGrid)
// ============================================
app.post('/api/email/inbound', upload.none(), async (req, res) => {
  console.log('📧 Received inbound email webhook');
  console.log('Content-Type:', req.headers['content-type']);
  
  try {
    let fromEmail, subject, body;
    
    // Handle different content types from SendGrid
    if (req.body.from || req.body.email) {
      // Form data from SendGrid
      fromEmail = req.body.from || '';
      subject = req.body.subject || '';
      body = req.body.text || req.body.html || req.body.email || '';
      
      // Extract email address if it contains name
      const emailMatch = fromEmail.match(/<([^>]+)>/) || fromEmail.match(/([^\s<]+@[^\s>]+)/);
      if (emailMatch) fromEmail = emailMatch[1];
    } else if (Buffer.isBuffer(req.body)) {
      // Raw MIME message
      const parsed = await simpleParser(req.body);
      fromEmail = parsed.from?.value?.[0]?.address || parsed.from?.text || '';
      subject = parsed.subject || '';
      body = parsed.text || parsed.html || '';
    } else {
      console.log('Request body:', JSON.stringify(req.body).substring(0, 500));
      return res.status(200).json({ status: 'unknown_format' });
    }
    
    console.log(`📧 From: ${fromEmail}`);
    console.log(`📧 Subject: ${subject}`);
    console.log(`📧 Body preview: ${body.substring(0, 200)}...`);
    
    // Extract video URL from email body
    const videoUrl = extractVideoUrl(body);
    
    if (!videoUrl) {
      console.log('❌ No video URL found in email');
      await sendEmail(fromEmail, '❌ CoachIQ: No Video Link Found', `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
          <div style="background: #FF6B35; padding: 20px; text-align: center;">
            <h1 style="color: white; margin: 0;">🏀 CoachIQ</h1>
          </div>
          <div style="padding: 30px; background: #f9f9f9;">
            <h2 style="color: #333;">No Video Link Found</h2>
            <p style="color: #666;">We couldn't find a video link in your email.</p>
            <p style="color: #666;">Please reply with a link from:</p>
            <ul style="color: #666;">
              <li><strong>YouTube</strong> - youtube.com/watch?v=...</li>
              <li><strong>Google Drive</strong> - drive.google.com/file/d/...</li>
              <li><strong>Hudl</strong> - hudl.com/video/...</li>
            </ul>
            <p style="color: #666;">Just paste the URL in your email body and we'll analyze it!</p>
          </div>
        </div>
      `);
      return res.status(200).json({ status: 'no_video_url' });
    }
    
    console.log(`🔗 Found video URL: ${videoUrl}`);
    
    // Create report
    const reportId = uuidv4();
    const opponentName = cleanOpponentName(subject);
    
    reports.set(reportId, {
      id: reportId,
      userEmail: fromEmail,
      opponentName,
      videoUrl,
      videoSource: detectVideoSource(videoUrl),
      status: 'queued',
      createdAt: new Date().toISOString()
    });
    
    // Track user
    if (!users.has(fromEmail)) {
      users.set(fromEmail, { email: fromEmail, reportCount: 0, reports: [] });
    }
    const user = users.get(fromEmail);
    user.reportCount++;
    user.reports.push({ 
      id: reportId, 
      opponentName, 
      status: 'queued', 
      videoSource: detectVideoSource(videoUrl),
      createdAt: new Date().toISOString() 
    });
    
    // Send confirmation email
    await sendEmail(fromEmail, `🏀 CoachIQ: Analyzing ${opponentName}`, `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
        <div style="background: #FF6B35; padding: 20px; text-align: center;">
          <h1 style="color: white; margin: 0;">🏀 CoachIQ</h1>
        </div>
        <div style="padding: 30px; background: #f9f9f9;">
          <h2 style="color: #333;">Analysis Started! 🎬</h2>
          <p style="color: #666; font-size: 16px;">
            We're analyzing the game film for <strong style="color: #FF6B35;">${opponentName}</strong>.
          </p>
          <div style="background: white; border-left: 4px solid #FF6B35; padding: 15px; margin: 20px 0;">
            <p style="margin: 0; color: #666;">
              ⏱️ <strong>Expected time:</strong> 5-15 minutes<br>
              📧 We'll email you the PDF report when ready!
            </p>
          </div>
          <p style="color: #999; font-size: 12px;">Report ID: ${reportId}</p>
        </div>
        <div style="background: #333; padding: 15px; text-align: center;">
          <p style="color: #999; font-size: 12px; margin: 0;">CoachIQ - AI Basketball Scouting</p>
        </div>
      </div>
    `);
    
    // Start async analysis (don't await - let it run in background)
    processVideoAnalysis(reportId).catch(err => {
      console.error('❌ Analysis error:', err);
    });
    
    res.status(200).json({ status: 'processing', reportId });
    
  } catch (error) {
    console.error('❌ Email webhook error:', error);
    res.status(200).json({ status: 'error', message: error.message });
  }
});

// ============================================
// DIRECT ANALYSIS ENDPOINT (Web Form)
// ============================================
app.post('/api/analyze', async (req, res) => {
  try {
    const { videoUrl, opponentName, opponentColor, yourTeamColor, userEmail } = req.body;
    
    if (!videoUrl) {
      return res.status(400).json({ error: 'Video URL is required' });
    }
    
    const reportId = uuidv4();
    
    reports.set(reportId, {
      id: reportId,
      userEmail: userEmail || null,
      opponentName: opponentName || 'Unknown Opponent',
      opponentColor: opponentColor || 'black',
      yourTeamColor: yourTeamColor || 'white',
      videoUrl,
      videoSource: detectVideoSource(videoUrl),
      status: 'queued',
      createdAt: new Date().toISOString()
    });
    
    // Track user
    if (userEmail) {
      if (!users.has(userEmail)) {
        users.set(userEmail, { email: userEmail, reportCount: 0, subscription: 'free', reports: [] });
      }
      const user = users.get(userEmail);
      user.reportCount++;
      user.reports.push({ 
        id: reportId, 
        opponentName, 
        status: 'queued',
        videoSource: detectVideoSource(videoUrl),
        createdAt: new Date().toISOString() 
      });
    }
    
    // Start async analysis
    processVideoAnalysis(reportId).catch(err => {
      console.error('❌ Analysis error:', err);
    });
    
    res.json({ reportId, status: 'processing' });
    
  } catch (error) {
    console.error('❌ Analyze error:', error);
    res.status(500).json({ error: error.message });
  }
});

// ============================================
// GET REPORT STATUS
// ============================================
app.get('/api/reports/:id/status', (req, res) => {
  const report = reports.get(req.params.id);
  if (!report) {
    return res.status(404).json({ error: 'Report not found' });
  }
  res.json({
    status: report.status,
    progress: report.progress || 'Processing...',
    error: report.error
  });
});

// ============================================
// GET FULL REPORT
// ============================================
app.get('/api/reports/:id', (req, res) => {
  const report = reports.get(req.params.id);
  if (!report) {
    return res.status(404).json({ error: 'Report not found' });
  }
  
  // Don't send the full PDF in JSON
  const { pdfBase64, ...reportData } = report;
  res.json(reportData);
});

// ============================================
// GET USER DATA (for dashboard)
// ============================================
app.get('/api/users/:email', (req, res) => {
  const email = decodeURIComponent(req.params.email);
  const user = users.get(email);
  
  if (!user) {
    return res.status(404).json({ error: 'User not found' });
  }
  
  // Get full report data for each report
  const reportsWithData = user.reports.map(r => {
    const fullReport = reports.get(r.id);
    return {
      id: r.id,
      opponentName: fullReport?.opponentName || r.opponentName,
      status: fullReport?.status || r.status,
      videoSource: fullReport?.videoSource || r.videoSource,
      createdAt: fullReport?.createdAt || r.createdAt
    };
  });
  
  res.json({
    email: user.email,
    reportCount: user.reportCount,
    subscription: user.subscription || 'free',
    reports: reportsWithData
  });
});

// ============================================
// VIDEO ANALYSIS PIPELINE
// ============================================
async function processVideoAnalysis(reportId) {
  const report = reports.get(reportId);
  if (!report) return;
  
  const tempDir = `/tmp/coachiq_${reportId}`;
  
  try {
    await fs.mkdir(tempDir, { recursive: true });
    
    // Step 1: Download video
    updateReport(reportId, 'downloading', '📥 Downloading video...');
    const videoPath = await downloadVideo(report.videoUrl, tempDir);
    
    // Step 2: Extract frames
    updateReport(reportId, 'extracting', '🎞️ Extracting key frames...');
    const frames = await extractFrames(videoPath, tempDir);
    
    // Step 3: Analyze with Claude
    updateReport(reportId, 'analyzing', '🤖 AI analyzing game film...');
    const analysis = await analyzeWithClaude(frames, report.opponentName);
    
    // Step 4: Generate report
    updateReport(reportId, 'generating', '📄 Generating scouting report...');
    report.analysis = analysis;
    
    // Step 5: Generate PDF
    const pdfPath = await generatePDF(report, tempDir);
    const pdfBuffer = await fs.readFile(pdfPath);
    report.pdfBase64 = pdfBuffer.toString('base64');
    
    // Step 6: Send email with PDF
    if (report.userEmail) {
      await sendReportEmail(report.userEmail, report.opponentName, pdfBuffer);
    }
    
    // Mark complete
    report.status = 'complete';
    report.progress = '✅ Report ready!';
    report.completedAt = new Date().toISOString();
    
    // Update user's report status
    if (report.userEmail && users.has(report.userEmail)) {
      const user = users.get(report.userEmail);
      const userReport = user.reports.find(r => r.id === reportId);
      if (userReport) userReport.status = 'complete';
    }
    
    console.log(`✅ Report complete: ${reportId}`);
    
  } catch (error) {
    console.error(`❌ Analysis failed for ${reportId}:`, error);
    report.status = 'failed';
    report.error = error.message;
    report.progress = '❌ Analysis failed';
    
    // Update user's report status
    if (report.userEmail && users.has(report.userEmail)) {
      const user = users.get(report.userEmail);
      const userReport = user.reports.find(r => r.id === reportId);
      if (userReport) userReport.status = 'failed';
    }
    
    // Notify user of failure
    if (report.userEmail) {
      await sendEmail(report.userEmail, '❌ CoachIQ: Analysis Failed', `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
          <div style="background: #FF6B35; padding: 20px; text-align: center;">
            <h1 style="color: white; margin: 0;">🏀 CoachIQ</h1>
          </div>
          <div style="padding: 30px; background: #f9f9f9;">
            <h2 style="color: #d32f2f;">Analysis Failed</h2>
            <p style="color: #666;">We encountered an error analyzing the video for <strong>${report.opponentName}</strong>.</p>
            <div style="background: #ffebee; border-left: 4px solid #d32f2f; padding: 15px; margin: 20px 0;">
              <p style="margin: 0; color: #666;"><strong>Error:</strong> ${error.message}</p>
            </div>
            <p style="color: #666;">Please try again with:</p>
            <ul style="color: #666;">
              <li>A shorter video (under 10 minutes works best)</li>
              <li>A different video source (YouTube is most reliable)</li>
              <li>Make sure the video is publicly accessible</li>
            </ul>
          </div>
        </div>
      `);
    }
  } finally {
    // Cleanup temp files
    try {
      await fs.rm(tempDir, { recursive: true, force: true });
    } catch (e) {
      console.log('Cleanup warning:', e.message);
    }
  }
}

function updateReport(reportId, status, progress) {
  const report = reports.get(reportId);
  if (report) {
    report.status = status;
    report.progress = progress;
    console.log(`📊 [${reportId.slice(0,8)}] ${progress}`);
  }
}

// ============================================
// VIDEO DOWNLOAD
// ============================================
async function downloadVideo(url, tempDir) {
  const outputPath = path.join(tempDir, 'video.mp4');
  const source = detectVideoSource(url);
  
  console.log(`📥 Downloading from ${source}...`);
  
  try {
    if (source === 'youtube') {
      // Use yt-dlp for YouTube
      await execAsync(
        `yt-dlp -f "best[height<=720][ext=mp4]/best[height<=720]/best" --no-playlist -o "${outputPath}" "${url}"`,
        { timeout: 600000 } // 10 minute timeout
      );
    } else if (source === 'google_drive') {
      // Use gdown for Google Drive
      const fileId = extractGoogleDriveId(url);
      if (!fileId) throw new Error('Could not extract Google Drive file ID');
      await execAsync(
        `gdown --id ${fileId} -O "${outputPath}"`,
        { timeout: 600000 }
      );
    } else if (source === 'hudl') {
      // Check if it's a Hudl download link with direct MP4 URL
      const directUrl = extractHudlDirectUrl(url);
      if (directUrl) {
        console.log(`📥 Found direct Hudl MP4 URL, downloading first 15 minutes...`);
        // Download with curl, limit to ~500MB or 15 minutes of video
        // Use ffmpeg to download only first 15 minutes
        await execAsync(
          `curl -L -o "${outputPath}" --max-filesize 2147483648 "${directUrl}"`,
          { timeout: 1200000 } // 20 minute timeout for large files
        );
      } else {
        // Try yt-dlp for regular Hudl video pages
        try {
          await execAsync(
            `yt-dlp -f "best[height<=720]" -o "${outputPath}" "${url}"`,
            { timeout: 600000 }
          );
        } catch (e) {
          throw new Error('Hudl video could not be downloaded. Please use the Hudl "Download" feature and share the download link, or upload to Google Drive.');
        }
      }
    } else if (source === 'direct_mp4') {
      // Direct MP4 URL
      console.log(`📥 Downloading direct MP4 URL...`);
      await execAsync(
        `curl -L -o "${outputPath}" --max-filesize 2147483648 "${url}"`,
        { timeout: 1200000 }
      );
    } else {
      // Generic attempt with yt-dlp
      await execAsync(
        `yt-dlp -f "best[height<=720]" -o "${outputPath}" "${url}"`,
        { timeout: 600000 }
      );
    }
    
    // Verify file exists and has content
    const stats = await fs.stat(outputPath);
    if (stats.size < 1000) {
      throw new Error('Downloaded file is too small - may be invalid');
    }
    
    const sizeMB = stats.size / 1024 / 1024;
    console.log(`✅ Downloaded: ${sizeMB.toFixed(1)} MB`);
    
    // If file is very large (>1GB), trim to first 15 minutes
    if (sizeMB > 1000) {
      console.log(`📏 Large file detected, trimming to first 15 minutes...`);
      const trimmedPath = path.join(tempDir, 'video_trimmed.mp4');
      await execAsync(
        `ffmpeg -i "${outputPath}" -t 900 -c copy "${trimmedPath}"`,
        { timeout: 300000 }
      );
      // Replace original with trimmed
      await fs.unlink(outputPath);
      await fs.rename(trimmedPath, outputPath);
      const newStats = await fs.stat(outputPath);
      console.log(`✅ Trimmed to: ${(newStats.size / 1024 / 1024).toFixed(1)} MB`);
    }
    
    return outputPath;
    
  } catch (error) {
    console.error('Download error:', error.message);
    throw new Error(`Failed to download video: ${error.message}`);
  }
}

/**
 * Extract direct MP4 URL from Hudl download/notification links
 */
function extractHudlDirectUrl(url) {
  // Check for forward parameter in Hudl notification links
  // Example: https://www.hudl.com/notifications-tracking/...?forward=https%3a%2f%2fvtemp.hudl.com%2f...%2f.mp4
  try {
    const urlObj = new URL(url);
    const forwardParam = urlObj.searchParams.get('forward');
    if (forwardParam) {
      const decodedUrl = decodeURIComponent(forwardParam);
      if (decodedUrl.includes('.mp4') || decodedUrl.includes('vtemp.hudl.com')) {
        return decodedUrl;
      }
    }
    
    // Check if URL itself is a direct vtemp link
    if (url.includes('vtemp.hudl.com') && url.includes('.mp4')) {
      return url;
    }
  } catch (e) {
    console.log('Could not parse Hudl URL:', e.message);
  }
  
  return null;
}

function detectVideoSource(url) {
  if (url.includes('youtube.com') || url.includes('youtu.be')) return 'youtube';
  if (url.includes('drive.google.com')) return 'google_drive';
  if (url.includes('hudl.com')) return 'hudl';
  if (url.includes('vimeo.com')) return 'vimeo';
  if (url.includes('vtemp.hudl.com')) return 'hudl';
  if (url.endsWith('.mp4') || url.includes('.mp4?')) return 'direct_mp4';
  return 'unknown';
}

function extractGoogleDriveId(url) {
  const patterns = [
    /\/file\/d\/([a-zA-Z0-9_-]+)/,
    /id=([a-zA-Z0-9_-]+)/,
    /\/d\/([a-zA-Z0-9_-]+)/,
    /open\?id=([a-zA-Z0-9_-]+)/
  ];
  for (const pattern of patterns) {
    const match = url.match(pattern);
    if (match) return match[1];
  }
  return null;
}

// ============================================
// FRAME EXTRACTION
// ============================================
async function extractFrames(videoPath, tempDir) {
  const framesDir = path.join(tempDir, 'frames');
  await fs.mkdir(framesDir, { recursive: true });
  
  // Get video duration first
  let duration = 300; // default 5 minutes
  try {
    const { stdout } = await execAsync(
      `ffprobe -v error -show_entries format=duration -of default=noprint_wrappers=1:nokey=1 "${videoPath}"`
    );
    duration = parseFloat(stdout) || 300;
  } catch (e) {
    console.log('Could not get duration, using default');
  }
  
  // Calculate frame interval (aim for ~30-40 frames)
  const targetFrames = 35;
  const interval = Math.max(5, Math.floor(duration / targetFrames));
  
  console.log(`🎞️ Video duration: ${Math.round(duration)}s, extracting frame every ${interval}s`);
  
  // Extract frames
  await execAsync(
    `ffmpeg -i "${videoPath}" -vf "fps=1/${interval}" -frames:v 40 -q:v 2 "${framesDir}/frame_%03d.jpg"`,
    { timeout: 120000 }
  );
  
  // Read and resize frames
  const files = await fs.readdir(framesDir);
  const frames = [];
  
  for (const file of files.sort()) {
    if (!file.endsWith('.jpg')) continue;
    
    const framePath = path.join(framesDir, file);
    const resized = await sharp(framePath)
      .resize(1024, 1024, { fit: 'inside' })
      .jpeg({ quality: 80 })
      .toBuffer();
    
    frames.push({
      filename: file,
      base64: resized.toString('base64')
    });
  }
  
  console.log(`✅ Extracted ${frames.length} frames`);
  return frames;
}

// ============================================
// CLAUDE AI ANALYSIS
// ============================================
async function analyzeWithClaude(frames, opponentName) {
  const batchSize = 8;
  const allResults = [];
  
  console.log(`🤖 Analyzing ${frames.length} frames in batches of ${batchSize}...`);
  
  for (let i = 0; i < frames.length; i += batchSize) {
    const batch = frames.slice(i, i + batchSize);
    const batchNum = Math.floor(i / batchSize) + 1;
    const totalBatches = Math.ceil(frames.length / batchSize);
    
    console.log(`🤖 Processing batch ${batchNum}/${totalBatches}...`);
    
    const content = [
      {
        type: 'text',
        text: `You are an expert basketball scout analyzing game film of "${opponentName}".

Analyze these ${batch.length} frames and for EACH frame identify:
1. Defensive formation (man-to-man, 2-3 zone, 3-2 zone, 1-3-1 zone, 1-2-2 press, full court press, etc.)
2. Offensive play/action being run (pick and roll, motion, horns, flex, isolation, fast break, etc.)
3. Ball handler jersey number if visible
4. Any shot attempt and location (paint, mid-range, 3-pointer, corner)
5. Pace (transition/fast break or half-court set)

Return ONLY valid JSON in this exact format:
{
  "frames": [
    {
      "defense": "man-to-man",
      "offense": "pick and roll",
      "ballHandler": "#23",
      "shot": {"location": "paint", "type": "layup"},
      "pace": "half-court",
      "notes": "double team on post"
    }
  ]
}`
      },
      ...batch.map(f => ({
        type: 'image',
        source: { type: 'base64', media_type: 'image/jpeg', data: f.base64 }
      }))
    ];
    
    try {
      const response = await anthropic.messages.create({
        model: 'claude-sonnet-4-20250514',
        max_tokens: 4096,
        messages: [{ role: 'user', content }]
      });
      
      const text = response.content[0].text;
      const jsonMatch = text.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        const parsed = JSON.parse(jsonMatch[0]);
        if (parsed.frames) allResults.push(...parsed.frames);
      }
    } catch (e) {
      console.error(`Batch ${batchNum} error:`, e.message);
    }
    
    // Rate limiting pause
    if (i + batchSize < frames.length) {
      await new Promise(r => setTimeout(r, 1000));
    }
  }
  
  console.log(`✅ Analyzed ${allResults.length} frames total`);
  
  // Generate summary report
  return generateAnalysisSummary(allResults, opponentName);
}

function generateAnalysisSummary(frameResults, opponentName) {
  // Count occurrences
  const defenseCounts = {};
  const offenseCounts = {};
  const playerCounts = {};
  const shotLocations = {};
  const paceCounts = { transition: 0, 'half-court': 0 };
  
  frameResults.forEach(f => {
    if (f.defense) {
      const def = f.defense.toLowerCase();
      defenseCounts[def] = (defenseCounts[def] || 0) + 1;
    }
    if (f.offense) {
      const off = f.offense.toLowerCase();
      offenseCounts[off] = (offenseCounts[off] || 0) + 1;
    }
    if (f.ballHandler) {
      playerCounts[f.ballHandler] = (playerCounts[f.ballHandler] || 0) + 1;
    }
    if (f.shot?.location) {
      shotLocations[f.shot.location] = (shotLocations[f.shot.location] || 0) + 1;
    }
    if (f.pace === 'transition' || f.pace === 'fast break') {
      paceCounts.transition++;
    } else {
      paceCounts['half-court']++;
    }
  });
  
  const total = frameResults.length || 1;
  
  // Sort and get top items
  const sortedDefense = Object.entries(defenseCounts).sort((a, b) => b[1] - a[1]);
  const sortedOffense = Object.entries(offenseCounts).sort((a, b) => b[1] - a[1]).slice(0, 6);
  const sortedPlayers = Object.entries(playerCounts).sort((a, b) => b[1] - a[1]).slice(0, 5);
  const sortedShots = Object.entries(shotLocations).sort((a, b) => b[1] - a[1]);
  
  // Calculate percentages
  const primaryDefense = sortedDefense[0]?.[0] || 'man-to-man';
  const primaryDefensePct = sortedDefense[0] ? Math.round((sortedDefense[0][1] / total) * 100) : 0;
  const secondaryDefense = sortedDefense[1]?.[0] || null;
  const secondaryDefensePct = sortedDefense[1] ? Math.round((sortedDefense[1][1] / total) * 100) : 0;
  
  const transitionPct = Math.round((paceCounts.transition / total) * 100);
  
  return {
    opponent: opponentName,
    framesAnalyzed: total,
    generatedAt: new Date().toISOString(),
    
    defense: {
      primary: primaryDefense,
      primaryPct: primaryDefensePct,
      secondary: secondaryDefense,
      secondaryPct: secondaryDefensePct,
      all: sortedDefense.map(([name, count]) => ({
        name: name.charAt(0).toUpperCase() + name.slice(1),
        percentage: Math.round((count / total) * 100)
      }))
    },
    
    offense: {
      topPlays: sortedOffense.map(([name, count]) => ({
        name: name.charAt(0).toUpperCase() + name.slice(1),
        percentage: Math.round((count / total) * 100)
      }))
    },
    
    keyPlayers: sortedPlayers.map(([name, count], idx) => ({
      jersey: name,
      ballHandlingPct: Math.round((count / total) * 100),
      role: idx === 0 ? 'Primary Ball Handler' : 'Secondary Handler'
    })),
    
    shotChart: sortedShots.map(([location, count]) => ({
      location,
      count,
      percentage: Math.round((count / total) * 100)
    })),
    
    pace: {
      transitionPct,
      halfCourtPct: 100 - transitionPct,
      rating: Math.round(50 + transitionPct * 0.5),
      description: transitionPct > 30 ? 'Up-tempo' : transitionPct > 15 ? 'Moderate' : 'Slow/Half-court'
    },
    
    recommendations: generateRecommendations(primaryDefense, secondaryDefense, sortedOffense, sortedPlayers, transitionPct)
  };
}

function generateRecommendations(primaryDef, secondaryDef, topPlays, topPlayers, transitionPct) {
  const offensive = [];
  const defensive = [];
  const practice = [];
  
  // Offensive recommendations (against their defense)
  if (primaryDef.includes('zone')) {
    offensive.push('Attack the gaps in their zone defense');
    offensive.push('Use ball movement to shift the zone');
    offensive.push('Look for high-low action against the zone');
    practice.push('Zone offense sets - attack the middle');
  } else {
    offensive.push('Use screens to create mismatches');
    offensive.push('Look for pick and roll opportunities');
    offensive.push('Attack closeouts after ball reversal');
    practice.push('Screen and roll continuity');
  }
  
  if (secondaryDef) {
    offensive.push(`Be ready for ${secondaryDef} as secondary look`);
  }
  
  if (transitionPct < 20) {
    offensive.push('Push pace - they prefer half-court defense');
    practice.push('Transition offense drills');
  }
  
  // Defensive recommendations (against their offense)
  if (topPlays.length > 0) {
    defensive.push(`Scout their top play: ${topPlays[0][0]}`);
  }
  
  if (topPlayers.length > 0) {
    defensive.push(`Key defensive assignment: ${topPlayers[0][0]}`);
    practice.push(`Deny ball to ${topPlayers[0][0]} in crunch time`);
  }
  
  defensive.push('Force them to their weak hand');
  defensive.push('Contest all shots without fouling');
  
  return { offensive, defensive, practice };
}

// ============================================
// PDF GENERATION
// ============================================
async function generatePDF(report, tempDir) {
  const pdfPath = path.join(tempDir, 'report.pdf');
  const analysis = report.analysis;
  
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ 
      size: 'LETTER', 
      margin: 50,
      bufferPages: true
    });
    
    const stream = fsSync.createWriteStream(pdfPath);
    doc.pipe(stream);
    
    // Colors
    const orange = '#FF6B35';
    const dark = '#1a1a2e';
    const accent = '#00D4AA';
    const gray = '#666666';
    
    // === PAGE 1: Header and Overview ===
    
    // Header bar
    doc.rect(0, 0, 612, 100).fill(orange);
    doc.fillColor('white')
       .fontSize(36)
       .font('Helvetica-Bold')
       .text('SCOUTING REPORT', 50, 28);
    doc.fontSize(20)
       .font('Helvetica')
       .text(analysis.opponent.toUpperCase(), 50, 68);
    
    // Date on right
    doc.fontSize(10)
       .text(`Generated: ${new Date().toLocaleDateString('en-US', { 
         month: 'long', day: 'numeric', year: 'numeric' 
       })}`, 400, 75, { align: 'right', width: 160 });
    
    let y = 120;
    
    // Quick Stats Box
    doc.rect(50, y, 512, 70).fill('#f5f5f5');
    
    const stats = [
      { label: 'FRAMES', value: analysis.framesAnalyzed.toString() },
      { label: 'PACE', value: analysis.pace.rating.toString() },
      { label: 'TRANSITION', value: `${analysis.pace.transitionPct}%` },
      { label: 'TEMPO', value: analysis.pace.description }
    ];
    
    stats.forEach((stat, i) => {
      const x = 70 + (i * 125);
      doc.fontSize(24)
         .font('Helvetica-Bold')
         .fillColor(orange)
         .text(stat.value, x, y + 15, { width: 110 });
      doc.fontSize(9)
         .font('Helvetica')
         .fillColor(gray)
         .text(stat.label, x, y + 45);
    });
    
    y += 90;
    
    // === DEFENSIVE BREAKDOWN ===
    doc.fillColor(orange).fontSize(18).font('Helvetica-Bold').text('DEFENSIVE BREAKDOWN', 50, y);
    y += 30;
    
    doc.fillColor(dark).fontSize(14).font('Helvetica-Bold');
    doc.text(`Primary: ${analysis.defense.primary}`, 50, y);
    doc.fillColor(gray).fontSize(12).font('Helvetica');
    doc.text(`${analysis.defense.primaryPct}% of possessions`, 250, y);
    y += 25;
    
    if (analysis.defense.secondary) {
      doc.fillColor(dark).fontSize(14).font('Helvetica-Bold');
      doc.text(`Secondary: ${analysis.defense.secondary}`, 50, y);
      doc.fillColor(gray).fontSize(12).font('Helvetica');
      doc.text(`${analysis.defense.secondaryPct}% of possessions`, 250, y);
      y += 25;
    }
    
    // Defense bar chart
    y += 10;
    analysis.defense.all.slice(0, 4).forEach(d => {
      doc.fontSize(11).fillColor(dark).text(d.name, 50, y, { width: 120 });
      
      // Bar background
      doc.rect(180, y + 2, 280, 14).fill('#e0e0e0');
      // Bar fill
      doc.rect(180, y + 2, 280 * (d.percentage / 100), 14).fill(accent);
      // Percentage
      doc.fillColor(dark).text(`${d.percentage}%`, 470, y);
      y += 24;
    });
    
    y += 20;
    
    // === TOP OFFENSIVE PLAYS ===
    doc.fillColor(orange).fontSize(18).font('Helvetica-Bold').text('TOP OFFENSIVE PLAYS', 50, y);
    y += 28;
    
    doc.fillColor(dark).fontSize(12).font('Helvetica');
    analysis.offense.topPlays.forEach((play, i) => {
      doc.font('Helvetica-Bold').text(`${i + 1}. ${play.name}`, 50, y);
      doc.font('Helvetica').fillColor(gray).text(`${play.percentage}%`, 300, y);
      y += 22;
    });
    
    y += 20;
    
    // === KEY PLAYERS ===
    doc.fillColor(orange).fontSize(18).font('Helvetica-Bold').text('KEY PLAYERS TO WATCH', 50, y);
    y += 28;
    
    analysis.keyPlayers.forEach(player => {
      doc.fillColor(dark).fontSize(13).font('Helvetica-Bold').text(player.jersey, 50, y);
      doc.font('Helvetica').fillColor(gray).fontSize(11)
         .text(`${player.role} • ${player.ballHandlingPct}% ball handling`, 100, y);
      y += 22;
    });
    
    // === PAGE 2: Recommendations ===
    doc.addPage();
    y = 50;
    
    // Game Plan Header
    doc.rect(0, 0, 612, 60).fill(dark);
    doc.fillColor('white').fontSize(24).font('Helvetica-Bold')
       .text('GAME PLAN RECOMMENDATIONS', 50, 18);
    
    y = 80;
    
    // Offensive Keys
    doc.fillColor(orange).fontSize(16).font('Helvetica-Bold')
       .text('OFFENSIVE KEYS', 50, y);
    doc.fontSize(11).fillColor(gray).font('Helvetica')
       .text('(Against their defense)', 200, y + 2);
    y += 28;
    
    doc.fillColor(dark).fontSize(12).font('Helvetica');
    analysis.recommendations.offensive.forEach(rec => {
      doc.text(`•  ${rec}`, 60, y, { width: 480 });
      y += 22;
    });
    
    y += 20;
    
    // Defensive Keys
    doc.fillColor(orange).fontSize(16).font('Helvetica-Bold')
       .text('DEFENSIVE KEYS', 50, y);
    doc.fontSize(11).fillColor(gray).font('Helvetica')
       .text('(Against their offense)', 200, y + 2);
    y += 28;
    
    doc.fillColor(dark).fontSize(12).font('Helvetica');
    analysis.recommendations.defensive.forEach(rec => {
      doc.text(`•  ${rec}`, 60, y, { width: 480 });
      y += 22;
    });
    
    y += 20;
    
    // Practice Focus
    doc.fillColor(orange).fontSize(16).font('Helvetica-Bold')
       .text('PRACTICE FOCUS', 50, y);
    y += 28;
    
    doc.fillColor(dark).fontSize(12).font('Helvetica');
    analysis.recommendations.practice.forEach(rec => {
      doc.text(`•  ${rec}`, 60, y, { width: 480 });
      y += 22;
    });
    
    // Footer on both pages
    const pages = doc.bufferedPageRange();
    for (let i = 0; i < pages.count; i++) {
      doc.switchToPage(i);
      doc.fontSize(9).fillColor('#999999');
      doc.text(
        'Generated by CoachIQ - AI Basketball Scouting • meetyournewstatscoach.com',
        50, 750, { width: 512, align: 'center' }
      );
    }
    
    doc.end();
    
    stream.on('finish', () => resolve(pdfPath));
    stream.on('error', reject);
  });
}

// ============================================
// EMAIL FUNCTIONS
// ============================================
async function sendEmail(to, subject, html) {
  try {
    const msg = {
      to,
      from: {
        email: process.env.FROM_EMAIL || process.env.SCOUT_EMAIL || 'scout@meetyournewstatscoach.com',
        name: 'CoachIQ'
      },
      subject,
      html
    };
    
    await sgMail.send(msg);
    console.log(`📧 Email sent to ${to}: ${subject}`);
  } catch (error) {
    console.error('📧 Email send error:', error.message);
    if (error.response) {
      console.error('SendGrid response:', error.response.body);
    }
  }
}

async function sendReportEmail(to, opponentName, pdfBuffer) {
  try {
    const msg = {
      to,
      from: {
        email: process.env.FROM_EMAIL || process.env.SCOUT_EMAIL || 'scout@meetyournewstatscoach.com',
        name: 'CoachIQ'
      },
      subject: `🏀 Your Scouting Report: ${opponentName}`,
      html: `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
          <div style="background: linear-gradient(135deg, #FF6B35, #FF8E53); padding: 30px; text-align: center; border-radius: 8px 8px 0 0;">
            <h1 style="color: white; margin: 0; font-size: 28px;">🏀 CoachIQ</h1>
            <p style="color: rgba(255,255,255,0.9); margin: 10px 0 0 0;">AI-Powered Scouting Reports</p>
          </div>
          <div style="padding: 30px; background: #f9f9f9;">
            <h2 style="color: #333; margin-top: 0;">Your Scouting Report is Ready! 📋</h2>
            <p style="color: #666; font-size: 16px; line-height: 1.6;">
              We've completed the analysis for <strong style="color: #FF6B35;">${opponentName}</strong>.
            </p>
            <div style="background: white; border: 1px solid #e0e0e0; border-radius: 8px; padding: 20px; margin: 20px 0;">
              <h3 style="color: #FF6B35; margin-top: 0; font-size: 16px;">📎 PDF Report Attached</h3>
              <p style="color: #666; margin-bottom: 0;">Open the attached PDF for your complete scouting report including:</p>
              <ul style="color: #666; margin: 10px 0;">
                <li>Defensive scheme breakdown</li>
                <li>Top offensive plays</li>
                <li>Key players to watch</li>
                <li>Game plan recommendations</li>
              </ul>
            </div>
            <hr style="border: none; border-top: 1px solid #e0e0e0; margin: 25px 0;">
            <p style="color: #999; font-size: 13px;">
              <strong>Need another report?</strong><br>
              Just reply to this email with a new video link!
            </p>
          </div>
          <div style="background: #1a1a2e; padding: 20px; text-align: center; border-radius: 0 0 8px 8px;">
            <p style="color: #999; font-size: 12px; margin: 0;">
              CoachIQ - AI Basketball Scouting<br>
              <a href="https://meetyournewstatscoach.com" style="color: #FF6B35;">meetyournewstatscoach.com</a>
            </p>
          </div>
        </div>
      `,
      attachments: [
        {
          content: pdfBuffer.toString('base64'),
          filename: `CoachIQ_Report_${opponentName.replace(/[^a-zA-Z0-9]/g, '_')}.pdf`,
          type: 'application/pdf',
          disposition: 'attachment'
        }
      ]
    };
    
    await sgMail.send(msg);
    console.log(`📧 Report sent to ${to}`);
  } catch (error) {
    console.error('📧 Report email error:', error.message);
    if (error.response) {
      console.error('SendGrid response:', error.response.body);
    }
    throw error;
  }
}

// ============================================
// HELPER FUNCTIONS
// ============================================
function extractVideoUrl(text) {
  // Clean up the text
  const cleanText = text.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ');
  
  const patterns = [
    // YouTube
    /https?:\/\/(?:www\.)?youtube\.com\/watch\?v=[\w-]+/gi,
    /https?:\/\/youtu\.be\/[\w-]+/gi,
    /https?:\/\/(?:www\.)?youtube\.com\/embed\/[\w-]+/gi,
    // Google Drive
    /https?:\/\/drive\.google\.com\/file\/d\/[\w-]+/gi,
    /https?:\/\/drive\.google\.com\/open\?id=[\w-]+/gi,
    // Hudl download/notification links (with forward parameter)
    /https?:\/\/(?:www\.)?hudl\.com\/notifications-tracking\/[^\s<>"]+/gi,
    // Hudl direct temp video links
    /https?:\/\/vtemp\.hudl\.com\/[^\s<>"]+\.mp4[^\s<>"]*/gi,
    // Regular Hudl video pages
    /https?:\/\/(?:www\.)?hudl\.com\/video\/[\w\/-]+/gi,
    /https?:\/\/(?:www\.)?hudl\.com\/v\/[\w]+/gi,
    // Direct MP4 links
    /https?:\/\/[^\s<>"]+\.mp4[^\s<>"]*/gi,
    // Generic URL as fallback
    /https?:\/\/[^\s<>"]+/gi
  ];
  
  for (const pattern of patterns) {
    const matches = cleanText.match(pattern);
    if (matches) {
      // Return the first video URL found
      for (const url of matches) {
        // Skip non-video URLs
        if (url.includes('unsubscribe') || url.includes('mailto:')) continue;
        if (url.includes('youtube') || url.includes('youtu.be') || 
            url.includes('hudl') || url.includes('drive.google') ||
            url.includes('vimeo') || url.includes('.mp4')) {
          return url.replace(/[.,;]$/, ''); // Remove trailing punctuation
        }
      }
    }
  }
  
  return null;
}

function cleanOpponentName(subject) {
  // Remove common prefixes and clean up
  let name = subject
    .replace(/^(re:|fwd?:|fw:)\s*/gi, '')
    .replace(/^scout(ing)?\s*(report)?:?\s*/gi, '')
    .replace(/^analyze:?\s*/gi, '')
    .replace(/^video:?\s*/gi, '')
    .trim();
  
  // Capitalize first letter of each word
  name = name.replace(/\b\w/g, l => l.toUpperCase());
  
  return name || 'Unknown Opponent';
}

// ============================================
// START SERVER
// ============================================
const PORT = process.env.PORT || 3001;
app.listen(PORT, '0.0.0.0', () => {
  console.log('');
  console.log('🏀 =====================================');
  console.log('🏀 CoachIQ Backend Server Started!');
  console.log('🏀 =====================================');
  console.log(`📍 Port: ${PORT}`);
  console.log(`📧 Scout Email: ${process.env.SCOUT_EMAIL || 'not set'}`);
  console.log(`🔑 Anthropic API: ${process.env.ANTHROPIC_API_KEY ? '✅ Set' : '❌ Missing'}`);
  console.log(`📬 SendGrid API: ${process.env.SENDGRID_API_KEY ? '✅ Set' : '❌ Missing'}`);
  console.log('');
});
