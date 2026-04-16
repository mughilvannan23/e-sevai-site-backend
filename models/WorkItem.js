const mongoose = require('mongoose');

const workItemSchema = new mongoose.Schema({
  name: {
    type: String,
    required: [true, 'Work name is required'],
    trim: true,
    unique: true
  },
  price: {
    type: Number,
    required: [true, 'Fixed price is required'],
    min: [0, 'Price must be positive']
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
