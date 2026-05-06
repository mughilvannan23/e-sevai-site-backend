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
  body('mobile')
    .isLength({ min: 10, max: 10 })
    .isNumeric()
    .withMessage('Please enter a valid 10-digit mobile number'),
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

// Routes
router.post('/admin/login', loginValidation, validateRequest, adminLogin);
router.post('/employee/login', loginValidation, validateRequest, employeeLogin);
router.get('/profile', authenticate, getProfile);
router.put('/change-password', authenticate, changePasswordValidation, validateRequest, () => { });
router.post('/logout', authenticate, logout);

module.exports = router;