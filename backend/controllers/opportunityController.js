const Opportunity = require('../models/Opportunity');
const Application = require('../models/Application');
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

// ── POST   Create opportunity (admin only) ────────────────────────────────
exports.createOpportunity = async (req, res) => {
  try {
    const { title, description, requiredSkills, duration, location } = req.body;

    // Validate required fields
    const errors = [];
    if (!title || !title.trim()) errors.push('Title is required');
    if (!description || !description.trim()) errors.push('Description is required');
    if (!Array.isArray(requiredSkills) || requiredSkills.length === 0)
      errors.push('At least one required skill must be provided');
    if (!duration || !duration.trim()) errors.push('Duration is required');
    if (!location || !location.trim()) errors.push('Location is required');
    if (errors.length) return errorResponse(res, 400, 'Validation failed', errors);

    // Clean skills array (trim & remove blanks)
    const cleanSkills = requiredSkills
      .map((s) => (typeof s === 'string' ? s.trim() : ''))
      .filter(Boolean);
    if (cleanSkills.length === 0)
      return errorResponse(res, 400, 'At least one non-empty skill is required');

    const opportunity = await Opportunity.create({
      title: title.trim(),
      description: description.trim(),
      requiredSkills: cleanSkills,
      duration: duration.trim(),
      location: location.trim(),
      status: 'open',
      ngo_id: req.user._id,
    });

    await AdminLog.create({
      action: 'OPPORTUNITY_CREATED',
      user_id: req.user._id,
      details: `Opportunity "${opportunity.title}" created by ${req.user.name}`,
    });

    // Return populated summary
    const populated = await Opportunity.findById(opportunity._id)
      .populate('ngo_id', 'name email username')
      .lean();

    // ── Real-time: broadcast new opportunity to volunteers ──
    try {
      emitToRoom('role:volunteer', 'opportunity:created', populated);
    } catch (e) { console.error('Socket emit error:', e.message); }

    res.status(201).json(populated);
  } catch (error) {
    console.error('createOpportunity error:', error);
    return errorResponse(res, 500, error.message || 'Server error');
  }
};

// ── GET    List opportunities ─────────────────────────────────────────────
exports.listOpportunities = async (req, res) => {
  try {
    const page = Math.max(1, parseInt(req.query.page) || 1);
    const limit = Math.min(50, Math.max(1, parseInt(req.query.limit) || 12));
    const skip = (page - 1) * limit;

    // Build filter
    const filter = { isDeleted: false };

    // Volunteers see only open; admins see all statuses for their own opps
    if (req.user.role === 'volunteer' || req.user.role === 'user') {
      filter.status = 'open';
    } else if (req.user.role === 'admin') {
      // Optional: admin can filter by own opps with ?mine=true
      if (req.query.mine === 'true') {
        filter.ngo_id = req.user._id;
      }
      // Admin can include deleted if ?includeDeleted=true
      if (req.query.includeDeleted === 'true') {
        delete filter.isDeleted;
      }
      // Admin can filter by status
      if (req.query.status && ['open', 'in-progress', 'closed'].includes(req.query.status)) {
        filter.status = req.query.status;
      }
    }

    // Location filter
    if (req.query.location) {
      filter.location = { $regex: req.query.location, $options: 'i' };
    }

    // Skills filter — match any of the requested skills
    if (req.query.skills) {
      const skillsArr = req.query.skills
        .split(',')
        .map((s) => s.trim())
        .filter(Boolean);
      if (skillsArr.length) {
        filter.requiredSkills = { $in: skillsArr };
      }
    }

    const [opportunities, total] = await Promise.all([
      Opportunity.find(filter)
        .populate('ngo_id', 'name email username')
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit)
        .lean(),
      Opportunity.countDocuments(filter),
    ]);

    res.json({
      opportunities,
      total,
      page,
      pages: Math.ceil(total / limit),
    });
  } catch (error) {
    console.error('listOpportunities error:', error);
    return errorResponse(res, 500, error.message || 'Server error');
  }
};

// ── GET    Single opportunity ─────────────────────────────────────────────
exports.getOpportunity = async (req, res) => {
  try {
    const opp = await Opportunity.findById(req.params.id)
      .populate('ngo_id', 'name email username')
      .lean();

    if (!opp) return errorResponse(res, 404, 'Opportunity not found');

    // Volunteers should not see deleted opps
    if (opp.isDeleted && req.user.role !== 'admin') {
      return errorResponse(res, 404, 'Opportunity not found');
    }

    res.json(opp);
  } catch (error) {
    if (error.name === 'CastError')
      return errorResponse(res, 400, 'Invalid opportunity ID');
    return errorResponse(res, 500, error.message || 'Server error');
  }
};

