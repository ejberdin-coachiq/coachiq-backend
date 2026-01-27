// CoachIQ Backend Server - COMPREHENSIVE ANALYSIS
// All offensive and defensive sets for youth to pro levels

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

// Configure multer
const storage = multer.diskStorage({
    destination: (req, file, cb) => {
        const uploadDir = '/tmp/coachiq_uploads';
        if (!fs.existsSync(uploadDir)) fs.mkdirSync(uploadDir, { recursive: true });
        cb(null, uploadDir);
    },
    filename: (req, file, cb) => cb(null, `${Date.now()}_${uuidv4()}_${file.originalname}`)
});
const upload = multer({ storage, limits: { fileSize: 10 * 1024 * 1024 * 1024 } });

// Initialize services
const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
const resend = new Resend(process.env.RESEND_API_KEY);

// Storage
const reports = new Map();
const users = new Map();
const uploadSessions = new Map();

// ===========================================
// COMPREHENSIVE BASKETBALL KNOWLEDGE BASE
// ===========================================

const BASKETBALL_KNOWLEDGE = `
## COMPREHENSIVE BASKETBALL SCHEMES REFERENCE

You must identify schemes from ANY skill level - youth, middle school, high school, college, or professional.
Teams may run simplified or advanced versions. Identify what you actually see.

---

### DEFENSIVE SCHEMES - COMPLETE LIST

#### MAN-TO-MAN DEFENSE VARIATIONS
1. **Straight Man-to-Man** - Each defender guards assigned player, no switching
2. **Switching Man** - Defenders switch on all screens
3. **Selective Switch** - Switch only on certain positions (1-3 switch, bigs don't switch)
4. **Hedge & Recover** - Big shows on ball screen, guard fights over, big recovers
5. **Hard Hedge/Blitz** - Both defenders trap ball handler on screens
6. **Soft Hedge/Drop** - Big drops back to protect rim on ball screens
7. **ICE/Down/Blue** - Force ball handler baseline, big walls off
8. **Flat/Weak** - Force ball handler middle, contain with big
9. **Switch All** - Switch every screen regardless of position
10. **Show & Go Under** - Big shows, guard goes under screen (vs non-shooters)
11. **Denial Man** - Deny all passes one pass away
12. **Pack Line Defense** - Sagging man-to-man, help defenders inside imaginary line 16ft from basket
13. **No-Middle/Funnel** - Force everything baseline
14. **Shot Clock Situation** - Tight closeouts, pressure late in clock

#### ZONE DEFENSE VARIATIONS
1. **2-3 Zone** - Two guards up top, three along baseline (most common)
2. **3-2 Zone** - Three across free throw line, two on blocks
3. **1-2-2 Zone** - Point at top, two wings, two baseline
4. **1-3-1 Zone** - Point, three across free throw line extended, one baseline
5. **2-1-2 Zone** - Two guards, one middle, two baseline
6. **Box-and-One** - Four in box zone, one chaser on best player
7. **Triangle-and-Two** - Three in triangle zone, two chasers
8. **Diamond-and-One** - Four in diamond, one chaser
9. **Match-up Zone** - Zone principles but match up like man when ball enters
10. **Amoeba Defense** - Shifting zone that morphs based on ball location
11. **Syracuse 2-3** - Extended 2-3 with active trapping
12. **Point Zone** - 1-3-1 variation with aggressive point defender

#### PRESS DEFENSES (FULL COURT)
1. **1-2-1-1 Full Court Press (Diamond)** - Trapping press
2. **2-2-1 Full Court Press** - Two trappers, two interceptors, one safety
3. **1-2-2 Full Court Press** - One point, staggered layers
4. **2-1-2 Full Court Press** - Variation with middle rover
5. **1-1-2-1 Press** - Run and jump style
6. **Man-to-Man Press** - Full court man pressure
7. **Run and Jump Press** - Defenders rotate and trap unpredictably
8. **Scramble Press** - Chaotic trapping, gambling for steals
9. **Contain Press** - Slow down, don't trap, just delay
10. **Match-up Press** - Zone press that matches up

#### HALF COURT PRESS/TRAPS
1. **1-3-1 Half Court Trap** - Trap corners and wings
2. **2-3 Half Court Trap** - Trap on wing entry
3. **3/4 Court Press** - Pick up at free throw line extended
4. **Soft Press** - Delay without trapping

#### JUNK/COMBINATION DEFENSES
1. **Box-and-One** - Box zone + man on star player
2. **Triangle-and-Two** - Triangle zone + man on two best players
3. **Diamond-and-One** - Diamond zone + chaser
4. **Face Guard** - Complete denial on specific player
5. **1-4 Soft** - One chaser, four passive zone
6. **Scramble** - Switching/rotating chaos defense

---

### OFFENSIVE SYSTEMS - COMPLETE LIST

#### MOTION OFFENSES
1. **5-Out Motion** - All five players on perimeter, drive and kick
2. **4-Out 1-In Motion** - Four perimeter, one post player
3. **3-Out 2-In Motion** - Three guards, two post players
4. **Dribble Drive Motion (DDM)** - Attack gaps, kick to shooters
5. **Read and React** - Layers of rules based on defense
6. **Pace & Space** - Spread floor, quick decisions
7. **Swing Offense** - Ball reversal triggers cuts
8. **Blocker-Mover** - Bigs screen, guards cut (Warriors style)
9. **Pass & Cut/Backdoor** - Give and go emphasis

#### SET PLAYS & ACTIONS
1. **Horns** - Two bigs at elbows, guard with ball at top
2. **Horns Flare** - From horns, flare screen for shooter
3. **Horns DHO** - Dribble handoff from horns
4. **Flex Offense** - Baseline screens, flex cuts
5. **UCLA Cut** - Guard cuts off high post to basket
6. **Shuffle Offense** - Continuous shuffle cuts
7. **Wheel Offense** - Continuous motion with wheel action
8. **Princeton Offense** - Backdoor cuts, chin series
9. **Triangle Offense** - Triangle spacing, post-ups
10. **High-Low Offense** - Big at elbow, big on block
11. **Pick and Roll (PnR)** - Ball screen with roll
12. **Pick and Pop** - Ball screen with pop to perimeter
13. **Spain Pick and Roll** - PnR with back screen on roll defender
14. **Step-Up Screen** - Big steps up to screen
15. **Drag Screen** - Screen in transition
16. **Side Pick and Roll** - Ball screen on wing
17. **Elbow Series** - Actions from elbow entry
18. **Floppy** - Shooter chooses which screen to use
19. **Iverson Cut** - Guard cuts across two bigs at elbows
20. **Zipper Cut** - Cut up from block off screen
21. **Hammer Action** - Baseline out of bounds play, skip to corner
22. **Pistol/21 Series** - DHO into PnR
23. **Chicago Action** - Pin down into handoff
24. **Veer Action** - Guard drives at big, handoff or reject
25. **Spread Pick and Roll** - PnR with floor spread
26. **Empty/Clear** - Clear one side for isolation
27. **DHO (Dribble Handoff)** - Handoff action
28. **Pin Down** - Screen down for shooter
29. **Flare Screen** - Screen away from ball for shooter
30. **Back Screen** - Screen from behind for layup cut
31. **Cross Screen** - Screen across the lane
32. **Down Screen** - Screen toward baseline
33. **Ball Screen** - Screen on the ball
34. **Ghost Screen** - Fake screen, slip
35. **Stagger Screens** - Two consecutive screens
36. **Double Stagger** - Two screeners
37. **Elevator Doors** - Two bigs close together, cutter between

#### POST-UP OFFENSES
1. **High Post Offense** - Entry to elbow, cuts off post
2. **Low Post Offense** - Entry to block, work inside
3. **Princeton Back Door** - Post at elbow, guards backdoor
4. **Split Action** - Post catches, guards split cut
5. **Duck In** - Post seals, quick entry

#### TRANSITION OFFENSES
1. **Primary Break** - Outlet, fill lanes, attack
2. **Secondary Break** - Quick hitter after primary fails
3. **Numbered Break** - Players have assigned spots (1 rim runs, etc.)
4. **Drag Screen Break** - Ball screen in transition
5. **Early Offense** - Set actions before defense sets
6. **Run and Gun** - Push pace constantly
7. **7 Seconds or Less** - Quick shots in transition

#### PRESS BREAK OFFENSES
1. **1-4 Press Break** - One ball handler, four across
2. **2-1-2 Press Break** - Two guards, release valve middle
3. **1-2-2 Press Break** - Single guard, two wings
4. **Numbered Press Break** - Players have specific jobs
5. **Diamond Press Break** - 1-2-1-1 alignment

#### ZONE OFFENSES
1. **Overload** - Put more players on one side
2. **1-3-1 Zone Offense** - Against 2-3 zone
3. **4-1 Zone Offense** - Four high, one low
4. **2-3 Zone Offense** - Match up against zone
5. **Short Corner** - Player in short corner vs zone
6. **High Post Flash** - Flash to high post vs zone
7. **Ball Reversal** - Move ball side to side
8. **Gap Shooting** - Find holes in zone

#### OUT OF BOUNDS PLAYS
1. **BLOB (Baseline Out of Bounds)** - Under own basket
2. **SLOB (Sideline Out of Bounds)** - Sideline plays
3. **Stack** - Players stacked together
4. **Box** - Box formation
5. **Line** - Players in a line
6. **Across** - Cuts across the lane

#### SPECIAL SITUATIONS
1. **ATO (After Timeout)** - Set plays after timeout
2. **EOG (End of Game)** - Last shot plays
3. **EOQ (End of Quarter)** - End of period plays
4. **Foul Game** - When intentionally fouling
5. **Delay Game** - Holding ball with lead
6. **Catch Up** - Quick shots when behind

---

### SKILL LEVEL INDICATORS

#### YOUTH/RECREATIONAL (Ages 8-12)
- Basic man-to-man
- Simple 2-3 zone
- Motion concepts (pass & cut)
- Limited ball screens
- Basic press break

#### MIDDLE SCHOOL (Ages 12-14)
- Man-to-man with help concepts
- Multiple zone looks
- Basic set plays (horns, flex)
- Introduction to ball screens
- Half court traps

#### HIGH SCHOOL (Ages 14-18)
- All man-to-man coverages
- Zone variations
- Full press packages
- Complete offensive playbooks
- Situational plays (ATO, EOG)

#### COLLEGE/PROFESSIONAL
- Complex switching schemes
- Advanced ball screen coverage
- Multiple defensive looks per game
- Intricate offensive systems
- High-level reads and counters

---

### WHAT TO LOOK FOR IN EACH FRAME

1. **Player Positioning** - Where are the 5 players on each team?
2. **Ball Location** - Where is the ball? Who has it?
3. **Defensive Stance** - Are defenders in man or zone stance?
4. **Spacing** - How is the floor spaced?
5. **Screen Action** - Any screens being set?
6. **Cuts** - Any players cutting?
7. **Help Position** - Where are help defenders?
8. **Post Position** - Where are the bigs?
9. **Transition** - Is this fast break or half court?

`;

