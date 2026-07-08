const express = require('express');
const router = express.Router();
const { body, validationResult } = require('express-validator');
const {
  login,
  getProfile,
  logout,
  forgotPassword,
  verifyOTP,
  resendOTP,
  resetPassword
} = require('../controllers/authController');
const { createAdminAccount } = require('../controllers/superadminController');
const { authenticate } = require('../middleware/auth');

const validateRequest = (req, res, next) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({
      success: false,
      message: errors.array()[0].msg,
      errors: errors.array()
    });
  }
  next();
};

// Validation rules
const loginValidation = [
  body('password')
    .notEmpty()
    .withMessage('Password is required')
];

const changePasswordValidation = [
  body('currentPassword')
    .notEmpty()
    .withMessage('Current password is required'),
  body('newPassword')
    .isLength({ min: 6 })
    .withMessage('New password must be at least 6 characters long')
];

const publicRegistrationValidation = [
  body('shopName')
    .notEmpty()
    .trim()
    .withMessage('Shop name is required'),
  body('mobile')
    .isLength({ min: 10, max: 10 })
    .isNumeric()
    .withMessage('Please enter a valid 10-digit mobile number'),
  body('password')
    .isLength({ min: 6 })
    .withMessage('Password must be at least 6 characters long'),
  body('email')
    .notEmpty()
    .withMessage('Email is required')
    .isEmail()
    .withMessage('Please enter a valid email address')
];

// Routes
router.post('/login', loginValidation, validateRequest, login);

// Password Reset Routes
router.post('/forgot-password', forgotPassword);
router.post('/verify-otp', verifyOTP);
router.post('/resend-otp', resendOTP);
router.post('/reset-password', resetPassword);

router.post('/register', publicRegistrationValidation, validateRequest, async (req, res) => {
  try {
    const { shopName, mobile, password, email } = req.body;
    const startDate = new Date();
    const endDate = new Date();
    endDate.setDate(endDate.getDate() + 3);

    const user = await createAdminAccount({
      shopName,
      mobile,
      password,
      email,
      subscriptionStartDate: startDate,
      subscriptionEndDate: endDate,
      isActive: true,
      role: 'admin'
    });

    res.status(201).json({
      success: true,
      message: 'Account created successfully. Your free trial is active for 3 days. Please login.',
      admin: {
        id: user._id,
        shopName: user.shopName,
        mobile: user.mobile,
        isActive: user.isActive,
        subscriptionStartDate: user.subscriptionStartDate,
        subscriptionEndDate: user.subscriptionEndDate,
        createdAt: user.createdAt
      }
    });
  } catch (error) {
    const message = error.message || 'Server error while creating account.';
    const statusCode = message === 'Mobile number already in use.' ? 400 : 500;
    res.status(statusCode).json({ success: false, message });
  }
});

router.get('/profile', authenticate, getProfile);
router.put('/change-password', authenticate, changePasswordValidation, validateRequest, () => { });
router.post('/logout', authenticate, logout);
router.post('/refresh-token', authenticate, (req, res) => {
  const token = req.user.generateAuthToken();
  res.json({ success: true, token });
});

module.exports = router;