const mongoose = require('mongoose');

const workSchema = new mongoose.Schema({
  employee: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  date: {
    type: Date,
    required: true,
    default: Date.now
  },
  customerName: {
    type: String,
    required: [true, 'Customer name is required'],
    trim: true,
    maxlength: [100, 'Customer name cannot exceed 100 characters']
  },
  workTitle: {
    type: String,
    required: [true, 'Work title is required'],
    trim: true,
    maxlength: [200, 'Work title cannot exceed 200 characters']
  },
  workItem: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'WorkItem'
  },
  adminPrice: {
    type: Number,
    default: 0
  },
  amount: {
    type: Number,
    required: [true, 'Amount is required'],
    min: [0, 'Amount must be positive']
  },
  paymentStatus: {
    type: String,
    enum: ['Paid', 'Pending'],
    default: 'Pending'
  },
  workStatus: {
    type: String,
    enum: ['Completed', 'In Progress'],
    default: 'In Progress'
  },
  notes: {
    type: String,
    trim: true,
    maxlength: [500, 'Notes cannot exceed 500 characters']
  },
  createdAt: {
    type: Date,
    default: Date.now
  },
  updatedAt: {
    type: Date,
    default: Date.now
  }
});

// Update timestamp before saving
workSchema.pre('save', function(next) {
  this.updatedAt = Date.now();
  next();
});

// Index for better query performance
workSchema.index({ employee: 1, date: -1 });
workSchema.index({ date: -1, paymentStatus: 1 });
workSchema.index({ workStatus: 1 });

module.exports = mongoose.model('Work', workSchema);