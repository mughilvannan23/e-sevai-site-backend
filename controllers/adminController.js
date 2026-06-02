const Work = require('../models/Work');
const User = require('../models/User');
const WorkItem = require('../models/WorkItem');
const ExcelJS = require('exceljs');
const PDFDocument = require('pdfkit');
const bcrypt = require('bcryptjs');
const purchaseController = require('./purchaseController');

const parseLocalDate = (dateStr) => {
    if (!dateStr) return null;
    const [year, month, day] = dateStr.split('-');
    return new Date(Number(year), Number(month) - 1, Number(day));
};

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
        const query = {
            adminId: req.user.role === 'admin' ? req.user._id : req.user.adminId
        };

        // Date range filter
        if (startDate && endDate) {
            const start = parseLocalDate(startDate);
            const end = parseLocalDate(endDate);
            end.setHours(23, 59, 59, 999);
            query.date = { $gte: start, $lte: end };
        } else if (startDate) {
            query.date = { $gte: parseLocalDate(startDate) };
        } else if (endDate) {
            const end = parseLocalDate(endDate);
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
            if (workStatus === 'Pending') {
                query.workStatus = { $in: ['Pending', 'In Progress'] };
            } else {
                query.workStatus = workStatus;
            }
        }

        // Search by customer name or work title
        if (search) {
            query.$or = [
                { customerName: { $regex: search, $options: 'i' } },
                { 'items.title': { $regex: search, $options: 'i' } }
            ];
        }

        // Get works with pagination concurrently
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

        const adminId = req.user.role === 'admin' ? req.user._id : req.user.adminId;
        
        // Parallelize database queries
        const [
            totalEmployees,
            todayWorks,
            monthWorks,
            totalWorks,
            totalRevenueAgg,
            monthRevenueAgg,
            todayRevenueAgg,
            todayGpayAgg,
            pendingPaymentsCount,
            pendingWorks,
            completedWorks,
            totalProfitAgg,
            shopBalances,
            aepsWorksCount,
            aepsAmountAgg,
            todayGpayDeductionsAgg
        ] = await Promise.all([
            User.countDocuments({ role: 'employee', isActive: true, adminId }),
            Work.find({ adminId, date: { $gte: today, $lt: tomorrow } }).lean(),
            Work.find({ adminId, date: { $gte: thisMonth } }).lean(),
            Work.countDocuments({ adminId, date: { $gte: thisMonth } }),
            Work.aggregate([{ $match: { adminId, paymentStatus: 'Paid' } }, { $group: { _id: null, total: { $sum: { $add: [{ $ifNull: ['$gpayAmount', 0] }, { $ifNull: ['$cashAmount', 0] }] } } } }]),
            Work.aggregate([{ $match: { adminId, date: { $gte: thisMonth }, paymentStatus: 'Paid' } }, { $group: { _id: null, total: { $sum: { $add: [{ $ifNull: ['$gpayAmount', 0] }, { $ifNull: ['$cashAmount', 0] }] } } } }]),
            Work.aggregate([{ $match: { adminId, date: { $gte: today, $lt: tomorrow }, paymentStatus: 'Paid' } }, { $group: { _id: null, total: { $sum: { $add: [{ $ifNull: ['$gpayAmount', 0] }, { $ifNull: ['$cashAmount', 0] }] } } } }]),
            Work.aggregate([{ $match: { adminId, date: { $gte: today, $lt: tomorrow }, paymentStatus: 'Paid' } }, { $group: { _id: null, total: { $sum: { $ifNull: ['$gpayAmount', 0] } } } }]),
            Work.countDocuments({ adminId, paymentStatus: 'Pending' }),
            Work.countDocuments({ adminId, workStatus: { $in: ['Pending', 'In Progress'] } }),
            Work.countDocuments({ adminId, workStatus: 'Completed' }),
            Work.aggregate([
                { $match: { adminId, paymentStatus: 'Paid' } },
                { $project: { paymentStatus: 1, otherCharges: { $ifNull: ['$otherCharges', 0] }, totalDiscount: { $ifNull: ['$totalDiscount', 0] }, serviceCharge: { $sum: { $map: { input: { $ifNull: ['$items', []] }, as: 'item', in: { $add: [ { $multiply: [{ $ifNull: ['$$item.serviceChargeAtTime', 0] }, { $ifNull: ['$$item.quantity', 1] }] }, { $ifNull: ['$$item.otherCharges', 0] } ] } } } } } },
                { $group: { _id: null, totalProfit: { $sum: { $subtract: [{ $add: ['$serviceCharge', '$otherCharges'] }, '$totalDiscount'] } } } }
            ]),
            purchaseController.calculateBalance(adminId),
            Work.countDocuments({ adminId, 'items.presetChargeType': 'AEPS', date: { $gte: thisMonth } }),
            Work.aggregate([
                { $match: { adminId, 'items.presetChargeType': 'AEPS', date: { $gte: thisMonth } } },
                { $unwind: '$items' },
                { $match: { 'items.presetChargeType': 'AEPS' } },
                { $group: { _id: null, totalAepsAmount: { $sum: { $ifNull: ['$items.presetAmount', 0] } } } }
            ]),
            Work.aggregate([
                { $match: { adminId, date: { $gte: today, $lt: tomorrow }, items: { $type: 'array' } } },
                { $unwind: '$items' },
                { $match: { 'items.presetChargeType': 'GPay' } },
                { $group: { _id: null, total: { $sum: '$items.presetAmount' } } }
            ])
        ]);

        const totalNetProfit = totalProfitAgg[0]?.totalProfit || 0;
        const totalAepsAmount = aepsAmountAgg[0]?.totalAepsAmount || 0;

        res.json({
            success: true,
            stats: {
                employees: {
                    total: totalEmployees
                },
                works: {
                    today: todayWorks.length,
                    month: monthWorks.length,
                    total: totalWorks,
                    pending: pendingWorks,
                    completed: completedWorks
                },
                revenue: {
                    today: todayRevenueAgg[0]?.total || 0,
                    month: monthRevenueAgg[0]?.total || 0,
                    total: totalRevenueAgg[0]?.total || 0,
                    pending: pendingPaymentsCount,
                    profit: totalNetProfit,
                    shopBalance: shopBalances.handCashBalance,
                    gpayBalance: shopBalances.gpayBalance,
                    todayGpay: (todayGpayAgg[0]?.total || 0) - (todayGpayDeductionsAgg[0]?.total || 0)
                },
                aeps: {
                    count: aepsWorksCount,
                    amount: totalAepsAmount
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
        const start = startDate ? parseLocalDate(startDate) : new Date(today.getFullYear(), today.getMonth(), 1);
        const end = endDate ? parseLocalDate(endDate) : new Date(today.getFullYear(), today.getMonth() + 1, 0);
        end.setHours(23, 59, 59, 999);

        const adminId = req.user.role === 'admin' ? req.user._id : req.user.adminId;
        // Get all active employees
        const employees = await User.find({ role: 'employee', isActive: true, adminId }).select('-password').lean();

        const employeeMap = employees.reduce((acc, emp) => {
            acc[emp._id.toString()] = {
                id: emp._id,
                name: emp.name,
                mobile: emp.mobile,
                employeeId: emp.employeeId
            };
            return acc;
        }, {});

        const employeeIds = employees.map(emp => emp._id);

        const worksAgg = await Work.aggregate([
            {
                $match: {
                    employee: { $in: employeeIds },
                    date: { $gte: start, $lte: end }
                }
            },
            {
                $group: {
                    _id: '$employee',
                    totalWorks: { $sum: 1 },
                    completedWorks: { $sum: { $cond: [{ $eq: ['$workStatus', 'Completed'] }, 1, 0] } },
                    inProgressWorks: { $sum: { $cond: [{ $in: ['$workStatus', ['Pending', 'In Progress']] }, 1, 0] } },
                    totalAmount: { $sum: { $ifNull: ['$amount', 0] } },
                    paidAmount: { $sum: { $cond: [{ $eq: ['$paymentStatus', 'Paid'] }, { $ifNull: ['$amount', 0] }, 0] } },
                    pendingAmount: { $sum: { $cond: [{ $eq: ['$paymentStatus', 'Pending'] }, { $ifNull: ['$amount', 0] }, 0] } }
                }
            }
        ]);

        const performanceData = worksAgg.map(stat => {
            const emp = employeeMap[stat._id.toString()];
            if(!emp) return null;
            return {
                employee: emp,
                stats: {
                    totalWorks: stat.totalWorks,
                    completedWorks: stat.completedWorks,
                    inProgressWorks: stat.inProgressWorks,
                    totalAmount: stat.totalAmount,
                    paidAmount: stat.paidAmount,
                    pendingAmount: stat.pendingAmount,
                    completionRate: stat.totalWorks > 0 ? (stat.completedWorks / stat.totalWorks * 100).toFixed(1) : 0,
                    paymentCollectionRate: stat.totalAmount > 0 ? (stat.paidAmount / stat.totalAmount * 100).toFixed(1) : 0
                }
            };
        }).filter(Boolean);

        // For employees with 0 works
        const worksAggIds = worksAgg.map(s => s._id.toString());
        employees.forEach(emp => {
            if (!worksAggIds.includes(emp._id.toString())) {
                performanceData.push({
                    employee: employeeMap[emp._id.toString()],
                    stats: {
                        totalWorks: 0,
                        completedWorks: 0,
                        inProgressWorks: 0,
                        totalAmount: 0,
                        paidAmount: 0,
                        pendingAmount: 0,
                        completionRate: 0,
                        paymentCollectionRate: 0
                    }
                });
            }
        });

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
        const start = startDate ? parseLocalDate(startDate) : new Date(today.getFullYear(), today.getMonth(), 1);
        const end = endDate ? parseLocalDate(endDate) : new Date(today.getFullYear(), today.getMonth() + 1, 0);
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

        const adminId = req.user.role === 'admin' ? req.user._id : req.user.adminId;

        // Get revenue data grouped by period
        const revenueData = await Work.aggregate([
            {
                $match: {
                    adminId,
                    date: { $gte: start, $lte: end }
                }
            },
            {
                $addFields: {
                    entryWorkCharge: {
                        $sum: {
                            $map: {
                                input: { $ifNull: ['$items', []] },
                                as: 'item',
                                in: { $multiply: [{ $ifNull: ['$$item.workChargeAtTime', 0] }, { $ifNull: ['$$item.quantity', 1] }] }
                            }
                        }
                    },
                    entryServiceCharge: {
                        $sum: {
                            $map: {
                                input: { $ifNull: ['$items', []] },
                                as: 'item',
                                in: { $multiply: [{ $ifNull: ['$$item.serviceChargeAtTime', 0] }, { $ifNull: ['$$item.quantity', 1] }] }
                            }
                        }
                    },
                    entryOtherCharges: {
                        $sum: {
                            $map: {
                                input: { $ifNull: ['$items', []] },
                                as: 'item',
                                in: { $ifNull: ['$$item.otherCharges', 0] }
                            }
                        }
                    },
                    collectedAmount: { $ifNull: ['$amount', 0] }
                }
            },
            {
                $addFields: {
                    expectedRevenue: { $add: ['$entryWorkCharge', '$entryServiceCharge'] },
                    netProfit: {
                        $subtract: [
                            { $add: ['$entryServiceCharge', '$entryOtherCharges', { $ifNull: ['$otherCharges', 0] }] },
                            { $ifNull: ['$totalDiscount', 0] }
                        ]
                    }
                }
            },
            {
                $group: {
                    _id: groupByExpr,
                    totalRevenue: { $sum: { $cond: [{ $eq: ['$paymentStatus', 'Paid'] }, '$collectedAmount', 0] } },
                    pendingRevenue: { $sum: { $cond: [{ $eq: ['$paymentStatus', 'Pending'] }, '$collectedAmount', 0] } },
                    enteredTotalRevenue: { $sum: { $cond: [{ $eq: ['$paymentStatus', 'Paid'] }, '$amount', 0] } },
                    enteredPendingRevenue: { $sum: { $cond: [{ $eq: ['$paymentStatus', 'Pending'] }, '$amount', 0] } },
                    totalWorkCharge: { $sum: '$entryWorkCharge' },
                    totalServiceCharge: { $sum: '$entryServiceCharge' },
                    totalBaseCost: { $sum: '$expectedRevenue' },
                    totalOtherCharges: { $sum: { $cond: [{ $eq: ['$paymentStatus', 'Paid'] }, { $add: ['$entryOtherCharges', { $ifNull: ['$otherCharges', 0] }] }, 0] } },
                    totalGpayAmount: { $sum: { $cond: [{ $eq: ['$paymentStatus', 'Paid'] }, { $ifNull: ['$gpayAmount', 0] }, 0] } },
                    totalCashAmount: { $sum: { $cond: [{ $eq: ['$paymentStatus', 'Paid'] }, { $ifNull: ['$cashAmount', 0] }, 0] } },
                    totalApplicationFee: { $sum: { $ifNull: ['$applicationFee', 0] } },
                    totalActualCollected: { $sum: { $cond: [{ $eq: ['$paymentStatus', 'Paid'] }, '$collectedAmount', 0] } },
                    totalDiscount: { $sum: { $ifNull: ['$totalDiscount', 0] } },
                    totalNetProfit: { $sum: { $cond: [{ $eq: ['$paymentStatus', 'Paid'] }, '$netProfit', 0] } },
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
            totalWorkCharge: item.totalWorkCharge,
            totalServiceCharge: item.totalServiceCharge,
            totalBaseCost: item.totalBaseCost,
            totalOtherCharges: item.totalOtherCharges,
            totalActualCollected: item.totalActualCollected,
            totalDiscount: item.totalDiscount,
            totalNetProfit: item.totalNetProfit,
            totalGpayAmount: item.totalGpayAmount,
            totalCashAmount: item.totalCashAmount,
            totalApplicationFee: item.totalApplicationFee,
            totalWorks: item.totalWorks,
            paidWorks: item.paidWorks,
            pendingWorks: item.pendingWorks
        }));

        const summary = {
            totalWorkCharge: revenueData.reduce((sum, item) => sum + (item.totalWorkCharge || 0), 0),
            totalServiceCharge: revenueData.reduce((sum, item) => sum + (item.totalServiceCharge || 0), 0),
            totalBaseCost: revenueData.reduce((sum, item) => sum + (item.totalBaseCost || 0), 0),
            totalOtherCharges: revenueData.reduce((sum, item) => sum + (item.totalOtherCharges || 0), 0),
            totalActualCollected: revenueData.reduce((sum, item) => sum + (item.totalActualCollected || 0), 0),
            totalDiscount: revenueData.reduce((sum, item) => sum + (item.totalDiscount || 0), 0),
            totalNetProfit: revenueData.reduce((sum, item) => sum + (item.totalNetProfit || 0), 0),
            totalGpayAmount: revenueData.reduce((sum, item) => sum + (item.totalGpayAmount || 0), 0),
            totalCashAmount: revenueData.reduce((sum, item) => sum + (item.totalCashAmount || 0), 0),
            totalApplicationFee: revenueData.reduce((sum, item) => sum + (item.totalApplicationFee || 0), 0)
        };

        res.json({
            success: true,
            revenueData: formattedData,
            summary,
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
        const { startDate, endDate, paymentStatus, workStatus, searchName, searchPhone, employeeName } = req.query;
        const today = new Date();
        const start = startDate ? parseLocalDate(startDate) : new Date(today.getFullYear(), today.getMonth(), 1);
        const end = endDate ? parseLocalDate(endDate) : new Date(today.getFullYear(), today.getMonth() + 1, 0);
        end.setHours(23, 59, 59, 999);

        const adminId = req.user.role === 'admin' ? req.user._id : req.user.adminId;
        const query = { adminId, date: { $gte: start, $lte: end } };
        if (paymentStatus) query.paymentStatus = paymentStatus;
        if (workStatus) {
            if (workStatus === 'Pending') {
                query.workStatus = { $in: ['Pending', 'In Progress'] };
            } else {
                query.workStatus = workStatus;
            }
        }
        if (searchName) query.customerName = { $regex: searchName, $options: 'i' };
        if (searchPhone) query.customerPhone = { $regex: searchPhone, $options: 'i' };

        let works = await Work.find(query).populate('employee', 'name employeeId').sort({ date: 1 });

        if (employeeName) {
            works = works.filter(w => w.employee && w.employee.name.toLowerCase().includes(employeeName.toLowerCase()));
        }

        const workbook = new ExcelJS.Workbook();
        const worksheet = workbook.addWorksheet('Revenue Report');

        worksheet.columns = [
            { header: 'Date', key: 'date', width: 12 },
            { header: 'Time', key: 'time', width: 10 },
            { header: 'Customer Name', key: 'customerName', width: 20 },
            { header: 'Phone', key: 'phone', width: 12 },
            { header: 'Work Items', key: 'workItems', width: 35 },
            { header: 'App. Numbers', key: 'applicationNumbers', width: 15 },
            { header: 'Work Status', key: 'workStatus', width: 12 },
            { header: 'GPay Amount', key: 'gpayAmount', width: 12 },
            { header: 'Cash Amount', key: 'cashAmount', width: 12 },
            { header: 'Total Amount', key: 'totalAmount', width: 12 },
            { header: 'App Fee (Recharge)', key: 'applicationFee', width: 15 },
            { header: 'AEPS Amount', key: 'aepsAmount', width: 15 },
            { header: 'Service Charge', key: 'serviceCharge', width: 15 },
            { header: 'Other Charges', key: 'otherCharges', width: 15 },
            { header: 'Discount', key: 'discount', width: 10 },
            { header: 'Net Profit', key: 'netProfit', width: 12 },
            { header: 'Payment Method', key: 'paymentMethod', width: 15 },
            { header: 'Notes', key: 'notes', width: 25 }
        ];

        works.forEach(work => {
            const workTitles = work.items && work.items.length > 0
                ? work.items.map(i => `${i.title} (x${i.quantity || 1})`).join(', ')
                : work.workTitle || '-';

            const dateObj = new Date(work.date);
            const formattedDate = dateObj.toLocaleDateString('en-IN');
            const formattedTime = dateObj.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', hour12: true });

            const displayWorkStatus = work.workStatus === 'In Progress' ? 'Pending' : work.workStatus;

            const appNums = work.items && work.items.length > 0
                ? work.items.map(i => i.applicationNumber || '').filter(n => n !== '').join(', ')
                : '-';

            const serviceCharge = work.items ? work.items.reduce((sum, item) => sum + ((item.serviceChargeAtTime || 0) * (item.quantity || 1)), 0) : 0;
            const aepsAmount = work.items ? work.items.reduce((sum, item) => sum + (item.presetChargeType === 'AEPS' ? (item.presetAmount || 0) : 0), 0) : 0;
            const otherCharges = work.otherCharges || 0;
            const discount = work.totalDiscount || 0;
            const netProfit = work.paymentStatus === 'Paid' ? (serviceCharge + otherCharges - discount) : 0;

            worksheet.addRow({
                date: formattedDate,
                time: formattedTime,
                customerName: work.customerName || '-',
                phone: work.customerPhone || '-',
                workItems: workTitles,
                applicationNumbers: appNums || '-',
                workStatus: displayWorkStatus,
                gpayAmount: work.gpayAmount || 0,
                cashAmount: work.cashAmount || 0,
                totalAmount: work.totalAmount || work.amount || 0,
                applicationFee: work.applicationFee || 0,
                aepsAmount: aepsAmount,
                serviceCharge: serviceCharge,
                otherCharges: otherCharges,
                discount: discount,
                netProfit: netProfit,
                paymentMethod: work.paymentMethod || 'Cash',
                notes: work.notes || '-'
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
        const { startDate, endDate, paymentStatus, workStatus, searchName, searchPhone, employeeName } = req.query;
        const today = new Date();
        const start = startDate ? parseLocalDate(startDate) : new Date(today.getFullYear(), today.getMonth(), 1);
        const end = endDate ? parseLocalDate(endDate) : new Date(today.getFullYear(), today.getMonth() + 1, 0);
        end.setHours(23, 59, 59, 999);

        const adminId = req.user.role === 'admin' ? req.user._id : req.user.adminId;
        const query = { adminId, date: { $gte: start, $lte: end } };
        if (paymentStatus) query.paymentStatus = paymentStatus;
        if (workStatus) {
            if (workStatus === 'Pending') {
                query.workStatus = { $in: ['Pending', 'In Progress'] };
            } else {
                query.workStatus = workStatus;
            }
        }
        if (searchName) query.customerName = { $regex: searchName, $options: 'i' };
        if (searchPhone) query.customerPhone = { $regex: searchPhone, $options: 'i' };

        let works = await Work.find(query).populate('employee', 'name employeeId').sort({ date: 1 });

        if (employeeName) {
            works = works.filter(w => w.employee && w.employee.name.toLowerCase().includes(employeeName.toLowerCase()));
        }

        const doc = new PDFDocument({ margin: 30, size: 'A4', layout: 'landscape' });

        res.setHeader('Content-Type', 'application/pdf');
        res.setHeader('Content-Disposition', 'attachment; filename=Revenue_Report.pdf');

        doc.pipe(res);

        doc.fontSize(16).text('Revenue Report', { align: 'center' });
        doc.moveDown(0.5);
        doc.fontSize(10).text(`Date Range: ${start.toLocaleDateString('en-IN')} to ${end.toLocaleDateString('en-IN')}`, { align: 'center' });
        doc.moveDown(1);

        const tableTop = margin => doc.y;
        let y = tableTop();
        const itemX = {
            date: 30,
            customer: 80,
            items: 130,
            appNum: 235,
            gpay: 280,
            cash: 315,
            total: 350,
            appFee: 385,
            aeps: 430,
            srvChg: 465,
            other: 505,
            disc: 540,
            profit: 575,
            pStatus: 610,
            wStatus: 650,
            method: 690,
            notes: 730
        };

        const drawHeader = () => {
            doc.fontSize(7).font('Helvetica-Bold');
            doc.text('Date', itemX.date, y);
            doc.text('Customer', itemX.customer, y);
            doc.text('Work Items', itemX.items, y);
            doc.text('App. No', itemX.appNum, y);
            doc.text('GPay', itemX.gpay, y);
            doc.text('Cash', itemX.cash, y);
            doc.text('Total', itemX.total, y);
            doc.text('App Fee', itemX.appFee, y);
            doc.text('AEPS', itemX.aeps, y);
            doc.text('Srv.Chg', itemX.srvChg, y);
            doc.text('Other', itemX.other, y);
            doc.text('Disc', itemX.disc, y);
            doc.text('Profit', itemX.profit, y);
            doc.text('P.Status', itemX.pStatus, y);
            doc.text('W.Status', itemX.wStatus, y);
            doc.text('Method', itemX.method, y);
            doc.text('Notes', itemX.notes, y);
            doc.moveTo(30, y + 10).lineTo(812, y + 10).stroke();
            y += 15;
        };

        drawHeader();

        works.forEach(work => {
            if (y > 540) {
                doc.addPage({ margin: 30, size: 'A4', layout: 'landscape' });
                y = 30;
                drawHeader();
            }

            const dateObj = new Date(work.date);
            const formattedDate = dateObj.toLocaleDateString('en-IN');

            const displayWorkStatus = work.workStatus === 'In Progress' ? 'Pending' : work.workStatus;

            const workTitles = work.items && work.items.length > 0
                ? work.items.map(i => `${i.title} (x${i.quantity || 1})`).join(', ')
                : work.workTitle || '-';

            const appNums = work.items && work.items.length > 0
                ? work.items.map(i => i.applicationNumber || '').filter(n => n !== '').join(', ')
                : '-';

            const serviceCharge = work.items ? work.items.reduce((sum, item) => sum + ((item.serviceChargeAtTime || 0) * (item.quantity || 1)), 0) : 0;
            const aepsAmount = work.items ? work.items.reduce((sum, item) => sum + (item.presetChargeType === 'AEPS' ? (item.presetAmount || 0) : 0), 0) : 0;
            const otherCharges = work.otherCharges || 0;
            const discount = work.totalDiscount || 0;
            const netProfit = work.paymentStatus === 'Paid' ? (serviceCharge + otherCharges - discount) : 0;
            
            const custName = (work.customerName || '-').substring(0, 10);
            const titlesShort = workTitles.substring(0, 22);
            const appNumShort = appNums.substring(0, 10);
            const notesShort = (work.notes || '-').substring(0, 15);

            doc.font('Helvetica').fontSize(6);
            doc.text(formattedDate, itemX.date, y);
            doc.text(custName, itemX.customer, y);
            doc.text(titlesShort, itemX.items, y);
            doc.text(appNumShort, itemX.appNum, y);
            doc.text(`₹${work.gpayAmount || 0}`, itemX.gpay, y);
            doc.text(`₹${work.cashAmount || 0}`, itemX.cash, y);
            doc.text(`₹${work.totalAmount || work.amount || 0}`, itemX.total, y);
            doc.text(`₹${work.applicationFee || 0}`, itemX.appFee, y);
            doc.text(`₹${aepsAmount}`, itemX.aeps, y);
            doc.text(`₹${serviceCharge}`, itemX.srvChg, y);
            doc.text(`₹${otherCharges}`, itemX.other, y);
            doc.text(`₹${discount}`, itemX.disc, y);
            doc.text(`₹${netProfit}`, itemX.profit, y);
            doc.text(work.paymentStatus || 'Pending', itemX.pStatus, y);
            doc.text(displayWorkStatus, itemX.wStatus, y);
            doc.text(work.paymentMethod || 'Cash', itemX.method, y);
            doc.text(notesShort, itemX.notes, y);

            y += 15;
        });

        doc.moveTo(30, y).lineTo(812, y).stroke();
        y += 5;
        doc.font('Helvetica-Bold').fontSize(7);
        const totalGpay = works.reduce((sum, w) => sum + (w.gpayAmount || 0), 0);
        const totalCash = works.reduce((sum, w) => sum + (w.cashAmount || 0), 0);
        const totalAppFee = works.reduce((sum, w) => sum + (w.applicationFee || 0), 0);
        const totalAeps = works.reduce((sum, w) => sum + (w.items ? w.items.reduce((s, i) => s + (i.presetChargeType === 'AEPS' ? (i.presetAmount || 0) : 0), 0) : 0), 0);
        const totalAmt = works.reduce((sum, w) => sum + (w.totalAmount || w.amount || 0), 0);
        const totalProfit = works.reduce((sum, w) => sum + (w.paymentStatus === 'Paid' ? ((w.items ? w.items.reduce((s, i) => s + ((i.serviceChargeAtTime || 0) * (i.quantity || 1)), 0) : 0) + (w.otherCharges || 0) - (w.totalDiscount || 0)) : 0), 0);
        
        doc.text(`Totals => GPay: ₹${totalGpay} | Cash: ₹${totalCash} | App Fee: ₹${totalAppFee} | AEPS: ₹${totalAeps} | Amt: ₹${totalAmt} | Profit: ₹${totalProfit}`, 30, y, { align: 'right' });

        doc.end();
    } catch (error) {
        console.error('Download PDF error:', error);
        res.status(500).json({ success: false, message: 'Server error while downloading PDF report.' });
    }
};

// WorkItem CRUD Operations
const createWorkItem = async (req, res) => {
    try {
        const { name, workCharge, serviceCharge, chargeType } = req.body;

        if (!name || workCharge === undefined || serviceCharge === undefined) {
            return res.status(400).json({
                success: false,
                message: 'Name, workCharge and serviceCharge are required.'
            });
        }

        const parsedWorkCharge = Number(workCharge);
        const parsedServiceCharge = Number(serviceCharge);

        if (Number.isNaN(parsedWorkCharge) || Number.isNaN(parsedServiceCharge)) {
            return res.status(400).json({
                success: false,
                message: 'Work charge and service charge must be numeric values.'
            });
        }

        const workItem = new WorkItem({
            name: name.trim(),
            workCharge: parsedWorkCharge,
            serviceCharge: parsedServiceCharge,
            chargeType: chargeType || 'None',
            status: req.body.status !== undefined ? req.body.status : true,
            isActive: req.body.status !== undefined ? req.body.status : true,
            adminId: req.user.role === 'admin' ? req.user._id : req.user.adminId
        });

        await workItem.save();

        return res.status(201).json({
            success: true,
            message: 'Work item created successfully',
            workItem
        });
    } catch (error) {
        console.error('Error creating work item:', error);

        if (error.name === 'ValidationError') {
            const messages = Object.values(error.errors).map((err) => err.message);
            return res.status(400).json({
                success: false,
                message: messages.join(' ')
            });
        }

        if (error.code === 11000) {
            return res.status(400).json({
                success: false,
                message: 'A work item with this name already exists.'
            });
        }

        return res.status(500).json({
            success: false,
            message: 'Server error while creating work item.'
        });
    }
};

const getAllWorkItems = async (req, res) => {
    try {
        const adminId = req.user.role === 'admin' ? req.user._id : req.user.adminId;
        const workItems = await WorkItem.find({ adminId }).sort({ createdAt: -1 });
        res.json({ success: true, workItems });
    } catch (error) {
        res.status(500).json({ success: false, message: 'Server error while fetching work items' });
    }
};

const updateWorkItem = async (req, res) => {
    try {
        const { name, workCharge, serviceCharge, chargeType, status, isActive } = req.body;
        const adminId = req.user.role === 'admin' ? req.user._id : req.user.adminId;
        const statusValue = status !== undefined ? status : isActive;
        const workItem = await WorkItem.findOneAndUpdate(
            { _id: req.params.id, adminId },
            { name, workCharge, serviceCharge, chargeType, status: statusValue, isActive: statusValue },
            { new: true }
        );
        if (!workItem) return res.status(404).json({ success: false, message: 'Work item not found' });
        res.json({ success: true, message: 'Work item updated', workItem });
    } catch (error) {
        res.status(500).json({ success: false, message: 'Server error while updating work item' });
    }
};

const deleteWorkItem = async (req, res) => {
    try {
        const adminId = req.user.role === 'admin' ? req.user._id : req.user.adminId;
        const workItem = await WorkItem.findOneAndDelete({ _id: req.params.id, adminId });
        if (!workItem) return res.status(404).json({ success: false, message: 'Work item not found' });
        res.json({ success: true, message: 'Work item deleted' });
    } catch (error) {
        res.status(500).json({ success: false, message: 'Server error while deleting work item' });
    }
};

// Update admin profile
const updateProfile = async (req, res) => {
    try {
        const { name, password, mobile } = req.body;
        const adminId = req.user.id || req.user._id;

        console.log('Update profile request:', { adminId, name, hasPassword: !!password, user: req.user });

        if (!adminId) {
            return res.status(400).json({
                success: false,
                message: 'User ID not found in request'
            });
        }

        if (!name || name.trim().length === 0) {
            return res.status(400).json({
                success: false,
                message: 'Name is required'
            });
        }

        // Build update object
        const updateData = {
            name: name.trim(),
            updatedAt: new Date()
        };

        if (mobile) {
            updateData.mobile = mobile.trim();

            // Check if mobile is already taken
            const existingUser = await User.findOne({
                mobile: updateData.mobile,
                _id: { $ne: adminId }
            });
            if (existingUser) {
                return res.status(400).json({
                    success: false,
                    message: 'Mobile number is already in use'
                });
            }
        }

        // If password is provided, hash it
        if (password && password.trim().length > 0) {
            if (password.length < 6) {
                return res.status(400).json({
                    success: false,
                    message: 'Password must be at least 6 characters long'
                });
            }

            const salt = await bcrypt.genSalt(10);
            updateData.password = await bcrypt.hash(password, salt);
        }

        console.log('Update data:', { ...updateData, password: updateData.password ? '[HASHED]' : undefined });

        // Update admin profile by ID
        const updatedAdmin = await User.findByIdAndUpdate(
            adminId,
            updateData,
            { new: true }
        );

        console.log('Updated admin result:', updatedAdmin);

        if (!updatedAdmin) {
            return res.status(404).json({
                success: false,
                message: 'Admin not found'
            });
        }

        res.json({
            success: true,
            message: 'Profile updated successfully',
            user: {
                id: updatedAdmin._id,
                name: updatedAdmin.name,
                mobile: updatedAdmin.mobile,
                role: updatedAdmin.role
            }
        });

    } catch (error) {
        console.error('Update profile error:', error);
        res.status(500).json({
            success: false,
            message: `Server error while updating profile: ${error.message}`
        });
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
    deleteWorkItem,
    updateProfile
};