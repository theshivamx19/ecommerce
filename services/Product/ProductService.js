const { v4: uuidv4 } = require("uuid");
const db = require("../../models/index.js");
const { createMultipleProductImages } = require("../Image/ImageService.js");
const {
  createShopifyProduct,
  createShopifyMedia,
  createShopifyProductMedia,
  attachMediaToVariants,
  waitForMediaReady,
  getProductMediaStatus,
  appendMediaToVariants,
  getProductDetails,
  updateProductOption,
  updateShopifyProduct,
  updateShopifyVariants,
  updateVariantImages,
  enableInventoryTracking,
  activateInventoryAtLocation,
  getLocations,
  setInventoryQuantities,
} = require("../Shopify/ShopifyGraphqlService.js");
const AppError = require("../../utils/AppError.js");
const logger = require("../../utils/logger.js");
const { getPagination, getPagingData } = require("../../utils/pagination.js");

const createProductService = async (productData, options = []) => {
  const transaction = await db.sequelize.transaction();

  try {
    // Add debugging to see what data we're receiving
    logger.debug('=== CREATE PRODUCT SERVICE CALLED (LOCAL ONLY) ===');
    // logger.debug('Product data received:', JSON.stringify(productData, null, 2));
    // logger.debug('Options received:', JSON.stringify(options, null, 2));

    // Prepare options with their values
    const optionsWithValues = options.map((option) => {
      // Handle both string arrays and object arrays for option values
      const processedValues = option.values.map(value => {
        if (typeof value === 'string') {
          // If value is a string, convert to object format
          return { value: value };
        } else {
          // If value is already an object, return as is
          return value;
        }
      });

      return {
        ...option,
        values: processedValues || [],
      };
    });

    // Use provided variants data if available, otherwise generate from options
    let variantsData = [];
    let skuTimestamp = Date.now().toString().slice(-6);

    if (productData.variants && productData.variants.length > 0) {
      // Use provided variants data
      variantsData = productData.variants.map((variant, index) => ({
        sku: variant.sku || `VAR-${skuTimestamp}-${String(index + 1).padStart(3, '0')}`,
        price: variant.price !== undefined ? variant.price : null,
        compareAtPrice: variant.compareAtPrice !== undefined ? variant.compareAtPrice : null,
        stockQuantity: variant.inventoryQuantity !== undefined ? variant.inventoryQuantity : 0,
        // FIX: Preserve BOTH optionValues AND options from the input
        optionValues: variant.optionValues || [],
        options: variant.options || [],  // ← ADD THIS LINE!
        // Add imageUrl if provided
        ...(variant.imageUrl && { imageUrl: variant.imageUrl })
      }));
    } else if (optionsWithValues.length > 0) {
      // Generate all combinations of option values BEFORE creating product
      const tempOptionValues = [];
      optionsWithValues.forEach((option, optionIndex) => {
        option.values.forEach((value) => {
          tempOptionValues.push({
            optionName: option.name,
            value: value.value,
            optionIndex,
          });
        });
      });

      // Group by option index
      const grouped = {};
      tempOptionValues.forEach((item) => {
        if (!grouped[item.optionIndex]) grouped[item.optionIndex] = [];
        grouped[item.optionIndex].push(item);
      });

      // Generate cartesian product for variants
      const combinations = cartesianProduct(Object.values(grouped));

      // Prepare variants data with actual values if provided in options
      variantsData = combinations.map((combo, index) => {
        // Generate SKU using the pattern: size-color-timestamp-index (or other option combinations)
        // Extract option names and values for SKU generation
        const optionParts = combo.map(item => item.value ? item.value.toUpperCase() : '');
        const sku = `${optionParts.join("-")}-${skuTimestamp}-${String(index + 1).padStart(3, '0')}`;

        // Default values
        let price = null;
        let compareAtPrice = null;
        let stockQuantity = 0;

        // Check if options contain variant-specific data
        // Look for matching variant in options.values
        optionsWithValues.forEach(option => {
          option.values.forEach(valueObj => {
            // Check if this option value matches one of our combination values
            if (combo.some(c => c.value === valueObj.value)) {
              // This option value is part of our combination
              if (valueObj.price !== undefined && valueObj.price !== "0" && valueObj.price !== null) {
                price = valueObj.price;
              }
              if (valueObj.compareAtPrice !== undefined && valueObj.compareAtPrice !== "0" && valueObj.compareAtPrice !== null) {
                compareAtPrice = valueObj.compareAtPrice;
              }
              if (valueObj.stockQuantity !== undefined && valueObj.stockQuantity !== 0) {
                stockQuantity = valueObj.stockQuantity;
              }
            }
          });
        });

        return {
          sku,
          price,
          compareAtPrice,
          stockQuantity,
          isDefault: index === 0,
          optionValues: combo.map((item) => ({
            optionName: item.optionName,
            value: item.value,
          })),
        };
      });
    } else {
      // Simple product with no variants
      variantsData = [{
        sku: productData.sku || `SIMPLE-${skuTimestamp}-001`,
        price: productData.price !== undefined ? productData.price : null,
        compareAtPrice: productData.compareAtPrice !== undefined ? productData.compareAtPrice : null,
        stockQuantity: productData.inventoryQuantity !== undefined ? productData.inventoryQuantity : 0,
        optionValues: [],
        // Add imageUrl if provided
        ...(productData.imageUrl && { imageUrl: productData.imageUrl })
      }];
    }

    // Collect all image URLs from both product-level and variant-level images
    const allImageUrls = [];

    // Add product-level images
    if (productData.images && productData.images.length > 0) {
      productData.images.forEach(img => {
        // Handle different possible formats for image URLs
        if (img && img.url) {
          if (!allImageUrls.includes(img.url)) {
            allImageUrls.push(img.url);
          }
        } else if (img && img.originalUrl) {
          if (!allImageUrls.includes(img.originalUrl)) {
            allImageUrls.push(img.originalUrl);
          }
        } else if (typeof img === 'string') {
          if (!allImageUrls.includes(img)) {
            allImageUrls.push(img);
          }
        }
      });
    }

    // Add variant-specific images
    if (variantsData && variantsData.length > 0) {
      variantsData.forEach(variant => {
        if (variant.imageUrl && !allImageUrls.includes(variant.imageUrl)) {
          allImageUrls.push(variant.imageUrl);
        }
      });
    }

    // STEP 1: Create product in local database with default sync status
    const product = await db.Product.create(
      {
        ...productData,
        shopifyProductId: null,
        shopifyHandle: null,
        shopifyStatus: null,
        shopifySyncStatus: 'not_synced',
        allImageUrls: allImageUrls,
        storeId: productData.storeId || null, // Set storeId from product data
        options: optionsWithValues,
      },
      {
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
        ],
        transaction,
      }
    );

    // STEP 2: Build option values mapping
    const optionValues = [];
    product.options.forEach((option) => {
      option.values.forEach((value) => {
        optionValues.push({
          optionId: option.id,
          valueId: value.id,
          value: value.value,
        });
      });
    });

    // Group by option
    const groupedOptions = {};
    optionValues.forEach((item) => {
      if (!groupedOptions[item.optionId]) groupedOptions[item.optionId] = [];
      groupedOptions[item.optionId].push(item);
    });

    // Generate cartesian product
    const finalCombinations = cartesianProduct(Object.values(groupedOptions));

    // STEP 3: Create variants with default Shopify IDs
    // Use the variantsData directly since we already have the SKUs from frontend
    const finalVariantsData = variantsData.map((variantData, index) => ({
      productId: product.id,
      sku: variantData.sku,
      price: variantData.price,
      compareAtPrice: variantData.compareAtPrice,
      stockQuantity: variantData.stockQuantity,
      isDefault: index === 0,
      image_url: variantData.imageUrl || null, // Store variant-specific image URL (using the correct column name)
      shopifyVariantId: null, // Default to null
      inventoryItemId: null, // Default to null
      storeId: productData.storeId || null, // Set storeId from product data
    }));

    const createdVariants = await db.ProductVariant.bulkCreate(finalVariantsData, { transaction });

    // STEP 4: Create variant options (only for products with options)
    if (optionsWithValues.length > 0) {
      const variantOptionsData = [];

      // Create a map of option names to option IDs
      const optionNameToIdMap = {};
      product.options.forEach(option => {
        optionNameToIdMap[option.name] = option.id;
      });

      // Create a map of option values to value IDs
      const optionValueMap = {};
      product.options.forEach(option => {
        option.values.forEach(value => {
          optionValueMap[`${option.name}:${value.value}`] = value.id;
        });
      });

      // For each variant, create the variant options
      for (let i = 0; i < createdVariants.length; i++) {
        const variant = createdVariants[i];
        const variantData = variantsData[i];

        // Only create variant options if we have option values
        if (variantData.optionValues && variantData.optionValues.length > 0) {
          variantData.optionValues.forEach(optionValue => {
            const optionValueId = optionValueMap[`${optionValue.optionName}:${optionValue.value}`];
            if (optionValueId) {
              variantOptionsData.push({
                variantId: variant.id,
                optionValueId: optionValueId,
              });
            }
          });
        }
      }

      if (variantOptionsData.length > 0) {
        await db.ProductVariantOption.bulkCreate(variantOptionsData, { transaction });
      }
    }

    // STEP 5: Create variant options
    const variantOptionsData = [];
    createdVariants.forEach((variant, index) => {
      const combo = finalCombinations[index];
      combo.forEach((item) => {
        variantOptionsData.push({
          variantId: variant.id,
          optionValueId: item.valueId,
        });
      });
    });

    await db.ProductVariantOption.bulkCreate(variantOptionsData, { transaction });

    // STEP 6: Consolidated image saving to avoid duplicates
    const imagesToSave = [];
    
    // Add product-level images
    if (productData.images && productData.images.length > 0) {
      const productImages = productData.images.map(image => ({
        productId: product.id,
        storeId: productData.storeId || null, // Use storeId from productData
        originalUrl: image.imageUrl || image.originalUrl || image,
        enhancedUrl: image.enhancedUrl,
        displayOrder: image.displayOrder,
        altText: image.altText,
        isPrimary: image.isPrimary,
        shopifyMediaId: image.shopifyMediaId,
        variantId: null, // Product-level image
      }));
      imagesToSave.push(...productImages);
    }
    
    // Add variant-specific images
    if (variantsData && variantsData.length > 0) {
      for (let i = 0; i < variantsData.length; i++) {
        const variantData = variantsData[i];
        const variant = createdVariants[i];
        
        if (variantData.imageUrl) {
          // Check if this image URL already exists in the product images to avoid duplicates
          const existingImageIndex = imagesToSave.findIndex(img => img.originalUrl === variantData.imageUrl);
          
          if (existingImageIndex === -1) {
            // Image doesn't exist, add it as a new image with variantId
            imagesToSave.push({
              productId: product.id,
              storeId: productData.storeId || null,
              originalUrl: variantData.imageUrl,
              enhancedUrl: null, // Variant images don't typically have enhanced versions
              displayOrder: i, // Use index as display order
              altText: `Variant image for ${variantData.sku}`,
              isPrimary: i === 0, // First variant image as primary
              shopifyMediaId: null, // Will be updated later
              variantId: variant.id, // Link to the specific variant
            });
          } else {
            // Image already exists, update it to also link to the variant
            imagesToSave[existingImageIndex].variantId = variant.id;
          }
        }
      }
    }
    
    // Save all unique images
    if (imagesToSave.length > 0) {
      await createMultipleProductImages(imagesToSave, transaction);
    }

    // STEP 7: Update allImageUrls field with all unique image URLs from both product images and variants
    const allUniqueImageUrls = new Set();

    // Add images from ProductImage table
    const productImages = await db.ProductImage.findAll({
      where: { productId: product.id },
      attributes: ['originalUrl', 'enhancedUrl'],
      transaction
    });


    productImages.forEach(image => {
      const imageUrl = image.originalUrl || image.enhancedUrl;
      if (imageUrl) {
        allUniqueImageUrls.add(imageUrl);
      }
    });

    // Add variant-specific images
    if (variantsData && variantsData.length > 0) {
      variantsData.forEach(variant => {
        if (variant.imageUrl) {
          allUniqueImageUrls.add(variant.imageUrl);
        }
      });
    }

    // Update the product's allImageUrls field
    await db.Product.update(
      { allImageUrls: Array.from(allUniqueImageUrls) },
      { where: { id: product.id }, transaction }
    );

    // STEP 8: Skip inventory updates (now handled separately in sync service)
    // No Shopify inventory updates in local creation

    // Commit transaction
    await transaction.commit();

    // Return product with all data
    return await getProductWithDetails(product.id);
  } catch (error) {
    // Rollback transaction on any error
    await transaction.rollback();
    logger.error('Product creation failed:', error);
    throw error;
  }
};

