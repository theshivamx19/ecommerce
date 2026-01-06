/**
 * Raw Body Parser Middleware for Shopify Webhooks
 * 
 * Shopify requires the raw request body to verify HMAC signatures.
 * This middleware captures the raw body before JSON parsing.
 * 
 * Usage: Add this BEFORE express.json() middleware in your main app file
 */

const rawBodyParser = (req, res, next) => {
    // Only capture raw body for webhook routes
    // Changed from startsWith to includes to match nested routes
    if (req.path.includes('/webhooks')) {
        let data = '';

        req.on('data', (chunk) => {
            data += chunk;
        });

        req.on('end', () => {
            req.rawBody = data;
            next();
        });
    } else {
        next();
    }
};

module.exports = rawBodyParser;
