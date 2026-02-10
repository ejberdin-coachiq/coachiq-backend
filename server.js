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
const { validateImage, compressImage, extractJSON, normalizeOrientation, computeTeamTotals } = require('./utils/imageProcessing');

// ===========================================
// ENVIRONMENT VALIDATION
// ===========================================

const NODE_ENV = process.env.NODE_ENV || 'development';
const PORT = process.env.PORT || 3000;
const FRONTEND_URL = process.env.FRONTEND_URL || '*';

if (!process.env.ANTHROPIC_API_KEY) {
    console.error('===========================================');
    console.error('FATAL: ANTHROPIC_API_KEY is not set.');
    console.error('');
    console.error('The server cannot start without this key.');
    console.error('');
    console.error('To fix this:');
    console.error('  Local:   export ANTHROPIC_API_KEY=your-key-here');
    console.error('  Railway: Add ANTHROPIC_API_KEY in your service Variables tab');
    console.error('           (Settings → Variables → New Variable)');
    console.error('===========================================');
    process.exit(1);
}

const app = express();

// Configure CORS with FRONTEND_URL
app.use(cors({
    origin: FRONTEND_URL === '*' ? '*' : FRONTEND_URL.split(',').map(u => u.trim()),
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization']
}));
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

---

### ADVANCED ANALYTICS TO TRACK

#### OFFENSIVE SET EFFICIENCY
For each offensive set/play identified, track:
- **Frequency**: How many times the set is run
- **Points Generated**: Estimated points scored from this set
- **Points Per Possession (PPP)**: Efficiency of the set
- **Primary Beneficiary**: Which player benefits most from this set

#### PLAYER-SPECIFIC SETS
Track which offensive sets are designed for specific players:
- Post-ups for bigs
- Pick and roll for ball handlers
- Pin downs/flares for shooters
- Isolation plays for scorers

#### PACE & POSSESSION METRICS
- **Possessions Observed**: Count total offensive possessions
- **Estimated Pace**: Project possessions per 40-minute game
- **Average Possession Length**: How long they take per possession
- **Shot Clock Usage**: Early (0-10 sec), Middle (10-20 sec), Late (20+ sec)

#### BALL MOVEMENT METRICS
- **Ball Reversals**: Number of times ball crosses the paint/lane
- **Passes Per Possession**: Average number of passes before shot
- **Skip Passes**: Long cross-court passes
- **Touch Distribution**: How many players touch the ball per possession

#### TRANSITION & TURNOVER METRICS
- **Transition Frequency**: % of possessions in transition
- **Transition Efficiency**: Points per transition possession
- **Turnover-to-Score Rate**: When opponent turns it over, how often do they score?
- **Live Ball vs Dead Ball Turnovers**: Which type leads to more opponent points?

#### TEAM VALUE IDENTIFICATION
Identify the MOST VALUABLE aspect of each team's game:
- Is it their transition offense?
- Their half-court execution?
- A specific player?
- Their defensive intensity?
- Their rebounding?
- Their ball movement?

---

### ADVANCED ANALYTICS TO TRACK

#### OFFENSIVE SET EFFICIENCY
Track each offensive set with:
- **Frequency** - How often they run it (% of possessions)
- **Points Per Possession (PPP)** - Points scored when running this set
- **Outcome** - Score, turnover, missed shot, foul drawn
- **Primary Option** - Who the play is designed for
- **Success Rate** - % of times the play achieves its goal

#### PLAYER-SPECIFIC SETS
Identify which offensive sets are run specifically for certain players:
- Post-ups for specific bigs
- Isolation plays for scorers
- Pin-downs/screens for shooters
- Pick-and-roll with specific ball handlers
- Designed plays after timeouts for closers

#### PACE & TEMPO METRICS
- **Possessions per game estimate** - Based on pace of play observed
- **Average possession length** - Seconds per possession
- **Shot clock usage** - Early (0-10 sec), Middle (10-20 sec), Late (20-30+ sec)
- **Transition frequency** - % of possessions in transition vs half-court
- **Secondary break usage** - Do they run early offense before full set?

#### BALL MOVEMENT ANALYTICS
- **Reversals per possession** - How often ball goes side-to-side
- **Passes before shot** - Average number of passes
- **Drive-and-kick frequency** - Penetration creating open shots
- **Skip pass usage** - Ball movement skipping one or more players
- **Post entry frequency** - How often they feed the post

#### TURNOVER ANALYSIS
- **Live ball turnovers** - Steals that lead to fast breaks
- **Dead ball turnovers** - Out of bounds, offensive fouls, violations
- **Turnover conversion rate** - % of turnovers that become opponent scores
- **Turnover-to-score speed** - How quickly turnovers become points
- **High turnover situations** - When/where turnovers happen most

#### TEAM VALUE IDENTIFICATION
Identify the MOST VALUABLE aspects of a team's game:
- **Offensive identity** - What makes them dangerous (3PT shooting, post play, transition, etc.)
- **Go-to plays** - What they run when they NEED a bucket
- **Defensive identity** - What makes them hard to score against
- **X-factor** - The intangible that makes them win games
- **Clutch tendencies** - What they do in close games

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
1. Base your analysis on what you observe in the frames, but ALWAYS provide your best estimates for ALL numeric fields - never return text like "Unable to determine" or "No data" where a number is expected
2. Don't fabricate jersey numbers or player names you can't read
3. Use the confidence scores (0-100) to express how certain you are - low confidence is fine, but always provide numeric estimates
4. If you see a simplified version of a scheme, identify it appropriately
5. Consider the apparent skill level when making identifications
6. Provide actionable insights regardless of competition level
7. Even with limited footage, extrapolate reasonable estimates from what you CAN see - a few possessions can reveal tendencies`;

// ===========================================
// ANALYSIS PROMPT BUILDER
// ===========================================

function buildAnalysisPrompt(opponentName, frameCount, analysisOptions, teamInfo = null) {
    // Build team identification section if teamInfo is provided
    let teamIdentification = '';
    const opponentColor = teamInfo?.opponent?.jerseyColor?.toUpperCase() || null;
    const yourTeamColor = teamInfo?.yourTeam?.jerseyColor?.toUpperCase() || null;

    if (teamInfo && teamInfo.opponent && teamInfo.yourTeam && opponentColor) {
        teamIdentification = `
## 🎽 CRITICAL: TEAM IDENTIFICATION

**You MUST distinguish between the two teams by their uniform/jersey colors.**

Note: Basketball courts are typically light-colored hardwood with white boundary lines. Do NOT confuse court markings or the court surface with jersey colors. Focus on the PLAYERS' UNIFORMS to identify teams.

| Team | Uniform Color | Role |
|------|---------------|------|
| **${teamInfo.opponent.name || opponentName}** | **${opponentColor}** uniforms/jerseys | ⚠️ **SCOUT THIS TEAM** - All analysis focuses here |
| **${teamInfo.yourTeam.name || 'Your Team'}** | **${yourTeamColor || 'UNKNOWN'}** uniforms/jerseys | Context only - note how they are affected by the opponent |

**INSTRUCTIONS:**
- Focus ALL analysis (offense AND defense) on the players wearing **${opponentColor}**-colored uniforms
- Identify ${opponentColor}-uniformed players by their jersey numbers and positions on the court
- Use the ${yourTeamColor || 'other'}-uniformed team only as context to understand what the ${opponentColor} team is doing
- If ${opponentColor} uniforms are hard to distinguish from the court or background, look for jersey numbers, shorts color, and shoe colors to track those players

---
`;
    } else {
        teamIdentification = `
## ⚠️ TEAM IDENTIFICATION

