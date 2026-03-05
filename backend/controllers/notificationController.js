const Notification = require('../models/Notification');
const { emitToUser } = require('../socket');

// ── Helper: standard error response ───────────────────────────────────────
const errorResponse = (res, status, message) =>
  res.status(status).json({ error: true, message });

// ── Create & emit notification (used internally by other controllers) ─────
async function createNotification({ user_id, type, title, message, ref_id, ref_model }) {
  const notif = await Notification.create({
    user_id,
    type,
    title,
    message,
    ref_id: ref_id || null,
    ref_model: ref_model || null,
  });

  // Emit instantly via Socket.IO
  emitToUser(user_id, 'notification:new', notif.toObject());

  return notif;
}

// ── GET   /api/notifications — list user's notifications ─────────────────
async function listNotifications(req, res) {
  try {
    const page = Math.max(1, parseInt(req.query.page) || 1);
    const limit = Math.min(50, Math.max(1, parseInt(req.query.limit) || 20));
    const skip = (page - 1) * limit;

    const filter = { user_id: req.user._id };
    if (req.query.unread === 'true') filter.isRead = false;

    const [notifications, total, unreadCount] = await Promise.all([
      Notification.find(filter)
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit)
        .lean(),
      Notification.countDocuments(filter),
      Notification.countDocuments({ user_id: req.user._id, isRead: false }),
    ]);

    res.json({ notifications, total, page, pages: Math.ceil(total / limit), unreadCount });
  } catch (err) {
    console.error('listNotifications error:', err);
    errorResponse(res, 500, 'Server error');
  }
}

// ── GET   /api/notifications/unread-count ────────────────────────────────
async function getUnreadCount(req, res) {
  try {
    const unreadCount = await Notification.countDocuments({
      user_id: req.user._id,
      isRead: false,
    });
    res.json({ unreadCount });
  } catch (err) {
    errorResponse(res, 500, 'Server error');
  }
}

// ── PUT   /api/notifications/:id/read ────────────────────────────────────
async function markAsRead(req, res) {
  try {
    const notif = await Notification.findOneAndUpdate(
      { _id: req.params.id, user_id: req.user._id },
      { isRead: true },
      { new: true },
    );
    if (!notif) return errorResponse(res, 404, 'Notification not found');
    res.json(notif);
  } catch (err) {
    errorResponse(res, 500, 'Server error');
  }
}

// ── PUT   /api/notifications/read-all ────────────────────────────────────
async function markAllAsRead(req, res) {
  try {
    await Notification.updateMany(
      { user_id: req.user._id, isRead: false },
      { isRead: true },
    );
    res.json({ message: 'All notifications marked as read' });
  } catch (err) {
    errorResponse(res, 500, 'Server error');
  }
}

module.exports = {
  createNotification,
  listNotifications,
  getUnreadCount,
  markAsRead,
  markAllAsRead,
};
