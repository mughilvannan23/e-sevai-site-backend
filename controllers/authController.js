const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const User = require('../models/User');

/**
 * ✅ SMART LOGIN (AUTO ROLE DETECTION)
 */
const login = async (req, res) => {
  try {
    const { mobile, password } = req.body;

    if (!mobile || !password) {
      return res.status(400).json({
        success: false,
        message: 'Mobile and password are required'
      });
    }

    const trimmedMobile = mobile.trim();

    // 🔍 1. Find user by mobile number in DB (regardless of role)
    let user = await User.findOne({
      mobile: trimmedMobile,
      isActive: true
    }).select('+password');

    if (user) {
      // ✅ User exists in database - verify password
      const isPasswordValid = await user.comparePassword(password);

      if (!isPasswordValid) {
        return res.status(401).json({
          success: false,
          message: 'Invalid credentials'
        });
      }
    } else {
      // 🔄 2. Fallback to .env credentials for Admin if user not in DB
      const configuredAdminMobile = process.env.ADMIN_MOBILE?.trim();
      const configuredAdminPassword = process.env.ADMIN_PASSWORD?.trim();

      if (trimmedMobile === configuredAdminMobile && password === configuredAdminPassword) {
        console.log('⚙️ Creating admin user from .env credentials...');
        const salt = await bcrypt.genSalt(10);
        const hashedPassword = await bcrypt.hash(configuredAdminPassword, salt);

        user = new User({
          name: 'System Administrator',
          mobile: configuredAdminMobile,
          password: hashedPassword,
          role: 'admin',
          isActive: true
        });
        await user.save();
      } else {
        // No user found and not the .env admin
        return res.status(401).json({
          success: false,
          message: 'Invalid credentials'
        });
      }
    }

    // Update last login timestamp
    user.lastLogin = new Date();
    await user.save();

    // Generate JWT Token
    const token = user.generateAuthToken();

    console.log(`✅ ${user.role.toUpperCase()} Login: ${user.mobile}`);

    return res.status(200).json({
      success: true,
      message: 'Login successful',
      token,
      user: {
        id: user._id,
        name: user.name,
        mobile: user.mobile,
        role: user.role,
        employeeId: user.employeeId,
        lastLogin: user.lastLogin
      }
    });

  } catch (error) {
    console.error('❌ Login error:', error);
    return res.status(500).json({
      success: false,
      message: 'Server error during login'
    });
  }
};


/**
 * ✅ GET CURRENT USER PROFILE
 */
const getProfile = async (req, res) => {
  try {
    return res.status(200).json({
      success: true,
      user: {
        id: req.user._id,
        name: req.user.name,
        mobile: req.user.mobile,
        role: req.user.role,
        employeeId: req.user.employeeId,
        lastLogin: req.user.lastLogin
      }
    });
  } catch (error) {
    console.error('❌ Get profile error:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to fetch profile'
    });
  }
};

/**
 * ✅ LOGOUT
 */
const logout = async (req, res) => {
  try {
    return res.status(200).json({
      success: true,
      message: 'Logged out successfully'
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      message: 'Server error during logout'
    });
  }
};

module.exports = {
  login,
  getProfile,
  logout
};