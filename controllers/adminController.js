const Work = require('../models/Work');
const User = require('../models/User');
const WorkItem = require('../models/WorkItem');
const ExcelJS = require('exceljs');
const PDFDocument = require('pdfkit');
const bcrypt = require('bcryptjs');

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
        const query = {};

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

        const pendingPaymentsCount = await Work.countDocuments({ paymentStatus: 'Pending' });

        const pendingWorks = await Work.countDocuments({ workStatus: { $in: ['Pending', 'In Progress'] } });

        const completedWorks = await Work.countDocuments({ workStatus: 'Completed' });

        const totalProfitAgg = await Work.aggregate([
            {
                $project: {
                    paymentStatus: 1,
                    otherCharges: { $ifNull: ['$otherCharges', 0] },
                    serviceCharge: {
                        $sum: {
                            $map: {
                                input: { $ifNull: ['$items', []] },
                                as: 'item',
                                in: { $multiply: [{ $ifNull: ['$$item.serviceChargeAtTime', 0] }, { $ifNull: ['$$item.quantity', 1] }] }
                            }
                        }
                    }
                }
            },
            {
                $match: { paymentStatus: 'Paid' }
            },
            {
                $group: {
                    _id: null,
                    totalProfit: { $sum: { $add: ['$serviceCharge', '$otherCharges'] } }
                }
            }
        ]);
        const totalNetProfit = totalProfitAgg[0]?.totalProfit || 0;

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
                    today: todayRevenue[0]?.total || 0,
                    month: monthRevenue[0]?.total || 0,
                    total: totalRevenue[0]?.total || 0,
                    pending: pendingPaymentsCount,
                    profit: totalNetProfit
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
                const inProgressWorks = works.filter(w => ['Pending', 'In Progress'].includes(w.workStatus));
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

        // Get revenue data grouped by period
        const revenueData = await Work.aggregate([
            {
                $match: {
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
                    collectedAmount: { $ifNull: ['$amount', 0] }
                }
            },
            {
                $addFields: {
                    expectedRevenue: { $add: ['$entryWorkCharge', '$entryServiceCharge'] },
                    netProfit: { $add: ['$entryServiceCharge', { $ifNull: ['$otherCharges', 0] }] }
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
                    totalOtherCharges: { $sum: { $cond: [{ $eq: ['$paymentStatus', 'Paid'] }, { $ifNull: ['$otherCharges', 0] }, 0] } },
                    totalActualCollected: { $sum: { $cond: [{ $eq: ['$paymentStatus', 'Paid'] }, '$collectedAmount', 0] } },
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
            totalNetProfit: item.totalNetProfit,
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
            totalNetProfit: revenueData.reduce((sum, item) => sum + (item.totalNetProfit || 0), 0)
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

        const query = { date: { $gte: start, $lte: end } };
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
            { header: 'Date', key: 'date', width: 15 },
            { header: 'Time', key: 'time', width: 12 },
            { header: 'Customer Name', key: 'customerName', width: 25 },
            { header: 'Phone', key: 'phone', width: 15 },
            { header: 'Work Items', key: 'workItems', width: 35 },
            { header: 'App. Numbers', key: 'applicationNumbers', width: 25 },
            { header: 'Amount', key: 'amount', width: 12 },
            { header: 'Payment Status', key: 'paymentStatus', width: 15 },
            { header: 'Work Status', key: 'workStatus', width: 15 },
            { header: 'Payment Method', key: 'paymentMethod', width: 18 },
            { header: 'Notes', key: 'notes', width: 30 }
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

            worksheet.addRow({
                date: formattedDate,
                time: formattedTime,
                customerName: work.customerName || '-',
                phone: work.customerPhone || '-',
                workItems: workTitles,
                applicationNumbers: appNums || '-',
                amount: work.amount || 0,
                paymentStatus: work.paymentStatus || 'Pending',
                workStatus: displayWorkStatus,
                paymentMethod: work.paymentMethod || 'Hand Cash',
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

        const query = { date: { $gte: start, $lte: end } };
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
        const itemX = { 
            date: 30, 
            time: 70, 
            customer: 105, 
            phone: 165, 
            items: 215, 
            appNum: 295,
            amt: 360, 
            pStatus: 400, 
            wStatus: 445, 
            method: 490, 
            notes: 535 
        };

        // Header
        doc.fontSize(7).font('Helvetica-Bold');
        doc.text('Date', itemX.date, y);
        doc.text('Time', itemX.time, y);
        doc.text('Customer', itemX.customer, y);
        doc.text('Phone', itemX.phone, y);
        doc.text('Work Items', itemX.items, y);
        doc.text('App. No', itemX.appNum, y);
        doc.text('Amount', itemX.amt, y);
        doc.text('P.Status', itemX.pStatus, y);
        doc.text('W.Status', itemX.wStatus, y);
        doc.text('Method', itemX.method, y);
        doc.text('Notes', itemX.notes, y);
        doc.moveTo(30, y + 10).lineTo(565, y + 10).stroke();
        y += 15;

        doc.font('Helvetica').fontSize(7);
        let totalRevenue = 0;
        let totalExpected = 0;
        let totalProfit = 0;

        works.forEach(work => {
            if (y > 750) {
                doc.addPage();
                y = 30;
                // Re-add header on new page
                doc.fontSize(7).font('Helvetica-Bold');
                doc.text('Date', itemX.date, y);
                doc.text('Time', itemX.time, y);
                doc.text('Customer', itemX.customer, y);
                doc.text('Phone', itemX.phone, y);
                doc.text('Work Items', itemX.items, y);
                doc.text('Amount', itemX.amt, y);
                doc.text('P.Status', itemX.pStatus, y);
                doc.text('W.Status', itemX.wStatus, y);
                doc.text('Method', itemX.method, y);
                doc.text('Notes', itemX.notes, y);
                doc.moveTo(30, y + 10).lineTo(565, y + 10).stroke();
                y += 15;
            }

            const dateObj = new Date(work.date);
            const formattedDate = dateObj.toLocaleDateString('en-IN');
            const formattedTime = dateObj.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', hour12: true });
            
            const displayWorkStatus = work.workStatus === 'In Progress' ? 'Pending' : work.workStatus;

            const workTitles = work.items && work.items.length > 0
                ? work.items.map(i => `${i.title} (x${i.quantity || 1})`).join(', ')
                : work.workTitle || '-';

            const appNums = work.items && work.items.length > 0
                ? work.items.map(i => i.applicationNumber || '').filter(n => n !== '').join(', ')
                : '-';

            const custName = (work.customerName || '-').substring(0, 12);
            const phone = (work.customerPhone || '-').substring(0, 10);
            const titlesShort = workTitles.substring(0, 20);
            const appNumShort = appNums.substring(0, 15);
            const notesShort = (work.notes || '-').substring(0, 10);

            doc.font('Helvetica').fontSize(6);
            doc.text(formattedDate, itemX.date, y);
            doc.text(formattedTime, itemX.time, y);
            doc.text(custName, itemX.customer, y);
            doc.text(phone, itemX.phone, y);
            doc.text(titlesShort, itemX.items, y);
            doc.text(appNumShort, itemX.appNum, y);
            doc.text(`₹${work.amount}`, itemX.amt, y);
            doc.text(work.paymentStatus || 'Pending', itemX.pStatus, y);
            doc.text(displayWorkStatus, itemX.wStatus, y);
            doc.text(work.paymentMethod || 'Cash', itemX.method, y);
            doc.text(notesShort, itemX.notes, y);

            y += 15;
        });

        doc.moveTo(30, y).lineTo(565, y).stroke();
        y += 5;
        doc.font('Helvetica-Bold').fontSize(8);
        const totalAmt = works.reduce((sum, w) => sum + (w.amount || 0), 0);
        doc.text(`Total Amount Collected: ₹${totalAmt}`, 30, y, { align: 'right' });

        doc.end();
    } catch (error) {
        console.error('Download PDF error:', error);
        res.status(500).json({ success: false, message: 'Server error while downloading PDF report.' });
    }
};

// WorkItem CRUD Operations
const createWorkItem = async (req, res) => {
    try {
        const { name, workCharge, serviceCharge } = req.body;

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
            serviceCharge: parsedServiceCharge
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
        const workItems = await WorkItem.find().sort({ createdAt: -1 });
        res.json({ success: true, workItems });
    } catch (error) {
        res.status(500).json({ success: false, message: 'Server error while fetching work items' });
    }
};

const updateWorkItem = async (req, res) => {
    try {
        const { name, workCharge, serviceCharge, status, isActive } = req.body;
        const statusValue = status !== undefined ? status : isActive;
        const workItem = await WorkItem.findByIdAndUpdate(
            req.params.id,
            { name, workCharge, serviceCharge, status: statusValue, isActive: statusValue },
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
        const workItem = await WorkItem.findByIdAndDelete(req.params.id);
        if (!workItem) return res.status(404).json({ success: false, message: 'Work item not found' });
        res.json({ success: true, message: 'Work item deleted' });
    } catch (error) {
        res.status(500).json({ success: false, message: 'Server error while deleting work item' });
    }
};

// Update admin profile
const updateProfile = async (req, res) => {
    try {
        const { name, password } = req.body;
        const adminEmail = req.user.email;

        console.log('Update profile request:', { adminEmail, name, hasPassword: !!password, user: req.user });

        if (!adminEmail) {
            return res.status(400).json({
                success: false,
                message: 'User email not found in request'
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

        // Update admin profile by email
        const updatedAdmin = await User.findOneAndUpdate(
            { email: adminEmail, role: 'admin' },
            updateData,
            { new: true }
        );

        console.log('Updated admin result:', updatedAdmin);

        if (!updatedAdmin) {
            console.log('Admin not found with email:', adminEmail);
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
                email: updatedAdmin.email,
                role: updatedAdmin.role
            }
        });

    } catch (error) {
        console.error('Update profile error:', error);
        console.error('Error stack:', error.stack);
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