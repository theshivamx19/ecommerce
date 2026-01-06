const {
  createProductService,
  createBulkProductsService,
  getProductById,
  getProductWithDetails,
  getAllProducts,
  updateProduct,
  deleteProduct,
} = require("../../services/Product/ProductService");
const { syncProductToShopifyService } = require("../../services/Product/SyncProductToShopifyService");
const { bulkSyncProductsToShopifyService } = require("../../services/Product/BulkSyncProductToShopifyService");
const { v4: uuidv4 } = require("uuid");
const AppError = require("../../utils/AppError");
const logger = require("../../utils/logger");
const db = require("../../models/index.js");
const { downloadImagesFromUrlsAndUploadToS3, convertBase64ToS3, convertBase64ArrayToS3 } = require("../../utils/UrlToS3Util");

const createProductController = async (req, res, next) => {
  try {
    // Get authenticated user ID from JWT token
    const userId = req.userId;
    // Auto-generate unique reference code
    const uniqueReferenceCode = uuidv4();

    // Extract fields from request body
    const {
      flowId,
      title,
      description, // Fixed typo: descripiton -> description
      productType,
      vendor,
      tags,
      status,
      isEnriched,
      images,
      enrichmentCompletedAt,
      approvedBy,
      approvedAt,
      options,
      variants, // Add variants extraction
      storeId, // Include storeId for local data tracking
      // Removed Shopify-related fields: shopifyConfig, locationId
    } = req.body;
    // Validate required fields only
    if (!title || !description || !productType) {
      throw new AppError(
        "Please provide title, description, and productType",
        400
      );
    }

    // Prepare product data object
    const productData = {
      uniqueReferenceCode,
      flowId: flowId || null,
      title,
      description,
      productType,
      vendor: vendor || null,
      tags: tags || [],
      status: status || "draft", // Default to 'draft' if not provided
      isEnriched: isEnriched || false, // Default to false
      images,
      variants, // Add variants to productData
      storeId: storeId || null, // Include storeId for local tracking
      enrichmentCompletedAt: enrichmentCompletedAt || null,
      createdBy: userId, // Use authenticated user's ID
      approvedBy: approvedBy || null,
      approvedAt: approvedAt || null,
    };

    // Create product with options only (no Shopify integration)
    const result = await createProductService(
      productData,
      options || []
      // Removed shopifyConfig parameter
    );

    logger.info(`Product created locally: ${result.id} by user ${userId}`);

    res.status(201).json({
      success: true,
      message: "Product created successfully (local only, needs sync to Shopify)",
      data: result,
    });
  } catch (error) {
    console.error("Product creation error:", error);
    next(error);
  }
};

const getProductController = async (req, res, next) => {
  try {
    const productId = req.params.id;
    const { includeDetails = false } = req.query;
    const result = includeDetails
      ? await getProductWithDetails(productId)
      : await getProductById(productId);
    if (!result) {
      throw new AppError("Product not found", 404);
    }
    res.status(200).json({
      success: true,
      data: result,
    });
  } catch (error) {
    console.error("Get product error:", error);
    next(error);
  }
};

const getProductsController = async (req, res, next) => {
  try {
    const result = await getAllProducts(req.query);
    res.status(200).json({
      success: true,
      data: result,
    });
  } catch (error) {
    console.error("Get products error:", error);
    next(error);
  }
};

