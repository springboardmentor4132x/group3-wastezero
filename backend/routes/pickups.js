const express = require('express');
const router = express.Router();
const Pickup = require('../models/Pickup');
const User = require('../models/User');
const AdminLog = require('../models/AdminLog');
const { protect, volunteerOrAdmin } = require('../middleware/auth');

// POST /api/pickups - Create a pickup request (user only)
router.post('/', protect, async (req, res) => {
  try {
    if (req.user.role !== 'user') {
      return res.status(403).json({ message: 'Only users can create pickup requests' });
    }
    const { title, wasteType, description, estimatedQuantity, address, preferredDate, preferredTime, contactDetails, latitude, longitude } = req.body;
    if (!title || !wasteType || !estimatedQuantity || !address || !preferredDate || !preferredTime) {
      return res.status(400).json({ message: 'Please fill all required fields' });
    }
    
    let geometryData = undefined;
    if (latitude && longitude) {
      geometryData = {
        type: 'Point',
        coordinates: [parseFloat(longitude), parseFloat(latitude)]
      };
    }
    const pickup = await Pickup.create({
      title,
      user_id: req.user._id,
      wasteType,
      description: description || '',
      estimatedQuantity,
      address,
      preferredDate,
      preferredTime,
      contactDetails: contactDetails || '',
      status: 'Open',
      geometry: geometryData ? geometryData : undefined
    });

    // Auto-assign nearest volunteer if coordinates were provided
    if (geometryData) {
      const nearestVolunteer = await User.findOne({
        role: 'volunteer',
        isSuspended: false,
        geometry: {
          $near: {
            $geometry: geometryData
          }
        }
      });
      
      if (nearestVolunteer) {
        pickup.volunteer_id = nearestVolunteer._id;
        await pickup.save();
      }
    }
    await AdminLog.create({ action: 'PICKUP_CREATED', user_id: req.user._id, details: `Pickup "${title}" created by ${req.user.name}` });
    const populated = await Pickup.findById(pickup._id).populate('user_id', 'name email username phone');
    res.status(201).json(populated);
  } catch (error) {
    res.status(500).json({ message: error.message || 'Server error' });
  }
});

// GET /api/pickups/my - Get current user's pickups (user)
router.get('/my', protect, async (req, res) => {
  try {
    const page = Math.max(1, parseInt(req.query.page) || 1);
    const limit = Math.min(50, parseInt(req.query.limit) || 20);
    const skip = (page - 1) * limit;
    let query;
    if (req.user.role === 'user') {
      query = Pickup.find({ user_id: req.user._id })
        .populate('volunteer_id', 'name email username phone')
        .sort({ createdAt: -1 }).skip(skip).limit(limit).lean();
    } else if (req.user.role === 'volunteer') {
      query = Pickup.find({ volunteer_id: req.user._id })
        .populate('user_id', 'name email username phone')
        .sort({ createdAt: -1 }).skip(skip).limit(limit).lean();
    } else {
      query = Pickup.find()
        .populate('user_id', 'name email username')
        .populate('volunteer_id', 'name email username')
        .sort({ createdAt: -1 }).skip(skip).limit(limit).lean();
    }
    const pickups = await query;
    res.json(pickups);
  } catch (error) {
    res.status(500).json({ message: 'Server error' });
  }
});

// GET /api/pickups/opportunities - All Open pickups for volunteers (paginated)
router.get('/opportunities', protect, async (req, res) => {
  try {
    const page = Math.max(1, parseInt(req.query.page) || 1);
    const limit = Math.min(50, parseInt(req.query.limit) || 20);
    const skip = (page - 1) * limit;
    const [pickups, total] = await Promise.all([
      Pickup.find({ status: 'Open' })
        .populate('user_id', 'name email username phone location')
        .sort({ createdAt: -1 }).skip(skip).limit(limit).lean(),
      Pickup.countDocuments({ status: 'Open' }),
    ]);
    res.json({ pickups, total, page, pages: Math.ceil(total / limit) });
  } catch (error) {
    res.status(500).json({ message: 'Server error' });
  }
});

// GET /api/pickups/all - Admin: get all pickups (paginated)
router.get('/all', protect, async (req, res) => {
  try {
    if (req.user.role !== 'admin') return res.status(403).json({ message: 'Admin access required' });
    const page = Math.max(1, parseInt(req.query.page) || 1);
    const limit = Math.min(100, parseInt(req.query.limit) || 50);
    const skip = (page - 1) * limit;
    const [pickups, total] = await Promise.all([
      Pickup.find()
        .populate('user_id', 'name email username')
        .populate('volunteer_id', 'name email username')
        .sort({ createdAt: -1 }).skip(skip).limit(limit).lean(),
      Pickup.countDocuments(),
    ]);
    res.json({ pickups, total, page, pages: Math.ceil(total / limit) });
  } catch (error) {
    res.status(500).json({ message: 'Server error' });
  }
});

