const mongoose = require('mongoose');
const { ObjectId } = require('mongodb');
const MediaUpload = require('../models/MediaUpload');
const MediaUploadChunk = require('../models/MediaUploadChunk');
const {
    MEDIA_CHUNK_BYTES,
    MAX_POST_MEDIA_BYTES,
    MAX_MARKETPLACE_IMAGE_BYTES,
    getMediaBucket,
    publicMediaUrl,
    uploadChunksToGridFS,
    deleteMediaById
} = require('../config/mediaStore');

const getRequestOrigin = (req) =>
    (process.env.NODE_ENV !== 'production'
        ? `${req.protocol}://${req.get('host')}`
        : (process.env.PUBLIC_API_ORIGIN || `${req.protocol}://${req.get('host')}`))
        .replace(/\/+$/, '');

const getMediaLimit = (kind) =>
    kind === 'marketplace'
        ? MAX_MARKETPLACE_IMAGE_BYTES
        : MAX_POST_MEDIA_BYTES;

const isAllowedContentType = (kind, contentType) =>
    kind === 'marketplace'
        ? contentType.startsWith('image/')
        : contentType.startsWith('image/') || contentType.startsWith('video/');

const httpError = (statusCode, message) =>
    Object.assign(new Error(message), { statusCode });

const parsePositiveInteger = (value) => {
    const parsed = Number(value);
    return Number.isSafeInteger(parsed) && parsed > 0 ? parsed : 0;
};

const parseChunkIndex = (value) => {
    const parsed = Number(value);
    return Number.isSafeInteger(parsed) && parsed >= 0 ? parsed : -1;
};

const toNodeBuffer = (value) => {
    if (Buffer.isBuffer(value)) return value;
    if (value && Buffer.isBuffer(value.buffer)) return value.buffer;
    if (value && Array.isArray(value.buffer)) return Buffer.from(value.buffer);
    if (value && typeof value.value === 'function') {
        const binaryValue = value.value();
        if (Buffer.isBuffer(binaryValue)) return binaryValue;
        if (binaryValue instanceof Uint8Array) return Buffer.from(binaryValue);
    }
    if (value && value.type === 'Buffer' && Array.isArray(value.data)) {
        return Buffer.from(value.data);
    }
    throw httpError(500, 'Stored media chunk is invalid');
};

const readRawRequest = (req, maxBytes) => {
    const body = req.body;
    if (Buffer.isBuffer(body)) return Promise.resolve(body);
    if (body instanceof Uint8Array) return Promise.resolve(Buffer.from(body));
    if (req.readableEnded) {
        return Promise.reject(httpError(400, 'Media chunk body was not received'));
    }

    return new Promise((resolve, reject) => {
        const pieces = [];
        let total = 0;
        let settled = false;

        const fail = (error) => {
            if (settled) return;
            settled = true;
            reject(error);
        };

        req.on('data', (piece) => {
            if (settled) return;
            total += piece.length;
            if (total > maxBytes) {
                const error = httpError(413, 'Media chunk is too large');
                req.destroy();
                fail(error);
                return;
            }
            pieces.push(piece);
        });
        req.once('error', fail);
        req.once('end', () => {
            if (!settled) {
                settled = true;
                resolve(Buffer.concat(pieces));
            }
        });
    });
};

const findOwnedUpload = async (req, uploadId) => {
    if (!mongoose.isValidObjectId(uploadId)) {
        throw httpError(400, 'Invalid upload ID');
    }

    const upload = await MediaUpload.findOne({
        _id: uploadId,
        ownerId: req.user._id
    });

    if (!upload) throw httpError(404, 'Media upload not found');
    return upload;
};

