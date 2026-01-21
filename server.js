// =============================================
// COACHIQ BACKEND SERVER
// =============================================

require('dotenv').config();
const express = require('express');
const cors = require('cors');
const multer = require('multer');
const { v4: uuidv4 } = require('uuid');
const { createClient } = require('@supabase/supabase-js');
const { S3Client, PutObjectCommand, GetObjectCommand, DeleteObjectCommand } = require('@aws-sdk/client-s3');
const Anthropic = require('@anthropic-ai/sdk');
const Stripe = require('stripe');
const ffmpeg = require('fluent-ffmpeg');
const sharp = require('sharp');
const fs = require('fs').promises;
const path = require('path');
const { Readable } = require('stream');

// =============================================
// CONFIGURATION
// =============================================

const app = express();
const PORT = process.env.PORT || 3001;

// Middleware
app.use(cors({
  origin: process.env.FRONTEND_URL || '*',
  credentials: true
}));
app.use(express.json());

// File upload config (50MB limit)
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 500 * 1024 * 1024 } // 500MB
});

// Initialize services
const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY
);

const r2 = new S3Client({
  region: 'auto',
  endpoint: process.env.R2_ENDPOINT,
  credentials: {
    accessKeyId: process.env.R2_ACCESS_KEY_ID,
    secretAccessKey: process.env.R2_SECRET_ACCESS_KEY,
  },
});

const anthropic = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY,
});

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);

// =============================================
// HELPER FUNCTIONS
// =============================================

// Verify user token and get user
async function authenticateUser(req) {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    throw new Error('No token provided');
  }
  
  const token = authHeader.split(' ')[1];
  const { data: { user }, error } = await supabase.auth.getUser(token);
  
  if (error || !user) {
    throw new Error('Invalid token');
  }
  
  return user;
}

// Check if user can analyze (has reports remaining)
async function canUserAnalyze(userId) {
  const { data: profile } = await supabase
    .from('profiles')
    .select('reports_used, reports_limit, subscription_status')
    .eq('id', userId)
    .single();
    
  if (!profile) return { allowed: false, reason: 'Profile not found' };
  
  if (profile.subscription_status === 'active') {
    return { allowed: true, remaining: 'unlimited' };
  }
  
  if (profile.reports_used >= profile.reports_limit) {
    return { allowed: false, reason: 'Free trial limit reached', remaining: 0 };
  }
  
  return { allowed: true, remaining: profile.reports_limit - profile.reports_used };
}

// =============================================
// ROUTES
// =============================================

// Health check
app.get('/', (req, res) => {
  res.json({ status: 'ok', message: 'CoachIQ API is running 🏀' });
});

// Get current user profile
app.get('/api/profile', async (req, res) => {
  try {
    const user = await authenticateUser(req);
    
    const { data: profile, error } = await supabase
      .from('profiles')
      .select('*')
      .eq('id', user.id)
      .single();
      
    if (error) throw error;
    
    res.json(profile);
  } catch (error) {
    res.status(401).json({ error: error.message });
  }
});

// Upload video
app.post('/api/videos/upload', upload.single('video'), async (req, res) => {
  try {
    const user = await authenticateUser(req);
    const file = req.file;
    
    if (!file) {
      return res.status(400).json({ error: 'No video file provided' });
    }
    
    // Check file type
    if (!file.mimetype.startsWith('video/')) {
      return res.status(400).json({ error: 'File must be a video' });
    }
    
    // Generate unique file key
    const fileExtension = path.extname(file.originalname) || '.mp4';
    const fileKey = `${user.id}/${uuidv4()}${fileExtension}`;
    
    // Upload to R2
    await r2.send(new PutObjectCommand({
      Bucket: process.env.R2_BUCKET_NAME,
      Key: fileKey,
      Body: file.buffer,
      ContentType: file.mimetype,
    }));
    
    // Determine expiration based on subscription
    const { data: profile } = await supabase
      .from('profiles')
      .select('subscription_status')
      .eq('id', user.id)
      .single();
    
    const daysToKeep = profile?.subscription_status === 'active' ? 30 : 1;
    const expiresAt = new Date();
    expiresAt.setDate(expiresAt.getDate() + daysToKeep);
    
    // Save to database
    const { data: video, error } = await supabase
      .from('videos')
      .insert({
        user_id: user.id,
        file_name: file.originalname,
        file_key: fileKey,
        file_size: file.size,
        status: 'uploaded',
        expires_at: expiresAt.toISOString(),
      })
      .select()
      .single();
      
    if (error) throw error;
    
    res.json({ 
      success: true, 
      video,
      message: 'Video uploaded successfully' 
    });
    
  } catch (error) {
    console.error('Upload error:', error);
    res.status(500).json({ error: error.message });
  }
});

