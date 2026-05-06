const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const User = require('../models/User');

/**
 * ✅ ADMIN LOGIN
 */
const adminLogin = async (req, res) => {
  try {
    const { mobile, password } = req.body;

    console.log('Admin login attempt with mobile:', mobile);

    if (!mobile || !password) {
      return res.status(401).json({
        success: false,
        message: 'Invalid credentials'
      });
    }

    // 🔍 First, try to find admin in database
    let adminUser = await User.findOne({
      mobile: mobile.trim(),
      role: 'admin',
      isActive: true
    }).select('+password');

    console.log('Admin user found in DB:', !!adminUser);

    if (adminUser) {
      // ✅ Admin exists in database - verify password against stored hash
      const isPasswordValid = await bcrypt.compare(password, adminUser.password);

      if (!isPasswordValid) {
        console.log('Invalid password for database admin');
        return res.status(401).json({
          success: false,
          message: 'Invalid credentials'
        });
      }
    } else {
      // 🔄 No admin in database - fallback to .env credentials for first-time setup
      const configuredAdminMobile = process.env.ADMIN_MOBILE?.trim();
      const configuredAdminPassword = process.env.ADMIN_PASSWORD?.trim();

      console.log('Checking .env credentials:');
      console.log('  Input mobile:', mobile);
      console.log('  Expected mobile:', configuredAdminMobile);
      console.log('  Mobile match:', mobile === configuredAdminMobile);
      console.log('  Password match:', password === configuredAdminPassword);

      if (mobile !== configuredAdminMobile || password !== configuredAdminPassword) {
        console.log('Invalid admin credentials provided');
        return res.status(401).json({
          success: false,
          message: 'Invalid credentials'
        });
      }

      console.log('⚙️ Creating admin user in database...');
      const salt = await bcrypt.genSalt(10);
      const hashedPassword = await bcrypt.hash(configuredAdminPassword, salt);

      adminUser = new User({
        name: 'System Administrator',
        mobile: configuredAdminMobile,
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
        mobile: adminUser.mobile,
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
    const { mobile, password } = req.body;

    if (!mobile || !password) {
      return res.status(401).json({
        success: false,
        message: 'Invalid credentials'
      });
    }

    // Find active employee
    const user = await User.findOne({
      mobile: mobile.trim(),
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

    console.log(`✅ Employee login: ${user.mobile}`);

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
  adminLogin,
  employeeLogin,
  getProfile,
  logout
};