/**
 * CoachIQ Backend Server - File Upload Version
 * 
 * Features:
 * - Large file uploads (up to 10GB)
 * - Video compression
 * - Frame extraction
 * - Claude AI analysis
 * - PDF report generation
 * - User authentication
 */

const express = require('express');
const cors = require('cors');
const multer = require('multer');
const Anthropic = require('@anthropic-ai/sdk');
const PDFDocument = require('pdfkit');
const { exec } = require('child_process');
const { promisify } = require('util');
const fs = require('fs').promises;
const fsSync = require('fs');
const path = require('path');
const sharp = require('sharp');
const { v4: uuidv4 } = require('uuid');
const bcrypt = require('bcryptjs');

const execAsync = promisify(exec);

// Initialize Express
const app = express();

// CORS
app.use(cors());
app.use(express.json());

// Multer for file uploads (10GB max)
const storage = multer.diskStorage({
  destination: '/tmp/uploads',
  filename: (req, file, cb) => {
    cb(null, `${Date.now()}_${file.originalname}`);
  }
});

const upload = multer({
  storage,
  limits: { fileSize: 10 * 1024 * 1024 * 1024 } // 10GB
});

// Ensure upload directory exists
fs.mkdir('/tmp/uploads', { recursive: true }).catch(() => {});

// Initialize Anthropic
const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

// In-memory storage (replace with Supabase in production)
const users = new Map();
const reports = new Map();

// ============================================
// HEALTH CHECK
// ============================================
app.get('/health', (req, res) => {
  res.json({ 
    status: 'ok', 
    timestamp: new Date().toISOString(),
    service: 'CoachIQ Backend'
  });
});

app.get('/', (req, res) => {
  res.json({ 
    message: 'CoachIQ API Server',
    version: '2.0.0'
  });
});

// ============================================
// AUTHENTICATION
// ============================================
app.post('/api/auth/signup', async (req, res) => {
  try {
    const { email, password } = req.body;
    
    if (!email || !password) {
      return res.status(400).json({ error: 'Email and password required' });
    }
    
    if (users.has(email)) {
      return res.status(400).json({ error: 'User already exists' });
    }
    
    const hashedPassword = await bcrypt.hash(password, 10);
    
    const user = {
      id: uuidv4(),
      email,
      password: hashedPassword,
      subscription: 'free',
      reportsRemaining: 3,
      createdAt: new Date().toISOString()
    };
    
    users.set(email, user);
    
    res.json({ 
      user: { 
        id: user.id, 
        email: user.email, 
        subscription: user.subscription,
        reportsRemaining: user.reportsRemaining
      } 
    });
    
  } catch (error) {
    console.error('Signup error:', error);
    res.status(500).json({ error: 'Signup failed' });
  }
});

app.post('/api/auth/login', async (req, res) => {
  try {
    const { email, password } = req.body;
    
    const user = users.get(email);
    if (!user) {
      return res.status(401).json({ error: 'Invalid email or password' });
    }
    
    const validPassword = await bcrypt.compare(password, user.password);
    if (!validPassword) {
      return res.status(401).json({ error: 'Invalid email or password' });
    }
    
    res.json({ 
      user: { 
        id: user.id, 
        email: user.email, 
        subscription: user.subscription,
        reportsRemaining: user.reportsRemaining
      } 
    });
    
  } catch (error) {
    console.error('Login error:', error);
    res.status(500).json({ error: 'Login failed' });
  }
});

// ============================================
// FILE UPLOAD
// ============================================
app.post('/api/upload', upload.single('video'), async (req, res) => {
  console.log('📤 Received upload request');
  
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'No video file uploaded' });
    }
    
    const { opponentName, opponentColor, yourColor, userEmail } = req.body;
    
    console.log(`📤 File: ${req.file.originalname} (${formatFileSize(req.file.size)})`);
    console.log(`📤 Opponent: ${opponentName}`);
    
    const reportId = uuidv4();
    
    const report = {
      id: reportId,
      userEmail,
      opponentName: opponentName || 'Unknown Opponent',
      opponentColor: opponentColor || '#FF0000',
      yourColor: yourColor || '#0000FF',
      originalFile: req.file.path,
      originalSize: req.file.size,
      status: 'uploaded',
      progress: 'Video uploaded',
      createdAt: new Date().toISOString()
    };
    
    reports.set(reportId, report);
    
    // Start async processing
    processVideo(reportId).catch(err => {
      console.error('Processing error:', err);
    });
    
    res.json({ reportId, status: 'processing' });
    
  } catch (error) {
    console.error('Upload error:', error);
    res.status(500).json({ error: error.message });
  }
});