const updateProductController = async (req, res, next) => {
  try {
    const productId = req.params.id;
    const { shopifyConfig, storeId, locationId, ...updateData } = req.body; // Keeping storeId for update operations
    
    // Add debug logging
    logger.debug(`Update request for product ID: ${productId}`);
    logger.debug(`Update data keys: ${Object.keys(updateData)}`);
    if (updateData.variants) {
      logger.debug(`Number of variants in update: ${updateData.variants.length}`);
      logger.debug(`Variant IDs in update: ${updateData.variants.map(v => v.id)}`);
      logger.debug(`Variant SKUs in update: ${updateData.variants.map(v => v.sku)}`);
    }

    // Auto-fetch Shopify config from Store if storeId provided
    let finalShopifyConfig = shopifyConfig;
    if (storeId && !shopifyConfig) {
      const store = await db.Store.findByPk(storeId);
      if (store && store.shopifyDomain && store.shopifyAccessToken) {
        finalShopifyConfig = {
          shopDomain: store.shopifyDomain,
          accessToken: store.shopifyAccessToken,
        };
        logger.info(`Using Shopify credentials from store: ${store.storeName}`);
      }
    }
    
    // Add locationId to Shopify config if provided
    if (locationId && finalShopifyConfig) {
      finalShopifyConfig.locationId = locationId;
    }

    const result = await updateProduct(productId, updateData, finalShopifyConfig);
    
    res.status(200).json({
      success: true,
      message: "Product updated successfully",
      data: result,
    });
  } catch (error) {
    console.error("Product update error:", error);
    next(error);
  }
};

const updateProductVariantImagesController = async (req, res, next) => {
  try {
    const productId = req.params.id;
    const { variants, shopifyConfig, storeId } = req.body;

    // Validate required fields
    if (!variants || !Array.isArray(variants) || variants.length === 0) {
      throw new AppError('Variants with image data are required', 400);
    }

    // Auto-fetch Shopify config from Store if storeId provided
    let finalShopifyConfig = shopifyConfig;
    if (storeId && !shopifyConfig) {
      const store = await db.Store.findByPk(storeId);
      if (store && store.shopifyDomain && store.shopifyAccessToken) {
        finalShopifyConfig = {
          shopDomain: store.shopifyDomain,
          accessToken: store.shopifyAccessToken,
        };
        logger.info(`Using Shopify credentials from store: ${store.storeName}`);
      }
    }

    // Validate Shopify config
    if (!finalShopifyConfig?.shopDomain || !finalShopifyConfig?.accessToken) {
      throw new AppError('Shopify configuration is required for updating variant images', 400);
    }

    // Get existing product to check if it has Shopify ID
    const existingProduct = await db.Product.findByPk(productId);
    if (!existingProduct || !existingProduct.shopifyProductId) {
      throw new AppError('Product not found or not synced to Shopify', 404);
    }

    // Import the updateVariantImages function
    const { updateVariantImages } = require('../../services/Shopify/ShopifyGraphqlService');

    // Prepare variant images data
    const variantImagesToUpdate = variants
      .filter(variant => variant.shopifyVariantId && variant.mediaIds && Array.isArray(variant.mediaIds) && variant.mediaIds.length > 0)
      .map(variant => ({
        variantId: variant.shopifyVariantId,
        mediaIds: variant.mediaIds
      }));

    if (variantImagesToUpdate.length === 0) {
      throw new AppError('No valid variants with media IDs found', 400);
    }

    // Update variant images on Shopify
    const result = await updateVariantImages(
      finalShopifyConfig.shopDomain,
      finalShopifyConfig.accessToken,
      existingProduct.shopifyProductId,
      variantImagesToUpdate,
      true // Enable deletion of old media
    );

    res.status(200).json({
      success: true,
      message: `Successfully updated images for ${result.productVariants?.length || 0} variants`,
      data: result,
    });
  } catch (error) {
    console.error('Product variant images update error:', error);
    next(error);
  }
};

const deleteProductController = async (req, res, next) => {
  try {
    const productId = req.params.id;
    const result = await deleteProduct(productId);
    if (result === 0) {
      throw new AppError("Product not found", 404);
    }
    res.status(200).json({
      success: true,
      message: "Product deleted successfully",
    });
  } catch (error) {
    console.error("Product delete error:", error);
    next(error);
  }
};

