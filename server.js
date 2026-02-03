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

// CORS - Allow requests from your frontend domains
app.use(cors({
  origin: [
    'https://coachiq.netlify.app',
    'https://coachiq.vercel.app', 
    'http://localhost:3000',
    'http://localhost:8080',
    'http://127.0.0.1:3000',
    /\.netlify\.app$/,
    /\.vercel\.app$/
  ],
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization']
}));

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
The opponent wears ${opponentColor} jerseys. Your team wears ${yourColor} jerseys.

CRITICAL: Analyze ONLY the ${opponentName} team in ${opponentColor} jerseys.

Timestamps: ${batch.map(f => f.timestamp).join(', ')}

For EACH frame, analyze and identify:

1. **Defense Type**: man-to-man, 2-3 zone, 3-2 zone, 1-3-1, 1-2-2 zone, full court press, half court trap, matchup zone, etc.
2. **Press Defense**: Are they applying full court pressure? (true/false)
3. **Offense Type**: pick and roll, motion offense, horns set, flex offense, isolation, fast break, triangle, princeton, etc.
4. **Ball Handler**: Jersey number of player with ball (e.g., "#23")
5. **Shot Attempt**: If a shot is taken, provide:
   - shooterJersey: Jersey number
   - shotType: "2pt", "3pt", "layup", "dunk", "free throw"
   - courtZone: "paint", "right wing", "left wing", "top of key", "right corner", "left corner", "right baseline", "left baseline"
   - x: Approximate x-coordinate on court (0-94 feet, 0=baseline, 47=half court, 94=opposite baseline)
   - y: Approximate y-coordinate on court (0-50 feet, 25=center)
   - made: true/false if you can determine
6. **Baseline Out of Bounds (BLOB)**: Is this a BLOB play? true/false
7. **Key Players Visible**: List up to 5 jersey numbers of ${opponentName} players visible in frame
8. **Pace**: "transition" or "half-court"

Return ONLY valid JSON (no markdown, no backticks):
{
  "frames": [
    {
      "defense": "man-to-man",
      "pressDefense": false,
      "offense": "pick and roll",
      "ballHandler": "#23",
      "shot": {
        "shooterJersey": "#23",
        "shotType": "3pt",
        "courtZone": "top of key",
        "x": 47,
        "y": 25,
        "made": true
      },
      "blobPlay": false,
      "visiblePlayers": ["#23", "#15", "#10", "#32", "#5"],
      "pace": "half-court"
    }
  ]
}

