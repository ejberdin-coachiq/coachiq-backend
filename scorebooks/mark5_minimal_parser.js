'use strict';

// ---------------------------------------------------------------------------
// Mark 5 Basketball Scorebook – Minimal Parser
//
// Reads the actual Mark 5 template layout:
//
//  POS | QUARTERS | PLAYER | NO. | PERSONAL FOULS (P1-P5) |
//       PLAYED                      ← X marks = fouls
//
//  … 1ST QTR | 2ND QTR | 3RD QTR | 4TH QTR | OT …   (skipped)
//
//  SCORING SUMMARY:  FG 2's | 3's | FT A | FT M | TP
//
//  TURNOVERS (skipped)
//
// Extracts roster + per-player totals + team totals from a single
// scorebook page using Google Document AI OCR output.
// ---------------------------------------------------------------------------

/**
 * Main entry point.
 *
 * @param {object} opts
 * @param {object} opts.documentAiJson - Normalised Document AI response
 *        Shape: { text, pages: [{ pageNumber, width, height, lines: [{ text, confidence, bbox }] }] }
 * @param {Buffer|string} [opts.imageBytesOrPath] - reserved for future use
 * @returns {object} Result JSON conforming to the Mark 5 minimal schema
 */
function parseMark5Minimal({ documentAiJson, imageBytesOrPath } = {}) {
    if (!documentAiJson || typeof documentAiJson !== 'object') {
        return blankResult({ issues: ['No Document AI JSON provided.'] });
    }

    const fullText = documentAiJson.text || '';
    const page = (documentAiJson.pages || [])[0]; // single-page scorebook

    if (!page || !page.lines || page.lines.length === 0) {
        return blankResult({
            isBlank: fullText.trim().length === 0,
            issues: fullText.trim().length === 0
                ? []
                : ['Page has text but no parsed lines.'],
        });
    }

    const pageWidth = page.width || 1;
    const pageHeight = page.height || 1;
    const lines = page.lines;

    // ----- 1. Locate anchor headers -----
    const anchors = findAnchors(lines, pageWidth, pageHeight);

    if (!anchors.hasPlayerTable) {
        const isBlank = looksBlank(fullText);
        return blankResult({
            isBlank,
            issues: isBlank ? [] : ['Could not locate player table headers.'],
        });
    }

    // ----- 2. Build rows by y-clustering -----
    const rows = clusterIntoRows(lines, pageHeight);

    // ----- 3. Extract data -----
    const { players, teamTotals, confidences, issues } = extractData(
        rows, anchors, pageWidth, pageHeight
    );

    // ----- 4. Blank check (headers found but no data rows) -----
    if (players.length === 0 && teamTotals.total_points === null) {
        const isBlank = looksBlank(fullText);
        return blankResult({ isBlank, issues: isBlank ? [] : issues });
    }

    // ----- 5. Validation -----
    const validation = validate(players, teamTotals);

    const overallConfidence = computeOverallConfidence(confidences, issues);

    return {
        template: 'Mark 5 Basketball Scorebook',
        is_blank: false,
        quality: {
            overall_confidence: round2(overallConfidence),
            issues,
        },
        players,
        team_totals: teamTotals,
        validation,
    };
}

// ===========================================================================
//  ANCHOR / HEADER DETECTION
// ===========================================================================

/**
 * Locate key column headers by matching OCR text against the actual
 * Mark 5 printed labels.  Records normalised x-ranges for each column.
 */
