const express = require('express');
const router = express.Router();
const User = require('../models/User');
const Pickup = require('../models/Pickup');
const AdminLog = require('../models/AdminLog');
const { protect, adminOnly } = require('../middleware/auth');

// GET /api/admin/stats - Platform overview stats
router.get('/stats', protect, adminOnly, async (req, res) => {
  try {
    // Run all count queries in parallel instead of sequentially
    const [
      totalUsers,
      totalVolunteers,
      totalAdmins,
      totalPickups,
      completedPickups,
      pendingPickups,
      cancelledPickups,
      wasteByType,
      recentActivity,
    ] = await Promise.all([
      User.countDocuments({ role: 'user' }),
      User.countDocuments({ role: 'volunteer' }),
      User.countDocuments({ role: 'admin' }),
      Pickup.countDocuments(),
      Pickup.countDocuments({ status: 'Completed' }),
      Pickup.countDocuments({ status: { $in: ['Open', 'Accepted'] } }),
      Pickup.countDocuments({ status: 'Cancelled' }),
      Pickup.aggregate([
        { $match: { status: 'Completed' } },
        { $group: { _id: '$wasteType', count: { $sum: 1 } } },
      ]),
      AdminLog.find()
        .populate('user_id', 'name username role')
        .sort({ timestamp: -1 })
        .limit(10)
        .lean(),
    ]);

    res.json({
      totalUsers, totalVolunteers, totalAdmins,
      totalPickups, completedPickups, pendingPickups, cancelledPickups,
      wasteByType, recentActivity,
    });
  } catch (error) {
    res.status(500).json({ message: 'Server error' });
  }
});

// GET /api/admin/users - All users (paginated)
router.get('/users', protect, adminOnly, async (req, res) => {
  try {
    const page = Math.max(1, parseInt(req.query.page) || 1);
    const limit = Math.min(100, parseInt(req.query.limit) || 50);
    const skip = (page - 1) * limit;
    const [users, total] = await Promise.all([
      User.find({ role: { $ne: 'admin' } }).select('-password').sort({ createdAt: -1 }).skip(skip).limit(limit).lean(),
      User.countDocuments({ role: { $ne: 'admin' } }),
    ]);
    res.json({ users, total, page, pages: Math.ceil(total / limit) });
  } catch (error) {
    res.status(500).json({ message: 'Server error' });
  }
});

// GET /api/admin/all-users - All accounts including admins
router.get('/all-users', protect, adminOnly, async (req, res) => {
  try {
    const users = await User.find().select('-password').sort({ createdAt: -1 }).lean();
    res.json(users);
  } catch (error) {
    res.status(500).json({ message: 'Server error' });
  }
});

// PUT /api/admin/users/:id/suspend - Suspend/activate user
router.put('/users/:id/suspend', protect, adminOnly, async (req, res) => {
  try {
    const user = await User.findById(req.params.id);
    if (!user) return res.status(404).json({ message: 'User not found' });
    user.isSuspended = !user.isSuspended;
    await user.save();
    const action = user.isSuspended ? 'USER_SUSPENDED' : 'USER_ACTIVATED';
    await AdminLog.create({ action, user_id: user._id, performedBy: req.user._id, details: `${user.name} ${user.isSuspended ? 'suspended' : 'activated'} by admin` });
    res.json({ message: `User ${user.isSuspended ? 'suspended' : 'activated'}`, user: { _id: user._id, isSuspended: user.isSuspended } });
  } catch (error) {
    res.status(500).json({ message: 'Server error' });
  }
});

// DELETE /api/admin/users/:id - Delete user
router.delete('/users/:id', protect, adminOnly, async (req, res) => {
  try {
    const user = await User.findByIdAndDelete(req.params.id);
    if (!user) return res.status(404).json({ message: 'User not found' });
    await AdminLog.create({ action: 'USER_DELETED', performedBy: req.user._id, details: `${user.name} deleted by admin` });
    res.json({ message: 'User deleted' });
  } catch (error) {
    res.status(500).json({ message: 'Server error' });
  }
});

// GET /api/admin/reports/users - User report data
router.get('/reports/users', protect, adminOnly, async (req, res) => {
  try {
    const users = await User.find({ role: { $ne: 'admin' } }).select('-password').sort({ createdAt: -1 }).lean();
    res.json(users);
  } catch (error) {
    res.status(500).json({ message: 'Server error' });
  }
});

// GET /api/admin/reports/pickups - Pickup report data
router.get('/reports/pickups', protect, adminOnly, async (req, res) => {
  try {
    const pickups = await Pickup.find()
      .populate('user_id', 'name email username')
      .populate('volunteer_id', 'name email username')
      .sort({ createdAt: -1 })
      .lean();
    res.json(pickups);
  } catch (error) {
    res.status(500).json({ message: 'Server error' });
  }
});

// GET /api/admin/reports/waste - Waste stats
router.get('/reports/waste', protect, adminOnly, async (req, res) => {
  try {
    const wasteByType = await Pickup.aggregate([
      { $match: { status: 'Completed' } },
      { $group: { _id: '$wasteType', count: { $sum: 1 } } },
      { $sort: { count: -1 } },
    ]);
    const monthlyTrend = await Pickup.aggregate([
      {
        $group: {
          _id: { year: { $year: '$createdAt' }, month: { $month: '$createdAt' } },
          total: { $sum: 1 },
          completed: { $sum: { $cond: [{ $eq: ['$status', 'Completed'] }, 1, 0] } },
        },
      },
      { $sort: { '_id.year': 1, '_id.month': 1 } },
      { $limit: 12 },
    ]);
    res.json({ wasteByType, monthlyTrend });
  } catch (error) {
    res.status(500).json({ message: 'Server error' });
  }
});

// GET /api/admin/reports/volunteers - Volunteer report (single aggregation, no N+1)
router.get('/reports/volunteers', protect, adminOnly, async (req, res) => {
  try {
    const [volunteers, pickupStats] = await Promise.all([
      User.find({ role: 'volunteer' }).select('-password').lean(),
      Pickup.aggregate([
        { $match: { volunteer_id: { $ne: null }, status: { $in: ['Accepted', 'Completed'] } } },
        { $group: {
          _id: { volunteer_id: '$volunteer_id', status: '$status' },
          count: { $sum: 1 },
        }},
      ]),
    ]);

    // Build a lookup map from aggregation result
    const statsMap = {};
    pickupStats.forEach(({ _id, count }) => {
      const vid = _id.volunteer_id.toString();
      if (!statsMap[vid]) statsMap[vid] = { accepted: 0, completed: 0 };
      if (_id.status === 'Accepted') statsMap[vid].accepted = count;
      if (_id.status === 'Completed') statsMap[vid].completed = count;
    });

    const volunteerStats = volunteers.map((v) => {
      const s = statsMap[v._id.toString()] || { accepted: 0, completed: 0 };
      return { ...v, acceptedPickups: s.accepted, completedPickups: s.completed };
    });

    res.json(volunteerStats);
  } catch (error) {
    res.status(500).json({ message: 'Server error' });
  }
});

// GET /api/admin/logs - Activity logs (paginated)
router.get('/logs', protect, adminOnly, async (req, res) => {
  try {
    const limit = Math.min(200, parseInt(req.query.limit) || 100);
    const logs = await AdminLog.find()
      .populate('user_id', 'name username role')
      .populate('performedBy', 'name username')
      .sort({ timestamp: -1 })
      .limit(limit)
      .lean();
    res.json(logs);
  } catch (error) {
    res.status(500).json({ message: 'Server error' });
  }
});

module.exports = router;
