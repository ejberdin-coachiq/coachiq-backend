const sharp = require('sharp');

const ALLOWED_IMAGE_TYPES = ['jpeg', 'jpg', 'png', 'heic'];
const DATA_URI_REGEX = /^data:image\/([a-zA-Z]+);base64,/;
const DEFAULT_MAX_SIZE_MB = 2;

/**
 * Validates a base64-encoded image string.
 * Accepts raw base64 or data URI format.
 * Returns { valid, mediaType, base64Data, error }.
 */
function validateImage(base64String) {
    if (!base64String || typeof base64String !== 'string') {
        return { valid: false, error: 'Image data is required and must be a string.' };
    }

    // Extract media type and raw base64 from data URI if present
    let mediaType = null;
    let base64Data = base64String;

    const dataUriMatch = base64String.match(DATA_URI_REGEX);
    if (dataUriMatch) {
        mediaType = dataUriMatch[1].toLowerCase();
        base64Data = base64String.replace(DATA_URI_REGEX, '');
    }

    // Validate base64 encoding — must only contain valid base64 characters
    const base64Regex = /^[A-Za-z0-9+/]*={0,2}$/;
    // Remove any whitespace/newlines that may be present in formatted base64
    const cleanBase64 = base64Data.replace(/\s/g, '');
    if (!base64Regex.test(cleanBase64)) {
        return { valid: false, error: 'Invalid base64 encoding. String contains non-base64 characters.' };
    }

    if (cleanBase64.length === 0) {
        return { valid: false, error: 'Image data is empty after decoding.' };
    }

    // If media type was in the data URI, validate it
    if (mediaType) {
        if (!ALLOWED_IMAGE_TYPES.includes(mediaType)) {
            return {
                valid: false,
                error: `Unsupported image type "${mediaType}". Allowed types: ${ALLOWED_IMAGE_TYPES.join(', ')}.`
            };
        }
        return {
            valid: true,
            mediaType: mediaType === 'jpg' ? 'image/jpeg' : `image/${mediaType}`,
            base64Data: cleanBase64
        };
    }

    // No data URI prefix — try to detect type from the image magic bytes
    try {
        const buffer = Buffer.from(cleanBase64, 'base64');
        const detectedType = detectImageType(buffer);
        if (!detectedType) {
            return {
                valid: false,
                error: `Unable to detect image type. Allowed types: ${ALLOWED_IMAGE_TYPES.join(', ')}.`
            };
        }
        return {
            valid: true,
            mediaType: detectedType === 'jpg' ? 'image/jpeg' : `image/${detectedType}`,
            base64Data: cleanBase64
        };
    } catch (err) {
        return { valid: false, error: `Failed to decode image data: ${err.message}` };
    }
}

/**
 * Detects image type from buffer magic bytes.
 * Returns type string or null if unrecognized.
 */
function detectImageType(buffer) {
    if (buffer.length < 4) return null;

    // JPEG: FF D8 FF
    if (buffer[0] === 0xFF && buffer[1] === 0xD8 && buffer[2] === 0xFF) return 'jpeg';

    // PNG: 89 50 4E 47
    if (buffer[0] === 0x89 && buffer[1] === 0x50 && buffer[2] === 0x4E && buffer[3] === 0x47) return 'png';

    // HEIC/HEIF: check for 'ftyp' box at offset 4
    if (buffer.length >= 12) {
        const ftypStr = buffer.slice(4, 8).toString('ascii');
        if (ftypStr === 'ftyp') {
            const brand = buffer.slice(8, 12).toString('ascii');
            if (['heic', 'heix', 'hevc', 'mif1'].includes(brand)) return 'heic';
        }
    }

    return null;
}

/**
 * Normalizes image orientation using EXIF data and ensures the image
 * is right-side-up for accurate scorebook reading.
 * sharp.rotate() with no args auto-rotates based on EXIF orientation tag.
 * Returns { base64Data, mediaType, rotated }.
 */
