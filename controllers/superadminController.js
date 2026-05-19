const User = require('../models/User');
const bcrypt = require('bcryptjs');

// Create a new shop admin
const createShopAdmin = async (req, res) => {
  try {
    const { shopName, mobile, password, subscriptionMonths } = req.body;

    if (!shopName || !mobile || !password) {
      return res.status(400).json({ success: false, message: 'Shop name, mobile, and password are required.' });
    }

    const months = parseInt(subscriptionMonths) || 1;
    const startDate = new Date();
    const endDate = new Date();
    endDate.setMonth(endDate.getMonth() + months);

    const existingUser = await User.findOne({ mobile: mobile.trim() });
    if (existingUser) {
      return res.status(400).json({ success: false, message: 'Mobile number already in use.' });
    }

    const user = new User({
      name: 'Shop Admin',
      mobile: mobile.trim(),
      password,
      role: 'admin',
      shopName: shopName.trim(),
      isActive: true,
      subscriptionStartDate: startDate,
      subscriptionEndDate: endDate
    });

    await user.save();

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
    res.status(500).json({ success: false, message: 'Server error while creating shop admin.' });
  }
};

// Get all shop admins
const getShopAdmins = async (req, res) => {
  try {
    const admins = await User.find({ role: 'admin' })
      .select('shopName mobile isActive subscriptionStartDate subscriptionEndDate createdAt lastLogin')
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
    const { shopName, mobile, password, isActive, subscriptionMonths, subscriptionEndDate } = req.body;

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
  getShopAdmins,
  updateShopAdmin
};
