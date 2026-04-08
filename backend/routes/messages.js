const express = require('express');
const router = express.Router();
const mongoose = require('mongoose');
const Message = require('../models/Message');
const User = require('../models/User');
const Pickup = require('../models/Pickup');
const SupportTicket = require('../models/SupportTicket');
const { protect } = require('../middleware/auth');
const { emitToUser, getOnlineUsers } = require('../socket');
const { createNotification } = require('../controllers/notificationController');
const { upload } = require('../middleware/upload');

const LOCK_WINDOW_MS = 24 * 60 * 60 * 1000;
const EDIT_DELETE_WINDOW_MS = 10 * 60 * 1000;

function idStr(id) {
  return id ? id.toString() : '';
}

function isPickupLocked(pickup) {
  if (!pickup || pickup.status !== 'Completed' || !pickup.completedAt) return false;
  return Date.now() - new Date(pickup.completedAt).getTime() >= LOCK_WINDOW_MS;
}

function isUserOnline(userId) {
  const sockets = getOnlineUsers().get(idStr(userId));
  return !!(sockets && sockets.size > 0);
}

function canModifyMessage(message, userId) {
  if (!message) return false;
  if (idStr(message.sender_id) !== idStr(userId)) return false;
  if (message.isDeleted) return false;
  const msgTs = new Date(message.timestamp).getTime();
  if (Number.isNaN(msgTs)) return false;
  return Date.now() - msgTs <= EDIT_DELETE_WINDOW_MS;
}

async function getAcceptedOrCompletedPickup(userId, volunteerId) {
  const accepted = await Pickup.findOne({
    user_id: userId,
    volunteer_id: volunteerId,
    status: 'Accepted',
  })
    .sort({ updatedAt: -1, createdAt: -1 })
    .lean();

  if (accepted) return accepted;

  return Pickup.findOne({
    user_id: userId,
    volunteer_id: volunteerId,
    status: 'Completed',
  })
    .sort({ completedAt: -1, updatedAt: -1, createdAt: -1 })
    .lean();
}

async function getPickupForPair(userId, volunteerId, pickupId) {
  if (pickupId && mongoose.Types.ObjectId.isValid(pickupId)) {
    const exact = await Pickup.findOne({
      _id: pickupId,
      user_id: userId,
      volunteer_id: volunteerId,
      status: { $in: ['Accepted', 'Completed'] },
    }).lean();
    if (exact) return exact;
  }

  return getAcceptedOrCompletedPickup(userId, volunteerId);
}

async function getArchivedPickupIdsForPair(myId, partnerId) {
  const before = new Date(Date.now() - LOCK_WINDOW_MS);
  const archivedPickups = await Pickup.find({
    $or: [
      { user_id: myId, volunteer_id: partnerId },
      { user_id: partnerId, volunteer_id: myId },
    ],
    status: 'Completed',
    completedAt: { $lte: before },
  })
    .select('_id')
    .lean();

  return new Set(archivedPickups.map((p) => idStr(p._id)));
}

async function getAllowedPartnerIds(user) {
  if (user.role === 'admin') return null;

  if (user.role === 'volunteer') {
    const [admins, linkedUsers] = await Promise.all([
      User.find({ role: 'admin', isSuspended: { $ne: true } }).select('_id').lean(),
      Pickup.find({
        volunteer_id: user._id,
        status: { $in: ['Accepted', 'Completed'] },
      }).select('user_id').lean(),
    ]);

    const ids = new Set(admins.map((a) => idStr(a._id)));
    linkedUsers.forEach((p) => ids.add(idStr(p.user_id)));
    return ids;
  }

  if (user.role === 'user') {
    const [admins, linkedVolunteers] = await Promise.all([
      User.find({ role: 'admin', isSuspended: { $ne: true } }).select('_id').lean(),
      Pickup.find({
        user_id: user._id,
        volunteer_id: { $ne: null },
        status: { $in: ['Accepted', 'Completed'] },
      }).select('volunteer_id').lean(),
    ]);

    const ids = new Set();
    admins.forEach((a) => ids.add(idStr(a._id)));
    linkedVolunteers.forEach((p) => ids.add(idStr(p.volunteer_id)));
    return ids;
  }

  return new Set();
}

