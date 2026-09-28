const express = require('express');
const { register, login } = require('../controllers/authController');
const { createRateLimiter } = require('../middleware/rateLimitMiddleware');
const router = express.Router();

const authRateLimit = createRateLimiter({
    windowMs: 15 * 60 * 1000,
    max: 30,
    message: 'Too many authentication attempts. Please try again later.'
});

router.post('/register', authRateLimit, register);
router.post('/login', authRateLimit, login);

module.exports = router;