function findAnchors(lines, pageWidth, pageHeight) {
    const result = {
        hasPlayerTable: false,
        playerHeaderY: null,       // y-centre of the PLAYER/NO. header row
        nameXRange: null,          // player name column
        numberXRange: null,        // jersey NO. column
        posXRange: null,           // POS column (far left)
        quartersXRange: null,      // QUARTERS PLAYED column
        foulsXRange: null,         // PERSONAL FOULS area (P1-P5)
        scoringSummaryXStart: null,// where scoring summary begins
        fg2XRange: null,           // FG 2's column
        fg3XRange: null,           // 3's column
        ftAXRange: null,           // FT Attempts (A) column
        ftMXRange: null,           // FT Made (M) column
        tpXRange: null,            // Total Points column
        turnoversXStart: null,     // TURNOVERS (to know right boundary)
    };

    for (const line of lines) {
        const t = line.text.toUpperCase().trim();
        const bbox = line.bbox;
        if (!bbox) continue;

        const normCentreY = ((bbox.y1 + bbox.y3) / 2) / pageHeight;
        const normLeft = Math.min(bbox.x1, bbox.x4) / pageWidth;
        const normRight = Math.max(bbox.x2, bbox.x3) / pageWidth;

        // --- Player name ---
        if (/\bPLAYER\b/.test(t)) {
            result.hasPlayerTable = true;
            result.playerHeaderY = normCentreY;
            result.nameXRange = { left: normLeft, right: normRight };
        }

        // --- Jersey number ---
        if (/\bNO\.?\b/.test(t) && t.length < 10) {
            result.numberXRange = { left: normLeft, right: normRight };
            if (!result.playerHeaderY) {
                result.hasPlayerTable = true;
                result.playerHeaderY = normCentreY;
            }
        }

        // --- POS ---
        if (/^POS$/.test(t)) {
            result.posXRange = { left: normLeft, right: normRight };
        }

        // --- QUARTERS PLAYED ---
        if (/QUARTERS?\s*PLAYED/.test(t)) {
            result.quartersXRange = { left: normLeft, right: normRight };
        }

        // --- Personal Fouls header ---
        if (/PERSONAL\s*FOULS?/.test(t) || /\bPERSONAL\b/.test(t)) {
            result.foulsXRange = { left: normLeft, right: normRight };
        }
        // Narrower match: "FOULS" alone (when PERSONAL is on a separate line)
        if (/^FOULS?$/.test(t) && !result.foulsXRange) {
            result.foulsXRange = { left: normLeft, right: normRight };
        }

        // --- Scoring Summary header ---
        if (/SCORING\s*SUMM/.test(t) || /\bSUMMARY\b/.test(t)) {
            result.scoringSummaryXStart = normLeft;
        }

        // --- Mark 5 sub-columns: 2's, 3's ---
        if (/^2['']?S$/.test(t) || /^2['']S$/.test(t)) {
            result.fg2XRange = { left: normLeft, right: normRight };
        }
        if (/^3['']?S$/.test(t) || /^3['']S$/.test(t)) {
            result.fg3XRange = { left: normLeft, right: normRight };
        }

        // --- FG header (fallback if 2's/3's not detected separately) ---
        if (/^FG$/.test(t)) {
            // Only use as fg2 fallback if 2's not found yet
            if (!result.fg2XRange) {
                result.fg2XRange = { left: normLeft, right: normRight };
            }
        }

        // --- FT sub-columns: A (attempts) and M (made) ---
        // These are tiny single-letter headers; match carefully
        if (/^A$/.test(t) && normLeft > 0.5) {
            result.ftAXRange = { left: normLeft, right: normRight };
        }
        if (/^M$/.test(t) && normLeft > 0.5) {
            result.ftMXRange = { left: normLeft, right: normRight };
        }

        // --- FT header (fallback) ---
        if (/^FT$/.test(t) || /^FTM$/.test(t)) {
            // Use as ftM fallback
            if (!result.ftMXRange) {
                result.ftMXRange = { left: normLeft, right: normRight };
            }
        }
        if (/^FTA$/.test(t)) {
            if (!result.ftAXRange) {
                result.ftAXRange = { left: normLeft, right: normRight };
            }
        }

        // --- 3PT / 3FG (fallback for 3's) ---
        if (/\b3\s*(?:PT|FG|P)\b/.test(t) && !result.fg3XRange) {
            result.fg3XRange = { left: normLeft, right: normRight };
        }

        // --- TP / Total Points ---
        if (/^TP$/.test(t) || /\bTOTAL\s*P(?:OINTS|TS)?\b/.test(t) || /^PTS$/.test(t)) {
            result.tpXRange = { left: normLeft, right: normRight };
        }

        // --- TURNOVERS ---
        if (/\bTURNOVERS?\b/.test(t)) {
            result.turnoversXStart = normLeft;
        }
    }

    // --- Proportional fallback for scoring summary sub-columns ---
    // If we found SCORING SUMMARY but not all sub-columns, fill by proportion.
    // Mark 5 layout: FG 2's | 3's | FT A | FT M | TP
    if (result.scoringSummaryXStart) {
        const ssLeft = result.scoringSummaryXStart;
        const ssRight = result.turnoversXStart || 1.0;
        const span = ssRight - ssLeft;

        if (!result.fg2XRange) {
            result.fg2XRange = { left: ssLeft, right: ssLeft + span * 0.2 };
        }
        if (!result.fg3XRange) {
            result.fg3XRange = { left: ssLeft + span * 0.2, right: ssLeft + span * 0.4 };
        }
        if (!result.ftAXRange) {
            result.ftAXRange = { left: ssLeft + span * 0.4, right: ssLeft + span * 0.6 };
        }
        if (!result.ftMXRange) {
            result.ftMXRange = { left: ssLeft + span * 0.6, right: ssLeft + span * 0.8 };
        }
        if (!result.tpXRange) {
            result.tpXRange = { left: ssLeft + span * 0.8, right: ssRight };
        }
    }

    return result;
}

