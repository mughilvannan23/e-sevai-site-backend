const express = require('express');
const router = express.Router();
const {
  createShopAdmin,
  getShopAdmins,
  updateShopAdmin
} = require('../controllers/superadminController');
const { authenticate, authorizeSuperAdmin } = require('../middleware/auth');

router.use(authenticate);
router.use(authorizeSuperAdmin);

router.post('/admins', createShopAdmin);
router.get('/admins', getShopAdmins);
router.put('/admins/:id', updateShopAdmin);

module.exports = router;