No specific jersey colors were provided. Identify the two teams by their uniform colors, then provide comprehensive analysis of the team that appears to be the visiting/opponent team. Look at jersey colors, shorts, and shoes to distinguish the two teams. Provide context about both teams but focus the final report on one consistent team.

---
`;
    }

    return `# COMPREHENSIVE SCOUTING ANALYSIS

**Opponent:** ${opponentName}
**Frames:** ${frameCount}
**Focus Areas:** ${analysisOptions.join(', ')}

---
${teamIdentification}
## INSTRUCTIONS

Analyze these game frames and identify EVERYTHING you can observe about the **${teamInfo?.opponent?.jerseyColor?.toUpperCase() || 'opponent'}** team's offensive and defensive schemes. Identify players on this team by their uniform color, jersey numbers, and positions on the court. Consider all skill levels - this could be youth, middle school, high school, college, or professional basketball.

**Remember: Focus your analysis on the players wearing ${teamInfo?.opponent?.jerseyColor?.toUpperCase() || 'the specified'} uniforms/jerseys. Do not confuse court markings or the light-colored court surface with uniform colors.**

Use the comprehensive basketball knowledge provided to identify specific schemes, sets, and actions.

---

## DEFENSIVE IDENTIFICATION CHECKLIST

**Analyze the ${teamInfo?.opponent?.jerseyColor?.toUpperCase() || 'OPPONENT'}-uniformed team's defense:**

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

## ADVANCED ANALYTICS CHECKLIST

### Offensive Set Efficiency
For EACH set you identify, track:
- [ ] How many times was it run?
- [ ] Did it result in a score, miss, or turnover?
- [ ] Who is the primary option on this play?
- [ ] What percentage of possessions use this set?
- [ ] Estimate points per possession for this set

### Player-Specific Sets
- [ ] Which plays are designed specifically for certain players?
- [ ] Who gets ISO plays?
- [ ] Who do they run pick and roll for?
- [ ] Who gets screens set for them?
- [ ] What is each key player's go-to move?

### Pace & Tempo
- [ ] How fast do they play? (estimate possessions per game)
- [ ] How long are their possessions on average?
- [ ] Do they shoot early, middle, or late in shot clock?
- [ ] What % of possessions are transition vs half-court?
- [ ] Do they push pace or control tempo?

### Ball Movement Deep Dive
- [ ] How many times per possession do they reverse the ball?
- [ ] Average passes before a shot attempt?
- [ ] Do they penetrate and kick frequently?
- [ ] Do they use skip passes?
- [ ] How often do they enter the post?
- [ ] Does the ball stick with certain players?

### Turnover Patterns
- [ ] Are turnovers live ball (steals) or dead ball (violations)?
- [ ] What % of turnovers become opponent scores?
- [ ] Where/when do turnovers happen most?
- [ ] What causes their turnovers?
- [ ] How can you force turnovers against them?

### Team Value Assessment
- [ ] What is their SINGLE MOST VALUABLE offensive trait?
- [ ] What makes them MOST DANGEROUS?
- [ ] What is their go-to play when they NEED a bucket?
- [ ] What do they do in CLUTCH situations?
- [ ] What is the X-FACTOR that wins them games?
- [ ] What MUST you stop to beat this team?

### Shot Chart Analysis
For EVERY shot attempt observed, track:
- [ ] Where on the court was the shot taken? (estimate x,y coordinates on a 50x47 court, origin at bottom-left)
- [ ] Was it made or missed?
- [ ] What type of shot? (layup, mid-range, three-pointer, floater, dunk, free throw)
- [ ] Who took the shot? (jersey number if visible)
- [ ] Identify HOT ZONES (areas shooting above 45%)
- [ ] Identify COLD ZONES (areas shooting below 30%)
- [ ] Calculate shooting percentage by area: paint, mid-range left, mid-range right, left corner 3, right corner 3, wing 3 left, wing 3 right, top of key 3

### Starting Five / Key Player Analysis
Identify the 5 most important players (starting five or top rotation):
- [ ] Jersey number and position for each
- [ ] Offensive strengths (at least 2-3 per player)
- [ ] Offensive weaknesses (at least 1-2 per player)
- [ ] Defensive strengths and weaknesses
- [ ] How to guard each player specifically (scouting advice)
- [ ] Physical profile and athleticism notes

### Out of Bounds Play Analysis
Track ALL out of bounds situations:
- [ ] BLOB (Baseline Out of Bounds): How many observed? What sets do they run? Who is the inbounder? Primary scoring option?
- [ ] SLOB (Sideline Out of Bounds): How many observed? What sets do they run? Who is the inbounder? Primary scoring option?
- [ ] Do they score frequently off OOB plays?
- [ ] How to defend their BLOB plays specifically
- [ ] How to defend their SLOB plays specifically

### Primary Ball Handler Analysis
Identify the player who handles the ball the most:
- [ ] Jersey number and name/description
- [ ] What percentage of possessions does this player have the ball?
- [ ] Dominant hand and preferred direction
- [ ] Ball handling tendencies (crossover, between legs, hesitation, etc.)
- [ ] Decision-making in pick and roll (pass, drive, pull-up)
- [ ] Turnover tendencies (when/where do they turn it over)
- [ ] Best defensive strategy to contain this player

### Set Frequency & Scoring (TRACK EVERY SET)
For each offensive set identified, count:
- [ ] How many times was this EXACT set run?
- [ ] How many POINTS were scored from this set?
- [ ] Calculate Points Per Possession for this set
- [ ] Who is the PRIMARY beneficiary of this set?
- [ ] What is the best way to DEFEND this set?

Example tracking:
- Flex: Run 8 times, scored 10 points = 1.25 PPP
- Horns PnR: Run 12 times, scored 16 points = 1.33 PPP
- Transition: Run 7 times, scored 10 points = 1.43 PPP

### Ball Reversal Tracking
- [ ] COUNT total ball reversals observed
- [ ] Calculate reversals PER POSSESSION
- [ ] Note IMPACT of reversals (better shots after reversal?)
- [ ] Identify if reversals are part of their offense design or forced

