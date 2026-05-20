const Purchase = require('../models/Purchase');
const Work = require('../models/Work');

// Calculate current shop balance
exports.calculateBalance = async (adminId) => {
    if (!adminId) return { handCashBalance: 0, gpayBalance: 0 };
    // 1. Hand Cash Balance Calculation
    // Total Cash collected
    const totalCashResult = await Work.aggregate([
        { $match: { adminId, paymentStatus: 'Paid' } },
        { $group: { _id: null, total: { $sum: '$cashAmount' } } }
    ]);
    const totalCash = totalCashResult[0]?.total || 0;

    // Total Purchases (Expenses)
    const totalPurchaseResult = await Purchase.aggregate([
        { $match: { adminId } },
        { $group: { _id: null, total: { $sum: '$amount' } } }
    ]);
    const totalPurchase = totalPurchaseResult[0]?.total || 0;

    // Total Transfers (Handcash to Gpay)
    const totalTransferResult = await Work.aggregate([
        {
            $match: {
                adminId,
                'items.title': { $regex: /Handcash to Gpay Transfer/i },
                paymentStatus: 'Paid'
            }
        },
        { $group: { _id: null, total: { $sum: '$applicationFee' } } }
    ]);
    const totalTransfer = totalTransferResult[0]?.total || 0;

    // Preset Deductions from Hand Cash
    const handCashDeductionsResult = await Work.aggregate([
        { $match: { adminId, items: { $type: 'array' } } },
        { $unwind: '$items' },
        { $match: { 'items.presetChargeType': { $in: ['Hand Cash', 'AEPS'] } } },
        { $group: { _id: null, total: { $sum: '$items.presetAmount' } } }
    ]);
    const handCashDeductions = handCashDeductionsResult[0]?.total || 0;

    const handCashBalance = totalCash - totalPurchase - totalTransfer - handCashDeductions;

    // 2. GPay Balance Calculation
    // Total GPay collected
    const totalGPayResult = await Work.aggregate([
        { $match: { adminId, paymentStatus: 'Paid' } },
        { $group: { _id: null, total: { $sum: '$gpayAmount' } } }
    ]);
    const totalGPay = totalGPayResult[0]?.total || 0;

    // Preset Deductions from GPay
    const gpayDeductionsResult = await Work.aggregate([
        { $match: { adminId, items: { $type: 'array' } } },
        { $unwind: '$items' },
        { $match: { 'items.presetChargeType': { $in: ['GPay'] } } },
        { $group: { _id: null, total: { $sum: '$items.presetAmount' } } }
    ]);
    const gpayDeductions = gpayDeductionsResult[0]?.total || 0;

    const gpayBalance = totalGPay - gpayDeductions;

    return {
        handCashBalance,
        gpayBalance
    };
};

// @desc    Get all purchases with date filter
// @route   GET /api/purchases
// @access  Private/Admin
exports.getAllPurchases = async (req, res) => {
    try {
        const adminId = req.user.role === 'admin' ? req.user._id : req.user.adminId;
        const { startDate, endDate, filter } = req.query;
        let query = { adminId };

        if (filter === 'today') {
            const today = new Date();
            today.setHours(0, 0, 0, 0);
            query.date = { $gte: today };
        } else if (filter === 'week') {
            const lastWeek = new Date();
            lastWeek.setDate(lastWeek.getDate() - 7);
            query.date = { $gte: lastWeek };
        } else if (startDate && endDate) {
            const start = new Date(startDate);
            const end = new Date(endDate);
            end.setHours(23, 59, 59, 999);
            query.date = { $gte: start, $lte: end };
        }

        const purchases = await Purchase.find(query).sort({ date: -1 });
        const shopBalance = await exports.calculateBalance(adminId);

        res.json({
            success: true,
            purchases,
            shopBalance
        });
    } catch (error) {
        console.error('Get purchases error:', error);
        res.status(500).json({
            success: false,
            message: 'Server error while fetching purchases'
        });
    }
};

// @desc    Create a new purchase
// @route   POST /api/purchases
// @access  Private/Admin
exports.createPurchase = async (req, res) => {
    try {
        const adminId = req.user.role === 'admin' ? req.user._id : req.user.adminId;
        const { orderName, amount, date } = req.body;

        if (!orderName || !amount) {
            return res.status(400).json({
                success: false,
                message: 'Order name and amount are required'
            });
        }

        const shopBalance = await exports.calculateBalance(adminId);
        const currentBalance = shopBalance.handCashBalance;

        if (amount > currentBalance) {
            return res.status(400).json({
                success: false,
                message: 'Insufficient balance'
            });
        }

        const purchase = new Purchase({
            orderName,
            amount,
            date: date || Date.now(),
            adminId
        });

        await purchase.save();

        res.status(201).json({
            success: true,
            purchase,
            shopBalance: currentBalance - amount
        });
    } catch (error) {
        console.error('Create purchase error:', error);
        res.status(500).json({
            success: false,
            message: 'Server error while creating purchase'
        });
    }
};

// @desc    Update a purchase
// @route   PUT /api/purchases/:id
// @access  Private/Admin
exports.updatePurchase = async (req, res) => {
    try {
        const adminId = req.user.role === 'admin' ? req.user._id : req.user.adminId;
        const { orderName, amount, date } = req.body;
        const purchase = await Purchase.findOne({ _id: req.params.id, adminId });

        if (!purchase) {
            return res.status(404).json({
                success: false,
                message: 'Purchase not found'
            });
        }

        // Check balance if amount is increased
        if (amount && amount > purchase.amount) {
            const shopBalance = await exports.calculateBalance(adminId);
            const currentBalance = shopBalance.handCashBalance + purchase.amount; // Add back current purchase amount to check total available

            if (amount > currentBalance) {
                return res.status(400).json({
                    success: false,
                    message: 'Insufficient balance'
                });
            }
        }

        if (orderName) purchase.orderName = orderName;
        if (amount !== undefined) purchase.amount = amount;
        if (date) purchase.date = date;

        await purchase.save();

        res.json({
            success: true,
            message: 'Purchase updated successfully',
            purchase
        });
    } catch (error) {
        console.error('Update purchase error:', error);
        res.status(500).json({
            success: false,
            message: 'Server error while updating purchase'
        });
    }
};

// @desc    Delete a purchase
// @route   DELETE /api/purchases/:id
// @access  Private/Admin
exports.deletePurchase = async (req, res) => {
    try {
        const adminId = req.user.role === 'admin' ? req.user._id : req.user.adminId;
        const purchase = await Purchase.findOneAndDelete({ _id: req.params.id, adminId });

        if (!purchase) {
            return res.status(404).json({
                success: false,
                message: 'Purchase not found'
            });
        }

        res.json({
            success: true,
            message: 'Purchase deleted successfully'
        });
    } catch (error) {
        console.error('Delete purchase error:', error);
        res.status(500).json({
            success: false,
            message: 'Server error while deleting purchase'
        });
    }
};

// Helper for other controllers
exports.getShopBalanceInternal = exports.calculateBalance;
