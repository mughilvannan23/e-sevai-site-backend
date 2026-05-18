const mongoose = require('mongoose');

const purchaseSchema = new mongoose.Schema({
  orderName: {
    type: String,
    required: [true, 'Order name is required'],
    trim: true
  },
  adminId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  },
  amount: {
    type: Number,
    required: [true, 'Amount is required'],
    min: [0, 'Amount cannot be negative']
  },
  date: {
    type: Date,
    default: Date.now
  }
}, {
  timestamps: true
});

module.exports = mongoose.model('Purchase', purchaseSchema);
