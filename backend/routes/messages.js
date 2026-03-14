const express = require('express');
const router = express.Router();
const Message = require('../models/Message');
const User = require('../models/User');
const { protect } = require('../middleware/auth');

// POST /api/messages - Send a message
router.post('/', protect, async (req, res) => {
  try {
    const { receiver_id, content, pickup_id } = req.body;
    if (!receiver_id || !content) {
      return res.status(400).json({ message: 'Receiver and content are required' });
    }
    const receiver = await User.findById(receiver_id);
    if (!receiver) return res.status(404).json({ message: 'Receiver not found' });

    const message = await Message.create({
      sender_id: req.user._id,
      receiver_id,
      content,
      pickup_id: pickup_id || null,
    });
    const populated = await Message.findById(message._id)
      .populate('sender_id', 'name username role')
      .populate('receiver_id', 'name username role');
    res.status(201).json(populated);
  } catch (error) {
    res.status(500).json({ message: 'Server error' });
  }
});

// GET /api/messages/conversations - Get all conversation partners (aggregation, not full scan)
router.get('/conversations', protect, async (req, res) => {
  try {
    const userId = req.user._id;

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
    const partners = await User.find({ _id: { $in: partnerIds } }).select('name username role').lean();
    const partnerMap = {};
    partners.forEach((p) => { partnerMap[p._id.toString()] = p; });

    const result = conversations.map((c) => ({
      partner: partnerMap[c._id.toString()],
      lastMessage: c.lastMessage,
      unreadCount: c.unreadCount,
    }));

    res.json(result);
  } catch (error) {
    res.status(500).json({ message: 'Server error' });
  }
});

// GET /api/messages/:userId - Get messages with another user (parallel fetch + mark-read)
router.get('/:userId', protect, async (req, res) => {
  try {
    const myId = req.user._id;
    const otherId = req.params.userId;
    const limit = Math.min(200, parseInt(req.query.limit) || 100);

    // Fetch messages and mark-as-read in parallel
    const [messages] = await Promise.all([
      Message.find({
        $or: [
          { sender_id: myId, receiver_id: otherId },
          { sender_id: otherId, receiver_id: myId },
        ],
      })
        .populate('sender_id', 'name username role')
        .populate('receiver_id', 'name username role')
        .sort({ timestamp: 1 })
        .limit(limit)
        .lean(),
      Message.updateMany(
        { sender_id: otherId, receiver_id: myId, isRead: false },
        { isRead: true }
      ),
    ]);

    res.json(messages);
  } catch (error) {
    res.status(500).json({ message: 'Server error' });
  }
});

module.exports = router;
