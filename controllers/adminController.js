const Work = require('../models/Work');
const User = require('../models/User');
const WorkItem = require('../models/WorkItem');
const ExcelJS = require('exceljs');
const PDFDocument = require('pdfkit');

// Get all works with filters
const getAllWorks = async (req, res) => {
  try {
    const { 
      page = 1, 
      limit = 10, 
      startDate, 
      endDate, 
      employeeId, 
      paymentStatus, 
      workStatus, 
      search 
    } = req.query;
    
    // Build query
    const query = {};
    
    // Date range filter
    if (startDate && endDate) {
      const start = new Date(startDate);
      const end = new Date(endDate);
      end.setHours(23, 59, 59, 999);
      query.date = { $gte: start, $lte: end };
    } else if (startDate) {
      query.date = { $gte: new Date(startDate) };
    } else if (endDate) {
      const end = new Date(endDate);
      end.setHours(23, 59, 59, 999);
      query.date = { $lte: end };
    }
    
    // Employee filter
    if (employeeId) {
      query.employee = employeeId;
    }
    
    // Payment status filter
    if (paymentStatus) {
      query.paymentStatus = paymentStatus;
    }
    
    // Work status filter
    if (workStatus) {
      query.workStatus = workStatus;
    }
    
    // Search by customer name or work title
    if (search) {
      query.$or = [
        { customerName: { $regex: search, $options: 'i' } },
        { workTitle: { $regex: search, $options: 'i' } }
      ];
    }

    // Get works with pagination
    const works = await Work.find(query)
      .populate('employee', 'name email employeeId')
      .sort({ date: -1, createdAt: -1 })
      .limit(limit * 1)
      .skip((page - 1) * limit);

    const total = await Work.countDocuments(query);

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
    console.error('Get all works error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error while fetching work entries.'
    });
  }
};

// Get admin dashboard statistics
const getDashboardStats = async (req, res) => {
  try {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const tomorrow = new Date(today);
    tomorrow.setDate(tomorrow.getDate() + 1);

    const thisMonth = new Date(today.getFullYear(), today.getMonth(), 1);

    // Get employee statistics
    const totalEmployees = await User.countDocuments({ role: 'employee', isActive: true });
    
    // Get work statistics
    const todayWorks = await Work.find({
      date: { $gte: today, $lt: tomorrow }
    });

    const monthWorks = await Work.find({
      date: { $gte: thisMonth }
    });

    const totalWorks = await Work.countDocuments({});

    const totalRevenue = await Work.aggregate([
      { $match: { paymentStatus: 'Paid' } },
      { $group: { _id: null, total: { $sum: '$amount' } } }
    ]);

    const monthRevenue = await Work.aggregate([
      { $match: { date: { $gte: thisMonth }, paymentStatus: 'Paid' } },
      { $group: { _id: null, total: { $sum: '$amount' } } }
    ]);

    const todayRevenue = await Work.aggregate([
      { $match: { date: { $gte: today, $lt: tomorrow }, paymentStatus: 'Paid' } },
      { $group: { _id: null, total: { $sum: '$amount' } } }
    ]);

    const pendingPayments = await Work.aggregate([
      { $match: { paymentStatus: 'Pending' } },
      { $group: { _id: null, total: { $sum: '$amount' } } }
    ]);

    res.json({
      success: true,
      stats: {
        employees: {
          total: totalEmployees
        },
        works: {
          today: todayWorks.length,
          month: monthWorks.length,
          total: totalWorks
        },
        revenue: {
          today: todayRevenue[0]?.total || 0,
          month: monthRevenue[0]?.total || 0,
          total: totalRevenue[0]?.total || 0,
          pending: pendingPayments[0]?.total || 0
        }
      }
    });

  } catch (error) {
    console.error('Get dashboard stats error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error while fetching dashboard statistics.'
    });
  }
};

