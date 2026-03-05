const Application = require('../models/Application');
const Opportunity = require('../models/Opportunity');
const User = require('../models/User');
const AdminLog = require('../models/AdminLog');
const { emitToUser, emitToRoom } = require('../socket');
const { createNotification } = require('./notificationController');

// ── Helper: standard error response ───────────────────────────────────────
const errorResponse = (res, status, message, details = null) => {
  const body = { error: true, message };
  if (details) body.details = details;
  return res.status(status).json(body);
};

// ── POST   Apply to opportunity (volunteer only) ─────────────────────────
exports.applyToOpportunity = async (req, res) => {
  try {
    const { opportunity_id } = req.body;

    if (!opportunity_id) {
      return errorResponse(res, 400, 'Opportunity ID is required');
    }

    // Verify opportunity exists, is open, and not deleted
    const opp = await Opportunity.findById(opportunity_id);
    if (!opp || opp.isDeleted) {
      return errorResponse(res, 404, 'Opportunity not found');
    }
    if (opp.status === 'closed') {
      return errorResponse(res, 400, 'Cannot apply to a closed opportunity');
    }
    if (opp.status !== 'open') {
      return errorResponse(res, 400, `Cannot apply to an opportunity with status "${opp.status}"`);
    }

    // Duplicate check
    const existing = await Application.findOne({
      opportunity_id,
      volunteer_id: req.user._id,
    });
    if (existing) {
      return errorResponse(res, 409, 'You have already applied to this opportunity');
    }

    const application = await Application.create({
      opportunity_id,
      volunteer_id: req.user._id,
      status: 'pending',
    });

    await AdminLog.create({
      action: 'APPLICATION_CREATED',
      user_id: req.user._id,
      details: `${req.user.name} applied to opportunity "${opp.title}"`,
    });

    // Return populated summary
    const populated = await Application.findById(application._id)
      .populate('opportunity_id', 'title status location duration')
      .populate('volunteer_id', 'name email username skills location')
      .lean();

    // ── Real-time: notify opportunity owner ──
    try {
      emitToUser(opp.ngo_id, 'application:created', populated);
      await createNotification({
        user_id: opp.ngo_id,
        type: 'application:created',
        title: 'New Application',
        message: `${req.user.name} applied to "${opp.title}"`,
        ref_id: application._id,
        ref_model: 'Application',
      });
    } catch (e) { console.error('Socket/notif emit error:', e.message); }

    res.status(201).json(populated);
  } catch (error) {
    if (error.code === 11000) {
      return errorResponse(res, 409, 'You have already applied to this opportunity');
    }
    if (error.name === 'CastError') {
      return errorResponse(res, 400, 'Invalid opportunity ID');
    }
    console.error('applyToOpportunity error:', error);
    return errorResponse(res, 500, error.message || 'Server error');
  }
};

// ── GET    List my applications (volunteer) ──────────────────────────────
exports.getMyApplications = async (req, res) => {
  try {
    const page = Math.max(1, parseInt(req.query.page) || 1);
    const limit = Math.min(50, Math.max(1, parseInt(req.query.limit) || 20));
    const skip = (page - 1) * limit;

    const filter = { volunteer_id: req.user._id };
    if (req.query.status && ['pending', 'accepted', 'rejected'].includes(req.query.status)) {
      filter.status = req.query.status;
    }

    const [applications, total] = await Promise.all([
      Application.find(filter)
        .populate({
          path: 'opportunity_id',
          select: 'title description requiredSkills duration location status ngo_id isDeleted',
          populate: { path: 'ngo_id', select: 'name email' },
        })
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit)
        .lean(),
      Application.countDocuments(filter),
    ]);

    res.json({ applications, total, page, pages: Math.ceil(total / limit) });
  } catch (error) {
    console.error('getMyApplications error:', error);
    return errorResponse(res, 500, error.message || 'Server error');
  }
};

