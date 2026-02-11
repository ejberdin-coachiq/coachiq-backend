'use strict';

// ---------------------------------------------------------------------------
// Mark 5 Basketball Scorebook – Minimal Parser
//
// Extracts roster + per-player totals + team totals from a Mark 5 scorebook
// page using Google Document AI OCR output (text + bounding boxes).
//
// Returns STRICT JSON matching the schema in docs/scorebooks.md.
// ---------------------------------------------------------------------------

/**
 * Main entry point.
 *
 * @param {object} opts
 * @param {object} opts.documentAiJson - Normalised Document AI response
 *        Expected shape: { text: string, pages: [{ pageNumber, width, height, lines: [{ text, confidence, bbox }] }] }
 * @param {Buffer|string} [opts.imageBytesOrPath] - (currently unused; reserved for future vision fallback)
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
        // Might be blank or an unrecognised template
        const isBlank = looksBlank(fullText);
        return blankResult({
            isBlank,
            issues: isBlank ? [] : ['Could not locate player table headers.'],
        });
    }

    // ----- 2. Build rows by y-clustering -----
    const rows = clusterIntoRows(lines, pageHeight);

    // ----- 3. Classify columns & extract data -----
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

/** Locate key column headers by matching OCR text. */
function findAnchors(lines, pageWidth, pageHeight) {
    const result = {
        hasPlayerTable: false,
        playerHeaderY: null,       // y-centre of the PLAYER/NO. header row
        nameXRange: null,          // { left, right } normalised x-range for player name
        numberXRange: null,        // for jersey number
        scoringSummaryXStart: null, // normalised x where scoring summary columns begin
        foulsXRange: null,         // for personal fouls
        tpXRange: null,            // for total points column
        fgXRange: null,            // field goal columns
        ftXRange: null,            // free throw columns
        fg3XRange: null,           // 3-point columns (may be absent)
    };

    for (const line of lines) {
        const t = line.text.toUpperCase().trim();
        const bbox = line.bbox;
        if (!bbox) continue;

        const normCentreY = ((bbox.y1 + bbox.y3) / 2) / pageHeight;
        const normLeft = Math.min(bbox.x1, bbox.x4) / pageWidth;
        const normRight = Math.max(bbox.x2, bbox.x3) / pageWidth;

        // Player name header
        if (/\bPLAYER\b/.test(t) || /\bPLAYERS?\s*NAME\b/.test(t)) {
            result.hasPlayerTable = true;
            result.playerHeaderY = normCentreY;
            result.nameXRange = { left: normLeft, right: normRight };
        }

        // Jersey number
        if (/\bNO\.?\b/.test(t) && t.length < 10) {
            result.numberXRange = { left: normLeft, right: normRight };
            if (!result.playerHeaderY) {
                result.hasPlayerTable = true;
                result.playerHeaderY = normCentreY;
            }
        }

        // Scoring summary header (marks rightward boundary start)
        if (/SCORING\s*SUMM/.test(t) || /\bSUMMARY\b/.test(t)) {
            result.scoringSummaryXStart = normLeft;
        }

        // FG header(s)
        if (/\bFG\b/.test(t) && !/\b3\s*FG\b/.test(t) && !/FT/.test(t)) {
            result.fgXRange = { left: normLeft, right: normRight };
        }

        // 3-point / 3FG
        if (/\b3\s*(?:PT|FG|P)\b/.test(t) || /\bTHREE\b/.test(t)) {
            result.fg3XRange = { left: normLeft, right: normRight };
        }

        // FT header
        if (/\bFT\b/.test(t) && !/FG/.test(t)) {
            result.ftXRange = { left: normLeft, right: normRight };
        }

        // TP / Total Points header
        if (/\bTP\b/.test(t) || /\bTOTAL\s*P(?:OINTS|TS)?\b/.test(t) || /\bPTS\b/.test(t)) {
            result.tpXRange = { left: normLeft, right: normRight };
        }

        // Personal fouls
        if (/\bFOUL/.test(t) || /\bPF\b/.test(t) || /\bPERSONAL\b/.test(t)) {
            result.foulsXRange = { left: normLeft, right: normRight };
        }
    }

    // If we found a scoring summary start but no individual column headers,
    // set approximate zones based on typical Mark 5 layout.
    if (result.scoringSummaryXStart && !result.tpXRange) {
        const ss = result.scoringSummaryXStart;
        const span = 1.0 - ss;
        // Typical order: FG  3PT  FT  TP  (each ~25% of the summary area)
        if (!result.fgXRange) result.fgXRange = { left: ss, right: ss + span * 0.25 };
        if (!result.fg3XRange) result.fg3XRange = { left: ss + span * 0.25, right: ss + span * 0.5 };
        if (!result.ftXRange) result.ftXRange = { left: ss + span * 0.5, right: ss + span * 0.75 };
        result.tpXRange = { left: ss + span * 0.75, right: 1.0 };
    }

    return result;
}