const createBulkProductsService = async (productsData) => {
  const results = [];

  logger.info(`Starting bulk creation for ${productsData.length} products`);

  // Process products in parallel
  const promises = productsData.map(async (productData) => {
    try {
      // Extract options from product data
      const options = productData.options || [];

      // Auto-generate unique reference code
      const uniqueReferenceCode = uuidv4();

      // Create a new product object without the options to pass to the single product service
      const productDataWithoutOptions = {
        ...productData,
        uniqueReferenceCode  // Add the unique reference code
      };
      delete productDataWithoutOptions.options;

      // Call the existing single product creation service
      const result = await createProductService(productDataWithoutOptions, options);

      return {
        success: true,
        data: result,
        error: null
      };
    } catch (error) {
      logger.error('Bulk product creation error for individual product:', error);
      return {
        success: false,
        data: null,
        error: error.message
      };
    }
  });

  // Wait for all promises to complete
  const bulkResults = await Promise.allSettled(promises);

  // Process results
  for (let i = 0; i < bulkResults.length; i++) {
    const result = bulkResults[i];
    if (result.status === 'fulfilled') {
      results.push(result.value);
    } else {
      results.push({
        success: false,
        data: null,
        error: result.reason.message || 'Unknown error'
      });
    }
  }

  logger.info(`Bulk product creation completed. Success: ${results.filter(r => r.success).length}/${results.length}`);

  return results;
};

