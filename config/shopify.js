require('@shopify/shopify-api/adapters/node');
const { shopifyApi, ApiVersion, Session } = require('@shopify/shopify-api');

const shopify = shopifyApi({
  apiKey: process.env.SHOPIFY_API_KEY,
  apiSecretKey: process.env.SHOPIFY_API_SECRET,
  scopes: ['read_products', 'write_products'],
  hostName: process.env.SHOPIFY_HOST_NAME.replace(/https?:\/\//, ''),
  apiVersion: ApiVersion.October25,
});


const createShopifySession = (shopDomain, accessToken) => {
  return new Session({
    id: `offline_${shopDomain}`,
    shop: shopDomain,
    state: 'state',
    isOnline: false,
    accessToken,
  });
}
module.exports = {
  shopify,
  createShopifySession
}