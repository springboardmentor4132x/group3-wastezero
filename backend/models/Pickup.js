const mongoose = require('mongoose');

const pickupSchema = new mongoose.Schema({
  title: {
    type: String,
    required: [true, 'Title is required'],
    trim: true,
  },
  user_id: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
  },
  volunteer_id: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    default: null,
  },
  wasteType: {
    type: String,
    enum: ['Plastic', 'Organic', 'E-Waste', 'Metal', 'Paper', 'Glass', 'Other'],
    required: [true, 'Waste type is required'],
  },
  description: {
    type: String,
    default: '',
  },
  estimatedQuantity: {
    type: String,
    required: [true, 'Estimated quantity is required'],
  },
  address: {
    type: String,
    required: [true, 'Pickup address is required'],
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
  preferredDate: {
    type: Date,
    required: [true, 'Preferred pickup date is required'],
  },
  preferredTime: {
    type: String,
    required: [true, 'Preferred pickup time is required'],
  },
  contactDetails: {
    type: String,
    default: '',
  },
  status: {
    type: String,
    enum: ['Open', 'Accepted', 'Completed', 'Cancelled'],
    default: 'Open',
  },
  completedAt: {
    type: Date,
    default: null,
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

pickupSchema.pre('save', function (next) {
  this.updatedAt = Date.now();
  next();
});

// Indexes for common query patterns
pickupSchema.index({ status: 1, createdAt: -1 });          // opportunities list
pickupSchema.index({ user_id: 1, createdAt: -1 });          // user's own pickups
pickupSchema.index({ volunteer_id: 1, createdAt: -1 });     // volunteer's pickups
pickupSchema.index({ status: 1, volunteer_id: 1 });         // volunteer stats
pickupSchema.index({ status: 1, wasteType: 1 });            // waste aggregation
pickupSchema.index({ geometry: '2dsphere' });               // spatial queries

module.exports = mongoose.model('Pickup', pickupSchema);