async function resolvePairRules(sender, receiverId, pickupId = null) {
  const receiver = await User.findById(receiverId).select('name username role email avatar lastSeen isSuspended').lean();
  if (!receiver) return { ok: false, status: 404, message: 'Receiver not found' };
  if (receiver.isSuspended) return { ok: false, status: 403, message: 'Receiver account is suspended' };

  if (sender.role === 'admin') {
    return { ok: true, receiver, pickup: null, locked: false };
  }

  if (sender.role === 'volunteer') {
    if (receiver.role === 'admin') {
      return { ok: true, receiver, pickup: null, locked: false };
    }
    if (receiver.role !== 'user') {
      return { ok: false, status: 403, message: 'Volunteers can message admins and linked users only' };
    }

    const pickup = await getPickupForPair(receiver._id, sender._id, pickupId);
    if (!pickup) {
      return { ok: false, status: 403, message: 'Messaging allowed only for users with accepted pickups' };
    }
    const locked = isPickupLocked(pickup);
    return { ok: true, receiver, pickup, locked };
  }

  if (sender.role === 'user') {
    if (receiver.role === 'admin') {
      return { ok: true, receiver, pickup: null, locked: false };
    }

    if (receiver.role !== 'volunteer') {
      return { ok: false, status: 403, message: 'Users can message admins and volunteers who accepted their pickup' };
    }

    const pickup = await getPickupForPair(sender._id, receiver._id, pickupId);
    if (!pickup) {
      return { ok: false, status: 403, message: 'No accepted pickup found with this volunteer' };
    }
    const locked = isPickupLocked(pickup);
    return { ok: true, receiver, pickup, locked };
  }

  return { ok: false, status: 403, message: 'Unsupported role for messaging' };
}

async function getConversationLock(myId, partnerId) {
  const accepted = await Pickup.findOne({
    $or: [
      { user_id: myId, volunteer_id: partnerId },
      { user_id: partnerId, volunteer_id: myId },
    ],
    status: 'Accepted',
  })
    .sort({ updatedAt: -1, createdAt: -1 })
    .select('_id status completedAt user_id volunteer_id')
    .lean();

  if (accepted) {
    return {
      locked: false,
      pickup_id: accepted._id,
      lockAt: null,
      status: accepted.status,
      lockReason: null,
    };
  }

  const completed = await Pickup.findOne({
    $or: [
      { user_id: myId, volunteer_id: partnerId },
      { user_id: partnerId, volunteer_id: myId },
    ],
    status: 'Completed',
  })
    .sort({ completedAt: -1, updatedAt: -1, createdAt: -1 })
    .select('_id status completedAt user_id volunteer_id')
    .lean();

  if (!completed) {
    return {
      locked: false,
      pickup_id: null,
      lockAt: null,
      status: null,
      lockReason: null,
    };
  }

  const locked = isPickupLocked(completed);
  return {
    locked,
    pickup_id: completed._id,
    lockAt: completed.completedAt
      ? new Date(new Date(completed.completedAt).getTime() + LOCK_WINDOW_MS).toISOString()
      : null,
    status: completed.status || null,
    lockReason: locked ? 'Conversation archived because the latest matched pickup was completed more than 24 hours ago.' : null,
  };
}

