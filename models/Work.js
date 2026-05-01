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
  customerPhone: {
    type: String,
    trim: true,
    maxlength: [15, 'Phone number cannot exceed 15 characters'],
    match: [/^[0-9+\-\s()]+$/, 'Please enter a valid phone number']
  },
  paymentMethod: {
    type: String,
    enum: ['GPay', 'Hand Cash', 'Cash', 'Card', 'Bank Transfer', 'Other'],
    default: 'Hand Cash'
  },
  items: [{
    workItemId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'WorkItem'
    },
    title: {
      type: String,
      required: [true, 'Work title is required']
    },
    workChargeAtTime: {
      type: Number,
      required: true,
      default: 0
    },
    serviceChargeAtTime: {
      type: Number,
      required: true,
      default: 0
    },
    quantity: {
      type: Number,
      default: 1,
      min: [1, 'Quantity must be at least 1']
    },
    otherCharges: {
      type: Number,
      default: 0,
      min: [0, 'Other charges cannot be negative']
    },
    discount: {
      type: Number,
      default: 0,
      min: [0, 'Discount cannot be negative']
    },
    applicationNumber: {
      type: String,
      trim: true
    }
  }],
  adminPrice: {
    type: Number,
    default: 0
  },
  totalDiscount: {
    type: Number,
    default: 0,
    min: [0, 'Total discount cannot be negative']
  },
  amount: {
    type: Number,
    required: [true, 'Amount is required'],
    min: [0, 'Amount must be positive']
  },
  otherCharges: {
    type: Number,
    default: 0,
    min: [0, 'Other charges cannot be negative']
  },
  paymentStatus: {
    type: String,
    enum: ['Paid', 'Pending'],
    default: 'Pending'
  },
  workStatus: {
    type: String,
    enum: ['In Progress', 'Completed'],
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
workSchema.pre('save', function (next) {
  this.updatedAt = Date.now();
  next();
});

// Index for better query performance
workSchema.index({ employee: 1, date: -1 });
workSchema.index({ date: -1, paymentStatus: 1 });
workSchema.index({ workStatus: 1 });

module.exports = mongoose.model('Work', workSchema);