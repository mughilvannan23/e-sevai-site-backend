const express = require('express');
const router = express.Router();
const { body, validationResult } = require('express-validator');
const {
  createWork,
  getMyWorks,
  getWorkById,
  updateWork,
  deleteWork,
  getMyWorkStats,
  getActiveWorkItems
} = require('../controllers/workController');
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
const workValidation = [
  body('date')
    .notEmpty()
    .withMessage('Date is required')
    .isISO8601()
    .withMessage('Please provide a valid date'),
  body('customerName')
    .notEmpty()
    .withMessage('Customer name is required')
    .isLength({ max: 100 })
    .withMessage('Customer name cannot exceed 100 characters'),
  body('workTitle')
    .optional()
    .isLength({ max: 200 })
    .withMessage('Work title cannot exceed 200 characters'),
  body('amount')
    .notEmpty()
    .withMessage('Amount is required')
    .isNumeric()
    .withMessage('Amount must be a number')
    .isFloat({ min: 0 })
    .withMessage('Amount must be positive'),
  body('paymentStatus')
    .notEmpty()
    .withMessage('Payment status is required')
    .isIn(['Paid', 'Pending'])
    .withMessage('Payment status must be Paid or Pending'),
  body('workStatus')
    .notEmpty()
    .withMessage('Work status is required')
    .isIn(['Completed', 'In Progress'])
    .withMessage('Work status must be Completed or In Progress'),
  body('notes')
    .optional()
    .isLength({ max: 500 })
    .withMessage('Notes cannot exceed 500 characters')
];

const updateWorkValidation = [
  body('date')
    .optional()
    .isISO8601()
    .withMessage('Please provide a valid date'),
  body('customerName')
    .optional()
    .isLength({ max: 100 })
    .withMessage('Customer name cannot exceed 100 characters'),
  body('workTitle')
    .optional()
    .isLength({ max: 200 })
    .withMessage('Work title cannot exceed 200 characters'),
  body('amount')
    .optional()
    .isNumeric()
    .withMessage('Amount must be a number')
    .isFloat({ min: 0 })
    .withMessage('Amount must be positive'),
  body('paymentStatus')
    .optional()
    .isIn(['Paid', 'Pending'])
    .withMessage('Payment status must be Paid or Pending'),
  body('workStatus')
    .optional()
    .isIn(['Completed', 'In Progress'])
    .withMessage('Work status must be Completed or In Progress'),
  body('notes')
    .optional()
    .isLength({ max: 500 })
    .withMessage('Notes cannot exceed 500 characters')
];

// Routes
router.post('/', authenticate, workValidation, validateRequest, createWork);
router.get('/', authenticate, getMyWorks);
router.get('/stats', authenticate, getMyWorkStats);
router.get('/items/active', authenticate, getActiveWorkItems);
router.get('/:id', authenticate, getWorkById);
router.put('/:id', authenticate, updateWorkValidation, validateRequest, updateWork);
router.delete('/:id', authenticate, deleteWork);

module.exports = router;