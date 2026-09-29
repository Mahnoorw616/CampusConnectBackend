const mongoose = require('mongoose');

const mediaUploadSchema = new mongoose.Schema({
    ownerId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: true,
        index: true
    },
    kind: {
        type: String,
        enum: ['post', 'marketplace'],
        required: true
    },
    filename: {
        type: String,
        required: true,
        maxlength: 255
    },
    contentType: {
        type: String,
        required: true,
        maxlength: 120
    },
    totalBytes: {
        type: Number,
        required: true,
        min: 1
    },
    totalChunks: {
        type: Number,
        required: true,
        min: 1
    },
    status: {
        type: String,
        enum: ['open', 'complete'],
        default: 'open',
        index: true
    },
    mediaId: {
        type: String,
        default: ''
    },
    createdAt: {
        type: Date,
        default: Date.now,
        expires: 60 * 60
    }
}, {
    versionKey: false,
    timestamps: { createdAt: true, updatedAt: true }
});

module.exports = mongoose.model('MediaUpload', mediaUploadSchema);