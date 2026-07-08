const User = require('../models/User');
const bcrypt = require('bcryptjs');

const createAdminAccount = async ({ shopName, mobile, password, email, subscriptionStartDate, subscriptionEndDate, isActive = true, role = 'admin' }) => {
  const trimmedShopName = shopName?.trim();
  const trimmedMobile = mobile?.trim();
  const trimmedEmail = email?.trim().toLowerCase();

  if (!trimmedShopName || !trimmedMobile || !password) {
    throw new Error('Shop name, mobile, and password are required.');
  }

  if (!trimmedEmail) {
    throw new Error('Email is required.');
  }

  const existingUser = await User.findOne({ mobile: trimmedMobile });
  if (existingUser) {
    throw new Error('Mobile number already in use.');
  }

  const user = new User({
    name: 'Shop Admin',
    mobile: trimmedMobile,
    email: trimmedEmail || null,
    password,
    passwordText: password,
    role,
    shopName: trimmedShopName,
    isActive,
    subscriptionStartDate,
    subscriptionEndDate
  });

  await user.save();
  return user;
};

// Create a new shop admin
const createShopAdmin = async (req, res) => {
  try {
    const { shopName, mobile, password, email, subscriptionMonths } = req.body;

    if (!shopName || !mobile || !password || !email) {
      return res.status(400).json({ success: false, message: 'Shop name, mobile, email, and password are required.' });
    }

    const months = parseInt(subscriptionMonths) || 1;
    const startDate = new Date();
    const endDate = new Date();
    endDate.setMonth(endDate.getMonth() + months);

    const user = await createAdminAccount({
      shopName,
      mobile,
      password,
      email,
      subscriptionStartDate: startDate,
      subscriptionEndDate: endDate
    });

    res.status(201).json({
      success: true,
      message: 'Shop admin created successfully.',
      admin: {
        id: user._id,
        shopName: user.shopName,
        mobile: user.mobile,
        isActive: user.isActive,
        subscriptionStartDate: user.subscriptionStartDate,
        subscriptionEndDate: user.subscriptionEndDate,
        createdAt: user.createdAt
      }
    });

  } catch (error) {
    console.error('Create shop admin error:', error);
    const message = error.message || 'Server error while creating shop admin.';
    const statusCode = message === 'Mobile number already in use.' ? 400 : 500;
    res.status(statusCode).json({ success: false, message });
  }
};

// Get all shop admins
const getShopAdmins = async (req, res) => {
  try {
    const admins = await User.find({ role: 'admin' })
      .select('shopName mobile email passwordText isActive subscriptionStartDate subscriptionEndDate createdAt lastLogin')
      .sort({ createdAt: -1 });

    res.json({
      success: true,
      admins
    });
  } catch (error) {
    console.error('Get shop admins error:', error);
    res.status(500).json({ success: false, message: 'Server error while fetching shop admins.' });
  }
};

// Update shop admin
const updateShopAdmin = async (req, res) => {
  try {
    const { id } = req.params;
    const { shopName, mobile, password, email, isActive, subscriptionMonths, subscriptionEndDate } = req.body;

    const user = await User.findOne({ _id: id, role: 'admin' });
    
    if (!user) {
      return res.status(404).json({ success: false, message: 'Shop admin not found.' });
    }

    if (mobile && mobile.trim() !== user.mobile) {
      const existingUser = await User.findOne({ mobile: mobile.trim(), _id: { $ne: user._id } });
      if (existingUser) {
        return res.status(400).json({ success: false, message: 'Mobile number is already in use.' });
      }
    }

    if (shopName) user.shopName = shopName.trim();
    if (mobile) user.mobile = mobile.trim();
    if (email !== undefined) user.email = email ? email.trim().toLowerCase() : null;
    if (isActive !== undefined) user.isActive = isActive;

    if (subscriptionMonths) {
      const months = parseInt(subscriptionMonths);
      const endDate = user.subscriptionEndDate && user.subscriptionEndDate > new Date() 
        ? new Date(user.subscriptionEndDate) 
        : new Date();
      endDate.setMonth(endDate.getMonth() + months);
      
      // If no start date exists, set it to now
      if (!user.subscriptionStartDate) {
        user.subscriptionStartDate = new Date();
      }
      user.subscriptionEndDate = endDate;
    } else if (subscriptionEndDate) {
      user.subscriptionEndDate = new Date(subscriptionEndDate);
      if (!user.subscriptionStartDate) {
        user.subscriptionStartDate = new Date();
      }
    }

    if (password && password.trim() !== '') {
      user.password = password; // pre-save hook will hash it
      user.passwordText = password;
    }

    await user.save();

    res.json({
      success: true,
      message: 'Shop admin updated successfully.',
      admin: {
        id: user._id,
        shopName: user.shopName,
        mobile: user.mobile,
        isActive: user.isActive,
        subscriptionStartDate: user.subscriptionStartDate,
        subscriptionEndDate: user.subscriptionEndDate,
        createdAt: user.createdAt
      }
    });

  } catch (error) {
    console.error('Update shop admin error:', error);
    res.status(500).json({ success: false, message: 'Server error while updating shop admin.' });
  }
};

module.exports = {
  createShopAdmin,
  createAdminAccount,
  getShopAdmins,
  updateShopAdmin
};
