const express = require('express');
const router = express.Router();
const {
    getUserNotifications,
    markAsRead,
    markAllAsRead,
} = require('../controllers/notificationController');

// Using your existing auth middleware
const { protect } = require('../middleware/authMiddleware');
// NOTE: If your middleware function is named differently (e.g. verifyToken or authenticate), 
// replace `protect` with that name.

router.get('/', protect, getUserNotifications);
router.patch('/read-all', protect, markAllAsRead);
router.patch('/:id/read', protect, markAsRead);

module.exports = router;