// Helper function for cartesian product
function cartesianProduct(arrays) {
  return arrays.reduce(
    (acc, curr) => {
      const result = [];
      acc.forEach((a) => {
        curr.forEach((b) => {
          result.push(a.concat(b));
        });
      });
      return result;
    },
    [[]]
  );
}

const getProductById = async (productId) => {
  return await db.Product.findByPk(productId);
};

const getProductWithDetails = async (productId) => {
  return await db.Product.findByPk(productId, {
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
};

const getProductByTitle = async (title) => {
  return await db.Product.findOne({ where: { title } });
};

const getProductByCategory = async (category) => {
  return await db.Product.findAll({ where: { category } });
};

const getAllProducts = async (query = {}) => {
  const { page, limit, includeDetails = false } = query;
  const { limit: size, offset } = getPagination(page, limit);

  const include = includeDetails
    ? [
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
              },
            ],
          },
        ],
      },
      {
        model: db.ProductImage,
        as: "images",
      },
    ]
    : [];

  // OPTIMIZATION: If no pagination is needed, use findAll (faster)
  if (!size) {
    return await db.Product.findAll({ include });
  }

  // Otherwise, use findAndCountAll for pagination
  const data = await db.Product.findAndCountAll({
    limit: size,
    offset,
    include,
  });
  return getPagingData(data, page, size);
};

