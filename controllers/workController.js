const Work = require('../models/Work');
const User = require('../models/User');
const WorkItem = require('../models/WorkItem');
const purchaseController = require('./purchaseController');
const { generateReceiptPDF } = require('../utils/pdfUtil');
const { sendWhatsAppDocument } = require('../utils/whatsappUtil');
const path = require('path');
const fs = require('fs');

const parseLocalDate = (dateStr) => {
  if (!dateStr) return null;
  const [year, month, day] = dateStr.split('-');
  return new Date(Number(year), Number(month) - 1, Number(day));
};

// Create work entry
const createWork = async (req, res) => {
  try {
    console.log("WORK ADD DATA:", req.body);
    
    let { 
      date, 
      customerName, 
      customerPhone, 
      paymentMethod, 
      gpayAmount = 0, 
      cashAmount = 0, 
      items, 
      paymentStatus,
      workStatus, 
      notes,
      applicationFee = 0,
      amount: originalAmount = 0
    } = req.body;

    // Convert to numbers
    gpayAmount = Number(gpayAmount) || 0;
    cashAmount = Number(cashAmount) || 0;
    let totalAmount = 0;

    // Payment Logic as requested
    if (paymentMethod === "GPay") {
      totalAmount = gpayAmount;
      cashAmount = 0;
    } else if (paymentMethod === "Cash") {
      totalAmount = cashAmount;
      gpayAmount = 0;
    } else if (paymentMethod === "Both") {
      totalAmount = gpayAmount + cashAmount;
      if (totalAmount <= 0) {
        return res.status(400).json({ 
          success: false,
          message: "Invalid split amount. Total must be greater than 0." 
        });
      }
    }

    let totalWorkCharge = 0;
    let totalServiceCharge = 0;
    let totalOtherCharges = 0;
    let totalDiscount = 0;
    let calculatedAppFee = 0;
    const processedItems = [];

    if (items && Array.isArray(items)) {
      const workItemIds = items.filter(i => i.workItemId).map(i => i.workItemId);
      const workItemsList = await WorkItem.find({ _id: { $in: workItemIds } }).lean();
      const workItemsMap = workItemsList.reduce((acc, curr) => {
        acc[curr._id.toString()] = curr;
        return acc;
      }, {});

      for (const item of items) {
        const qty = parseInt(item.quantity) || 1;
        const itemOtherC = parseFloat(item.otherCharges) || 0;
        const itemDiscount = parseFloat(item.discount) || 0;
        const itemPresetAmt = parseFloat(item.presetAmount) || 0;
        totalOtherCharges += itemOtherC;
        totalDiscount += itemDiscount;
        if (item.presetChargeType !== 'AEPS') {
          calculatedAppFee += itemPresetAmt;
        }
        
        if (item.workItemId) {
          const selectedItem = workItemsMap[item.workItemId.toString()];
          if (selectedItem) {
            totalWorkCharge += selectedItem.workCharge * qty;
            totalServiceCharge += selectedItem.serviceCharge * qty;
            processedItems.push({
              workItemId: item.workItemId,
              title: selectedItem.name,
              workChargeAtTime: selectedItem.workCharge,
              serviceChargeAtTime: selectedItem.serviceCharge,
              quantity: qty,
              otherCharges: itemOtherC,
              discount: itemDiscount,
              presetAmount: parseFloat(item.presetAmount) || 0,
              presetChargeType: item.presetChargeType || 'None',
              applicationNumber: item.applicationNumber
            });
          }
        } else if (item.workTitle) {
          processedItems.push({
            title: item.workTitle,
            workChargeAtTime: 0,
            serviceChargeAtTime: 0,
            quantity: qty,
            otherCharges: itemOtherC,
            discount: itemDiscount,
            presetAmount: parseFloat(item.presetAmount) || 0,
            presetChargeType: item.presetChargeType || 'None',
            applicationNumber: item.applicationNumber
          });
        }
      }
    }

    const currentTime = new Date();
    let workDate = date ? new Date(date) : currentTime;
    if (isNaN(workDate.getTime())) {
      workDate = currentTime;
    }

    // Validate Shop Balance for Handcash to Gpay Transfer only if becoming Paid
    const transferItem = items.find(i => i.workTitle?.toLowerCase().includes('handcash to gpay transfer') || i.title?.toLowerCase().includes('handcash to gpay transfer'));
    if (transferItem && paymentStatus === 'Paid') {
      const adminId = req.user.role === 'admin' ? req.user._id : req.user.adminId;
      const balances = await purchaseController.getShopBalanceInternal(adminId);
      const currentBalance = balances.handCashBalance;
      if (calculatedAppFee > currentBalance) {
        return res.status(400).json({
          success: false,
          message: `Insufficient Shop Balance. Available: ₹${currentBalance.toLocaleString()}`
        });
      }
    }

    const hasAEPS = processedItems.every(item => item.presetChargeType === 'AEPS');

    // Create work entry (using 'employee' field as per model)
    const work = await Work.create({
      employee: req.user.id,
      adminId: req.user.role === 'admin' ? req.user._id : req.user.adminId,
      date: workDate,
      customerName,
      customerPhone,
      paymentMethod,
      gpayAmount,
      cashAmount,
      totalAmount,
      amount: originalAmount || totalAmount, // Preserve the actual amount for pending entries
      items: processedItems,
      adminPrice: totalWorkCharge + totalServiceCharge,
      totalDiscount: totalDiscount,
      otherCharges: totalOtherCharges,
      paymentStatus: paymentStatus || 'Pending',
      workStatus: workStatus || 'In Progress',
      notes,
      applicationFee: calculatedAppFee
    });

    // Populate employee details
    await work.populate('employee', 'name email employeeId');

    res.status(201).json({
      success: true,
      message: 'Work entry created successfully.',
      work
    });

  } catch (error) {
    console.error('Create work error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error while creating work entry.'
    });
  }
};

