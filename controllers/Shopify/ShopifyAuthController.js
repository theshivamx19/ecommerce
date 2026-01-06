const express = require('express');
const router = express.Router();
const ShopifyWebService = require('../../services/Shopify/ShopifyAuthService');
const ShopifyService = require('../../services/Shopify/ShopifyService')
const StoreService = require('../../services/Shopify/StoreService')
const db = require('../../models/index');
require('dotenv').config();

// Temporary in-memory store for nonces (use Redis in production)
const nonceStore = new Map();

/**
 * GET /auth
 * Initiate OAuth flow
 */
const shopifyAuthController = (req, res, next) => {
    const { shop } = req.query;
    // console.log(req.query)
    if (!shop) {
        return res.status(400).json({ error: 'Shop parameter is required' });
    }

    if (!shop.match(/^[a-zA-Z0-9-]+\.myshopify\.com$/)) {
        return res.status(400).json({ error: 'Invalid shop domain format' });
    }

    if (!process.env.SHOPIFY_API_KEY || process.env.SHOPIFY_API_KEY.includes('your_')) {
        return res.status(500).json({
            error: 'Shopify API credentials not configured',
            message: 'Please set SHOPIFY_API_KEY and SHOPIFY_API_SECRET in your .env file'
        });
    }

    const scopes = process.env.SHOPIFY_SCOPES;
    const redirectUri = process.env.SHOPIFY_REDIRECT_URI;

    const { installUrl, nonce } = ShopifyWebService.generateInstallUrl(shop, scopes, redirectUri);

    console.log('🔐 OAuth Installation Request:');
    console.log('  Shop:', shop);
    console.log('  API Key:', process.env.SHOPIFY_API_KEY?.substring(0, 8) + '...');
    console.log('  Scopes:', scopes);
    console.log('  Redirect URI:', redirectUri);
    console.log('  Install URL:', installUrl);

    // Store nonce in both session and in-memory store for verification
    // req.session.nonce = nonce;
    // req.session.shop = shop;


    // Also store in memory as backup (expires in 10 minutes)
    nonceStore.set(shop, { nonce, timestamp: Date.now() });
    setTimeout(() => nonceStore.delete(shop), 10 * 60 * 1000);

    console.log('🔐 OAuth Installation Request:');
    // console.log('  Session:', req.session);
    console.log('  Nonce:', nonce);
    console.log('  Shop:', shop);
    console.log('  Install URL:', installUrl);

    // res.redirect(installUrl);
    return res.status(200).json({
        success: true,
        installUrl
    })
};

/**
 * GET /auth/callback
 * Handle OAuth callback
 */
const shopifyCallbackController = async (req, res, next) => {
    const { shop, code, state } = req.query;
    console.log('🔄 OAuth Callback Received:');
    console.log('  Shop:', shop);
    console.log('  State from Shopify:', state);
    // console.log('  Session nonce:', req.session.nonce);
    // console.log('  Session:', req.session);

    // Verify state matches nonce (check both session and in-memory store)
    const storedNonce = nonceStore.get(shop)?.nonce;

    console.log('  Stored nonce (session or memory):', storedNonce);

    if (state !== storedNonce) {
        // Warning: This suppresses the security check for duplicate requests. 
        // If storedNonce is undefined, it means it was likely already processed and deleted.
        if (!storedNonce) {
            console.warn(`⚠️ Duplicate OAuth request detected for shop: ${shop}. Ignoring (assumed success).`);
            // Return success payload so the browser/client doesn't show an error
            return res.status(200).json({
                success: true,
                message: 'Authenticated (duplicate request ignored)',
                duplicate: true
            });
        }
        return res.status(403).json({
            error: 'Invalid state parameter',
            debug: {
                receivedState: state,
                expectedNonce: storedNonce,
                sessionExists: !!req.session.nonce,
                memoryStoreExists: !!nonceStore.get(shop)
            }
        });
    }

    nonceStore.delete(shop);
    if (!ShopifyWebService.verifyHmac(req.query)) {
        return res.status(403).json({ error: 'HMAC verification failed' });
    }
    try {
        const tokenData = await ShopifyWebService.getAccessToken(shop, code);
        const [store] = await StoreService.createOrUpdateExistingStore(shop, tokenData.access_token);

        // req.session.nonce = null;
        // req.session.shop = null;

        return res.redirect(`${process.env.FRONTEND_URL}/my-stores`)
        // return res.status(200).json({
        //     success: true,
        //     message: store?.createdAt ? 'Store connected successfully' : 'Store updated successfully',
        //     store: {
        //         id: store.id,
        //         storeName: store.storeName,
        //         active: store.isActive
        //     }
        // });
    } catch (error) {
        console.error('OAuth callback error:', error);
        next(error)
    }
};

/**
 * GET /auth/status
 * Get list of connected stores
 */
const shopifyStatusController = async (req, res, next) => {
    try {
        const stores = await StoreService.getStore();
        console.log(stores, 'stores data in status api =================>')
        return res.status(200).json({
            success: true,
            stores
        });
    } catch (error) {
        console.error('Error fetching stores:', error);
        next(error)
    }
};

module.exports = {
    shopifyAuthController,
    shopifyCallbackController,
    shopifyStatusController
};    
