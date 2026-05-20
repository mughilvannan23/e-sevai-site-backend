const express = require('express');
const router = express.Router();
const { body, validationResult } = require('express-validator');
const {
  login,
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
router.post('/login', loginValidation, validateRequest, login);
router.get('/profile', authenticate, getProfile);
router.put('/change-password', authenticate, changePasswordValidation, validateRequest, () => { });
router.post('/logout', authenticate, logout);
router.post('/refresh-token', authenticate, (req, res) => {
  const token = req.user.generateAuthToken();
  res.json({ success: true, token });
});

module.exports = router;