// Get all works for all employees (View only for employees)
const getAllEmployeeWorks = async (req, res) => {
  try {
    const { page = 1, limit = 10, startDate, endDate, employeeId, paymentStatus, workStatus, search } = req.query;

    const query = {
      adminId: req.user.role === 'admin' ? req.user._id : req.user.adminId
    };

    if (startDate && endDate) {
      const start = parseLocalDate(startDate);
      const end = parseLocalDate(endDate);
      end.setHours(23, 59, 59, 999);
      query.date = { $gte: start, $lte: end };
    }

    if (employeeId) query.employee = employeeId;
    if (paymentStatus) query.paymentStatus = paymentStatus;
    if (workStatus) {
      if (workStatus === 'Pending') {
        query.workStatus = { $in: ['Pending', 'In Progress'] };
      } else {
        query.workStatus = workStatus;
      }
    }

    if (search) {
      query.$or = [
        { customerName: { $regex: search, $options: 'i' } },
        { 'items.title': { $regex: search, $options: 'i' } }
      ];
    }

    const [works, total] = await Promise.all([
      Work.find(query)
        .populate('employee', 'name mobile employeeId')
        .sort({ date: -1, createdAt: -1 })
        .limit(limit * 1)
        .skip((page - 1) * limit)
        .lean(),
      Work.countDocuments(query)
    ]);

    res.json({
      success: true,
      works,
      pagination: {
        currentPage: parseInt(page),
        totalPages: Math.ceil(total / limit),
        totalWorks: total,
        hasNextPage: page < Math.ceil(total / limit),
        hasPrevPage: page > 1
      }
    });
  } catch (error) {
    console.error('Get all employee works error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error while fetching all employee work entries.'
    });
  }
};

