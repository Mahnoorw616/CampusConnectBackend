const mongoose = require('mongoose');
const { GridFSBucket, ObjectId } = require('mongodb');

const MAX_POST_MEDIA_BYTES = 15 * 1024 * 1024;
const MAX_MARKETPLACE_IMAGE_BYTES = 10 * 1024 * 1024;
const DATA_URL_PATTERN = /^data:([a-zA-Z0-9.+-]+);base64,([A-Za-z0-9+/=\r\n]+)$/;

let mediaBucket;

const getMediaBucket = () => {
    if (!mongoose.connection.db) {
        throw new Error('MongoDB is not connected');
    }

    if (!mediaBucket) {
        mediaBucket = new GridFSBucket(mongoose.connection.db, {
            bucketName: 'campusconnectMedia'
        });
    }

    return mediaBucket;
};

const parseDataUrl = (value) => {
    const match = DATA_URL_PATTERN.exec(String(value));
    if (!match) return null;

    const contentType = match[1].toLowerCase();
    const base64 = match[2].replace(/\s/g, '');
    const buffer = Buffer.from(base64, 'base64');

    if (!buffer.length) {
        const error = new Error('The uploaded media is empty or invalid');
        error.statusCode = 400;
        throw error;
    }

    return { contentType, buffer };
};

const uploadBuffer = ({ buffer, contentType, filename }) => {
    const bucket = getMediaBucket();

    return new Promise((resolve, reject) => {
        const stream = bucket.openUploadStream(filename, {
            contentType,
            metadata: { source: 'campusconnect' }
        });

        stream.once('error', reject);
        stream.once('finish', () => resolve(stream.id.toString()));
        stream.end(buffer);
    });
};

const deleteMediaById = async (id) => {
    if (!id || !ObjectId.isValid(id)) return;
    try {
        await getMediaBucket().delete(new ObjectId(id));
    } catch (error) {
        if (error.code !== 'ENOENT') throw error;
    }
};

const normalizeMediaValue = async ({ value, kind, requestOrigin }) => {
    const normalized = value ? String(value).trim() : '';
    if (!normalized) return '';

    if (/^https?:\/\//i.test(normalized)) return normalized;

    const match = parseDataUrl(normalized);
    if (!match) {
        const error = new Error('Media must be a valid HTTP(S) URL or Base64 data URL');
        error.statusCode = 400;
        throw error;
    }

    const allowed = kind === 'marketplace'
        ? match.contentType.startsWith('image/')
        : match.contentType.startsWith('image/') || match.contentType.startsWith('video/');

    if (!allowed) {
        const error = new Error(
            kind === 'marketplace'
                ? 'Marketplace coverImage must be an image'
                : 'Post mediaUrl must be an image or video'
        );
        error.statusCode = 400;
        throw error;
    }

    const maxBytes = kind === 'marketplace'
        ? MAX_MARKETPLACE_IMAGE_BYTES
        : MAX_POST_MEDIA_BYTES;

    if (match.buffer.length > maxBytes) {
        const error = new Error(
            `${kind === 'marketplace' ? 'Marketplace image' : 'Post media'} cannot exceed ${Math.floor(maxBytes / (1024 * 1024))} MB`
        );
        error.statusCode = 413;
        throw error;
    }

    const extension = match.contentType.split('/')[1].replace(/[^a-z0-9]/gi, '') || 'bin';
    const fileId = await uploadBuffer({
        buffer: match.buffer,
        contentType: match.contentType,
        filename: `${kind}-${Date.now()}.${extension}`
    });

    return `${requestOrigin.replace(/\/+$/, '')}/api/media/${fileId}`;
};

module.exports = {
    MAX_POST_MEDIA_BYTES,
    MAX_MARKETPLACE_IMAGE_BYTES,
    getMediaBucket,
    normalizeMediaValue,
    deleteMediaById
};