// ── GET    List applications for an opportunity (admin & owner) ──────────
exports.listApplicationsForOpportunity = async (req, res) => {
  try {
    const opp = await Opportunity.findById(req.params.opportunityId);
    if (!opp) return errorResponse(res, 404, 'Opportunity not found');

    // Ownership check
    if (opp.ngo_id.toString() !== req.user._id.toString()) {
      return errorResponse(res, 403, 'Only the opportunity creator can view applications');
    }

    const page = Math.max(1, parseInt(req.query.page) || 1);
    const limit = Math.min(50, Math.max(1, parseInt(req.query.limit) || 20));
    const skip = (page - 1) * limit;

    const filter = { opportunity_id: req.params.opportunityId };
    if (req.query.status && ['pending', 'accepted', 'rejected'].includes(req.query.status)) {
      filter.status = req.query.status;
    }

    const [applications, total] = await Promise.all([
      Application.find(filter)
        .populate('volunteer_id', 'name email username skills location phone bio')
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit)
        .lean(),
      Application.countDocuments(filter),
    ]);

    res.json({
      opportunity: {
        _id: opp._id,
        title: opp.title,
        status: opp.status,
      },
      applications,
      total,
      page,
      pages: Math.ceil(total / limit),
    });
  } catch (error) {
    if (error.name === 'CastError')
      return errorResponse(res, 400, 'Invalid opportunity ID');
    console.error('listApplicationsForOpportunity error:', error);
    return errorResponse(res, 500, error.message || 'Server error');
  }
};

// ── PUT    Accept / Reject application (admin & owner) ───────────────────
exports.decideApplication = async (req, res) => {
  try {
    const { decision } = req.body; // 'accepted' or 'rejected'
    if (!decision || !['accepted', 'rejected'].includes(decision)) {
      return errorResponse(res, 400, 'Decision must be "accepted" or "rejected"');
    }

    const application = await Application.findById(req.params.applicationId);
    if (!application) return errorResponse(res, 404, 'Application not found');

    // Verify opportunity ownership
    const opp = await Opportunity.findById(application.opportunity_id);
    if (!opp) return errorResponse(res, 404, 'Associated opportunity not found');
    if (opp.ngo_id.toString() !== req.user._id.toString()) {
      return errorResponse(res, 403, 'Only the opportunity creator can manage applications');
    }

    // Cannot decide on already decided application
    if (application.status !== 'pending') {
      return errorResponse(res, 400, `Application already ${application.status}`);
    }

    application.status = decision;
    await application.save();

    // If accepted, optionally move opportunity to in-progress
    if (decision === 'accepted' && opp.status === 'open') {
      opp.status = 'in-progress';
      await opp.save();
    }

    await AdminLog.create({
      action: `APPLICATION_${decision.toUpperCase()}`,
      user_id: req.user._id,
      details: `Application for "${opp.title}" ${decision} by ${req.user.name}`,
    });

    const populated = await Application.findById(application._id)
      .populate('volunteer_id', 'name email username skills location')
      .populate('opportunity_id', 'title status location')
      .lean();

    // ── Real-time: notify volunteer of decision ──
    try {
      const volunteerId = application.volunteer_id.toString();
      emitToUser(volunteerId, 'application:updated', populated);
      await createNotification({
        user_id: volunteerId,
        type: decision === 'accepted' ? 'application:accepted' : 'application:rejected',
        title: decision === 'accepted' ? 'Application Accepted!' : 'Application Rejected',
        message: `Your application for "${opp.title}" was ${decision}`,
        ref_id: application._id,
        ref_model: 'Application',
      });

      // If opportunity status changed, notify all applicants
      if (decision === 'accepted' && opp.status === 'open') {
        emitToRoom(`opportunity:${opp._id}`, 'opportunity:updated', {
          _id: opp._id, status: 'in-progress',
        });
      }
    } catch (e) { console.error('Socket/notif emit error:', e.message); }

    res.json(populated);
  } catch (error) {
    if (error.name === 'CastError')
      return errorResponse(res, 400, 'Invalid application ID');
    console.error('decideApplication error:', error);
    return errorResponse(res, 500, error.message || 'Server error');
  }
};
