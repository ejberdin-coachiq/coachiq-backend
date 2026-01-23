// CoachIQ Backend Server
// Deploy this to Railway

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
    res.json({ status: 'CoachIQ API is running', version: '1.0.0' });
});

app.get('/health', (req, res) => {
    res.json({ status: 'ok' });
});

// Main analysis endpoint
app.post('/api/analyze', async (req, res) => {
    const { videoUrl, opponentName, analysisOptions } = req.body;

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
            console.error('Processing error:', err);
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

        // Download video from YouTube
        const videoPath = path.join(tempDir, 'video.mp4');
        await downloadYouTubeVideo(videoUrl, videoPath);
        
        updateReport(reportId, { progress: 25, progressText: 'Extracting frames...' });

        // Extract frames
        const frames = await extractFrames(videoPath, tempDir);
        
        updateReport(reportId, { progress: 40, progressText: 'Analyzing with AI...' });

        // Analyze frames with Claude
        const analysis = await analyzeWithClaude(frames, opponentName, analysisOptions);
        
        updateReport(reportId, { progress: 80, progressText: 'Generating report...' });

        // Generate final report
        const report = generateReport(analysis, opponentName);
        
        // Update with final results
        reports.set(reportId, {
            ...reports.get(reportId),
            status: 'complete',
            progress: 100,
            progressText: 'Complete!',
            report: report,
            completedAt: new Date().toISOString()
        });

        // Cleanup temp files
        cleanup(tempDir);

    } catch (error) {
        console.error('Process error:', error);
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
            const video = ytdl(url, { 
                quality: 'lowest', // Use lowest quality for faster download
                filter: 'videoandaudio'
            });
            
            const writeStream = fs.createWriteStream(outputPath);
            video.pipe(writeStream);
            
            writeStream.on('finish', () => {
                console.log('Video downloaded successfully');
                resolve(outputPath);
            });
            
            writeStream.on('error', reject);
            video.on('error', reject);
            
            // Timeout after 5 minutes
            setTimeout(() => {
                reject(new Error('Download timeout - video too long or slow connection'));
            }, 5 * 60 * 1000);
            
        } catch (error) {
            reject(error);
        }
    });
}

// Extract frames from video
async function extractFrames(videoPath, outputDir) {
    return new Promise((resolve, reject) => {
        const frames = [];
        const framesDir = path.join(outputDir, 'frames');
        
        if (!fs.existsSync(framesDir)) {
            fs.mkdirSync(framesDir, { recursive: true });
        }

        ffmpeg(videoPath)
            .outputOptions([
                '-vf', 'fps=1/10', // 1 frame every 10 seconds
                '-frames:v', '20', // Max 20 frames
                '-q:v', '5' // Quality
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
                    frames.push({
                        filename: file,
                        base64: data.toString('base64')
                    });
                }
                
                console.log(`Extracted ${frames.length} frames`);
                resolve(frames);
            })
            .on('error', (err) => {
                console.error('FFmpeg error:', err);
                reject(err);
            })
            .run();
    });
}

// Analyze frames with Claude Vision
async function analyzeWithClaude(frames, opponentName, analysisOptions) {
    if (frames.length === 0) {
        throw new Error('No frames extracted from video');
    }

    // Analyze frames in batches of 5
    const batchSize = 5;
    const allResults = [];

    for (let i = 0; i < frames.length; i += batchSize) {
        const batch = frames.slice(i, i + batchSize);
        
        const imageContent = batch.map(frame => ({
            type: 'image',
            source: {
                type: 'base64',
                media_type: 'image/jpeg',
                data: frame.base64
            }
        }));

        const prompt = `You are an expert basketball scout analyzing game film of ${opponentName}.

Analyze these ${batch.length} frames from a basketball game. For each frame, identify:

1. DEFENSIVE SET: man-to-man, 2-3 zone, 3-2 zone, 1-3-1 zone, full-court press, half-court trap, or unknown
2. OFFENSIVE ACTION: The play or action being run (pick & roll, horns, motion, iso, post-up, fast break, etc.)
3. BALL HANDLER: Jersey number if visible, or position (PG, SG, SF, PF, C)
4. COURT LOCATION: Where the ball is (left wing, right wing, top of key, paint, corner, etc.)
5. GAME SITUATION: transition, early offense, half-court set, out of bounds, etc.

Respond ONLY with valid JSON in this exact format:
{
  "frames": [
    {
      "frame": 1,
      "defense": "man-to-man",
      "offense": "pick and roll",
      "ballHandler": "#23",
      "courtLocation": "top of key",
      "situation": "half-court",
      "notes": "any additional observations"
    }
  ]
}`;

        try {
            const response = await anthropic.messages.create({
                model: 'claude-sonnet-4-20250514',
                max_tokens: 2048,
                messages: [{
                    role: 'user',
                    content: [
                        { type: 'text', text: prompt },
                        ...imageContent
                    ]
                }]
            });

            // Parse Claude's response
            const text = response.content[0].text;
            const jsonMatch = text.match(/\{[\s\S]*\}/);
            
            if (jsonMatch) {
                const parsed = JSON.parse(jsonMatch[0]);
                if (parsed.frames) {
                    allResults.push(...parsed.frames);
                }
            }
            
            // Small delay to avoid rate limits
            await new Promise(resolve => setTimeout(resolve, 500));
            
        } catch (error) {
            console.error('Claude API error:', error);
            // Continue with other batches even if one fails
        }
    }

    return allResults;
}

