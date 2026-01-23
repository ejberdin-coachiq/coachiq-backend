// CoachIQ Backend Server - IMPROVED VERSION
// Better prompts, more detailed analysis, comprehensive reports

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

// Store reports in memory (use database in production)
const reports = new Map();

// Health check endpoint
app.get('/', (req, res) => {
    res.json({ status: 'CoachIQ API is running', version: '2.0.0' });
});

app.get('/health', (req, res) => {
    res.json({ status: 'ok' });
});

// Main analysis endpoint
app.post('/api/analyze', async (req, res) => {
    const { videoUrl, opponentName, analysisOptions } = req.body;

    console.log('📥 Received analysis request:', { videoUrl, opponentName, analysisOptions });

    if (!videoUrl || !opponentName) {
        return res.status(400).json({ error: 'Missing videoUrl or opponentName' });
    }

    const reportId = uuidv4();
    
    // Store initial report status
    reports.set(reportId, {
        id: reportId,
        status: 'processing',
        opponentName,
        videoUrl,
        progress: 0,
        createdAt: new Date().toISOString()
    });

    // Start async processing
    processVideo(reportId, videoUrl, opponentName, analysisOptions || ['defense', 'offense', 'pace'])
        .catch(err => {
            console.error('❌ Processing error:', err);
            reports.set(reportId, {
                ...reports.get(reportId),
                status: 'failed',
                error: err.message
            });
        });

    // Return immediately with report ID
    res.json({ 
        reportId, 
        status: 'processing',
        message: 'Analysis started. Poll /api/reports/:id for status.'
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

// Process video and analyze with Claude
async function processVideo(reportId, videoUrl, opponentName, analysisOptions) {
    const tempDir = `/tmp/coachiq_${reportId}`;
    
    try {
        // Create temp directory
        if (!fs.existsSync(tempDir)) {
            fs.mkdirSync(tempDir, { recursive: true });
        }

        updateReport(reportId, { progress: 5, progressText: 'Downloading video...' });
        console.log('📥 Downloading video...');

        // Download video from YouTube
        const videoPath = path.join(tempDir, 'video.mp4');
        await downloadYouTubeVideo(videoUrl, videoPath);
        
        updateReport(reportId, { progress: 20, progressText: 'Extracting frames...' });
        console.log('🎞️ Extracting frames...');

        // Extract MORE frames for better analysis
        const frames = await extractFrames(videoPath, tempDir, {
            intervalSeconds: 5,  // Every 5 seconds instead of 10
            maxFrames: 30        // 30 frames instead of 20
        });
        
        console.log(`✅ Extracted ${frames.length} frames`);
        updateReport(reportId, { progress: 35, progressText: `Analyzing ${frames.length} frames with AI...` });

        // Analyze frames with Claude - IMPROVED PROMPTS
        const analysis = await analyzeWithClaude(frames, opponentName, analysisOptions);
        
        console.log('📊 Raw analysis results:', JSON.stringify(analysis, null, 2));
        updateReport(reportId, { progress: 75, progressText: 'Generating detailed report...' });

        // Generate comprehensive report
        const report = await generateDetailedReport(analysis, opponentName, frames.length);
        
        console.log('📋 Final report generated');
        updateReport(reportId, { progress: 90, progressText: 'Finalizing...' });

        // Update with final results
        reports.set(reportId, {
            ...reports.get(reportId),
            status: 'complete',
            progress: 100,
            progressText: 'Complete!',
            report: report,
            completedAt: new Date().toISOString()
        });

        console.log('✅ Analysis complete for report:', reportId);

        // Cleanup temp files
        cleanup(tempDir);

    } catch (error) {
        console.error('❌ Process error:', error);
        cleanup(tempDir);
        throw error;
    }
}

function updateReport(reportId, updates) {
    const current = reports.get(reportId);
    reports.set(reportId, { ...current, ...updates });
}

// Download YouTube video
async function downloadYouTubeVideo(url, outputPath) {
    return new Promise((resolve, reject) => {
        try {
            console.log('🔗 Starting YouTube download:', url);
            
            const video = ytdl(url, { 
                quality: 'lowest',
                filter: 'videoandaudio'
            });
            
            const writeStream = fs.createWriteStream(outputPath);
            video.pipe(writeStream);
            
            video.on('info', (info) => {
                console.log('📹 Video info:', info.videoDetails.title, '- Duration:', info.videoDetails.lengthSeconds, 'seconds');
            });
            
            writeStream.on('finish', () => {
                console.log('✅ Video downloaded successfully');
                resolve(outputPath);
            });
            
            writeStream.on('error', (err) => {
                console.error('❌ Write error:', err);
                reject(err);
            });
            
            video.on('error', (err) => {
                console.error('❌ Download error:', err);
                reject(err);
            });
            
            // Timeout after 5 minutes
            setTimeout(() => {
                reject(new Error('Download timeout - video too long or slow connection'));
            }, 5 * 60 * 1000);
            
        } catch (error) {
            console.error('❌ YouTube download failed:', error);
            reject(error);
        }
    });
}

// Extract frames from video - IMPROVED
async function extractFrames(videoPath, outputDir, options = {}) {
    const { intervalSeconds = 5, maxFrames = 30 } = options;
    
    return new Promise((resolve, reject) => {
        const frames = [];
        const framesDir = path.join(outputDir, 'frames');
        
        if (!fs.existsSync(framesDir)) {
            fs.mkdirSync(framesDir, { recursive: true });
        }

        ffmpeg(videoPath)
            .outputOptions([
                '-vf', `fps=1/${intervalSeconds}`,
                '-frames:v', maxFrames.toString(),
                '-q:v', '3'  // Higher quality
            ])
            .output(path.join(framesDir, 'frame_%03d.jpg'))
            .on('end', () => {
                // Read all frames as base64
                const files = fs.readdirSync(framesDir)
                    .filter(f => f.endsWith('.jpg'))
                    .sort();
                
                for (const file of files) {
                    const filePath = path.join(framesDir, file);
                    const data = fs.readFileSync(filePath);
                    const frameNum = parseInt(file.match(/\d+/)[0]);
                    frames.push({
                        filename: file,
                        base64: data.toString('base64'),
                        timestamp: (frameNum - 1) * intervalSeconds
                    });
                }
                
                console.log(`✅ Extracted ${frames.length} frames`);
                resolve(frames);
            })
            .on('error', (err) => {
                console.error('❌ FFmpeg error:', err);
                reject(err);
            })
            .run();
    });
}

// IMPROVED Claude Analysis with Better Prompts
async function analyzeWithClaude(frames, opponentName, analysisOptions) {
    if (frames.length === 0) {
        throw new Error('No frames extracted from video');
    }

    console.log(`🤖 Analyzing ${frames.length} frames with Claude...`);

    // Analyze frames in batches of 4 for better context
    const batchSize = 4;
    const allResults = [];

    for (let i = 0; i < frames.length; i += batchSize) {
        const batch = frames.slice(i, i + batchSize);
        const batchNum = Math.floor(i / batchSize) + 1;
        const totalBatches = Math.ceil(frames.length / batchSize);
        
        console.log(`📊 Processing batch ${batchNum}/${totalBatches}...`);
        
        const imageContent = batch.map(frame => ({
            type: 'image',
            source: {
                type: 'base64',
                media_type: 'image/jpeg',
                data: frame.base64
            }
        }));

        // IMPROVED PROMPT - Much more detailed
        const prompt = `You are an elite basketball scout with 20+ years of experience analyzing game film for NBA and NCAA teams. You're analyzing game film of "${opponentName}".

ANALYZE THESE ${batch.length} CONSECUTIVE FRAMES CAREFULLY.

For EACH frame, identify ALL of the following:

## DEFENSIVE ANALYSIS
- **Defensive Scheme**: man-to-man, 2-3 zone, 3-2 zone, 1-3-1 zone, 1-2-2 zone, match-up zone, full-court press, half-court trap, or hybrid
- **Defensive Positioning**: Are defenders in good position? Gaps in the defense?
- **Help Defense**: Is help defense present? Are rotations happening?
- **On-Ball Defense**: How tight is the on-ball defender? Pressuring or sagging?

## OFFENSIVE ANALYSIS  
- **Offensive Set/Play**: Identify the specific play (horns, flex, motion, princeton, pick-and-roll, pick-and-pop, dribble-drive, isolation, post-up, fast break, secondary break, BLOB, SLOB, etc.)
- **Ball Movement**: Is the ball moving? How many passes? Ball reversal?
- **Player Movement**: Cuts, screens, off-ball movement quality
- **Spacing**: Good floor spacing or clustered?

## PLAYER IDENTIFICATION
- **Ball Handler**: Jersey number if visible, or position estimate
- **Key Players**: Any players who stand out (best defender, primary scorer, playmaker)
- **Mismatches**: Any obvious mismatches being exploited?

## GAME CONTEXT
- **Court Location**: Which side of court, half-court vs transition
- **Game Situation**: Early offense, late clock, transition, after timeout, etc.
- **Tempo**: Fast-paced or slow/methodical?

Respond with ONLY valid JSON in this exact format:
{
  "frames": [
    {
      "frameNumber": 1,
      "timestamp": "${batch[0]?.timestamp || 0}s",
      "defense": {
        "scheme": "man-to-man",
        "quality": "good/average/poor",
        "notes": "specific observations"
      },
      "offense": {
        "play": "pick and roll",
        "execution": "good/average/poor",
        "spacing": "good/poor",
        "ballMovement": "active/stagnant"
      },
      "players": {
        "ballHandler": "#23 or PG",
        "keyPlayer": "description if notable",
        "mismatch": "description if present"
      },
      "situation": {
        "context": "half-court/transition/BLOB/etc",
        "tempo": "fast/medium/slow",
        "clockSituation": "early/late/shot clock running down"
      },
      "scoutingNotes": "Any specific tactical observations a coach would want to know"
    }
  ],
  "batchSummary": "Overall observations from these frames"
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

            console.log('✅ Claude response received for batch', batchNum);

            // Parse Claude's response
            const text = response.content[0].text;
            const jsonMatch = text.match(/\{[\s\S]*\}/);
            
            if (jsonMatch) {
                try {
                    const parsed = JSON.parse(jsonMatch[0]);
                    if (parsed.frames) {
                        allResults.push(...parsed.frames);
                    }
                    if (parsed.batchSummary) {
                        allResults.push({ batchSummary: parsed.batchSummary });
                    }
                } catch (parseErr) {
                    console.warn('⚠️ JSON parse error:', parseErr.message);
                }
            }
            
            // Delay between batches to avoid rate limits
            await new Promise(resolve => setTimeout(resolve, 1000));
            
        } catch (error) {
            console.error('❌ Claude API error for batch', batchNum, ':', error.message);
            // Continue with other batches
        }
    }

    console.log(`✅ Completed analysis of all frames. Got ${allResults.length} results.`);
    return allResults;
}

// IMPROVED Report Generation
async function generateDetailedReport(frameAnalysis, opponentName, totalFrames) {
    // Aggregate all the data
    const stats = aggregateDetailedStats(frameAnalysis);
    
    console.log('📊 Aggregated stats:', JSON.stringify(stats, null, 2));

    // Use Claude to generate narrative insights
    const insightPrompt = `You are a professional basketball scout preparing a scouting report for a coaching staff.

Based on this analysis data from ${totalFrames} frames of game film for "${opponentName}", generate a comprehensive scouting report.

ANALYSIS DATA:
${JSON.stringify(stats, null, 2)}

Create a detailed JSON scouting report with actionable insights:
{
  "executiveSummary": "2-3 sentence overview of this team's style and tendencies",
  
  "offensiveAnalysis": {
    "primaryStyle": "Their main offensive approach",
    "topPlays": [
      {"name": "play name", "frequency": "percentage", "effectiveness": "high/medium/low", "howToDefend": "specific defensive strategy"}
    ],
    "ballMovement": {
      "rating": "excellent/good/average/poor",
      "description": "how they move the ball"
    },
    "spacing": {
      "rating": "excellent/good/average/poor",  
      "description": "their floor spacing tendencies"
    },
    "tempo": {
      "rating": 1-100,
      "description": "pace description"
    },
    "weaknesses": ["list of offensive weaknesses to exploit"]
  },
  
  "defensiveAnalysis": {
    "primaryScheme": "main defensive set",
    "secondaryScheme": "backup defense if any",
    "schemeBreakdown": [
      {"scheme": "name", "percentage": "how often used"}
    ],
    "strengths": ["defensive strengths"],
    "weaknesses": ["defensive weaknesses to attack"],
    "tendencies": ["specific defensive tendencies"]
  },
  
  "keyPlayers": [
    {
      "identifier": "jersey number or position",
      "role": "their role on the team",
      "strengths": "what they do well",
      "weaknesses": "how to defend/attack them",
      "usageRate": "high/medium/low"
    }
  ],
  
  "gameplan": {
    "offensiveKeys": [
      "Specific action item 1",
      "Specific action item 2",
      "Specific action item 3"
    ],
    "defensiveKeys": [
      "Specific action item 1", 
      "Specific action item 2",
      "Specific action item 3"
    ],
    "mustWinBattles": ["Key matchups or areas to dominate"]
  },
  
  "practiceEmphasis": [
    {
      "drill": "drill name or focus",
      "purpose": "why this is important against this opponent",
      "duration": "suggested time"
    }
  ]
}`;

    try {
        const response = await anthropic.messages.create({
            model: 'claude-sonnet-4-20250514',
            max_tokens: 4096,
            messages: [{
                role: 'user',
                content: insightPrompt
            }]
        });

        const text = response.content[0].text;
        const jsonMatch = text.match(/\{[\s\S]*\}/);
        
        if (jsonMatch) {
            const report = JSON.parse(jsonMatch[0]);
            
            // Add metadata
            report.opponent = opponentName;
            report.generatedAt = new Date().toISOString();
            report.framesAnalyzed = totalFrames;
            report.confidence = Math.min(95, 60 + totalFrames * 1.5);
            report.rawStats = stats;
            
            // Ensure required fields exist with proper structure for frontend
            report.defense = {
                primary: report.defensiveAnalysis?.primaryScheme || stats.topDefense || 'Unknown',
                secondary: report.defensiveAnalysis?.secondaryScheme || null,
                breakdown: report.defensiveAnalysis?.schemeBreakdown?.map(s => ({
                    name: s.scheme,
                    percentage: parseInt(s.percentage) || 0
                })) || stats.defenseBreakdown || []
            };
            
            report.offense = {
                topPlays: report.offensiveAnalysis?.topPlays?.map(p => ({
                    name: p.name,
                    percentage: parseInt(p.frequency) || 0,
                    notes: p.howToDefend
                })) || stats.offenseBreakdown || [],
                primaryStyle: report.offensiveAnalysis?.primaryStyle || 'Unknown'
            };
            
            report.pace = {
                rating: report.offensiveAnalysis?.tempo?.rating || stats.paceRating || 50,
                description: report.offensiveAnalysis?.tempo?.description || 'Moderate tempo'
            };
            
            report.recommendations = {
                offensiveKeys: report.gameplan?.offensiveKeys || [],
                defensiveKeys: report.gameplan?.defensiveKeys || [],
                practiceEmphasis: report.practiceEmphasis?.map(p => p.drill + ': ' + p.purpose) || []
            };
            
            return report;
        }
    } catch (error) {
        console.error('❌ Report generation error:', error);
    }

    // Fallback to basic report from stats
    return generateBasicReport(stats, opponentName, totalFrames);
}

function aggregateDetailedStats(frameAnalysis) {
    const defenseCounts = {};
    const offenseCounts = {};
    const playerCounts = {};
    const tempos = [];
    const summaries = [];
    const scoutingNotes = [];

    for (const item of frameAnalysis) {
        if (item.batchSummary) {
            summaries.push(item.batchSummary);
            continue;
        }

        // Defense
        if (item.defense?.scheme) {
            const scheme = item.defense.scheme.toLowerCase();
            defenseCounts[scheme] = (defenseCounts[scheme] || 0) + 1;
        }

        // Offense
        if (item.offense?.play) {
            const play = item.offense.play.toLowerCase();
            offenseCounts[play] = (offenseCounts[play] || 0) + 1;
        }

        // Players
        if (item.players?.ballHandler) {
            const player = item.players.ballHandler;
            playerCounts[player] = (playerCounts[player] || 0) + 1;
        }

        // Tempo
        if (item.situation?.tempo) {
            const tempo = item.situation.tempo.toLowerCase();
            if (tempo === 'fast') tempos.push(80);
            else if (tempo === 'medium') tempos.push(50);
            else if (tempo === 'slow') tempos.push(30);
        }

        // Notes
        if (item.scoutingNotes) {
            scoutingNotes.push(item.scoutingNotes);
        }
    }

    const total = frameAnalysis.filter(f => !f.batchSummary).length || 1;

    // Calculate breakdowns
    const defenseBreakdown = Object.entries(defenseCounts)
        .map(([name, count]) => ({ name, count, percentage: Math.round((count / total) * 100) }))
        .sort((a, b) => b.count - a.count);

    const offenseBreakdown = Object.entries(offenseCounts)
        .map(([name, count]) => ({ name, count, percentage: Math.round((count / total) * 100) }))
        .sort((a, b) => b.count - a.count);

    const playerBreakdown = Object.entries(playerCounts)
        .map(([name, count]) => ({ name, count, percentage: Math.round((count / total) * 100) }))
        .sort((a, b) => b.count - a.count)
        .slice(0, 5);

    const avgTempo = tempos.length > 0 
        ? Math.round(tempos.reduce((a, b) => a + b, 0) / tempos.length)
        : 50;

    return {
        totalFrames: total,
        topDefense: defenseBreakdown[0]?.name || 'Unknown',
        defenseBreakdown: defenseBreakdown.slice(0, 5),
        topOffense: offenseBreakdown[0]?.name || 'Unknown',
        offenseBreakdown: offenseBreakdown.slice(0, 5),
        keyPlayers: playerBreakdown,
        paceRating: avgTempo,
        summaries,
        scoutingNotes: scoutingNotes.slice(0, 10)
    };
}

function generateBasicReport(stats, opponentName, totalFrames) {
    return {
        opponent: opponentName,
        generatedAt: new Date().toISOString(),
        framesAnalyzed: totalFrames,
        confidence: Math.min(90, 60 + totalFrames),
        
        defense: {
            primary: stats.topDefense || 'Man-to-man',
            secondary: stats.defenseBreakdown[1]?.name || null,
            breakdown: stats.defenseBreakdown
        },
        
        offense: {
            topPlays: stats.offenseBreakdown,
            primaryStyle: stats.topOffense || 'Motion'
        },
        
        keyPlayers: stats.keyPlayers,
        
        pace: {
            rating: stats.paceRating,
            description: stats.paceRating > 65 ? 'Up-tempo, transition-focused' :
                        stats.paceRating > 45 ? 'Balanced pace' : 'Slow, methodical half-court'
        },
        
        recommendations: {
            offensiveKeys: [
                'Move the ball quickly against their defense',
                'Attack early in transition',
                'Look for mismatches to exploit'
            ],
            defensiveKeys: [
                'Communicate on all screens',
                'Limit their primary ball handler',
                'Contest all shots'
            ],
            practiceEmphasis: stats.scoutingNotes.slice(0, 3)
        },
        
        rawStats: stats
    };
}

// Cleanup temp files
function cleanup(dir) {
    try {
        if (fs.existsSync(dir)) {
            fs.rmSync(dir, { recursive: true, force: true });
            console.log('🧹 Cleaned up temp files');
        }
    } catch (error) {
        console.warn('⚠️ Cleanup warning:', error.message);
    }
}

// Start server
const PORT = process.env.PORT || 3001;
app.listen(PORT, () => {
    console.log(`🏀 CoachIQ API v2.0 running on port ${PORT}`);
    console.log(`📊 Enhanced analysis with detailed Claude prompts`);
});
