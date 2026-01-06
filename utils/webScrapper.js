// const axios = require('axios');
// const cheerio = require('cheerio');

// async function fetchHtml(url) {
//     const res = await axios.get(url, {
//         headers: {
//             'User-Agent':
//                 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Safari/537.36',
//         },
//     });
//     return res.data;
// }

// function normalizeShopifyImageUrl(url) {
//   const [base, query] = url.split('?');
//   // remove protocol-less prefix
//   const full = base.startsWith('//') ? 'https:' + base : base;

//   // remove size suffix _{width}x or _{width}x{height}
//   const normalized = full.replace(/_(\d+)x(\d+)?(?=\.(jpg|jpeg|png|webp))/i, '');

//   return query ? `${normalized}?${query}` : normalized;
// }


// function extractProductImageUrls(html, pageUrl) {
//   const $ = cheerio.load(html);
//   const urls = new Set();

//   $('.product__photos img, .product__media img, .product-gallery img').each((_, el) => {
//     let src = $(el).attr('src') || $(el).attr('data-src');
//     if (!src) return;
//     if (!src.includes('/cdn/shop/files/') && !src.includes('/cdn.shopify.com/')) return;

//     const absolute = src.startsWith('http')
//       ? src
//       : src.startsWith('//')
//       ? 'https:' + src
//       : new URL(src, pageUrl).href;

//     urls.add(normalizeShopifyImageUrl(absolute));
//   });

//   return Array.from(urls);
// }

// module.exports = {
//     fetchHtml,
//     extractProductImageUrls
// }




const axios = require("axios");

/**
 * Fetch full Shopify product metadata including variants, images, media, tags, etc.
 * @param {string} productUrl
 */
// async function fetchShopifyProduct(productUrl) {
//     try {
//         // Convert product URL → Shopify product JSON endpoint
//         const jsonUrl = productUrl.replace(/\/$/, "") + ".js";
//         const { data } = await axios.get(jsonUrl, {
//             headers: {
//                 "User-Agent":
//                     "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
//             },
//         });
//         return data; // Already full structured JSON
//     } catch (err) {
//         console.error("Error fetching product JSON:", err.message);
//         return null;
//     }
// }

const browserHeaders = {
    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
    "Accept": "application/json, text/plain, */*",
    "Accept-Language": "en-US,en;q=0.9",
    "Accept-Encoding": "gzip, deflate, br",
    "Connection": "keep-alive",
    "Sec-Fetch-Dest": "empty",
    "Sec-Fetch-Mode": "cors",
    "Sec-Fetch-Site": "same-origin",
    "Cache-Control": "no-cache",
    "Pragma": "no-cache"
};

async function productScrapper(productUrl) {
    try {
        const jsonUrl = productUrl.replace(/\/$/, "") + ".js";
        const { data } = await axios.get(jsonUrl, {
            headers: browserHeaders,
            timeout: 10000,
            // Add random delay
            ...axios.defaults.transformRequest
        });
        return data;
    } catch (err) {
        console.error("Error fetching product JSON:", err.response?.status, err.message);
        return null;
    }
}

module.exports = {
    productScrapper
}