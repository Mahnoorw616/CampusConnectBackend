const mongoose = require('mongoose');
const PostReaction = require('../models/PostReaction');
const CommentReaction = require('../models/CommentReaction');

const EMPTY_REACTIONS = {
    Relatable: 0,
    Helpful: 0,
    Support: 0,
    Vibe: 0
};

const normalizeReactions = (value) => ({
    ...EMPTY_REACTIONS,
    ...(value && typeof value === 'object'
        ? {
            Relatable: Number(value.Relatable) || 0,
            Helpful: Number(value.Helpful) || 0,
            Support: Number(value.Support) || 0,
            Vibe: Number(value.Vibe) || 0
        }
        : {})
});

const migrateLegacyData = async () => {
    await PostReaction.init();
    await CommentReaction.init();

    const postsCollection = mongoose.connection.collection('posts');
    const posts = await postsCollection.find({
        $or: [
            { upvotesCount: { $exists: true } },
            { upvotedBy: { $exists: true } },
            { userReactions: { $exists: true } },
            { 'comments.userReactions': { $exists: true } },
            { 'comments.replies': { $exists: false } },
            { 'comments.reactions': { $exists: false } }
        ]
    }).toArray();

    let migratedPosts = 0;
    let migratedReactionRecords = 0;

    for (const post of posts) {
        const upvotedBy = Array.isArray(post.upvotedBy) ? post.upvotedBy : [];
        const embeddedPostReactions = Array.isArray(post.userReactions)
            ? post.userReactions
            : [];
        const postReactions = normalizeReactions(post.reactions);
        const hasReactionCounts = Boolean(post.reactions);

        if (!hasReactionCounts) {
            postReactions.Helpful = Math.max(
                Number(post.upvotesCount) || 0,
                upvotedBy.length
            );
        }

        const reactionKeys = new Set();
        const postReactionRecords = [
            ...embeddedPostReactions,
            ...upvotedBy.map((userId) => ({ userId, reactionType: 'Helpful' }))
        ];

        for (const reaction of postReactionRecords) {
            if (
                !reaction ||
                !reaction.userId ||
                !['Relatable', 'Helpful', 'Support', 'Vibe'].includes(reaction.reactionType)
            ) {
                continue;
            }

            const key = String(reaction.userId);
            if (reactionKeys.has(key)) continue;
            reactionKeys.add(key);

            const result = await PostReaction.updateOne(
                { postId: post._id, userId: reaction.userId },
                {
                    $setOnInsert: {
                        postId: post._id,
                        userId: reaction.userId,
                        reactionType: reaction.reactionType
                    }
                },
                { upsert: true }
            );
            migratedReactionRecords += result.upsertedCount || 0;
        }

        const comments = Array.isArray(post.comments)
            ? post.comments.map((comment) => ({
                ...comment,
                reactions: normalizeReactions(comment.reactions),
                replies: Array.isArray(comment.replies) ? comment.replies : []
            }))
            : [];

        for (const comment of comments) {
            const embeddedCommentReactions = Array.isArray(comment.userReactions)
                ? comment.userReactions
                : [];
            const commentReactionKeys = new Set();

            for (const reaction of embeddedCommentReactions) {
                if (
                    !reaction ||
                    !reaction.userId ||
                    !['Relatable', 'Helpful', 'Support', 'Vibe'].includes(reaction.reactionType)
                ) {
                    continue;
                }

                const key = String(reaction.userId);
                if (commentReactionKeys.has(key)) continue;
                commentReactionKeys.add(key);

                const result = await CommentReaction.updateOne(
                    {
                        postId: post._id,
                        commentId: comment._id,
                        userId: reaction.userId
                    },
                    {
                        $setOnInsert: {
                            postId: post._id,
                            commentId: comment._id,
                            userId: reaction.userId,
                            reactionType: reaction.reactionType
                        }
                    },
                    { upsert: true }
                );
                migratedReactionRecords += result.upsertedCount || 0;
            }

            delete comment.userReactions;
        }

        await postsCollection.updateOne(
            { _id: post._id },
            {
                $set: {
                    reactions: postReactions,
                    comments
                },
                $unset: {
                    upvotesCount: '',
                    upvotedBy: '',
                    userReactions: ''
                }
            }
        );
        migratedPosts += 1;
    }

    if (migratedPosts > 0) {
        console.log(
            `Legacy data migration complete: ${migratedPosts} posts, ${migratedReactionRecords} reaction records`
        );
    }
};

module.exports = migrateLegacyData;