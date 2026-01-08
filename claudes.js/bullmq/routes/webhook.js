// routes/webhooks.js
const express = require('express');
const crypto = require('crypto');
const {
  addProductCreateJob,
  addProductUpdateJob,
  addInventoryUpdateJob,
  addProductVariantUpdateJob
} = require('../queues/shopify.queue');

const router = express.Router();

/**
 * Verify Shopify webhook signature
 */
const verifyShopifyWebhook = (req, res, next) => {
  const hmac = req.get('X-Shopify-Hmac-Sha256');
  const topic = req.get('X-Shopify-Topic');
  const shop = req.get('X-Shopify-Shop-Domain');
  
  if (!hmac || !topic || !shop) {
    return res.status(401).send('Missing required headers');
  }
  
  // Get raw body (make sure to use express.raw() middleware)
  const body = req.body;
  const hash = crypto
    .createHmac('sha256', process.env.SHOPIFY_WEBHOOK_SECRET)
    .update(body, 'utf8')
    .digest('base64');
  
  if (hash !== hmac) {
    console.error('HMAC verification failed');
    return res.status(401).send('HMAC verification failed');
  }
  
  // Parse JSON after verification
  req.parsedBody = JSON.parse(body.toString('utf8'));
  req.shopifyTopic = topic;
  req.shopifyShop = shop;
  
  next();
};

/**
 * Product Create Webhook
 */
router.post('/products/create', verifyShopifyWebhook, async (req, res) => {
  try {
    const productData = req.parsedBody;
    
    // Add job to queue
    await addProductCreateJob(productData);
    
    // Respond quickly to Shopify (within 5 seconds)
    res.status(200).send('Webhook received');
    
    console.log(`Product create webhook queued for product ${productData.id}`);
  } catch (error) {
    console.error('Error handling product create webhook:', error);
    res.status(500).send('Internal server error');
  }
});

/**
 * Product Update Webhook
 */
router.post('/products/update', verifyShopifyWebhook, async (req, res) => {
  try {
    const productData = req.parsedBody;
    
    await addProductUpdateJob(productData);
    
    res.status(200).send('Webhook received');
    
    console.log(`Product update webhook queued for product ${productData.id}`);
  } catch (error) {
    console.error('Error handling product update webhook:', error);
    res.status(500).send('Internal server error');
  }
});

/**
 * Inventory Update Webhook
 */
router.post('/inventory_levels/update', verifyShopifyWebhook, async (req, res) => {
  try {
    const inventoryData = req.parsedBody;
    
    await addInventoryUpdateJob(inventoryData);
    
    res.status(200).send('Webhook received');
    
    console.log(`Inventory update webhook queued for item ${inventoryData.inventory_item_id}`);
  } catch (error) {
    console.error('Error handling inventory update webhook:', error);
    res.status(500).send('Internal server error');
  }
});

/**
 * Product Variant Update Webhook
 */
router.post('/product_variants/update', verifyShopifyWebhook, async (req, res) => {
  try {
    const variantData = req.parsedBody;
    
    await addProductVariantUpdateJob(variantData);
    
    res.status(200).send('Webhook received');
    
    console.log(`Variant update webhook queued for variant ${variantData.id}`);
  } catch (error) {
    console.error('Error handling variant update webhook:', error);
    res.status(500).send('Internal server error');
  }
});

module.exports = router;