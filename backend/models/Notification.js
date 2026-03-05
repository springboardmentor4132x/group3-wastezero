const mongoose = require('mongoose');

const notificationSchema = new mongoose.Schema({
  user_id: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: [true, 'Target user is required'],
    index: true,
  },
  type: {
    type: String,
    enum: [
      'application:created',
      'application:accepted',
      'application:rejected',
      'opportunity:updated',
      'opportunity:deleted',
      'chat:message',
      'pickup:accepted',
      'pickup:completed',
      'system',
    ],
    required: true,
  },
  title: {
    type: String,
    required: true,
    trim: true,
    maxlength: 200,
  },
  message: {
    type: String,
    required: true,
    trim: true,
    maxlength: 500,
  },
  /** Reference to related entity (opportunity, application, etc.) */
  ref_id: {
    type: mongoose.Schema.Types.ObjectId,
    default: null,
  },
  /** Which model the ref_id points to */
  ref_model: {
    type: String,
    enum: ['Opportunity', 'Application', 'Pickup', 'Message', null],
    default: null,
  },
  isRead: {
    type: Boolean,
    default: false,
  },
  createdAt: {
    type: Date,
    default: Date.now,
  },
});

// Compound index for efficient queries
notificationSchema.index({ user_id: 1, isRead: 1, createdAt: -1 });
notificationSchema.index({ user_id: 1, createdAt: -1 });

module.exports = mongoose.model('Notification', notificationSchema);
