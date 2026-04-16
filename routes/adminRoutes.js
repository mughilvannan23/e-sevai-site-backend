const express = require('express');
const router = express.Router();
const {
  getAllWorks,
  getDashboardStats,
  getEmployeePerformance,
  getRevenueReport,
  downloadRevenueExcel,
  downloadRevenuePDF,
  createWorkItem,
  getAllWorkItems,
  updateWorkItem,
  deleteWorkItem
} = require('../controllers/adminController');
const { updateEmployee } = require('../controllers/userController');
const { authenticate, authorizeAdmin } = require('../middleware/auth');

// Routes - all admin routes require authentication and admin role
router.get('/dashboard', authenticate, authorizeAdmin, getDashboardStats);
router.get('/works', authenticate, authorizeAdmin, getAllWorks);
router.get('/employee-performance', authenticate, authorizeAdmin, getEmployeePerformance);
router.get('/revenue-report', authenticate, authorizeAdmin, getRevenueReport);
router.get('/revenue-report/download/excel', authenticate, authorizeAdmin, downloadRevenueExcel);
router.get('/revenue-report/download/pdf', authenticate, authorizeAdmin, downloadRevenuePDF);

// User/Employee Management
router.put('/employees/:id', authenticate, authorizeAdmin, updateEmployee);

// Work Item Management
router.post('/work-items', authenticate, authorizeAdmin, createWorkItem);
router.get('/work-items', authenticate, authorizeAdmin, getAllWorkItems);
router.put('/work-items/:id', authenticate, authorizeAdmin, updateWorkItem);
router.delete('/work-items/:id', authenticate, authorizeAdmin, deleteWorkItem);

module.exports = router;