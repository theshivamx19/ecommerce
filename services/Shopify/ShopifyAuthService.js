const axios = require('axios');
const crypto = require('crypto');

class ShopifyWebService {
    constructor(shop, accessToken) {
        this.shop = shop;
        this.accessToken = accessToken;
        this.apiVersion = '2024-01';
        this.baseUrl = `https://${shop}/admin/api/${this.apiVersion}`;
    }

    /**
     * Generate installation URL for OAuth
     */
    static generateInstallUrl(shop, scopes, redirectUri) {
        const apiKey = process.env.SHOPIFY_API_KEY;
        const nonce = crypto.randomBytes(16).toString('hex');

        const installUrl = `https://${shop}/admin/oauth/authorize?client_id=${apiKey}&scope=${scopes}&redirect_uri=${redirectUri}&state=${nonce}`;

        return { installUrl, nonce };
    }

    /**
     * Exchange authorization code for access token
     */
    static async getAccessToken(shop, code) {
        try {
            const response = await axios.post(
                `https://${shop}/admin/oauth/access_token`,
                {
                    client_id: process.env.SHOPIFY_API_KEY,
                    client_secret: process.env.SHOPIFY_API_SECRET,
                    code
                }
            );
            return response.data;
        } catch (error) {
            console.error('Error getting access token:', error.response?.data || error.message);
            throw error;
        }
    }

    /**
     * Verify HMAC signature
     */
    static verifyHmac(query) {
        const { hmac, ...params } = query;

        const message = Object.keys(params)
            .sort()
            .map(key => `${key}=${params[key]}`)
            .join('&');

        const hash = crypto
            .createHmac('sha256', process.env.SHOPIFY_API_SECRET)
            .update(message)
            .digest('hex');

        return hash === hmac;
    }

    /**
     * Make API request to Shopify
     */
    async makeRequest(method, endpoint, data = null) {
        try {
            const config = {
                method,
                url: `${this.baseUrl}${endpoint}`,
                headers: {
                    'X-Shopify-Access-Token': this.accessToken,
                    'Content-Type': 'application/json'
                }
            };

            if (data) {
                config.data = data;
            }

            const response = await axios(config);
            return response.data;
        } catch (error) {
            console.error(`Shopify API Error [${method} ${endpoint}]:`, error.response?.data || error.message);
            throw error;
        }
    }


    //     /**
    //  * Validate shop domain format
    //  */
    // function isValidShopDomain(shop) {
    //   const regex = /^[a-zA-Z0-9][a-zA-Z0-9-]*\.myshopify\.com$/;
    //   return regex.test(shop);
    // }

    /**
     * Create a product in Shopify
     */
    async createProduct(productData) {
        const shopifyProduct = {
            product: {
                title: productData.title,
                body_html: productData.description,
                vendor: productData.vendor,
                product_type: productData.productType,
                tags: Array.isArray(productData.tags) ? productData.tags.join(',') : productData.tags,
                status: productData.status,
                variants: productData.variants || [],
                images: productData.images || []
            }
        };

        return await this.makeRequest('POST', '/products.json', shopifyProduct);
    }

    /**
     * Update a product in Shopify
     */
    async updateProduct(shopifyProductId, productData) {
        const shopifyProduct = {
            product: {
                id: shopifyProductId,
                title: productData.title,
                body_html: productData.description,
                vendor: productData.vendor,
                product_type: productData.productType,
                tags: Array.isArray(productData.tags) ? productData.tags.join(',') : productData.tags,
                status: productData.status
            }
        };

        return await this.makeRequest('PUT', `/products/${shopifyProductId}.json`, shopifyProduct);
    }

    /**
     * Get a product from Shopify
     */
    async getProduct(shopifyProductId) {
        return await this.makeRequest('GET', `/products/${shopifyProductId}.json`);
    }

    /**
     * Delete a product from Shopify
     */
    async deleteProduct(shopifyProductId) {
        return await this.makeRequest('DELETE', `/products/${shopifyProductId}.json`);
    }

    /**
     * Get shop information
     */
    async getShopInfo() {
        return await this.makeRequest('GET', '/shop.json');
    }
}

module.exports = ShopifyWebService;
