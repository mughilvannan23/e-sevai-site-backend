const express = require('express');
const router = express.Router();
const { body, validationResult } = require('express-validator');
const {
  adminLogin,
  employeeLogin,
  getProfile,
  logout
} = require('../controllers/authController');
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
  body('email')
    .isEmail()
    .normalizeEmail()
    .withMessage('Please enter a valid email'),
  body('password')
    .notEmpty()
    .withMessage('Password is required')
];

const otpValidation = [
  body('email')
    .isEmail()
    .normalizeEmail()
    .withMessage('Please enter a valid email'),
  body('otp')
    .isLength({ min: 6, max: 6 })
    .isNumeric()
    .withMessage('OTP must be 6 digits')
];

const changePasswordValidation = [
  body('currentPassword')
    .notEmpty()
    .withMessage('Current password is required'),
  body('newPassword')
    .isLength({ min: 6 })
    .withMessage('New password must be at least 6 characters long')
];

// Routes
router.post('/admin/login', loginValidation, validateRequest, adminLogin);
router.post('/employee/login', loginValidation, validateRequest, employeeLogin);
router.get('/profile', authenticate, getProfile);
router.put('/change-password', authenticate, changePasswordValidation, validateRequest, () => { });
router.post('/logout', authenticate, logout);

module.exports = router;