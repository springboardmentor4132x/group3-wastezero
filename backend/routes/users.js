const express = require('express');
const router = express.Router();
const User = require('../models/User');
const Pickup = require('../models/Pickup');
const bcrypt = require('bcrypt'); // ADDED: We need this to hash the new password safely
const { protect } = require('../middleware/auth');

// GET /api/users/profile - Get own profile
router.get('/profile', protect, async (req, res) => {
  try {
    const user = await User.findById(req.user._id).select('-password');
    res.json(user);
  } catch (error) {
    res.status(500).json({ message: 'Server error' });
  }
});

// PUT /api/users/profile - Update own profile
router.put('/profile', protect, async (req, res) => {
  try {
    const { name, email, location, skills, bio, phone, latitude, longitude } = req.body;
    const user = await User.findById(req.user._id);
    if (!user) return res.status(404).json({ message: 'User not found' });

    if (name) user.name = name;
    if (email) {
      const emailExists = await User.findOne({ email, _id: { $ne: user._id } });
      if (emailExists) return res.status(400).json({ message: 'Email already in use' });
      user.email = email;
    }
    if (location !== undefined) user.location = location;
    if (skills !== undefined) user.skills = skills;
    if (bio !== undefined) user.bio = bio;
    if (phone !== undefined) user.phone = phone;

    if (latitude !== undefined && longitude !== undefined) {
      user.geometry = {
        type: 'Point',
        coordinates: [parseFloat(longitude), parseFloat(latitude)]
      };
    }

    await user.save();
    const updated = await User.findById(user._id).select('-password');
    res.json(updated);
  } catch (error) {
    res.status(500).json({ message: error.message || 'Server error' });
  }
});

// PUT /api/users/change-password
router.put('/change-password', protect, async (req, res) => {
  try {
    const { currentPassword, newPassword } = req.body;
    if (!currentPassword || !newPassword) {
      return res.status(400).json({ message: 'Both current and new password are required' });
    }

    // NEW: Enforce the exact same strong password rules here as on the frontend!
    const passwordRegex = /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[@$!%*?&])[A-Za-z\d@$!%*?&]{8,}$/;
    if (!passwordRegex.test(newPassword)) {
      return res.status(400).json({ message: 'New password does not meet security requirements.' });
    }

    const user = await User.findById(req.user._id);
    const isMatch = await user.matchPassword(currentPassword);
    if (!isMatch) return res.status(400).json({ message: 'Current password is incorrect' });

    // FIX: Safely hash the new password before saving!
    const salt = await bcrypt.genSalt(10);
    user.password = await bcrypt.hash(newPassword, salt);
    
    await user.save();
    res.json({ message: 'Password updated successfully' });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Server error' });
  }
});

// GET /api/users/stats - Get own dashboard stats
router.get('/stats', protect, async (req, res) => {
  try {
    const userId = req.user._id;
    const role = req.user.role;

    if (role === 'user') {
      const total = await Pickup.countDocuments({ user_id: userId });
      const completed = await Pickup.countDocuments({ user_id: userId, status: 'Completed' });
      const pending = await Pickup.countDocuments({ user_id: userId, status: { $in: ['Open', 'Accepted'] } });
      const user = await User.findById(userId).select('wasteStats name');
      res.json({ total, completed, pending, wasteStats: user.wasteStats, name: user.name });
    } else if (role === 'volunteer') {
      const available = await Pickup.countDocuments({ status: 'Open' });
      const accepted = await Pickup.countDocuments({ volunteer_id: userId, status: 'Accepted' });
      const completed = await Pickup.countDocuments({ volunteer_id: userId, status: 'Completed' });
      const user = await User.findById(userId).select('name');
      res.json({ available, accepted, completed, name: user.name });
    } else {
      res.status(403).json({ message: 'Use admin stats endpoint' });
    }
  } catch (error) {
    res.status(500).json({ message: 'Server error' });
  }
});

// GET /api/users/volunteers - List volunteers (admin use)
router.get('/volunteers', protect, async (req, res) => {
  try {
    const volunteers = await User.find({ role: 'volunteer' }).select('-password');
    res.json(volunteers);
  } catch (error) {
    res.status(500).json({ message: 'Server error' });
  }
});

module.exports = router;