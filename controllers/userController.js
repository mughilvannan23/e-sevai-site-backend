const User = require('../models/User');
const { sendWelcomeEmail } = require('../utils/email');

// Create employee
const createEmployee = async (req, res) => {
  try {
    const { name, email, password } = req.body;

    // Check if user already exists
    const existingUser = await User.findOne({ email: email.toLowerCase() });
    if (existingUser) {
      return res.status(400).json({
        success: false,
        message: 'User with this email already exists.'
      });
    }

    // Create new employee
    const user = new User({
      name,
      email: email.toLowerCase(),
      password,
      role: 'employee'
    });

    await user.save();

    // Send welcome email
    try {
      await sendWelcomeEmail(email, name, password);
    } catch (emailError) {
      console.error('Failed to send welcome email:', emailError);
    }

    res.status(201).json({
      success: true,
      message: 'Employee created successfully.',
      user: {
        id: user._id,
        name: user.name,
        email: user.email,
        role: user.role,
        employeeId: user.employeeId,
        isActive: user.isActive
      }
    });

  } catch (error) {
    console.error('Create employee error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error while creating employee.'
    });
  }
};

// Get all employees
const getEmployees = async (req, res) => {
  try {
    const { page = 1, limit = 10, search, status } = req.query;
    
    // Build query
    const query = { role: 'employee' };
    
    if (search) {
      query.$or = [
        { name: { $regex: search, $options: 'i' } },
        { email: { $regex: search, $options: 'i' } },
        { employeeId: { $regex: search, $options: 'i' } }
      ];
    }
    
    if (status) {
      query.isActive = status === 'active';
    }

    // Get employees with pagination
    const employees = await User.find(query)
      .select('-password')
      .sort({ createdAt: -1 })
      .limit(limit * 1)
      .skip((page - 1) * limit);

    const total = await User.countDocuments(query);

    res.json({
      success: true,
      employees,
      pagination: {
        currentPage: parseInt(page),
        totalPages: Math.ceil(total / limit),
        totalEmployees: total,
        hasNextPage: page < Math.ceil(total / limit),
        hasPrevPage: page > 1
      }
    });

  } catch (error) {
    console.error('Get employees error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error while fetching employees.'
    });
  }
};

// Get employee by ID
const getEmployeeById = async (req, res) => {
  try {
    const user = await User.findById(req.params.id).select('-password');
    
    if (!user || user.role !== 'employee') {
      return res.status(404).json({
        success: false,
        message: 'Employee not found.'
      });
    }

    res.json({
      success: true,
      user
    });

  } catch (error) {
    console.error('Get employee by ID error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error while fetching employee.'
    });
  }
};

// Update employee
const updateEmployee = async (req, res) => {
  try {
    console.log("Updating employee ID:", req.params.id);
    console.log("Request body:", req.body);
    
    const user = await User.findById(req.params.id);
    
    if (!user || user.role !== 'employee') {
      return res.status(404).json({
        success: false,
        message: 'Employee not found.'
      });
    }

    const { name, email, isActive, password } = req.body;

    // Check if email is already taken by another user
    if (email && email.toLowerCase() !== user.email) {
      const existingUser = await User.findOne({ 
        email: email.toLowerCase(), 
        _id: { $ne: user._id } 
      });
      if (existingUser) {
        return res.status(400).json({
          success: false,
          message: 'Email is already in use.'
        });
      }
    }

    // Update fields manually
    user.name = name || user.name;
    user.email = email ? email.toLowerCase() : user.email;
    if (isActive !== undefined) {
      user.isActive = isActive;
    }

    // Password logic
    if (password && password.trim() !== '') {
      user.password = password;
    }

    await user.save();
    console.log("Updated user:", user);

    res.json({
      success: true,
      message: 'Employee updated successfully',
      user: {
        id: user._id,
        name: user.name,
        email: user.email,
        role: user.role,
        employeeId: user.employeeId,
        isActive: user.isActive
      }
    });

  } catch (error) {
    console.error('Update employee error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error while updating employee.'
    });
  }
};

// Delete employee
const deleteEmployee = async (req, res) => {
  try {
    const user = await User.findById(req.params.id);
    
    if (!user || user.role !== 'employee') {
      return res.status(404).json({
        success: false,
        message: 'Employee not found.'
      });
    }

    // Soft delete by deactivating
    user.isActive = false;
    await user.save();

    res.json({
      success: true,
      message: 'Employee deactivated successfully.'
    });

  } catch (error) {
    console.error('Delete employee error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error while deleting employee.'
    });
  }
};

// Get employee statistics
const getEmployeeStats = async (req, res) => {
  try {
    const totalEmployees = await User.countDocuments({ role: 'employee', isActive: true });
    const activeEmployees = await User.countDocuments({ 
      role: 'employee', 
      isActive: true,
      lastLogin: { $gte: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000) } // Last 30 days
    });
    const inactiveEmployees = totalEmployees - activeEmployees;

    res.json({
      success: true,
      stats: {
        totalEmployees,
        activeEmployees,
        inactiveEmployees
      }
    });

  } catch (error) {
    console.error('Get employee stats error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error while fetching employee statistics.'
    });
  }
};

module.exports = {
  createEmployee,
  getEmployees,
  getEmployeeById,
  updateEmployee,
  deleteEmployee,
  getEmployeeStats
};