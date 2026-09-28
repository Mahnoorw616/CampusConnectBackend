require('dotenv').config();

const mongoose = require('mongoose');
const app = require('./app');
const connectDatabase = require('./config/db');

let connectionPromise = null;

const ensureDatabaseConnection = async () => {
    if (mongoose.connection.readyState === 1) {
        return;
    }

    if (!connectionPromise) {
        connectionPromise = connectDatabase().catch((error) => {
            connectionPromise = null;
            throw error;
        });
    }

    await connectionPromise;
};

const handler = async (req, res) => {
    try {
        await ensureDatabaseConnection();
        return app(req, res);
    } catch (error) {
        console.error('Database connection failed:', error);

        return res.status(500).json({
            success: false,
            message: 'Database connection failed',
        });
    }
};

module.exports = handler;