// ===========================================================================
//  ROW CLUSTERING
// ===========================================================================

/**
 * Group OCR lines into horizontal rows by y-coordinate proximity.
 */
function clusterIntoRows(lines, pageHeight) {
    const tokens = lines
        .filter((l) => l.bbox)
        .map((l) => {
            const bbox = l.bbox;
            const yCenter = ((bbox.y1 + bbox.y3) / 2) / pageHeight;
            return {
                text: l.text.trim(),
                confidence: l.confidence,
                yCenter,
                normLeft: Math.min(bbox.x1, bbox.x4),
                normRight: Math.max(bbox.x2, bbox.x3),
                rawBbox: bbox,
            };
        })
        .sort((a, b) => a.yCenter - b.yCenter);

    if (tokens.length === 0) return [];

    const ROW_THRESHOLD = 0.015;
    const rows = [];
    let currentRow = { yCenter: tokens[0].yCenter, tokens: [tokens[0]] };

    for (let i = 1; i < tokens.length; i++) {
        const tk = tokens[i];
        if (Math.abs(tk.yCenter - currentRow.yCenter) < ROW_THRESHOLD) {
            currentRow.tokens.push(tk);
            currentRow.yCenter =
                currentRow.tokens.reduce((s, t) => s + t.yCenter, 0) / currentRow.tokens.length;
        } else {
            rows.push(currentRow);
            currentRow = { yCenter: tk.yCenter, tokens: [tk] };
        }
    }
    rows.push(currentRow);

    for (const row of rows) {
        row.tokens.sort((a, b) => a.normLeft - b.normLeft);
    }

    return rows;
}

// ===========================================================================
//  DATA EXTRACTION
// ===========================================================================

/** Rows to skip entirely (non-data headers / footers) */
const SKIP_ROW_RE = /\b(?:RUNNING\s*SCORE|TURNOVERS?|TIME\s*OUTS?|TECHNICALS?|COACH|SCORER|TIMER|REFEREE|DATE|LOCATION|POB|FTM\s*PERCENT|FIRST\s*(?:HALF|Q)|SECOND\s*(?:HALF)|THIRD|FOURTH|1ST\s*Q|2ND\s*Q|3RD\s*Q|4TH\s*Q|OVER\s*TIME|TEAM\s*FOULS?)\b/i;

