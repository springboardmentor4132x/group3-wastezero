const express = require('express');
const router = express.Router();
const mongoose = require('mongoose');
const crypto = require('crypto');
const User = require('../models/User');
const Pickup = require('../models/Pickup');
const Opportunity = require('../models/Opportunity');
const Application = require('../models/Application');
const SupportTicket = require('../models/SupportTicket');
const AdminLog = require('../models/AdminLog');
const PointTransaction = require('../models/PointTransaction');
const { createNotification } = require('../controllers/notificationController');
const { emitToUser } = require('../socket');
const { sendEmail } = require('../emails/mailer');
const { buildAdminPasswordResetTemplate } = require('../emails/templates/adminPasswordReset');
const { buildPasswordResetTemplate } = require('../emails/templates/passwordReset');
const { protect, adminOnly } = require('../middleware/auth');

function canSendSecurityEmail(user) {
  const pref = user?.emailPreferences || {};
  if (pref.enabled === false) return false;
  return pref.security !== false;
}

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
      totalOpportunities,
      activeOpportunities,
      completedOpportunities,
      totalApplications,
      acceptedApplications,
      rejectedApplications,
      totalChatReports,
      openChatReports,
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
      Opportunity.countDocuments({ isDeleted: false }),
      Opportunity.countDocuments({ isDeleted: false, status: { $in: ['open', 'in-progress'] } }),
      Opportunity.countDocuments({ isDeleted: false, status: 'closed' }),
      Application.countDocuments(),
      Application.countDocuments({ status: 'accepted' }),
      Application.countDocuments({ status: 'rejected' }),
      SupportTicket.countDocuments({ category: 'chat-report' }),
      SupportTicket.countDocuments({ category: 'chat-report', status: { $in: ['open', 'in-progress'] } }),
      Pickup.aggregate([
        { $match: { status: 'Completed' } },
        { $group: { _id: '$wasteType', count: { $sum: 1 } } },
      ]),
      AdminLog.find()
        .populate('user_id', 'name username role')
        .populate('performedBy', 'name username role')
        .sort({ timestamp: -1 })
        .limit(10)
        .lean(),
    ]);

    const applicationByStatus = {
      pending: Math.max(0, totalApplications - acceptedApplications - rejectedApplications),
      accepted: acceptedApplications,
      rejected: rejectedApplications,
    };

    res.json({
      totalUsers, totalVolunteers, totalAdmins,
      totalPickups, completedPickups, pendingPickups, cancelledPickups,
      totalOpportunities, activeOpportunities, completedOpportunities,
      totalApplications, applicationByStatus,
      totalChatReports, openChatReports,
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

// PUT /api/admin/users/:id/block - Block/unblock user (mapped to suspension gate)
router.put('/users/:id/block', protect, adminOnly, async (req, res) => {
  try {
    const user = await User.findById(req.params.id);
    if (!user) return res.status(404).json({ message: 'User not found' });
    if (user.role === 'admin') return res.status(400).json({ message: 'Admin account cannot be blocked' });

    const blockedParam = req.body?.blocked;
    const reason = (req.body?.reason || '').toString().trim();
    const shouldBlock = typeof blockedParam === 'boolean' ? blockedParam : !user.isSuspended;

    user.isSuspended = shouldBlock;
    await user.save();

    await AdminLog.create({
      action: shouldBlock ? 'USER_BLOCKED' : 'USER_UNBLOCKED',
      user_id: user._id,
      performedBy: req.user._id,
      details: `${user.name} ${shouldBlock ? 'blocked' : 'unblocked'} by admin${reason ? ` (Reason: ${reason})` : ''}`,
    });

    res.json({
      message: `User ${shouldBlock ? 'blocked' : 'unblocked'}`,
      user: { _id: user._id, isSuspended: user.isSuspended },
    });
  } catch (error) {
    res.status(500).json({ message: 'Server error' });
  }
});

// DELETE /api/admin/users/:id - Delete user
router.delete('/users/:id', protect, adminOnly, async (req, res) => {
  try {
    const user = await User.findByIdAndDelete(req.params.id);
    if (!user) return res.status(404).json({ message: 'User not found' });
    await AdminLog.create({ action: 'USER_DELETED', user_id: user._id, performedBy: req.user._id, details: `${user.name} deleted by admin` });
    res.json({ message: 'User deleted' });
  } catch (error) {
    res.status(500).json({ message: 'Server error' });
  }
});

// PUT /api/admin/users/:id/reset-password - Admin resets user password
router.put('/users/:id/reset-password', protect, adminOnly, async (req, res) => {
  try {
    const newPassword = (req.body?.newPassword || '').toString();
    const shouldEmail = req.body?.sendEmail !== false;

    if (!newPassword || newPassword.length < 8) {
      return res.status(400).json({ message: 'New password must be at least 8 characters' });
    }

    const user = await User.findById(req.params.id);
    if (!user) return res.status(404).json({ message: 'User not found' });

    if (user.role === 'admin') {
      return res.status(400).json({ message: 'Use account recovery for admin passwords' });
    }

    user.password = newPassword;
    user.resetPasswordToken = null;
    user.resetPasswordExpires = null;
    await user.save();

    await AdminLog.create({
      action: 'USER_PASSWORD_RESET',
      user_id: user._id,
      performedBy: req.user._id,
      details: `Password reset by admin for ${user.email}`,
    });

    await createNotification({
      user_id: user._id,
      type: 'system',
      title: 'Password Reset by Admin',
      message: 'Your account password was reset by an administrator. Please log in and update it immediately.',
      ref_id: null,
      ref_model: null,
      sendEmail: false,
    });

    let emailed = false;
    if (shouldEmail && user.email && canSendSecurityEmail(user)) {
      try {
        const tpl = buildAdminPasswordResetTemplate({
          name: user.name,
          resetBy: req.user?.name || 'Administrator',
          temporaryPassword: newPassword,
        });
        await sendEmail({
          to: user.email,
          subject: 'WasteZero Password Reset by Admin',
          html: tpl.html,
          text: tpl.text,
        });
        emailed = true;
      } catch (emailErr) {
        console.error('Admin password reset email failed:', emailErr.message);
      }
    }

    res.json({
      message: 'Password reset successfully',
      emailed,
    });
  } catch (error) {
    res.status(500).json({ message: 'Server error' });
  }
});

// POST /api/admin/users/:id/reset-password-token - Admin generates reset token and emails reset link
router.post('/users/:id/reset-password-token', protect, adminOnly, async (req, res) => {
  try {
    const user = await User.findById(req.params.id);
    if (!user) return res.status(404).json({ message: 'User not found' });
    if (user.role === 'admin') return res.status(400).json({ message: 'Use account recovery for admin passwords' });
    if (!user.email) return res.status(400).json({ message: 'User does not have a registered email' });

    const token = crypto.randomBytes(32).toString('hex');
    user.resetPasswordToken = crypto.createHash('sha256').update(token).digest('hex');
    user.resetPasswordExpires = Date.now() + 60 * 60 * 1000;
    await user.save({ validateBeforeSave: false });

    const resetUrl = `${process.env.FRONTEND_URL || 'http://localhost:4200'}/reset-password?token=${token}`;
    const tpl = buildPasswordResetTemplate({ name: user.name, resetUrl });

    let emailed = false;
    let deliveryIssue = null;

    try {
      await sendEmail({
        to: user.email,
        subject: 'WasteZero Password Reset Link',
        html: tpl.html,
        text: tpl.text,
      });
      emailed = true;
    } catch (emailErr) {
      deliveryIssue = "We're facing an issue sending emails right now. The reset token was created successfully; please try again in a few minutes.";
      console.error(`Admin reset token email delivery failed (${emailErr?.code || 'UNKNOWN'}): ${emailErr?.message || 'Email delivery failed'}`);
    }

    await createNotification({
      user_id: user._id,
      type: 'system',
      title: 'Password Reset Link Sent',
      message: 'An administrator sent you a secure password reset link. Please check your email.',
      ref_id: null,
      ref_model: null,
      sendEmail: false,
    });

    await AdminLog.create({
      action: 'USER_PASSWORD_RESET_LINK_SENT',
      user_id: user._id,
      performedBy: req.user._id,
      details: `Password reset token ${emailed ? 'sent' : 'generated'} by admin for ${user.email}`,
    });

    res.json({
      message: emailed
        ? 'Password reset link sent successfully.'
        : deliveryIssue,
      emailed,
      resetUrl: emailed ? null : resetUrl,
    });
  } catch (error) {
    res.status(500).json({ message: 'Server error' });
  }
});

// GET /api/admin/activity/users - User + volunteer activity monitoring view
router.get('/activity/users', protect, adminOnly, async (req, res) => {
  try {
    const page = Math.max(1, parseInt(req.query.page, 10) || 1);
    const limit = Math.min(100, Math.max(1, parseInt(req.query.limit, 10) || 25));
    const skip = (page - 1) * limit;
    const role = (req.query.role || '').toString().trim();
    const search = (req.query.search || '').toString().trim();

    const query = { role: { $in: ['user', 'volunteer'] } };
    if (role && ['user', 'volunteer'].includes(role)) {
      query.role = role;
    }
    if (search) {
      query.$or = [
        { name: { $regex: search, $options: 'i' } },
        { email: { $regex: search, $options: 'i' } },
        { username: { $regex: search, $options: 'i' } },
        { location: { $regex: search, $options: 'i' } },
      ];
    }

    const [users, total] = await Promise.all([
      User.find(query)
        .select('name email username role location isSuspended createdAt totalPickupsCompleted rewardPoints')
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit)
        .lean(),
      User.countDocuments(query),
    ]);

    const userIds = users.map((u) => u._id);

    const [userPickupCounts, volunteerAppStats] = await Promise.all([
      Pickup.aggregate([
        { $match: { user_id: { $in: userIds } } },
        { $group: { _id: '$user_id', pickupsCreated: { $sum: 1 } } },
      ]),
      Application.aggregate([
        { $match: { volunteer_id: { $in: userIds } } },
        {
          $group: {
            _id: '$volunteer_id',
            totalApplications: { $sum: 1 },
            acceptedApplications: {
              $sum: { $cond: [{ $eq: ['$status', 'accepted'] }, 1, 0] },
            },
            rejectedApplications: {
              $sum: { $cond: [{ $eq: ['$status', 'rejected'] }, 1, 0] },
            },
            opportunityIds: { $addToSet: '$opportunity_id' },
          },
        },
      ]),
    ]);

    const pickupMap = new Map(userPickupCounts.map((x) => [String(x._id), x.pickupsCreated]));
    const appStatsMap = new Map(
      volunteerAppStats.map((x) => [
        String(x._id),
        {
          totalApplications: x.totalApplications,
          acceptedApplications: x.acceptedApplications,
          rejectedApplications: x.rejectedApplications,
          participatedOpportunities: (x.opportunityIds || []).length,
        },
      ])
    );

    const items = users.map((u) => {
      const appStats = appStatsMap.get(String(u._id)) || {
        totalApplications: 0,
        acceptedApplications: 0,
        rejectedApplications: 0,
        participatedOpportunities: 0,
      };
      return {
        ...u,
        pickupsCreated: pickupMap.get(String(u._id)) || 0,
        ...appStats,
      };
    });

    res.json({
      items,
      total,
      page,
      pages: Math.ceil(total / limit) || 1,
      limit,
    });
  } catch (error) {
    res.status(500).json({ message: 'Server error' });
  }
});

// GET /api/admin/opportunities - Admin monitoring list (all opportunities)
router.get('/opportunities', protect, adminOnly, async (req, res) => {
  try {
    const page = Math.max(1, parseInt(req.query.page, 10) || 1);
    const limit = Math.min(100, Math.max(1, parseInt(req.query.limit, 10) || 20));
    const skip = (page - 1) * limit;
    const status = (req.query.status || '').toString().trim();
    const search = (req.query.search || '').toString().trim();
    const includeDeleted = req.query.includeDeleted === 'true';

    const query = {};
    if (!includeDeleted) query.isDeleted = false;
    if (status && ['open', 'in-progress', 'closed'].includes(status)) {
      query.status = status;
    }
    if (search) {
      query.$or = [
        { title: { $regex: search, $options: 'i' } },
        { description: { $regex: search, $options: 'i' } },
        { location: { $regex: search, $options: 'i' } },
        { requiredSkills: { $regex: search, $options: 'i' } },
      ];
    }

    const [opportunities, total] = await Promise.all([
      Opportunity.find(query)
        .populate('ngo_id', 'name email username')
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit)
        .lean(),
      Opportunity.countDocuments(query),
    ]);

    const oppIds = opportunities.map((o) => o._id);
    const appStats = await Application.aggregate([
      { $match: { opportunity_id: { $in: oppIds } } },
      {
        $group: {
          _id: '$opportunity_id',
          totalApplications: { $sum: 1 },
          pendingApplications: {
            $sum: { $cond: [{ $eq: ['$status', 'pending'] }, 1, 0] },
          },
          acceptedApplications: {
            $sum: { $cond: [{ $eq: ['$status', 'accepted'] }, 1, 0] },
          },
          rejectedApplications: {
            $sum: { $cond: [{ $eq: ['$status', 'rejected'] }, 1, 0] },
          },
        },
      },
    ]);

    const appStatsMap = new Map(appStats.map((x) => [String(x._id), x]));

    const items = opportunities.map((o) => {
      const s = appStatsMap.get(String(o._id)) || {
        totalApplications: 0,
        pendingApplications: 0,
        acceptedApplications: 0,
        rejectedApplications: 0,
      };
      return {
        ...o,
        applicationStats: {
          total: s.totalApplications,
          pending: s.pendingApplications,
          accepted: s.acceptedApplications,
          rejected: s.rejectedApplications,
        },
      };
    });

    res.json({
      items,
      total,
      page,
      pages: Math.ceil(total / limit) || 1,
      limit,
    });
  } catch (error) {
    res.status(500).json({ message: 'Server error' });
  }
});

