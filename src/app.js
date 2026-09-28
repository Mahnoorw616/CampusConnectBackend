const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const authRoutes = require('./routes/authRoutes');
const postRoutes = require('./routes/postRoutes');
const marketplaceRoutes = require('./routes/marketplaceRoutes');
const notificationRoutes = require('./routes/notificationRoutes');
const mediaRoutes = require('./routes/mediaRoutes');
const { notFound, errorHandler } = require('./middleware/errorMiddleware');

const app = express();

const configuredOrigins = process.env.CLIENT_ORIGIN
    ? process.env.CLIENT_ORIGIN
        .split(',')
        .map((origin) => origin.trim().replace(/\/+$/, ''))
        .filter(Boolean)
    : [];

const defaultOrigins = [
    'http://localhost:3000',
    'http://127.0.0.1:3000',
    'http://localhost:5173',
    'http://127.0.0.1:5173'
];

const allowedOrigins = new Set([...defaultOrigins, ...configuredOrigins]);

const isPrivateDevelopmentOrigin = (origin) => {
    if (process.env.NODE_ENV === 'production') return false;

    try {
        const hostname = new URL(origin).hostname;
        return (
            hostname === 'localhost' ||
            hostname === '127.0.0.1' ||
            hostname === '::1' ||
            hostname.startsWith('10.') ||
            hostname.startsWith('192.168.') ||
            /^172\.(1[6-9]|2\d|3[0-1])\./.test(hostname)
        );
    } catch (_error) {
        return false;
    }
};

app.use(helmet());

app.use(
    cors({
        origin: (origin, callback) => {
            // Requests without an Origin header include curl, health checks, and
            // same-origin server requests. They should remain allowed.
            if (!origin || allowedOrigins.has(origin) || isPrivateDevelopmentOrigin(origin)) {
                return callback(null, true);
            }

            return callback(new Error(`CORS origin is not allowed: ${origin}`));
        },
        credentials: true
    })
);

// Base64 media increases the request size by roughly one third. The frontend
// limits uploaded post media to 15 MB, so leave enough room for the encoded
// payload and JSON envelope.
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true, limit: '1mb' }));

app.get('/api/health', (_req, res) => {
    res.status(200).json({
        success: true,
        message: 'CampusConnect API is running',
        environment: process.env.NODE_ENV || 'development'
    });
});
app.use('/api/auth', authRoutes);
app.use('/api/posts', postRoutes);
app.use('/api/marketplace', marketplaceRoutes);
app.use('/api/notifications', notificationRoutes);
app.use('/api/media', mediaRoutes);

app.use(notFound);
app.use(errorHandler);

module.exports = app;