// ===========================================
// SYSTEM PROMPT
// ===========================================

const SYSTEM_PROMPT = `You are an elite basketball scout and analyst with 25+ years of experience from youth leagues to the NBA. You have worked at every level and understand how basketball is taught and played differently at each stage.

Your expertise includes:
- Youth basketball development and age-appropriate schemes
- Middle school transition basketball
- High school varsity tactics and state championship preparation
- College basketball (all divisions)
- Professional basketball (NBA, overseas, G-League)

You can identify schemes at ANY skill level - from a basic youth motion offense to complex NBA switching schemes. You understand that:
- Youth teams run simpler versions of concepts
- Execution quality varies by skill level
- The same "play" looks different at different levels
- Terminology may vary by region and level

${BASKETBALL_KNOWLEDGE}

IMPORTANT RULES:
1. Only identify what you can ACTUALLY SEE in the frames
2. Don't fabricate jersey numbers or player names you can't read
3. State your confidence level for each observation
4. If you see a simplified version of a scheme, identify it appropriately
5. Consider the apparent skill level when making identifications
6. Provide actionable insights regardless of competition level`;

// ===========================================
// ANALYSIS PROMPT BUILDER
// ===========================================

function buildAnalysisPrompt(opponentName, frameCount, analysisOptions) {
    return `# COMPREHENSIVE SCOUTING ANALYSIS

**Opponent:** ${opponentName}
**Frames:** ${frameCount}
**Focus Areas:** ${analysisOptions.join(', ')}

---

## INSTRUCTIONS

Analyze these game frames and identify EVERYTHING you can observe about this team's offensive and defensive schemes. Consider all skill levels - this could be youth, middle school, high school, college, or professional basketball.

Use the comprehensive basketball knowledge provided to identify specific schemes, sets, and actions.

---

## DEFENSIVE IDENTIFICATION CHECKLIST

Look for and identify:

### Base Defense
- [ ] Is it man-to-man or zone?
- [ ] If man: Straight, switching, pack line, denial?
- [ ] If zone: 2-3, 3-2, 1-2-2, 1-3-1, match-up?
- [ ] Any junk/combination defenses (box-and-one, triangle-and-two)?

### On-Ball Defense
- [ ] Pressure level: Full denial, 3/4, soft?
- [ ] Force direction: Baseline, middle, sideline?
- [ ] Stance: Low and active or standing up?

### Ball Screen Coverage (if applicable)
- [ ] Drop/Sag - Big stays back
- [ ] Hedge/Show - Big jumps out then recovers
- [ ] Hard Hedge/Blitz - Both defenders trap
- [ ] Switch - Defenders switch assignments
- [ ] ICE/Down - Force baseline, wall off
- [ ] Flat/Weak - Force middle, contain
- [ ] Under - Guard goes under screen
- [ ] Over - Guard fights over screen

### Help Defense
- [ ] Are help defenders in gaps?
- [ ] How many passes away do they help?
- [ ] Do they rotate on drives?
- [ ] Closeout technique?

### Press Defense (if shown)
- [ ] Full court or half court?
- [ ] Man or zone press?
- [ ] Trapping or contain?
- [ ] Specific formation (1-2-1-1, 2-2-1, etc.)?

### Transition Defense
- [ ] How many get back?
- [ ] Do they match up or protect paint first?
- [ ] Any cherry-picking/leaking?

---

## OFFENSIVE IDENTIFICATION CHECKLIST

Look for and identify:

### Base System
- [ ] Motion offense (5-out, 4-out 1-in, 3-out 2-in)?
- [ ] Set play based?
- [ ] Dribble drive?
- [ ] Post-oriented?
- [ ] Princeton/backdoor?
- [ ] Pick and roll heavy?

### Specific Sets & Actions
- [ ] Horns (bigs at elbows)?
- [ ] Flex (baseline screens)?
- [ ] UCLA cut (guard cuts off high post)?
- [ ] Floppy (shooter choice)?
- [ ] Iverson cut (across two elbows)?
- [ ] Pin downs?
- [ ] Dribble handoffs (DHO)?
- [ ] Stagger screens?
- [ ] Spain PnR (back screen on roll defender)?
- [ ] Ghost/slip screens?

### Spacing
- [ ] 5-out (all perimeter)?
- [ ] 4-out 1-in (one post)?
- [ ] 3-out 2-in (two posts)?
- [ ] Floor balance?

### Ball Movement
- [ ] Pass tempo (quick or slow)?
- [ ] Reversals?
- [ ] Skip passes?
- [ ] Drive and kick?

### Transition
- [ ] Do they run in transition?
- [ ] Primary break patterns?
- [ ] Secondary/early offense?

### Zone Offense (if applicable)
- [ ] Overload one side?
- [ ] High post flash?
- [ ] Short corner?
- [ ] Ball reversal?

---

## RESPONSE FORMAT

Provide your analysis in this JSON structure. Be thorough and specific:

\`\`\`json
{
  "skillLevel": {
    "estimated": "youth | middle_school | high_school | college | professional",
    "indicators": ["Why you believe this level"],
    "confidence": 75
  },

  "defense": {
    "primary": {
      "scheme": "Exact scheme name from the reference list",
      "details": "Specific observations about how they run it",
      "execution": "How well they execute (excellent/good/developing/poor)"
    },
    "secondary": {
      "scheme": "Secondary scheme if observed",
      "details": "When/why they use it",
      "frequency": "Percentage of possessions"
    },
    "breakdown": [
      {"name": "Scheme Name", "percentage": 70, "notes": "Specific details"}
    ],
    "manToMan": {
      "observed": true,
      "type": "straight | switching | pack_line | denial | other",
      "onBall": {
        "pressure": "full_denial | three_quarter | soft | varies",
        "forceDirection": "baseline | middle | sideline | ball_handler_choice",
        "stance": "Description of defensive stance"
      },
      "offBall": {
        "positioning": "one_pass_deny | gap_help | sagging",
        "helpSide": "How far off are help defenders"
      }
    },
    "zone": {
      "observed": true,
      "type": "2-3 | 3-2 | 1-3-1 | 1-2-2 | match-up | other",
      "aggressiveness": "passive | standard | aggressive | trapping",
      "weakSpots": ["Areas the zone doesn't cover well"]
    },
    "ballScreenCoverage": {
      "primary": "drop | hedge | hard_hedge | switch | ice | flat | under | over",
      "secondary": "Alternative coverage used",
      "bigTechnique": "How the screener's defender plays it",
      "guardTechnique": "How the ball handler's defender plays it",
      "rotations": "How others rotate"
    },
    "press": {
      "observed": true,
      "type": "full_court | three_quarter | half_court",
      "formation": "1-2-1-1 | 2-2-1 | man | other",
      "style": "trapping | contain | run_and_jump",
      "triggers": "When they use it"
    },
    "transitionDefense": {
      "priority": "match_up | protect_paint | scramble",
      "numberBack": "typical number of players",
      "conversion": "How quickly they convert"
    },
    "weaknesses": [
      {
        "weakness": "Specific defensive weakness",
        "howToExploit": "Exactly how to attack it",
        "playToRun": "Specific play or action to use"
      }
    ],
    "strengths": ["Defensive strength 1", "Defensive strength 2"]
  },

  "offense": {
    "primary": {
      "system": "Exact system name from reference",
      "details": "How they run it",
      "execution": "How well they execute"
    },
    "secondary": {
      "system": "Secondary approach",
      "usage": "When they use it"
    },
    "spacing": {
      "formation": "5-out | 4-out-1-in | 3-out-2-in | other",
      "quality": "excellent | good | developing | poor",
      "notes": "Spacing observations"
    },
    "setsAndActions": [
      {
        "name": "Exact set/action name",
        "frequency": 25,
        "description": "How they run it",
        "primaryOption": "First look",
        "secondaryOption": "Counter if defended",
        "howToDefend": "Recommended defensive approach"
      }
    ],
    "ballScreenActions": {
      "frequency": "How often they use ball screens",
      "types": ["pick_and_roll", "pick_and_pop", "spain", "drag", "side"],
      "ballHandler": "Who typically handles",
      "screener": "Who typically screens",
      "reads": "What reads they make"
    },
    "postPlay": {
      "frequency": "How often they post up",
      "location": "block | elbow | short_corner",
      "actions": "What they do from post"
    },
    "cuttingActions": [
      {
        "type": "UCLA | flex | backdoor | zipper | iverson | other",
        "frequency": "How often",
        "effectiveness": "How well they execute"
      }
    ],
    "screeningActions": [
      {
        "type": "pin_down | flare | back_screen | cross | stagger | down | ball",
        "frequency": "How often",
        "purpose": "What it creates"
      }
    ],
    "ballMovement": {
      "rating": "excellent | good | average | poor",
      "passesPerPossession": "estimated number",
      "reversals": "How often they reverse",
      "skipPasses": "Do they skip the ball",
      "tempo": "quick | deliberate | mixed"
    },
    "transition": {
      "frequency": "always | often | sometimes | rarely",
      "style": "push_pace | controlled | secondary_focused",
      "primaryBreak": "How they run primary",
      "earlyOffense": "Early offense actions"
    },
    "zoneOffense": {
      "observed": true,
      "approach": "overload | high_post | ball_reversal | gap_attack",
      "effectiveness": "How well they attack zones"
    },
    "outOfBounds": {
      "blob": "Baseline out of bounds tendencies",
      "slob": "Sideline out of bounds tendencies"
    },
    "weaknesses": [
      {
        "weakness": "Specific offensive weakness",
        "howToExploit": "How to take advantage defensively"
      }
    ],
    "strengths": ["Offensive strength 1", "Offensive strength 2"]
  },

  "keyPlayers": [
    {
      "identifier": "Jersey # or description",
      "position": "PG | SG | SF | PF | C",
      "role": "primary_ball_handler | scorer | screener | shooter | rim_protector | glue_guy",
      "usage": "Estimated % of offense involvement",
      "offensiveTendencies": {
        "preferredHand": "right | left | both",
        "favoriteSpots": ["Locations on floor"],
        "goToMoves": ["Signature moves"],
        "shootingAbility": "Shooting assessment",
        "ballHandling": "Ball handling assessment",
        "postGame": "Post game if applicable",
        "offBall": "Off-ball movement quality"
      },
      "defensiveTendencies": {
        "onBall": "On-ball defense quality",
        "help": "Help defense quality",
        "rebounding": "Rebounding effort"
      },
      "physicalProfile": "Size/athleticism observations",
      "threatLevel": "high | medium | low",
      "keyMatchup": "Who should guard them",
      "notes": "Additional observations"
    }
  ],

  "pace": {
    "rating": 65,
    "category": "very_slow | slow | average | fast | very_fast",
    "description": "Detailed pace description",
    "preferredStyle": "transition | half_court | balanced",
    "shotClockUsage": "early | middle | late | varies",
    "possessionLength": "Average possession estimate",
    "factors": ["What affects their pace"]
  },

  "specialSituations": {
    "afterTimeout": "ATO tendencies observed",
    "endOfClock": "Late clock tendencies",
    "endOfGame": "EOG situation tendencies",
    "pressBreak": "How they break pressure",
    "foulSituations": "Foul game tendencies"
  },

  "teamStrengths": [
    {
      "strength": "Team strength",
      "evidence": "What you observed that shows this"
    }
  ],

  "teamWeaknesses": [
    {
      "weakness": "Team weakness", 
      "evidence": "What you observed",
      "howToExploit": "How to take advantage"
    }
  ],

  "recommendations": {
    "offensiveGamePlan": {
      "primaryStrategy": "Main approach to score against them",
      "secondaryStrategy": "Backup approach",
      "setsToRun": [
        {
          "set": "Specific set name",
          "why": "Why this will work",
          "keyReads": "What to look for"
        }
      ],
      "actionsToUse": ["Specific actions that will be effective"],
      "actionsToAvoid": ["What won't work against them"],
      "tempoStrategy": "How to control pace",
      "targetMatchups": ["Matchups to exploit"],
      "avoidMatchups": ["Matchups to stay away from"]
    },
    "defensiveGamePlan": {
      "recommendedScheme": "What defense to play",
      "schemeDetails": "How to execute it",
      "ballScreenCoverage": "How to defend their ball screens",
      "postDefense": "How to defend their post game",
      "keyAssignments": [
        {
          "offensive_player": "Who",
          "defensive_assignment": "Who guards them",
          "instructions": "How to guard them"
        }
      ],
      "helpPrinciples": "Help defense instructions",
      "transitionDefense": "How to defend their transition",
      "pressConsiderations": "Whether to press and how"
    },
    "practiceEmphasis": [
      {
        "drill": "Specific drill name",
        "purpose": "What it develops",
        "duration": "How long to spend",
        "coachingPoints": ["Key teaching points"],
        "scoutTeamLook": "How scout team simulates opponent"
      }
    ],
    "keysToVictory": [
      "Key #1 with specific detail",
      "Key #2 with specific detail",
      "Key #3 with specific detail"
    ],
    "warningPoints": [
      "What could go wrong if we don't prepare"
    ]
  },

  "confidence": {
    "overall": 85,
    "defensiveAnalysis": 80,
    "offensiveAnalysis": 85,
    "playerIdentification": 70,
    "recommendations": 80,
    "limitations": ["What we couldn't determine", "What we need more film for"]
  }
}
\`\`\`

Remember:
- Identify the specific scheme names from the reference list
- Consider the skill level when evaluating execution
- Only report what you can actually observe
- Provide actionable recommendations for any coaching level`;
}