const syncProductToShopifyController = async (req, res, next) => {
  try {
    const productId = req.params.id;
    const locationId = req.body?.locationId || null;
    
    // Handle the new format where stores is an array of objects with storeId and optional locationId
    let stores = null;
    let storeIds = null;
    
    if (req.body?.stores && Array.isArray(req.body.stores) && req.body.stores.length > 0) {
      // New format: array of objects with storeId and optional locationId
      stores = req.body.stores;
    } else if (req.body?.storeIds && Array.isArray(req.body.storeIds) && req.body.storeIds.length > 0) {
      // Legacy format: array of store IDs with single locationId
      storeIds = req.body.storeIds;
    } else if (req.body?.storeId) {
      // Legacy format: single storeId with single locationId
      storeIds = [req.body.storeId];
    }
    
    // Check if product exists
    const product = await db.Product.findByPk(productId);
    if (!product) {
      throw new AppError("Product not found", 404);
    }
    
    // Call sync service
    const result = await syncProductToShopifyService(productId, locationId, storeIds, stores);
    
    // Check if product was already synced (for backward compatibility)
    if (result.alreadySynced) {
      res.status(200).json({
        success: true,
        message: result.message,
        data: result,
      });
    } else {
      res.status(200).json({
        success: true,
        message: result.message || "Product synced to Shopify successfully",
        data: result,
      });
    }
  } catch (error) {
    console.error("Product sync error:", error);
    next(error);
  }
};

const bulkSyncProductsToShopifyController = async (req, res, next) => {
  try {
    const { productIds, locationId, storeId, stores } = req.body;
    
    if (!productIds || !Array.isArray(productIds) || productIds.length === 0) {
      throw new AppError("Product IDs array is required", 400);
    }
    
    // Call bulk sync service
    const results = await bulkSyncProductsToShopifyService(productIds, locationId || null, storeId || null, stores || null);
    
    // Count success and failed syncs
    const successfulSyncs = results.filter(r => r.success).length;
    const failedSyncs = results.filter(r => !r.success).length;
    
    
    res.status(200).json({
      success: true,
      message: `Bulk sync completed: ${successfulSyncs} successful, ${failedSyncs} failed`,
      data: {
        total: results.length,
        successful: successfulSyncs,
        failed: failedSyncs,
        results: results
      },
    });
  } catch (error) {
    console.error("Bulk product sync error:", error);
    next(error);
  }
};

const createBulkProductsController = async (req, res, next) => {
  try {
    // Get authenticated user ID from JWT token
    const userId = req.userId;
    
    const { products } = req.body;
    
    if (!products || !Array.isArray(products) || products.length === 0) {
      throw new AppError("Products array is required", 400);
    }
    
    // Validate that each product has required fields
    for (const product of products) {
      if (!product.title || !product.description || !product.productType) {
        throw new AppError(
          "Each product must have title, description, and productType",
          400
        );
      }
    }
    
    // Add user ID to each product
    const productsWithUserId = products.map(product => ({
      ...product,
      createdBy: userId
    }));
    
    // Create bulk products
    const results = await createBulkProductsService(productsWithUserId);
    
    // Count success and failed creations
    const successfulCreations = results.filter(r => r.success).length;
    const failedCreations = results.filter(r => !r.success).length;
    
    res.status(201).json({
      success: true,
      message: `Bulk creation completed: ${successfulCreations} successful, ${failedCreations} failed`,
      data: {
        total: results.length,
        successful: successfulCreations,
        failed: failedCreations,
        results: results
      },
    });
  } catch (error) {
    console.error("Bulk product creation error:", error);
    next(error);
  }
};

const getReviewProductController = async (req, res, next) => {
  try {
    // Get products with syncStatus 'not_sync' with all details
    const products = await db.Product.findAll({
      where: {
        syncStatus: 'not_synced'
      },
      include: [
        {
          model: db.ProductOption,
          as: "options",
          include: [
            {
              model: db.ProductOptionValue,
              as: "values",
            },
          ],
        },
        {
          model: db.ProductVariant,
          as: "variants",
          include: [
            {
              model: db.ProductVariantOption,
              as: "variantOptions",
              include: [
                {
                  model: db.ProductOptionValue,
                  as: "optionValue",
                  include: [
                    {
                      model: db.ProductOption,
                      as: "option",
                    }
                  ],
                },
              ],
            },
          ],
        },
        {
          model: db.ProductImage,
          as: "images",
        },
      ],
    });
    
    res.status(200).json({
      success: true,
      data: {
        products,
        count: products.length
      },
    });
  } catch (error) {
    console.error("Get review products error:", error);
    next(error);
  }
};