// Get user's videos
app.get('/api/videos', async (req, res) => {
  try {
    const user = await authenticateUser(req);
    
    const { data: videos, error } = await supabase
      .from('videos')
      .select('*')
      .eq('user_id', user.id)
      .order('created_at', { ascending: false });
      
    if (error) throw error;
    
    res.json(videos);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Start video analysis
app.post('/api/analyze', async (req, res) => {
  try {
    const user = await authenticateUser(req);
    const { videoId, opponentName, gameDate, options } = req.body;
    
    // Check if user can analyze
    const canAnalyze = await canUserAnalyze(user.id);
    if (!canAnalyze.allowed) {
      return res.status(403).json({ 
        error: canAnalyze.reason,
        upgradeRequired: true 
      });
    }
    
    // Get video
    const { data: video, error: videoError } = await supabase
      .from('videos')
      .select('*')
      .eq('id', videoId)
      .eq('user_id', user.id)
      .single();
      
    if (videoError || !video) {
      return res.status(404).json({ error: 'Video not found' });
    }
    
    // Create report record
    const { data: report, error: reportError } = await supabase
      .from('reports')
      .insert({
        user_id: user.id,
        video_id: videoId,
        opponent_name: opponentName,
        game_date: gameDate,
        status: 'processing',
      })
      .select()
      .single();
      
    if (reportError) throw reportError;
    
    // Update video status
    await supabase
      .from('videos')
      .update({ 
        status: 'processing',
        opponent_name: opponentName,
        game_date: gameDate 
      })
      .eq('id', videoId);
    
    // Start background processing (don't await - let it run async)
    processVideoAnalysis(report.id, video, opponentName, options || [])
      .catch(err => console.error('Analysis error:', err));
    
    res.json({ 
      success: true,
      reportId: report.id,
      message: 'Analysis started. This will take 2-5 minutes.' 
    });
    
  } catch (error) {
    console.error('Analyze error:', error);
    res.status(500).json({ error: error.message });
  }
});

// Get report status
app.get('/api/reports/:id', async (req, res) => {
  try {
    const user = await authenticateUser(req);
    
    const { data: report, error } = await supabase
      .from('reports')
      .select('*')
      .eq('id', req.params.id)
      .eq('user_id', user.id)
      .single();
      
    if (error) throw error;
    
    res.json(report);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Get all reports
app.get('/api/reports', async (req, res) => {
  try {
    const user = await authenticateUser(req);
    
    const { data: reports, error } = await supabase
      .from('reports')
      .select('*')
      .eq('user_id', user.id)
      .order('created_at', { ascending: false });
      
    if (error) throw error;
    
    res.json(reports);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Stripe webhook
app.post('/api/webhooks/stripe', express.raw({ type: 'application/json' }), async (req, res) => {
  const sig = req.headers['stripe-signature'];
  
  try {
    const event = stripe.webhooks.constructEvent(
      req.body,
      sig,
      process.env.STRIPE_WEBHOOK_SECRET
    );
    
    if (event.type === 'checkout.session.completed') {
      const session = event.data.object;
      const userId = session.client_reference_id;
      
      // Update user to active subscription
      await supabase
        .from('profiles')
        .update({
          subscription_status: 'active',
          subscription_tier: 'monthly',
          stripe_customer_id: session.customer,
        })
        .eq('id', userId);
        
      console.log(`✅ Activated subscription for user ${userId}`);
    }
    
    if (event.type === 'customer.subscription.deleted') {
      const subscription = event.data.object;
      
      // Find user by Stripe customer ID and deactivate
      await supabase
        .from('profiles')
        .update({
          subscription_status: 'cancelled',
        })
        .eq('stripe_customer_id', subscription.customer);
        
      console.log(`❌ Cancelled subscription for customer ${subscription.customer}`);
    }
    
    res.json({ received: true });
  } catch (error) {
    console.error('Webhook error:', error);
    res.status(400).send(`Webhook Error: ${error.message}`);
  }
});

// Create checkout session
app.post('/api/create-checkout', async (req, res) => {
  try {
    const user = await authenticateUser(req);
    const { priceId } = req.body;
    
    const session = await stripe.checkout.sessions.create({
      mode: 'subscription',
      payment_method_types: ['card'],
      line_items: [{
        price: priceId || process.env.STRIPE_PRICE_ID,
        quantity: 1,
      }],
      success_url: `${process.env.FRONTEND_URL}/dashboard?success=true`,
      cancel_url: `${process.env.FRONTEND_URL}/pricing?cancelled=true`,
      client_reference_id: user.id,
    });
    
    res.json({ url: session.url });
  } catch (error) {
    console.error('Checkout error:', error);
    res.status(500).json({ error: error.message });
  }
});

// =============================================
// VIDEO PROCESSING (Background)
// =============================================

async function processVideoAnalysis(reportId, video, opponentName, options) {
  const startTime = Date.now();
  const tempDir = path.join('/tmp', `analysis_${reportId}`);
  
  try {
    console.log(`🏀 Starting analysis for report ${reportId}`);
    
    // Create temp directory
    await fs.mkdir(tempDir, { recursive: true });
    
    // Download video from R2
    console.log('📥 Downloading video...');
    const { Body } = await r2.send(new GetObjectCommand({
      Bucket: process.env.R2_BUCKET_NAME,
      Key: video.file_key,
    }));
    
    const videoPath = path.join(tempDir, 'video.mp4');
    const chunks = [];
    for await (const chunk of Body) {
      chunks.push(chunk);
    }
    await fs.writeFile(videoPath, Buffer.concat(chunks));
    
    // Extract frames
    console.log('🎬 Extracting frames...');
    const framesDir = path.join(tempDir, 'frames');
    await fs.mkdir(framesDir, { recursive: true });
    
    await new Promise((resolve, reject) => {
      ffmpeg(videoPath)
        .outputOptions([
          '-vf', 'fps=1/10',  // 1 frame every 10 seconds
          '-frames:v', '60',   // Max 60 frames
          '-q:v', '2'
        ])
        .output(path.join(framesDir, 'frame_%03d.jpg'))
        .on('end', resolve)
        .on('error', reject)
        .run();
    });
    
    // Read frames
    const frameFiles = await fs.readdir(framesDir);
    const frames = [];
    
    for (const file of frameFiles.sort()) {
      if (file.endsWith('.jpg')) {
        const framePath = path.join(framesDir, file);
        let frameData = await fs.readFile(framePath);
        
        // Resize to max 1024px for API
        frameData = await sharp(frameData)
          .resize(1024, 1024, { fit: 'inside' })
          .jpeg({ quality: 85 })
          .toBuffer();
          
        frames.push(frameData.toString('base64'));
      }
    }
    
    console.log(`📸 Extracted ${frames.length} frames`);
    
    // Analyze with Claude
    console.log('🤖 Analyzing with AI...');
    const analysis = await analyzeFrames(frames, opponentName);
    
    // Generate report
    const reportData = generateReportData(analysis, opponentName);
    
    // Update report in database
    const processingTime = Math.round((Date.now() - startTime) / 1000);
    
    await supabase
      .from('reports')
      .update({
        status: 'complete',
        report_data: reportData,
        frames_analyzed: frames.length,
        processing_time_seconds: processingTime,
      })
      .eq('id', reportId);
    
    // Update video status
    await supabase
      .from('videos')
      .update({ status: 'analyzed' })
      .eq('id', video.id);
    
    // Increment user's reports_used
    await supabase.rpc('increment_reports_used', { user_id: video.user_id });
    
    console.log(`✅ Analysis complete in ${processingTime}s`);
    
  } catch (error) {
    console.error('❌ Processing error:', error);
    
    await supabase
      .from('reports')
      .update({
        status: 'failed',
        report_data: { error: error.message },
      })
      .eq('id', reportId);
      
    await supabase
      .from('videos')
      .update({ status: 'failed', error_message: error.message })
      .eq('id', video.id);
      
  } finally {
    // Cleanup temp files
    await fs.rm(tempDir, { recursive: true, force: true }).catch(() => {});
  }
}

async function analyzeFrames(frames, opponentName) {
  const results = {
    defensiveSets: {},
    offensivePlays: {},
    keyPlayers: {},
    paceReadings: [],
    rawFrames: [],
  };
  
  // Process in batches of 8
  const batchSize = 8;
  
  for (let i = 0; i < frames.length; i += batchSize) {
    const batch = frames.slice(i, i + batchSize);
    
    try {
      const response = await anthropic.messages.create({
        model: 'claude-sonnet-4-20250514',
        max_tokens: 2048,
        messages: [{
          role: 'user',
          content: [
            {
              type: 'text',
              text: `Analyze these basketball game frames of ${opponentName}. For each frame identify:
1. Defensive set (man-to-man, 2-3 zone, 3-2 zone, 1-3-1 zone, press, or unknown)
2. Offensive play (Pick & Roll, Horns, Motion, Flex, Isolation, Post-up, Transition)
3. Ball handler (jersey number if visible)
4. Pace (transition, early-offense, half-court)

Return JSON: { "frames": [{ "defense": "", "offense": "", "ballHandler": "", "pace": "" }] }`
            },
            ...batch.map(b64 => ({
              type: 'image',
              source: { type: 'base64', media_type: 'image/jpeg', data: b64 }
            }))
          ]
        }]
      });
      
      const text = response.content[0].text;
      const jsonMatch = text.match(/\{[\s\S]*\}/);
      
      if (jsonMatch) {
        const parsed = JSON.parse(jsonMatch[0]);
        if (parsed.frames) {
          parsed.frames.forEach(f => {
            results.rawFrames.push(f);
            if (f.defense) results.defensiveSets[f.defense] = (results.defensiveSets[f.defense] || 0) + 1;
            if (f.offense) results.offensivePlays[f.offense] = (results.offensivePlays[f.offense] || 0) + 1;
            if (f.ballHandler) results.keyPlayers[f.ballHandler] = (results.keyPlayers[f.ballHandler] || 0) + 1;
            if (f.pace) results.paceReadings.push(f.pace);
          });
        }
      }
      
      // Small delay between batches
      await new Promise(r => setTimeout(r, 500));
      
    } catch (error) {
      console.error(`Batch ${i} error:`, error.message);
    }
  }
  
  return results;
}

function generateReportData(analysis, opponentName) {
  const total = analysis.rawFrames.length || 1;
  
  const toPercentageArray = (obj) => Object.entries(obj)
    .map(([name, count]) => ({ name, count, percentage: Math.round((count / total) * 100) }))
    .sort((a, b) => b.count - a.count);
  
  const defenseBreakdown = toPercentageArray(analysis.defensiveSets);
  const offenseBreakdown = toPercentageArray(analysis.offensivePlays);
  const keyPlayers = toPercentageArray(analysis.keyPlayers).slice(0, 5);
  
  // Calculate primary pace
  const paceCounts = {};
  analysis.paceReadings.forEach(p => paceCounts[p] = (paceCounts[p] || 0) + 1);
  const primaryPace = Object.entries(paceCounts).sort((a, b) => b[1] - a[1])[0]?.[0] || 'Unknown';
  
  return {
    opponent: opponentName,
    summary: {
      framesAnalyzed: total,
      primaryDefense: defenseBreakdown[0]?.name || 'Unknown',
      primaryDefensePercentage: defenseBreakdown[0]?.percentage || 0,
      primaryOffense: offenseBreakdown[0]?.name || 'Unknown',
      pace: primaryPace,
    },
    defense: {
      primary: defenseBreakdown[0]?.name || 'Unknown',
      breakdown: defenseBreakdown,
    },
    offense: {
      topPlays: offenseBreakdown.slice(0, 5),
    },
    keyPlayers,
    recommendations: {
      offensive: [
        `Attack their ${defenseBreakdown[0]?.name || 'defense'} with quick ball movement`,
        defenseBreakdown.some(d => d.name.includes('zone')) ? 'Use zone offense principles - attack gaps' : 'Set solid screens for your ball handlers',
        'Push pace in transition when possible',
      ],
      defensive: [
        `Prepare for ${offenseBreakdown[0]?.name || 'their offense'}`,
        keyPlayers[0] ? `Key matchup: Guard #${keyPlayers[0].name} (${keyPlayers[0].percentage}% ball handling)` : 'Identify their primary ball handler',
        'Contest shots and limit second chances',
      ],
      practice: [
        `Drill: ${defenseBreakdown[0]?.name || 'Man'} offense recognition`,
        `Drill: Defending ${offenseBreakdown[0]?.name || 'Pick & Roll'}`,
        'Conditioning for pace of play',
      ],
    },
    generatedAt: new Date().toISOString(),
  };
}

// =============================================
// START SERVER
// =============================================

app.listen(PORT, () => {
  console.log(`🏀 CoachIQ API running on port ${PORT}`);
});
