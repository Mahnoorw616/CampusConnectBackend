const mongoose = require('mongoose');

const mediaUploadChunkSchema = new mongoose.Schema({
    uploadId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'MediaUpload',
        required: true,
        index: true
    },
    index: {
        type: Number,
        required: true,
        min: 0
    },
    data: {
        type: Buffer,
        required: true
    },
    createdAt: {
        type: Date,
        default: Date.now,
        expires: 60 * 60
    }
}, {
    versionKey: false
});

mediaUploadChunkSchema.index({ uploadId: 1, index: 1 }, { unique: true });

module.exports = mongoose.model('MediaUploadChunk', mediaUploadChunkSchema);