const getReviewProductByIdController = async (req, res, next) => {
  try {
    const productId = req.params.id;
    
    // Get a single product with syncStatus 'not_sync' with all details
    const product = await db.Product.findOne({
      where: {
        id: productId,
        syncStatus: 'not_synced'
      },
      include: [
        {
          model: db.ProductOption,
          as: "options",
          include: [
            {
              model: db.ProductOptionValue,
              as: "values",
            },
          ],
        },
        {
          model: db.ProductVariant,
          as: "variants",
          include: [
            {
              model: db.ProductVariantOption,
              as: "variantOptions",
              include: [
                {
                  model: db.ProductOptionValue,
                  as: "optionValue",
                  include: [
                    {
                      model: db.ProductOption,
                      as: "option",
                    }
                  ],
                },
              ],
            },
          ],
        },
        {
          model: db.ProductImage,
          as: "images",
        },
      ],
    });
    
    if (!product) {
      throw new AppError("Product not found or not in review status", 404);
    }
    
    res.status(200).json({
      success: true,
      data: product,
    });
  } catch (error) {
    console.error("Get review product by ID error:", error);
    next(error);
  }
};

const getShopifyLocationsController = async (req, res, next) => {
  try {
    const { storeId } = req.query;
    
    // Validate storeId parameter
    if (!storeId) {
      throw new AppError("Store ID is required", 400);
    }
    
    // Get store credentials from database
    const store = await db.Store.findByPk(storeId);
    if (!store || !store.shopifyDomain || !store.shopifyAccessToken) {
      throw new AppError("Shopify credentials not found for the store", 400);
    }
    
    // Get locations using the existing service function
    const { getLocations } = require("../../services/Shopify/ShopifyGraphqlService.js");
    const locations = await getLocations(store.shopifyDomain, store.shopifyAccessToken);
    
    res.status(200).json({
      success: true,
      data: {
        locations,
        count: locations.length
      },
    });
  } catch (error) {
    console.error("Get Shopify locations error:", error);
    next(error);
  }
};

