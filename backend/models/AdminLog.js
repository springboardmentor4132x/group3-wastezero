const mongoose = require('mongoose');

const adminLogSchema = new mongoose.Schema({
  action: {
    type: String,
    required: true,
  },
  user_id: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    default: null,
  },
  performedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    default: null,
  },
  details: {
    type: String,
    default: '',
  },
  timestamp: {
    type: Date,
    default: Date.now,
  },
});

// Index for sorted log queries
adminLogSchema.index({ timestamp: -1 });
adminLogSchema.index({ user_id: 1, timestamp: -1 });

module.exports = mongoose.model('AdminLog', adminLogSchema);