// POST /api/messages - Send a message (with optional media)
router.post('/', protect, (req, res, next) => { req.uploadFolder = 'messages'; next(); }, upload.single('media'), async (req, res) => {
  try {
    const { receiver_id, content, pickup_id } = req.body;
    if (!receiver_id || (!content && !req.file)) {
      return res.status(400).json({ message: 'Receiver and content or media are required' });
    }

    const rules = await resolvePairRules(req.user, receiver_id, pickup_id || null);
    if (!rules.ok) return res.status(rules.status).json({ message: rules.message });
    if (rules.locked) {
      return res.status(403).json({
        message: 'This conversation is archived 24 hours after pickup completion and is now locked',
        locked: true,
        pickup_id: rules.pickup?._id || null,
      });
    }

    let mediaType = null;
    if (req.file) {
      const mt = req.file.mimetype || '';
      if (mt.startsWith('image/')) mediaType = 'image';
      else if (mt.startsWith('video/')) mediaType = 'video';
      else mediaType = 'file';
    }

    // Keep messages tied to the pickup conversation for lock/audit checks.
    const resolvedPickupId = pickup_id || rules.pickup?._id || null;

    const message = await Message.create({
      sender_id: req.user._id,
      receiver_id,
      content: content || '',
      mediaUrl: req.file?.path || null,
      mediaType,
      pickup_id: resolvedPickupId,
    });
    const populated = await Message.findById(message._id)
      .populate('sender_id', 'name username role avatar lastSeen')
      .populate('receiver_id', 'name username role avatar lastSeen')
      .populate('reactions.user_id', 'name username avatar role');

    // ── Real-time: emit message to recipient ──
    try {
      emitToUser(receiver_id, 'chat:message', populated.toObject());
      const preview = content ? `${req.user.name}: ${content.slice(0, 80)}` : `${req.user.name} sent a file`;
      void createNotification({
        user_id: receiver_id,
        type: 'chat:message',
        title: 'New Message',
        message: preview,
        ref_id: message._id,
        ref_model: 'Message',
      }).catch((notifErr) => {
        console.error('Notification enqueue error:', notifErr.message);
      });
    } catch (e) { console.error('Socket/notif emit error:', e.message); }

    res.status(201).json(populated);
  } catch (error) {
    res.status(500).json({ message: 'Server error' });
  }
});

// GET /api/messages/search-users?q=  — find users to start a conversation
router.get('/search-users', protect, async (req, res) => {
  try {
    const q = (req.query.q || '').trim();
    if (q.length < 2) return res.json([]);
    const regex = new RegExp(q, 'i');

    const allowedIds = await getAllowedPartnerIds(req.user);
    const query = {
      _id: { $ne: req.user._id },
      isSuspended: { $ne: true },
      $or: [{ name: regex }, { username: regex }, { email: regex }],
    };

    if (allowedIds) {
      query._id = { $in: Array.from(allowedIds) };
    }

    const users = await User.find(query).select('name username role email avatar lastSeen').limit(15).lean();
    res.json((users || []).map((u) => ({ ...u, online: isUserOnline(u._id) })));
  } catch (err) {
    res.status(500).json({ message: 'Server error' });
  }
});

// GET /api/messages/allowed-contacts  — list contactable users by role rules
router.get('/allowed-contacts', protect, async (req, res) => {
  try {
    const allowedIds = await getAllowedPartnerIds(req.user);
    const query = {
      _id: { $ne: req.user._id },
      isSuspended: { $ne: true },
    };

    if (allowedIds) {
      query._id = { $in: Array.from(allowedIds) };
    }

    const users = await User.find(query)
      .select('name username role email avatar lastSeen')
      .sort({ role: 1, name: 1 })
      .lean();

    res.json((users || []).map((u) => ({ ...u, online: isUserOnline(u._id) })));
  } catch (err) {
    res.status(500).json({ message: 'Server error' });
  }
});