// Get work entries for current user
const getMyWorks = async (req, res) => {
  try {
    const { page = 1, limit = 10, date, startDate, endDate, status, search } = req.query;

    // Build query
    const query = { employee: req.user._id };

    if (date) {
      const start = parseLocalDate(date);
      const end = new Date(start);
      end.setHours(23, 59, 59, 999);
      query.date = { $gte: start, $lte: end };
    }

    if (startDate || endDate) {
      query.date = {};
      if (startDate) {
        const start = parseLocalDate(startDate);
        query.date.$gte = start;
      }
      if (endDate) {
        const end = parseLocalDate(endDate);
        end.setHours(23, 59, 59, 999);
        query.date.$lte = end;
      }
    }

    if (status) {
      if (status === 'Pending') {
        query.workStatus = { $in: ['Pending', 'In Progress'] };
      } else {
        query.workStatus = status;
      }
    }

    if (search) {
      query.$or = [
        { customerName: { $regex: search, $options: 'i' } },
        { 'items.title': { $regex: search, $options: 'i' } }
      ];
    }

    // Get works with pagination concurrently
    const [works, total] = await Promise.all([
      Work.find(query)
        .populate('employee', 'name email employeeId')
        .sort({ date: -1, createdAt: -1 })
        .limit(limit * 1)
        .skip((page - 1) * limit)
        .lean(),
      Work.countDocuments(query)
    ]);

    res.json({
      success: true,
      works,
      pagination: {
        currentPage: parseInt(page),
        totalPages: Math.ceil(total / limit),
        totalWorks: total,
        hasNextPage: page < Math.ceil(total / limit),
        hasPrevPage: page > 1
      }
    });

  } catch (error) {
    console.error('Get my works error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error while fetching work entries.'
    });
  }
};

// Get work entry by ID
const getWorkById = async (req, res) => {
  try {
    const work = await Work.findById(req.params.id)
      .populate('employee', 'name email employeeId');

    if (!work) {
      return res.status(404).json({
        success: false,
        message: 'Work entry not found.'
      });
    }

    // Check if user can access this work
    const workAdminId = work.adminId?.toString();
    const userAdminId = (req.user.role === 'admin' ? req.user._id : req.user.adminId)?.toString();

    if (workAdminId && workAdminId !== userAdminId) {
      return res.status(403).json({
        success: false,
        message: 'Access denied.'
      });
    }

    if (req.user.role === 'employee' && work.employee._id.toString() !== req.user._id.toString()) {
      return res.status(403).json({
        success: false,
        message: 'Access denied.'
      });
    }

    res.json({
      success: true,
      work
    });

  } catch (error) {
    console.error('Get work by ID error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error while fetching work entry.'
    });
  }
};

