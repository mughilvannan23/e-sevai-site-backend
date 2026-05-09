const Purchase = require('../models/Purchase');
const Work = require('../models/Work');

// Calculate current shop balance
const calculateBalance = async () => {
    // Sum all cashAmount from Work model
    const totalCashResult = await Work.aggregate([
        { $match: { paymentStatus: 'Paid' } },
        { $group: { _id: null, total: { $sum: '$cashAmount' } } }
    ]);
    const totalCash = totalCashResult[0]?.total || 0;

    // Sum all amount from Purchase model
    const totalPurchaseResult = await Purchase.aggregate([
        { $group: { _id: null, total: { $sum: '$amount' } } }
    ]);
    const totalPurchase = totalPurchaseResult[0]?.total || 0;

    // Sum all applicationFee from Work model for "Handcash to Gpay Transfer" ONLY
    const totalTransferResult = await Work.aggregate([
        {
            $match: {
                'items.title': { $regex: /Handcash to Gpay Transfer/i },
                paymentStatus: 'Paid'
            }
        },
        { $group: { _id: null, total: { $sum: '$applicationFee' } } }
    ]);
    const totalTransfer = totalTransferResult[0]?.total || 0;

    return totalCash - totalPurchase - totalTransfer;
};

// @desc    Get all purchases with date filter
// @route   GET /api/purchases
// @access  Private/Admin
exports.getAllPurchases = async (req, res) => {
    try {
        const { startDate, endDate, filter } = req.query;
        let query = {};

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
        const shopBalance = await calculateBalance();

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
        const { orderName, amount, date } = req.body;

        if (!orderName || !amount) {
            return res.status(400).json({
                success: false,
                message: 'Order name and amount are required'
            });
        }

        const currentBalance = await calculateBalance();

        if (amount > currentBalance) {
            return res.status(400).json({
                success: false,
                message: 'Insufficient balance'
            });
        }

        const purchase = new Purchase({
            orderName,
            amount,
            date: date || Date.now()
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

// Helper for other controllers
exports.getShopBalanceInternal = calculateBalance;