// ===========================================
// ENDPOINTS
// ===========================================

app.get('/', (req, res) => {
    res.json({ 
        status: 'CoachIQ API running', 
        version: '6.0.0-comprehensive',
        features: ['all-skill-levels', 'complete-scheme-recognition', 'pro-analysis']
    });
});

app.get('/health', (req, res) => res.json({ status: 'ok' }));

// User endpoints
app.post('/api/users/register', (req, res) => {
    const { email, name, teamName } = req.body;
    if (!email) return res.status(400).json({ error: 'Email required' });
    const userId = uuidv4();
    const user = { id: userId, email, name: name || 'Coach', teamName: teamName || '', createdAt: new Date().toISOString() };
    users.set(userId, user);
    users.set(email, user);
    res.json({ user });
});

app.get('/api/users/:email', (req, res) => {
    const user = users.get(req.params.email);
    if (!user) return res.status(404).json({ error: 'User not found' });
    res.json({ user });
});

app.get('/api/users/:email/reports', (req, res) => {
    const userReports = [];
    reports.forEach((report) => {
        if (report.userEmail === req.params.email) {
            userReports.push({
                id: report.id, opponentName: report.opponentName, status: report.status,
                progress: report.progress, progressText: report.progressText,
                createdAt: report.createdAt, completedAt: report.completedAt
            });
        }
    });
    userReports.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
    res.json({ reports: userReports });
});