// Update work entry
const updateWork = async (req, res) => {
  try {
    let { 
      date, 
      customerName, 
      customerPhone, 
      paymentMethod, 
      gpayAmount = 0, 
      cashAmount = 0, 
      items, 
      paymentStatus, 
      workStatus, 
      notes,
      applicationFee,
      amount: originalAmount = 0
    } = req.body;

    const work = await Work.findById(req.params.id);

    if (!work) {
      return res.status(404).json({
        success: false,
        message: 'Work entry not found.'
      });
    }

    // Check if user can update this work
    const workAdminId = work.adminId?.toString();
    const userAdminId = (req.user.role === 'admin' ? req.user._id : req.user.adminId)?.toString();

    if (workAdminId && workAdminId !== userAdminId) {
      return res.status(403).json({
        success: false,
        message: 'Access denied.'
      });
    }

    if (req.user.role === 'employee' && work.employee.toString() !== req.user.id) {
      return res.status(403).json({
        success: false,
        message: 'Access denied.'
      });
    }

    // Convert to numbers
    gpayAmount = Number(gpayAmount) || 0;
    cashAmount = Number(cashAmount) || 0;
    originalAmount = Number(originalAmount) || 0;
    let totalAmount = 0;
    let finalAmount = originalAmount;

    // Payment Logic as requested
    if (paymentMethod === "GPay") {
      totalAmount = gpayAmount;
      cashAmount = 0;
    } else if (paymentMethod === "Cash") {
      totalAmount = cashAmount;
      gpayAmount = 0;
    } else if (paymentMethod === "Both") {
      totalAmount = gpayAmount + cashAmount;
      if (totalAmount <= 0) {
        return res.status(400).json({ 
          success: false,
          message: "Invalid split amount. Total must be greater than 0." 
        });
      }
    }
    
    finalAmount = originalAmount || totalAmount;

    // Update fields
    if (date) {
      const updatedDate = new Date(date);
      if (!isNaN(updatedDate.getTime())) {
        work.date = updatedDate;
      }
    }
    if (customerName) work.customerName = customerName;
    if (customerPhone !== undefined) work.customerPhone = customerPhone;
    if (paymentMethod) work.paymentMethod = paymentMethod;
    work.gpayAmount = gpayAmount;
    work.cashAmount = cashAmount;
    work.totalAmount = totalAmount;
    work.amount = finalAmount; // Preserve amount
    if (paymentStatus) work.paymentStatus = paymentStatus;
    if (workStatus) work.workStatus = workStatus;
    if (notes !== undefined) work.notes = notes;
    if (applicationFee !== undefined) work.applicationFee = Number(applicationFee) || 0;

    // Secondary check for transfer in processed items
    let calculatedAppFee = work.applicationFee;

    if (items && Array.isArray(items)) {
      let totalWorkCharge = 0;
      let totalServiceCharge = 0;
      let totalOtherCharges = 0;
      let totalDiscount = 0;
      calculatedAppFee = 0;
      const processedItems = [];

      const workItemIds = items.filter(i => i.workItemId).map(i => i.workItemId);
      const workItemsList = await WorkItem.find({ _id: { $in: workItemIds } }).lean();
      const workItemsMap = workItemsList.reduce((acc, curr) => {
        acc[curr._id.toString()] = curr;
        return acc;
      }, {});

      for (const item of items) {
        const qty = parseInt(item.quantity) || 1;
        const itemOtherC = parseFloat(item.otherCharges) || 0;
        const itemDiscount = parseFloat(item.discount) || 0;
        const itemPresetAmt = parseFloat(item.presetAmount) || 0;
        totalOtherCharges += itemOtherC;
        totalDiscount += itemDiscount;
        if (item.presetChargeType !== 'AEPS') {
          calculatedAppFee += itemPresetAmt;
        }
        if (item.workItemId) {
          const selectedItem = workItemsMap[item.workItemId.toString()];
          if (selectedItem) {
            totalWorkCharge += selectedItem.workCharge * qty;
            totalServiceCharge += selectedItem.serviceCharge * qty;
            processedItems.push({
              workItemId: item.workItemId,
              title: selectedItem.name,
              workChargeAtTime: selectedItem.workCharge,
              serviceChargeAtTime: selectedItem.serviceCharge,
              quantity: qty,
              otherCharges: itemOtherC,
              discount: itemDiscount,
              presetAmount: parseFloat(item.presetAmount) || 0,
              presetChargeType: item.presetChargeType || 'None',
              applicationNumber: item.applicationNumber
            });
          }
        } else if (item.workTitle) {
          processedItems.push({
            title: item.workTitle,
            workChargeAtTime: 0,
            serviceChargeAtTime: 0,
            quantity: qty,
            otherCharges: itemOtherC,
            discount: itemDiscount,
            presetAmount: parseFloat(item.presetAmount) || 0,
            presetChargeType: item.presetChargeType || 'None',
            applicationNumber: item.applicationNumber
          });
        }
      }
      work.items = processedItems;
      work.adminPrice = totalWorkCharge + totalServiceCharge;
      work.totalDiscount = totalDiscount;
      work.otherCharges = totalOtherCharges;
      work.applicationFee = calculatedAppFee;
      
      // AEPS paymentStatus override removed
    }
    // Secondary check for transfer in processed items
    const transferItem = work.items.find(i => i.title.toLowerCase().includes('handcash to gpay transfer'));
    if (transferItem && work.paymentStatus === 'Paid') {
      const adminId = req.user.role === 'admin' ? req.user._id : req.user.adminId;
      const balances = await purchaseController.getShopBalanceInternal(adminId);
      let currentBalance = balances.handCashBalance;
      // We must account for the current entry if it was already Paid (don't double count)
      // But getShopBalanceInternal already includes all PAID entries.
      // If we are UPDATING an existing Paid entry, we should add back its previous fee before checking.
      let balanceToCheck = currentBalance;
      const oldWork = await Work.findById(req.params.id);
      if (oldWork && oldWork.paymentStatus === 'Paid' && oldWork.items.some(i => i.title.toLowerCase().includes('handcash to gpay transfer'))) {
         balanceToCheck += oldWork.applicationFee;
      }

      if (calculatedAppFee > balanceToCheck) {
        return res.status(400).json({
          success: false,
          message: `Insufficient Shop Balance. Available: ₹${balanceToCheck.toLocaleString()}`
        });
      }
    }

    await work.save();

    // Populate employee details
    await work.populate('employee', 'name email employeeId');

    res.json({
      success: true,
      message: 'Work entry updated successfully.',
      work
    });

  } catch (error) {
    console.error('Update work error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error while updating work entry.'
    });
  }
};

