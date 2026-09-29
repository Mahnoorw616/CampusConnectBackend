const express = require('express');
const {
    initializeUpload,
    uploadChunk,
    completeUpload,
    getMedia,
    getMediaInfo
} = require('../controllers/mediaController');
const { protect } = require('../middleware/authMiddleware');
const { createRateLimiter } = require('../middleware/rateLimitMiddleware');

const router = express.Router();
const uploadRateLimit = createRateLimiter({
    windowMs: 60 * 1000,
    max: 120,
    message: 'Too many media upload requests. Please try again later.'
});

// Browser image/video elements cannot attach the application's Bearer token.
router.post('/uploads', protect, uploadRateLimit, initializeUpload);
router.put('/uploads/:uploadId/chunks/:chunkIndex', protect, uploadRateLimit, uploadChunk);
router.post('/uploads/:uploadId/complete', protect, uploadRateLimit, completeUpload);
router.get('/:id/info', getMediaInfo);
router.get('/:id', getMedia);

module.exports = router;