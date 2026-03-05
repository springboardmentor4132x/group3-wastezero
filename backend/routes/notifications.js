const express = require('express');
const router = express.Router();
const { protect } = require('../middleware/auth');
const ctrl = require('../controllers/notificationController');

// All routes require authentication
router.use(protect);

// GET    /api/notifications              — List notifications (paginated)
router.get('/', ctrl.listNotifications);

// GET    /api/notifications/unread-count — Get unread count
router.get('/unread-count', ctrl.getUnreadCount);

// PUT    /api/notifications/read-all     — Mark all as read
router.put('/read-all', ctrl.markAllAsRead);

// PUT    /api/notifications/:id/read     — Mark single as read
router.put('/:id/read', ctrl.markAsRead);

module.exports = router;