// Delete work entry
const deleteWork = async (req, res) => {
  try {
    const work = await Work.findById(req.params.id);

    if (!work) {
      return res.status(404).json({
        success: false,
        message: 'Work entry not found.'
      });
    }

    // Check if user can delete this work
    const workAdminId = work.adminId?.toString();
    const userAdminId = (req.user.role === 'admin' ? req.user._id : req.user.adminId)?.toString();

    if (workAdminId && workAdminId !== userAdminId) {
      return res.status(403).json({
        success: false,
        message: 'Access denied.'
      });
    }

    if (req.user.role === 'employee' && work.employee.toString() !== req.user._id.toString()) {
      return res.status(403).json({
        success: false,
        message: 'Access denied.'
      });
    }

    await Work.findByIdAndDelete(req.params.id);

    res.json({
      success: true,
      message: 'Work entry deleted successfully.'
    });

  } catch (error) {
    console.error('Delete work error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error while deleting work entry.'
    });
  }
};

// Get work statistics for current user
const getMyWorkStats = async (req, res) => {
  try {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const tomorrow = new Date(today);
    tomorrow.setDate(tomorrow.getDate() + 1);

    const thisMonth = new Date(today.getFullYear(), today.getMonth(), 1);

    // Get statistics
    const todayWorks = await Work.find({
      employee: req.user._id,
      date: { $gte: today, $lt: tomorrow }
    });

    const monthWorks = await Work.find({
      employee: req.user._id,
      date: { $gte: thisMonth }
    });

    const totalWorks = await Work.countDocuments({ employee: req.user._id, date: { $gte: thisMonth } });

    const totalEarnings = await Work.aggregate([
      { $match: { employee: req.user._id, paymentStatus: 'Paid', date: { $gte: thisMonth } } },
      { $group: { _id: null, total: { $sum: { $ifNull: ['$totalAmount', '$amount'] } } } }
    ]);

    const aepsWorksCount = await Work.countDocuments({ employee: req.user._id, 'items.presetChargeType': 'AEPS', date: { $gte: today, $lt: tomorrow } });
    const aepsAmountAgg = await Work.aggregate([
      { $match: { employee: req.user._id, 'items.presetChargeType': 'AEPS', date: { $gte: today, $lt: tomorrow } } },
      { $unwind: '$items' },
      { $match: { 'items.presetChargeType': 'AEPS' } },
      { $group: { _id: null, totalAepsAmount: { $sum: { $ifNull: ['$items.presetAmount', 0] } } } }
    ]);
    const totalAepsAmount = aepsAmountAgg[0]?.totalAepsAmount || 0;

    res.json({
      success: true,
      stats: {
        todayWorks: todayWorks.length,
        todayEarnings: todayWorks.filter(w => w.paymentStatus === 'Paid').reduce((sum, w) => sum + (w.totalAmount || w.amount), 0),
        monthWorks: monthWorks.filter(w => w.workStatus === 'Completed').length,
        monthEarnings: monthWorks.filter(w => w.paymentStatus === 'Paid').reduce((sum, w) => sum + (w.totalAmount || w.amount), 0),
        totalWorks,
        totalEarnings: totalEarnings[0]?.total || 0,
        pendingWorks: monthWorks.filter(w => ['Pending', 'In Progress'].includes(w.workStatus)).length,
        pendingAmount: monthWorks.filter(w => w.paymentStatus === 'Pending').reduce((sum, w) => sum + (w.totalAmount || w.amount), 0),
        aeps: {
          count: aepsWorksCount,
          amount: totalAepsAmount
        }
      }
    });

  } catch (error) {
    console.error('Get my work stats error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error while fetching work statistics.'
    });
  }
};