function extractData(rows, anchors, pageWidth, pageHeight) {
    const players = [];
    const issues = [];
    const confidences = [];
    let teamTotals = {
        shooting: { fg2_made: null, fg2_att: null, fg3_made: null, fg3_att: null, ft_made: null, ft_att: null },
        total_points: null,
    };

    const headerY = anchors.playerHeaderY || 0;
    let rowIndex = 0;

    for (const row of rows) {
        if (row.yCenter <= headerY + 0.005) continue;

        const rowText = row.tokens.map((t) => t.text).join(' ');
        const rowTextUpper = rowText.toUpperCase();

        if (/^\s*$/.test(rowText)) continue;
        if (SKIP_ROW_RE.test(rowTextUpper)) continue;

        // Skip header-echo rows (POS, QUARTERS PLAYED, PLAYER, NO.)
        if (/^(?:POS|QUARTERS?\s*PLAYED|PLAYER|NO\.)$/i.test(rowTextUpper)) continue;

        // Detect totals row — match "TOTAL" or "TEAM TOTALS"
        if (/\bTOTALS?\b/i.test(rowTextUpper) && !/TECHNICAL/i.test(rowTextUpper)) {
            teamTotals = extractTotalsFromRow(row, anchors, pageWidth);
            continue;
        }

        const playerResult = extractPlayerFromRow(row, anchors, pageWidth, rowIndex);
        if (playerResult) {
            players.push(playerResult);
            confidences.push(playerResult.confidence);
            rowIndex++;
        }
    }

    if (players.length === 0) {
        issues.push('No player rows could be extracted from the table area.');
    }

    return { players, teamTotals, confidences, issues };
}

// ===========================================================================
//  PLAYER ROW EXTRACTION
// ===========================================================================

function extractPlayerFromRow(row, anchors, pageWidth, rowIndex) {
    const tokens = row.tokens;
    if (tokens.length === 0) return null;

    let playerName = null;
    let playerNumber = null;
    const flags = [];
    const rowConfidences = [];

    // Partition tokens into zones by x-position
    const foulsLeft = anchors.foulsXRange ? anchors.foulsXRange.left * pageWidth : null;
    const foulsRight = anchors.foulsXRange ? anchors.foulsXRange.right * pageWidth : null;
    const scoringStart = anchors.scoringSummaryXStart
        ? anchors.scoringSummaryXStart * pageWidth
        : pageWidth * 0.7;

    const nameTokens = [];       // left-side: name + number
    const foulsTokens = [];      // personal fouls area
    const scoringTokens = [];    // scoring summary columns

    for (const tk of tokens) {
        const tkCentreX = (tk.normLeft + tk.normRight) / 2;
        if (tk.confidence != null) rowConfidences.push(tk.confidence);

        if (tkCentreX >= scoringStart) {
            scoringTokens.push(tk);
        } else if (foulsLeft && foulsRight && tkCentreX >= foulsLeft && tkCentreX <= foulsRight) {
            foulsTokens.push(tk);
        } else if (tkCentreX < (foulsLeft || scoringStart)) {
            nameTokens.push(tk);
        } else {
            // Tokens between fouls and scoring (quarter data) – skip
        }
    }

    // ---- Name & Number ----
    playerNumber = findJerseyNumber(nameTokens, anchors, pageWidth);
    const pNum = playerNumber;

    const nameFragments = [];
    for (const tk of nameTokens) {
        const t = tk.text.trim();
        // Skip if this is the jersey number
        if (pNum && t.replace(/[^0-9]/g, '') === pNum && t.length <= 3) continue;
        // Skip purely numeric (could be POS or quarter indicators like "1Q")
        if (/^\d+$/.test(t)) continue;
        if (/^\d+Q$/i.test(t)) continue; // quarter indicator
        // Accept if has at least one letter
        if (/[A-Za-z]/.test(t)) {
            nameFragments.push(t);
        }
    }
    playerName = nameFragments.length > 0 ? nameFragments.join(' ') : null;

    // If no name AND no scoring data, not a player row
    if (!playerName && scoringTokens.length === 0 && foulsTokens.length === 0) return null;

    // ---- Personal Fouls (P1-P5 mark counting) ----
    const { count: personalFoulsTotal, foulFlags } = countPersonalFouls(foulsTokens);
    flags.push(...foulFlags);

    // ---- Scoring Summary ----
    const shooting = {
        fg2_made: null, fg2_att: null,
        fg3_made: null, fg3_att: null,
        ft_made: null, ft_att: null,
    };
    let totalPoints = null;

    const numericScoring = scoringTokens
        .map((tk) => {
            const nums = parseNumerics(tk.text);
            return nums.map((n) => ({
                value: n,
                centreX: (tk.normLeft + tk.normRight) / 2,
                confidence: tk.confidence,
            }));
        })
        .flat();

    // Map to Mark 5 columns: FG 2's | 3's | FT A | FT M | TP
    if (anchors.tpXRange) {
        const m = closestNumeric(numericScoring, colCentre(anchors.tpXRange, pageWidth), pageWidth * 0.05);
        if (m) totalPoints = m.value;
    }

    if (anchors.fg2XRange) {
        const m = closestNumeric(numericScoring, colCentre(anchors.fg2XRange, pageWidth), pageWidth * 0.05);
        if (m) shooting.fg2_made = m.value;
        // fg2_att is NOT in the Mark 5 scoring summary — leave null
    }

    if (anchors.fg3XRange) {
        const m = closestNumeric(numericScoring, colCentre(anchors.fg3XRange, pageWidth), pageWidth * 0.05);
        if (m) shooting.fg3_made = m.value;
        // fg3_att is NOT in the Mark 5 scoring summary — leave null
    }

    if (anchors.ftAXRange) {
        const m = closestNumeric(numericScoring, colCentre(anchors.ftAXRange, pageWidth), pageWidth * 0.05);
        if (m) shooting.ft_att = m.value;
    }

    if (anchors.ftMXRange) {
        const m = closestNumeric(numericScoring, colCentre(anchors.ftMXRange, pageWidth), pageWidth * 0.05);
        if (m) shooting.ft_made = m.value;
    }

    // Fallback: if no column headers detected, use positional order (right-to-left)
    if (!anchors.tpXRange && !anchors.fg2XRange && numericScoring.length > 0) {
        const sorted = [...numericScoring].sort((a, b) => b.centreX - a.centreX);
        totalPoints = sorted[0].value;
        flags.push('total_points assigned by position (rightmost number); no column headers found');
        // Mark 5 order R→L: TP, FT M, FT A, 3's, 2's
        if (sorted.length >= 2) shooting.ft_made = sorted[1].value;
        if (sorted.length >= 3) shooting.ft_att = sorted[2].value;
        if (sorted.length >= 4) shooting.fg3_made = sorted[3].value;
        if (sorted.length >= 5) shooting.fg2_made = sorted[4].value;
        if (sorted.length >= 2) {
            flags.push('shooting values assigned by position heuristic; may be inaccurate');
        }
    }

    // Confidence
    const avgConf = rowConfidences.length > 0
        ? rowConfidences.reduce((s, c) => s + c, 0) / rowConfidences.length
        : 0.5;
    let conf = avgConf;
    if (totalPoints === null) conf *= 0.7;
    if (!playerName) conf *= 0.8;
    if (flags.length > 0) conf *= 0.9;

    return {
        row_index: rowIndex,
        player_name: playerName,
        player_number: pNum,
        personal_fouls_total: personalFoulsTotal,
        shooting,
        total_points: totalPoints,
        confidence: round2(conf),
        flags,
    };
}

