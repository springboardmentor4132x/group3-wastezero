const express = require('express');
const router = express.Router();
const jwt = require('jsonwebtoken');
const User = require('../models/User');
const AdminLog = require('../models/AdminLog');
const { protect } = require('../middleware/auth');
const nodemailer = require('nodemailer');

// ── Email Configuration ─────────────────────────────────────────────────
const transporter = nodemailer.createTransport({
  service: 'gmail',
  auth: {
    user: process.env.EMAIL_USER, // Set this in your .env file
    pass: process.env.EMAIL_PASS  // Set your 16-char App Password in .env
  }
});

const sendWelcomeEmail = async (userEmail, userName, verificationToken) => {
  const mailOptions = {
   from: `"WasteZero Platform" <${process.env.EMAIL_USER}>`,
    to: userEmail,
    subject: 'Welcome to WasteZero - Verify Your Account',
    html: `
      <div style="font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; max-width: 600px; margin: 0 auto; background-color: #f9fbf9; border-radius: 8px; overflow: hidden; border: 1px solid #e0e0e0;">
        <div style="background-color: #2e7d32; padding: 30px; text-align: center;">
          <h1 style="color: #ffffff; margin: 0; font-size: 28px; letter-spacing: 1px;">WasteZero</h1>
          <p style="color: #c8e6c9; margin: 10px 0 0 0; font-size: 16px;">Join the Recycling Revolution</p>
        </div>
        <div style="padding: 40px 30px; background-color: #ffffff;">
          <h2 style="color: #333333; font-size: 22px; margin-top: 0;">Hello, ${userName}!</h2>
          <p style="color: #555555; font-size: 16px; line-height: 1.6;">
            Thank you for registering with WasteZero. We are thrilled to have you join our community dedicated to smart waste management.
          </p>
          <p style="color: #555555; font-size: 16px; line-height: 1.6;">
            To ensure the security of your account, please verify your email address by using the secure code below:
          </p>
          <div style="text-align: center; margin: 35px 0;">
            <div style="display: inline-block; background-color: #f1f8e9; border: 2px dashed #4caf50; padding: 15px 40px; border-radius: 8px;">
              <span style="font-size: 32px; font-weight: bold; color: #2e7d32; letter-spacing: 5px;">${verificationToken}</span>
            </div>
            <p style="color: #888888; font-size: 12px; margin-top: 10px;">This code will expire in 15 minutes.</p>
          </div>
          <p style="color: #555555; font-size: 16px; line-height: 1.6;">If you did not request this registration, please safely ignore this email.</p>
        </div>
        <div style="background-color: #eeeeee; padding: 20px; text-align: center; color: #777777; font-size: 12px;">
          <p style="margin: 0;">© ${new Date().getFullYear()} WasteZero Platform. All rights reserved.</p>
        </div>
      </div>
    `
  };
  await transporter.sendMail(mailOptions);
};

const generateToken = (id) => {
  return jwt.sign({ id }, process.env.JWT_SECRET, { expiresIn: '7d' });
};

// ── POST /api/auth/register ─────────────────────────────────────────────────
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

    // Generate a 6-digit OTP
    const otp = Math.floor(100000 + Math.random() * 900000).toString();

    const user = await User.create({
      name, email, username, password,
      role: userRole,
      skills: skills || [],
      location: location || '',
      bio: bio || '',
      phone: phone || '',
      isVerified: false, // User cannot log in yet
      verificationToken: otp
    });

    await AdminLog.create({ action: 'USER_REGISTERED', user_id: user._id, details: `${user.name} registered as ${user.role} (Unverified)` });

    // Send the email
    await sendWelcomeEmail(user.email, user.name, otp);

    // Notice we do NOT send the token back here anymore. We force them to verify.
    res.status(201).json({
      message: 'Registration successful! Please check your email for the OTP.',
      requiresVerification: true,
      email: user.email
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: error.message || 'Server error' });
  }
});

// ── NEW: POST /api/auth/verify-otp ──────────────────────────────────────────
router.post('/verify-otp', async (req, res) => {
  try {
    const { email, otp } = req.body;
    
    if (!email || !otp) return res.status(400).json({ message: 'Email and OTP are required' });

    const user = await User.findOne({ email });
    if (!user) return res.status(404).json({ message: 'User not found' });

    if (user.isVerified) return res.status(400).json({ message: 'Account is already verified' });

    // FIX: Convert both to strings and trim any hidden spaces from copy-pasting!
    const cleanDbOtp = String(user.verificationToken).trim();
    const cleanInputOtp = String(otp).trim();

    if (cleanDbOtp !== cleanInputOtp) {
      return res.status(400).json({ message: 'Invalid or expired OTP' });
    }

    // Mark user as verified and clear the token
    user.isVerified = true;
    user.verificationToken = undefined;
    await user.save();

    await AdminLog.create({ action: 'USER_VERIFIED', user_id: user._id, details: `${user.name} verified their email.` });

    // Now they get the token to enter the dashboard!
    res.json({
      _id: user._id,
      name: user.name,
      email: user.email,
      username: user.username,
      role: user.role,
      token: generateToken(user._id),
    });

  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Server error' });
  }
});

// ── POST /api/auth/login ─────────────────────────────────────────────────
router.post('/login', async (req, res) => {
  try {
    const { username, password } = req.body;
    if (!username || !password) {
      return res.status(400).json({ message: 'Please provide username and password' });
    }

    const user = await User.findOne({ $or: [{ username }, { email: username }] });
    if (!user) return res.status(401).json({ message: 'Invalid credentials' });

    // Block fake/unverified emails from logging in
    if (!user.isVerified) {
      return res.status(403).json({ 
        message: 'Please verify your email address to log in.',
        requiresVerification: true,
        email: user.email 
      });
    }

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

// ── GET /api/auth/me ─────────────────────────────────────────────────
router.get('/me', protect, async (req, res) => {
  try {
    const user = await User.findById(req.user._id).select('-password');
    res.json(user);
  } catch (error) {
    res.status(500).json({ message: 'Server error' });
  }
});

module.exports = router;