async function normalizeOrientation(base64String) {
    const cleanBase64 = base64String.replace(DATA_URI_REGEX, '').replace(/\s/g, '');
    const buffer = Buffer.from(cleanBase64, 'base64');

    const metadata = await sharp(buffer).metadata();
    // EXIF orientation: 1 = normal, anything else means the image needs rotation
    const needsRotation = metadata.orientation && metadata.orientation !== 1;

    // Always run rotate() to apply EXIF orientation, then output as JPEG
    const outputBuffer = await sharp(buffer)
        .rotate() // auto-rotate based on EXIF
        .jpeg({ quality: 95 })
        .toBuffer();

    return {
        base64Data: outputBuffer.toString('base64'),
        mediaType: 'image/jpeg',
        rotated: needsRotation
    };
}

/**
 * Compresses a base64 image if it exceeds maxSizeMB.
 * Converts HEIC to JPEG. Maintains aspect ratio.
 * Returns { base64Data, mediaType, compressed, originalSizeMB, finalSizeMB }.
 */
async function compressImage(base64String, maxSizeMB = DEFAULT_MAX_SIZE_MB) {
    // Strip data URI prefix if present
    const cleanBase64 = base64String.replace(DATA_URI_REGEX, '').replace(/\s/g, '');
    const buffer = Buffer.from(cleanBase64, 'base64');
    const originalSizeMB = buffer.length / (1024 * 1024);

    // Detect if HEIC — always convert HEIC regardless of size
    const detectedType = detectImageType(buffer);
    const isHeic = detectedType === 'heic';
    const needsCompression = originalSizeMB > maxSizeMB;

    if (!needsCompression && !isHeic) {
        // Detect media type for passthrough
        const validation = validateImage(base64String);
        return {
            base64Data: cleanBase64,
            mediaType: validation.valid ? validation.mediaType : 'image/jpeg',
            compressed: false,
            originalSizeMB: parseFloat(originalSizeMB.toFixed(2)),
            finalSizeMB: parseFloat(originalSizeMB.toFixed(2))
        };
    }

    // Use sharp to process the image
    let pipeline = sharp(buffer);
    const metadata = await pipeline.metadata();

    // Calculate target dimensions if we need to reduce size significantly
    const targetSizeMB = Math.min(maxSizeMB, originalSizeMB);
    if (needsCompression && metadata.width && metadata.height) {
        // Scale factor based on area ratio (size roughly proportional to area)
        const sizeRatio = targetSizeMB / originalSizeMB;
        const scaleFactor = Math.sqrt(sizeRatio);
        const newWidth = Math.round(metadata.width * scaleFactor);

        pipeline = pipeline.resize(newWidth, null, { fit: 'inside', withoutEnlargement: true });
    }

    // Convert to JPEG for output (handles HEIC conversion too)
    let quality = 80;
    if (needsCompression) {
        // Lower quality for larger compression needs
        const compressionRatio = originalSizeMB / targetSizeMB;
        quality = Math.max(40, Math.round(80 / Math.sqrt(compressionRatio)));
    }

    let outputBuffer = await pipeline.jpeg({ quality, mozjpeg: true }).toBuffer();

    // If still over target, iteratively reduce quality
    let attempts = 0;
    while (outputBuffer.length / (1024 * 1024) > maxSizeMB && quality > 20 && attempts < 5) {
        quality -= 10;
        attempts++;
        outputBuffer = await sharp(buffer)
            .resize(
                metadata.width ? Math.round(metadata.width * Math.sqrt(targetSizeMB / originalSizeMB) * (1 - attempts * 0.1)) : undefined,
                null,
                { fit: 'inside', withoutEnlargement: true }
            )
            .jpeg({ quality, mozjpeg: true })
            .toBuffer();
    }

    const finalSizeMB = outputBuffer.length / (1024 * 1024);

    return {
        base64Data: outputBuffer.toString('base64'),
        mediaType: 'image/jpeg',
        compressed: true,
        originalSizeMB: parseFloat(originalSizeMB.toFixed(2)),
        finalSizeMB: parseFloat(finalSizeMB.toFixed(2))
    };
}

