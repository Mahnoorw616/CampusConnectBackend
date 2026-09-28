const mongoose = require('mongoose');

const notificationSchema = new mongoose.Schema(
    {
        // The user who receives the notification
        recipient: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'User',
            required: true,
            index: true,
        },
        // The user who triggered the action (e.g. liked, commented)
        sender: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'User',
        },
        // Notification type
        type: {
            type: String,
            enum: ['COMMENT', 'LIKE', 'MARKETPLACE', 'SYSTEM'],
            default: 'SYSTEM',
        },
        // Text to display in the panel
        message: {
            type: String,
            required: true,
        },
        // Optional references to link directly to a post or listing
        post: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'Post',
        },
        marketplace: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'Marketplace',
        },
        // Read status
        isRead: {
            type: Boolean,
            default: false,
        },
    },
    {
        timestamps: true, // Automatically provides createdAt & updatedAt
    }
);

module.exports = mongoose.model('Notification', notificationSchema);