const updateReviewProductController = async (req, res, next) => {
  try {
    const productId = req.params.id;
    const updateData = { ...req.body };
    
    // Get the product to check its syncStatus
    const existingProduct = await db.Product.findByPk(productId, {
      include: [
        {
          model: db.ProductOption,
          as: "options",
          include: [
            {
              model: db.ProductOptionValue,
              as: "values",
            },
          ],
        },
        {
          model: db.ProductVariant,
          as: "variants",
          include: [
            {
              model: db.ProductVariantOption,
              as: "variantOptions",
              include: [
                {
                  model: db.ProductOptionValue,
                  as: "optionValue",
                  include: [
                    {
                      model: db.ProductOption,
                      as: "option",
                    }
                  ],
                },
              ],
            },
          ],
        },
        {
          model: db.ProductImage,
          as: "images",
        },
      ],
    });
    
    if (!existingProduct) {
      throw new AppError("Product not found", 404);
    }
    
    // Only allow updating products with syncStatus 'not_sync'
    if (existingProduct.syncStatus !== 'not_synced') {
      throw new AppError("Cannot update product that has already been synced", 400);
    }
    
    // Extract images from updateData if present and remove from updateData for product
    let imagesData = updateData.images;
    if (updateData.images) {
      delete updateData.images;
    }
    
    // If images data contains new URLs or base64 strings that are not yet in S3, process and upload them to S3
    if (imagesData && Array.isArray(imagesData)) {
      // Process images in the original order to maintain display order
      const processedImagesData = [];
      
      // Helper function to validate URLs
      const isValidUrl = (string) => {
        try {
          const url = new URL(string);
          return url.protocol === 'http:' || url.protocol === 'https:';
        } catch (err) {
          return false;
        }
      };
      
      for (const image of imagesData) {
        if (typeof image === 'string') {
          if (image.startsWith('data:image')) {
            // It's a base64 string, convert to S3 URL
            try {
              const s3Url = await convertBase64ToS3(image, `product_image_${Date.now()}`, 'products');
              processedImagesData.push({
                imageUrl: s3Url,
                altText: `Product Image ${processedImagesData.length + 1}`,
                displayOrder: processedImagesData.length,
                isPrimary: processedImagesData.length === 0
              });
            } catch (error) {
              logger.error('Error processing base64 image string:', error);
              throw new AppError(`Error processing base64 image string: ${error.message}`, 500);
            }
          } else {
            // If it's a string URL, check if it's a new URL that needs to be processed
            // Assuming any URL that doesn't contain our S3 bucket name is a new URL to process
            if (!image.includes(process.env.AWS_BUCKET_NAME || 's3.amazonaws.com')) {
              if (isValidUrl(image)) {
                try {
                  // Download the image from URL and upload to S3
                  const s3Url = await downloadImagesFromUrlsAndUploadToS3([image], 'products');
                  processedImagesData.push({
                    imageUrl: s3Url[0],
                    altText: `Product Image ${processedImagesData.length + 1}`,
                    displayOrder: processedImagesData.length,
                    isPrimary: processedImagesData.length === 0
                  });
                } catch (error) {
                  logger.error('Error processing image URL:', error);
                  throw new AppError(`Error processing image URL: ${error.message}`, 500);
                }
              } else {
                // Invalid URL format, throw an error
                logger.warn(`Invalid URL format: ${image}`);
                throw new AppError(`Invalid URL format: ${image}`, 400);
              }
            } else {
              // It's already an S3 URL, add as is
              processedImagesData.push({
                imageUrl: image,
                altText: `Product Image ${processedImagesData.length + 1}`,
                displayOrder: processedImagesData.length,
                isPrimary: processedImagesData.length === 0
              });
            }
          }
        } else if (typeof image === 'object' && image.imageUrl) {
          if (image.imageUrl.startsWith('data:image')) {
            // It's an object with a base64 imageUrl
            try {
              const s3Url = await convertBase64ToS3(image.imageUrl, `product_image_${Date.now()}`, 'products');
              processedImagesData.push({
                ...image,
                imageUrl: s3Url,
                altText: image.altText || `Product Image ${processedImagesData.length + 1}`,
                displayOrder: processedImagesData.length,
                isPrimary: processedImagesData.length === 0
              });
            } catch (error) {
              logger.error('Error processing base64 image string in object:', error);
              throw new AppError(`Error processing base64 image string in object: ${error.message}`, 500);
            }
          } else {
            // If it's an object with imageUrl, check if it's a new URL that needs to be processed
            if (!image.imageUrl.includes(process.env.AWS_BUCKET_NAME || 's3.amazonaws.com')) {
              if (isValidUrl(image.imageUrl)) {
                try {
                  // Download the image from URL and upload to S3
                  const s3Url = await downloadImagesFromUrlsAndUploadToS3([image.imageUrl], 'products');
                  processedImagesData.push({
                    ...image,
                    imageUrl: s3Url[0],
                    altText: image.altText || `Product Image ${processedImagesData.length + 1}`,
                    displayOrder: processedImagesData.length,
                    isPrimary: processedImagesData.length === 0
                  });
                } catch (error) {
                  logger.error('Error processing image URL in object:', error);
                  throw new AppError(`Error processing image URL in object: ${error.message}`, 500);
                }
              } else {
                // Invalid URL format, throw an error
                logger.warn(`Invalid URL format: ${image.imageUrl}`);
                throw new AppError(`Invalid URL format: ${image.imageUrl}`, 400);
              }
            } else {
              // It's already an S3 URL, add as is
              processedImagesData.push({
                ...image,
                altText: image.altText || `Product Image ${processedImagesData.length + 1}`,
                displayOrder: processedImagesData.length,
                isPrimary: processedImagesData.length === 0
              });
            }
          }
        }
      }
      
      imagesData = processedImagesData;
    }
    
    // Update the product
    await db.Product.update(updateData, {
      where: { id: productId }
    });
    
    // If images data is provided, update product images
    if (imagesData && Array.isArray(imagesData)) {
      // Delete existing product images
      await db.ProductImage.destroy({
        where: { productId: productId }
      });
      
      // Create new product images with proper display order
      const imagesToCreate = imagesData.map((image, index) => ({
        productId: productId,
        originalUrl: image.imageUrl,
        enhancedUrl: image.enhancedUrl || null,
        displayOrder: image.displayOrder !== undefined ? image.displayOrder : index,
        altText: image.altText || `Product Image ${index + 1}`,
        isPrimary: image.isPrimary || false,
        shopifyMediaId: image.shopifyMediaId || null,
        variantId: image.variantId || null,
        storeId: existingProduct.storeId, // Use the product's storeId
        createdAt: new Date(),
        updatedAt: new Date()
      }));
      
      await db.ProductImage.bulkCreate(imagesToCreate);
    }
    
    // Return updated product
    const updatedProduct = await db.Product.findByPk(productId, {
      include: [
        {
          model: db.ProductOption,
          as: "options",
          include: [
            {
              model: db.ProductOptionValue,
              as: "values",
            },
          ],
        },
        {
          model: db.ProductVariant,
          as: "variants",
          include: [
            {
              model: db.ProductVariantOption,
              as: "variantOptions",
              include: [
                {
                  model: db.ProductOptionValue,
                  as: "optionValue",
                  include: [
                    {
                      model: db.ProductOption,
                      as: "option",
                    }
                  ],
                },
              ],
            },
          ],
        },
        {
          model: db.ProductImage,
          as: "images",
        },
      ],
    });
    
    res.status(200).json({
      success: true,
      data: updatedProduct,
    });
  } catch (error) {
    console.error("Update review product error:", error);
    next(error);
  }
};

