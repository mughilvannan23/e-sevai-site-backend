const mongoose = require('mongoose');

const workItemSchema = new mongoose.Schema({
  name: {
    type: String,
    required: [true, 'Work name is required'],
    trim: true
  },
  adminId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  },
  workCharge: {
    type: Number,
    required: [true, 'Work charge is required'],
    min: [0, 'Work charge must be positive']
  },
  serviceCharge: {
    type: Number,
    required: [true, 'Service charge is required'],
    min: [0, 'Service charge must be positive']
  },
  chargeType: {
    type: String,
    enum: ['None', 'GPay', 'Hand Cash', 'Recharge', 'AEPS'],
    default: 'None'
  },
  status: {
    type: Boolean,
    default: true
  },
  isActive: {
    type: Boolean,
    default: true
  },
  createdAt: {
    type: Date,
    default: Date.now
  }
});

workItemSchema.index({ adminId: 1 });

module.exports = mongoose.model('WorkItem', workItemSchema);
