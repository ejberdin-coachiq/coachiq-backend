# Scorebook Parsers

## Mark 5 Minimal Parser

**Module:** `scorebooks/mark5_minimal_parser.js`

Extracts roster and per-player scoring totals from a single Mark 5 Basketball Scorebook page image, using Google Document AI OCR output.

### What It Extracts

| Field | Description |
|---|---|
| `player_name` | Player name from roster column |
| `player_number` | Jersey number (if present) |
| `personal_fouls_total` | Written foul total (does **not** attempt to count checkbox marks) |
| `shooting.fg2_made / fg2_att` | 2-point field goals made / attempted |
| `shooting.fg3_made / fg3_att` | 3-point field goals made / attempted |
| `shooting.ft_made / ft_att` | Free throws made / attempted |
| `total_points` | Total points for the player |
| `team_totals` | Same shooting + total_points aggregated for the team |

### What It Does NOT Extract

- Play-by-play data
- Running score
- Turnovers
- Quarter-by-quarter logs

### How It Works

1. **Anchor detection** — Finds OCR tokens matching header text ("PLAYER", "NO.", "FG", "3PT", "FT", "TP", "PERSONAL FOULS", "SCORING SUMMARY") and records their x-positions to define column boundaries.

2. **Row clustering** — Groups all OCR tokens into horizontal rows by y-coordinate proximity (within ~1.5% of page height).

3. **Data extraction** — For each row below the header:
   - Left-side tokens → player name + jersey number
   - Right-side tokens → mapped to scoring columns by x-position alignment with anchors
   - A "TOTAL" row triggers team totals extraction

4. **Validation** — Cross-checks:
   - `total_points == 2*fg2_made + 3*fg3_made + ft_made` (when all components non-null)
   - Flags personal fouls > 5
   - Checks team total vs sum of player points
   - Sets `needs_review = true` if any check fails, confidence < 0.70, or >50% of players have null total_points

### Usage

```javascript
const { parseMark5Minimal } = require('./scorebooks/mark5_minimal_parser');

// documentAiJson is the output from services/documentai.js
// Shape: { text: string, pages: [{ pageNumber, width, height, lines: [{ text, confidence, bbox }] }] }
const result = parseMark5Minimal({ documentAiJson: ocrResult });

console.log(result.is_blank);        // true if no handwritten data detected
console.log(result.players.length);  // number of player rows extracted
console.log(result.team_totals);     // team shooting totals
console.log(result.validation);      // cross-checks and review flags
```

### Running Tests

```bash
npm test
```

Or run only the Mark 5 parser tests:

```bash
npx jest tests/mark5_minimal_parser.test.js
```

### Output Schema

```json
{
  "template": "Mark 5 Basketball Scorebook",
  "is_blank": false,
  "quality": {
    "overall_confidence": 0.87,
    "issues": []
  },
  "players": [
    {
      "row_index": 0,
      "player_name": "Smith",
      "player_number": "23",
      "personal_fouls_total": 3,
      "shooting": {
        "fg2_made": 4,
        "fg2_att": 8,
        "fg3_made": 1,
        "fg3_att": 3,
        "ft_made": 2,
        "ft_att": 2
      },
      "total_points": 13,
      "confidence": 0.92,
      "flags": []
    }
  ],
  "team_totals": {
    "shooting": {
      "fg2_made": 15,
      "fg2_att": 36,
      "fg3_made": 4,
      "fg3_att": 12,
      "ft_made": 10,
      "ft_att": 14
    },
    "total_points": 52
  },
  "validation": {
    "checks": [
      {
        "name": "points_equation_player_0",
        "passed": true,
        "details": "Player #23: 13 = 2*4 + 3*1 + 2"
      },
      {
        "name": "team_total_vs_player_sum",
        "passed": true,
        "details": "Team total 52 matches player sum."
      }
    ],
    "needs_review": false,
    "review_reasons": []
  }
}
```

### Confidence & Flags

- **`confidence`** (per player): Average OCR confidence for the row's tokens, degraded when fields are null or flags are present.
- **`overall_confidence`**: Mean of all player confidences, reduced by 0.05 per quality issue.
- **`flags`**: Array of strings explaining why a field is null or uncertain (e.g., `"fg2_att not found; only made value detected"`).
- **`needs_review`**: `true` when human review is recommended.

### Integration with OCR Endpoint

The parser is designed to work with the `/api/ocr/scorebook` endpoint output:

```bash
# Step 1: OCR the image
curl -X POST http://localhost:3000/api/ocr/scorebook -F "file=@scorebook.jpg" -o ocr.json

# Step 2: Pass the OCR JSON to the parser (programmatically)
```

Or use the combined `/api/ocr/scorebook/parse` endpoint which runs OCR + the basic heuristic parser in one call.