// Get employee performance report
const getEmployeePerformance = async (req, res) => {
  try {
    const { startDate, endDate } = req.query;
    
    // Default to current month if dates not provided
    const today = new Date();
    const start = startDate ? new Date(startDate) : new Date(today.getFullYear(), today.getMonth(), 1);
    const end = endDate ? new Date(endDate) : new Date(today.getFullYear(), today.getMonth() + 1, 0);
    end.setHours(23, 59, 59, 999);

    // Get all active employees
    const employees = await User.find({ role: 'employee', isActive: true }).select('-password');

    // Get performance data for each employee
    const performanceData = await Promise.all(
      employees.map(async (employee) => {
        const works = await Work.find({
          employee: employee._id,
          date: { $gte: start, $lte: end }
        });

        const completedWorks = works.filter(w => w.workStatus === 'Completed');
        const inProgressWorks = works.filter(w => w.workStatus === 'In Progress');
        const paidWorks = works.filter(w => w.paymentStatus === 'Paid');
        const pendingPayments = works.filter(w => w.paymentStatus === 'Pending');

        const totalAmount = works.reduce((sum, w) => sum + w.amount, 0);
        const paidAmount = paidWorks.reduce((sum, w) => sum + w.amount, 0);
        const pendingAmount = pendingPayments.reduce((sum, w) => sum + w.amount, 0);

        return {
          employee: {
            id: employee._id,
            name: employee.name,
            email: employee.email,
            employeeId: employee.employeeId
          },
          stats: {
            totalWorks: works.length,
            completedWorks: completedWorks.length,
            inProgressWorks: inProgressWorks.length,
            totalAmount,
            paidAmount,
            pendingAmount,
            completionRate: works.length > 0 ? (completedWorks.length / works.length * 100).toFixed(1) : 0,
            paymentCollectionRate: totalAmount > 0 ? (paidAmount / totalAmount * 100).toFixed(1) : 0
          }
        };
      })
    );

    // Sort by total works
    performanceData.sort((a, b) => b.stats.totalWorks - a.stats.totalWorks);

    res.json({
      success: true,
      performanceData,
      period: {
        startDate: start,
        endDate: end
      }
    });

  } catch (error) {
    console.error('Get employee performance error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error while fetching employee performance data.'
    });
  }
};

// Get revenue report
const getRevenueReport = async (req, res) => {
  try {
    const { startDate, endDate, groupBy = 'day' } = req.query;
    
    // Default to current month if dates not provided
    const today = new Date();
    const start = startDate ? new Date(startDate) : new Date(today.getFullYear(), today.getMonth(), 1);
    const end = endDate ? new Date(endDate) : new Date(today.getFullYear(), today.getMonth() + 1, 0);
    end.setHours(23, 59, 59, 999);

    // Group by day, month, or year
    let groupByExpr;
    if (groupBy === 'month') {
      groupByExpr = { year: { $year: '$date' }, month: { $month: '$date' } };
    } else if (groupBy === 'year') {
      groupByExpr = { year: { $year: '$date' } };
    } else {
      groupByExpr = { 
        year: { $year: '$date' }, 
        month: { $month: '$date' }, 
        day: { $dayOfMonth: '$date' } 
      };
    }

    // Get revenue data grouped by period
    const revenueData = await Work.aggregate([
      {
        $match: {
          date: { $gte: start, $lte: end }
        }
      },
      {
        $group: {
          _id: groupByExpr,
          totalRevenue: { $sum: { $cond: [{ $eq: ['$paymentStatus', 'Paid'] }, '$adminPrice', 0] } },
          pendingRevenue: { $sum: { $cond: [{ $eq: ['$paymentStatus', 'Pending'] }, '$adminPrice', 0] } },
          enteredTotalRevenue: { $sum: { $cond: [{ $eq: ['$paymentStatus', 'Paid'] }, '$amount', 0] } },
          enteredPendingRevenue: { $sum: { $cond: [{ $eq: ['$paymentStatus', 'Pending'] }, '$amount', 0] } },
          totalWorks: { $sum: 1 },
          paidWorks: { $sum: { $cond: [{ $eq: ['$paymentStatus', 'Paid'] }, 1, 0] } },
          pendingWorks: { $sum: { $cond: [{ $eq: ['$paymentStatus', 'Pending'] }, 1, 0] } }
        }
      },
      {
        $sort: { '_id.year': 1, '_id.month': 1, '_id.day': 1 }
      }
    ]);

    // Format the data
    const formattedData = revenueData.map(item => ({
      period: groupBy === 'year' 
        ? `${item._id.year}` 
        : groupBy === 'month' 
          ? `${item._id.year}-${String(item._id.month).padStart(2, '0')}`
          : `${item._id.year}-${String(item._id.month).padStart(2, '0')}-${String(item._id.day).padStart(2, '0')}`,
      totalRevenue: item.totalRevenue,
      pendingRevenue: item.pendingRevenue,
      enteredTotalRevenue: item.enteredTotalRevenue,
      enteredPendingRevenue: item.enteredPendingRevenue,
      totalWorks: item.totalWorks,
      paidWorks: item.paidWorks,
      pendingWorks: item.pendingWorks
    }));

    res.json({
      success: true,
      revenueData: formattedData,
      period: {
        startDate: start,
        endDate: end,
        groupBy
      }
    });

  } catch (error) {
    console.error('Get revenue report error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error while fetching revenue report.'
    });
  }
};

