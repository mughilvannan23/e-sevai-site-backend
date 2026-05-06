const express = require('express');
const router = express.Router();
const purchaseController = require('../controllers/purchaseController');
const { authenticate, authorizeAdmin } = require('../middleware/auth');

// All purchase routes are admin only
router.use(authenticate);
router.use(authorizeAdmin);

router.route('/')
    .get(purchaseController.getAllPurchases)
    .post(purchaseController.createPurchase);

module.exports = router;