// GET /api/messages/conversations - Get all conversation partners (aggregation, not full scan)
router.get('/conversations', protect, async (req, res) => {
  try {
    const userId = req.user._id;
    const allowedIds = await getAllowedPartnerIds(req.user);

    // Single aggregation query replaces loading ALL messages into memory
    const conversations = await Message.aggregate([
      { $match: { $or: [{ sender_id: userId }, { receiver_id: userId }] } },
      { $sort: { timestamp: -1 } },
      {
        $group: {
          _id: {
            $cond: [{ $eq: ['$sender_id', userId] }, '$receiver_id', '$sender_id'],
          },
          lastMessage: { $first: '$$ROOT' },
          unreadCount: {
            $sum: {
              $cond: [
                { $and: [{ $eq: ['$receiver_id', userId] }, { $eq: ['$isRead', false] }] },
                1, 0,
              ],
            },
          },
        },
      },
      { $sort: { 'lastMessage.timestamp': -1 } },
      { $limit: 50 },
    ]);

    const partnerIds = conversations.map((c) => c._id);
    const partners = await User.find({ _id: { $in: partnerIds } }).select('name username role avatar lastSeen').lean();
    const partnerMap = {};
    partners.forEach((p) => { partnerMap[p._id.toString()] = p; });

    const filtered = conversations.filter((c) => {
      const pid = idStr(c._id);
      if (!partnerMap[pid]) return false;
      if (!allowedIds) return true;
      return allowedIds.has(pid);
    });

    const result = await Promise.all(filtered.map(async (c) => {
      const lockMeta = await getConversationLock(userId, c._id);
      return {
        partner: {
          ...partnerMap[c._id.toString()],
          online: isUserOnline(c._id),
        },
        lastMessage: c.lastMessage,
        unreadCount: c.unreadCount,
        ...lockMeta,
      };
    }));

    res.json(result);
  } catch (error) {
    res.status(500).json({ message: 'Server error' });
  }
});

// GET /api/messages/archived  — admin: archived pickup conversations
router.get('/archived', protect, async (req, res) => {
  try {
    if (req.user.role !== 'admin') {
      return res.status(403).json({ message: 'Admin access required' });
    }

    const page = Math.max(1, parseInt(req.query.page, 10) || 1);
    const limit = Math.min(50, Math.max(1, parseInt(req.query.limit, 10) || 20));
    const skip = (page - 1) * limit;
    const before = new Date(Date.now() - LOCK_WINDOW_MS);

    const filter = {
      status: 'Completed',
      completedAt: { $lte: before },
    };

    if (req.query.pickup_id) {
      filter._id = req.query.pickup_id;
    }

    const [pickups, total] = await Promise.all([
      Pickup.find(filter)
        .sort({ completedAt: -1 })
        .skip(skip)
        .limit(limit)
        .select('_id title user_id volunteer_id completedAt status')
        .populate('user_id', 'name username')
        .populate('volunteer_id', 'name username')
        .lean(),
      Pickup.countDocuments(filter),
    ]);

    const pickupIds = pickups.map((p) => p._id);
    const messages = await Message.find({ pickup_id: { $in: pickupIds } })
      .sort({ timestamp: 1 })
      .populate('sender_id', 'name username role')
      .populate('receiver_id', 'name username role')
      .lean();

    const grouped = {};
    messages.forEach((m) => {
      const key = idStr(m.pickup_id);
      if (!grouped[key]) grouped[key] = [];
      grouped[key].push(m);
    });

    const items = pickups.map((p) => ({
      pickup: p,
      messages: grouped[idStr(p._id)] || [],
      locked: true,
    }));

    res.json({
      items,
      page,
      pages: Math.ceil(total / limit) || 1,
      total,
    });
  } catch (error) {
    res.status(500).json({ message: 'Server error' });
  }
});

// GET /api/messages/message/:messageId/partner - Resolve conversation partner for a message notification
router.get('/message/:messageId/partner', protect, async (req, res) => {
  try {
    const message = await Message.findById(req.params.messageId)
      .select('sender_id receiver_id')
      .lean();

    if (!message) {
      return res.status(404).json({ message: 'Message not found' });
    }

    const myId = idStr(req.user._id);
    const senderId = idStr(message.sender_id);
    const receiverId = idStr(message.receiver_id);

    if (myId !== senderId && myId !== receiverId && req.user.role !== 'admin') {
      return res.status(403).json({ message: 'Not authorized for this message' });
    }

    const partnerId = myId === senderId ? receiverId : senderId;
    res.json({ partnerId });
  } catch (error) {
    res.status(500).json({ message: 'Server error' });
  }
});