// Download Revenue Report as Excel
const downloadRevenueExcel = async (req, res) => {
  try {
    const { startDate, endDate } = req.query;
    const today = new Date();
    const start = startDate ? new Date(startDate) : new Date(today.getFullYear(), today.getMonth(), 1);
    const end = endDate ? new Date(endDate) : new Date(today.getFullYear(), today.getMonth() + 1, 0);
    end.setHours(23, 59, 59, 999);

    const works = await Work.find({
      date: { $gte: start, $lte: end }
    }).populate('employee', 'name').sort({ date: 1 });

    const workbook = new ExcelJS.Workbook();
    const worksheet = workbook.addWorksheet('Revenue Report');

    worksheet.columns = [
      { header: 'Date', key: 'date', width: 15 },
      { header: 'Employee', key: 'employee', width: 25 },
      { header: 'Customer/Project', key: 'project', width: 25 },
      { header: 'Work Title', key: 'workTitle', width: 25 },
      { header: 'Revenue (Actual)', key: 'revenue', width: 15 },
      { header: 'Revenue (Expected)', key: 'expectedRevenue', width: 18 },
      { header: 'Payment Status', key: 'paymentStatus', width: 15 }
    ];

    works.forEach(work => {
      worksheet.addRow({
        date: new Date(work.date).toLocaleDateString('en-IN'),
        employee: work.employee ? work.employee.name : 'Unknown',
        project: work.customerName,
        workTitle: work.workTitle,
        revenue: work.amount,
        expectedRevenue: work.adminPrice > 0 ? work.adminPrice : work.amount,
        paymentStatus: work.paymentStatus
      });
    });

    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', 'attachment; filename=Revenue_Report.xlsx');

    await workbook.xlsx.write(res);
    res.end();
  } catch (error) {
    console.error('Download Excel error:', error);
    res.status(500).json({ success: false, message: 'Server error while downloading Excel report.' });
  }
};