// ── PUT    Update opportunity (admin & owner only) ────────────────────────
exports.updateOpportunity = async (req, res) => {
  try {
    const opp = await Opportunity.findById(req.params.id);
    if (!opp) return errorResponse(res, 404, 'Opportunity not found');
    if (opp.isDeleted) return errorResponse(res, 404, 'Opportunity not found');

    // Ownership check
    if (opp.ngo_id.toString() !== req.user._id.toString()) {
      return errorResponse(res, 403, 'Only the creator can edit this opportunity');
    }

    // Disallow changing ngo_id
    if (req.body.ngo_id && req.body.ngo_id !== opp.ngo_id.toString()) {
      return errorResponse(res, 400, 'Cannot change the creator reference');
    }

    // Validate editable fields
    const { title, description, requiredSkills, duration, location, status } = req.body;
    const errors = [];
    if (title !== undefined && (!title || !title.trim())) errors.push('Title cannot be empty');
    if (description !== undefined && (!description || !description.trim()))
      errors.push('Description cannot be empty');
    if (requiredSkills !== undefined) {
      if (!Array.isArray(requiredSkills) || requiredSkills.length === 0)
        errors.push('At least one skill is required');
    }
    if (duration !== undefined && (!duration || !duration.trim()))
      errors.push('Duration cannot be empty');
    if (location !== undefined && (!location || !location.trim()))
      errors.push('Location cannot be empty');
    if (status !== undefined && !['open', 'in-progress', 'closed'].includes(status))
      errors.push('Status must be open, in-progress, or closed');
    if (errors.length) return errorResponse(res, 400, 'Validation failed', errors);

    // Apply updates
    const updateFields = {};
    if (title) updateFields.title = title.trim();
    if (description) updateFields.description = description.trim();
    if (requiredSkills) {
      updateFields.requiredSkills = requiredSkills
        .map((s) => (typeof s === 'string' ? s.trim() : ''))
        .filter(Boolean);
    }
    if (duration) updateFields.duration = duration.trim();
    if (location) updateFields.location = location.trim();
    if (status) updateFields.status = status;

    const updated = await Opportunity.findByIdAndUpdate(
      req.params.id,
      { $set: updateFields },
      { new: true, runValidators: true }
    )
      .populate('ngo_id', 'name email username')
      .lean();

    await AdminLog.create({
      action: 'OPPORTUNITY_UPDATED',
      user_id: req.user._id,
      details: `Opportunity "${updated.title}" updated by ${req.user.name}`,
    });

    // ── Real-time: notify applicants of update ──
    try {
      emitToRoom(`opportunity:${updated._id}`, 'opportunity:updated', updated);
      emitToRoom('role:volunteer', 'opportunity:updated', updated);

      const applicants = await Application.find({ opportunity_id: updated._id })
        .select('volunteer_id').lean();
      for (const app of applicants) {
        await createNotification({
          user_id: app.volunteer_id,
          type: 'opportunity:updated',
          title: 'Opportunity Updated',
          message: `"${updated.title}" has been updated`,
          ref_id: updated._id,
          ref_model: 'Opportunity',
        });
      }
    } catch (e) { console.error('Socket/notif emit error:', e.message); }

    res.json(updated);
  } catch (error) {
    if (error.name === 'CastError')
      return errorResponse(res, 400, 'Invalid opportunity ID');
    return errorResponse(res, 500, error.message || 'Server error');
  }
};

// ── DELETE  Soft-delete opportunity (admin & owner only) ──────────────────
exports.deleteOpportunity = async (req, res) => {
  try {
    const opp = await Opportunity.findById(req.params.id);
    if (!opp) return errorResponse(res, 404, 'Opportunity not found');
    if (opp.isDeleted) return errorResponse(res, 404, 'Opportunity already deleted');

    // Ownership check
    if (opp.ngo_id.toString() !== req.user._id.toString()) {
      return errorResponse(res, 403, 'Only the creator can delete this opportunity');
    }

    opp.isDeleted = true;
    await opp.save();

    await AdminLog.create({
      action: 'OPPORTUNITY_DELETED',
      user_id: req.user._id,
      details: `Opportunity "${opp.title}" soft-deleted by ${req.user.name}`,
    });

    // ── Real-time: notify applicants of deletion ──
    try {
      emitToRoom(`opportunity:${opp._id}`, 'opportunity:deleted', { _id: opp._id });
      emitToRoom('role:volunteer', 'opportunity:deleted', { _id: opp._id });

      const applicants = await Application.find({ opportunity_id: opp._id })
        .select('volunteer_id').lean();
      for (const app of applicants) {
        await createNotification({
          user_id: app.volunteer_id,
          type: 'opportunity:deleted',
          title: 'Opportunity Removed',
          message: `"${opp.title}" is no longer available`,
          ref_id: opp._id,
          ref_model: 'Opportunity',
        });
      }
    } catch (e) { console.error('Socket/notif emit error:', e.message); }

    res.json({ message: 'Opportunity deleted successfully' });
  } catch (error) {
    if (error.name === 'CastError')
      return errorResponse(res, 400, 'Invalid opportunity ID');
    return errorResponse(res, 500, error.message || 'Server error');
  }
};