const initializeUpload = async (req, res, next) => {
    try {
        const kind = String(req.body.kind || '').trim().toLowerCase();
        const filename = String(req.body.filename || 'upload').trim();
        const contentType = String(req.body.contentType || '').trim().toLowerCase();
        const totalBytes = parsePositiveInteger(req.body.totalBytes);
        const totalChunks = parsePositiveInteger(req.body.totalChunks);

        if (!['post', 'marketplace'].includes(kind)) {
            return res.status(400).json({
                success: false,
                message: 'kind must be either post or marketplace'
            });
        }
        if (!filename || filename.length > 255) {
            return res.status(400).json({
                success: false,
                message: 'A valid media filename is required'
            });
        }
        if (!contentType || !isAllowedContentType(kind, contentType)) {
            return res.status(400).json({
                success: false,
                message: kind === 'marketplace'
                    ? 'Marketplace media must be an image'
                    : 'Discussion media must be an image or video'
            });
        }
        if (!totalBytes || totalBytes > getMediaLimit(kind)) {
            return res.status(413).json({
                success: false,
                message: `${kind === 'marketplace' ? 'Marketplace image' : 'Post media'} cannot exceed ${Math.floor(getMediaLimit(kind) / (1024 * 1024))} MB`
            });
        }

        const expectedChunks = Math.ceil(totalBytes / MEDIA_CHUNK_BYTES);
        if (!totalChunks || totalChunks !== expectedChunks) {
            return res.status(400).json({
                success: false,
                message: 'Invalid media chunk count'
            });
        }

        const upload = await MediaUpload.create({
            ownerId: req.user._id,
            kind,
            filename,
            contentType,
            totalBytes,
            totalChunks
        });

        return res.status(201).json({
            success: true,
            uploadId: upload._id.toString(),
            chunkSize: MEDIA_CHUNK_BYTES,
            totalChunks
        });
    } catch (error) {
        return next(error);
    }
};

const uploadChunk = async (req, res, next) => {
    try {
        const upload = await findOwnedUpload(req, req.params.uploadId);
        if (upload.status !== 'open') {
            return res.status(409).json({
                success: false,
                message: 'This media upload has already been completed'
            });
        }

        const chunkIndex = parseChunkIndex(req.params.chunkIndex);
        if (chunkIndex < 0 || chunkIndex >= upload.totalChunks) {
            return res.status(400).json({
                success: false,
                message: 'Invalid media chunk index'
            });
        }

        const existing = await MediaUploadChunk.findOne({
            uploadId: upload._id,
            index: chunkIndex
        }).select('_id data');

        const buffer = await readRawRequest(req, MEDIA_CHUNK_BYTES);
        if (!buffer.length) {
            return res.status(400).json({
                success: false,
                message: 'Media chunk is empty'
            });
        }

        // Retrying the same chunk is safe and idempotent.
        if (existing) {
            if (toNodeBuffer(existing.data).length !== buffer.length) {
                return res.status(409).json({
                    success: false,
                    message: 'A different chunk already exists at this index'
                });
            }
            return res.json({
                success: true,
                chunkIndex,
                alreadyUploaded: true
            });
        }

        await MediaUploadChunk.create({
            uploadId: upload._id,
            index: chunkIndex,
            data: buffer
        });

        return res.status(201).json({
            success: true,
            chunkIndex,
            alreadyUploaded: false
        });
    } catch (error) {
        return next(error);
    }
};

