'use strict';

const { parseMark5Minimal } = require('../scorebooks/mark5_minimal_parser');

const blankFixture = require('./fixtures/mark5_blank_ocr.json');
const sampleFixture = require('./fixtures/mark5_sample_ocr.json');

// ---------------------------------------------------------------------------
// Schema shape helpers
// ---------------------------------------------------------------------------

function expectShootingShape(shooting) {
    expect(shooting).toHaveProperty('fg2_made');
    expect(shooting).toHaveProperty('fg2_att');
    expect(shooting).toHaveProperty('fg3_made');
    expect(shooting).toHaveProperty('fg3_att');
    expect(shooting).toHaveProperty('ft_made');
    expect(shooting).toHaveProperty('ft_att');
}

function expectPlayerShape(player) {
    expect(player).toHaveProperty('row_index');
    expect(typeof player.row_index).toBe('number');
    expect(player).toHaveProperty('player_name');
    expect(player).toHaveProperty('player_number');
    expect(player).toHaveProperty('personal_fouls_total');
    expect(player).toHaveProperty('shooting');
    expectShootingShape(player.shooting);
    expect(player).toHaveProperty('total_points');
    expect(player).toHaveProperty('confidence');
    expect(typeof player.confidence).toBe('number');
    expect(player.confidence).toBeGreaterThanOrEqual(0);
    expect(player.confidence).toBeLessThanOrEqual(1);
    expect(player).toHaveProperty('flags');
    expect(Array.isArray(player.flags)).toBe(true);
}

function expectResultShape(result) {
    expect(result).toHaveProperty('template', 'Mark 5 Basketball Scorebook');
    expect(typeof result.is_blank).toBe('boolean');
    expect(result).toHaveProperty('quality');
    expect(typeof result.quality.overall_confidence).toBe('number');
    expect(Array.isArray(result.quality.issues)).toBe(true);
    expect(Array.isArray(result.players)).toBe(true);
    expect(result).toHaveProperty('team_totals');
    expectShootingShape(result.team_totals.shooting);
    expect(result.team_totals).toHaveProperty('total_points');
    expect(result).toHaveProperty('validation');
    expect(Array.isArray(result.validation.checks)).toBe(true);
    expect(typeof result.validation.needs_review).toBe('boolean');
    expect(Array.isArray(result.validation.review_reasons)).toBe(true);
}

