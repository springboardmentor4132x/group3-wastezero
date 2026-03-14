const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');

const userSchema = new mongoose.Schema({
  name: {
    type: String,
    required: [true, 'Name is required'],
    trim: true,
  },
  email: {
    type: String,
    required: [true, 'Email is required'],
    unique: true,
    lowercase: true,
    trim: true,
  },
  username: {
    type: String,
    required: [true, 'Username is required'],
    unique: true,
    trim: true,
  },
  password: {
    type: String,
    required: [true, 'Password is required'],
    minlength: 6,
  },
  role: {
    type: String,
    enum: ['user', 'volunteer', 'admin'],
    default: 'user',
  },
  skills: {
    type: [String],
    default: [],
  },
  location: {
    type: String,
    default: '',
  },
  // Add these right below your password or role field in models/User.js
  isVerified: { 
    type: Boolean, 
    default: false 
  },
  verificationToken: { 
    type: String 
  },
  geometry: {
    type: {
      type: String,
      enum: ['Point'],
      default: 'Point',
    },
    coordinates: {
      type: [Number],
      default: [0, 0], // [longitude, latitude]
    },
  },
  bio: {
    type: String,
    default: '',
  },
  phone: {
    type: String,
    default: '',
  },
  isActive: {
    type: Boolean,
    default: true,
  },
  isSuspended: {
    type: Boolean,
    default: false,
  },
  totalPickupsCompleted: {
    type: Number,
    default: 0,
  },
  wasteStats: {
    plastic: { type: Number, default: 0 },
    organic: { type: Number, default: 0 },
    eWaste: { type: Number, default: 0 },
    metal: { type: Number, default: 0 },
    paper: { type: Number, default: 0 },
    glass: { type: Number, default: 0 },
    other: { type: Number, default: 0 },
  },
  createdAt: {
    type: Date,
    default: Date.now,
  },
  updatedAt: {
    type: Date,
    default: Date.now,
  },
});

// Hash password before saving
userSchema.pre('save', async function (next) {
  if (!this.isModified('password')) return next();
  const salt = await bcrypt.genSalt(10);
  this.password = await bcrypt.hash(this.password, salt);
  this.updatedAt = Date.now();
  next();
});

// Compare password
userSchema.methods.matchPassword = async function (enteredPassword) {
  return await bcrypt.compare(enteredPassword, this.password);
};

// Index for role-based queries (admin stats, volunteer lookups)
userSchema.index({ role: 1 });
userSchema.index({ role: 1, createdAt: -1 });
userSchema.index({ isSuspended: 1, role: 1 });
userSchema.index({ geometry: '2dsphere' });

module.exports = mongoose.model('User', userSchema);