// ===========================================================================
//  PERSONAL FOULS — P1-P5 MARK COUNTING
// ===========================================================================

/**
 * Count personal fouls by detecting X / cross-out marks on P1–P5 slots.
 *
 * Document AI may represent marked foul boxes as:
 *  - "X", "x", "×", "✕", "✗", "/", "\" (standalone mark tokens)
 *  - "P1X", "XP2", "P3/" (P-label merged with mark character)
 *  - A P# token with unusually low confidence (mark overlaid on print)
 *
 * Falls back to a written numeric total if no marks detected.
 *
 * @param {Array} foulsTokens - tokens within the PERSONAL FOULS x-range
 * @returns {{ count: number|null, foulFlags: string[] }}
 */
function countPersonalFouls(foulsTokens) {
    if (foulsTokens.length === 0) {
        return { count: null, foulFlags: [] };
    }

    const flags = [];

    // --- Strategy 1: Detect explicit mark characters ---
    // Standalone marks (X, x, ×, etc.)
    let standaloneMarks = 0;
    // P# labels with attached mark characters
    const markedSlots = new Set();
    // Clean P# labels (no marks)
    const cleanSlots = new Set();
    // Written numeric total candidate
    let writtenTotal = null;

    for (const tk of foulsTokens) {
        const raw = tk.text.trim();
        const upper = raw.toUpperCase();

        // Check for P1-P5 labels (with or without marks)
        const pMatch = upper.match(/P\s*([1-5])/);
        if (pMatch) {
            const slot = `P${pMatch[1]}`;
            // Check if there are extra characters (mark merged with label)
            const stripped = upper.replace(/P\s*[1-5]/g, '').replace(/\s/g, '');
            if (stripped.length > 0 && isMarkChar(stripped)) {
                markedSlots.add(slot);
            } else if (stripped.length === 0) {
                cleanSlots.add(slot);
            } else {
                // Garbled text over a P# — likely marked
                markedSlots.add(slot);
            }
            continue;
        }

        // Standalone mark character(s)
        if (isMarkText(raw)) {
            standaloneMarks++;
            continue;
        }

        // Single digit 0-5 not attached to P# — could be a written total
        if (/^[0-5]$/.test(raw) && writtenTotal === null) {
            writtenTotal = parseInt(raw, 10);
            continue;
        }
    }

    // --- Decide foul count ---

    // If we found explicitly marked P# slots, use that count
    if (markedSlots.size > 0) {
        flags.push(`fouls_from_marked_slots: ${[...markedSlots].sort().join(',')}`);
        return { count: markedSlots.size, foulFlags: flags };
    }

    // If we found standalone mark tokens (X, ×, etc.), count those.
    // These are marks drawn over P# boxes where OCR couldn't merge them.
    if (standaloneMarks > 0) {
        const count = Math.min(standaloneMarks, 5);
        flags.push(`fouls_from_mark_count: ${standaloneMarks} mark(s) detected`);
        return { count, foulFlags: flags };
    }

    // If a written numeric total was found, use that
    if (writtenTotal !== null) {
        flags.push('fouls_from_written_total');
        return { count: writtenTotal, foulFlags: flags };
    }

    // --- Strategy 2: Confidence-based detection ---
    // If all P# labels are present but some have notably lower confidence,
    // the low-confidence ones are likely marked/crossed.
    if (cleanSlots.size > 0) {
        const slotConfidences = [];
        for (const tk of foulsTokens) {
            const pm = tk.text.trim().toUpperCase().match(/^P\s*([1-5])$/);
            if (pm && tk.confidence != null) {
                slotConfidences.push({ slot: `P${pm[1]}`, confidence: tk.confidence });
            }
        }

        if (slotConfidences.length >= 2) {
            const avgConf = slotConfidences.reduce((s, sc) => s + sc.confidence, 0) / slotConfidences.length;
            const lowConf = slotConfidences.filter((sc) => sc.confidence < avgConf - 0.15);
            if (lowConf.length > 0 && lowConf.length < slotConfidences.length) {
                const count = lowConf.length;
                flags.push(`fouls_from_confidence_drop: ${lowConf.map(lc => lc.slot).join(',')} had low confidence`);
                return { count, foulFlags: flags };
            }
        }
    }

    // Cannot determine fouls
    if (cleanSlots.size > 0) {
        flags.push('fouls_not_determined: P-slots visible but no marks detected');
    }
    return { count: null, foulFlags: flags };
}