// Download Revenue Report as PDF
const downloadRevenuePDF = async (req, res) => {
  try {
    const { startDate, endDate } = req.query;
    const today = new Date();
    const start = startDate ? new Date(startDate) : new Date(today.getFullYear(), today.getMonth(), 1);
    const end = endDate ? new Date(endDate) : new Date(today.getFullYear(), today.getMonth() + 1, 0);
    end.setHours(23, 59, 59, 999);

    const works = await Work.find({
      date: { $gte: start, $lte: end }
    }).populate('employee', 'name').sort({ date: 1 });

    const doc = new PDFDocument({ margin: 30, size: 'A4' });

    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', 'attachment; filename=Revenue_Report.pdf');

    doc.pipe(res);

    doc.fontSize(20).text('Revenue Report', { align: 'center' });
    doc.moveDown();
    doc.fontSize(12).text(`Date Range: ${start.toLocaleDateString('en-IN')} to ${end.toLocaleDateString('en-IN')}`);
    doc.moveDown();

    const tableTop = margin => doc.y;
    let y = tableTop();
    const itemX = { date: 30, emp: 100, proj: 200, title: 290, amt: 380, exp: 450, status: 520 };
    
    // Header
    doc.fontSize(10).font('Helvetica-Bold');
    doc.text('Date', itemX.date, y);
    doc.text('Employee', itemX.emp, y);
    doc.text('Project', itemX.proj, y);
    doc.text('Title', itemX.title, y);
    doc.text('Actual Rev', itemX.amt, y);
    doc.text('Expect Rev', itemX.exp, y);
    doc.text('Status', itemX.status, y);

    doc.moveTo(30, y + 15).lineTo(560, y + 15).stroke();
    y += 20;
    
    doc.font('Helvetica');
    let totalRevenue = 0;
    let totalExpected = 0;

    works.forEach(work => {
      if (y > 750) {
        doc.addPage();
        y = 30;
      }
      totalRevenue += work.amount;
      totalExpected += work.adminPrice > 0 ? work.adminPrice : work.amount;
      
      const empName = work.employee ? work.employee.name : 'Unknown';
      const projName = work.customerName.length > 15 ? work.customerName.substring(0, 13) + '..' : work.customerName;
      const titleName = work.workTitle.length > 15 ? work.workTitle.substring(0, 13) + '..' : work.workTitle;

      doc.text(new Date(work.date).toLocaleDateString('en-IN'), itemX.date, y);
      doc.text(empName.length > 15 ? empName.substring(0, 13) + '..' : empName, itemX.emp, y);
      doc.text(projName, itemX.proj, y);
      doc.text(titleName, itemX.title, y);
      doc.text(`Rs.${work.amount}`, itemX.amt, y);
      doc.text(`Rs.${work.adminPrice > 0 ? work.adminPrice : work.amount}`, itemX.exp, y);
      doc.text(work.paymentStatus, itemX.status, y);
      
      y += 20;
    });

    doc.moveTo(30, y).lineTo(560, y).stroke();
    y += 10;
    doc.font('Helvetica-Bold').text(`Total Actual: Rs.${totalRevenue} | Total Expected: Rs.${totalExpected}`, 30, y, { align: 'right' });

    doc.end();
  } catch (error) {
    console.error('Download PDF error:', error);
    res.status(500).json({ success: false, message: 'Server error while downloading PDF report.' });
  }
};

// WorkItem CRUD Operations
const createWorkItem = async (req, res) => {
  try {
    const { name, price } = req.body;
    const workItem = new WorkItem({ name, price });
    await workItem.save();
    res.status(201).json({ success: true, message: 'Work item created successfully', workItem });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Server error while creating work item' });
  }
};

const getAllWorkItems = async (req, res) => {
  try {
    const workItems = await WorkItem.find().sort({ createdAt: -1 });
    res.json({ success: true, workItems });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Server error while fetching work items' });
  }
};

const updateWorkItem = async (req, res) => {
  try {
    const { name, price, isActive } = req.body;
    const workItem = await WorkItem.findByIdAndUpdate(req.params.id, { name, price, isActive }, { new: true });
    if (!workItem) return res.status(404).json({ success: false, message: 'Work item not found' });
    res.json({ success: true, message: 'Work item updated', workItem });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Server error while updating work item' });
  }
};

const deleteWorkItem = async (req, res) => {
  try {
    const workItem = await WorkItem.findByIdAndDelete(req.params.id);
    if (!workItem) return res.status(404).json({ success: false, message: 'Work item not found' });
    res.json({ success: true, message: 'Work item deleted' });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Server error while deleting work item' });
  }
};

module.exports = {
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
};