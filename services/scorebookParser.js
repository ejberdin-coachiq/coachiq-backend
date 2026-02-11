'use strict';

// ---------------------------------------------------------------------------
// Heuristic scorebook parser
//
// Takes raw OCR text and attempts to extract basketball stats using regex
// and line-by-line grouping. Works best on standard scorebook layouts but
// will degrade gracefully with warnings when data is ambiguous.
// ---------------------------------------------------------------------------

/**
 * @param {string} text - full OCR text from Document AI
 * @returns {{ players: Array, teamTotals: object|null, warnings: string[] }}
 */
function parseScorebook(text) {
    const warnings = [];
    const players = [];
    let teamTotals = null;

    if (!text || typeof text !== 'string' || text.trim().length === 0) {
        warnings.push('No text provided for parsing.');
        return { players, teamTotals, warnings };
    }

    const lines = text.split('\n').map((l) => l.trim()).filter(Boolean);

    // ---------------------------------------------------------------------------
    // Strategy: look for lines that start with a jersey number (1-3 digits)
    // followed by a name and a series of numbers (stats columns).
    // ---------------------------------------------------------------------------

    // Common pattern:  "23  Smith, John   4  2  6  1  2  3  2"
    // Or:              "#23  John Smith   4/8  2/4  10  3"
    // We capture the number, name fragment, and trailing numbers.
    const playerLineRe =
        /^#?\s*(\d{1,3})\s+([A-Za-z][A-Za-z., '-]{1,30})\s+([\d/\s.]+)$/;

    // Alternative: number at start, name, then tab/multi-space separated digits
    const altPlayerRe =
        /^#?\s*(\d{1,3})\s{2,}(.+?)\s{2,}([\d/\s.]+)$/;

    // Totals line (case-insensitive)
    const totalsRe = /^(?:totals?|team\s*totals?|total)\s*[:\s]*([\d/\s.]+)$/i;

    for (const line of lines) {
        // --- try totals first (so we don't mistake "TOTAL" for a player) ---
        const tm = totalsRe.exec(line);
        if (tm) {
            const nums = extractNumbers(tm[1]);
            teamTotals = buildTotals(nums);
            continue;
        }

        // --- player lines ---
        const pm = playerLineRe.exec(line) || altPlayerRe.exec(line);
        if (pm) {
            const number = pm[1];
            const name = pm[2].trim();
            const nums = extractNumbers(pm[3]);
            players.push(buildPlayer(number, name, nums, warnings));
            continue;
        }

        // --- fallback: line starts with 1-3 digits then has more numbers ---
        const fallbackRe = /^#?\s*(\d{1,3})\b(.+)/;
        const fm = fallbackRe.exec(line);
        if (fm) {
            const rest = fm[2];
            const nums = extractNumbers(rest);
            // Only count as player if at least 2 numeric values exist
            if (nums.length >= 2) {
                // Try to tease out a name
                const namePart = rest.replace(/[\d/.\s]+/g, ' ').trim();
                players.push(
                    buildPlayer(fm[1], namePart || 'Unknown', nums, warnings)
                );
            }
        }
    }

    if (players.length === 0) {
        warnings.push('No player stat lines detected. OCR text may need manual review.');
    }

    return { players, teamTotals, warnings };
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Extract all numbers (including fractions like "4/8") from a string. */
function extractNumbers(str) {
    const tokens = str.trim().split(/\s+/);
    const nums = [];
    for (const t of tokens) {
        if (/^\d+\/\d+$/.test(t)) {
            // fraction → made, attempted
            const [made, att] = t.split('/').map(Number);
            nums.push(made, att);
        } else if (/^\d+(\.\d+)?$/.test(t)) {
            nums.push(Number(t));
        }
    }
    return nums;
}

/**
 * Map an array of numbers to a player stat object.
 * Column mapping varies by scorebook – we use a common order:
 *   FGM, FGA, FTM, FTA, PTS, FOULS
 * When fewer columns are present we fill what we can.
 */
function buildPlayer(number, name, nums, warnings) {
    const player = {
        number,
        name,
        points: 0,
        fieldGoalsMade: 0,
        fieldGoalsAttempted: 0,
        freeThrowsMade: 0,
        freeThrowsAttempted: 0,
        fouls: 0,
        _raw: nums,
    };

    if (nums.length >= 6) {
        player.fieldGoalsMade = nums[0];
        player.fieldGoalsAttempted = nums[1];
        player.freeThrowsMade = nums[2];
        player.freeThrowsAttempted = nums[3];
        player.points = nums[4];
        player.fouls = nums[5];
    } else if (nums.length >= 4) {
        // Likely: FGM, FGA, FTM, FTA  (points not separate)
        player.fieldGoalsMade = nums[0];
        player.fieldGoalsAttempted = nums[1];
        player.freeThrowsMade = nums[2];
        player.freeThrowsAttempted = nums[3];
        player.points = nums[0] * 2 + nums[2]; // rough estimate
        if (nums[4] != null) player.fouls = nums[4];
        warnings.push(
            `Player #${number}: points estimated from FG/FT (no 3PT info).`
        );
    } else if (nums.length >= 1) {
        player.points = nums[0];
        warnings.push(`Player #${number}: only ${nums.length} column(s) detected – limited stats.`);
    }

    return player;
}

function buildTotals(nums) {
    if (nums.length === 0) return null;
    const totals = {
        totalPoints: 0,
        fieldGoalsMade: 0,
        fieldGoalsAttempted: 0,
        freeThrowsMade: 0,
        freeThrowsAttempted: 0,
        fieldGoalPercentage: 0,
        freeThrowPercentage: 0,
    };

    if (nums.length >= 6) {
        totals.fieldGoalsMade = nums[0];
        totals.fieldGoalsAttempted = nums[1];
        totals.freeThrowsMade = nums[2];
        totals.freeThrowsAttempted = nums[3];
        totals.totalPoints = nums[4];
    } else if (nums.length >= 1) {
        totals.totalPoints = nums[nums.length - 1];
    }

    if (totals.fieldGoalsAttempted > 0) {
        totals.fieldGoalPercentage =
            Math.round((totals.fieldGoalsMade / totals.fieldGoalsAttempted) * 1000) / 1000;
    }
    if (totals.freeThrowsAttempted > 0) {
        totals.freeThrowPercentage =
            Math.round((totals.freeThrowsMade / totals.freeThrowsAttempted) * 1000) / 1000;
    }

    return totals;
}

module.exports = { parseScorebook };