const completeUpload = async (req, res, next) => {
    let createdMediaId = '';

    try {
        const upload = await findOwnedUpload(req, req.params.uploadId);
        if (upload.status === 'complete' && upload.mediaId) {
            return res.json({
                success: true,
                mediaId: upload.mediaId,
                mediaUrl: publicMediaUrl({
                    requestOrigin: getRequestOrigin(req),
                    mediaId: upload.mediaId
                }),
                mediaType: upload.contentType.startsWith('video/') ? 'video' : 'image'
            });
        }

        const chunks = await MediaUploadChunk.find({
            uploadId: upload._id
        }).sort({ index: 1 }).lean();

        if (
            chunks.length !== upload.totalChunks ||
            chunks.some((chunk, index) => chunk.index !== index)
        ) {
            return res.status(409).json({
                success: false,
                message: 'Media upload is incomplete. Please upload all chunks.'
            });
        }

        const chunkBuffers = chunks.map((chunk) => toNodeBuffer(chunk.data));
        const totalBytes = chunkBuffers.reduce((total, chunk) => total + chunk.length, 0);
        if (totalBytes !== upload.totalBytes) {
            return res.status(409).json({
                success: false,
                message: 'Media upload size does not match the original file'
            });
        }

        createdMediaId = await uploadChunksToGridFS({
            chunks: chunkBuffers,
            contentType: upload.contentType,
            filename: `${upload.kind}-${Date.now()}-${upload.filename}`,
            metadata: {
                ownerId: upload.ownerId.toString(),
                kind: upload.kind
            }
        });

        await MediaUpload.findByIdAndUpdate(upload._id, {
            status: 'complete',
            mediaId: createdMediaId
        });
        await MediaUploadChunk.deleteMany({ uploadId: upload._id });

        return res.status(201).json({
            success: true,
            mediaId: createdMediaId,
            mediaUrl: publicMediaUrl({
                requestOrigin: getRequestOrigin(req),
                mediaId: createdMediaId
            }),
            mediaType: upload.contentType.startsWith('video/') ? 'video' : 'image'
        });
    } catch (error) {
        if (createdMediaId) {
            await deleteMediaById(createdMediaId).catch((cleanupError) => {
                console.error('Could not clean up failed media finalization:', cleanupError);
            });
        }
        return next(error);
    }
};

const getMedia = async (req, res, next) => {
    try {
        if (!ObjectId.isValid(req.params.id)) {
            return res.status(400).json({ success: false, message: 'Invalid media ID' });
        }

        const id = new ObjectId(req.params.id);
        const files = await getMediaBucket().find({ _id: id }).toArray();
        const file = files[0];

        if (!file) {
            return res.status(404).json({ success: false, message: 'Media not found' });
        }

        const totalLength = Number(file.length);
        let start = 0;
        let end = totalLength - 1;
        let statusCode = 200;

        const rangeHeader = String(req.headers.range || '');
        if (rangeHeader) {
            const match = /^bytes=(\d*)-(\d*)$/i.exec(rangeHeader);
            if (!match) {
                res.set('Content-Range', `bytes */${totalLength}`);
                return res.status(416).end();
            }

            if (match[1]) start = Number(match[1]);
            if (match[2]) end = Number(match[2]);
            if (!match[1]) {
                const suffixLength = Number(match[2]);
                start = Math.max(0, totalLength - suffixLength);
            }
            if (!match[2]) end = totalLength - 1;

            if (
                !Number.isSafeInteger(start) ||
                !Number.isSafeInteger(end) ||
                start < 0 ||
                start >= totalLength ||
                end < start
            ) {
                res.set('Content-Range', `bytes */${totalLength}`);
                return res.status(416).end();
            }

            end = Math.min(end, totalLength - 1);
            statusCode = 206;
        }

        const contentLength = end - start + 1;
        res.status(statusCode);
        res.set('Content-Type', file.contentType || 'application/octet-stream');
        res.set('Content-Length', String(contentLength));
        res.set('Accept-Ranges', 'bytes');
        res.set('Cache-Control', 'public, max-age=31536000, immutable');
        res.set('Cross-Origin-Resource-Policy', 'cross-origin');
        if (statusCode === 206) {
            res.set('Content-Range', `bytes ${start}-${end}/${totalLength}`);
        }

        return getMediaBucket()
            .openDownloadStream(id, { start, end: end + 1 })
            .pipe(res);
    } catch (error) {
        return next(error);
    }
};

const getMediaInfo = async (req, res, next) => {
    try {
        if (!ObjectId.isValid(req.params.id)) {
            return res.status(400).json({ success: false, message: 'Invalid media ID' });
        }

        const files = await getMediaBucket()
            .find({ _id: new ObjectId(req.params.id) })
            .toArray();
        const file = files[0];

        if (!file) {
            return res.status(404).json({ success: false, message: 'Media not found' });
        }

        return res.json({
            success: true,
            contentType: file.contentType || 'application/octet-stream',
            length: file.length
        });
    } catch (error) {
        return next(error);
    }
};

module.exports = {
    initializeUpload,
    uploadChunk,
    completeUpload,
    getMedia,
    getMediaInfo
};