/** Check if a single character looks like a cross/mark */
function isMarkChar(str) {
    return /^[Xx×✕✗✘\/\\|]+$/.test(str);
}

/** Check if a full token text is a mark (may be multi-char like "XX" or "X/") */
function isMarkText(str) {
    const cleaned = str.replace(/\s/g, '');
    if (cleaned.length === 0) return false;
    return /^[Xx×✕✗✘\/\\|]+$/.test(cleaned);
}

// ===========================================================================
//  JERSEY NUMBER
// ===========================================================================

function findJerseyNumber(nameTokens, anchors, pageWidth) {
    let best = null;
    let bestDist = Infinity;

    for (const tk of nameTokens) {
        const cleaned = tk.text.replace(/[^0-9]/g, '');
        if (cleaned.length < 1 || cleaned.length > 3 || !/^\d{1,3}$/.test(cleaned)) continue;

        if (anchors.numberXRange) {
            const colCtr = ((anchors.numberXRange.left + anchors.numberXRange.right) / 2) * pageWidth;
            const tkCtr = (tk.normLeft + tk.normRight) / 2;
            const dist = Math.abs(tkCtr - colCtr);
            if (dist < bestDist) {
                best = cleaned;
                bestDist = dist;
            }
        } else if (!best) {
            best = cleaned;
        }
    }

    return best;
}