function findPlayer(result, name) {
    return result.players.find((p) => p.player_name === name);
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('parseMark5Minimal', () => {
    // -- Edge cases --

    test('returns blank result when no input provided', () => {
        const result = parseMark5Minimal();
        expectResultShape(result);
        expect(result.is_blank).toBe(true);
        expect(result.players).toHaveLength(0);
    });

    test('returns blank result for empty object', () => {
        const result = parseMark5Minimal({ documentAiJson: {} });
        expectResultShape(result);
        expect(result.is_blank).toBe(true);
        expect(result.players).toHaveLength(0);
    });

    test('returns blank result for null documentAiJson', () => {
        const result = parseMark5Minimal({ documentAiJson: null });
        expectResultShape(result);
        expect(result.is_blank).toBe(true);
    });

    // -- Blank scorebook --

    test('correctly identifies blank Mark 5 scorebook', () => {
        const result = parseMark5Minimal({ documentAiJson: blankFixture });
        expectResultShape(result);
        expect(result.is_blank).toBe(true);
        expect(result.players).toHaveLength(0);
        expect(result.quality.overall_confidence).toBe(1.0);
    });

    // -- Sample data: schema --

    test('conforms to full JSON schema shape', () => {
        const result = parseMark5Minimal({ documentAiJson: sampleFixture });
        expectResultShape(result);
        for (const player of result.players) {
            expectPlayerShape(player);
        }
    });

    // -- Sample data: players --

    test('extracts correct number of players from sample', () => {
        const result = parseMark5Minimal({ documentAiJson: sampleFixture });
        expect(result.is_blank).toBe(false);
        expect(result.players.length).toBe(5);
    });

    test('extracts player names from sample', () => {
        const result = parseMark5Minimal({ documentAiJson: sampleFixture });
        const names = result.players.map((p) => p.player_name);
        expect(names).toContain('Smith');
        expect(names).toContain('Johnson');
        expect(names).toContain('Williams');
        expect(names).toContain('Brown');
        expect(names).toContain('Davis');
    });

    test('extracts player numbers from sample', () => {
        const result = parseMark5Minimal({ documentAiJson: sampleFixture });
        const numbers = result.players.map((p) => p.player_number);
        expect(numbers).toContain('23');
        expect(numbers).toContain('11');
        expect(numbers).toContain('32');
        expect(numbers).toContain('15');
    });

    test('row_index values are sequential starting from 0', () => {
        const result = parseMark5Minimal({ documentAiJson: sampleFixture });
        for (let i = 0; i < result.players.length; i++) {
            expect(result.players[i].row_index).toBe(i);
        }
    });

    // -- Scoring summary (Mark 5 columns: 2's | 3's | A | M | TP) --

    test('extracts total_points for players', () => {
        const result = parseMark5Minimal({ documentAiJson: sampleFixture });
        const smith = findPlayer(result, 'Smith');
        expect(smith.total_points).toBe(13);
        const johnson = findPlayer(result, 'Johnson');
        expect(johnson.total_points).toBe(10);
    });

    test('extracts fg2_made (2s column) correctly', () => {
        const result = parseMark5Minimal({ documentAiJson: sampleFixture });
        const smith = findPlayer(result, 'Smith');
        expect(smith.shooting.fg2_made).toBe(4);
        const brown = findPlayer(result, 'Brown');
        expect(brown.shooting.fg2_made).toBe(1);
    });

    test('extracts fg3_made (3s column) correctly', () => {
        const result = parseMark5Minimal({ documentAiJson: sampleFixture });
        const smith = findPlayer(result, 'Smith');
        expect(smith.shooting.fg3_made).toBe(1);
        const johnson = findPlayer(result, 'Johnson');
        expect(johnson.shooting.fg3_made).toBe(0);
    });

    test('extracts ft_att and ft_made correctly', () => {
        const result = parseMark5Minimal({ documentAiJson: sampleFixture });
        const smith = findPlayer(result, 'Smith');
        expect(smith.shooting.ft_att).toBe(2);
        expect(smith.shooting.ft_made).toBe(2);
        const johnson = findPlayer(result, 'Johnson');
        expect(johnson.shooting.ft_att).toBe(6);
        expect(johnson.shooting.ft_made).toBe(4);
    });

    test('fg2_att and fg3_att are null (not in Mark 5 scoring summary)', () => {
        const result = parseMark5Minimal({ documentAiJson: sampleFixture });
        for (const p of result.players) {
            expect(p.shooting.fg2_att).toBeNull();
            expect(p.shooting.fg3_att).toBeNull();
        }
    });

    // -- Team totals --

    test('extracts team totals', () => {
        const result = parseMark5Minimal({ documentAiJson: sampleFixture });
        expect(result.team_totals.total_points).toBe(52);
        expect(result.team_totals.shooting.fg2_made).toBe(15);
        expect(result.team_totals.shooting.fg3_made).toBe(4);
        expect(result.team_totals.shooting.ft_att).toBe(14);
        expect(result.team_totals.shooting.ft_made).toBe(10);
    });

    // -- Personal Fouls (P1-P5 mark counting) --

    test('counts personal fouls from X marks (Smith: 3 fouls)', () => {
        const result = parseMark5Minimal({ documentAiJson: sampleFixture });
        const smith = findPlayer(result, 'Smith');
        expect(smith.personal_fouls_total).toBe(3);
    });

    test('counts personal fouls from X marks (Johnson: 2 fouls)', () => {
        const result = parseMark5Minimal({ documentAiJson: sampleFixture });
        const johnson = findPlayer(result, 'Johnson');
        expect(johnson.personal_fouls_total).toBe(2);
    });

    test('counts personal fouls from X marks (Williams: 4 fouls)', () => {
        const result = parseMark5Minimal({ documentAiJson: sampleFixture });
        const williams = findPlayer(result, 'Williams');
        expect(williams.personal_fouls_total).toBe(4);
    });

    test('returns null fouls when no marks (Brown: 0 fouls, all P-slots clean)', () => {
        const result = parseMark5Minimal({ documentAiJson: sampleFixture });
        const brown = findPlayer(result, 'Brown');
        // All P1-P5 are clean, so no marks detected → null (not guessing 0)
        expect(brown.personal_fouls_total).toBeNull();
        expect(brown.flags.some((f) => f.includes('fouls_not_determined'))).toBe(true);
    });

    test('counts personal fouls from X marks (Davis: 3 fouls)', () => {
        const result = parseMark5Minimal({ documentAiJson: sampleFixture });
        const davis = findPlayer(result, 'Davis');
        expect(davis.personal_fouls_total).toBe(3);
    });

    test('fouls flags explain counting method', () => {
        const result = parseMark5Minimal({ documentAiJson: sampleFixture });
        const smith = findPlayer(result, 'Smith');
        expect(smith.flags.some((f) => f.includes('fouls_from_mark_count'))).toBe(true);
    });

    // -- Confidence & quality --

    test('confidence scores are between 0 and 1', () => {
        const result = parseMark5Minimal({ documentAiJson: sampleFixture });
        expect(result.quality.overall_confidence).toBeGreaterThan(0);
        expect(result.quality.overall_confidence).toBeLessThanOrEqual(1);
        for (const p of result.players) {
            expect(p.confidence).toBeGreaterThan(0);
            expect(p.confidence).toBeLessThanOrEqual(1);
        }
    });

    // -- Validation --

    test('validation checks array is populated for sample', () => {
        const result = parseMark5Minimal({ documentAiJson: sampleFixture });
        expect(result.validation).toBeDefined();
        for (const check of result.validation.checks) {
            expect(check).toHaveProperty('name');
            expect(typeof check.passed).toBe('boolean');
            expect(typeof check.details).toBe('string');
        }
    });

    test('shooting fields are integers or null', () => {
        const result = parseMark5Minimal({ documentAiJson: sampleFixture });
        for (const p of result.players) {
            for (const [, val] of Object.entries(p.shooting)) {
                if (val !== null) {
                    expect(Number.isInteger(val)).toBe(true);
                }
            }
        }
    });

    test('personal_fouls_total is integer or null', () => {
        const result = parseMark5Minimal({ documentAiJson: sampleFixture });
        for (const p of result.players) {
            if (p.personal_fouls_total !== null) {
                expect(Number.isInteger(p.personal_fouls_total)).toBe(true);
            }
        }
    });

    // -- Low confidence triggers needs_review --

    test('needs_review reflects overall confidence threshold', () => {
        const lowConfFixture = {
            text: 'PLAYER NO. TP\nSmith 10',
            pages: [{
                pageNumber: 1,
                width: 1000,
                height: 1000,
                lines: [
                    { text: 'PLAYER', confidence: 0.3, bbox: { x1: 0, y1: 50, x2: 200, y2: 50, x3: 200, y3: 80, x4: 0, y4: 80 } },
                    { text: 'NO.', confidence: 0.3, bbox: { x1: 210, y1: 50, x2: 280, y2: 50, x3: 280, y3: 80, x4: 210, y4: 80 } },
                    { text: 'TP', confidence: 0.3, bbox: { x1: 800, y1: 50, x2: 900, y2: 50, x3: 900, y3: 80, x4: 800, y4: 80 } },
                    { text: 'Smith', confidence: 0.3, bbox: { x1: 0, y1: 150, x2: 200, y2: 150, x3: 200, y3: 180, x4: 0, y4: 180 } },
                    { text: '10', confidence: 0.3, bbox: { x1: 800, y1: 150, x2: 900, y2: 150, x3: 900, y3: 180, x4: 800, y4: 180 } },
                ],
            }],
        };
        const result = parseMark5Minimal({ documentAiJson: lowConfFixture });
        expectResultShape(result);
        expect(result.quality.overall_confidence).toBeLessThan(0.7);
    });

    // -- Foul mark variants --

    test('handles P-slot merged marks (e.g. "P1X")', () => {
        const fixture = {
            text: 'PLAYER NO. PERSONAL FOULS TP\nTest 10 P1X P2X P3 P4 P5 8',
            pages: [{
                pageNumber: 1, width: 3300, height: 2550,
                lines: [
                    { text: 'PLAYER', confidence: 0.99, bbox: { x1: 320, y1: 220, x2: 550, y2: 220, x3: 550, y3: 255, x4: 320, y4: 255 } },
                    { text: 'NO.', confidence: 0.99, bbox: { x1: 560, y1: 220, x2: 620, y2: 220, x3: 620, y3: 255, x4: 560, y4: 255 } },
                    { text: 'PERSONAL FOULS', confidence: 0.98, bbox: { x1: 640, y1: 220, x2: 900, y2: 220, x3: 900, y3: 255, x4: 640, y4: 255 } },
                    { text: 'TP', confidence: 0.99, bbox: { x1: 3050, y1: 220, x2: 3100, y2: 220, x3: 3100, y3: 255, x4: 3050, y4: 255 } },
                    { text: 'Test', confidence: 0.95, bbox: { x1: 330, y1: 300, x2: 450, y2: 300, x3: 450, y3: 340, x4: 330, y4: 340 } },
                    { text: '10', confidence: 0.96, bbox: { x1: 570, y1: 300, x2: 610, y2: 300, x3: 610, y3: 340, x4: 570, y4: 340 } },
                    { text: 'P1X', confidence: 0.70, bbox: { x1: 660, y1: 300, x2: 710, y2: 300, x3: 710, y3: 340, x4: 660, y4: 340 } },
                    { text: 'P2X', confidence: 0.68, bbox: { x1: 720, y1: 300, x2: 770, y2: 300, x3: 770, y3: 340, x4: 720, y4: 340 } },
                    { text: 'P3', confidence: 0.97, bbox: { x1: 780, y1: 300, x2: 815, y2: 300, x3: 815, y3: 340, x4: 780, y4: 340 } },
                    { text: 'P4', confidence: 0.97, bbox: { x1: 830, y1: 300, x2: 865, y2: 300, x3: 865, y3: 340, x4: 830, y4: 340 } },
                    { text: 'P5', confidence: 0.97, bbox: { x1: 880, y1: 300, x2: 915, y2: 300, x3: 915, y3: 340, x4: 880, y4: 340 } },
                    { text: '8', confidence: 0.95, bbox: { x1: 3055, y1: 300, x2: 3090, y2: 300, x3: 3090, y3: 340, x4: 3055, y4: 340 } },
                ],
            }],
        };
        const result = parseMark5Minimal({ documentAiJson: fixture });
        expect(result.players.length).toBe(1);
        expect(result.players[0].personal_fouls_total).toBe(2);
        expect(result.players[0].flags.some((f) => f.includes('P1') && f.includes('P2'))).toBe(true);
    });
});
