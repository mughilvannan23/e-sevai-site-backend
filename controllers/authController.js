const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const User = require('../models/User');
const OTP = require('../models/OTP');
const { sendOTP } = require('../utils/email');

const generateOTPCode = () => Math.floor(100000 + Math.random() * 900000).toString();

/**
 * ✅ SMART LOGIN (AUTO ROLE DETECTION)
 */
const login = async (req, res) => {
  try {
    const { loginId, mobile, password } = req.body;

    const identifier = loginId || mobile;

    if (!identifier || !password) {
      return res.status(400).json({
        success: false,
        message: 'Email or mobile and password are required'
      });
    }

    const trimmedIdentifier = identifier.trim();
    const isEmail = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmedIdentifier);

    // 🔍 1. Find user by email or mobile number in DB (regardless of role)
    const query = isEmail 
      ? { email: trimmedIdentifier.toLowerCase(), isActive: true } 
      : { mobile: trimmedIdentifier, isActive: true };

    let user = await User.findOne(query).select('+password').populate('adminId', 'shopName subscriptionEndDate');

    if (user) {
      // ✅ User exists in database - verify password
      const isPasswordValid = await user.comparePassword(password);

      if (!isPasswordValid) {
        return res.status(401).json({
          success: false,
          message: 'Invalid credentials'
        });
      }

      // Check subscription
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
    } else {
      if (isEmail) {
        return res.status(401).json({
          success: false,
          message: 'Invalid credentials'
        });
      }

      // 🔄 2. Fallback to .env credentials for Admin if user not in DB
      const configuredAdminMobile = process.env.ADMIN_MOBILE?.trim();
      const configuredAdminPassword = process.env.ADMIN_PASSWORD?.trim();
      
      // 🔄 3. Fallback to .env credentials for SuperAdmin
      const configuredSuperadminMobile = process.env.SUPERADMIN_MOBILE?.trim() || '9999999999';
      const configuredSuperadminEmail = process.env.SUPERADMIN_EMAIL?.trim()?.toLowerCase();
      const configuredSuperadminPassword = process.env.SUPERADMIN_PASSWORD?.trim() || 'superadmin@123';

      if (trimmedIdentifier === configuredAdminMobile && password === configuredAdminPassword) {
        console.log('⚙️ Creating default admin user from .env credentials...');
        const salt = await bcrypt.genSalt(10);
        const hashedPassword = await bcrypt.hash(configuredAdminPassword, salt);

        user = new User({
          name: 'System Administrator',
          mobile: configuredAdminMobile,
          password: hashedPassword,
          role: 'admin',
          shopName: 'Default Shop',
          isActive: true
        });
        await user.save();
      } else if ((trimmedIdentifier === configuredSuperadminMobile || (configuredSuperadminEmail && trimmedIdentifier.toLowerCase() === configuredSuperadminEmail)) && password === configuredSuperadminPassword) {
        console.log('⚙️ Creating superadmin user from .env credentials...');
        const salt = await bcrypt.genSalt(10);
        const hashedPassword = await bcrypt.hash(configuredSuperadminPassword, salt);

        user = new User({
          name: 'Super Admin',
          mobile: configuredSuperadminMobile,
          email: configuredSuperadminEmail || null,
          password: hashedPassword,
          role: 'superadmin',
          isActive: true
        });
        await user.save();
      } else {
        // No user found and not the .env admin or superadmin
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
        email: user.email,
        role: user.role,
        employeeId: user.employeeId,
        lastLogin: user.lastLogin,
        shopName: user.role === 'employee' && user.adminId && user.adminId.shopName ? user.adminId.shopName : user.shopName
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
        email: req.user.email,
        role: req.user.role,
        employeeId: req.user.employeeId,
        lastLogin: req.user.lastLogin,
        shopName: req.user.shopName
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

/**
 * ✅ FORGOT PASSWORD
 */
const forgotPassword = async (req, res) => {
  try {
    const { loginId } = req.body;
    if (!loginId) {
      return res.status(400).json({ success: false, message: 'Email or mobile is required' });
    }
    
    const trimmedIdentifier = loginId.trim();
    const isEmail = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmedIdentifier);
    
    if (!isEmail) {
      return res.status(400).json({
        success: false,
        message: 'For security reasons, password reset is available only through your registered email.'
      });
    }
    
    const email = trimmedIdentifier.toLowerCase();
    const user = await User.findOne({ email, isActive: true });
    
    if (!user) {
      return res.status(404).json({ success: false, message: 'Email not found.' });
    }
    
    const otpCode = generateOTPCode();
    const expiresAt = new Date(Date.now() + 5 * 60 * 1000); // 5 minutes
    
    // Invalidate old OTPs
    await OTP.deleteMany({ email, purpose: 'password_reset' });
    
    const otp = new OTP({
      email,
      otp: otpCode,
      purpose: 'password_reset',
      expiresAt
    });
    
    await otp.save();
    await sendOTP(email, otpCode);
    
    return res.status(200).json({ success: true, message: 'OTP sent to registered email' });
  } catch (error) {
    console.error('❌ forgotPassword error:', error);
    return res.status(500).json({ success: false, message: 'Server error' });
  }
};

/**
 * ✅ VERIFY OTP
 */
const verifyOTP = async (req, res) => {
  try {
    const { email, otp } = req.body;
    if (!email || !otp) {
      return res.status(400).json({ success: false, message: 'Email and OTP are required' });
    }
    
    const otpRecord = await OTP.findOne({ email: email.toLowerCase(), otp, purpose: 'password_reset' });
    
    if (!otpRecord) {
      return res.status(400).json({ success: false, message: 'Invalid OTP' });
    }
    
    if (new Date() > otpRecord.expiresAt) {
      return res.status(400).json({ success: false, message: 'OTP has expired. Please request a new OTP.' });
    }
    
    return res.status(200).json({ success: true, message: 'OTP verified successfully' });
  } catch (error) {
    console.error('❌ verifyOTP error:', error);
    return res.status(500).json({ success: false, message: 'Server error' });
  }
};

/**
 * ✅ RESEND OTP
 */
const resendOTP = async (req, res) => {
  try {
    const { email } = req.body;
    if (!email) {
      return res.status(400).json({ success: false, message: 'Email is required' });
    }
    
    const userEmail = email.toLowerCase();
    const user = await User.findOne({ email: userEmail, isActive: true });
    
    if (!user) {
      return res.status(404).json({ success: false, message: 'Email not found.' });
    }
    
    const otpCode = generateOTPCode();
    const expiresAt = new Date(Date.now() + 5 * 60 * 1000);
    
    await OTP.deleteMany({ email: userEmail, purpose: 'password_reset' });
    
    const otp = new OTP({
      email: userEmail,
      otp: otpCode,
      purpose: 'password_reset',
      expiresAt
    });
    
    await otp.save();
    await sendOTP(userEmail, otpCode);
    
    return res.status(200).json({ success: true, message: 'OTP resent successfully' });
  } catch (error) {
    console.error('❌ resendOTP error:', error);
    return res.status(500).json({ success: false, message: 'Server error' });
  }
};

/**
 * ✅ RESET PASSWORD
 */
const resetPassword = async (req, res) => {
  try {
    const { email, otp, newPassword, confirmPassword } = req.body;
    
    if (!email || !otp || !newPassword || !confirmPassword) {
      return res.status(400).json({ success: false, message: 'All fields are required' });
    }
    
    if (newPassword !== confirmPassword) {
      return res.status(400).json({ success: false, message: 'Passwords do not match' });
    }
    
    if (newPassword.length < 6) {
      return res.status(400).json({ success: false, message: 'Password must be at least 6 characters long' });
    }
    
    const userEmail = email.toLowerCase();
    const otpRecord = await OTP.findOne({ email: userEmail, otp, purpose: 'password_reset' });
    
    if (!otpRecord) {
      return res.status(400).json({ success: false, message: 'Invalid OTP' });
    }
    
    if (new Date() > otpRecord.expiresAt) {
      return res.status(400).json({ success: false, message: 'OTP has expired. Please request a new OTP.' });
    }
    
    const user = await User.findOne({ email: userEmail, isActive: true });
    if (!user) {
      return res.status(404).json({ success: false, message: 'User not found' });
    }
    
    user.password = newPassword;
    await user.save();
    
    await OTP.deleteMany({ email: userEmail, purpose: 'password_reset' });
    
    return res.status(200).json({ success: true, message: 'Password changed successfully.' });
  } catch (error) {
    console.error('❌ resetPassword error:', error);
    return res.status(500).json({ success: false, message: 'Server error' });
  }
};


module.exports = {
  login,
  getProfile,
  logout,
  forgotPassword,
  verifyOTP,
  resendOTP,
  resetPassword
};