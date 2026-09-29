const mongoose = require('mongoose');
const Notification = require('../models/Notifications');

// @desc    Get all notifications for logged-in user
// @route   GET /api/notifications
// @access  Private
exports.getUserNotifications = async (req, res) => {
    try {
        const userId = req.user._id || req.user.id;

        const notifications = await Notification.find({ recipient: userId })
            .populate('sender', 'name avatar')
            .populate('post', '_id')
            .populate('marketplace', '_id')
            .sort({ createdAt: -1 })
            .limit(30)
            .lean();

        const unreadCount = await Notification.countDocuments({
            recipient: userId,
            isRead: false,
        });

        return res.status(200).json({
            success: true,
            unreadCount,
            notifications,
        });
    } catch (error) {
        console.error('Could not load notifications:', error);
        return res.status(500).json({
            success: false,
            message: 'Could not load notifications'
        });
    }
};

// @desc    Mark a single notification as read
// @route   PATCH /api/notifications/:id/read
// @access  Private
exports.markAsRead = async (req, res) => {
    try {
        const userId = req.user._id || req.user.id;
        const { id } = req.params;
        if (!mongoose.isValidObjectId(id)) {
            return res.status(400).json({ success: false, message: 'Invalid notification ID' });
        }

        const notification = await Notification.findOneAndUpdate(
            { _id: id, recipient: userId },
            { isRead: true },
            { new: true }
        );

        if (!notification) {
            return res.status(404).json({ success: false, message: 'Notification not found' });
        }

        return res.status(200).json({ success: true, notification });
    } catch (error) {
        console.error('Could not mark notification as read:', error);
        return res.status(500).json({
            success: false,
            message: 'Could not mark notification as read'
        });
    }
};

// @desc    Mark all user's notifications as read
// @route   PATCH /api/notifications/read-all
// @access  Private
exports.markAllAsRead = async (req, res) => {
    try {
        const userId = req.user._id || req.user.id;

        await Notification.updateMany(
            { recipient: userId, isRead: false },
            { $set: { isRead: true } }
        );

        return res.status(200).json({ success: true, message: 'All marked as read' });
    } catch (error) {
        console.error('Could not mark all notifications as read:', error);
        return res.status(500).json({
            success: false,
            message: 'Could not mark all notifications as read'
        });
    }
};