const mongoose = require('mongoose');

const postReactionSchema = new mongoose.Schema({
    postId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Post',
        required: true,
        index: true
    },
    userId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: true,
        index: true
    },
    reactionType: {
        type: String,
        required: true,
        enum: ['Relatable', 'Helpful', 'Support', 'Vibe']
    }
}, { timestamps: true, versionKey: false });

postReactionSchema.index({ postId: 1, userId: 1 }, { unique: true });

module.exports = mongoose.model('PostReaction', postReactionSchema);