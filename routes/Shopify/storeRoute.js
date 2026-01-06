const express = require("express");
const router = express.Router();
const {
    getAllActiveStoresController,
    getStoreDetailsController,
    deleteStoreController,
    updateStoreController
} = require('../../controllers/Shopify/StoreController')
const auth = require('../../middlewares/auth');

router.get('/active', auth(['admin', 'manager', 'member']), getAllActiveStoresController)
router.get('/:id', auth(['admin', 'manager', 'member']), getStoreDetailsController)
router.delete('/:id', auth(['admin', 'manager', 'member']), deleteStoreController)
router.put('/:id', auth(['admin', 'manager', 'member']), updateStoreController)

module.exports = router;