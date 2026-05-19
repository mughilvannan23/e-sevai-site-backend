const jwt = require('jsonwebtoken');
const User = require('../models/User');

// Authenticate JWT token
const authenticate = async (req, res, next) => {
  try {
    const token = req.header('Authorization')?.replace('Bearer ', '');
    
    if (!token) {
      return res.status(401).json({ 
        success: false, 
        message: 'Access denied. No token provided.' 
      });
    }

    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    const user = await User.findById(decoded.id).select('-password').populate('adminId', 'shopName subscriptionEndDate');
    
    if (!user || !user.isActive) {
      return res.status(401).json({ 
        success: false, 
        message: 'Token is not valid or user is inactive.' 
      });
    }

    // Check subscription status
    const now = new Date();
    let isExpired = false;

    if (user.role === 'admin') {
      if (user.subscriptionEndDate && new Date(user.subscriptionEndDate) < now) {
        isExpired = true;
      }
    } else if (user.role === 'employee') {
      if (user.adminId && user.adminId.subscriptionEndDate && new Date(user.adminId.subscriptionEndDate) < now) {
        isExpired = true;
      }
    }

    if (isExpired) {
      return res.status(403).json({
        success: false,
        message: 'Your shop subscription has expired. Please contact the Super Admin to renew.'
      });
    }

    if (user.adminId && typeof user.adminId === 'object' && user.adminId._id) {
       user.shopName = user.adminId.shopName;
       user.adminId = user.adminId._id;
    }

    req.user = user;
    next();
  } catch (error) {
    res.status(401).json({ 
      success: false, 
      message: 'Token is not valid.' 
    });
  }
};

// Authorize superadmin role
const authorizeSuperAdmin = (req, res, next) => {
  if (req.user.role !== 'superadmin') {
    return res.status(403).json({ 
      success: false, 
      message: 'Access denied. Superadmin privileges required.' 
    });
  }
  next();
};

// Authorize admin role
const authorizeAdmin = (req, res, next) => {
  if (req.user.role !== 'admin' && req.user.role !== 'superadmin') {
    return res.status(403).json({ 
      success: false, 
      message: 'Access denied. Admin privileges required.' 
    });
  }
  next();
};

// Authorize employee role
const authorizeEmployee = (req, res, next) => {
  if (req.user.role !== 'employee') {
    return res.status(403).json({ 
      success: false, 
      message: 'Access denied. Employee privileges required.' 
    });
  }
  next();
};

// Check if user can access specific resource (own work or admin)
const canAccessResource = (req, res, next) => {
  // Admin can access all resources
  if (req.user.role === 'admin') {
    return next();
  }
  
  // Employee can only access their own resources
  if (req.params.userId && req.params.userId !== req.user.id) {
    return res.status(403).json({ 
      success: false, 
      message: 'Access denied. You can only access your own resources.' 
    });
  }
  
  next();
};

module.exports = {
  authenticate,
  authorizeSuperAdmin,
  authorizeAdmin,
  authorizeEmployee,
  canAccessResource
};