// Get active work items for dropdown
const getActiveWorkItems = async (req, res) => {
  try {
    const adminId = req.user.role === 'admin' ? req.user._id : req.user.adminId;
    const workItems = await WorkItem.find({ adminId, $or: [{ status: true }, { isActive: true }] }).sort({ name: 1 });
    res.json({
      success: true,
      workItems
    });
  } catch (error) {
    console.error('Get work items error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error while fetching work items.'
    });
  }
};

// Get total shop balance (cash only)
const getShopBalance = async (req, res) => {
  try {
    const adminId = req.user.role === 'admin' ? req.user._id : req.user.adminId;
    const balances = await purchaseController.calculateBalance(adminId);
    
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const tomorrow = new Date(today);
    tomorrow.setDate(tomorrow.getDate() + 1);
    
    const todayGpayAgg = await Work.aggregate([
      { $match: { adminId, date: { $gte: today, $lt: tomorrow }, paymentStatus: 'Paid' } },
      { $group: { _id: null, total: { $sum: { $ifNull: ['$gpayAmount', 0] } } } }
    ]);
    const todayGpayDeductionsAgg = await Work.aggregate([
      { $match: { adminId, date: { $gte: today, $lt: tomorrow }, items: { $type: 'array' } } },
      { $unwind: '$items' },
      { $match: { 'items.presetChargeType': 'GPay' } },
      { $group: { _id: null, total: { $sum: '$items.presetAmount' } } }
    ]);
    const todayGpay = (todayGpayAgg[0]?.total || 0) - (todayGpayDeductionsAgg[0]?.total || 0);

    res.json({
      success: true,
      shopBalance: balances.handCashBalance,
      gpayBalance: balances.gpayBalance,
      todayGpay: todayGpay
    });
  } catch (error) {
    console.error('SHOP BALANCE ERROR:', error);
    res.status(500).json({
      success: false,
      message: 'Server error while fetching shop balance.'
    });
  }
};

// Send WhatsApp Bill
const sendWhatsAppBill = async (req, res) => {
  try {
    const { id } = req.params;
    const work = await Work.findById(id).populate('employee', 'name mobile employeeId');

    if (!work) {
      return res.status(404).json({ success: false, message: 'Work not found' });
    }

    if (!work.customerPhone) {
      return res.status(400).json({ success: false, message: 'Customer phone number is missing' });
    }

    // Generate PDF
    const receiptsDir = path.join(__dirname, '../public/receipts');
    if (!fs.existsSync(receiptsDir)) {
      fs.mkdirSync(receiptsDir, { recursive: true });
    }

    const fileName = `receipt_${work._id}.pdf`;
    const filePath = path.join(receiptsDir, fileName);

    await generateReceiptPDF(work, filePath);

    // Create public URL (no longer strictly needed for WhatsApp, but good to have)
    let baseUrl = process.env.API_URL || `${req.protocol}://${req.get('host')}`;
    const pdfUrl = `${baseUrl}/public/receipts/${fileName}`;

    // Send via WhatsApp (Upload directly since localhost links are rejected by WhatsApp)
    const safeName = (work.customerName || 'Customer').replace(/\s+/g, '_');
    await sendWhatsAppDocument(work.customerPhone, filePath, `Receipt_${safeName}.pdf`);

    res.status(200).json({ success: true, message: 'WhatsApp bill sent successfully' });
  } catch (error) {
    console.error('Error sending WhatsApp bill:', error);
    res.status(500).json({ success: false, message: 'Failed to send WhatsApp bill', error: error.message });
  }
};

module.exports = {
  createWork,
  getMyWorks,
  getAllEmployeeWorks,
  getWorkById,
  updateWork,
  deleteWork,
  getMyWorkStats,
  getActiveWorkItems,
  getShopBalance,
  sendWhatsAppBill
};