app.get('/api/reports/:id', (req, res) => {
    const report = reports.get(req.params.id);
    if (!report) return res.status(404).json({ error: 'Report not found' });
    res.json(report);
});

// Upload endpoints
app.post('/api/upload/init', (req, res) => {
    const { fileName, fileSize, totalChunks, userEmail } = req.body;
    const uploadId = uuidv4();
    const uploadDir = `/tmp/coachiq_chunks_${uploadId}`;
    fs.mkdirSync(uploadDir, { recursive: true });
    uploadSessions.set(uploadId, {
        id: uploadId, fileName, fileSize, totalChunks, receivedChunks: 0,
        chunksDir: uploadDir, userEmail, createdAt: new Date().toISOString()
    });
    res.json({ uploadId, status: 'ready' });
});

app.post('/api/upload/chunk', upload.single('chunk'), (req, res) => {
    const { uploadId, chunkIndex } = req.body;
    const session = uploadSessions.get(uploadId);
    if (!session) return res.status(404).json({ error: 'Session not found' });
    
    const chunkPath = path.join(session.chunksDir, `chunk_${chunkIndex.padStart(6, '0')}`);
    fs.renameSync(req.file.path, chunkPath);
    session.receivedChunks++;
    res.json({ received: session.receivedChunks, total: session.totalChunks });
});

