const mongoose = require('mongoose');

const commentReactionSchema = new mongoose.Schema({
    postId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Post',
        required: true,
        index: true
    },
    commentId: {
        type: mongoose.Schema.Types.ObjectId,
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

commentReactionSchema.index(
    { postId: 1, commentId: 1, userId: 1 },
    { unique: true }
);

module.exports = mongoose.model('CommentReaction', commentReactionSchema);