### Turnover-to-Score Conversion
When you see a turnover, track:
- [ ] Was it LIVE ball (steal) or DEAD ball (out of bounds)?
- [ ] Did it result in OPPONENT SCORE?
- [ ] How QUICKLY did score happen after turnover?
- [ ] Calculate CONVERSION RATE (turnovers that become scores)

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

  "paceAndTempo": {
    "possessionsPerGameEstimate": 65,
    "paceRating": 72,
    "paceCategory": "slow | moderate | fast | very_fast",
    "averagePossessionLength": "18 seconds",
    "shotClockUsage": {
      "early": 15,
      "middle": 45,
      "late": 40,
      "description": "Patient team that works for good shots"
    },
    "transitionFrequency": {
      "percentage": 22,
      "style": "push_always | opportunistic | conservative",
      "effectiveness": "How well they score in transition"
    },
    "tempoControl": "Do they speed up or slow down based on situation"
  },

  "offensiveSetEfficiency": {
    "setBreakdown": [
      {
        "setName": "Horns Flare",
        "timesRun": 12,
        "frequency": 28,
        "pointsScored": 14,
        "pointsPerPossession": 1.17,
        "outcomes": {
          "scores": 6,
          "missedShots": 4,
          "turnovers": 1,
          "foulsDrawn": 1
        },
        "successRate": 58,
        "primaryOption": "#23 off the flare screen",
        "notes": "Most effective when run to the right side"
      }
    ],
    "mostEfficientSet": {
      "name": "Pick and Roll with #23/#34",
      "ppp": 1.24,
      "whyItWorks": "Roll man finishes at rim, defense collapses"
    },
    "leastEfficientSet": {
      "name": "Isolation for #11",
      "ppp": 0.72,
      "whyItFails": "Predictable, no secondary options"
    }
  },

  "playerSpecificSets": [
    {
      "player": "#23 (Point Guard)",
      "designedPlays": [
        {
          "setName": "High Pick and Roll",
          "frequency": "35% of his possessions",
          "effectiveness": "1.18 PPP",
          "bestCounter": "ICE the ball screen, wall off"
        },
        {
          "setName": "Isolation Left Wing",
          "frequency": "15% of his possessions",
          "effectiveness": "0.89 PPP",
          "bestCounter": "Force right, no help needed"
        }
      ],
      "goToMove": "Step-back three from right wing",
      "comfortZone": "Right side of floor, top of key"
    }
  ],

  "ballMovementAnalytics": {
    "reversalsPerPossession": 1.8,
    "reversalTendency": "heavy | moderate | light | rare",
    "passesBeforeShot": 4.2,
    "driveAndKick": {
      "frequency": "How often they penetrate and kick",
      "effectiveness": "Points generated from drive-kicks",
      "primaryDrivers": ["#23", "#5"]
    },
    "skipPassUsage": {
      "frequency": "How often they skip the ball",
      "situations": "When they use skip passes",
      "effectiveness": "Open shots generated"
    },
    "postEntryFrequency": {
      "percentage": 18,
      "primaryPostPlayers": ["#34", "#44"],
      "postToPPP": 0.92
    },
    "ballMovementRating": "excellent | good | average | poor",
    "stagnationTendency": "Does ball stick with certain players"
  },

  "turnoverAnalysis": {
    "estimatedTurnoverRate": 14,
    "turnoverTypes": {
      "liveBall": {
        "frequency": 60,
        "description": "Steals leading to fast breaks"
      },
      "deadBall": {
        "frequency": 40,
        "description": "Out of bounds, charges, violations"
      }
    },
    "turnoverConversion": {
      "conversionRate": 72,
      "description": "72% of their turnovers become opponent scores",
      "averagePointsOffTurnover": 1.4,
      "fastBreakAfterTurnover": "How quickly opponents score"
    },
    "highTurnoverSituations": [
      {
        "situation": "Entry passes to post",
        "frequency": "Most common turnover",
        "cause": "Weak entry passes, active hands on defense"
      },
      {
        "situation": "Transition turnovers",
        "frequency": "Second most common",
        "cause": "Pushing pace too fast, poor decisions"
      }
    ],
    "turnoverVulnerabilities": "When and how to force turnovers against them"
  },

  "teamValueIdentification": {
    "offensiveIdentity": {
      "primaryStrength": "Three-point shooting from corners",
      "whatMakesThemDangerous": "Ball movement creates open 3s, 5 shooters",
      "offensiveRating": 112,
      "scoringDistribution": {
        "paint": 38,
        "midRange": 18,
        "threePoint": 44
      }
    },
    "defensiveIdentity": {
      "primaryStrength": "Rim protection and shot blocking",
      "whatMakesThemTough": "Length disrupts shots, force difficult finishes",
      "defensiveRating": 105
    },
    "goToPlays": {
      "needABucket": "Horns into high pick and roll for #23",
      "lastShot": "Clear out ISO for #23 on right wing",
      "afterTimeout": "Stagger screens for #11 three-pointer"
    },
    "xFactor": {
      "description": "The intangible that wins them games",
      "player": "Who is their X-factor",
      "situation": "When they elevate their play"
    },
    "clutchTendencies": {
      "closeGameStrategy": "What they do with lead vs trailing",
      "finalMinutePlays": "Go-to actions in crunch time",
      "freeThrowShooting": "Who shoots in pressure situations"
    },
    "mostValuableAspect": "SINGLE MOST IMPORTANT THING - What you MUST stop to beat them"
  },

  "offensiveSetTracking": {
    "totalPossessionsObserved": 45,
    "setBySetBreakdown": [
      {
        "setName": "Flex",
        "timesRun": 8,
        "pointsScored": 10,
        "pointsPerPossession": 1.25,
        "percentageOfPossessions": 18,
        "outcomes": {
          "madeBaskets": 4,
          "missedShots": 3,
          "turnovers": 1,
          "foulsDrawn": 0
        },
        "primaryBeneficiary": "#23 - gets open on baseline cut",
        "bestDefense": "Switch the down screen, front the cutter"
      },
      {
        "setName": "Horns PnR",
        "timesRun": 12,
        "pointsScored": 16,
        "pointsPerPossession": 1.33,
        "percentageOfPossessions": 27,
        "outcomes": {
          "madeBaskets": 7,
          "missedShots": 4,
          "turnovers": 1,
          "foulsDrawn": 2
        },
        "primaryBeneficiary": "#23 as ball handler, #34 as roll man",
        "bestDefense": "ICE the ball screen, tag the roller"
      }
    ],
    "mostRunSet": {
      "name": "Horns PnR",
      "frequency": "27% of possessions"
    },
    "mostEfficientSet": {
      "name": "Transition",
      "ppp": 1.45
    },
    "leastEfficientSet": {
      "name": "Post Iso for #44",
      "ppp": 0.67
    }
  },

  "playerSetAssignments": [
    {
      "player": "#23 (Point Guard)",
      "setsRunForThisPlayer": [
        { "set": "High PnR", "frequency": 35, "ppp": 1.18 },
        { "set": "ISO Left Wing", "frequency": 12, "ppp": 0.89 }
      ],
      "totalTouches": "Handles ball 68% of half-court possessions",
      "mostEffectiveAction": "PnR going right, attack or kick"
    },
    {
      "player": "#11 (Shooting Guard)",
      "setsRunForThisPlayer": [
        { "set": "Pin Down", "frequency": 22, "ppp": 1.08 },
        { "set": "Floppy", "frequency": 15, "ppp": 1.12 }
      ],
      "totalTouches": "Catch and shoot specialist",
      "mostEffectiveAction": "Coming off stagger screens"
    }
  ],

  "paceAnalysis": {
    "possessionsObserved": 45,
    "videoLengthMinutes": 20,
    "possessionsPer40Minutes": 90,
    "estimatedPossessionsPerGame": 68,
    "paceCategory": "moderate",
    "paceRating": 72,
    "averagePossessionLength": "16.5 seconds",
    "shotClockBreakdown": {
      "early0to10": { "percentage": 22, "ppp": 1.35 },
      "middle10to20": { "percentage": 48, "ppp": 1.02 },
      "late20plus": { "percentage": 30, "ppp": 0.78 }
    },
    "tempoNotes": "Push in transition but patient in half-court"
  },

  "ballMovementMetrics": {
    "totalBallReversals": 67,
    "reversalsPerPossession": 1.8,
    "reversalImpact": "Shots after reversal: 48% vs 34% without",
    "passesPerPossession": 4.2,
    "skipPassFrequency": "12 skip passes observed",
    "touchDistribution": {
      "description": "Average 3.8 players touch ball per possession",
      "ballDominantPlayers": ["#23 - 42% of touches", "#11 - 18% of touches"]
    },
    "stagnationWarning": "Ball sticks with #23 when play breaks down"
  },

  "turnoverToScoreAnalysis": {
    "opponentTurnoversObserved": 8,
    "turnoversConvertedToScores": 6,
    "turnoverConversionRate": 75,
    "averagePointsPerConversion": 1.67,
    "conversionBreakdown": {
      "liveBallTurnovers": {
        "count": 5,
        "convertedToScore": 5,
        "conversionRate": 100,
        "averageTimeToScore": "4.2 seconds"
      },
      "deadBallTurnovers": {
        "count": 3,
        "convertedToScore": 1,
        "conversionRate": 33,
        "averageTimeToScore": "12.5 seconds"
      }
    },
    "transitionAfterTurnover": "Excellent - push hard after steals",
    "keyInsight": "Force dead ball turnovers, don't gamble for steals"
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
      "blob": {
        "observed": true,
        "frequency": 5,
        "commonSets": ["Stack", "Box", "Line"],
        "inbounder": "#5 - Point Guard",
        "primaryOption": "#23 on curl to basket",
        "scoringRate": "Scored on 3 of 5 attempts",
        "howToDefend": "Switch on all screens, deny inbound to strong side"
      },
      "slob": {
        "observed": true,
        "frequency": 3,
        "commonSets": ["Zipper", "Floppy"],
        "inbounder": "#11 - Shooting Guard",
        "primaryOption": "#23 off stagger screen",
        "scoringRate": "Scored on 1 of 3 attempts",
        "howToDefend": "Deny the first pass, force long inbound"
      }
    },
    "weaknesses": [
      {
        "weakness": "Specific offensive weakness",
        "howToExploit": "How to take advantage defensively"
      }
    ],
    "strengths": ["Offensive strength 1", "Offensive strength 2"]
  },

  "startingFive": [
    {
      "jerseyNumber": "#23",
      "position": "PG | SG | SF | PF | C",
      "role": "primary_ball_handler | scorer | screener | shooter | rim_protector | glue_guy",
      "usage": "Estimated % of offense involvement",
      "strengths": ["Quick first step", "Excellent court vision", "Consistent 3-point shooter"],
      "weaknesses": ["Weak left hand", "Struggles against physical defense"],
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
      "howToGuard": "Force left, deny catch on right wing, go over screens, no help needed on drives left",
      "notes": "Additional observations"
    }
  ],

  "keyPlayers": [
    {
      "identifier": "Jersey # or description",
      "position": "PG | SG | SF | PF | C",
      "role": "primary_ball_handler | scorer | screener | shooter | rim_protector | glue_guy",
      "usage": "Estimated % of offense involvement",
      "strengths": ["Strength 1", "Strength 2"],
      "weaknesses": ["Weakness 1", "Weakness 2"],
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
      "howToGuard": "Specific defensive strategy for this player",
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

  "shotChart": {
    "shots": [
      {
        "player": "#23",
        "x": 25,
        "y": 32,
        "made": true,
        "shotType": "three_pointer | mid_range | layup | floater | dunk | free_throw",
        "area": "paint | mid_left | mid_right | left_corner_3 | right_corner_3 | left_wing_3 | right_wing_3 | top_key_3"
      }
    ],
    "totalShots": 45,
    "totalMade": 22,
    "overallPercentage": 48.9,
    "byArea": {
      "paint": { "attempts": 15, "made": 10, "percentage": 66.7 },
      "midRange": { "attempts": 8, "made": 3, "percentage": 37.5 },
      "leftCorner3": { "attempts": 4, "made": 2, "percentage": 50.0 },
      "rightCorner3": { "attempts": 5, "made": 3, "percentage": 60.0 },
      "leftWing3": { "attempts": 5, "made": 2, "percentage": 40.0 },
      "rightWing3": { "attempts": 4, "made": 1, "percentage": 25.0 },
      "topKey3": { "attempts": 4, "made": 1, "percentage": 25.0 }
    },
    "hotZones": [
      { "area": "paint", "percentage": 66.7, "description": "Dominant inside scoring" },
      { "area": "right_corner_3", "percentage": 60.0, "description": "Corner specialist" }
    ],
    "coldZones": [
      { "area": "right_wing_3", "percentage": 25.0, "description": "Avoid forcing shots here" }
    ]
  },

  "primaryBallHandler": {
    "jerseyNumber": "#23",
    "description": "Point Guard, team captain",
    "possessionPercentage": 68,
    "dominantHand": "right",
    "preferredDirection": "right",
    "ballHandlingMoves": ["crossover", "between_legs", "hesitation", "step_back"],
    "tendencies": {
      "pickAndRoll": "Attacks right side, reads roller vs pop, prefers pocket pass",
      "isolation": "Step-back three from right wing, drives left reluctantly",
      "transition": "Pushes pace aggressively, looks for outlet ahead first",
      "halfCourt": "Calls sets, uses DHO with wing players, patient"
    },
    "decisionMaking": {
      "passFirst": false,
      "turnoverProne": "Under pressure from traps and aggressive hedges",
      "assistRate": "Estimated 6-8 assists per game",
      "readQuality": "Good reads off PnR, struggles vs switching defenses"
    },
    "defensiveStrategy": {
      "primary": "Force left - he is significantly weaker going left",
      "onScreens": "ICE ball screens to keep him on his weak hand",
      "inTransition": "Get back and set up, don't let him push pace",
      "pressure": "Full court pressure causes turnovers, pick him up early",
      "trapping": "Trap on strong side ball screens, rotate weak side"
    }
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

CRITICAL RESPONSE RULES:
- ALL numeric fields MUST contain actual numbers, never text like "Unable to determine" or "N/A"
- If uncertain, provide your best estimate and reflect uncertainty in the confidence scores
- Even from limited frames, you can identify defensive stance (man vs zone), offensive spacing, pace tendencies, and ball movement patterns
- Identify the specific scheme names from the reference list
- Consider the skill level when evaluating execution
- Provide actionable recommendations for any coaching level
- A low-confidence numeric estimate is ALWAYS better than "Unable to determine"`;
}

// ===========================================
// ENDPOINTS
// ===========================================

app.get('/', (req, res) => {
    res.json({ 
        status: 'CoachIQ API running', 
        version: '6.0.0-comprehensive',
        features: ['all-skill-levels', 'complete-scheme-recognition', 'pro-analysis', 'scorebook-analysis']
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
    const { uploadId, opponentName, analysisOptions, userEmail, userName, teamInfo } = req.body;
    const session = uploadSessions.get(uploadId);
    if (!session) return res.status(404).json({ error: 'Session not found' });
    
    const reportId = uuidv4();
    reports.set(reportId, {
        id: reportId, userEmail, userName: userName || 'Coach', opponentName,
        fileName: session.fileName, status: 'queued', progress: 0,
        progressText: 'Video received...', createdAt: new Date().toISOString(),
        teamInfo: teamInfo || null
    });
    
    await sendConfirmationEmail(userEmail, userName, opponentName, reportId);
    processVideoInBackground(reportId, uploadId, opponentName, analysisOptions || ['defense', 'offense', 'pace'], userEmail, userName, teamInfo);
    
    res.json({ reportId, status: 'queued', message: 'Video received!' });
});

app.post('/api/upload/simple', upload.single('video'), async (req, res) => {
    try {
        const { opponentName, analysisOptions, userEmail, userName, teamInfo } = req.body;
        if (!req.file) return res.status(400).json({ error: 'No video' });
        
        // Parse teamInfo if it's a string
        let parsedTeamInfo = null;
        if (teamInfo) {
            try {
                parsedTeamInfo = typeof teamInfo === 'string' ? JSON.parse(teamInfo) : teamInfo;
            } catch (e) {
                console.warn('Could not parse teamInfo:', e);
            }
        }
        
        const reportId = uuidv4();
        reports.set(reportId, {
            id: reportId, userEmail, userName: userName || 'Coach', opponentName,
            fileName: req.file.originalname, status: 'queued', progress: 0,
            progressText: 'Video received...', createdAt: new Date().toISOString(),
            teamInfo: parsedTeamInfo
        });
        
        await sendConfirmationEmail(userEmail, userName, opponentName, reportId);
        processSimpleUploadInBackground(reportId, req.file.path, opponentName,
            analysisOptions ? JSON.parse(analysisOptions) : ['defense', 'offense', 'pace'], userEmail, userName, parsedTeamInfo);
        
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

async function processVideoInBackground(reportId, uploadId, opponentName, analysisOptions, userEmail, userName, teamInfo = null) {
    const session = uploadSessions.get(uploadId);
    const tempDir = `/tmp/coachiq_${reportId}`;
    
    try {
        fs.mkdirSync(tempDir, { recursive: true });
        updateReport(reportId, { status: 'processing', progress: 5, progressText: 'Combining video...' });
        
        const combinedPath = path.join(tempDir, 'video.mp4');
        await combineChunks(session.chunksDir, combinedPath);
        fs.rmSync(session.chunksDir, { recursive: true, force: true });
        uploadSessions.delete(uploadId);
        
        await processVideoFile(reportId, combinedPath, opponentName, analysisOptions, userEmail, userName, tempDir, teamInfo);
    } catch (error) {
        console.error('Error:', error);
        updateReport(reportId, { status: 'failed', error: error.message });
        await sendErrorEmail(userEmail, userName, opponentName, error.message);
        cleanup(tempDir);
    }
}

async function processSimpleUploadInBackground(reportId, videoPath, opponentName, analysisOptions, userEmail, userName, teamInfo = null) {
    const tempDir = `/tmp/coachiq_${reportId}`;
    try {
        fs.mkdirSync(tempDir, { recursive: true });
        const originalPath = path.join(tempDir, 'video.mp4');
        fs.renameSync(videoPath, originalPath);
        await processVideoFile(reportId, originalPath, opponentName, analysisOptions, userEmail, userName, tempDir, teamInfo);
    } catch (error) {
        console.error('Error:', error);
        updateReport(reportId, { status: 'failed', error: error.message });
        await sendErrorEmail(userEmail, userName, opponentName, error.message);
        cleanup(tempDir);
    }
}

async function processVideoFile(reportId, videoPath, opponentName, analysisOptions, userEmail, userName, tempDir, teamInfo = null) {
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
        const frames = await extractFrames(processedPath, tempDir, videoInfo?.duration);
        
        // Log team info for debugging
        if (teamInfo) {
            console.log(`🎽 Team Info: Opponent(${teamInfo.opponent?.name})=${teamInfo.opponent?.jerseyColor}, YourTeam(${teamInfo.yourTeam?.name})=${teamInfo.yourTeam?.jerseyColor}`);
        }
        
        updateReport(reportId, { progress: 45, progressText: 'AI analyzing schemes...' });
        const analysis = await analyzeWithClaude(frames, opponentName, analysisOptions, teamInfo);
        
        updateReport(reportId, { progress: 80, progressText: 'Generating report...' });
        const report = generateReport(analysis, opponentName, frames.length, videoInfo, teamInfo);
        
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

async function analyzeWithClaude(frames, opponentName, analysisOptions, teamInfo = null) {
    if (frames.length === 0) throw new Error('No frames');

    const imageContent = frames.map(f => ({
        type: 'image',
        source: { type: 'base64', media_type: 'image/jpeg', data: f.base64 }
    }));

    const prompt = buildAnalysisPrompt(opponentName, frames.length, analysisOptions, teamInfo);

    console.log('🤖 Analyzing with comprehensive prompts...');
    if (teamInfo) {
        console.log(`   Team Info: Opponent=${teamInfo.opponent?.jerseyColor}, YourTeam=${teamInfo.yourTeam?.jerseyColor}`);
    }
    
    const response = await anthropic.messages.create({
        model: 'claude-sonnet-4-20250514',
        max_tokens: 16384,
        system: SYSTEM_PROMPT,
        messages: [{ role: 'user', content: [{ type: 'text', text: prompt }, ...imageContent] }]
    });

    const text = response.content[0].text;
    console.log(`📊 Claude response length: ${text.length} chars, stop_reason: ${response.stop_reason}`);

    if (response.stop_reason === 'max_tokens') {
        console.warn('⚠️ Response was truncated due to max_tokens limit - JSON may be incomplete');
    }

    const jsonMatch = text.match(/```json\s*([\s\S]*?)\s*```/) || text.match(/\{[\s\S]*\}/);

    if (jsonMatch) {
        try {
            const parsed = JSON.parse(jsonMatch[1] || jsonMatch[0]);
            console.log(`✅ Successfully parsed analysis JSON (confidence: ${parsed?.confidence?.overall || 'N/A'})`);
            return parsed;
        } catch (parseError) {
            console.error(`❌ JSON parse error: ${parseError.message}`);
            console.error(`   Raw match (first 500 chars): ${(jsonMatch[1] || jsonMatch[0]).substring(0, 500)}`);
            return null;
        }
    }
    console.error('❌ No JSON found in Claude response');
    console.error(`   Response preview: ${text.substring(0, 500)}`);
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
            .outputOptions(['-c:v libx264', '-preset fast', '-crf 23', '-vf scale=854:-2', '-an', '-y'])
            .output(outputPath)
            .on('end', () => resolve(outputPath))
            .on('error', reject)
            .run();
    });
}

async function extractFrames(videoPath, outputDir, videoDuration = null) {
    return new Promise((resolve, reject) => {
        const frames = [];
        const framesDir = path.join(outputDir, 'frames');
        fs.mkdirSync(framesDir, { recursive: true });

        // Dynamically calculate frame interval to cover the ENTIRE video
        const MAX_FRAMES = 60;
        const MIN_INTERVAL = 3; // seconds - minimum gap between frames
        const duration = videoDuration ? parseFloat(videoDuration) : 120;

        // Calculate interval so frames span the full video
        const interval = Math.max(MIN_INTERVAL, Math.ceil(duration / MAX_FRAMES));
        const maxFrames = Math.min(MAX_FRAMES, Math.ceil(duration / interval));

        console.log(`🎬 Frame extraction: ${Math.round(duration)}s video → 1 frame every ${interval}s, max ${maxFrames} frames`);

        ffmpeg(videoPath)
            .outputOptions(['-vf', `fps=1/${interval},scale=800:-2`, '-frames:v', `${maxFrames}`, '-q:v', '2'])
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

// Sanitize AI response: ensure numeric fields contain numbers, not text
function sanitizeNumeric(value, fallback = null) {
    if (value === null || value === undefined) return fallback;
    if (typeof value === 'number' && !isNaN(value)) return value;
    if (typeof value === 'string') {
        const parsed = parseFloat(value);
        if (!isNaN(parsed)) return parsed;
    }
    return fallback;
}

function sanitizeAnalysis(analysis) {
    if (!analysis) return analysis;

    // Sanitize pace
    if (analysis.pace) {
        analysis.pace.rating = sanitizeNumeric(analysis.pace.rating, 50);
    }

    // Sanitize paceAndTempo
    if (analysis.paceAndTempo) {
        analysis.paceAndTempo.possessionsPerGameEstimate = sanitizeNumeric(analysis.paceAndTempo.possessionsPerGameEstimate);
        analysis.paceAndTempo.paceRating = sanitizeNumeric(analysis.paceAndTempo.paceRating);
    }

    // Sanitize paceAnalysis
    if (analysis.paceAnalysis) {
        analysis.paceAnalysis.possessionsObserved = sanitizeNumeric(analysis.paceAnalysis.possessionsObserved);
        analysis.paceAnalysis.estimatedPossessionsPerGame = sanitizeNumeric(analysis.paceAnalysis.estimatedPossessionsPerGame);
        analysis.paceAnalysis.paceRating = sanitizeNumeric(analysis.paceAnalysis.paceRating);
    }

    // Sanitize ballMovementAnalytics
    if (analysis.ballMovementAnalytics) {
        analysis.ballMovementAnalytics.reversalsPerPossession = sanitizeNumeric(analysis.ballMovementAnalytics.reversalsPerPossession);
        analysis.ballMovementAnalytics.passesBeforeShot = sanitizeNumeric(analysis.ballMovementAnalytics.passesBeforeShot);
    }

    // Sanitize ballMovementMetrics
    if (analysis.ballMovementMetrics) {
        analysis.ballMovementMetrics.totalBallReversals = sanitizeNumeric(analysis.ballMovementMetrics.totalBallReversals);
        analysis.ballMovementMetrics.reversalsPerPossession = sanitizeNumeric(analysis.ballMovementMetrics.reversalsPerPossession);
        analysis.ballMovementMetrics.passesPerPossession = sanitizeNumeric(analysis.ballMovementMetrics.passesPerPossession);
    }

    // Sanitize turnoverAnalysis
    if (analysis.turnoverAnalysis) {
        analysis.turnoverAnalysis.estimatedTurnoverRate = sanitizeNumeric(analysis.turnoverAnalysis.estimatedTurnoverRate);
    }

    // Sanitize turnoverToScoreAnalysis
    if (analysis.turnoverToScoreAnalysis) {
        analysis.turnoverToScoreAnalysis.opponentTurnoversObserved = sanitizeNumeric(analysis.turnoverToScoreAnalysis.opponentTurnoversObserved);
        analysis.turnoverToScoreAnalysis.turnoversConvertedToScores = sanitizeNumeric(analysis.turnoverToScoreAnalysis.turnoversConvertedToScores);
        analysis.turnoverToScoreAnalysis.turnoverConversionRate = sanitizeNumeric(analysis.turnoverToScoreAnalysis.turnoverConversionRate);
    }

    // Sanitize confidence
    if (analysis.confidence) {
        analysis.confidence.overall = sanitizeNumeric(analysis.confidence.overall, 25);
        analysis.confidence.defensiveAnalysis = sanitizeNumeric(analysis.confidence.defensiveAnalysis, 25);
        analysis.confidence.offensiveAnalysis = sanitizeNumeric(analysis.confidence.offensiveAnalysis, 25);
        analysis.confidence.playerIdentification = sanitizeNumeric(analysis.confidence.playerIdentification, 15);
        analysis.confidence.recommendations = sanitizeNumeric(analysis.confidence.recommendations, 25);
    }

    return analysis;
}

function generateReport(analysis, opponentName, frameCount, videoInfo, teamInfo = null) {
    // Sanitize AI response before building report
    analysis = sanitizeAnalysis(analysis);

    return {
        opponent: opponentName,
        generatedAt: new Date().toISOString(),
        framesAnalyzed: frameCount,
        videoDuration: videoInfo?.duration ? Math.round(videoInfo.duration) : null,
        skillLevel: analysis?.skillLevel || { estimated: 'unknown' },
        confidence: analysis?.confidence?.overall || 75,
        
        // Team Identification Info
        teamInfo: teamInfo ? {
            opponent: {
                name: teamInfo.opponent?.name || opponentName,
                jerseyColor: teamInfo.opponent?.jerseyColor || 'unknown'
            },
            yourTeam: {
                name: teamInfo.yourTeam?.name || 'Your Team',
                jerseyColor: teamInfo.yourTeam?.jerseyColor || 'unknown'
            }
        } : null,
        
        // Core Analysis
        defense: analysis?.defense || { primary: { scheme: 'Unknown' } },
        offense: analysis?.offense || { primary: { system: 'Unknown' } },
        keyPlayers: analysis?.keyPlayers || [],
        startingFive: analysis?.startingFive || [],
        pace: analysis?.pace || { rating: 50 },

        // Shot Chart
        shotChart: analysis?.shotChart || {
            shots: [],
            totalShots: null,
            totalMade: null,
            overallPercentage: null,
            byArea: {},
            hotZones: [],
            coldZones: []
        },

        // Primary Ball Handler
        primaryBallHandler: analysis?.primaryBallHandler || {
            jerseyNumber: null,
            description: null,
            possessionPercentage: null,
            dominantHand: null,
            tendencies: {},
            defensiveStrategy: {}
        },
        
        // Enhanced Analytics
        paceAndTempo: analysis?.paceAndTempo || {
            possessionsPerGameEstimate: null,
            paceRating: null,
            paceCategory: 'unknown',
            shotClockUsage: {},
            transitionFrequency: {}
        },
        
        offensiveSetEfficiency: analysis?.offensiveSetEfficiency || {
            setBreakdown: [],
            mostEfficientSet: null,
            leastEfficientSet: null
        },
        
        playerSpecificSets: analysis?.playerSpecificSets || [],
        
        ballMovementAnalytics: analysis?.ballMovementAnalytics || {
            reversalsPerPossession: null,
            passesBeforeShot: null,
            ballMovementRating: 'unknown'
        },
        
        turnoverAnalysis: analysis?.turnoverAnalysis || {
            estimatedTurnoverRate: null,
            turnoverConversion: {},
            highTurnoverSituations: []
        },
        
        teamValueIdentification: analysis?.teamValueIdentification || {
            offensiveIdentity: {},
            defensiveIdentity: {},
            goToPlays: {},
            mostValuableAspect: null
        },
        
        // NEW: Detailed Set Tracking
        offensiveSetTracking: analysis?.offensiveSetTracking || {
            totalPossessionsObserved: null,
            setBySetBreakdown: [],
            mostRunSet: null,
            mostEfficientSet: null,
            leastEfficientSet: null
        },
        
        // NEW: Player-Set Assignments
        playerSetAssignments: analysis?.playerSetAssignments || [],
        
        // NEW: Pace Analysis
        paceAnalysis: analysis?.paceAnalysis || {
            possessionsObserved: null,
            estimatedPossessionsPerGame: null,
            paceCategory: 'unknown',
            averagePossessionLength: null,
            shotClockBreakdown: {}
        },
        
        // NEW: Ball Movement Metrics
        ballMovementMetrics: analysis?.ballMovementMetrics || {
            totalBallReversals: null,
            reversalsPerPossession: null,
            passesPerPossession: null,
            touchDistribution: {}
        },
        
        // NEW: Turnover-to-Score Analysis
        turnoverToScoreAnalysis: analysis?.turnoverToScoreAnalysis || {
            opponentTurnoversObserved: null,
            turnoversConvertedToScores: null,
            turnoverConversionRate: null,
            conversionBreakdown: {}
        },
        
        // Existing fields
        specialSituations: analysis?.specialSituations || {},
        teamStrengths: analysis?.teamStrengths || [],
        teamWeaknesses: analysis?.teamWeaknesses || [],
        recommendations: analysis?.recommendations || {}
    };
}

function cleanup(dir) {
    try { if (fs.existsSync(dir)) fs.rmSync(dir, { recursive: true, force: true }); } catch (e) {}
}

// ===========================================
// SCOREBOOK ANALYSIS ENDPOINTS
// ===========================================

const SCOREBOOK_EXTRACTION_PROMPT = (teamLabel) => `You are an expert at reading handwritten basketball scorebooks. Analyze this scorebook photo for the ${teamLabel} team.

Follow these steps IN ORDER. Do each step carefully before moving on.

━━━ STEP 1: READ THE HEADER SCORES ━━━
Look at the TOP-RIGHT area of the scorebook page for these labeled fields:
  • "FIRST Q SCORE" — this is the cumulative score after Q1
  • "FIRST HALF SCORE" — cumulative score after Q2
  • "THIRD Q SCORE" — cumulative score after Q3
  • "FINAL SCORE" — the definitive game total

These are CUMULATIVE (running totals). Convert to per-quarter scoring:
  Q1 = FIRST Q SCORE
  Q2 = FIRST HALF SCORE − FIRST Q SCORE
  Q3 = THIRD Q SCORE − FIRST HALF SCORE
  Q4 = FINAL SCORE − THIRD Q SCORE

VALIDATION: Q1 + Q2 + Q3 + Q4 MUST equal FINAL SCORE. If it does not, re-read the header values. All four quarters must have values — a real basketball game has scoring in all quarters. Do NOT return 0 for Q3 or Q4 unless the header explicitly shows the cumulative score did not change.

━━━ STEP 2: READ EACH PLAYER ROW ━━━
Each player row has columns. Focus on the SCORING SUMMARY columns on the FAR RIGHT of the row:
  • "FG" or "2's" column = two-point field goals MADE
  • "3's" column = three-point field goals MADE
  • "FT A" or "FA" column = free throws ATTEMPTED
  • "FT M" or "FM" column = free throws MADE
  • "TP" column = TOTAL POINTS (the rightmost number column — this is authoritative)

For field goals attempted: count made shots + missed shots from the quarter sections if visible. A filled dot ● = made shot, an open circle ○ = missed shot. If attempts are unclear, set fieldGoalsAttempted = fieldGoalsMade (conservative estimate).

For personal fouls: count how many of P1, P2, P3, P4, P5 are marked/crossed out.

Include EVERY player listed, even those with all zeros.

━━━ STEP 3: COMPUTE TEAM TOTALS ━━━
Using the player data you extracted:
  totalPoints = FINAL SCORE from the header (this is authoritative)
  totalFGMade = sum of all players' (two-point FGs + three-point FGs)
  totalFGAttempted = sum of all players' fieldGoalsAttempted
  totalFTMade = sum of all players' freeThrowsMade
  totalFTAttempted = sum of all players' freeThrowsAttempted
  fieldGoalPercentage = totalFGMade / totalFGAttempted (as decimal, e.g. 0.45)
  freeThrowPercentage = totalFTMade / totalFTAttempted (as decimal, e.g. 0.80)

If totalFGAttempted is 0, set fieldGoalPercentage to 0.
If totalFTAttempted is 0, set freeThrowPercentage to 0.

━━━ STEP 4: VALIDATE ━━━
Before outputting, check:
  ✓ Q1 + Q2 + Q3 + Q4 = finalScore
  ✓ Sum of all players' points ≈ finalScore (should match or be very close)
  ✓ fieldGoalPercentage and freeThrowPercentage are between 0 and 1
  ✓ No quarter value is 0 unless you are certain from the header

━━━ OUTPUT ━━━
Return ONLY this JSON (no markdown fences, no explanation):
{
  "quarters": {"Q1": <number>, "Q2": <number>, "Q3": <number>, "Q4": <number>},
  "finalScore": <number>,
  "players": [
    {
      "number": "<jersey number>",
      "name": "<player name>",
      "points": <from TP column>,
      "fieldGoalsMade": <2pt FGs + 3pt FGs>,
      "fieldGoalsAttempted": <total FG attempts>,
      "freeThrowsMade": <FT made>,
      "freeThrowsAttempted": <FT attempted>,
      "fouls": <personal foul count>
    }
  ],
  "teamTotals": {
    "totalPoints": <FINAL SCORE from header>,
    "totalFieldGoalsMade": <sum of all FG made>,
    "totalFieldGoalsAttempted": <sum of all FG attempted>,
    "totalFreeThrowsMade": <sum of all FT made>,
    "totalFreeThrowsAttempted": <sum of all FT attempted>,
    "fieldGoalPercentage": <decimal 0-1>,
    "freeThrowPercentage": <decimal 0-1>
  }
}`;

/**
 * Processes a single scorebook image: validates, orients, compresses,
 * sends to Claude for extraction, parses JSON, and computes team totals.
 * Returns { stats } or throws an error with a user-facing message.
 */
async function processScorebook(imageBase64, teamLabel) {
    // Validate image
    const validation = validateImage(imageBase64);
    if (!validation.valid) {
        const err = new Error(validation.error);
        err.statusCode = 400;
        throw err;
    }

    let { base64Data, mediaType } = validation;

    // Auto-rotate based on EXIF orientation so the image is right-side-up
    try {
        const oriented = await normalizeOrientation(imageBase64);
        base64Data = oriented.base64Data;
        mediaType = oriented.mediaType;
        if (oriented.rotated) {
            console.log(`[SCOREBOOK] Image auto-rotated for ${teamLabel} team`);
        }
    } catch (orientError) {
        console.error('Orientation normalization error:', orientError.message);
    }

    // Compress if over 10MB (preserve detail for handwritten scorebooks)
    try {
        const compressed = await compressImage(
            `data:${mediaType};base64,${base64Data}`, 10
        );
        base64Data = compressed.base64Data;
        mediaType = compressed.mediaType;
        if (compressed.compressed) {
            console.log(`[SCOREBOOK] ${teamLabel} image compressed: ${compressed.originalSizeMB}MB → ${compressed.finalSizeMB}MB`);
        }
    } catch (compressError) {
        console.error('Image compression error:', compressError.message);
    }

    // Call Claude vision to extract stats
    let statsResponse;
    try {
        statsResponse = await anthropic.messages.create({
            model: 'claude-sonnet-4-5-20250929',
            max_tokens: 4096,
            messages: [{
                role: 'user',
                content: [
                    {
                        type: 'image',
                        source: {
                            type: 'base64',
                            media_type: mediaType,
                            data: base64Data
                        }
                    },
                    {
                        type: 'text',
                        text: SCOREBOOK_EXTRACTION_PROMPT(teamLabel)
                    }
                ]
            }]
        });
    } catch (apiError) {
        const err = new Error('Failed to analyze scorebook image. Claude API error: ' + apiError.message);
        err.statusCode = 502;
        throw err;
    }

    // Parse JSON from Claude response
    let stats;
    try {
        stats = extractJSON(statsResponse.content[0].text);
    } catch (parseError) {
        console.error('JSON parse error:', parseError.message);
        console.error('Raw response:', statsResponse.content[0].text);
        const err = new Error('Failed to parse extracted statistics: ' + parseError.message);
        err.statusCode = 422;
        throw err;
    }

    // Server-side team totals computation as safety net
    stats = computeTeamTotals(stats);

    return stats;
}

function scorebookLogger(req, res, next) {
    const startTime = Date.now();
    const body = req.body || {};
    const homeSize = body.homeImage ? (Buffer.byteLength(body.homeImage, 'utf8') / 1024).toFixed(1) : null;
    const opponentSize = body.opponentImage ? (Buffer.byteLength(body.opponentImage, 'utf8') / 1024).toFixed(1) : null;
    const legacySize = body.image ? (Buffer.byteLength(body.image, 'utf8') / 1024).toFixed(1) : null;

    const sizes = [
        homeSize && `home=${homeSize}KB`,
        opponentSize && `opponent=${opponentSize}KB`,
        legacySize && `image=${legacySize}KB`
    ].filter(Boolean).join(' ');

    console.log(`[SCOREBOOK] ${new Date().toISOString()} | ${req.method} ${req.path} | ${sizes || 'no images'}`);

    const originalJson = res.json.bind(res);
    res.json = (resBody) => {
        const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
        if (resBody && resBody.success) {
            console.log(`[SCOREBOOK] ${new Date().toISOString()} | DONE ${res.statusCode} | time=${elapsed}s | status=success`);
        } else {
            console.log(`[SCOREBOOK] ${new Date().toISOString()} | DONE ${res.statusCode} | time=${elapsed}s | status=failed | error=${resBody?.error || 'unknown'}`);
        }
        return originalJson(resBody);
    };

    next();
}

// POST /api/analyze-scorebook
// Accepts either:
//   { homeImage, opponentImage }  — analyzes both scorebooks
//   { image, team }               — legacy single-image mode
app.post('/api/analyze-scorebook', scorebookLogger, async (req, res) => {
    const startTime = Date.now();

    try {
        const { homeImage, opponentImage, image, team } = req.body;
        const isDualMode = homeImage || opponentImage;

        if (!isDualMode && !image) {
            return res.status(400).json({
                success: false,
                error: 'Missing image data. Provide "homeImage" and/or "opponentImage", or "image" with "team".'
            });
        }

        let homeStats = null;
        let opponentStats = null;
        let insights = '';

        if (isDualMode) {
            // Process both scorebooks in parallel if both provided
            const jobs = [];
            if (homeImage) jobs.push(processScorebook(homeImage, 'home').then(s => { homeStats = s; }));
            if (opponentImage) jobs.push(processScorebook(opponentImage, 'opponent').then(s => { opponentStats = s; }));
            await Promise.all(jobs);
        } else {
            // Legacy single-image mode
            if (!team || !['home', 'away'].includes(team)) {
                return res.status(400).json({
                    success: false,
                    error: 'Missing or invalid "team" field. Must be "home" or "away".'
                });
            }
            const stats = await processScorebook(image, team);
            if (team === 'home') homeStats = stats;
            else opponentStats = stats;
        }

        // Build context for insights generation
        const statsContext = {};
        if (homeStats) statsContext.home = homeStats;
        if (opponentStats) statsContext.opponent = opponentStats;

        const insightsPrompt = `You are an experienced basketball coach analyzing game statistics.

Here are the extracted stats from the scorebook(s):
${JSON.stringify(statsContext, null, 2)}

Based on these statistics, provide detailed coaching insights in markdown format with these exact sections:

## What Went Well
Provide 2-3 specific observations about positive performance, referencing actual numbers from the stats.

## Critical Areas for Improvement
Provide 2-3 specific issues backed by data from the stats. Reference shooting percentages, scoring distribution, or foul trouble as applicable.

## Practice Plan Recommendations
Provide 4-5 specific drill recommendations that directly address the areas for improvement. Each drill should include a brief description of what it targets.

## Player Spotlights
Highlight the top 2-3 performers with specific praise. Reference their individual stats and contribution to the team.

${homeStats && opponentStats ? 'Compare the two teams where relevant and highlight matchup advantages/disadvantages.' : ''}
Be specific, actionable, and reference the actual numbers from the game stats.`;

        try {
            const insightsResponse = await anthropic.messages.create({
                model: 'claude-sonnet-4-5-20250929',
                max_tokens: 4096,
                messages: [{ role: 'user', content: insightsPrompt }]
            });
            insights = insightsResponse.content[0].text;
        } catch (apiError) {
            console.error('Claude API error (insights):', apiError.message);
            return res.status(502).json({
                success: false,
                error: 'Failed to generate coaching insights. Claude API error.',
                details: apiError.message
            });
        }

        const processingTime = ((Date.now() - startTime) / 1000).toFixed(1) + 's';

        res.json({
            success: true,
            homeStats,
            opponentStats,
            // Legacy compat: also include "stats" pointing to whichever was requested
            stats: homeStats || opponentStats,
            insights,
            processingTime
        });

    } catch (error) {
        console.error('Scorebook analysis error:', error);
        const processingTime = ((Date.now() - startTime) / 1000).toFixed(1) + 's';
        const statusCode = error.statusCode || 500;
        res.status(statusCode).json({
            success: false,
            error: error.message || 'Internal server error during scorebook analysis.',
            processingTime
        });
    }
});

// ===========================================
// PRACTICE PLAN GENERATION ENDPOINT
// ===========================================

app.post('/api/generate-practice-plan', scorebookLogger, async (req, res) => {
    const startTime = Date.now();

    try {
        const { stats, homeStats, opponentStats, insights, teamName, focusAreas } = req.body;

        // Accept stats from either the dual-mode or legacy format
        const teamStats = homeStats || stats;
        if (!teamStats) {
            return res.status(400).json({
                success: false,
                error: 'Missing stats data. Provide "homeStats" or "stats" from a previous scorebook analysis.'
            });
        }

        const practicePlanPrompt = `You are an elite basketball coach creating a detailed practice plan based on recent game performance.

TEAM: ${teamName || 'Our Team'}
${focusAreas ? `COACH'S FOCUS AREAS: ${Array.isArray(focusAreas) ? focusAreas.join(', ') : focusAreas}` : ''}

GAME STATS:
${JSON.stringify(teamStats, null, 2)}
${opponentStats ? `\nOPPONENT STATS:\n${JSON.stringify(opponentStats, null, 2)}` : ''}
${insights ? `\nPREVIOUS COACHING INSIGHTS:\n${insights}` : ''}

Create a comprehensive, structured practice plan in markdown format with these sections:

## Practice Plan Overview
- Duration: 90-120 minutes
- Focus theme based on the game stats
- Brief summary of what this practice addresses

## Warm-Up (15 minutes)
2-3 warm-up activities that relate to the skills being developed

## Skill Development Stations (30 minutes)
4-5 specific drill stations with:
- Drill name
- Duration (minutes)
- Setup description
- Key coaching points
- How it addresses a specific weakness from the game

## Team Concepts (25 minutes)
2-3 team-oriented drills or plays that address tactical issues seen in the game. Reference specific stats.

## Competitive Drills (20 minutes)
2-3 game-like competitive drills that reinforce the practice themes

## Cool-Down & Film Review (10 minutes)
- Cool-down activity
- 2-3 specific film clips to review from the game (describe what to show)
- Key takeaways to reinforce

## Individual Player Assignments
For the top 3-4 players who need specific development based on their stats, provide:
- Player name/number
- What they did well
- What to work on
- 1-2 individual drills to do before/after practice

Be specific with drill descriptions. Reference actual game stats to justify each drill choice.`;

        let planResponse;
        try {
            planResponse = await anthropic.messages.create({
                model: 'claude-sonnet-4-5-20250929',
                max_tokens: 8192,
                messages: [{ role: 'user', content: practicePlanPrompt }]
            });
        } catch (apiError) {
            console.error('Claude API error (practice plan):', apiError.message);
            return res.status(502).json({
                success: false,
                error: 'Failed to generate practice plan. Claude API error.',
                details: apiError.message
            });
        }

        const practicePlan = planResponse.content[0].text;
        const processingTime = ((Date.now() - startTime) / 1000).toFixed(1) + 's';

        res.json({
            success: true,
            practicePlan,
            processingTime
        });

    } catch (error) {
        console.error('Practice plan generation error:', error);
        const processingTime = ((Date.now() - startTime) / 1000).toFixed(1) + 's';
        res.status(500).json({
            success: false,
            error: 'Internal server error during practice plan generation.',
            details: error.message,
            processingTime
        });
    }
});

app.listen(PORT, () => {
    console.log('===========================================');
    console.log(`CoachIQ v6.0 COMPREHENSIVE`);
    console.log(`Environment: ${NODE_ENV}`);
    console.log(`Port:        ${PORT}`);
    console.log(`CORS origin: ${FRONTEND_URL}`);
    console.log('-------------------------------------------');
    console.log('API Endpoints:');
    console.log('  GET  /                          Status');
    console.log('  GET  /health                    Health check');
    console.log('  POST /api/users/register        Register user');
    console.log('  GET  /api/users/:email          Get user');
    console.log('  GET  /api/users/:email/reports  Get user reports');
    console.log('  GET  /api/reports/:id            Get report');
    console.log('  POST /api/upload/init           Init upload');
    console.log('  POST /api/upload/chunk          Upload chunk');
    console.log('  POST /api/upload/finalize       Finalize upload');
    console.log('  POST /api/upload/simple         Simple upload');
    console.log('  POST /api/analyze-scorebook     Scorebook analysis');
    console.log('  POST /api/generate-practice-plan Practice plan');
    console.log('===========================================');
});