const updateProduct = async (productId, productData, shopifyConfig = null) => {
  const transaction = await db.sequelize.transaction();

  try {
    // Get existing product to check if it has Shopify ID
    const existingProduct = await db.Product.findByPk(productId);
    if (!existingProduct) {
      throw new AppError('Product not found', 404);
    }

    // STEP 1: Update on Shopify if product was synced and config provided
    if (existingProduct.shopifyProductId && shopifyConfig?.shopDomain && shopifyConfig?.accessToken) {
      logger.info(`Updating product on Shopify: ${existingProduct.shopifyProductId}`);

      const shopifyInput = {
        title: productData.title || existingProduct.title,
        descriptionHtml: productData.description || existingProduct.description,
        productType: productData.productType || existingProduct.productType,
        vendor: productData.vendor || existingProduct.vendor,
        status: productData.status === 'published' ? 'ACTIVE' : 'DRAFT',
      };

      const shopifyResult = await updateShopifyProduct(
        shopifyConfig.shopDomain,
        shopifyConfig.accessToken,
        existingProduct.shopifyProductId,
        shopifyInput
      );

      // Update Shopify status in productData
      productData.shopifyStatus = shopifyResult.status;
      productData.shopifyHandle = shopifyResult.handle;

      logger.info(`Shopify product updated: ${shopifyResult.shopifyProductId}`);
    }

    // STEP 1.5: Update product options if provided and changed
    if (productData.options && Array.isArray(productData.options) && shopifyConfig?.shopDomain && shopifyConfig?.accessToken && existingProduct.shopifyProductId) {
      logger.info(`Checking for product option updates: ${productData.options.length} options provided`);

      // Fetch existing product options from database
      const existingProductOptions = await db.ProductOption.findAll({
        where: { productId },
        order: [['position', 'ASC']],
        transaction
      });

      logger.info(`Found ${existingProductOptions.length} existing product options in DB`);

      // Create a map of existing option values for comparison
      const existingOptionValuesMap = new Map();
      for (const option of existingProductOptions) {
        const optionValues = await db.ProductOptionValue.findAll({
          where: { optionId: option.id },
          transaction
        });
        existingOptionValuesMap.set(option.id, optionValues);
      }

      // Fetch Shopify product details to get Shopify option IDs
      const shopifyProductResult = await getProductDetails(
        shopifyConfig.shopDomain,
        shopifyConfig.accessToken,
        existingProduct.shopifyProductId
      );

      if (shopifyProductResult.success && shopifyProductResult.product) {
        const shopifyOptions = shopifyProductResult.product.options || [];
        logger.info(`Found ${shopifyOptions.length} existing product options in Shopify`);

        // Compare options and update if names or values have changed
        for (let i = 0; i < productData.options.length && i < existingProductOptions.length && i < shopifyOptions.length; i++) {
          const newOption = productData.options[i];
          const existingOption = existingProductOptions[i];
          const shopifyOption = shopifyOptions[i]; // Assuming they're in the same order

          // Always update the Shopify option ID in the database to maintain the mapping
          await db.ProductOption.update(
            { shopifyOptionId: shopifyOption.id },
            { where: { id: existingOption.id }, transaction }
          );

          // Check if option values have changed
          const existingOptionValues = existingOptionValuesMap.get(existingOption.id) || [];
          const existingValueNames = existingOptionValues.map(v => v.value).sort();
          const newValueNames = newOption.values ? newOption.values.sort() : [];
          const valuesChanged = JSON.stringify(existingValueNames) !== JSON.stringify(newValueNames);

          if (newOption.name !== existingOption.name || valuesChanged) {
            logger.info(`Option changed - Name: '${existingOption.name}' -> '${newOption.name}', Values changed: ${valuesChanged}`);

            try {
              // Update the product option in Shopify
              const updateResult = await updateProductOption(
                shopifyConfig.shopDomain,
                shopifyConfig.accessToken,
                existingProduct.shopifyProductId,
                shopifyOption.id, // Use the Shopify option ID
                newOption.name,  // New option name
                shopifyOption.position // Keep the same position
              );

              if (updateResult.success) {
                logger.info(`Successfully updated option from '${existingOption.name}' to '${newOption.name}'`);

                // Update the option name in the local database
                await db.ProductOption.update(
                  { name: newOption.name },
                  { where: { id: existingOption.id }, transaction }
                );

                logger.info(`Updated local option ${existingOption.id} name to: ${newOption.name}`);

                // If option values have changed, update the local option values in the database
                if (valuesChanged) {
                  logger.info(`Option values changed from [${existingValueNames.join(', ')}] to [${newValueNames.join(', ')}], updating local database`);

                  // Delete existing option values for this option
                  await db.ProductOptionValue.destroy({
                    where: { optionId: existingOption.id },
                    transaction
                  });

                  // Create new option values based on the new values
                  for (let k = 0; k < newValueNames.length; k++) {
                    const valueName = newValueNames[k];

                    await db.ProductOptionValue.create({
                      optionId: existingOption.id,
                      value: valueName,
                      position: k
                    }, { transaction });

                    logger.info(`Created new option value: ${valueName} for option ${existingOption.id}`);
                  }
                }
              }
            } catch (optionError) {
              logger.error(`Failed to update product option ${existingOption.name}:`, optionError);
              // Don't fail the whole operation for option update errors
            }
          } else {
            // Even if nothing changed, make sure the local database is consistent
            logger.debug(`Option unchanged: '${existingOption.name}', ensuring Shopify option ID is saved`);
          }

          // Update the option values with their Shopify IDs
          if (shopifyOption.optionValues && shopifyOption.optionValues.length > 0) {
            // Get the local option values for this option
            const localOptionValues = await db.ProductOptionValue.findAll({
              where: { optionId: existingOption.id },
              transaction
            });

            // Match option values by name and update their Shopify IDs
            for (let j = 0; j < shopifyOption.optionValues.length && j < localOptionValues.length; j++) {
              const shopifyOptionValue = shopifyOption.optionValues[j];
              const localOptionValue = localOptionValues[j];

              await db.ProductOptionValue.update(
                { shopifyOptionValueId: shopifyOptionValue.id },
                { where: { id: localOptionValue.id }, transaction }
              );

              logger.info(`Updated local option value ${localOptionValue.id} with Shopify option value ID: ${shopifyOptionValue.id}`);
            }
          }
        }
      } else {
        logger.warn('Could not fetch Shopify product details for option mapping');
      }
    }

    // STEP 2: Update variants if provided
    if (productData.variants && productData.variants.length > 0) {
      logger.info(`Updating ${productData.variants.length} variants`);
      logger.debug(`Incoming variant data: ${JSON.stringify(productData.variants.map(v => ({ id: v.id, sku: v.sku, price: v.price, imageUrl: v.imageUrl })), null, 2)}`);

      // Get existing variants with Shopify IDs
      const existingVariants = await db.ProductVariant.findAll({
        where: { productId },
        transaction
      });

      logger.debug(`Existing variants in DB: ${JSON.stringify(existingVariants.map(v => ({ id: v.id, sku: v.sku, shopifyVariantId: v.shopifyVariantId })), null, 2)}`);

      // Fetch product options to map option values correctly
      const productOptions = await db.ProductOption.findAll({
        where: { productId },
        order: [['position', 'ASC']],
        transaction
      });

      logger.debug(`Product options: ${JSON.stringify(productOptions.map(opt => ({ id: opt.id, name: opt.name, position: opt.position })))}`);

      // Fetch current Shopify product options to validate option values
      let shopifyProductOptions = [];
      if (shopifyConfig?.shopDomain && shopifyConfig?.accessToken && existingProduct.shopifyProductId) {
        try {
          const shopifyProductResult = await getProductDetails(
            shopifyConfig.shopDomain,
            shopifyConfig.accessToken,
            existingProduct.shopifyProductId
          );

          if (shopifyProductResult.success && shopifyProductResult.product) {
            shopifyProductOptions = shopifyProductResult.product.options || [];
            logger.info(`Fetched ${shopifyProductOptions.length} current Shopify product options for validation`);
          }
        } catch (error) {
          logger.warn(`Failed to fetch current Shopify product options: ${error.message}`);
          // Continue with database options if we can't fetch from Shopify
        }
      }

      // Map variants using local ID to get Shopify IDs
      // First, collect all variant IDs that need existing option values
      const variantsToProcess = productData.variants.map(variant => {
        logger.debug(`Looking for existing variant with ID: ${variant.id}, SKU: ${variant.sku}`);

        // Find existing variant by local ID first
        let existing = existingVariants.find(v => v.id === variant.id);

        // If not found by ID, try to match by SKU as fallback
        if (!existing && variant.sku) {
          existing = existingVariants.find(v => v.sku === variant.sku);
          if (existing) {
            logger.info(`Matched variant by SKU: ${variant.sku} -> DB ID: ${existing.id}`);
          }
        }

        if (!existing) {
          logger.warn(`Variant not found - ID: ${variant.id}, SKU: ${variant.sku}, skipping`);
          return null;
        }

        return { variant, existing };
      }).filter(v => v !== null);

      // Get all existing variant options for variants that don't have incoming options
      const variantsWithoutOptions = variantsToProcess.filter(item => !item.variant.options || !Array.isArray(item.variant.options) || item.variant.options.length === 0);
      const variantIdsWithoutOptions = variantsWithoutOptions.map(item => item.existing.id);

      let variantOptionsMap = new Map();
      if (variantIdsWithoutOptions.length > 0) {
        const allExistingVariantOptions = await db.ProductVariantOption.findAll({
          where: { variantId: variantIdsWithoutOptions },
          include: [{
            model: db.ProductOptionValue,
            as: 'optionValue',
            include: [{
              model: db.ProductOption,
              as: 'option',
              attributes: ['name', 'position']
            }]
          }],
          transaction
        });

        // Group by variantId
        allExistingVariantOptions.forEach(optionAssoc => {
          const variantId = optionAssoc.variantId;
          if (!variantOptionsMap.has(variantId)) {
            variantOptionsMap.set(variantId, []);
          }
          variantOptionsMap.get(variantId).push(optionAssoc);
        });
      }

      // Now map the variants with their option values
      const variantsToUpdate = await Promise.all(variantsToProcess.map(async (item) => {
        const { variant, existing } = item;

        // Map options to proper format with option names
        let optionValues = [];

        // Check if incoming variant has options field, it's an array, and has elements
        const hasIncomingOptions = variant.options && Array.isArray(variant.options) && variant.options.length > 0;

        if (hasIncomingOptions) {
          // Map option values using Shopify IDs from database
          optionValues = [];

          for (let i = 0; i < variant.options.length; i++) {
            const value = variant.options[i];
            const option = productOptions[i];

            if (!option) continue;

            // Find the option value in database to get Shopify ID
            const optionValue = await db.ProductOptionValue.findOne({
              where: {
                optionId: option.id,
                value: value
              },
              transaction
            });

            if (optionValue?.shopifyOptionValueId && option.shopifyOptionId) {
              // Use hybrid format (Shopify requires BOTH id and optionName)
              optionValues.push({
                id: optionValue.shopifyOptionValueId,      // The option value ID
                name: optionValue.value,                    // The actual option value name (e.g., "Small", "Black")
                optionName: option.name                     // The option name for reference
              });
            } else {
              // Fallback to name-based format
              optionValues.push({
                name: value,
                optionName: option.name
              });
            }
          }

          logger.debug(`Mapped optionValues for variant from incoming data: ${JSON.stringify(optionValues)}`);
        } else {
          // If no options provided in the update, get the existing option values from the map
          // This preserves the current option structure for the variant
          const existingVariantOptions = variantOptionsMap.get(existing.id) || [];

          if (existingVariantOptions && existingVariantOptions.length > 0) {
            // Sort by option position to ensure correct order
            const sortedOptions = existingVariantOptions.sort((a, b) => {
              const posA = a.optionValue?.option?.position || 0;
              const posB = b.optionValue?.option?.position || 0;
              return posA - posB;
            });

            // Map existing option values using the current product option names
            // This ensures that the option values are mapped to the updated option names
            optionValues = sortedOptions.map(optionAssoc => {
              const optionValue = optionAssoc.optionValue;
              if (optionValue?.shopifyOptionValueId && optionValue?.option?.shopifyOptionId) {
                // Use hybrid format (Shopify requires BOTH id and optionName)
                return {
                  id: optionValue.shopifyOptionValueId,      // Shopify option value ID
                  name: optionValue.value,                    // The actual option value name (e.g., "Small", "Black")
                  optionName: optionValue.option.name          // The option name for reference
                };
              } else {
                // Fallback to name-based format
                return {
                  name: optionValue?.value,      // The actual option value like "Small"
                  optionName: optionValue?.option?.name // The current option name like "NLeanth" (updated)
                };
              }
            }).filter(opt => (opt.name && opt.optionName) || (opt.id && opt.optionId)); // Filter out any undefined values

            logger.debug(`Mapped optionValues for variant from existing data: ${JSON.stringify(optionValues)}`);
          } else {
            logger.debug(`No existing option values found for variant ${existing.id}, using empty array`);
          }
        }

        // Validate option values against current Shopify options to prevent 'Option does not exist' errors
        if (shopifyProductOptions.length > 0 && optionValues.length > 0) {
          const validatedOptionValues = [];

          for (let i = 0; i < optionValues.length; i++) {
            const optValue = optionValues[i];

            // Check if this is hybrid format (id + optionName) or name-based format
            if (optValue.id && optValue.optionName) {
              // This is hybrid format, validate the values exist in Shopify
              const shopifyOption = shopifyProductOptions.find(so => so.name === optValue.optionName);

              if (shopifyOption) {
                const shopifyOptionValue = shopifyOption.optionValues?.find(sov => sov.id === optValue.id);

                if (shopifyOptionValue) {
                  // Values are valid, keep the hybrid format
                  validatedOptionValues.push(optValue);
                } else {
                  logger.warn(`Shopify option value ID '${optValue.id}' not found for option '${optValue.optionName}', falling back to name-based format`);
                  // Fallback to name-based format
                  const nameBasedOpt = {
                    name: optValue.name || 'Unknown',
                    optionName: optValue.optionName
                  };
                  validatedOptionValues.push(nameBasedOpt);
                }
              } else {
                logger.warn(`Shopify option '${optValue.optionName}' not found, falling back to name-based format`);
                // Fallback to name-based format
                const nameBasedOpt = {
                  name: optValue.name,
                  optionName: optValue.optionName
                };
                validatedOptionValues.push(nameBasedOpt);
              }
            } else {
              // This is name-based format, validate names exist in Shopify
              const shopifyOption = shopifyProductOptions.find(so => so.name === optValue.optionName);

              if (shopifyOption) {
                // Find matching option value in Shopify option
                const shopifyOptionValue = shopifyOption.optionValues?.find(sov => sov.name === optValue.name);

                if (shopifyOptionValue) {
                  // Use the name-based format with current Shopify option names (more compatible)
                  validatedOptionValues.push({
                    name: shopifyOptionValue.name,      // The option value name like "Small"
                    optionName: shopifyOption.name    // The option name like "NewLeanth"
                  });
                } else {
                  logger.warn(`Shopify option value '${optValue.name}' not found for option '${optValue.optionName}', using name-based format`);
                  validatedOptionValues.push(optValue); // Fallback to name-based format
                }
              } else {
                logger.warn(`Shopify option '${optValue.optionName}' not found, using name-based format`);
                validatedOptionValues.push(optValue); // Fallback to name-based format
              }
            }
          }

          optionValues = validatedOptionValues;
        }

        // Only include optionValues if they are explicitly provided in the update
        // Otherwise, omit optionValues to avoid 'Option does not exist' errors
        // when only updating price, inventory, or images
        const variantData = {
          id: existing.id, // Local DB id
          sku: variant.sku || existing.sku,
          price: variant.price !== undefined ? variant.price : existing.price,
          compareAtPrice: variant.compareAtPrice !== undefined ? variant.compareAtPrice : existing.compareAtPrice,
          stockQuantity: variant.stockQuantity !== undefined ? variant.stockQuantity : existing.stockQuantity,
          shopifyVariantId: existing.shopifyVariantId, // Shopify global ID
          inventoryItemId: existing.inventoryItemId, // Shopify inventory item ID
          // Include mediaIds if provided for image updates
          mediaIds: variant.mediaIds || [],
          // Store the imageUrl for image processing
          imageUrl: variant.imageUrl || existing.image_url,
        };

        // Only include optionValues if they were explicitly provided in the incoming variant data
        // This prevents 'Option does not exist' errors when only updating other fields
        if (hasIncomingOptions && optionValues && optionValues.length > 0) {
          variantData.optionValues = optionValues;
        }

        return variantData;
      }));

      // Filter out any null values after resolving all promises
      const filteredVariantsToUpdate = variantsToUpdate.filter(v => v !== null);

      logger.info(`Mapped ${filteredVariantsToUpdate.length} variants for update`);

      // STEP 2.1: Update variants on Shopify (prices only)
      if (shopifyConfig?.shopDomain && shopifyConfig?.accessToken) {
        const shopifyVariantResults = await updateShopifyVariants(
          shopifyConfig.shopDomain,
          shopifyConfig.accessToken,
          existingProduct.shopifyProductId, // Pass Shopify product ID
          filteredVariantsToUpdate
        );
        logger.info(`Updated ${shopifyVariantResults.length} variants on Shopify`);

        // STEP 2.1.5: Update local ProductVariantOption associations if options were provided in the update
        for (const variantUpdate of productData.variants) {
          if (variantUpdate.options && Array.isArray(variantUpdate.options) && variantUpdate.options.length > 0) {
            // Find the existing variant in the database
            const existingVariant = existingVariants.find(v => v.id === variantUpdate.id);
            if (existingVariant) {
              // Remove existing variant options
              await db.ProductVariantOption.destroy({
                where: { variantId: existingVariant.id },
                transaction
              });

              // Create new variant options based on the update
              for (let i = 0; i < variantUpdate.options.length; i++) {
                const optionValue = variantUpdate.options[i];
                const correspondingOption = productOptions[i]; // Match by position

                if (correspondingOption) {
                  // Find the option value in the database
                  const optionValueRecord = await db.ProductOptionValue.findOne({
                    where: {
                      optionId: correspondingOption.id,
                      value: optionValue
                    },
                    transaction
                  });

                  if (optionValueRecord) {
                    await db.ProductVariantOption.create({
                      variantId: existingVariant.id,
                      optionValueId: optionValueRecord.id
                    }, { transaction });

                    logger.info(`Updated variant option association: variant ${existingVariant.id}, option value ${optionValueRecord.id}`);
                  }
                }
              }
            }
          }
        }

        // STEP 2.1.6: Handle all variant image updates in a batch operation
        // Collect all variant images that need to be processed
        const variantImagesToProcess = [];
        for (const variantUpdate of productData.variants) {
          if (variantUpdate.imageUrl && shopifyConfig?.shopDomain && shopifyConfig?.accessToken) {
            const existingVariant = existingVariants.find(v => v.id === variantUpdate.id);
            if (existingVariant && existingVariant.shopifyVariantId) {
              variantImagesToProcess.push({
                variantUpdate,
                existingVariant
              });
            }
          }
        }

        if (variantImagesToProcess.length > 0) {
          logger.info(`Processing ${variantImagesToProcess.length} variant images`);

          // Create all media in parallel
          const mediaPromises = variantImagesToProcess.map(async (item) => {
            try {
              const { variantUpdate, existingVariant } = item;

              const productMediaResult = await createShopifyProductMedia(
                shopifyConfig.shopDomain,
                shopifyConfig.accessToken,
                existingProduct.shopifyProductId,
                variantUpdate.imageUrl,
                { alt: `Variant image for ${existingVariant.sku}` }
              );

              return {
                success: productMediaResult.success,
                mediaIds: productMediaResult.mediaIds,
                variantId: existingVariant.id,
                shopifyVariantId: existingVariant.shopifyVariantId,
                imageUrl: variantUpdate.imageUrl
              };
            } catch (error) {
              logger.error(`Failed to create media for variant ${item.existingVariant.id}:`, error);
              return {
                success: false,
                variantId: item.existingVariant.id,
                error: error
              };
            }
          });

          const mediaResults = await Promise.all(mediaPromises);

          // Collect all media IDs that were successfully created
          const allMediaIds = [];
          const mediaToVariantMap = {};

          mediaResults.forEach((result, index) => {
            if (result.success && result.mediaIds && result.mediaIds.length > 0) {
              const mediaId = result.mediaIds[0];
              allMediaIds.push(mediaId);

              // Map media ID to variant info, including the source URL for debugging
              mediaToVariantMap[mediaId] = {
                variantId: result.variantId,
                shopifyVariantId: result.shopifyVariantId,
                imageUrl: result.imageUrl
              };

              // Log the mapping for debugging
              logger.debug(`Mapped media ID ${mediaId} to variant ${result.variantId} with URL ${result.imageUrl}`);
            } else if (!result.success) {
              logger.warn(`Failed to create media for variant ${result.variantId} with URL ${result.imageUrl || 'unknown'}`);
            }
          });

          // Wait for all media to be ready
          if (allMediaIds.length > 0) {
            logger.info(`Waiting for ${allMediaIds.length} media items to be ready`);
            const mediaWaitResult = await waitForMediaReady(
              shopifyConfig.shopDomain,
              shopifyConfig.accessToken,
              existingProduct.shopifyProductId,
              allMediaIds
            );

            logger.info(`Media processing complete. Ready: ${mediaWaitResult.readyMediaIds.length}, Failed: ${mediaWaitResult.failedMediaIds.length}`);

            // Group ready media by variant for bulk update
            const variantsForBulkUpdate = [];
            mediaWaitResult.readyMediaIds.forEach(mediaId => {
              const variantInfo = mediaToVariantMap[mediaId];
              if (variantInfo) {
                variantsForBulkUpdate.push({
                  id: variantInfo.shopifyVariantId,
                  mediaId: mediaId
                });

                logger.debug(`Ready media ${mediaId} for variant ${variantInfo.variantId} (URL: ${variantInfo.imageUrl})`);
              }
            });

            // Log failed media with URLs for debugging
            mediaWaitResult.failedMediaIds.forEach(mediaId => {
              const variantInfo = mediaToVariantMap[mediaId];
              if (variantInfo) {
                logger.error(`Failed media ${mediaId} for variant ${variantInfo.variantId} (URL: ${variantInfo.imageUrl})`);
              } else {
                logger.error(`Failed media ${mediaId} - no variant mapping found`);
              }
            });

            // Perform bulk update if there are variants with ready media
            if (variantsForBulkUpdate.length > 0) {
              try {
                const bulkAttachResult = await attachMediaToVariants(
                  shopifyConfig.shopDomain,
                  shopifyConfig.accessToken,
                  existingProduct.shopifyProductId,
                  variantsForBulkUpdate,
                  true // Enable deletion of old media
                );

                if (bulkAttachResult.success) {
                  logger.info(`Successfully attached images to ${variantsForBulkUpdate.length} variants on Shopify`);



                  // Update the shopifyMediaId in the ProductVariant table for successful variants
                  for (const variantUpdate of variantsForBulkUpdate) {
                    const variantInfo = Object.values(mediaToVariantMap).find(v => v.shopifyVariantId === variantUpdate.id);
                    if (variantInfo) {
                      try {
                        await db.ProductVariant.update(
                          { shopifyMediaId: variantUpdate.mediaId },
                          {
                            where: { id: variantInfo.variantId },
                            transaction
                          }
                        );

                        logger.info(`Updated shopifyMediaId for variant ${variantInfo.variantId}: ${variantUpdate.mediaId}`);
                      } catch (dbError) {
                        logger.error(`Failed to update shopifyMediaId for variant ${variantInfo.variantId}:`, dbError);
                      }
                    }
                  }

                  // For variants with failed media, we should clear or nullify the shopifyMediaId
                  // to indicate that the image update failed
                  mediaWaitResult.failedMediaIds.forEach(failedMediaId => {
                    const variantInfo = Object.values(mediaToVariantMap).find(v => {
                      // Find the variant that was supposed to get this failed media
                      return v.imageUrl && mediaToVariantMap[failedMediaId]?.imageUrl === v.imageUrl;
                    });

                    if (variantInfo) {
                      logger.warn(`Clearing shopifyMediaId for variant ${variantInfo.variantId} due to failed image processing`);

                      // Optionally clear the shopifyMediaId to indicate failure
                      // Only do this if you want to explicitly mark it as failed
                      // await db.ProductVariant.update(
                      //   { shopifyMediaId: null },
                      //   {
                      //     where: { id: variantInfo.variantId },
                      //     transaction
                      //   }
                      // );
                    }
                  });
                } else {
                  logger.error(`Failed to bulk attach images to variants:`, bulkAttachResult.message);
                }
              } catch (bulkError) {
                logger.error('Failed to bulk attach images to variants:', bulkError);
              }
            }

            // Log failed media
            if (mediaWaitResult.failedMediaIds.length > 0) {
              logger.error(`Failed media IDs: ${mediaWaitResult.failedMediaIds.join(', ')}`);
            }
          }
        }

        // STEP 2.2: Handle inventory updates if stockQuantity is provided
        const variantsWithInventory = variantsToUpdate.filter(v =>
          v.stockQuantity !== undefined &&
          v.stockQuantity !== null &&
          v.inventoryItemId
        );

        if (variantsWithInventory.length > 0) {
          try {
            // Determine which locations to use - specific location if provided, otherwise all active locations
            let locationsToUse = [];
            const locationIdToUse = shopifyConfig?.locationId;

            logger.info(`Checking for location ID in update. shopifyConfig.locationId: ${shopifyConfig?.locationId}, final locationIdToUse: ${locationIdToUse}`);

            if (locationIdToUse) {
              // Use specific location if provided
              const allLocations = await getLocations(shopifyConfig.shopDomain, shopifyConfig.accessToken);
              logger.info(`All available locations for update: ${JSON.stringify(allLocations.map(loc => ({ id: loc.id, name: loc.name })))}`);
              logger.info(`Looking for location ID for update: ${locationIdToUse}`);
              const specificLocation = allLocations.find(loc => loc.id === locationIdToUse);
              if (specificLocation) {
                locationsToUse = [specificLocation];
                logger.info(`Using specific location for update: ${specificLocation.name} (${specificLocation.id})`);
              } else {
                logger.warn(`Specified location ID ${locationIdToUse} not found for update, using all active locations`);
                locationsToUse = await getLocations(shopifyConfig.shopDomain, shopifyConfig.accessToken);
              }
            } else {
              // Use all active locations
              logger.info(`No location ID provided for update, using all active locations`);
              locationsToUse = await getLocations(shopifyConfig.shopDomain, shopifyConfig.accessToken);
            }

            logger.info(`Found ${locationsToUse.length} locations to process for update`);

            // For each variant with inventory
            for (const variant of variantsWithInventory) {
              if (variant.inventoryItemId) {
                // STEP 1: Enable inventory tracking (no-op if already enabled)
                try {
                  await enableInventoryTracking(
                    shopifyConfig.shopDomain,
                    shopifyConfig.accessToken,
                    variant.inventoryItemId
                  );
                  logger.info(`✓ Enabled tracking for variant ${variant.id}`);
                } catch (trackingError) {
                  logger.error(`✗ Failed to enable tracking for variant ${variant.id}:`, trackingError.message);
                  continue; // Skip this variant
                }

                // STEP 2 & 3: Activate and set quantity at each location
                for (const location of locationsToUse) {
                  try {
                    // Activate at location
                    await activateInventoryAtLocation(
                      shopifyConfig.shopDomain,
                      shopifyConfig.accessToken,
                      variant.inventoryItemId,
                      location.id
                    );
                    logger.info(`✓ Activated at ${location.name}`);

                    // Set quantity
                    await setInventoryQuantities(
                      shopifyConfig.shopDomain,
                      shopifyConfig.accessToken,
                      variant.inventoryItemId,
                      location.id,
                      variant.stockQuantity
                    );
                    logger.info(`✓ Set quantity ${variant.stockQuantity} for variant ${variant.id} at ${location.name}`);

                    // Update or save location-specific stock information to database
                    try {
                      const [productLocation, created] = await db.ProductLocation.findOrCreate({
                        where: {
                          productId: productId,
                          variantId: variant.id, // Add variant ID to make it unique per variant
                          locationId: location.id
                        },
                        defaults: {
                          productId: productId,
                          variantId: variant.id,
                          variantSku: variant.sku,
                          locationId: location.id,
                          locationName: location.name,
                          stockQuantity: variant.stockQuantity
                        },
                        transaction
                      });

                      if (!created) {
                        // Update existing record
                        await productLocation.update({
                          variantSku: variant.sku, // Also update SKU in case it changed
                          stockQuantity: variant.stockQuantity
                        }, { transaction });
                        logger.info(`Updated location stock info for variant ${variant.id} (${variant.sku}) at ${location.name}`);
                      } else {
                        logger.info(`Created location stock info for variant ${variant.id} (${variant.sku}) at ${location.name}`);
                      }
                    } catch (dbError) {
                      logger.error(`Failed to save/update location stock info for variant ${variant.id} (${variant.sku}) at ${location.name}:`, dbError.message);
                    }
                  } catch (locationError) {
                    logger.error(`✗ Failed for variant ${variant.id} at ${location.name}:`, locationError.message);
                    // Continue with other locations
                  }
                }
              }
            }
          } catch (inventoryError) {
            logger.error('Failed to update inventory:', inventoryError);
            // Don't fail the whole operation
          }
        }
      }

      // STEP 2.3: Update variant images if provided
      if (shopifyConfig?.shopDomain && shopifyConfig?.accessToken) {
        // Get variant images from the product data
        const variantImagesToUpdate = productData.variants
          .filter(variant => variant.id && variant.shopifyVariantId && variant.mediaIds && Array.isArray(variant.mediaIds) && variant.mediaIds.length > 0)
          .map(variant => ({
            variantId: variant.shopifyVariantId, // Use the Shopify variant ID
            mediaIds: variant.mediaIds
          }));

        if (variantImagesToUpdate.length > 0) {
          try {
            logger.info(`Updating images for ${variantImagesToUpdate.length} variants on Shopify`);

            const variantImageResults = await updateVariantImages(
              shopifyConfig.shopDomain,
              shopifyConfig.accessToken,
              existingProduct.shopifyProductId, // Pass Shopify product ID
              variantImagesToUpdate,
              true // Enable deletion of old media
            );

            logger.info(`Updated images for ${variantImageResults.productVariants?.length || 0} variants on Shopify`);
          } catch (imageError) {
            logger.error('Failed to update variant images:', imageError);
            // Don't fail the whole operation for image update errors
          }
        }

        // Handle variant image URLs - This is now handled in the main variant image processing section above
        // to ensure shopifyMediaId is properly updated in the database
      }

      // STEP 2.4: Update variants in local DB
      for (const variant of variantsToUpdate) {
        const { id, shopifyVariantId, inventoryItemId, ...variantUpdateData } = variant;
        await db.ProductVariant.update(variantUpdateData, {
          where: { id, productId },
          transaction
        });
      }
      logger.info('Variants updated in local DB');
      // Update imageUrl in ProductVariant table for variants that have imageUrl in update data
      // Also update the corresponding ProductImage record with variantId
      if (productData.variants && Array.isArray(productData.variants)) {
        for (const variantUpdate of productData.variants) {
          if (variantUpdate.id && variantUpdate.imageUrl !== undefined) {
            try {
              // Update imageUrl in ProductVariant table
              await db.ProductVariant.update(
                { image_url: variantUpdate.imageUrl },
                {
                  where: { id: variantUpdate.id, productId },
                  transaction
                }
              );
              
              // Update the corresponding ProductImage record that has this variantId
              await db.ProductImage.update(
                { originalUrl: variantUpdate.imageUrl },
                {
                  where: { variantId: variantUpdate.id, productId },
                  transaction
                }
              );
              
              logger.debug(`Updated imageUrl for variant ${variantUpdate.id}: ${variantUpdate.imageUrl}`);
            } catch (dbError) {
              logger.error(`Failed to update imageUrl for variant ${variantUpdate.id}:`, dbError);
            }
          }
        }
      }
    }

    // STEP 2.5: Handle product-level image updates if images are provided
    if (productData.images && Array.isArray(productData.images) && shopifyConfig?.shopDomain && shopifyConfig?.accessToken) {
      try {
        // Process product-level images
        const productImages = productData.images.filter(img => img && (img.imageUrl || img.originalUrl));

        if (productImages.length > 0) {
          // For product-level images, we need to handle them differently
          // For now, we'll just update the local database and the allImageUrls field
          // Since product-level images are typically handled during product creation

          const mediaResults = [];
          for (const img of productImages) {
            const imageUrl = img.imageUrl || img.originalUrl;
            if (imageUrl) {
              // For product-level images, we just track them in the allImageUrls field
              // Actual Shopify media handling would require productUpdate with media
              mediaResults.push({
                imageUrl: imageUrl,
                altText: img.altText
              });
            }
          }

          // Update the product's allImageUrls field with all unique image URLs
          const allUniqueImageUrls = new Set();

          // Add existing product-level images from ProductImage table
          const existingProductImages = await db.ProductImage.findAll({
            where: { productId },
            attributes: ['originalUrl', 'enhancedUrl'],
            transaction
          });

          existingProductImages.forEach(image => {
            const imageUrl = image.originalUrl || image.enhancedUrl;
            if (imageUrl) {
              allUniqueImageUrls.add(imageUrl);
            }
          });

          // Add new images
          productImages.forEach(img => {
            const imageUrl = img.imageUrl || img.originalUrl;
            if (imageUrl) {
              allUniqueImageUrls.add(imageUrl);
            }
          });

          // Note: Variant-specific images are handled separately in variant processing
          // and should not be added to product-level media to avoid duplication

          // Now we need to associate these media with the product
          // Using the correct Shopify API approach
          try {
            if (shopifyConfig?.shopDomain && shopifyConfig?.accessToken && existingProduct?.shopifyProductId) {
              // Filter out duplicate URLs to avoid creating duplicate media
              const uniqueImageUrlsArray = Array.from(allUniqueImageUrls);

              if (uniqueImageUrlsArray.length > 0) {
                // Create media on the product using the new API
                const productMediaResult = await createShopifyProductMedia(
                  shopifyConfig.shopDomain,
                  shopifyConfig.accessToken,
                  existingProduct.shopifyProductId,
                  uniqueImageUrlsArray,
                  { alt: 'Product image' }
                );

                if (productMediaResult.success && productMediaResult.mediaIds && productMediaResult.mediaIds.length > 0) {
                  // Wait for the media to be ready before using it
                  const mediaWaitResult = await waitForMediaReady(
                    shopifyConfig.shopDomain,
                    shopifyConfig.accessToken,
                    existingProduct.shopifyProductId,
                    productMediaResult.mediaIds
                  );

                  logger.info(`Successfully created ${productMediaResult.mediaIds.length} media items for product. Ready: ${mediaWaitResult.readyMediaIds.length}, Failed: ${mediaWaitResult.failedMediaIds.length}`);

                  // Log failed media if any
                  if (mediaWaitResult.failedMediaIds.length > 0) {
                    logger.error(`Failed media IDs: ${mediaWaitResult.failedMediaIds.join(', ')}`);
                  }
                } else {
                  logger.warn('No media was successfully created for the product');

                  // Log any errors that occurred during media creation
                  if (productMediaResult.errors) {
                    logger.error('Media creation errors:', productMediaResult.errors);
                  }
                }
              }
            }
          } catch (mediaError) {
            logger.error('Failed to create product media on Shopify:', mediaError);
            // Don't fail the entire operation for media creation errors
          }

          // Update the allImageUrls field - include both product and variant images for reference
          const allImageUrlsForDB = new Set();

          // Add existing product-level images
          existingProductImages.forEach(image => {
            const imageUrl = image.originalUrl || image.enhancedUrl;
            if (imageUrl) {
              allImageUrlsForDB.add(imageUrl);
            }
          });

          // Add new product images
          productImages.forEach(img => {
            const imageUrl = img.imageUrl || img.originalUrl;
            if (imageUrl) {
              allImageUrlsForDB.add(imageUrl);
            }
          });

          // Add variant-specific images for database reference
          if (productData.variants && Array.isArray(productData.variants)) {
            productData.variants.forEach(variant => {
              if (variant.imageUrl) {
                allImageUrlsForDB.add(variant.imageUrl);
              }
            });
          }

          await db.Product.update(
            { allImageUrls: Array.from(allImageUrlsForDB) },
            { where: { id: productId }, transaction }
          );

          logger.info(`Processed ${mediaResults.length} product-level images`);
        }
      } catch (imageError) {
        logger.error('Failed to process product-level images:', imageError);
        // Don't fail the entire operation for image processing errors
      }
    }

    // STEP 3: Update product images in ProductImage table if provided
    if (productData.images && Array.isArray(productData.images)) {
      try {
        // First, delete existing product images
        await db.ProductImage.destroy({
          where: { productId },
          transaction
        });
        
        logger.info(`Deleted existing product images for product ${productId}`);
        
        // Then create new product images
        if (productData.images.length > 0) {
          const productImagesToCreate = productData.images.map((image, index) => ({
            productId: productId,
            storeId: existingProduct.storeId || null,
            originalUrl: image.imageUrl || image.originalUrl,
            enhancedUrl: image.enhancedUrl || null,
            displayOrder: image.displayOrder || index,
            altText: image.altText || null,
            isPrimary: image.isPrimary || false,
            shopifyMediaId: image.shopifyMediaId || null,
          }));
          
          await db.ProductImage.bulkCreate(productImagesToCreate, { transaction });
          
          logger.info(`Created ${productImagesToCreate.length} new product images for product ${productId}`);
        }
      } catch (imageError) {
        logger.error('Failed to update product images in ProductImage table:', imageError);
        // Don't fail the entire operation for image processing errors
      }
    }
    
    // STEP 4: Update allImageUrls field to reflect all current images
    // This ensures allImageUrls contains all unique image URLs from both ProductImage table and variants
    const allUniqueImageUrls = new Set();
    
    // Get all product-level images from ProductImage table
    const productImages = await db.ProductImage.findAll({
      where: { productId },
      attributes: ['originalUrl', 'enhancedUrl'],
      transaction
    });
    
    productImages.forEach(image => {
      const imageUrl = image.originalUrl || image.enhancedUrl;
      if (imageUrl) {
        allUniqueImageUrls.add(imageUrl);
      }
    });
    
    // Add variant-specific images from ProductVariant table (get current values from DB after update)
    const productVariants = await db.ProductVariant.findAll({
      where: { productId },
      attributes: ['image_url'],
      transaction
    });
    
    productVariants.forEach(variant => {
      if (variant.image_url) {
        allUniqueImageUrls.add(variant.image_url);
      }
    });
    
    // Update the allImageUrls field in the Product table
    await db.Product.update(
      { allImageUrls: Array.from(allUniqueImageUrls) },
      { where: { id: productId }, transaction }
    );
    
    logger.info(`Updated allImageUrls for product ${productId} with ${allUniqueImageUrls.size} unique image URLs`);
    
    // STEP 5: Update product in local database (exclude variants from update)
    const { variants, images, ...productUpdateData } = productData; // Exclude both variants and images from product update
    await db.Product.update(productUpdateData, {
      where: { id: productId },
      transaction
    });

    // Commit transaction
    await transaction.commit();

    // Return updated product with details
    return await getProductWithDetails(productId);
  } catch (error) {
    await transaction.rollback();
    logger.error('Product update failed:', error);
    throw error;
  }
};

const deleteProduct = async (productId) => {
  return await db.Product.destroy({ where: { id: productId } });
};

module.exports = {
  createProductService,
  createBulkProductsService,
  getProductById,
  getProductWithDetails,
  getProductByTitle,
  getProductByCategory,
  getAllProducts,
  updateProduct,
  deleteProduct,
};