// ===========================================================================
//  TOTALS ROW
// ===========================================================================

function extractTotalsFromRow(row, anchors, pageWidth) {
    const totals = {
        shooting: { fg2_made: null, fg2_att: null, fg3_made: null, fg3_att: null, ft_made: null, ft_att: null },
        total_points: null,
    };

    const numericTokens = row.tokens
        .map((tk) => {
            const nums = parseNumerics(tk.text);
            return nums.map((n) => ({
                value: n,
                centreX: (tk.normLeft + tk.normRight) / 2,
            }));
        })
        .flat();

    if (anchors.tpXRange) {
        const m = closestNumeric(numericTokens, colCentre(anchors.tpXRange, pageWidth), pageWidth * 0.05);
        if (m) totals.total_points = m.value;
    }

    if (anchors.fg2XRange) {
        const m = closestNumeric(numericTokens, colCentre(anchors.fg2XRange, pageWidth), pageWidth * 0.05);
        if (m) totals.shooting.fg2_made = m.value;
    }

    if (anchors.fg3XRange) {
        const m = closestNumeric(numericTokens, colCentre(anchors.fg3XRange, pageWidth), pageWidth * 0.05);
        if (m) totals.shooting.fg3_made = m.value;
    }

    if (anchors.ftAXRange) {
        const m = closestNumeric(numericTokens, colCentre(anchors.ftAXRange, pageWidth), pageWidth * 0.05);
        if (m) totals.shooting.ft_att = m.value;
    }

    if (anchors.ftMXRange) {
        const m = closestNumeric(numericTokens, colCentre(anchors.ftMXRange, pageWidth), pageWidth * 0.05);
        if (m) totals.shooting.ft_made = m.value;
    }

    // Fallback: rightmost number is TP
    if (totals.total_points === null && numericTokens.length > 0) {
        const sorted = [...numericTokens].sort((a, b) => b.centreX - a.centreX);
        totals.total_points = sorted[0].value;
    }

    return totals;
}

// ===========================================================================
//  VALIDATION
// ===========================================================================

function validate(players, teamTotals) {
    const checks = [];
    const reviewReasons = [];

    // Check 1: Points equation per player
    // Mark 5 formula: TP = 2*fg2_made + 3*fg3_made + ft_made
    for (const p of players) {
        const s = p.shooting;
        if (p.total_points != null && s.fg2_made != null && s.fg3_made != null && s.ft_made != null) {
            const expected = 2 * s.fg2_made + 3 * s.fg3_made + s.ft_made;
            const passed = expected === p.total_points;
            checks.push({
                name: `points_equation_player_${p.row_index}`,
                passed,
                details: passed
                    ? `Player #${p.player_number || p.row_index}: ${p.total_points} = 2*${s.fg2_made} + 3*${s.fg3_made} + ${s.ft_made}`
                    : `Player #${p.player_number || p.row_index}: expected ${expected} but got ${p.total_points}`,
            });
            if (!passed) {
                reviewReasons.push(`Points mismatch for player row ${p.row_index}`);
            }
        }
    }

    // Check 2: Personal fouls > 5
    for (const p of players) {
        if (p.personal_fouls_total != null && p.personal_fouls_total > 5) {
            checks.push({
                name: `fouls_high_player_${p.row_index}`,
                passed: false,
                details: `Player #${p.player_number || p.row_index} has ${p.personal_fouls_total} fouls (>5 is unusual for HS).`,
            });
            reviewReasons.push(`High foul count for player row ${p.row_index}`);
        }
    }

    // Check 3: Team total vs sum of players
    const sumTP = players.reduce((s, p) => s + (p.total_points || 0), 0);
    if (teamTotals.total_points != null && sumTP > 0) {
        const passed = sumTP === teamTotals.total_points;
        checks.push({
            name: 'team_total_vs_player_sum',
            passed,
            details: passed
                ? `Team total ${teamTotals.total_points} matches player sum.`
                : `Team total ${teamTotals.total_points} != player sum ${sumTP}.`,
        });
        if (!passed) reviewReasons.push('Team total does not match sum of player points.');
    }

    // Check 4: Null total_points rate
    const nullTpCount = players.filter((p) => p.total_points === null).length;
    if (players.length > 0 && nullTpCount / players.length > 0.5) {
        reviewReasons.push(`>${Math.round(nullTpCount / players.length * 100)}% of player rows have null total_points.`);
    }

    const needsReview = reviewReasons.length > 0;
    return { checks, needs_review: needsReview, review_reasons: reviewReasons };
}

