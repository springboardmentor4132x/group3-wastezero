const express = require('express');
const router = express.Router();
const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');
const User = require('../models/User');
const AdminLog = require('../models/AdminLog');
const { protect } = require('../middleware/auth');
const { sendWelcomeEmail, sendPasswordResetOtp } = require('../config/email');

const generateToken = (id) => {
  return jwt.sign({ id }, process.env.JWT_SECRET, { expiresIn: '7d' });
};

// POST /api/auth/register
router.post('/register', async (req, res) => {
  try {
    const { name, email, username, password, role, skills, location, bio, phone } = req.body;

    if (!name || !email || !username || !password) {
      return res.status(400).json({ message: 'Please provide name, email, username and password' });
    }

    const emailExists = await User.findOne({ email });
    if (emailExists) return res.status(400).json({ message: 'Email already registered' });

    const usernameExists = await User.findOne({ username });
    if (usernameExists) return res.status(400).json({ message: 'Username already taken' });

    const allowedRoles = ['user', 'volunteer', 'admin'];
    const userRole = allowedRoles.includes(role) ? role : 'user';

    const user = await User.create({
      name,
      email,
      username,
      password,
      role: userRole,
      skills: skills || [],
      location: location || '',
      bio: bio || '',
      phone: phone || '',
    });

    await AdminLog.create({
      action: 'USER_REGISTERED',
      user_id: user._id,
      details: `${user.name} registered as ${user.role}`,
    });

    // Fire and forget welcome email – do not block registration if it fails
    if (process.env.SMTP_HOST) {
      sendWelcomeEmail(user).catch((err) => {
        console.error('Failed to send welcome email:', err?.message || err);
      });
    }

    res.status(201).json({
      _id: user._id,
      name: user.name,
      email: user.email,
      username: user.username,
      role: user.role,
      token: generateToken(user._id),
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: error.message || 'Server error' });
  }
});

// POST /api/auth/login
router.post('/login', async (req, res) => {
  try {
    const { username, password } = req.body;
    if (!username || !password) {
      return res.status(400).json({ message: 'Please provide username and password' });
    }

    const user = await User.findOne({ $or: [{ username }, { email: username }] });
    if (!user) return res.status(401).json({ message: 'Invalid credentials' });

    // Check suspension BEFORE bcrypt (bcrypt is slow ~100ms, no need to run it for suspended accounts)
    if (user.isSuspended) return res.status(403).json({ message: 'Account suspended. Contact admin.' });

    const isMatch = await user.matchPassword(password);
    if (!isMatch) return res.status(401).json({ message: 'Invalid credentials' });

    await AdminLog.create({ action: 'USER_LOGIN', user_id: user._id, details: `${user.name} logged in` });

    res.json({
      _id: user._id,
      name: user.name,
      email: user.email,
      username: user.username,
      role: user.role,
      location: user.location,
      skills: user.skills,
      bio: user.bio,
      phone: user.phone,
      wasteStats: user.wasteStats,
      token: generateToken(user._id),
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Server error' });
  }
});

// GET /api/auth/me
router.get('/me', protect, async (req, res) => {
  try {
    const user = await User.findById(req.user._id).select('-password');
    res.json(user);
  } catch (error) {
    res.status(500).json({ message: 'Server error' });
  }
});

// POST /api/auth/forgot-password — request OTP
router.post('/forgot-password', async (req, res) => {
  try {
    const { email } = req.body;
    if (!email) {
      return res.status(400).json({ message: 'Email is required' });
    }

    const user = await User.findOne({ email });

    // Always respond with generic message to avoid user enumeration
    const genericMessage =
      'If that email is registered, we have sent a 6-digit code to reset your password.';

    if (!user) {
      return res.status(200).json({ message: genericMessage });
    }

    const otp = Math.floor(100000 + Math.random() * 900000).toString(); // 6 digits
    const otpHash = await bcrypt.hash(otp, 10);

    user.resetPasswordOtp = otpHash;
    user.resetPasswordOtpExpires = Date.now() + 10 * 60 * 1000; // 10 minutes
    user.resetPasswordOtpAttempts = 0;
    await user.save();

    if (process.env.SMTP_HOST) {
      sendPasswordResetOtp(user, otp).catch((err) => {
        console.error('Failed to send reset OTP email:', err?.message || err);
      });
    }

    res.status(200).json({ message: genericMessage });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Server error' });
  }
});

// POST /api/auth/reset-password — verify OTP and change password
router.post('/reset-password', async (req, res) => {
  try {
    const { email, otp, newPassword } = req.body;
    if (!email || !otp || !newPassword) {
      return res.status(400).json({ message: 'Email, OTP and new password are required' });
    }
    if (newPassword.length < 6) {
      return res.status(400).json({ message: 'Password must be at least 6 characters.' });
    }

    const user = await User.findOne({ email });
    if (!user || !user.resetPasswordOtp || !user.resetPasswordOtpExpires) {
      return res.status(400).json({ message: 'Invalid OTP or email. Please request a new code.' });
    }

    if (user.resetPasswordOtpExpires.getTime() < Date.now()) {
      user.resetPasswordOtp = undefined;
      user.resetPasswordOtpExpires = undefined;
      user.resetPasswordOtpAttempts = 0;
      await user.save();
      return res.status(400).json({ message: 'OTP expired. Please request a new code.' });
    }

    if (user.resetPasswordOtpAttempts >= 5) {
      return res
        .status(400)
        .json({ message: 'Too many invalid attempts. Please request a new code.' });
    }

    const isMatch = await bcrypt.compare(otp, user.resetPasswordOtp);
    if (!isMatch) {
      user.resetPasswordOtpAttempts = (user.resetPasswordOtpAttempts || 0) + 1;
      await user.save();
      return res.status(400).json({ message: 'Invalid OTP. Please try again.' });
    }

    // OTP ok — update password and clear reset fields
    user.password = newPassword;
    user.resetPasswordOtp = undefined;
    user.resetPasswordOtpExpires = undefined;
    user.resetPasswordOtpAttempts = 0;
    await user.save();

    return res.json({ message: 'Password reset successful. You can now log in with your new password.' });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Server error' });
  }
});

module.exports = router;
