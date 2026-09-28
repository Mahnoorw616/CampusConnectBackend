const requestBuckets = new Map();

const createRateLimiter = ({
    windowMs = 60 * 1000,
    max = 120,
    message = 'Too many requests. Please try again later.'
} = {}) => (req, res, next) => {
    const now = Date.now();
    for (const [bucketKey, bucket] of requestBuckets) {
        if (now >= bucket.resetAt) requestBuckets.delete(bucketKey);
    }

    const key = `${req.ip}:${req.baseUrl}`;
    const current = requestBuckets.get(key);

    if (!current || now >= current.resetAt) {
        requestBuckets.set(key, { count: 1, resetAt: now + windowMs });
        return next();
    }

    current.count += 1;
    if (current.count > max) {
        res.set('Retry-After', String(Math.max(1, Math.ceil((current.resetAt - now) / 1000))));
        return res.status(429).json({ success: false, message });
    }

    return next();
};

module.exports = { createRateLimiter };