If no shot in frame, use: "shot": null`
      },
      ...batch.map(f => ({
        type: 'image',
        source: { type: 'base64', media_type: 'image/jpeg', data: f.base64 }
      }))
    ];
    
    try {
      const response = await anthropic.messages.create({
        model: 'claude-sonnet-4-20250514',
        max_tokens: 8192,
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
  const playerAppearances = {};
  const paceCounts = { transition: 0, 'half-court': 0 };
  const shotAttempts = [];
  let pressDefenseFrames = 0;
  let blobPlayFrames = 0;
  
  // Process all frame data
  frameResults.forEach(f => {
    // Defense tracking
    if (f.defense) {
      const defenseKey = f.defense.toLowerCase();
      defenseCounts[defenseKey] = (defenseCounts[defenseKey] || 0) + 1;
    }
    
    // Press defense tracking
    if (f.pressDefense === true) pressDefenseFrames++;
    
    // BLOB play tracking
    if (f.blobPlay === true) blobPlayFrames++;
    
    // Offense tracking
    if (f.offense) {
      const offenseKey = f.offense.toLowerCase();
      offenseCounts[offenseKey] = (offenseCounts[offenseKey] || 0) + 1;
    }
    
    // Ball handler tracking
    if (f.ballHandler) {
      playerCounts[f.ballHandler] = (playerCounts[f.ballHandler] || 0) + 1;
    }
    
    // Visible players tracking (for starting 5)
    if (f.visiblePlayers && Array.isArray(f.visiblePlayers)) {
      f.visiblePlayers.forEach(jersey => {
        playerAppearances[jersey] = (playerAppearances[jersey] || 0) + 1;
      });
    }
    
    // Pace tracking
    if (f.pace === 'transition' || f.pace === 'fast break') {
      paceCounts.transition++;
    } else {
      paceCounts['half-court']++;
    }
    
    // Shot tracking
    if (f.shot && f.shot.shooterJersey) {
      shotAttempts.push({
        ...f.shot,
        timestamp: f.timestamp
      });
    }
  });
  
  const total = frameResults.length || 1;
  
  // Sort data
  const sortedDefense = Object.entries(defenseCounts).sort((a, b) => b[1] - a[1]);
  const sortedOffense = Object.entries(offenseCounts).sort((a, b) => b[1] - a[1]).slice(0, 8);
  const sortedPlayers = Object.entries(playerCounts).sort((a, b) => b[1] - a[1]).slice(0, 5);
  const sortedAppearances = Object.entries(playerAppearances).sort((a, b) => b[1] - a[1]).slice(0, 5);
  
  // Calculate percentages
  const transitionPct = Math.round((paceCounts.transition / total) * 100);
  const pressPct = Math.round((pressDefenseFrames / total) * 100);
  const blobPct = Math.round((blobPlayFrames / total) * 100);
  
  // Generate shot chart data
  const shotChart = generateShotChartData(shotAttempts);
  
  // Generate starting 5 analysis
  const starting5 = generateStarting5Analysis(sortedAppearances, sortedPlayers, shotAttempts);
  
  // Generate practice plans
  const practicePlans = generatePracticePlans(sortedDefense, sortedOffense, pressPct, starting5);
  
  // Generate BLOB analysis
  const blobAnalysis = generateBLOBAnalysis(frameResults, blobPlayFrames, blobPct);
  
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
        name: name.charAt(0).toUpperCase() + name.slice(1).replace(/-/g, ' '),
        percentage: Math.round((count / total) * 100)
      })),
      pressDefense: {
        used: pressPct > 5,
        frequency: pressPct,
        description: pressPct > 30 ? 'Heavy press' : pressPct > 15 ? 'Moderate press' : pressPct > 5 ? 'Occasional press' : 'No press'
      }
    },
    
    offense: {
      topPlays: sortedOffense.map(([name, count]) => ({
        name: name.charAt(0).toUpperCase() + name.slice(1).replace(/-/g, ' '),
        percentage: Math.round((count / total) * 100)
      }))
    },
    
    keyPlayers: sortedPlayers.map(([jersey, count], idx) => ({
      jersey: jersey,
      ballHandlingPct: Math.round((count / total) * 100),
      role: idx === 0 ? 'Primary Ball Handler' : idx === 1 ? 'Secondary Ball Handler' : 'Ball Handler'
    })),
    
    starting5: starting5,
    
    shotChart: shotChart,
    
    pace: {
      transitionPct,
      halfCourtPct: 100 - transitionPct,
      rating: Math.round(50 + transitionPct * 0.5),
      description: transitionPct > 30 ? 'Up-tempo' : transitionPct > 15 ? 'Moderate' : 'Half-court oriented'
    },
    
    blobPlays: blobAnalysis,
    
    practicePlans: practicePlans,
    
    recommendations: {
      offensive: [
        sortedDefense[0]?.[0]?.includes('zone') ? 'Attack zone gaps with ball movement' : 'Use ball screens to create mismatches',
        pressPct > 15 ? 'Practice press break - they press frequently!' : 'Push pace in transition',
        'Exploit weak-side rebounding',
        sortedDefense[0]?.[0]?.includes('press') ? 'Quick outlets against pressure' : 'Look for pick and roll opportunities'
      ],
      defensive: [
        sortedPlayers[0] ? `Priority assignment: ${sortedPlayers[0][0]} (primary ball handler)` : 'Identify primary scorer early',
        shotChart.hotZones.length > 0 ? `Defend hot zones: ${shotChart.hotZones.join(', ')}` : 'Contest all perimeter shots',
        'Limit transition opportunities',
        starting5[0] ? `Watch for ${starting5[0].jersey} - ${starting5[0].tendency}` : 'Force weak hand drives'
      ],
      practice: practicePlans.priorities
    }
  };
}

function generateShotChartData(shotAttempts) {
  const zoneStats = {};
  const shotsByType = { '2pt': 0, '3pt': 0, 'layup': 0, 'dunk': 0 };
  const madeShots = [];
  const missedShots = [];
  
  shotAttempts.forEach(shot => {
    // Zone statistics
    const zone = shot.courtZone || 'unknown';
    if (!zoneStats[zone]) {
      zoneStats[zone] = { attempts: 0, made: 0 };
    }
    zoneStats[zone].attempts++;
    if (shot.made) zoneStats[zone].made++;
    
    // Shot type statistics
    if (shot.shotType && shotsByType.hasOwnProperty(shot.shotType)) {
      shotsByType[shot.shotType]++;
    }
    
    // Separate made/missed for visualization
    const shotPoint = {
      x: shot.x || 47,
      y: shot.y || 25,
      type: shot.shotType,
      shooter: shot.shooterJersey,
      zone: zone
    };
    
    if (shot.made) {
      madeShots.push(shotPoint);
    } else if (shot.made === false) {
      missedShots.push(shotPoint);
    }
  });
  
  // Calculate hot zones (>40% shooting)
  const hotZones = Object.entries(zoneStats)
    .filter(([zone, stats]) => stats.attempts >= 2 && (stats.made / stats.attempts) >= 0.4)
    .map(([zone]) => zone)
    .slice(0, 3);
  
  // Calculate cold zones (<30% shooting)
  const coldZones = Object.entries(zoneStats)
    .filter(([zone, stats]) => stats.attempts >= 2 && (stats.made / stats.attempts) < 0.3)
    .map(([zone]) => zone)
    .slice(0, 2);
  
  return {
    totalAttempts: shotAttempts.length,
    madeShots: madeShots,
    missedShots: missedShots,
    zoneStats: Object.entries(zoneStats).map(([zone, stats]) => ({
      zone: zone.charAt(0).toUpperCase() + zone.slice(1),
      attempts: stats.attempts,
      made: stats.made,
      percentage: stats.attempts > 0 ? Math.round((stats.made / stats.attempts) * 100) : 0
    })),
    shotDistribution: shotsByType,
    hotZones: hotZones,
    coldZones: coldZones
  };
}

function generateStarting5Analysis(appearances, ballHandlers, shotAttempts) {
  const starting5 = [];
  
  // Get top 5 most frequent players
  const top5 = appearances.slice(0, 5);
  
  top5.forEach(([jersey, appearanceCount], idx) => {
    // Find ball handling stats
    const ballHandlerEntry = ballHandlers.find(([j]) => j === jersey);
    const ballHandlingFreq = ballHandlerEntry ? ballHandlerEntry[1] : 0;
    
    // Find shooting stats
    const playerShots = shotAttempts.filter(s => s.shooterJersey === jersey);
    const shotsMade = playerShots.filter(s => s.made === true).length;
    const shotsAttempted = playerShots.length;
    
    // Determine role and tendency
    let role = 'Role Player';
    let tendency = 'Unknown role';
    let strengths = [];
    let weaknesses = [];
    
    if (idx === 0 && ballHandlingFreq > 10) {
      role = 'Point Guard / Primary Ball Handler';
      tendency = 'Initiates offense, controls tempo';
      strengths.push('Ball handling', 'Decision making');
      if (shotsAttempted < 3) weaknesses.push('Limited scoring attempts');
    } else if (ballHandlingFreq > 5) {
      role = 'Secondary Ball Handler / Wing';
      tendency = 'Versatile - handles and scores';
      strengths.push('Versatility');
    } else if (shotsAttempted >= 4) {
      role = 'Primary Scorer';
      tendency = 'Looks for scoring opportunities';
      strengths.push('Scoring volume');
      if (shotsMade / shotsAttempted < 0.4) {
        weaknesses.push('Shot selection');
      }
    } else if (shotsAttempted <= 1) {
      role = 'Interior / Post Player';
      tendency = 'Works inside, sets screens';
      strengths.push('Interior presence');
      weaknesses.push('Perimeter game limited');
    }
    
    // Shot tendencies
    const threePointers = playerShots.filter(s => s.shotType === '3pt').length;
    if (threePointers >= 2) {
      strengths.push('Three-point shooting');
    }
    
    const paintShots = playerShots.filter(s => 
      s.courtZone === 'paint' || s.shotType === 'layup' || s.shotType === 'dunk'
    ).length;
    if (paintShots >= 2) {
      strengths.push('Paint scoring');
    }
    
    starting5.push({
      jersey: jersey,
      role: role,
      tendency: tendency,
      strengths: strengths.length > 0 ? strengths : ['Solid fundamentals'],
      weaknesses: weaknesses.length > 0 ? weaknesses : ['None identified'],
      ballHandlingFreq: ballHandlingFreq,
      shotsAttempted: shotsAttempted,
      shotsMade: shotsMade,
      fieldGoalPct: shotsAttempted > 0 ? Math.round((shotsMade / shotsAttempted) * 100) : 0
    });
  });
  
  return starting5;
}

function generatePracticePlans(defenses, offenses, pressPct, starting5) {
  const plans = {
    priorities: [],
    drills: []
  };
  
  // Defense-based priorities
  const primaryDefense = defenses[0]?.[0] || '';
  if (primaryDefense.includes('zone')) {
    plans.priorities.push('Practice zone offense - ball movement and skip passes');
    plans.drills.push({
      name: 'Zone Attack Drill',
      duration: '15 min',
      description: 'Ball reversal, gap attacks, and skip passes against zone defense'
    });
  } else {
    plans.priorities.push('Practice screen continuity vs man defense');
    plans.drills.push({
      name: 'Ball Screen Series',
      duration: '15 min',
      description: 'Pick and roll, pick and pop, slip screens against man-to-man'
    });
  }
  
  // Press break practice
  if (pressPct > 15) {
    plans.priorities.push('CRITICAL: Practice press break - they press frequently!');
    plans.drills.push({
      name: 'Press Break',
      duration: '20 min',
      description: 'Full court press break with multiple outlets and safety valves'
    });
  }
  
  // Offense-based priorities
  const topOffense = offenses[0]?.[0] || '';
  if (topOffense.includes('pick') || topOffense.includes('screen')) {
    plans.priorities.push('Defend ball screens - hedge or switch based on matchups');
    plans.drills.push({
      name: 'Screen Defense',
      duration: '12 min',
      description: 'Hedge and recover or switch technique on ball screens'
    });
  }
  
  // Transition defense
  plans.priorities.push('Transition defense - get back and protect paint');
  plans.drills.push({
    name: 'Transition Defense',
    duration: '10 min',
    description: '3v2, 4v3 disadvantage situations, protect paint first'
  });
  
  // Player-specific
  if (starting5.length > 0 && starting5[0].jersey) {
    plans.priorities.push(`Assign best defender to ${starting5[0].jersey}`);
  }
  
  plans.drills.push({
    name: 'Closeout Drill',
    duration: '10 min',
    description: 'Sprint closeouts to shooters, force drives to help'
  });
  
  plans.drills.push({
    name: 'Shell Drill',
    duration: '15 min',
    description: 'Team defensive principles - help, recover, closeout, communicate'
  });
  
  return plans;
}

function generateBLOBAnalysis(frameResults, blobFrames, blobPct) {
  const blobPlays = frameResults.filter(f => f.blobPlay === true);
  
  return {
    frequency: blobPct,
    detected: blobFrames > 0,
    description: blobPct > 10 ? 'Frequently runs BLOB plays - scout their sets!' : 
                 blobPct > 5 ? 'Occasional BLOB plays' : 
                 'Limited BLOB play data',
    recommendation: blobFrames > 2 ? 
      'Practice BLOB defense - they have designed plays from baseline. Watch for back screens and lob opportunities.' :
      'Standard BLOB defense should suffice - no special sets detected.'
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
    const gray = '#666';
    
    // ===== PAGE 1: OVERVIEW =====
    // Header
    doc.rect(0, 0, 612, 100).fill(orange);
    doc.fillColor('white').fontSize(36).font('Helvetica-Bold').text('SCOUTING REPORT', 50, 28);
    doc.fontSize(20).font('Helvetica').text(analysis.opponent.toUpperCase(), 50, 68);
    
    let y = 120;
    
    // Stats box
    doc.rect(50, y, 512, 60).fill('#f5f5f5');
    doc.fontSize(20).font('Helvetica-Bold').fillColor(orange).text(analysis.framesAnalyzed.toString(), 80, y + 15);
    doc.fontSize(9).fillColor(gray).text('FRAMES', 80, y + 40);
    doc.fontSize(20).fillColor(orange).text(analysis.pace.rating.toString(), 200, y + 15);
    doc.fontSize(9).fillColor(gray).text('PACE', 200, y + 40);
    doc.fontSize(20).fillColor(orange).text(`${analysis.pace.transitionPct}%`, 320, y + 15);
    doc.fontSize(9).fillColor(gray).text('TRANSITION', 320, y + 40);
    doc.fontSize(20).fillColor(orange).text(`${analysis.shotChart?.totalAttempts || 0}`, 440, y + 15);
    doc.fontSize(9).fillColor(gray).text('SHOTS', 440, y + 40);
    
    y += 80;
    
    // Defense Section
    doc.fillColor(orange).fontSize(16).font('Helvetica-Bold').text('DEFENSIVE BREAKDOWN', 50, y);
    y += 25;
    doc.fillColor('#333').fontSize(12).font('Helvetica')
      .text(`Primary: ${analysis.defense.primary} (${analysis.defense.primaryPct}%)`, 50, y);
    
    if (analysis.defense.secondary) {
      y += 20;
      doc.text(`Secondary: ${analysis.defense.secondary} (${analysis.defense.secondaryPct}%)`, 50, y);
    }
    
    y += 25;
    
    // Press Defense Alert
    if (analysis.defense.pressDefense.used) {
      doc.rect(50, y, 512, 40).fill('#fff3cd');
      doc.fillColor('#856404').fontSize(12).font('Helvetica-Bold')
        .text(`⚠️ PRESS DEFENSE: ${analysis.defense.pressDefense.description}`, 60, y + 8);
      doc.fontSize(10).font('Helvetica')
        .text(`Frequency: ${analysis.defense.pressDefense.frequency}% of possessions`, 60, y + 24);
      y += 50;
    }
    
    y += 10;
    
    // Offense Section
    doc.fillColor(orange).fontSize(16).font('Helvetica-Bold').text('TOP OFFENSIVE PLAYS', 50, y);
    y += 25;
    analysis.offense.topPlays.slice(0, 5).forEach((play, i) => {
      doc.fillColor('#333').fontSize(12).font('Helvetica')
        .text(`${i + 1}. ${play.name} - ${play.percentage}%`, 50, y);
      y += 20;
    });
    
    y += 20;
    
    // Key Players Section
    doc.fillColor(orange).fontSize(16).font('Helvetica-Bold').text('KEY PLAYERS', 50, y);
    y += 25;
    analysis.keyPlayers.slice(0, 3).forEach(player => {
      doc.fillColor('#333').fontSize(12).font('Helvetica')
        .text(`${player.jersey} - ${player.role} (${player.ballHandlingPct}% ball handling)`, 50, y);
      y += 20;
    });
    
    // ===== PAGE 2: STARTING 5 ANALYSIS =====
    doc.addPage();
    y = 50;
    
    doc.rect(0, 0, 612, 60).fill('#1a1a2e');
    doc.fillColor('white').fontSize(24).font('Helvetica-Bold').text('STARTING 5 ANALYSIS', 50, 18);
    
    y = 80;
    
    if (analysis.starting5 && analysis.starting5.length > 0) {
      analysis.starting5.forEach((player, idx) => {
        if (y > 680) {
          doc.addPage();
          y = 50;
        }
        
        // Player card
        doc.rect(50, y, 512, 110).stroke('#ddd');
        
        // Jersey number in circle
        doc.circle(90, y + 35, 25).fill(orange);
        doc.fillColor('white').fontSize(18).font('Helvetica-Bold').text(player.jersey, 65, y + 24, { width: 50, align: 'center' });
        
        // Player info
        doc.fillColor('#333').fontSize(14).font('Helvetica-Bold').text(player.role, 130, y + 15);
        doc.fontSize(11).font('Helvetica').fillColor(gray).text(player.tendency, 130, y + 35);
        
        // Stats
        if (player.shotsAttempted > 0) {
          doc.fontSize(10).fillColor('#333')
            .text(`FG: ${player.shotsMade}/${player.shotsAttempted} (${player.fieldGoalPct}%)`, 130, y + 55);
        }
        
        // Strengths
        doc.fontSize(10).font('Helvetica-Bold').fillColor(accent).text('Strengths:', 130, y + 75);
        doc.font('Helvetica').fillColor('#333').text(player.strengths.join(', '), 195, y + 75);
        
        // Weaknesses
        doc.fontSize(10).font('Helvetica-Bold').fillColor('#ff6b6b').text('Weaknesses:', 130, y + 92);
        doc.font('Helvetica').fillColor('#333').text(player.weaknesses.join(', '), 205, y + 92);
        
        y += 120;
      });
    } else {
      doc.fillColor(gray).fontSize(12).text('No starting lineup data available', 50, y);
    }
    
    // ===== PAGE 3: SHOT CHART =====
    doc.addPage();
    y = 50;
    
    doc.rect(0, 0, 612, 60).fill('#1a1a2e');
    doc.fillColor('white').fontSize(24).font('Helvetica-Bold').text('SHOT CHART', 50, 18);
    
    y = 90;
    
    if (analysis.shotChart && analysis.shotChart.totalAttempts > 0) {
      // Draw simplified court
      const courtX = 100;
      const courtY = y;
      const courtWidth = 400;
      const courtHeight = 280;
      
      // Court outline
      doc.rect(courtX, courtY, courtWidth, courtHeight).stroke('#333');
      
      // Paint
      doc.rect(courtX + 150, courtY, 100, 120).stroke('#999');
      
      // Three point line (simplified arc)
      doc.circle(courtX + 200, courtY, 180).stroke('#999');
      
      // Free throw circle
      doc.circle(courtX + 200, courtY + 120, 50).stroke('#999');
      
      // Baseline
      doc.moveTo(courtX, courtY + courtHeight).lineTo(courtX + courtWidth, courtY + courtHeight).stroke('#333');
      
      // Plot made shots (green dots)
      if (analysis.shotChart.madeShots) {
        doc.fillColor('#00ff00').opacity(0.6);
        analysis.shotChart.madeShots.forEach(shot => {
          const plotX = courtX + (shot.x / 94) * courtWidth;
          const plotY = courtY + (shot.y / 50) * courtHeight;
          doc.circle(plotX, plotY, 4).fill();
        });
      }
      
      // Plot missed shots (red dots)
      if (analysis.shotChart.missedShots) {
        doc.fillColor('#ff0000').opacity(0.6);
        analysis.shotChart.missedShots.forEach(shot => {
          const plotX = courtX + (shot.x / 94) * courtWidth;
          const plotY = courtY + (shot.y / 50) * courtHeight;
          doc.circle(plotX, plotY, 4).fill();
        });
      }
      
      doc.opacity(1);
      
      // Legend
      y = courtY + courtHeight + 30;
      doc.fillColor('#00ff00').circle(120, y, 5).fill();
      doc.fillColor('#333').fontSize(10).text('Made shots', 135, y - 5);
      doc.fillColor('#ff0000').circle(220, y, 5).fill();
      doc.fillColor('#333').text('Missed shots', 235, y - 5);
      
      y += 30;
      
      // Hot zones
      if (analysis.shotChart.hotZones && analysis.shotChart.hotZones.length > 0) {
        doc.fillColor(orange).fontSize(14).font('Helvetica-Bold').text('🔥 HOT ZONES', 50, y);
        y += 20;
        analysis.shotChart.hotZones.forEach(zone => {
          doc.fillColor('#333').fontSize(11).font('Helvetica').text(`• ${zone}`, 60, y);
          y += 18;
        });
        y += 10;
      }
      
      // Zone statistics
      if (analysis.shotChart.zoneStats && analysis.shotChart.zoneStats.length > 0) {
        doc.fillColor(orange).fontSize(14).font('Helvetica-Bold').text('ZONE BREAKDOWN', 50, y);
        y += 20;
        
        analysis.shotChart.zoneStats.slice(0, 6).forEach(stat => {
          doc.fillColor('#333').fontSize(10).font('Helvetica')
            .text(`${stat.zone}: ${stat.made}/${stat.attempts} (${stat.percentage}%)`, 60, y);
          y += 18;
        });
      }
    } else {
      doc.fillColor(gray).fontSize(12).text('No shot data available', 50, y);
    }
    
    // ===== PAGE 4: GAME PLAN & PRACTICE =====
    doc.addPage();
    y = 50;
    
    doc.rect(0, 0, 612, 60).fill('#1a1a2e');
    doc.fillColor('white').fontSize(24).font('Helvetica-Bold').text('GAME PLAN', 50, 18);
    
    y = 80;
    
    // Offensive Keys
    doc.fillColor(orange).fontSize(16).font('Helvetica-Bold').text('OFFENSIVE KEYS', 50, y);
    y += 25;
    analysis.recommendations.offensive.forEach(rec => {
      doc.fillColor('#333').fontSize(12).font('Helvetica').text(`• ${rec}`, 60, y);
      y += 22;
    });
    
    y += 20;
    
    // Defensive Keys
    doc.fillColor(orange).fontSize(16).font('Helvetica-Bold').text('DEFENSIVE KEYS', 50, y);
    y += 25;
    analysis.recommendations.defensive.forEach(rec => {
      doc.fillColor('#333').fontSize(12).font('Helvetica').text(`• ${rec}`, 60, y);
      y += 22;
    });
    
    y += 20;
    
    // BLOB Defense
    if (analysis.blobPlays && analysis.blobPlays.detected) {
      doc.rect(50, y, 512, 60).fill('#fff3cd');
      doc.fillColor('#856404').fontSize(12).font('Helvetica-Bold')
        .text('⚠️ BASELINE OUT OF BOUNDS ALERT', 60, y + 10);
      doc.fontSize(10).font('Helvetica')
        .text(analysis.blobPlays.recommendation, 60, y + 28, { width: 490 });
      y += 70;
    }
    
    // Practice Plans
    if (analysis.practicePlans && analysis.practicePlans.drills) {
      doc.fillColor(orange).fontSize(16).font('Helvetica-Bold').text('PRACTICE PLAN', 50, y);
      y += 25;
      
      analysis.practicePlans.drills.forEach(drill => {
        if (y > 680) {
          doc.addPage();
          y = 50;
        }
        
        doc.fillColor('#333').fontSize(12).font('Helvetica-Bold').text(drill.name, 60, y);
        doc.fontSize(10).fillColor(gray).text(`Duration: ${drill.duration}`, 60, y + 16);
        doc.fontSize(10).fillColor('#333').font('Helvetica').text(drill.description, 60, y + 30, { width: 490 });
        y += 60;
      });
    }
    
    // Footer on all pages
    const pages = doc.bufferedPageRange();
    for (let i = 0; i < pages.count; i++) {
      doc.switchToPage(i);
      doc.fontSize(9).fillColor('#999')
        .text('Generated by CoachIQ - AI Basketball Scouting', 50, 750, { width: 512, align: 'center' });
      doc.fontSize(8).text(new Date().toLocaleDateString(), 50, 762, { width: 512, align: 'center' });
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