// POST /api/messages/:messageId/reaction - Toggle emoji reaction for a message
router.post('/:messageId/reaction', protect, async (req, res) => {
  try {
    const { emoji } = req.body || {};
    const messageId = req.params.messageId;
    if (!emoji || typeof emoji !== 'string' || emoji.trim().length > 16) {
      return res.status(400).json({ message: 'Valid emoji is required' });
    }

    const message = await Message.findById(messageId);
    if (!message) return res.status(404).json({ message: 'Message not found' });

    const myId = idStr(req.user._id);
    const senderId = idStr(message.sender_id);
    const receiverId = idStr(message.receiver_id);
    if (myId !== senderId && myId !== receiverId && req.user.role !== 'admin') {
      return res.status(403).json({ message: 'Not authorized for this message' });
    }

    const idx = (message.reactions || []).findIndex((r) => idStr(r.user_id) === myId);
    const nextEmoji = emoji.trim();

    if (idx >= 0 && message.reactions[idx].emoji === nextEmoji) {
      message.reactions.splice(idx, 1);
    } else if (idx >= 0) {
      message.reactions[idx].emoji = nextEmoji;
      message.reactions[idx].reactedAt = new Date();
    } else {
      message.reactions.push({ user_id: req.user._id, emoji: nextEmoji, reactedAt: new Date() });
    }

    await message.save();
    const populated = await Message.findById(message._id)
      .populate('reactions.user_id', 'name username avatar role')
      .lean();

    emitToUser(senderId, 'chat:reaction', { messageId: message._id, reactions: populated.reactions || [] });
    emitToUser(receiverId, 'chat:reaction', { messageId: message._id, reactions: populated.reactions || [] });

    res.json({ messageId: message._id, reactions: populated.reactions || [] });
  } catch (error) {
    res.status(500).json({ message: 'Server error' });
  }
});

// POST /api/messages/:messageId/report - Report a message and create support ticket for admin review
router.post('/:messageId/report', protect, async (req, res) => {
  try {
    const messageId = req.params.messageId;
    if (!mongoose.Types.ObjectId.isValid(messageId)) {
      return res.status(400).json({ message: 'Invalid message ID' });
    }

    const reason = (req.body?.reason || '').toString().trim();
    const details = (req.body?.details || '').toString().trim();
    if (!reason) return res.status(400).json({ message: 'Report reason is required' });

    const message = await Message.findById(messageId)
      .populate('sender_id', 'name username role')
      .populate('receiver_id', 'name username role')
      .lean();
    if (!message) return res.status(404).json({ message: 'Message not found' });

    const myId = idStr(req.user._id);
    const senderId = idStr(message.sender_id?._id || message.sender_id);
    const receiverId = idStr(message.receiver_id?._id || message.receiver_id);
    if (myId !== senderId && myId !== receiverId && req.user.role !== 'admin') {
      return res.status(403).json({ message: 'Not authorized for this message' });
    }

    const partnerId = myId === senderId ? receiverId : senderId;
    const partnerObjectId = mongoose.Types.ObjectId.isValid(partnerId)
      ? new mongoose.Types.ObjectId(partnerId)
      : null;
    const partnerName = myId === senderId ? (message.receiver_id?.name || 'Unknown user') : (message.sender_id?.name || 'Unknown user');

    let sample = [];
    if (partnerObjectId) {
      sample = await Message.find({
        $or: [
          { sender_id: req.user._id, receiver_id: partnerObjectId },
          { sender_id: partnerObjectId, receiver_id: req.user._id },
        ],
      })
        .sort({ timestamp: -1 })
        .limit(30)
        .populate('sender_id', 'name username')
        .lean();
    }

    const transcript = (sample || [])
      .reverse()
      .map((m) => {
        const name = m.sender_id?.name || 'Unknown';
        const ts = m.timestamp ? new Date(m.timestamp).toISOString() : '';
        const text = m.content || (m.mediaUrl ? `[${m.mediaType || 'file'} attachment]` : '[empty]');
        return `[${ts}] ${name}: ${text}`;
      })
      .join('\n');

    const ticket = await SupportTicket.create({
      user_id: req.user._id,
      role: req.user.role,
      category: 'chat-report',
      subject: `Reported message with ${partnerName}`,
      description: [
        `Reason: ${reason}`,
        details ? `Details: ${details}` : null,
        `Reported message ID: ${messageId}`,
      ].filter(Boolean).join('\n'),
      messageReport: {
        reportedMessageId: message._id,
        reporterId: req.user._id,
        partnerId: partnerObjectId,
        conversationSample: transcript,
      },
    });

    const admins = await User.find({ role: 'admin', isSuspended: { $ne: true } }).select('_id').lean();
    if (admins.length) {
      try {
        await Promise.all(
          admins.map((admin) =>
            createNotification({
              user_id: admin._id,
              type: 'system',
              title: 'New Chat Report',
              message: `${req.user.name || req.user.username || 'A user'} reported a chat message with ${partnerName}`,
              ref_id: ticket._id,
              ref_model: 'SupportTicket',
            })
          )
        );
      } catch (notifyErr) {
        console.error('Chat report notification failed:', notifyErr.message);
      }
    }

    res.status(201).json({
      message: 'Message reported successfully',
      ticketId: ticket._id,
      reportId: ticket.reportId || null,
    });
  } catch (error) {
    res.status(500).json({ message: 'Server error' });
  }
});