// ============================================
// VIDEO PROCESSING
// ============================================
async function processVideo(reportId) {
  const report = reports.get(reportId);
  if (!report) return;
  
  const tempDir = `/tmp/coachiq_${reportId}`;
  
  try {
    await fs.mkdir(tempDir, { recursive: true });
    
    // Step 1: Compress
    updateReport(reportId, 'compressing', '🗜️ Compressing video...');
    const compressedPath = await compressVideo(report.originalFile, tempDir);
    
    // Step 2: Extract frames
    updateReport(reportId, 'extracting', '🎞️ Extracting frames...');
    const frames = await extractFrames(compressedPath, tempDir);
    
    // Step 3: Analyze
    updateReport(reportId, 'analyzing', '🤖 AI analyzing...');
    const analysis = await analyzeWithClaude(frames, report.opponentName, report.opponentColor, report.yourColor);
    
    // Step 4: Generate PDF
    updateReport(reportId, 'generating', '📄 Generating report...');
    report.analysis = analysis;
    const pdfPath = await generatePDF(report, tempDir);
    const pdfBuffer = await fs.readFile(pdfPath);
    report.pdfBase64 = pdfBuffer.toString('base64');
    
    report.status = 'complete';
    report.progress = '✅ Report ready!';
    report.completedAt = new Date().toISOString();
    
    console.log(`✅ Report complete: ${reportId}`);
    
  } catch (error) {
    console.error(`❌ Failed ${reportId}:`, error);
    report.status = 'failed';
    report.error = error.message;
    
  } finally {
    try {
      await fs.rm(tempDir, { recursive: true, force: true });
      if (report.originalFile) {
        await fs.unlink(report.originalFile).catch(() => {});
      }
    } catch (e) {}
  }
}

function updateReport(reportId, status, progress) {
  const report = reports.get(reportId);
  if (report) {
    report.status = status;
    report.progress = progress;
    console.log(`📊 [${reportId.slice(0, 8)}] ${progress}`);
  }
}

// ============================================
// VIDEO COMPRESSION
// ============================================
async function compressVideo(inputPath, tempDir) {
  const outputPath = path.join(tempDir, 'compressed.mp4');
  const stats = await fs.stat(inputPath);
  const sizeMB = stats.size / 1024 / 1024;
  
  console.log(`📦 Original: ${formatFileSize(stats.size)}`);
  
  if (sizeMB > 500) {
    console.log('🗜️ Compressing...');
    await execAsync(
      `ffmpeg -i "${inputPath}" -vf "scale=-2:720" -c:v libx264 -preset fast -crf 28 -c:a aac -b:a 128k "${outputPath}"`,
      { timeout: 3600000 }
    );
    const newStats = await fs.stat(outputPath);
    console.log(`✅ Compressed to: ${formatFileSize(newStats.size)}`);
    return outputPath;
  }
  
  await fs.copyFile(inputPath, outputPath);
  return outputPath;
}