// PUT /api/admin/opportunities/:id - Admin updates opportunity details
router.put('/opportunities/:id', protect, adminOnly, async (req, res) => {
  try {
    const opportunity = await Opportunity.findById(req.params.id);
    if (!opportunity) return res.status(404).json({ message: 'Opportunity not found' });

    const { title, description, requiredSkills, duration, location, status } = req.body || {};
    const updates = {};
    const errors = [];

    if (title !== undefined) {
      if (!title || !title.trim()) errors.push('Title cannot be empty');
      else updates.title = title.trim();
    }
    if (description !== undefined) {
      if (!description || !description.trim()) errors.push('Description cannot be empty');
      else updates.description = description.trim();
    }
    if (requiredSkills !== undefined) {
      if (!Array.isArray(requiredSkills) || !requiredSkills.length) {
        errors.push('At least one required skill is needed');
      } else {
        const cleaned = requiredSkills.map((s) => (s || '').toString().trim()).filter(Boolean);
        if (!cleaned.length) errors.push('At least one required skill is needed');
        else updates.requiredSkills = cleaned;
      }
    }
    if (duration !== undefined) {
      if (!duration || !duration.trim()) errors.push('Duration cannot be empty');
      else updates.duration = duration.trim();
    }
    if (location !== undefined) {
      if (!location || !location.trim()) errors.push('Location cannot be empty');
      else updates.location = location.trim();
    }
    if (status !== undefined) {
      if (!['open', 'in-progress', 'closed'].includes(status)) {
        errors.push('Status must be open, in-progress, or closed');
      } else {
        updates.status = status;
      }
    }

    if (errors.length) return res.status(400).json({ message: 'Validation failed', details: errors });

    const updated = await Opportunity.findByIdAndUpdate(
      opportunity._id,
      { $set: updates },
      { new: true, runValidators: true }
    )
      .populate('ngo_id', 'name email username')
      .lean();

    await AdminLog.create({
      action: 'OPPORTUNITY_UPDATED',
      user_id: opportunity.ngo_id,
      performedBy: req.user._id,
      details: `Opportunity "${updated.title}" updated by admin ${req.user.name}`,
    });

    res.json(updated);
  } catch (error) {
    res.status(500).json({ message: 'Server error' });
  }
});