// PUT /api/messages/:messageId - Edit own message within 10 minutes
router.put('/:messageId', protect, async (req, res) => {
  try {
    const message = await Message.findById(req.params.messageId);
    if (!message) return res.status(404).json({ message: 'Message not found' });

    if (!canModifyMessage(message, req.user._id)) {
      return res.status(403).json({ message: 'Message can only be edited by sender within 10 minutes' });
    }

    const nextContent = (req.body?.content || '').toString().trim();
    if (!nextContent) return res.status(400).json({ message: 'Message content is required' });

    message.content = nextContent;
    message.editedAt = new Date();
    await message.save();

    const populated = await Message.findById(message._id)
      .populate('sender_id', 'name username role avatar lastSeen')
      .populate('receiver_id', 'name username role avatar lastSeen')
      .populate('reactions.user_id', 'name username avatar role')
      .lean();

    const senderId = idStr(message.sender_id);
    const receiverId = idStr(message.receiver_id);
    emitToUser(senderId, 'chat:message:updated', populated);
    emitToUser(receiverId, 'chat:message:updated', populated);

    res.json(populated);
  } catch (error) {
    res.status(500).json({ message: 'Server error' });
  }
});

// DELETE /api/messages/:messageId - Delete own message within 10 minutes
router.delete('/:messageId', protect, async (req, res) => {
  try {
    const message = await Message.findById(req.params.messageId);
    if (!message) return res.status(404).json({ message: 'Message not found' });

    if (!canModifyMessage(message, req.user._id)) {
      return res.status(403).json({ message: 'Message can only be deleted by sender within 10 minutes' });
    }

    message.isDeleted = true;
    message.deletedAt = new Date();
    message.editedAt = new Date();
    message.content = 'This message was deleted.';
    message.mediaUrl = null;
    message.mediaType = null;
    message.reactions = [];
    await message.save();

    const populated = await Message.findById(message._id)
      .populate('sender_id', 'name username role avatar lastSeen')
      .populate('receiver_id', 'name username role avatar lastSeen')
      .populate('reactions.user_id', 'name username avatar role')
      .lean();

    const senderId = idStr(message.sender_id);
    const receiverId = idStr(message.receiver_id);
    emitToUser(senderId, 'chat:message:updated', populated);
    emitToUser(receiverId, 'chat:message:updated', populated);

    res.json(populated);
  } catch (error) {
    res.status(500).json({ message: 'Server error' });
  }
});