// ============================================
// FRAME EXTRACTION
// ============================================
async function extractFrames(videoPath, tempDir) {
  const framesDir = path.join(tempDir, 'frames');
  await fs.mkdir(framesDir, { recursive: true });
  
  let duration = 600;
  try {
    const { stdout } = await execAsync(
      `ffprobe -v error -show_entries format=duration -of default=noprint_wrappers=1:nokey=1 "${videoPath}"`
    );
    duration = parseFloat(stdout) || 600;
  } catch (e) {}
  
  const targetFrames = 40;
  const interval = Math.max(10, Math.floor(duration / targetFrames));
  
  console.log(`🎞️ Duration: ${Math.round(duration / 60)} min, extracting every ${interval}s`);
  
  await execAsync(
    `ffmpeg -i "${videoPath}" -vf "fps=1/${interval}" -frames:v ${targetFrames} -q:v 2 "${framesDir}/frame_%03d.jpg"`,
    { timeout: 300000 }
  );
  
  const files = await fs.readdir(framesDir);
  const frames = [];
  
  for (const file of files.sort()) {
    if (!file.endsWith('.jpg')) continue;
    
    const framePath = path.join(framesDir, file);
    const resized = await sharp(framePath)
      .resize(1024, 1024, { fit: 'inside' })
      .jpeg({ quality: 80 })
      .toBuffer();
    
    const frameNum = parseInt(file.match(/(\d+)/)[1]);
    const timestamp = (frameNum - 1) * interval;
    
    frames.push({
      filename: file,
      timestamp: `${Math.floor(timestamp / 60)}:${(timestamp % 60).toString().padStart(2, '0')}`,
      base64: resized.toString('base64')
    });
  }
  
  console.log(`✅ Extracted ${frames.length} frames`);
  return frames;
}

