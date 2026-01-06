const crypto = require('crypto');
const db = require("../../models/index.js");
const { checkAndDeleteIfZeroInventory } = require("../../services/Product/VariantDeletionService.js");
const logger = require("../../utils/logger.js");
const AppError = require("../../utils/AppError.js");

/**
 * Verify Shopify webhook HMAC signature
 * @param {string} body - Raw request body
 * @param {string} hmacHeader - HMAC header from Shopify
 * @param {string} secret - Shopify API secret
 * @returns {boolean} - Whether signature is valid
 */
const verifyShopifyWebhook = (body, hmacHeader, secret) => {
    const hash = crypto
        .createHmac('sha256', secret)
        .update(body, 'utf8')
        .digest('base64');

    return hash === hmacHeader;
};

/**
 * Handle inventory level update webhook from Shopify
 * Triggered when inventory changes (e.g., customer purchase)
 * 
 * Webhook topic: inventory_levels/update
 */
const handleInventoryLevelUpdate = async (req, res, next) => {
    try {
        // Verify webhook authenticity
        const hmacHeader = req.get('X-Shopify-Hmac-Sha256');
        const shopDomain = req.get('X-Shopify-Shop-Domain');

        if (!hmacHeader || !shopDomain) {
            logger.warn('Missing Shopify webhook headers');
            return res.status(401).json({ error: 'Unauthorized' });
        }

        // Verify HMAC (using raw body)
        const isValid = verifyShopifyWebhook(
            req.rawBody, // You'll need to add raw body parser middleware
            hmacHeader,
            process.env.SHOPIFY_API_SECRET
        );

        if (!isValid) {
            logger.error('Invalid Shopify webhook signature');
            return res.status(401).json({ error: 'Invalid signature' });
        }

        logger.info(`Received inventory_levels/update webhook from ${shopDomain}`);

        const webhookData = req.body;

        // Extract inventory data
        const {
            inventory_item_id,
            location_id,
            available
        } = webhookData;

        logger.info(`Inventory update: Item ${inventory_item_id}, Location ${location_id}, Available: ${available}`);

        // Find the store by domain
        const store = await db.Store.findOne({
            where: { shopifyDomain: shopDomain }
        });

        if (!store) {
            logger.warn(`Store not found for domain: ${shopDomain}`);
            return res.status(200).json({ received: true, message: 'Store not found' });
        }

        // Find variant by inventory item ID for this store
        // The inventoryItemIds JSON field stores: { "storeId": "inventoryItemId" }
        const variants = await db.ProductVariant.findAll();

        let matchedVariant = null;
        for (const variant of variants) {
            const inventoryItemIds = variant.inventoryItemIds || {};
            const storeInventoryItemId = inventoryItemIds[store.id];

            // Match the inventory item ID (remove gid prefix if present)
            const cleanInventoryItemId = inventory_item_id.toString().replace('gid://shopify/InventoryItem/', '');
            const cleanStoreInventoryItemId = storeInventoryItemId ? storeInventoryItemId.toString().replace('gid://shopify/InventoryItem/', '') : null;

            if (cleanStoreInventoryItemId === cleanInventoryItemId) {
                matchedVariant = variant;
                break;
            }
        }

        if (!matchedVariant) {
            logger.info(`No local variant found for inventory item ${inventory_item_id}`);
            return res.status(200).json({ received: true, message: 'Variant not found' });
        }

        logger.info(`Matched variant ${matchedVariant.id} (SKU: ${matchedVariant.sku})`);

        // Update local stock quantity
        await db.ProductVariant.update(
            { stockQuantity: available },
            { where: { id: matchedVariant.id } }
        );

        logger.info(`Updated variant ${matchedVariant.id} stock to ${available}`);

        // Check if we need to delete (stock reached 0)
        if (available === 0) {
            logger.info(`Stock reached 0 for variant ${matchedVariant.id}. Triggering auto-deletion.`);

            // Trigger deletion (non-blocking)
            checkAndDeleteIfZeroInventory(matchedVariant.id, available)
                .then(result => {
                    if (result) {
                        logger.info(`Auto-deletion completed for variant ${matchedVariant.id}:`, result);
                    }
                })
                .catch(error => {
                    logger.error(`Auto-deletion failed for variant ${matchedVariant.id}:`, error);
                });
        }

        // Respond immediately to Shopify (don't wait for deletion)
        return res.status(200).json({
            received: true,
            variantId: matchedVariant.id,
            newStock: available
        });

    } catch (error) {
        logger.error('Error handling inventory_levels/update webhook:', error);
        // Always return 200 to Shopify to prevent retries
        return res.status(200).json({ received: true, error: error.message });
    }
};

