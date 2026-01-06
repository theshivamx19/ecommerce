const { fetchHtml, extractProductImageUrls, productScrapper } = require('../../utils/webScrapper')
const shortHash = require('../../utils/shortHash')
const { safeGenerateMetadata } = require('../../services/AI/ImageToTextService');
const logger = require('../../utils/logger');

const productScrapService = async (url) => {
    logger.info('Starting product scrap process');
    try {
        // const html = await fetchHtml(url);
        // const productImages = extractProductImageUrls(html);
        const productJson = await productScrapper(url);
        if (productJson == null) {
            logger.info('Product url is offline shopify not found');
            return null;
        }
        const vendor = productJson.vendor;
        const variants = productJson.variants;
        // let random = 101;
        // variants.forEach((variant, index) => {
        //     let title = productJson?.title;
        //     title = title.replace(/[^a-zA-Z0-9]/g, "-").toUpperCase();
        //     const skuIndex = String(index + 1).padStart(3, '0');
        //     const vendorPrefix = vendor.split(" ").map(w => w[0]).join("").toUpperCase();
        //     const randomStoreCode = vendorPrefix + random;
        //     random++;
        //     variant.sku = `${vendorPrefix}-${title}-${skuIndex}-${randomStoreCode}`;
        // });
        // console.log(productJson.title, 'her ei sht etitle')
        // const productTitle = productJson.title;

        const images = productJson.images.map(img => {
            const cleanUrl = img.replace(/\?.+$/, '');
            return cleanUrl;
        });
        console.log(images)
        const randomThreeImages = images.length > 3 ? images.slice(0, 3) : images;
        logger.info('Random three images selected');
        const metadata = await safeGenerateMetadata({ images: randomThreeImages });
        logger.info('Metadata generated');
        console.log(metadata, metadata.title, 'here is the meta data==>')
        productJson.type = metadata?.type;
        const vendorPrefix = vendor
            .split(' ')
            .map(w => w[0])
            .join('')
            .toUpperCase();
        logger.info('Vendor prefix generated', vendorPrefix);
        const productCode = shortHash(productJson.id.toString());
        logger.info('Product code generated', productCode);
        // const storeCode = store.code.toUpperCase(); // US, EU, IN

        variants.forEach((variant, index) => {
            const variantIndex = String(index + 1).padStart(3, '0');
            logger.info('Variant index generated', variantIndex);
            variant.sku = `${vendorPrefix}-${productCode}-${variantIndex}`;
            logger.info('Variant sku generated', variant.sku);
            // variant.sku = `${vendorPrefix}-${productCode}-${variantIndex}-${storeCode}`;
        });



        // productImages.forEach((u) => console.log(u));
        await new Promise(resolve => setTimeout(resolve, 2500));
        logger.info('Product scrap completed');
        return productJson;
    } catch (err) {
        console.error('Error:', err);
    }
};

module.exports = {
    productScrapService
}