// ============================================
// CLAUDE AI ANALYSIS
// ============================================
async function analyzeWithClaude(frames, opponentName, opponentColor, yourColor) {
  const batchSize = 8;
  const allResults = [];
  
  console.log(`🤖 Analyzing ${frames.length} frames...`);
  
  for (let i = 0; i < frames.length; i += batchSize) {
    const batch = frames.slice(i, i + batchSize);
    const batchNum = Math.floor(i / batchSize) + 1;
    
    console.log(`🤖 Batch ${batchNum}/${Math.ceil(frames.length / batchSize)}...`);
    
    const content = [
      {
        type: 'text',
        text: `You are an expert basketball scout analyzing game film of "${opponentName}".
The opponent wears ${opponentColor} jerseys. Focus on that team.

Timestamps: ${batch.map(f => f.timestamp).join(', ')}

For EACH frame identify:
1. Defense (man-to-man, 2-3 zone, 3-2 zone, 1-3-1, press, etc.)
2. Offense (pick and roll, motion, horns, flex, isolation, fast break, etc.)
3. Ball handler jersey #
4. Shot location if any
5. Pace (transition or half-court)

Return ONLY JSON:
{
  "frames": [
    {"defense": "man-to-man", "offense": "pick and roll", "ballHandler": "#23", "shot": null, "pace": "half-court"}
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
        if (parsed.frames) {
          parsed.frames.forEach((f, idx) => {
            if (batch[idx]) f.timestamp = batch[idx].timestamp;
          });
          allResults.push(...parsed.frames);
        }
      }
    } catch (e) {
      console.error(`Batch ${batchNum} error:`, e.message);
    }
    
    if (i + batchSize < frames.length) {
      await new Promise(r => setTimeout(r, 1000));
    }
  }
  
  console.log(`✅ Analyzed ${allResults.length} frames`);
  return generateSummary(allResults, opponentName);
}

function generateSummary(frameResults, opponentName) {
  const defenseCounts = {};
  const offenseCounts = {};
  const playerCounts = {};
  const paceCounts = { transition: 0, 'half-court': 0 };
  
  frameResults.forEach(f => {
    if (f.defense) defenseCounts[f.defense.toLowerCase()] = (defenseCounts[f.defense.toLowerCase()] || 0) + 1;
    if (f.offense) offenseCounts[f.offense.toLowerCase()] = (offenseCounts[f.offense.toLowerCase()] || 0) + 1;
    if (f.ballHandler) playerCounts[f.ballHandler] = (playerCounts[f.ballHandler] || 0) + 1;
    if (f.pace === 'transition' || f.pace === 'fast break') paceCounts.transition++;
    else paceCounts['half-court']++;
  });
  
  const total = frameResults.length || 1;
  
  const sortedDefense = Object.entries(defenseCounts).sort((a, b) => b[1] - a[1]);
  const sortedOffense = Object.entries(offenseCounts).sort((a, b) => b[1] - a[1]).slice(0, 6);
  const sortedPlayers = Object.entries(playerCounts).sort((a, b) => b[1] - a[1]).slice(0, 5);
  
  const transitionPct = Math.round((paceCounts.transition / total) * 100);
  
  return {
    opponent: opponentName,
    framesAnalyzed: total,
    generatedAt: new Date().toISOString(),
    
    defense: {
      primary: sortedDefense[0]?.[0] || 'man-to-man',
      primaryPct: sortedDefense[0] ? Math.round((sortedDefense[0][1] / total) * 100) : 0,
      secondary: sortedDefense[1]?.[0] || null,
      secondaryPct: sortedDefense[1] ? Math.round((sortedDefense[1][1] / total) * 100) : 0,
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
    
    pace: {
      transitionPct,
      halfCourtPct: 100 - transitionPct,
      rating: Math.round(50 + transitionPct * 0.5),
      description: transitionPct > 30 ? 'Up-tempo' : transitionPct > 15 ? 'Moderate' : 'Half-court'
    },
    
    recommendations: {
      offensive: [
        sortedDefense[0]?.[0]?.includes('zone') ? 'Attack zone gaps' : 'Use screens for mismatches',
        'Push pace in transition',
        'Look for pick and roll opportunities'
      ],
      defensive: [
        sortedPlayers[0] ? `Key assignment: ${sortedPlayers[0][0]}` : 'Identify primary scorer',
        'Contest all shots',
        'Force weak hand'
      ],
      practice: [
        'Transition offense drills',
        sortedDefense[0]?.[0]?.includes('zone') ? 'Zone offense sets' : 'Screen continuity',
        'Defensive communication'
      ]
    }
  };
}

// ============================================
// PDF GENERATION
// ============================================
async function generatePDF(report, tempDir) {
  const pdfPath = path.join(tempDir, 'report.pdf');
  const analysis = report.analysis;
  
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ size: 'LETTER', margin: 50, bufferPages: true });
    const stream = fsSync.createWriteStream(pdfPath);
    doc.pipe(stream);
    
    const orange = '#FF6B35';
    const accent = '#00D4AA';
    
    // Header
    doc.rect(0, 0, 612, 100).fill(orange);
    doc.fillColor('white').fontSize(36).font('Helvetica-Bold').text('SCOUTING REPORT', 50, 28);
    doc.fontSize(20).font('Helvetica').text(analysis.opponent.toUpperCase(), 50, 68);
    
    let y = 120;
    
    // Stats box
    doc.rect(50, y, 512, 60).fill('#f5f5f5');
    doc.fontSize(20).font('Helvetica-Bold').fillColor(orange).text(analysis.framesAnalyzed.toString(), 80, y + 15);
    doc.fontSize(9).fillColor('#666').text('FRAMES', 80, y + 40);
    doc.fontSize(20).fillColor(orange).text(analysis.pace.rating.toString(), 200, y + 15);
    doc.fontSize(9).fillColor('#666').text('PACE', 200, y + 40);
    doc.fontSize(20).fillColor(orange).text(`${analysis.pace.transitionPct}%`, 320, y + 15);
    doc.fontSize(9).fillColor('#666').text('TRANSITION', 320, y + 40);
    
    y += 80;
    
    // Defense
    doc.fillColor(orange).fontSize(16).font('Helvetica-Bold').text('DEFENSIVE BREAKDOWN', 50, y);
    y += 25;
    doc.fillColor('#333').fontSize(12).font('Helvetica').text(`Primary: ${analysis.defense.primary} (${analysis.defense.primaryPct}%)`, 50, y);
    if (analysis.defense.secondary) {
      y += 20;
      doc.text(`Secondary: ${analysis.defense.secondary} (${analysis.defense.secondaryPct}%)`, 50, y);
    }
    
    y += 40;
    
    // Offense
    doc.fillColor(orange).fontSize(16).font('Helvetica-Bold').text('TOP OFFENSIVE PLAYS', 50, y);
    y += 25;
    analysis.offense.topPlays.forEach((play, i) => {
      doc.fillColor('#333').fontSize(12).font('Helvetica').text(`${i + 1}. ${play.name} - ${play.percentage}%`, 50, y);
      y += 20;
    });
    
    y += 20;
    
    // Players
    doc.fillColor(orange).fontSize(16).font('Helvetica-Bold').text('KEY PLAYERS', 50, y);
    y += 25;
    analysis.keyPlayers.forEach(player => {
      doc.fillColor('#333').fontSize(12).text(`${player.jersey} - ${player.role} (${player.ballHandlingPct}% ball handling)`, 50, y);
      y += 20;
    });
    
    // Page 2 - Recommendations
    doc.addPage();
    y = 50;
    
    doc.rect(0, 0, 612, 60).fill('#1a1a2e');
    doc.fillColor('white').fontSize(24).font('Helvetica-Bold').text('GAME PLAN', 50, 18);
    
    y = 80;
    
    doc.fillColor(orange).fontSize(16).font('Helvetica-Bold').text('OFFENSIVE KEYS', 50, y);
    y += 25;
    analysis.recommendations.offensive.forEach(rec => {
      doc.fillColor('#333').fontSize(12).font('Helvetica').text(`• ${rec}`, 60, y);
      y += 20;
    });
    
    y += 20;
    doc.fillColor(orange).fontSize(16).font('Helvetica-Bold').text('DEFENSIVE KEYS', 50, y);
    y += 25;
    analysis.recommendations.defensive.forEach(rec => {
      doc.fillColor('#333').fontSize(12).font('Helvetica').text(`• ${rec}`, 60, y);
      y += 20;
    });
    
    y += 20;
    doc.fillColor(orange).fontSize(16).font('Helvetica-Bold').text('PRACTICE FOCUS', 50, y);
    y += 25;
    analysis.recommendations.practice.forEach(rec => {
      doc.fillColor('#333').fontSize(12).font('Helvetica').text(`• ${rec}`, 60, y);
      y += 20;
    });
    
    // Footer
    const pages = doc.bufferedPageRange();
    for (let i = 0; i < pages.count; i++) {
      doc.switchToPage(i);
      doc.fontSize(9).fillColor('#999').text('Generated by CoachIQ', 50, 750, { width: 512, align: 'center' });
    }
    
    doc.end();
    stream.on('finish', () => resolve(pdfPath));
    stream.on('error', reject);
  });
}

// ============================================
// API ENDPOINTS
// ============================================
app.get('/api/reports/:id/status', (req, res) => {
  const report = reports.get(req.params.id);
  if (!report) return res.status(404).json({ error: 'Report not found' });
  res.json({ status: report.status, progress: report.progress, error: report.error });
});

app.get('/api/reports/:id', (req, res) => {
  const report = reports.get(req.params.id);
  if (!report) return res.status(404).json({ error: 'Report not found' });
  const { pdfBase64, originalFile, ...data } = report;
  res.json(data);
});

app.get('/api/reports/:id/pdf', (req, res) => {
  const report = reports.get(req.params.id);
  if (!report || !report.pdfBase64) return res.status(404).json({ error: 'PDF not available' });
  
  const pdfBuffer = Buffer.from(report.pdfBase64, 'base64');
  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader('Content-Disposition', `attachment; filename="CoachIQ_${report.opponentName.replace(/[^a-zA-Z0-9]/g, '_')}.pdf"`);
  res.send(pdfBuffer);
});

app.get('/api/users/:email/reports', (req, res) => {
  const email = decodeURIComponent(req.params.email);
  const user = users.get(email);
  
  const userReports = [];
  reports.forEach(report => {
    if (report.userEmail === email) {
      const { pdfBase64, originalFile, ...data } = report;
      userReports.push(data);
    }
  });
  
  userReports.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
  
  res.json({
    reports: userReports,
    subscription: user?.subscription || 'free',
    reportsRemaining: user?.reportsRemaining || 0
  });
});

function formatFileSize(bytes) {
  if (bytes >= 1073741824) return (bytes / 1073741824).toFixed(2) + ' GB';
  if (bytes >= 1048576) return (bytes / 1048576).toFixed(1) + ' MB';
  return (bytes / 1024).toFixed(1) + ' KB';
}

// ============================================
// START SERVER
// ============================================
const PORT = process.env.PORT || 3001;
app.listen(PORT, '0.0.0.0', () => {
  console.log('');
  console.log('🏀 =====================================');
  console.log('🏀 CoachIQ Backend Started!');
  console.log('🏀 =====================================');
  console.log(`📍 Port: ${PORT}`);
  console.log(`🔑 Anthropic: ${process.env.ANTHROPIC_API_KEY ? '✅' : '❌'}`);
  console.log('');
});