// POST /api/messages/:userId/read - Mark a conversation as read and notify sender(s)
router.post('/:userId/read', protect, async (req, res) => {
  try {
    const myId = req.user._id;
    const otherId = req.params.userId;
    const rules = await resolvePairRules(req.user, otherId);
    if (!rules.ok) return res.status(rules.status).json({ message: rules.message });

    const unreadRows = await Message.find({ sender_id: otherId, receiver_id: myId, isRead: false })
      .select('_id')
      .lean();
    const readIds = unreadRows.map((row) => row._id);

    if (!readIds.length) {
      return res.json({ readCount: 0, messageIds: [] });
    }

    await Message.updateMany({ _id: { $in: readIds } }, { isRead: true });
    emitToUser(otherId, 'chat:read', {
      readerId: idStr(myId),
      messageIds: readIds.map((id) => idStr(id)),
    });

    res.json({ readCount: readIds.length, messageIds: readIds.map((id) => idStr(id)) });
  } catch (error) {
    res.status(500).json({ message: 'Server error' });
  }
});

// GET /api/messages/:userId - Get messages with another user (parallel fetch + mark-read)
router.get('/:userId', protect, async (req, res) => {
  try {
    const myId = req.user._id;
    const otherId = req.params.userId;
    const limit = Math.min(200, Math.max(1, parseInt(req.query.limit, 10) || 40));
    const before = req.query.before ? new Date(req.query.before) : null;

    const rules = await resolvePairRules(req.user, otherId);
    if (!rules.ok) return res.status(rules.status).json({ message: rules.message });

    const messageQuery = {
      $or: [
        { sender_id: myId, receiver_id: otherId },
        { sender_id: otherId, receiver_id: myId },
      ],
    };

    if (before && !Number.isNaN(before.getTime())) {
      messageQuery.timestamp = { $lt: before };
    }

    const unreadRows = await Message.find({ sender_id: otherId, receiver_id: myId, isRead: false })
      .select('_id')
      .lean();
    const readIds = unreadRows.map((row) => row._id);

    // Fetch newest chunk first, then reverse for natural chat order
    const [messages, _markReadResult, archivedPickupIds] = await Promise.all([
      Message.find({
        ...messageQuery,
      })
        .populate('sender_id', 'name username role avatar lastSeen')
        .populate('receiver_id', 'name username role avatar lastSeen')
        .populate('reactions.user_id', 'name username avatar role')
        .sort({ timestamp: -1 })
        .limit(limit)
        .lean(),
      readIds.length ? Message.updateMany({ _id: { $in: readIds } }, { isRead: true }) : Promise.resolve(),
      getArchivedPickupIdsForPair(myId, otherId),
    ]);

    const enrichedMessages = (messages || []).reverse().map((m) => {
      const pickupId = idStr(m.pickup_id);
      const archived = pickupId ? archivedPickupIds.has(pickupId) : false;
      return {
        ...m,
        archived,
        archivedReason: archived ? 'Message archived because pickup chat window has expired.' : null,
      };
    });

    if (readIds.length) {
      emitToUser(otherId, 'chat:read', {
        readerId: idStr(myId),
        messageIds: readIds.map((id) => idStr(id)),
      });
    }

    const lockMeta = await getConversationLock(myId, otherId);
    res.json({
      messages: enrichedMessages,
      hasMore: (messages || []).length >= limit,
      oldestCursor: enrichedMessages.length ? enrichedMessages[0].timestamp : null,
      partner: rules.receiver ? { ...rules.receiver, online: isUserOnline(rules.receiver._id) } : null,
      ...lockMeta,
    });
  } catch (error) {
    res.status(500).json({ message: 'Server error' });
  }
});

module.exports = router;
module.exports.__test = {
  isPickupLocked,
  getConversationLock,
  LOCK_WINDOW_MS,
};
