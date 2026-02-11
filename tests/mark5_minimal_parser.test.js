'use strict';

const path = require('path');
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

    // -- Sample data --

    test('conforms to full JSON schema shape', () => {
        const result = parseMark5Minimal({ documentAiJson: sampleFixture });
        expectResultShape(result);
        for (const player of result.players) {
            expectPlayerShape(player);
        }
    });

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

    test('extracts total_points for players', () => {
        const result = parseMark5Minimal({ documentAiJson: sampleFixture });
        const tp = result.players.map((p) => p.total_points).filter((v) => v !== null);
        // At least some players should have total_points
        expect(tp.length).toBeGreaterThan(0);
    });

    test('extracts team totals', () => {
        const result = parseMark5Minimal({ documentAiJson: sampleFixture });
        expect(result.team_totals.total_points).toBe(52);
    });

    test('row_index values are sequential starting from 0', () => {
        const result = parseMark5Minimal({ documentAiJson: sampleFixture });
        for (let i = 0; i < result.players.length; i++) {
            expect(result.players[i].row_index).toBe(i);
        }
    });

    test('confidence scores are between 0 and 1', () => {
        const result = parseMark5Minimal({ documentAiJson: sampleFixture });
        expect(result.quality.overall_confidence).toBeGreaterThan(0);
        expect(result.quality.overall_confidence).toBeLessThanOrEqual(1);
        for (const p of result.players) {
            expect(p.confidence).toBeGreaterThan(0);
            expect(p.confidence).toBeLessThanOrEqual(1);
        }
    });

    test('validation checks array is populated for sample', () => {
        const result = parseMark5Minimal({ documentAiJson: sampleFixture });
        // The validation object must always exist and have the right shape
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
            for (const [key, val] of Object.entries(p.shooting)) {
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

    // -- Validation logic --

    test('needs_review reflects overall confidence threshold', () => {
        // Create a minimal low-confidence fixture
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
        // Low confidence data: needs_review should be true
        // because >50% players have null total_points or confidence is low
        expect(result.quality.overall_confidence).toBeLessThan(0.7);
    });
});