// ===========================================================================
//  ROW CLUSTERING
// ===========================================================================

/**
 * Group OCR lines into horizontal rows by y-coordinate proximity.
 * Returns array of { yCenter, tokens: [{ text, confidence, normLeft, normRight, normCentreX }] }
 */
function clusterIntoRows(lines, pageHeight) {
    // Convert lines to normalised tokens
    const tokens = lines
        .filter((l) => l.bbox)
        .map((l) => {
            const bbox = l.bbox;
            const yCenter = ((bbox.y1 + bbox.y3) / 2) / pageHeight;
            const normLeft = Math.min(bbox.x1, bbox.x4) / (1); // already absolute
            const normRight = Math.max(bbox.x2, bbox.x3) / (1);
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

    // Cluster: tokens within ~1.5% of page height of each other are the same row
    const ROW_THRESHOLD = 0.015;
    const rows = [];
    let currentRow = { yCenter: tokens[0].yCenter, tokens: [tokens[0]] };

    for (let i = 1; i < tokens.length; i++) {
        const tk = tokens[i];
        if (Math.abs(tk.yCenter - currentRow.yCenter) < ROW_THRESHOLD) {
            currentRow.tokens.push(tk);
            // update centre to running average
            currentRow.yCenter =
                currentRow.tokens.reduce((s, t) => s + t.yCenter, 0) / currentRow.tokens.length;
        } else {
            rows.push(currentRow);
            currentRow = { yCenter: tk.yCenter, tokens: [tk] };
        }
    }
    rows.push(currentRow);

    // Sort tokens within each row left-to-right
    for (const row of rows) {
        row.tokens.sort((a, b) => a.normLeft - b.normLeft);
    }

    return rows;
}

// ===========================================================================
//  DATA EXTRACTION
// ===========================================================================

function extractData(rows, anchors, pageWidth, pageHeight) {
    const players = [];
    const issues = [];
    const confidences = [];
    let teamTotals = {
        shooting: { fg2_made: null, fg2_att: null, fg3_made: null, fg3_att: null, ft_made: null, ft_att: null },
        total_points: null,
    };

    // Determine where the player data rows begin (below the header)
    const headerY = anchors.playerHeaderY || 0;

    let rowIndex = 0;

    for (const row of rows) {
        // Skip rows above (or at) the header
        if (row.yCenter <= headerY + 0.005) continue;

        // Concatenate all text in the row to check for "TOTAL" marker
        const rowText = row.tokens.map((t) => t.text).join(' ');
        const rowTextUpper = rowText.toUpperCase();

        // Skip obviously non-data rows
        if (/^\s*$/.test(rowText)) continue;
        if (/QUARTER|HALF|PERIOD|COACH|SCORER|REFEREE|DATE|LOCATION/i.test(rowTextUpper)) continue;

        // Detect totals row
        if (/\bTOTAL[S]?\b/i.test(rowTextUpper) || /\bTEAM\b/i.test(rowTextUpper)) {
            teamTotals = extractTotalsFromRow(row, anchors, pageWidth);
            continue;
        }

        // Try to extract a player row
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

/**
 * Extract player data from a single clustered row.
 */
function extractPlayerFromRow(row, anchors, pageWidth, rowIndex) {
    const tokens = row.tokens;
    if (tokens.length === 0) return null;

    let playerName = null;
    let playerNumber = null;
    const flags = [];
    const rowConfidences = [];

    // ---- Name & Number ----
    // Tokens in the left portion of the page (x < 40% of width roughly) are name/number candidates
    const leftTokens = [];
    const rightTokens = [];
    const scoringStart = anchors.scoringSummaryXStart
        ? anchors.scoringSummaryXStart * pageWidth
        : pageWidth * 0.55;

    for (const tk of tokens) {
        if (tk.normRight < scoringStart) {
            leftTokens.push(tk);
        } else {
            rightTokens.push(tk);
        }
        if (tk.confidence != null) rowConfidences.push(tk.confidence);
    }

    // Try to find jersey number: look for a short purely-numeric token in the left area
    // near the NO. column
    for (const tk of leftTokens) {
        const cleaned = tk.text.replace(/[^0-9]/g, '');
        if (cleaned.length >= 1 && cleaned.length <= 3 && /^\d{1,3}$/.test(cleaned)) {
            // If we already have a number, pick the one closer to the NO. column
            if (anchors.numberXRange) {
                const colCentre = ((anchors.numberXRange.left + anchors.numberXRange.right) / 2) * pageWidth;
                const tkCentre = (tk.normLeft + tk.normRight) / 2;
                if (playerNumber === null || Math.abs(tkCentre - colCentre) < Math.abs(playerNumber._dist)) {
                    playerNumber = { val: cleaned, _dist: tkCentre - colCentre };
                }
            } else if (playerNumber === null) {
                playerNumber = { val: cleaned, _dist: 0 };
            }
        }
    }
    const pNum = playerNumber ? playerNumber.val : null;

    // Name: leftmost non-numeric token(s)
    const nameFragments = [];
    for (const tk of leftTokens) {
        const t = tk.text.trim();
        // Skip if this is the jersey number we already captured
        if (pNum && t.replace(/[^0-9]/g, '') === pNum && t.length <= 3) continue;
        // Skip purely numeric
        if (/^\d+$/.test(t)) continue;
        // Accept if it has at least one letter
        if (/[A-Za-z]/.test(t)) {
            nameFragments.push(t);
        }
    }
    playerName = nameFragments.length > 0 ? nameFragments.join(' ') : null;

    // If we have no name AND no right-side numbers, this row probably isn't a player
    if (!playerName && rightTokens.length === 0) return null;

    // ---- Scoring Summary ----
    const shooting = {
        fg2_made: null, fg2_att: null,
        fg3_made: null, fg3_att: null,
        ft_made: null, ft_att: null,
    };
    let totalPoints = null;
    let personalFoulsTotal = null;

    // Extract numeric values from right-side tokens, mapping by x-position
    const numericRight = rightTokens
        .map((tk) => {
            const nums = parseNumerics(tk.text);
            return nums.map((n) => ({
                value: n,
                centreX: (tk.normLeft + tk.normRight) / 2,
                confidence: tk.confidence,
            }));
        })
        .flat();

    // Map numeric tokens to columns based on anchor positions
    if (anchors.tpXRange) {
        const tpCol = colCentre(anchors.tpXRange, pageWidth);
        const tpMatch = closestNumeric(numericRight, tpCol, pageWidth * 0.05);
        if (tpMatch) totalPoints = tpMatch.value;
    }

    if (anchors.fgXRange) {
        const fgCol = colCentre(anchors.fgXRange, pageWidth);
        // FG column often has made/att as two numbers or a fraction
        const fgMatches = numericsInRange(numericRight, anchors.fgXRange, pageWidth);
        if (fgMatches.length >= 2) {
            shooting.fg2_made = fgMatches[0].value;
            shooting.fg2_att = fgMatches[1].value;
        } else if (fgMatches.length === 1) {
            shooting.fg2_made = fgMatches[0].value;
            flags.push('fg2_att not found; only made value detected');
        }
    }

    if (anchors.fg3XRange) {
        const fg3Matches = numericsInRange(numericRight, anchors.fg3XRange, pageWidth);
        if (fg3Matches.length >= 2) {
            shooting.fg3_made = fg3Matches[0].value;
            shooting.fg3_att = fg3Matches[1].value;
        } else if (fg3Matches.length === 1) {
            shooting.fg3_made = fg3Matches[0].value;
            flags.push('fg3_att not found; only made value detected');
        }
    }

    if (anchors.ftXRange) {
        const ftMatches = numericsInRange(numericRight, anchors.ftXRange, pageWidth);
        if (ftMatches.length >= 2) {
            shooting.ft_made = ftMatches[0].value;
            shooting.ft_att = ftMatches[1].value;
        } else if (ftMatches.length === 1) {
            shooting.ft_made = ftMatches[0].value;
            flags.push('ft_att not found; only made value detected');
        }
    }

    // Personal fouls – look for a numeric value in the fouls column range
    if (anchors.foulsXRange) {
        const pfMatches = numericsInRange(numericRight, anchors.foulsXRange, pageWidth);
        // Also check left tokens if fouls column overlaps the left side
        const pfLeft = numericsInRange(
            leftTokens.map((tk) => {
                const nums = parseNumerics(tk.text);
                return nums.map((n) => ({ value: n, centreX: (tk.normLeft + tk.normRight) / 2 }));
            }).flat(),
            anchors.foulsXRange,
            pageWidth
        );
        const allPf = [...pfMatches, ...pfLeft];
        if (allPf.length > 0) {
            personalFoulsTotal = allPf[0].value;
        }
    }

    // If no column anchors, fall back to positional heuristic:
    // rightmost number is likely TP, next ones are shooting columns
    if (!anchors.tpXRange && !anchors.fgXRange && numericRight.length > 0) {
        // Sort right-to-left
        const sorted = [...numericRight].sort((a, b) => b.centreX - a.centreX);
        totalPoints = sorted[0].value;
        flags.push('total_points assigned by position (rightmost number); no column headers found');

        if (sorted.length >= 3) {
            shooting.ft_made = sorted[1].value;
            shooting.fg2_made = sorted[2].value;
            flags.push('shooting values assigned by position heuristic; may be inaccurate');
        }
    }

    // Confidence
    const avgConf = rowConfidences.length > 0
        ? rowConfidences.reduce((s, c) => s + c, 0) / rowConfidences.length
        : 0.5;

    // Degrade confidence for missing fields
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

/**
 * Extract team totals from a "TOTAL" row.
 */
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
        const tpMatch = closestNumeric(numericTokens, colCentre(anchors.tpXRange, pageWidth), pageWidth * 0.05);
        if (tpMatch) totals.total_points = tpMatch.value;
    }

    if (anchors.fgXRange) {
        const m = numericsInRange(numericTokens, anchors.fgXRange, pageWidth);
        if (m.length >= 2) { totals.shooting.fg2_made = m[0].value; totals.shooting.fg2_att = m[1].value; }
        else if (m.length === 1) totals.shooting.fg2_made = m[0].value;
    }

    if (anchors.fg3XRange) {
        const m = numericsInRange(numericTokens, anchors.fg3XRange, pageWidth);
        if (m.length >= 2) { totals.shooting.fg3_made = m[0].value; totals.shooting.fg3_att = m[1].value; }
        else if (m.length === 1) totals.shooting.fg3_made = m[0].value;
    }

    if (anchors.ftXRange) {
        const m = numericsInRange(numericTokens, anchors.ftXRange, pageWidth);
        if (m.length >= 2) { totals.shooting.ft_made = m[0].value; totals.shooting.ft_att = m[1].value; }
        else if (m.length === 1) totals.shooting.ft_made = m[0].value;
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

    // Check 2: Personal fouls > 5 flag
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

/** Return true if the text looks like an empty / mostly-blank scorebook */
function looksBlank(text) {
    // Strip common pre-printed headers and see if anything handwritten remains
    const stripped = text
        .replace(/PLAYER|NO\.|SCORING|SUMMARY|FG|FT|TP|FOULS?|PERSONAL|QUARTER|HALF|TEAM|TOTAL|HOME|VISITOR|DATE|LOCATION/gi, '')
        .replace(/[^A-Za-z0-9]/g, '');
    return stripped.length < 10;
}

/** Parse all integer numerics from a string (handles fractions like "4/8"). */
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

/** Find the closest numeric token to a given x-position within tolerance. */
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

/** Return all numeric tokens whose x-centre falls within a column range. */
function numericsInRange(numericTokens, range, pageWidth) {
    const left = range.left * pageWidth;
    const right = range.right * pageWidth;
    const margin = (right - left) * 0.3; // slight margin
    return numericTokens
        .filter((nt) => nt.centreX >= left - margin && nt.centreX <= right + margin)
        .sort((a, b) => a.centreX - b.centreX);
}

function computeOverallConfidence(confidences, issues) {
    if (confidences.length === 0) return 0.0;
    let avg = confidences.reduce((s, c) => s + c, 0) / confidences.length;
    // Degrade for issues
    avg -= issues.length * 0.05;
    return Math.max(0.0, Math.min(1.0, avg));
}

function round2(n) {
    return Math.round(n * 100) / 100;
}

// ===========================================================================
//  EXPORTS
// ===========================================================================

module.exports = { parseMark5Minimal };
