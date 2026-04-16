const express = require('express');
const router = express.Router();
const { body, validationResult } = require('express-validator');
const {
  createEmployee,
  getEmployees,
  getEmployeeById,
  updateEmployee,
  deleteEmployee,
  getEmployeeStats
} = require('../controllers/userController');
const { authenticate, authorizeAdmin } = require('../middleware/auth');

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
const employeeValidation = [
  body('name')
    .notEmpty()
    .withMessage('Name is required')
    .isLength({ min: 2, max: 50 })
    .withMessage('Name must be between 2 and 50 characters'),
  body('email')
    .isEmail()
    .normalizeEmail()
    .withMessage('Please enter a valid email'),
  body('password')
    .isLength({ min: 6 })
    .withMessage('Password must be at least 6 characters long')
];

const updateEmployeeValidation = [
  body('name')
    .optional()
    .isLength({ min: 2, max: 50 })
    .withMessage('Name must be between 2 and 50 characters'),
  body('email')
    .optional()
    .isEmail()
    .normalizeEmail()
    .withMessage('Please enter a valid email'),
  body('isActive')
    .optional()
    .isBoolean()
    .withMessage('isActive must be a boolean')
];

// Routes
router.post('/', authenticate, authorizeAdmin, employeeValidation, validateRequest, createEmployee);
router.get('/', authenticate, authorizeAdmin, getEmployees);
router.get('/stats', authenticate, authorizeAdmin, getEmployeeStats);
router.get('/:id', authenticate, authorizeAdmin, getEmployeeById);
router.put('/:id', authenticate, authorizeAdmin, updateEmployeeValidation, validateRequest, updateEmployee);
router.delete('/:id', authenticate, authorizeAdmin, deleteEmployee);

module.exports = router;