// GET /api/pickups/:id - Get single pickup
router.get('/:id', protect, async (req, res) => {
  try {
    const pickup = await Pickup.findById(req.params.id)
      .populate('user_id', 'name email username phone location')
      .populate('volunteer_id', 'name email username phone');
    if (!pickup) return res.status(404).json({ message: 'Pickup not found' });
    res.json(pickup);
  } catch (error) {
    res.status(500).json({ message: 'Server error' });
  }
});

// PUT /api/pickups/:id/accept - Volunteer accepts pickup
router.put('/:id/accept', protect, async (req, res) => {
  try {
    if (req.user.role !== 'volunteer') {
      return res.status(403).json({ message: 'Only volunteers can accept pickups' });
    }
    const pickup = await Pickup.findById(req.params.id);
    if (!pickup) return res.status(404).json({ message: 'Pickup not found' });
    if (pickup.status !== 'Open') return res.status(400).json({ message: 'Pickup is no longer available' });

    pickup.status = 'Accepted';
    pickup.volunteer_id = req.user._id;
    await pickup.save();

    await AdminLog.create({ action: 'PICKUP_ACCEPTED', user_id: req.user._id, details: `Pickup "${pickup.title}" accepted by ${req.user.name}` });

    const updated = await Pickup.findById(pickup._id)
      .populate('user_id', 'name email username phone')
      .populate('volunteer_id', 'name email username phone');
    res.json(updated);
  } catch (error) {
    res.status(500).json({ message: 'Server error' });
  }
});

// PUT /api/pickups/:id/complete - Volunteer marks as completed
router.put('/:id/complete', protect, async (req, res) => {
  try {
    if (req.user.role !== 'volunteer' && req.user.role !== 'admin') {
      return res.status(403).json({ message: 'Only volunteers can complete pickups' });
    }
    const pickup = await Pickup.findById(req.params.id);
    if (!pickup) return res.status(404).json({ message: 'Pickup not found' });
    if (pickup.status !== 'Accepted') return res.status(400).json({ message: 'Pickup must be accepted first' });

    pickup.status = 'Completed';
    pickup.completedAt = new Date();
    await pickup.save();

    // Update volunteer stats
    if (pickup.volunteer_id) {
      await User.findByIdAndUpdate(pickup.volunteer_id, { $inc: { totalPickupsCompleted: 1 } });
    }

    // Update user waste stats
    const wasteTypeMap = {
      Plastic: 'plastic', Organic: 'organic', 'E-Waste': 'eWaste',
      Metal: 'metal', Paper: 'paper', Glass: 'glass', Other: 'other'
    };
    const statKey = wasteTypeMap[pickup.wasteType] || 'other';
    const updateKey = `wasteStats.${statKey}`;
    await User.findByIdAndUpdate(pickup.user_id, { $inc: { [updateKey]: 1 } });

    await AdminLog.create({ action: 'PICKUP_COMPLETED', user_id: req.user._id, details: `Pickup "${pickup.title}" marked completed` });

    const updated = await Pickup.findById(pickup._id)
      .populate('user_id', 'name email username phone')
      .populate('volunteer_id', 'name email username phone');
    res.json(updated);
  } catch (error) {
    res.status(500).json({ message: error.message || 'Server error' });
  }
});

// PUT /api/pickups/:id/cancel - Cancel a pickup (user or admin)
router.put('/:id/cancel', protect, async (req, res) => {
  try {
    const pickup = await Pickup.findById(req.params.id);
    if (!pickup) return res.status(404).json({ message: 'Pickup not found' });

    if (req.user.role === 'user' && pickup.user_id.toString() !== req.user._id.toString()) {
      return res.status(403).json({ message: 'Not authorized' });
    }
    if (req.user.role === 'volunteer') return res.status(403).json({ message: 'Volunteers cannot cancel pickups' });

    pickup.status = 'Cancelled';
    await pickup.save();
    await AdminLog.create({ action: 'PICKUP_CANCELLED', user_id: req.user._id, details: `Pickup "${pickup.title}" cancelled` });
    res.json({ message: 'Pickup cancelled' });
  } catch (error) {
    res.status(500).json({ message: 'Server error' });
  }
});

// DELETE /api/pickups/:id - Admin deletes pickup
router.delete('/:id', protect, async (req, res) => {
  try {
    if (req.user.role !== 'admin') return res.status(403).json({ message: 'Admin access required' });
    const pickup = await Pickup.findByIdAndDelete(req.params.id);
    if (!pickup) return res.status(404).json({ message: 'Pickup not found' });
    await AdminLog.create({ action: 'PICKUP_DELETED', user_id: req.user._id, details: `Pickup "${pickup.title}" deleted by admin` });
    res.json({ message: 'Pickup deleted' });
  } catch (error) {
    res.status(500).json({ message: 'Server error' });
  }
});

module.exports = router;
