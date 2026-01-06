const express = require("express");
const router = express.Router();

const {
    shopifyAuthController,
    shopifyCallbackController,
    shopifyStatusController
} = require("../../controllers/Shopify/ShopifyAuthController");
const {
    // fetchShopifyProductsController,
    // fetchAllShopifyProductsWithPaginationController,
    fetchShopifyProductsController,
    createShopifyProductController
} = require('../../controllers/Shopify/ShopifyController');
const {
    handleInventoryLevelUpdate,
    handleOrderCreate,
    testWebhook
} = require('../../controllers/Shopify/ShopifyWebhookController');
const auth = require('../../middlewares/auth');


router.get('/auth', shopifyAuthController);
router.get('/auth/callback', shopifyCallbackController);
router.get('/status', shopifyStatusController);

router.get('/products/:storeId', auth(['admin', 'manager', 'member']), fetchShopifyProductsController);
router.post('/product/create/:storeId', auth(['admin', 'manager', 'member']), createShopifyProductController);

// Webhook routes (NO auth middleware - Shopify calls these directly)
router.post('/webhooks/inventory-update', handleInventoryLevelUpdate);
router.post('/webhooks/order-create', handleOrderCreate);
router.get('/webhooks/test', testWebhook);




// router.get('/products/:storeId', fetchShopifyProductsController);
// router.get('/products/all/:storeId', fetchAllShopifyProductsWithPaginationController);



module.exports = router;