const mongoose = require('mongoose');

const otpSchema = new mongoose.Schema({
  email: {
    type: String,
    required: true,
    lowercase: true,
    trim: true,
    index: true
  },
  otp: {
    type: String,
    required: true,
    trim: true
  },
  purpose: {
    type: String,
    enum: ['login', 'password_reset'],
    default: 'login',
    index: true
  },
  expiresAt: {
    type: Date,
    required: true,
    index: true
  },
  attempts: {
    type: Number,
    default: 0,
    min: 0,
    max: 5
  },
  createdAt: {
    type: Date,
    default: Date.now,
    expires: 300 // Auto delete after 5 minutes (MongoDB TTL Index)
  }
});

// Compound index for faster queries
otpSchema.index({ email: 1, purpose: 1, createdAt: -1 });

module.exports = mongoose.model('OTP', otpSchema);