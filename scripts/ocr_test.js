#!/usr/bin/env node
'use strict';

/**
 * Quick smoke-test for the Document AI OCR service.
 *
 * Usage:
 *   node scripts/ocr_test.js path/to/sample.jpg
 *   npm run ocr:test path/to/sample.jpg
 */

const fs = require('fs');
const path = require('path');
const { processDocumentAI, SUPPORTED_MIME_TYPES } = require('../services/documentai');

const MIME_BY_EXT = {
    '.jpg': 'image/jpeg',
    '.jpeg': 'image/jpeg',
    '.png': 'image/png',
    '.pdf': 'application/pdf',
};

async function main() {
    const filePath = process.argv[2];
    if (!filePath) {
        console.error('Usage: node scripts/ocr_test.js <path-to-file>');
        process.exit(1);
    }

    const resolved = path.resolve(filePath);
    if (!fs.existsSync(resolved)) {
        console.error(`File not found: ${resolved}`);
        process.exit(1);
    }

    const ext = path.extname(resolved).toLowerCase();
    const mimeType = MIME_BY_EXT[ext];
    if (!mimeType) {
        console.error(`Unknown extension ${ext}. Supported: ${Object.keys(MIME_BY_EXT).join(', ')}`);
        process.exit(1);
    }

    console.log(`\nFile:      ${resolved}`);
    console.log(`MIME type: ${mimeType}`);
    console.log(`Size:      ${(fs.statSync(resolved).size / 1024).toFixed(1)} KB\n`);

    const buffer = fs.readFileSync(resolved);

    console.log('Calling Document AI...\n');
    const start = Date.now();
    const result = await processDocumentAI(buffer, mimeType);
    const elapsed = ((Date.now() - start) / 1000).toFixed(2);

    console.log(`Done in ${elapsed}s`);
    console.log(`Extracted text length: ${result.text.length} chars`);
    console.log(`Pages: ${result.pages.length}`);

    for (const page of result.pages) {
        console.log(`  Page ${page.pageNumber}: ${page.width}x${page.height}, ${page.lines.length} lines`);
    }

    console.log('\n--- First 300 chars of extracted text ---');
    console.log(result.text.slice(0, 300));
    console.log('--- end ---\n');
}

main().catch((err) => {
    console.error('OCR test failed:', err.message);
    process.exit(1);
});
