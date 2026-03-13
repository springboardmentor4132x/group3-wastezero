const mongoose = require('mongoose');

const opportunitySchema = new mongoose.Schema({
  title: {
    type: String,
    required: [true, 'Title is required'],
    trim: true,
    maxlength: [200, 'Title cannot exceed 200 characters'],
  },
  description: {
    type: String,
    required: [true, 'Description is required'],
    trim: true,
    maxlength: [2000, 'Description cannot exceed 2000 characters'],
  },
  requiredSkills: {
    type: [String],
    required: [true, 'At least one skill is required'],
    validate: {
      validator: (v) => Array.isArray(v) && v.length > 0,
      message: 'At least one required skill must be provided',
    },
  },
  duration: {
    type: String,
    required: [true, 'Duration is required'],
    trim: true,
  },
  location: {
    type: String,
    required: [true, 'Location is required'],
    trim: true,
  },
  imageUrl: {
    type: String,
    default: null,
  },
  imagePublicId: {
    type: String,
    default: null,
  },
  status: {
    type: String,
    enum: ['open', 'in-progress', 'closed'],
    default: 'open',
  },
  ngo_id: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: [true, 'Creator (NGO/Admin) reference is required'],
    immutable: true,
  },
  isDeleted: {
    type: Boolean,
    default: false,
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

// Auto-update updatedAt on save
opportunitySchema.pre('save', function (next) {
  this.updatedAt = Date.now();
  next();
});

// Auto-update updatedAt on findOneAndUpdate
opportunitySchema.pre('findOneAndUpdate', function (next) {
  this.set({ updatedAt: Date.now() });
  next();
});

// Indexes for efficient queries
opportunitySchema.index({ status: 1, isDeleted: 1, createdAt: -1 });   // volunteer listing
opportunitySchema.index({ ngo_id: 1, isDeleted: 1, createdAt: -1 });   // admin's own opps
opportunitySchema.index({ location: 1 });                               // location filter
opportunitySchema.index({ requiredSkills: 1 });                         // skills filter
opportunitySchema.index({ status: 1, isDeleted: 1, location: 1 });     // combined filter

module.exports = mongoose.model('Opportunity', opportunitySchema);
