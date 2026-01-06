const db = require("../../models/index.js");
const AppError = require("../../utils/AppError.js");
const logger = require("../../utils/logger.js");

/**
 * Update Shopify media IDs in the ProductVariant table
 * @param {Array} mediaData - Array of media objects from Shopify
 * @param {number} productId - Local product ID
 * @param {Object} variantSkuMap - Map of SKU to local variant IDs
 * @returns {Array} Updated variant records
 */
const createShopifyMediaRecords = async (mediaData, productId, variantSkuMap = {}) => {
  try {
    const updatedVariants = [];
    
    // For each media item, we need to map it to the appropriate variant
    // This is typically done when we have specific variant media mappings
    
    // Update the ProductVariant table with shopifyMediaId
    for (const [sku, variantId] of Object.entries(variantSkuMap)) {
      // Find the corresponding media for this variant (this would typically be based on image URLs)
      const variantMedia = mediaData.find(media => {
        // This is a simplified matching - in practice, you might match by image URL or other criteria
        const mediaUrl = media.image?.url || media.preview?.image?.url || media.url;
        // You might need more sophisticated matching logic here
        return true; // Placeholder - match all for now
      });
      
      if (variantMedia) {
        // Update the variant with the shopifyMediaId
        const [updatedRowsCount] = await db.ProductVariant.update(
          { shopifyMediaId: variantMedia.id },
          { where: { id: variantId } }
        );
        
        if (updatedRowsCount > 0) {
          updatedVariants.push({
            variantId: variantId,
            shopifyMediaId: variantMedia.id,
            sku: sku
          });
        }
      }
    }
    
    logger.info(`Updated ${updatedVariants.length} ProductVariants with Shopify media IDs for product ${productId}`);
    return updatedVariants;
  } catch (error) {
    logger.error('Error updating ProductVariants with Shopify media IDs:', error);
    throw new AppError(`Failed to update variants with media IDs: ${error.message}`, 500);
  }
};

/**
 * Associate media with product variants based on SKU mapping
 * @param {Array} mediaRecords - Array of media records
 * @param {Object} variantSkuMap - Map of SKU to local variant IDs
 * @param {Object} imageUrlToMediaIdMap - Map of image URLs to Shopify media IDs
 * @returns {Promise<void>}
 */
const associateMediaWithVariants = async (mediaRecords, variantSkuMap, imageUrlToMediaIdMap) => {
  try {
    logger.info('Associating media with variants based on SKU mapping');
    
    // Update the ProductVariant table with shopifyMediaId
    for (const [sku, variantId] of Object.entries(variantSkuMap)) {
      // Find the corresponding shopifyMediaId for this variant
      const mediaId = mediaRecords.find(record => record.variantId === variantId)?.shopifyMediaId || 
                     mediaRecords[0]?.shopifyMediaId; // fallback to first media if specific one not found
      
      if (mediaId) {
        // Update the variant with the shopifyMediaId
        await db.ProductVariant.update(
          { shopifyMediaId: mediaId },
          { where: { id: variantId } }
        );
        
        logger.debug(`Associated media ${mediaId} with variant ${variantId} (SKU: ${sku})`);
      }
    }
    
    logger.info(`Successfully associated media with variants`);
    return [];
  } catch (error) {
    logger.error('Error associating media with variants:', error);
    throw new AppError(`Failed to associate media with variants: ${error.message}`, 500);
  }
};

/**
 * Get media records for a product (from variants)
 * @param {number} productId - Local product ID
 * @returns {Array} Media records
 */
const getProductMedia = async (productId) => {
  try {
    const variants = await db.ProductVariant.findAll({
      where: {
        productId: productId,
        shopifyMediaId: { [db.Sequelize.Op.not]: null } // Only variants with shopifyMediaId set
      },
      attributes: ['id', 'sku', 'shopifyMediaId', 'image_url'],
      order: [['id', 'ASC']]
    });
    
    // Format the result to match the expected media records format
    return variants.map(variant => ({
      id: variant.id,
      shopifyMediaId: variant.shopifyMediaId,
      imageUrl: variant.image_url,
      variantId: variant.id,
      sku: variant.sku
    }));
  } catch (error) {
    logger.error(`Error fetching media for product ${productId}:`, error);
    throw new AppError(`Failed to fetch media: ${error.message}`, 500);
  }
};

/**
 * Get media records for a variant
 * @param {number} variantId - Local variant ID
 * @returns {Array} Media records
 */
const getVariantMedia = async (variantId) => {
  try {
    const variant = await db.ProductVariant.findByPk(variantId, {
      attributes: ['id', 'sku', 'shopifyMediaId', 'image_url', 'productId']
    });
    
    if (!variant || !variant.shopifyMediaId) {
      return []; // Return empty array if no media is associated
    }
    
    // Return the media information in the same format as before
    return [{
      id: variant.id,
      shopifyMediaId: variant.shopifyMediaId,
      imageUrl: variant.image_url,
      variantId: variant.id,
      sku: variant.sku
    }];
  } catch (error) {
    logger.error(`Error fetching media for variant ${variantId}:`, error);
    throw new AppError(`Failed to fetch media: ${error.message}`, 500);
  }
};

module.exports = {
  createShopifyMediaRecords,
  associateMediaWithVariants,
  getProductMedia,
  getVariantMedia
};