/**
 * Handle order creation webhook from Shopify
 * Alternative trigger for inventory changes
 * 
 * Webhook topic: orders/create
 */
const handleOrderCreate = async (req, res, next) => {
    try {
        // Verify webhook
        const hmacHeader = req.get('X-Shopify-Hmac-Sha256');
        const shopDomain = req.get('X-Shopify-Shop-Domain');

        if (!hmacHeader || !shopDomain) {
            return res.status(401).json({ error: 'Unauthorized' });
        }

        const isValid = verifyShopifyWebhook(
            req.rawBody,
            hmacHeader,
            process.env.SHOPIFY_API_SECRET
        );

        if (!isValid) {
            logger.error('Invalid Shopify webhook signature');
            return res.status(401).json({ error: 'Invalid signature' });
        }

        logger.info(`Received orders/create webhook from ${shopDomain}`);

        const order = req.body;
        const lineItems = order.line_items || [];

        logger.info(`Order ${order.id} created with ${lineItems.length} items`);

        // Find the store
        const store = await db.Store.findOne({
            where: { shopifyDomain: shopDomain }
        });

        if (!store) {
            return res.status(200).json({ received: true, message: 'Store not found' });
        }

        // Process each line item
        for (const item of lineItems) {
            const variantId = item.variant_id;
            const quantity = item.quantity;

            logger.info(`Processing line item: Variant ${variantId}, Quantity ${quantity}`);

            // Find local variant by Shopify variant ID
            const variants = await db.ProductVariant.findAll();

            let matchedVariant = null;
            for (const variant of variants) {
                const shopifyVariantIds = variant.shopifyVariantIds || {};
                const storeVariantId = shopifyVariantIds[store.id];

                const cleanVariantId = variantId.toString().replace('gid://shopify/ProductVariant/', '');
                const cleanStoreVariantId = storeVariantId ? storeVariantId.toString().replace('gid://shopify/ProductVariant/', '') : null;

                if (cleanStoreVariantId === cleanVariantId) {
                    matchedVariant = variant;
                    break;
                }
            }

            if (matchedVariant) {
                // Decrease stock quantity
                const newStock = Math.max(0, (matchedVariant.stockQuantity || 0) - quantity);

                await db.ProductVariant.update(
                    { stockQuantity: newStock },
                    { where: { id: matchedVariant.id } }
                );

                logger.info(`Updated variant ${matchedVariant.id} stock: ${matchedVariant.stockQuantity} -> ${newStock}`);

                // Check for deletion
                if (newStock === 0) {
                    logger.info(`Stock reached 0 for variant ${matchedVariant.id}. Triggering auto-deletion.`);

                    checkAndDeleteIfZeroInventory(matchedVariant.id, newStock)
                        .catch(error => {
                            logger.error(`Auto-deletion failed for variant ${matchedVariant.id}:`, error);
                        });
                }
            }
        }

        return res.status(200).json({ received: true, orderId: order.id });

    } catch (error) {
        logger.error('Error handling orders/create webhook:', error);
        return res.status(200).json({ received: true, error: error.message });
    }
};

/**
 * Test endpoint to verify webhook setup
 */
const testWebhook = async (req, res) => {
    return res.status(200).json({
        success: true,
        message: 'Webhook endpoint is working',
        timestamp: new Date().toISOString()
    });
};

module.exports = {
    handleInventoryLevelUpdate,
    handleOrderCreate,
    testWebhook,
    verifyShopifyWebhook
};
