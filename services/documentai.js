'use strict';

const { DocumentProcessorServiceClient } = require('@google-cloud/documentai').v1;

// ---------------------------------------------------------------------------
// Config – read once at module load
// ---------------------------------------------------------------------------
const PROJECT_ID = process.env.GOOGLE_CLOUD_PROJECT_ID;
const LOCATION = process.env.GOOGLE_CLOUD_LOCATION || 'us';
const PROCESSOR_ID = process.env.GOOGLE_DOCUMENTAI_PROCESSOR_ID;

const SUPPORTED_MIME_TYPES = new Set([
    'image/jpeg',
    'image/png',
    'application/pdf',
]);

const MAX_FILE_SIZE = parseInt(process.env.OCR_MAX_FILE_SIZE_MB || '20', 10) * 1024 * 1024;

// ---------------------------------------------------------------------------
// Client singleton (lazy-initialised so the module can be required even when
// credentials are absent – the server won't crash on import)
// ---------------------------------------------------------------------------
let _client = null;

function getClient() {
    if (_client) return _client;

    const opts = {};

    // Support storing the full service-account JSON in an env var (common on
    // Railway / Render / Fly where you can't mount a credentials file).
    if (process.env.GOOGLE_APPLICATION_CREDENTIALS_JSON) {
        const creds = JSON.parse(process.env.GOOGLE_APPLICATION_CREDENTIALS_JSON);
        opts.credentials = {
            client_email: creds.client_email,
            private_key: creds.private_key,
        };
        opts.projectId = creds.project_id || PROJECT_ID;
    }
    // Otherwise fall back to GOOGLE_APPLICATION_CREDENTIALS (file path) which
    // the SDK picks up automatically.

    // Document AI has regional endpoints
    const apiEndpoint = `${LOCATION}-documentai.googleapis.com`;
    opts.apiEndpoint = apiEndpoint;

    _client = new DocumentProcessorServiceClient(opts);
    return _client;
}

// ---------------------------------------------------------------------------
// Core function: processDocumentAI
// ---------------------------------------------------------------------------

/**
 * Send a file buffer to Google Document AI and return normalised results.
 *
 * @param {Buffer}  fileBuffer - raw file bytes
 * @param {string}  mimeType  - e.g. "image/jpeg"
 * @returns {Promise<{text: string, pages: Array}>}
 */
async function processDocumentAI(fileBuffer, mimeType) {
    // --- guard-rails ---
    if (!PROJECT_ID || !PROCESSOR_ID) {
        throw new Error(
            'Document AI is not configured. Set GOOGLE_CLOUD_PROJECT_ID, ' +
            'GOOGLE_DOCUMENTAI_PROCESSOR_ID, and credentials env vars.'
        );
    }

    if (!SUPPORTED_MIME_TYPES.has(mimeType)) {
        throw Object.assign(
            new Error(`Unsupported file type: ${mimeType}. Supported: ${[...SUPPORTED_MIME_TYPES].join(', ')}`),
            { statusCode: 400 }
        );
    }

    if (fileBuffer.length > MAX_FILE_SIZE) {
        throw Object.assign(
            new Error(`File too large (${(fileBuffer.length / 1024 / 1024).toFixed(1)} MB). Max: ${MAX_FILE_SIZE / 1024 / 1024} MB.`),
            { statusCode: 413 }
        );
    }

    const client = getClient();
    const processorName = `projects/${PROJECT_ID}/locations/${LOCATION}/processors/${PROCESSOR_ID}`;

    console.log(`[DocumentAI] Processing ${mimeType} (${(fileBuffer.length / 1024).toFixed(1)} KB) via ${processorName}`);

    const request = {
        name: processorName,
        rawDocument: {
            content: fileBuffer.toString('base64'),
            mimeType,
        },
    };

    const [result] = await client.processDocument(request);
    const { document } = result;

    if (!document) {
        throw new Error('Document AI returned an empty document.');
    }

    return normaliseResponse(document);
}

// ---------------------------------------------------------------------------
// Normalise the Document AI response into a clean JSON shape
// ---------------------------------------------------------------------------

function normaliseResponse(document) {
    const fullText = document.text || '';

    const pages = (document.pages || []).map((page, idx) => {
        const dim = page.dimension || {};
        const pageWidth = dim.width || 0;
        const pageHeight = dim.height || 0;

        // Prefer lines → fall back to blocks → fall back to paragraphs
        const lineSource = page.lines || page.blocks || page.paragraphs || [];

        const lines = lineSource.map((segment) => {
            const layout = segment.layout || {};
            const text = extractTextFromLayout(layout, fullText);
            const confidence = layout.confidence != null ? layout.confidence : null;
            const bbox = normalisedVerticesToAbsolute(
                layout.boundingPoly,
                pageWidth,
                pageHeight
            );
            return { text, confidence, bbox };
        });

        return {
            pageNumber: idx + 1,
            width: pageWidth,
            height: pageHeight,
            lines,
        };
    });

    return { text: fullText, pages };
}

/**
 * Extract the text substring that a layout's textAnchor points to.
 */
function extractTextFromLayout(layout, fullText) {
    if (!layout.textAnchor || !layout.textAnchor.textSegments) return '';
    return layout.textAnchor.textSegments
        .map((seg) => {
            const start = parseInt(seg.startIndex || '0', 10);
            const end = parseInt(seg.endIndex || '0', 10);
            return fullText.slice(start, end);
        })
        .join('')
        .trim();
}

/**
 * Convert normalised bounding-poly vertices (0–1) to absolute pixel coords.
 * Returns { x1,y1, x2,y2, x3,y3, x4,y4 } (4 corners, clockwise from TL).
 * If no vertices are available returns null.
 */
function normalisedVerticesToAbsolute(boundingPoly, pageWidth, pageHeight) {
    if (!boundingPoly) return null;

    // Document AI returns either `vertices` (already absolute) or
    // `normalizedVertices` (0–1). Prefer normalised if present.
    const verts = boundingPoly.normalizedVertices && boundingPoly.normalizedVertices.length
        ? boundingPoly.normalizedVertices.map((v) => ({
              x: (v.x || 0) * pageWidth,
              y: (v.y || 0) * pageHeight,
          }))
        : (boundingPoly.vertices || []).map((v) => ({
              x: v.x || 0,
              y: v.y || 0,
          }));

    if (verts.length < 4) return null;

    return {
        x1: Math.round(verts[0].x), y1: Math.round(verts[0].y),
        x2: Math.round(verts[1].x), y2: Math.round(verts[1].y),
        x3: Math.round(verts[2].x), y3: Math.round(verts[2].y),
        x4: Math.round(verts[3].x), y4: Math.round(verts[3].y),
    };
}

// ---------------------------------------------------------------------------
// Exports
// ---------------------------------------------------------------------------

module.exports = {
    processDocumentAI,
    SUPPORTED_MIME_TYPES,
    MAX_FILE_SIZE,
};