app.post('/api/upload/finalize', async (req, res) => {
    const { uploadId, opponentName, analysisOptions, userEmail, userName } = req.body;
    const session = uploadSessions.get(uploadId);
    if (!session) return res.status(404).json({ error: 'Session not found' });
    
    const reportId = uuidv4();
    reports.set(reportId, {
        id: reportId, userEmail, userName: userName || 'Coach', opponentName,
        fileName: session.fileName, status: 'queued', progress: 0,
        progressText: 'Video received...', createdAt: new Date().toISOString()
    });
    
    await sendConfirmationEmail(userEmail, userName, opponentName, reportId);
    processVideoInBackground(reportId, uploadId, opponentName, analysisOptions || ['defense', 'offense', 'pace'], userEmail, userName);
    
    res.json({ reportId, status: 'queued', message: 'Video received!' });
});

app.post('/api/upload/simple', upload.single('video'), async (req, res) => {
    try {
        const { opponentName, analysisOptions, userEmail, userName } = req.body;
        if (!req.file) return res.status(400).json({ error: 'No video' });
        
        const reportId = uuidv4();
        reports.set(reportId, {
            id: reportId, userEmail, userName: userName || 'Coach', opponentName,
            fileName: req.file.originalname, status: 'queued', progress: 0,
            progressText: 'Video received...', createdAt: new Date().toISOString()
        });
        
        await sendConfirmationEmail(userEmail, userName, opponentName, reportId);
        processSimpleUploadInBackground(reportId, req.file.path, opponentName,
            analysisOptions ? JSON.parse(analysisOptions) : ['defense', 'offense', 'pace'], userEmail, userName);
        
        res.json({ reportId, status: 'queued', message: 'Video received!' });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// ===========================================
// EMAIL FUNCTIONS
// ===========================================

async function sendConfirmationEmail(email, name, opponentName, reportId) {
    if (!process.env.RESEND_API_KEY) {
        console.log('📧 [SKIP] No RESEND_API_KEY');
        return;
    }
    try {
        await resend.emails.send({
            from: 'CoachIQ <reports@coachiq.com>',
            to: email,
            subject: `🏀 Analysis Started: ${opponentName}`,
            html: `<div style="font-family:Arial;max-width:600px;margin:0 auto;"><div style="background:linear-gradient(135deg,#FF6B35,#FF8E53);padding:30px;text-align:center;"><h1 style="color:white;margin:0;">🏀 CoachIQ</h1></div><div style="padding:30px;background:#f9f9f9;"><h2>Hey ${name || 'Coach'}!</h2><p>We've received your film for <strong>${opponentName}</strong>.</p><p>Our AI scout is analyzing:</p><ul><li>All defensive schemes (man, zone, press, junk)</li><li>All offensive sets and actions</li><li>Key player tendencies</li><li>Strategic recommendations</li></ul><p>We'll email you when ready (5-15 min).</p></div></div>`
        });
    } catch (e) { console.error('Email error:', e); }
}

async function sendCompletionEmail(email, name, opponentName, reportId, report) {
    if (!process.env.RESEND_API_KEY) return;
    try {
        const defense = report.defense?.primary?.scheme || report.defense?.primary || 'See report';
        const pace = report.pace?.rating || '--';
        const key = report.recommendations?.keysToVictory?.[0] || 'See full report';
        
        await resend.emails.send({
            from: 'CoachIQ <reports@coachiq.com>',
            to: email,
            subject: `✅ Report Ready: ${opponentName}`,
            html: `<div style="font-family:Arial;max-width:600px;margin:0 auto;"><div style="background:linear-gradient(135deg,#00D4AA,#00B894);padding:30px;text-align:center;"><h1 style="color:white;margin:0;">✅ Report Ready!</h1></div><div style="padding:30px;background:#f9f9f9;"><h2>Great news, ${name || 'Coach'}!</h2><p>Your report for <strong>${opponentName}</strong> is ready.</p><div style="background:white;border-radius:10px;padding:20px;margin:20px 0;"><table style="width:100%;"><tr><td style="padding:10px;border-bottom:1px solid #eee;">Primary Defense</td><td style="padding:10px;border-bottom:1px solid #eee;color:#FF6B35;font-weight:bold;text-align:right;">${defense}</td></tr><tr><td style="padding:10px;">Pace Rating</td><td style="padding:10px;color:#00D4AA;font-weight:bold;text-align:right;">${pace}/100</td></tr></table></div><div style="background:white;border-radius:10px;padding:20px;margin:20px 0;border-left:4px solid #00D4AA;"><strong>🔑 Key to Victory:</strong><p style="margin:10px 0 0 0;">${key}</p></div><div style="text-align:center;margin:30px 0;"><a href="https://coachiq.com/reports/${reportId}" style="background:linear-gradient(135deg,#FF6B35,#FF8E53);color:white;padding:15px 40px;text-decoration:none;border-radius:8px;font-weight:bold;display:inline-block;">View Full Report →</a></div></div></div>`
        });
    } catch (e) { console.error('Email error:', e); }
}

async function sendErrorEmail(email, name, opponentName, error) {
    if (!process.env.RESEND_API_KEY) return;
    try {
        await resend.emails.send({
            from: 'CoachIQ <reports@coachiq.com>',
            to: email,
            subject: `⚠️ Issue: ${opponentName}`,
            html: `<div style="font-family:Arial;max-width:600px;margin:0 auto;"><div style="background:#FF6B6B;padding:30px;text-align:center;"><h1 style="color:white;margin:0;">⚠️ Issue</h1></div><div style="padding:30px;background:#f9f9f9;"><h2>Hey ${name || 'Coach'},</h2><p>Issue with <strong>${opponentName}</strong> analysis.</p><p><strong>Error:</strong> ${error}</p><p>Try re-uploading a shorter clip (5-10 min) in MP4 format.</p></div></div>`
        });
    } catch (e) { console.error('Email error:', e); }
}

// ===========================================
// PROCESSING
// ===========================================

async function processVideoInBackground(reportId, uploadId, opponentName, analysisOptions, userEmail, userName) {
    const session = uploadSessions.get(uploadId);
    const tempDir = `/tmp/coachiq_${reportId}`;
    
    try {
        fs.mkdirSync(tempDir, { recursive: true });
        updateReport(reportId, { status: 'processing', progress: 5, progressText: 'Combining video...' });
        
        const combinedPath = path.join(tempDir, 'video.mp4');
        await combineChunks(session.chunksDir, combinedPath);
        fs.rmSync(session.chunksDir, { recursive: true, force: true });
        uploadSessions.delete(uploadId);
        
        await processVideoFile(reportId, combinedPath, opponentName, analysisOptions, userEmail, userName, tempDir);
    } catch (error) {
        console.error('Error:', error);
        updateReport(reportId, { status: 'failed', error: error.message });
        await sendErrorEmail(userEmail, userName, opponentName, error.message);
        cleanup(tempDir);
    }
}

async function processSimpleUploadInBackground(reportId, videoPath, opponentName, analysisOptions, userEmail, userName) {
    const tempDir = `/tmp/coachiq_${reportId}`;
    try {
        fs.mkdirSync(tempDir, { recursive: true });
        const originalPath = path.join(tempDir, 'video.mp4');
        fs.renameSync(videoPath, originalPath);
        await processVideoFile(reportId, originalPath, opponentName, analysisOptions, userEmail, userName, tempDir);
    } catch (error) {
        console.error('Error:', error);
        updateReport(reportId, { status: 'failed', error: error.message });
        await sendErrorEmail(userEmail, userName, opponentName, error.message);
        cleanup(tempDir);
    }
}

async function processVideoFile(reportId, videoPath, opponentName, analysisOptions, userEmail, userName, tempDir) {
    try {
        const videoInfo = await getVideoInfo(videoPath);
        const fileSizeMB = fs.statSync(videoPath).size / (1024 * 1024);
        
        let processedPath = videoPath;
        if (fileSizeMB > 200) {
            updateReport(reportId, { progress: 15, progressText: 'Compressing...' });
            processedPath = path.join(tempDir, 'compressed.mp4');
            await compressVideo(videoPath, processedPath);
        }
        
        updateReport(reportId, { progress: 30, progressText: 'Extracting frames...' });
        const frames = await extractFrames(processedPath, tempDir);
        
        updateReport(reportId, { progress: 45, progressText: 'AI analyzing schemes...' });
        const analysis = await analyzeWithClaude(frames, opponentName, analysisOptions);
        
        updateReport(reportId, { progress: 80, progressText: 'Generating report...' });
        const report = generateReport(analysis, opponentName, frames.length, videoInfo);
        
        reports.set(reportId, {
            ...reports.get(reportId),
            status: 'complete', progress: 100, progressText: 'Complete!',
            report, completedAt: new Date().toISOString()
        });
        
        await sendCompletionEmail(userEmail, userName, opponentName, reportId, report);
    } catch (error) {
        throw error;
    } finally {
        cleanup(tempDir);
    }
}

// ===========================================
// CLAUDE ANALYSIS
// ===========================================

async function analyzeWithClaude(frames, opponentName, analysisOptions) {
    if (frames.length === 0) throw new Error('No frames');

    const imageContent = frames.map(f => ({
        type: 'image',
        source: { type: 'base64', media_type: 'image/jpeg', data: f.base64 }
    }));

    const prompt = buildAnalysisPrompt(opponentName, frames.length, analysisOptions);

    console.log('🤖 Analyzing with comprehensive prompts...');
    
    const response = await anthropic.messages.create({
        model: 'claude-sonnet-4-20250514',
        max_tokens: 8192,
        system: SYSTEM_PROMPT,
        messages: [{ role: 'user', content: [{ type: 'text', text: prompt }, ...imageContent] }]
    });

    const text = response.content[0].text;
    const jsonMatch = text.match(/```json\s*([\s\S]*?)\s*```/) || text.match(/\{[\s\S]*\}/);
    
    if (jsonMatch) {
        return JSON.parse(jsonMatch[1] || jsonMatch[0]);
    }
    return null;
}

// ===========================================
// HELPERS
// ===========================================

function updateReport(reportId, updates) {
    const current = reports.get(reportId);
    if (current) reports.set(reportId, { ...current, ...updates });
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
            if (err) return reject(err);
            const video = metadata.streams.find(s => s.codec_type === 'video');
            resolve({ duration: metadata.format.duration, width: video?.width, height: video?.height });
        });
    });
}