/**
 * Extracts a JSON object from Claude's text response.
 * Handles markdown code blocks, leading/trailing text, and nested objects.
 * Returns parsed object or throws descriptive error.
 */
function extractJSON(claudeResponseText) {
    if (!claudeResponseText || typeof claudeResponseText !== 'string') {
        throw new Error('Response text is empty or not a string.');
    }

    const text = claudeResponseText.trim();

    // Strategy 1: Try parsing the entire text as JSON directly
    try {
        return JSON.parse(text);
    } catch (_) {
        // Not pure JSON, continue with extraction strategies
    }

    // Strategy 2: Extract from markdown code block (```json ... ``` or ``` ... ```)
    const codeBlockMatch = text.match(/```(?:json)?\s*\n?([\s\S]*?)\n?\s*```/);
    if (codeBlockMatch) {
        try {
            return JSON.parse(codeBlockMatch[1].trim());
        } catch (_) {
            // Code block content wasn't valid JSON, continue
        }
    }

    // Strategy 3: Find the first { and last matching } in the text
    const firstBrace = text.indexOf('{');
    const lastBrace = text.lastIndexOf('}');
    if (firstBrace !== -1 && lastBrace > firstBrace) {
        const candidate = text.slice(firstBrace, lastBrace + 1);
        try {
            return JSON.parse(candidate);
        } catch (_) {
            // Braces found but content wasn't valid JSON
        }
    }

    // Strategy 4: Find the first [ and last matching ] (for array responses)
    const firstBracket = text.indexOf('[');
    const lastBracket = text.lastIndexOf(']');
    if (firstBracket !== -1 && lastBracket > firstBracket) {
        const candidate = text.slice(firstBracket, lastBracket + 1);
        try {
            return JSON.parse(candidate);
        } catch (_) {
            // Brackets found but content wasn't valid JSON
        }
    }

    // All strategies failed
    const preview = text.length > 200 ? text.slice(0, 200) + '...' : text;
    throw new Error(`Could not extract valid JSON from response. Preview: "${preview}"`);
}

/**
 * Server-side computation of team totals from player data.
 * Ensures teamTotals always has valid percentages even if Claude returns 0s.
 */
function computeTeamTotals(stats) {
    if (!stats || !stats.players || !Array.isArray(stats.players)) return stats;

    let totalFGMade = 0;
    let totalFGAttempted = 0;
    let totalFTMade = 0;
    let totalFTAttempted = 0;
    let totalPoints = 0;

    for (const player of stats.players) {
        totalFGMade += player.fieldGoalsMade || 0;
        totalFGAttempted += player.fieldGoalsAttempted || 0;
        totalFTMade += player.freeThrowsMade || 0;
        totalFTAttempted += player.freeThrowsAttempted || 0;
        totalPoints += player.points || 0;
    }

    // Use the finalScore from the header as authoritative if available
    const authoritative = stats.finalScore || totalPoints;

    stats.teamTotals = {
        totalPoints: authoritative,
        totalFieldGoalsMade: totalFGMade,
        totalFieldGoalsAttempted: totalFGAttempted,
        totalFreeThrowsMade: totalFTMade,
        totalFreeThrowsAttempted: totalFTAttempted,
        fieldGoalPercentage: totalFGAttempted > 0
            ? parseFloat((totalFGMade / totalFGAttempted).toFixed(3))
            : 0,
        freeThrowPercentage: totalFTAttempted > 0
            ? parseFloat((totalFTMade / totalFTAttempted).toFixed(3))
            : 0
    };

    return stats;
}

module.exports = { validateImage, compressImage, extractJSON, normalizeOrientation, computeTeamTotals };
