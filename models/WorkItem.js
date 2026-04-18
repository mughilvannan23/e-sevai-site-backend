const mongoose = require('mongoose');

const workItemSchema = new mongoose.Schema({
  name: {
    type: String,
    required: [true, 'Work name is required'],
    trim: true,
    unique: true
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
  isActive: {
    type: Boolean,
    default: true
  },
  createdAt: {
    type: Date,
    default: Date.now
  }
});

module.exports = mongoose.model('WorkItem', workItemSchema);