// ===========================================================================
//  UTILITIES
// ===========================================================================

function blankResult({ isBlank = true, issues = [] } = {}) {
    return {
        template: 'Mark 5 Basketball Scorebook',
        is_blank: isBlank,
        quality: { overall_confidence: isBlank ? 1.0 : 0.0, issues },
        players: [],
        team_totals: {
            shooting: { fg2_made: null, fg2_att: null, fg3_made: null, fg3_att: null, ft_made: null, ft_att: null },
            total_points: null,
        },
        validation: { checks: [], needs_review: !isBlank, review_reasons: isBlank ? [] : issues },
    };
}

function looksBlank(text) {
    const stripped = text
        .replace(/PLAYERS?|NO\.|SCORING|SUMMARY|FG|FT|FTM|FTA|TP|PTS|FOULS?|PERSONAL|QUARTERS?\s*PLAYED|QUARTER|HALF|TEAM|TOTALS?|HOME|VISITOR|DATE|LOCATION|COACH|SCORER|TIMER|REFEREE|POS|POB|TURNOVERS?|RUNNING\s*SCORE|TIME\s*OUTS?|TECHNICALS?|OVER\s*TIME|PERCENT|FIRST|SECOND|PLAYED|[1-4](?:ST|ND|RD|TH)\s*(?:Q(?:TR)?)?\.?|QTR\.?|2['']?S|3['']?S|P[1-5]|\b\d{1,2}\b|\b[AM]\b/gi, '')
        .replace(/[^A-Za-z0-9]/g, '');
    return stripped.length < 15;
}

function parseNumerics(str) {
    const nums = [];
    const tokens = str.trim().split(/[\s,]+/);
    for (const t of tokens) {
        if (/^\d+\/\d+$/.test(t)) {
            const [a, b] = t.split('/').map(Number);
            if (!isNaN(a)) nums.push(a);
            if (!isNaN(b)) nums.push(b);
        } else {
            const n = parseInt(t, 10);
            if (!isNaN(n) && /^\d+$/.test(t.trim())) nums.push(n);
        }
    }
    return nums;
}

function colCentre(range, pageWidth) {
    return ((range.left + range.right) / 2) * pageWidth;
}

function closestNumeric(numericTokens, targetX, tolerance) {
    let best = null;
    let bestDist = Infinity;
    for (const nt of numericTokens) {
        const dist = Math.abs(nt.centreX - targetX);
        if (dist < tolerance && dist < bestDist) {
            best = nt;
            bestDist = dist;
        }
    }
    return best;
}

function numericsInRange(numericTokens, range, pageWidth) {
    const left = range.left * pageWidth;
    const right = range.right * pageWidth;
    const margin = (right - left) * 0.3;
    return numericTokens
        .filter((nt) => nt.centreX >= left - margin && nt.centreX <= right + margin)
        .sort((a, b) => a.centreX - b.centreX);
}

function computeOverallConfidence(confidences, issues) {
    if (confidences.length === 0) return 0.0;
    let avg = confidences.reduce((s, c) => s + c, 0) / confidences.length;
    avg -= issues.length * 0.05;
    return Math.max(0.0, Math.min(1.0, avg));
}

function round2(n) {
    return Math.round(n * 100) / 100;
}

module.exports = { parseMark5Minimal };