const getSyncedProductController = async (req, res, next) => {
  try {
    // Get products with syncStatus 'synced' with all details
    const products = await db.Product.findAll({
      where: {
        syncStatus: 'synced'
      },
      include: [
        {
          model: db.ProductOption,
          as: "options",
          include: [
            {
              model: db.ProductOptionValue,
              as: "values",
            },
          ],
        },
        {
          model: db.ProductVariant,
          as: "variants",
          include: [
            {
              model: db.ProductVariantOption,
              as: "variantOptions",
              include: [
                {
                  model: db.ProductOptionValue,
                  as: "optionValue",
                  include: [
                    {
                      model: db.ProductOption,
                      as: "option",
                    }
                  ],
                },
              ],
            },
          ],
        },
        {
          model: db.ProductImage,
          as: "images",
        },
      ],
    });
    
    res.status(200).json({
      success: true,
      data: {
        products,
        count: products.length
      },
    });
  } catch (error) {
    console.error("Get synced products error:", error);
    next(error);
  }
};

const getSyncedProductByIdController = async (req, res, next) => {
  try {
    const productId = req.params.id;
    
    // Get a single product with syncStatus 'synced' with all details
    const product = await db.Product.findOne({
      where: {
        id: productId,
        syncStatus: 'synced'
      },
      include: [
        {
          model: db.ProductOption,
          as: "options",
          include: [
            {
              model: db.ProductOptionValue,
              as: "values",
            },
          ],
        },
        {
          model: db.ProductVariant,
          as: "variants",
          include: [
            {
              model: db.ProductVariantOption,
              as: "variantOptions",
              include: [
                {
                  model: db.ProductOptionValue,
                  as: "optionValue",
                  include: [
                    {
                      model: db.ProductOption,
                      as: "option",
                    }
                  ],
                },
              ],
            },
          ],
        },
        {
          model: db.ProductImage,
          as: "images",
        },
      ],
    });
    
    if (!product) {
      throw new AppError("Product not found or not in synced status", 404);
    }
    
    res.status(200).json({
      success: true,
      data: product,
    });
  } catch (error) {
    console.error("Get synced product by ID error:", error);
    next(error);
  }
};

module.exports = {
  createProductController,
  createBulkProductsController,
  getProductController,
  getProductsController,
  getReviewProductController,
  getReviewProductByIdController,
  getShopifyLocationsController,
  updateReviewProductController,
  updateProductController,
  updateProductVariantImagesController,
  deleteProductController,
  syncProductToShopifyController,
  bulkSyncProductsToShopifyController,
  getSyncedProductController,
  getSyncedProductByIdController,
};