function compressVideo(inputPath, outputPath) {
    return new Promise((resolve, reject) => {
        ffmpeg(inputPath)
            .outputOptions(['-c:v libx264', '-preset fast', '-crf 28', '-vf scale=854:-2', '-t 600', '-an', '-y'])
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
            .outputOptions(['-vf', 'fps=1/5,scale=800:-1', '-frames:v', '24', '-q:v', '4'])
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

function generateReport(analysis, opponentName, frameCount, videoInfo) {
    return {
        opponent: opponentName,
        generatedAt: new Date().toISOString(),
        framesAnalyzed: frameCount,
        videoDuration: videoInfo?.duration ? Math.round(videoInfo.duration) : null,
        skillLevel: analysis?.skillLevel || { estimated: 'unknown' },
        confidence: analysis?.confidence?.overall || 75,
        defense: analysis?.defense || { primary: { scheme: 'Unknown' } },
        offense: analysis?.offense || { primary: { system: 'Unknown' } },
        keyPlayers: analysis?.keyPlayers || [],
        pace: analysis?.pace || { rating: 50 },
        specialSituations: analysis?.specialSituations || {},
        teamStrengths: analysis?.teamStrengths || [],
        teamWeaknesses: analysis?.teamWeaknesses || [],
        recommendations: analysis?.recommendations || {}
    };
}

function cleanup(dir) {
    try { if (fs.existsSync(dir)) fs.rmSync(dir, { recursive: true, force: true }); } catch (e) {}
}

const PORT = process.env.PORT || 3001;
app.listen(PORT, () => {
    console.log(`🏀 CoachIQ v6.0 COMPREHENSIVE running on port ${PORT}`);
    console.log(`📊 All skill levels: Youth → Middle School → High School → College → Pro`);
    console.log(`🛡️ All defensive schemes: 40+ variations`);
    console.log(`⚡ All offensive sets: 60+ actions and plays`);
});