// DELETE /api/admin/opportunities/:id - Admin removes inappropriate opportunity
router.delete('/opportunities/:id', protect, adminOnly, async (req, res) => {
  try {
    const opportunity = await Opportunity.findById(req.params.id);
    if (!opportunity) return res.status(404).json({ message: 'Opportunity not found' });
    if (opportunity.isDeleted) return res.status(400).json({ message: 'Opportunity already removed' });

    opportunity.isDeleted = true;
    await opportunity.save();

    await AdminLog.create({
      action: 'OPPORTUNITY_REMOVED',
      user_id: opportunity.ngo_id,
      performedBy: req.user._id,
      details: `Opportunity "${opportunity.title}" removed by admin ${req.user.name}`,
    });

    res.json({ message: 'Opportunity removed successfully' });
  } catch (error) {
    res.status(500).json({ message: 'Server error' });
  }
});

// POST /api/admin/alerts/broadcast - Send system alert notifications
router.post('/alerts/broadcast', protect, adminOnly, async (req, res) => {
  try {
    const title = (req.body?.title || '').toString().trim();
    const message = (req.body?.message || '').toString().trim();
    const targetRole = (req.body?.targetRole || 'all').toString().trim();
    const userIds = Array.isArray(req.body?.userIds) ? req.body.userIds : [];

    if (!title) return res.status(400).json({ message: 'Title is required' });
    if (!message) return res.status(400).json({ message: 'Message is required' });

    const userQuery = {};
    if (targetRole && targetRole !== 'all' && ['user', 'volunteer', 'admin'].includes(targetRole)) {
      userQuery.role = targetRole;
    }
    if (userIds.length) {
      userQuery._id = { $in: userIds.filter((id) => mongoose.Types.ObjectId.isValid(id)) };
    }

    const recipients = await User.find(userQuery).select('_id name').lean();
    if (!recipients.length) {
      return res.status(404).json({ message: 'No recipients matched the alert audience' });
    }

    await Promise.all(
      recipients.map((u) =>
        createNotification({
          user_id: u._id,
          type: 'system:alert',
          title,
          message,
          ref_id: null,
          ref_model: null,
        })
      )
    );

    await AdminLog.create({
      action: 'SYSTEM_ALERT_BROADCASTED',
      performedBy: req.user._id,
      details: `Broadcasted alert "${title}" to ${recipients.length} user(s)`,
    });

    res.json({
      message: 'System alert sent',
      recipients: recipients.length,
    });
  } catch (error) {
    console.error('POST /api/admin/alerts/broadcast error:', error);
    res.status(500).json({ message: error?.message || 'Server error' });
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

// GET /api/admin/reports/summary - Milestone 4 dashboard report summary
router.get('/reports/summary', protect, adminOnly, async (req, res) => {
  try {
    const [
      usersTotal,
      volunteersTotal,
      usersActive,
      opportunitiesTotal,
      opportunitiesActive,
      opportunitiesCompleted,
      applicationsTotal,
      applicationsAccepted,
      applicationsRejected,
      monthlyApplications,
    ] = await Promise.all([
      User.countDocuments({ role: 'user' }),
      User.countDocuments({ role: 'volunteer' }),
      User.countDocuments({ role: { $in: ['user', 'volunteer'] }, isSuspended: { $ne: true } }),
      Opportunity.countDocuments({ isDeleted: false }),
      Opportunity.countDocuments({ isDeleted: false, status: { $in: ['open', 'in-progress'] } }),
      Opportunity.countDocuments({ isDeleted: false, status: 'closed' }),
      Application.countDocuments(),
      Application.countDocuments({ status: 'accepted' }),
      Application.countDocuments({ status: 'rejected' }),
      Application.aggregate([
        {
          $group: {
            _id: { year: { $year: '$createdAt' }, month: { $month: '$createdAt' } },
            total: { $sum: 1 },
          },
        },
        { $sort: { '_id.year': 1, '_id.month': 1 } },
        { $limit: 12 },
      ]),
    ]);

    res.json({
      users: {
        registeredUsers: usersTotal,
        registeredVolunteers: volunteersTotal,
        activeUsers: usersActive,
      },
      opportunities: {
        total: opportunitiesTotal,
        active: opportunitiesActive,
        completed: opportunitiesCompleted,
      },
      applications: {
        total: applicationsTotal,
        accepted: applicationsAccepted,
        rejected: applicationsRejected,
        pending: Math.max(0, applicationsTotal - applicationsAccepted - applicationsRejected),
      },
      monthlyApplications,
    });
  } catch (error) {
    res.status(500).json({ message: 'Server error' });
  }
});

// GET /api/admin/reports/opportunities - Opportunity report with application stats
router.get('/reports/opportunities', protect, adminOnly, async (req, res) => {
  try {
    const opportunities = await Opportunity.find({ isDeleted: false })
      .populate('ngo_id', 'name email username')
      .sort({ createdAt: -1 })
      .lean();

    const oppIds = opportunities.map((o) => o._id);
    const appStats = await Application.aggregate([
      { $match: { opportunity_id: { $in: oppIds } } },
      {
        $group: {
          _id: '$opportunity_id',
          total: { $sum: 1 },
          accepted: { $sum: { $cond: [{ $eq: ['$status', 'accepted'] }, 1, 0] } },
          rejected: { $sum: { $cond: [{ $eq: ['$status', 'rejected'] }, 1, 0] } },
          pending: { $sum: { $cond: [{ $eq: ['$status', 'pending'] }, 1, 0] } },
        },
      },
    ]);

    const appStatsMap = new Map(appStats.map((x) => [String(x._id), x]));
    const data = opportunities.map((o) => {
      const s = appStatsMap.get(String(o._id)) || { total: 0, accepted: 0, rejected: 0, pending: 0 };
      return {
        ...o,
        applications: s,
      };
    });

    res.json(data);
  } catch (error) {
    res.status(500).json({ message: 'Server error' });
  }
});

// GET /api/admin/reports/applications - Application report with joined data
router.get('/reports/applications', protect, adminOnly, async (req, res) => {
  try {
    const status = (req.query.status || '').toString().trim();
    const search = (req.query.search || '').toString().trim();

    const query = {};
    if (status && ['pending', 'accepted', 'rejected'].includes(status)) {
      query.status = status;
    }

    let applications = await Application.find(query)
      .populate({
        path: 'opportunity_id',
        select: 'title status location isDeleted',
      })
      .populate('volunteer_id', 'name email username location skills')
      .sort({ createdAt: -1 })
      .lean();

    if (search) {
      const q = search.toLowerCase();
      applications = applications.filter((a) => {
        const oppTitle = (a.opportunity_id?.title || '').toLowerCase();
        const volunteerName = (a.volunteer_id?.name || '').toLowerCase();
        const volunteerEmail = (a.volunteer_id?.email || '').toLowerCase();
        return oppTitle.includes(q) || volunteerName.includes(q) || volunteerEmail.includes(q);
      });
    }

    res.json(applications);
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

// GET /api/admin/reports/illegal-dumps - Full illegal dump audit trail with proofs and points
router.get('/reports/illegal-dumps', protect, adminOnly, async (req, res) => {
  try {
    const dumps = await Pickup.find({ requestType: 'IllegalDump' })
      .populate('user_id', 'name email username')
      .populate('volunteer_id', 'name email username')
      .populate('approvedBy', 'name username')
      .sort({ createdAt: -1 })
      .lean();

    const pickupIds = dumps.map((d) => d._id);

    const [pickupLogs, pointTransactions] = await Promise.all([
      AdminLog.find({ pickup_id: { $in: pickupIds } })
        .populate('performedBy', 'name username role')
        .sort({ timestamp: 1 })
        .lean(),
      PointTransaction.find({ pickup_id: { $in: pickupIds } })
        .populate('user_id', 'name email username role')
        .sort({ createdAt: 1 })
        .lean(),
    ]);

    const logsByPickup = new Map();
    pickupLogs.forEach((log) => {
      const key = String(log.pickup_id);
      if (!logsByPickup.has(key)) logsByPickup.set(key, []);
      logsByPickup.get(key).push(log);
    });

    const pointsByPickup = new Map();
    pointTransactions.forEach((tx) => {
      const key = String(tx.pickup_id);
      if (!pointsByPickup.has(key)) pointsByPickup.set(key, []);
      pointsByPickup.get(key).push(tx);
    });

    const data = dumps.map((d) => ({
      ...d,
      auditLogs: logsByPickup.get(String(d._id)) || [],
      pointTransactions: pointsByPickup.get(String(d._id)) || [],
    }));

    res.json(data);
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
    const action = (req.query.action || '').toString().trim();
    const search = (req.query.search || '').toString().trim();
    const from = (req.query.from || '').toString().trim();
    const to = (req.query.to || '').toString().trim();

    const query = {};
    if (action) query.action = action;
    if (search) {
      query.$or = [
        { details: { $regex: search, $options: 'i' } },
      ];
    }
    if (from || to) {
      query.timestamp = {};
      if (from) {
        const d = new Date(from);
        if (!Number.isNaN(d.getTime())) query.timestamp.$gte = d;
      }
      if (to) {
        const d = new Date(to);
        if (!Number.isNaN(d.getTime())) {
          d.setHours(23, 59, 59, 999);
          query.timestamp.$lte = d;
        }
      }
      if (!Object.keys(query.timestamp).length) delete query.timestamp;
    }

    const logs = await AdminLog.find(query)
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

// GET /api/admin/points/users - list users with points for admin correction UI
router.get('/points/users', protect, adminOnly, async (req, res) => {
  try {
    const users = await User.find({ role: { $in: ['user', 'volunteer'] } })
      .select('name email role rewardPoints totalPointsEarned isSuspended')
      .sort({ rewardPoints: -1, createdAt: -1 })
      .lean();
    res.json(users);
  } catch (error) {
    res.status(500).json({ message: 'Server error' });
  }
});

// GET /api/admin/points/users/:id/history - points transactions for a specific user
router.get('/points/users/:id/history', protect, adminOnly, async (req, res) => {
  try {
    const user = await User.findById(req.params.id).select('name email role rewardPoints totalPointsEarned').lean();
    if (!user) return res.status(404).json({ message: 'User not found' });
    if (user.role === 'admin') return res.status(400).json({ message: 'Admin accounts do not use points' });

    const page = Math.max(1, parseInt(req.query.page, 10) || 1);
    const limit = Math.min(50, Math.max(1, parseInt(req.query.limit, 10) || 10));
    const skip = (page - 1) * limit;

    const search = (req.query.search || '').toString().trim();
    const source = (req.query.source || '').toString().trim();
    const from = (req.query.from || '').toString().trim();
    const to = (req.query.to || '').toString().trim();

    const query = { user_id: user._id };
    if (search) {
      const or = [
        { reason: { $regex: search, $options: 'i' } },
      ];
      if (mongoose.Types.ObjectId.isValid(search)) {
        or.push({ _id: new mongoose.Types.ObjectId(search) });
      }
      query.$or = or;
    }
    if (source) {
      query.source = source;
    }
    if (from || to) {
      query.createdAt = {};
      if (from) {
        const d = new Date(from);
        if (!Number.isNaN(d.getTime())) query.createdAt.$gte = d;
      }
      if (to) {
        const d = new Date(to);
        if (!Number.isNaN(d.getTime())) {
          d.setHours(23, 59, 59, 999);
          query.createdAt.$lte = d;
        }
      }
      if (!Object.keys(query.createdAt).length) delete query.createdAt;
    }

    const [items, total] = await Promise.all([
      PointTransaction.find(query)
        .populate('pickup_id', 'title requestType address')
        .populate('performedBy', 'name username email')
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit)
        .lean(),
      PointTransaction.countDocuments(query),
    ]);

    // Build balance-after map from full user ledger so each row can show current at that transaction.
    const allUserTx = await PointTransaction.find({ user_id: user._id })
      .select('_id points balanceAfter')
      .sort({ createdAt: -1, _id: -1 })
      .lean();

    const balanceAfterById = new Map();
    let cursor = Number(user.rewardPoints || 0);
    allUserTx.forEach((tx) => {
      const txId = String(tx._id);
      const storedBalance = Number.isFinite(tx.balanceAfter) ? tx.balanceAfter : null;
      const balanceAtThisTx = storedBalance ?? cursor;
      balanceAfterById.set(txId, balanceAtThisTx);
      cursor = balanceAtThisTx - Number(tx.points || 0);
    });

    const enrichedItems = items.map((tx) => ({
      ...tx,
      balanceAfter: balanceAfterById.has(String(tx._id))
        ? balanceAfterById.get(String(tx._id))
        : (Number.isFinite(tx.balanceAfter) ? tx.balanceAfter : null),
    }));

    res.json({
      user,
      items: enrichedItems,
      total,
      page,
      pages: Math.ceil(total / limit) || 1,
      limit,
    });
  } catch (error) {
    res.status(500).json({ message: 'Server error' });
  }
});

// GET /api/admin/points/logs - recent points adjustment logs with pagination
router.get('/points/logs', protect, adminOnly, async (req, res) => {
  try {
    const page = Math.max(1, parseInt(req.query.page, 10) || 1);
    const limit = Math.min(100, Math.max(1, parseInt(req.query.limit, 10) || 10));
    const skip = (page - 1) * limit;

    const search = (req.query.search || '').toString().trim();
    const from = (req.query.from || '').toString().trim();
    const to = (req.query.to || '').toString().trim();
    const recentDays = Math.max(1, parseInt(req.query.recentDays, 10) || 30);

    const query = { action: 'POINTS_ADJUSTED' };

    if (from || to) {
      query.timestamp = {};
      if (from) {
        const d = new Date(from);
        if (!Number.isNaN(d.getTime())) query.timestamp.$gte = d;
      }
      if (to) {
        const d = new Date(to);
        if (!Number.isNaN(d.getTime())) {
          d.setHours(23, 59, 59, 999);
          query.timestamp.$lte = d;
        }
      }
      if (!Object.keys(query.timestamp).length) delete query.timestamp;
    } else {
      const d = new Date();
      d.setDate(d.getDate() - recentDays);
      query.timestamp = { $gte: d };
    }

    if (search) {
      const matchingUsers = await User.find({
        $or: [
          { name: { $regex: search, $options: 'i' } },
          { username: { $regex: search, $options: 'i' } },
          { email: { $regex: search, $options: 'i' } },
        ],
      }).select('_id').lean();

      const userIds = matchingUsers.map((u) => u._id);

      query.$or = [
        { details: { $regex: search, $options: 'i' } },
      ];
      if (userIds.length) {
        query.$or.push({ user_id: { $in: userIds } });
        query.$or.push({ performedBy: { $in: userIds } });
      }
    }

    const [items, total] = await Promise.all([
      AdminLog.find(query)
        .populate('user_id', 'name username role email')
        .populate('performedBy', 'name username email')
        .sort({ timestamp: -1 })
        .skip(skip)
        .limit(limit)
        .lean(),
      AdminLog.countDocuments(query),
    ]);

    res.json({
      items,
      total,
      page,
      pages: Math.ceil(total / limit) || 1,
      limit,
      recentDaysApplied: from || to ? null : recentDays,
    });
  } catch (error) {
    res.status(500).json({ message: 'Server error' });
  }
});

// PUT /api/admin/points/users/:id/adjust - manual points correction
router.put('/points/users/:id/adjust', protect, adminOnly, async (req, res) => {
  try {
    const rawDelta = Number(req.body?.delta);
    const reason = (req.body?.reason || '').toString().trim();

    if (!Number.isFinite(rawDelta) || rawDelta === 0) {
      return res.status(400).json({ message: 'A non-zero numeric delta is required' });
    }
    if (!reason) {
      return res.status(400).json({ message: 'Reason is required for points adjustment' });
    }

    const user = await User.findById(req.params.id);
    if (!user) return res.status(404).json({ message: 'User not found' });
    if (user.role === 'admin') {
      return res.status(400).json({ message: 'Admin accounts do not use points' });
    }

    let appliedDelta = Math.trunc(rawDelta);
    if (appliedDelta < 0 && (user.rewardPoints || 0) + appliedDelta < 0) {
      appliedDelta = -(user.rewardPoints || 0);
    }
    if (appliedDelta === 0) {
      return res.status(400).json({ message: 'User has no points left to deduct' });
    }

    const beforePoints = user.rewardPoints || 0;
    const beforeTotalEarned = user.totalPointsEarned || 0;

    user.rewardPoints = beforePoints + appliedDelta;
    if (appliedDelta > 0) {
      user.totalPointsEarned = beforeTotalEarned + appliedDelta;
    }
    await user.save();

    const tx = await PointTransaction.create({
      user_id: user._id,
      points: appliedDelta,
      reason: `Admin adjustment: ${reason}`,
      source: 'system',
      performedBy: req.user._id,
      balanceAfter: user.rewardPoints,
    });

    await AdminLog.create({
      action: 'POINTS_ADJUSTED',
      user_id: user._id,
      performedBy: req.user._id,
      details: `Adjusted ${user.name} points by ${appliedDelta}. Before=${beforePoints}, After=${user.rewardPoints}, TotalEarnedBefore=${beforeTotalEarned}, TotalEarnedAfter=${user.totalPointsEarned}. TxID=${tx._id}. Reason: ${reason}`,
    });

    emitToUser(user._id, 'points:updated', {
      points: user.rewardPoints,
      delta: appliedDelta,
      source: 'system',
      reason: `Admin adjustment: ${reason}`,
    });

    res.json({
      message: 'Points adjusted successfully',
      user: {
        _id: user._id,
        name: user.name,
        rewardPoints: user.rewardPoints,
        totalPointsEarned: user.totalPointsEarned,
      },
      appliedDelta,
    });
  } catch (error) {
    res.status(500).json({ message: 'Server error' });
  }
});

module.exports = router;
