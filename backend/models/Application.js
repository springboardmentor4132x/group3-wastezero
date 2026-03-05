const mongoose = require('mongoose');

const applicationSchema = new mongoose.Schema({
  opportunity_id: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Opportunity',
    required: [true, 'Opportunity reference is required'],
  },
  volunteer_id: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: [true, 'Volunteer reference is required'],
  },
  status: {
    type: String,
    enum: ['pending', 'accepted', 'rejected'],
    default: 'pending',
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
applicationSchema.pre('save', function (next) {
  this.updatedAt = Date.now();
  next();
});

applicationSchema.pre('findOneAndUpdate', function (next) {
  this.set({ updatedAt: Date.now() });
  next();
});

// Prevent duplicate applications (unique compound index)
applicationSchema.index({ opportunity_id: 1, volunteer_id: 1 }, { unique: true });

// Indexes for efficient queries
applicationSchema.index({ opportunity_id: 1, status: 1 });          // admin list apps for opp
applicationSchema.index({ volunteer_id: 1, createdAt: -1 });        // volunteer's applications
applicationSchema.index({ status: 1 });                              // status filter

module.exports = mongoose.model('Application', applicationSchema);
