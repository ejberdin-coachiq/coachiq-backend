# CoachIQ Backend

AI-powered basketball scouting backend. Analyses game film with Claude AI, extracts scorebook stats, and generates coaching insights.

Deployed on **Railway** with Docker.

---

## Quick Start

```bash
npm install
export ANTHROPIC_API_KEY=sk-ant-...
npm start            # http://localhost:3000
```

See `.env.example` for the full list of environment variables.

---

## Document AI OCR Setup

The `/api/ocr/scorebook` endpoints use **Google Cloud Document AI** to extract handwritten text from uploaded scorebook images and PDFs.

### 1. Enable the Document AI API

1. Go to the [GCP Console](https://console.cloud.google.com/).
2. Select (or create) a project.
3. Navigate to **APIs & Services > Library**.
4. Search for **Cloud Document AI API** and click **Enable**.

### 2. Create a Document AI Processor

1. Go to **Document AI > Processors** in the GCP Console (or visit <https://console.cloud.google.com/ai/document-ai/processors>).
2. Click **Create Processor**.
3. Choose **OCR** (or **Form Parser** if you want key-value extraction too).
4. Select a region — typically **us** or **eu**.
5. After creation, note the **Processor ID** (shown in the processor details page) and the **Location** you selected.

### 3. Create a Service Account

1. Go to **IAM & Admin > Service Accounts**.
2. Click **Create Service Account**.
3. Name it (e.g. `coachiq-documentai`).
4. Grant the role **Cloud Document AI Editor** (or **Cloud Document AI Viewer** if only processing).
5. Click **Done**, then open the new account > **Keys** > **Add Key** > **Create new key** > **JSON**.
6. Download the JSON key file.

### 4. Set Environment Variables

| Variable | Description | Example |
|---|---|---|
| `GOOGLE_CLOUD_PROJECT_ID` | Your GCP project ID | `my-project-123` |
| `GOOGLE_CLOUD_LOCATION` | Processor region | `us` |
| `GOOGLE_DOCUMENTAI_PROCESSOR_ID` | Processor ID from step 2 | `a1b2c3d4e5f6` |
| `GOOGLE_APPLICATION_CREDENTIALS_JSON` | Full JSON content of the service account key (single line) | `{"type":"service_account",...}` |

**On Railway:**
Go to your service > **Settings > Variables** and add each variable above.

**Locally:**
```bash
export GOOGLE_CLOUD_PROJECT_ID=my-project-123
export GOOGLE_CLOUD_LOCATION=us
export GOOGLE_DOCUMENTAI_PROCESSOR_ID=a1b2c3d4e5f6
export GOOGLE_APPLICATION_CREDENTIALS_JSON='{"type":"service_account",...}'
```

Or set `GOOGLE_APPLICATION_CREDENTIALS=/path/to/key.json` instead of the JSON env var.

### 5. Costs & Quotas

- Document AI pricing: <https://cloud.google.com/document-ai/pricing>
- The OCR processor is billed per page processed.
- Free tier: **1,000 pages/month** (as of 2025).
- Default quota: 120 requests/min. Increase via the GCP Console if needed.

---

## OCR API Endpoints

### `POST /api/ocr/scorebook`

Extract raw text and bounding boxes from a scorebook image or PDF.

**Request** — `multipart/form-data`:

| Field | Type | Required |
|---|---|---|
| `file` | File (JPEG, PNG, or PDF) | Yes |

**Example:**

```bash
curl -X POST http://localhost:3000/api/ocr/scorebook \
  -F "file=@scorebook.jpg"
```

**Response:**

```json
{
  "success": true,
  "requestId": "a1b2c3d4",
  "processingTime": "1.23s",
  "text": "Full extracted text...",
  "pages": [
    {
      "pageNumber": 1,
      "width": 3024,
      "height": 4032,
      "lines": [
        {
          "text": "#23 Smith  4  2  8  1  2  3",
          "confidence": 0.97,
          "bbox": { "x1": 100, "y1": 200, "x2": 900, "y2": 200, "x3": 900, "y3": 250, "x4": 100, "y4": 250 }
        }
      ]
    }
  ]
}
```

### `POST /api/ocr/scorebook/parse`

Same as above, but also runs a heuristic parser to extract player stats.

**Example:**

```bash
curl -X POST http://localhost:3000/api/ocr/scorebook/parse \
  -F "file=@scorebook.jpg"
```

**Response:**

```json
{
  "success": true,
  "requestId": "e5f6g7h8",
  "processingTime": "1.45s",
  "ocr": { "text": "...", "pages": [ ... ] },
  "parsed": {
    "players": [
      {
        "number": "23",
        "name": "Smith",
        "points": 10,
        "fieldGoalsMade": 4,
        "fieldGoalsAttempted": 8,
        "freeThrowsMade": 2,
        "freeThrowsAttempted": 3,
        "fouls": 2
      }
    ],
    "teamTotals": {
      "totalPoints": 58,
      "fieldGoalsMade": 22,
      "fieldGoalsAttempted": 50,
      "freeThrowsMade": 10,
      "freeThrowsAttempted": 14,
      "fieldGoalPercentage": 0.44,
      "freeThrowPercentage": 0.714
    }
  },
  "warnings": []
}
```

### Error Responses

| Status | Meaning |
|---|---|
| `400` | Missing file or unsupported MIME type |
| `413` | File exceeds size limit |
| `500` | Internal OCR processing failure |

---

## Test Script

```bash
npm run ocr:test path/to/sample.jpg
```

Prints extracted text length and the first 300 characters.

---

## All Endpoints

| Method | Path | Description |
|---|---|---|
| `GET` | `/` | API status |
| `GET` | `/health` | Health check |
| `POST` | `/api/users/register` | Register user |
| `GET` | `/api/users/:email` | Get user |
| `GET` | `/api/users/:email/reports` | Get user reports |
| `GET` | `/api/reports/:id` | Get report |
| `POST` | `/api/upload/init` | Init chunked upload |
| `POST` | `/api/upload/chunk` | Upload chunk |
| `POST` | `/api/upload/finalize` | Finalize upload |
| `POST` | `/api/upload/simple` | Simple upload |
| `POST` | `/api/analyze-scorebook` | Scorebook analysis (Claude) |
| `POST` | `/api/ocr/scorebook` | Document AI OCR |
| `POST` | `/api/ocr/scorebook/parse` | OCR + stat parsing |
