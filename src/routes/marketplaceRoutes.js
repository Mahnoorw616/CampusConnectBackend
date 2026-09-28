const express = require('express');
const { protect } = require('../middleware/authMiddleware');
const { createRateLimiter } = require('../middleware/rateLimitMiddleware');
const {
    getListings,
    createListing,
    deleteListing
} = require('../controllers/marketplaceController');

const router = express.Router();
const writeRateLimit = createRateLimiter({
    windowMs: 60 * 1000,
    max: 30,
    message: 'Too many marketplace actions. Please try again later.'
});

router.get('/', protect, getListings);
router.post('/', protect, writeRateLimit, createListing);
router.delete('/:id', protect, writeRateLimit, deleteListing);

module.exports = router;