// Generate final report from analysis
function generateReport(frameAnalysis, opponentName) {
    // Count occurrences
    const defenseCounts = {};
    const offenseCounts = {};
    const playerCounts = {};
    const situationCounts = {};

    for (const frame of frameAnalysis) {
        if (frame.defense) {
            defenseCounts[frame.defense] = (defenseCounts[frame.defense] || 0) + 1;
        }
        if (frame.offense) {
            offenseCounts[frame.offense] = (offenseCounts[frame.offense] || 0) + 1;
        }
        if (frame.ballHandler) {
            playerCounts[frame.ballHandler] = (playerCounts[frame.ballHandler] || 0) + 1;
        }
        if (frame.situation) {
            situationCounts[frame.situation] = (situationCounts[frame.situation] || 0) + 1;
        }
    }

    const total = frameAnalysis.length || 1;

    // Calculate percentages and sort
    const defenseBreakdown = Object.entries(defenseCounts)
        .map(([name, count]) => ({ name, count, percentage: Math.round((count / total) * 100) }))
        .sort((a, b) => b.count - a.count);

    const offenseBreakdown = Object.entries(offenseCounts)
        .map(([name, count]) => ({ name, count, percentage: Math.round((count / total) * 100) }))
        .sort((a, b) => b.count - a.count);

    const keyPlayers = Object.entries(playerCounts)
        .map(([name, count]) => ({ name, count, percentage: Math.round((count / total) * 100) }))
        .sort((a, b) => b.count - a.count)
        .slice(0, 5);

    // Calculate pace (transition vs half-court)
    const transitionCount = situationCounts['transition'] || situationCounts['fast break'] || 0;
    const paceRating = Math.round(50 + (transitionCount / total) * 50);

    // Generate recommendations based on analysis
    const recommendations = generateRecommendations(defenseBreakdown, offenseBreakdown, keyPlayers);

    return {
        opponent: opponentName,
        generatedAt: new Date().toISOString(),
        framesAnalyzed: total,
        confidence: Math.min(95, 70 + total * 2),
        
        defense: {
            primary: defenseBreakdown[0]?.name || 'Unknown',
            secondary: defenseBreakdown[1]?.name || null,
            breakdown: defenseBreakdown.slice(0, 4)
        },
        
        offense: {
            topPlays: offenseBreakdown.slice(0, 5),
            primaryStyle: offenseBreakdown[0]?.name || 'Unknown'
        },
        
        keyPlayers: keyPlayers,
        
        pace: {
            rating: paceRating,
            description: paceRating > 70 ? 'Fast-paced, transition-heavy' : 
                        paceRating > 50 ? 'Balanced tempo' : 'Slow, half-court oriented'
        },
        
        recommendations: recommendations
    };
}

function generateRecommendations(defense, offense, players) {
    const offensiveKeys = [];
    const defensiveKeys = [];

    // Defensive recommendations based on their offense
    if (offense[0]?.name?.toLowerCase().includes('pick') || offense[0]?.name?.toLowerCase().includes('roll')) {
        defensiveKeys.push('ICE or hedge hard on ball screens - they rely heavily on pick & roll');
    }
    if (offense.some(o => o.name?.toLowerCase().includes('transition'))) {
        defensiveKeys.push('Get back in transition - they push the pace');
    }
    if (players[0]) {
        defensiveKeys.push(`Focus on ${players[0].name} - primary ball handler (${players[0].percentage}% of possessions)`);
    }

    // Offensive recommendations based on their defense
    const primaryDefense = defense[0]?.name?.toLowerCase() || '';
    if (primaryDefense.includes('zone')) {
        offensiveKeys.push('Attack zone gaps with quick ball movement');
        offensiveKeys.push('Flash to high post to collapse the zone');
    } else if (primaryDefense.includes('man')) {
        offensiveKeys.push('Use ball screens to create mismatches');
        offensiveKeys.push('Exploit weak individual defenders');
    }
    if (primaryDefense.includes('press')) {
        offensiveKeys.push('Break press with quick outlet passes');
    }

    // Default recommendations if we couldn't generate specific ones
    if (offensiveKeys.length === 0) {
        offensiveKeys.push('Move the ball quickly to find open shots');
        offensiveKeys.push('Attack in transition when possible');
    }
    if (defensiveKeys.length === 0) {
        defensiveKeys.push('Communicate on screens');
        defensiveKeys.push('Contest all shots');
    }

    return {
        offensiveKeys: offensiveKeys.slice(0, 4),
        defensiveKeys: defensiveKeys.slice(0, 4),
        practiceEmphasis: [
            'Ball screen coverage based on their tendencies',
            'Transition defense',
            'Offensive sets to attack their primary defense'
        ]
    };
}

// Cleanup temp files
function cleanup(dir) {
    try {
        if (fs.existsSync(dir)) {
            fs.rmSync(dir, { recursive: true, force: true });
        }
    } catch (error) {
        console.warn('Cleanup warning:', error.message);
    }
}

// Start server
const PORT = process.env.PORT || 3001;
app.listen(PORT, () => {
    console.log(`🏀 CoachIQ API running on port ${PORT}`);
});
