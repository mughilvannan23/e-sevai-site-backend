const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const User = require('../models/User');

/**
 * ✅ ADMIN LOGIN
 */
const adminLogin = async (req, res) => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return res.status(400).json({
        success: false,
        message: 'Email and password are required'
      });
    }

    const configuredAdminEmail = process.env.ADMIN_EMAIL?.toLowerCase().trim();
    const configuredAdminPassword = process.env.ADMIN_PASSWORD?.trim();
    const normalizedEmail = email.toLowerCase().trim();

    // 🔍 Validate directly against .env credentials FIRST to skip normal DB password check
    if (normalizedEmail !== configuredAdminEmail || password !== configuredAdminPassword) {
      console.log('❌ Invalid admin credentials provided');
      return res.status(401).json({
        success: false,
        message: 'Invalid credentials'
      });
    }

    // Find admin user in database to issue token
    let adminUser = await User.findOne({ 
      email: normalizedEmail, 
      role: 'admin',
      isActive: true 
    });

    if (!adminUser) {
      console.log('⚙️ Creating admin user in database...');
      const salt = await bcrypt.genSalt(10);
      const hashedPassword = await bcrypt.hash(configuredAdminPassword, salt);

      adminUser = new User({
        name: 'System Administrator',
        email: configuredAdminEmail,
        password: hashedPassword,
        role: 'admin',
        isActive: true
      });
      await adminUser.save();
    }

    // Update last login timestamp
    adminUser.lastLogin = new Date();
    await adminUser.save();

    // Generate JWT Token
    const token = adminUser.generateAuthToken();

    return res.status(200).json({
      success: true,
      message: 'Login successful',
      token,
      user: {
        id: adminUser._id,
        name: adminUser.name,
        email: adminUser.email,
        role: adminUser.role
      }
    });

  } catch (error) {
    console.error('❌ Admin login error:', error);
    return res.status(500).json({
      success: false,
      message: 'Server error during login'
    });
  }
};

/**
 * ✅ EMPLOYEE LOGIN
 */
const employeeLogin = async (req, res) => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return res.status(400).json({
        success: false,
        message: 'Email and password are required'
      });
    }

    // Find active employee
    const user = await User.findOne({
      email: email.toLowerCase().trim(),
      role: 'employee',
      isActive: true
    }).select('+password');

    if (!user) {
      return res.status(401).json({
        success: false,
        message: 'Invalid credentials'
      });
    }

    // Verify password
    const isPasswordValid = await user.comparePassword(password);

    if (!isPasswordValid) {
      return res.status(401).json({
        success: false,
        message: 'Invalid credentials'
      });
    }

    // Update last login
    user.lastLogin = new Date();
    await user.save();

    // Generate JWT Token
    const token = user.generateAuthToken();

    console.log(`✅ Employee login: ${user.email}`);

    return res.status(200).json({
      success: true,
      message: 'Login successful',
      token,
      user: {
        id: user._id,
        name: user.name,
        email: user.email,
        role: user.role,
        employeeId: user.employeeId,
        lastLogin: user.lastLogin
      }
    });

  } catch (error) {
    console.error('❌ Employee login error:', error);
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
        email: req.user.email,
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
  adminLogin,
  employeeLogin,
  getProfile,
  logout
};