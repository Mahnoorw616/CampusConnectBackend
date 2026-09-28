const express = require('express');
const { protect } = require('../middleware/authMiddleware');
const { createRateLimiter } = require('../middleware/rateLimitMiddleware');
const {
  getPosts,
  getSavedPosts,
  toggleSavedPost,
  createPost,
  updatePost,
  deletePost,
  addComment,
  updateComment,
  deleteComment,
  toggleCommentReaction,
  addCommentReply,
  toggleReaction
} = require('../controllers/postController');

const router = express.Router();
const writeRateLimit = createRateLimiter({
  windowMs: 60 * 1000,
  max: 60,
  message: 'Too many discussion actions. Please try again later.'
});

router.get('/', protect, getPosts);
router.get('/saved', protect, getSavedPosts);
router.post('/', protect, writeRateLimit, createPost);
router.put('/:id', protect, writeRateLimit, updatePost);
router.delete('/:id', protect, writeRateLimit, deletePost);

router.post('/:id/react', protect, writeRateLimit, toggleReaction);
router.post('/:id/save', protect, writeRateLimit, toggleSavedPost);

router.post('/:id/comment', protect, writeRateLimit, addComment);
router.put('/:id/comments/:commentId', protect, writeRateLimit, updateComment);
router.delete('/:id/comments/:commentId', protect, writeRateLimit, deleteComment);
router.post('/:id/comments/:commentId/react', protect, writeRateLimit, toggleCommentReaction);
router.post('/:id/comments/:commentId/reply', protect, writeRateLimit, addCommentReply);

module.exports = router;