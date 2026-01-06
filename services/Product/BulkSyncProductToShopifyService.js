const db = require("../../models/index.js");
const {
    createShopifyProduct,
    updateShopifyProduct,
    updateShopifyVariants,
    enableInventoryTracking,
    activateInventoryAtLocation,
    getLocations,
    setInventoryQuantities,
    getProductDetails,
} = require("../Shopify/ShopifyGraphqlService.js");
const AppError = require("../../utils/AppError.js");
const logger = require("../../utils/logger.js");
const shortHash = require("../../utils/shortHash.js");

/**
 * Sync multiple products to Shopify in bulk
 * @param {Array} productIds - Array of product IDs to sync
 * @param {string} locationId - Optional location ID for inventory
 * @param {string} storeId - Optional store ID to override product's store ID
 * @param {Array} stores - Optional array of store configurations
 * @returns {Array} - Array of sync results for each product
 */
const bulkSyncProductsToShopifyService = async (productIds, locationId = null, storeId = null, stores = null) => {
    const results = [];

    logger.info(`Starting bulk sync for ${productIds.length} products`);

    // Process products in smaller batches to avoid database connection timeouts
    const batchSize = 3;
    const batches = [];

    // Split products into batches
    for (let i = 0; i < productIds.length; i += batchSize) {
        batches.push(productIds.slice(i, i + batchSize));
    }

    // Process each batch
    for (let batchIndex = 0; batchIndex < batches.length; batchIndex++) {
        const batch = batches[batchIndex];
        logger.info(`Processing batch ${batchIndex + 1}/${batches.length} with ${batch.length} products`);

        // Process products in parallel within each batch
        const batchPromises = batch.map(productId =>
            syncSingleProductToShopify(productId, locationId, storeId, stores)
        );

        try {
            const batchResults = await Promise.allSettled(batchPromises);

            // Process results for this batch
            for (let i = 0; i < batchResults.length; i++) {
                const result = batchResults[i];
                const productId = batch[i];

                if (result.status === 'fulfilled') {
                    results.push({
                        productId,
                        success: true,
                        data: result.value,
                        error: null
                    });
                } else {
                    logger.error(`Failed to sync product ${productId}:`, result.reason);
                    results.push({
                        productId,
                        success: false,
                        data: null,
                        error: result.reason.message || 'Unknown error'
                    });
                }
            }
        } catch (error) {
            logger.error(`Error processing batch ${batchIndex + 1}:`, error);
            // Add failed entries for the entire batch
            batch.forEach(productId => {
                results.push({
                    productId,
                    success: false,
                    data: null,
                    error: error.message || 'Batch processing error'
                });
            });
        }

        // Add a delay between batches to respect rate limits and allow DB connections to be released
        if (batchIndex < batches.length - 1) {
            logger.info(`Waiting before processing next batch...`);
            await new Promise(resolve => setTimeout(resolve, 5000)); // 5 second delay between batches to allow DB connections to recover
        }
    }

    logger.info(`Bulk sync completed. Success: ${results.filter(r => r.success).length}/${results.length}`);

    return results;
};

/**
 * Sync a single product to Shopify (helper function)
 * @param {string} productId - Product ID to sync
 * @param {string} locationId - Optional location ID for inventory
 * @param {string} storeId - Optional store ID to override product's store ID
 * @param {Array} stores - Optional array of store configurations
 * @returns {object} - Sync result
 */
const syncSingleProductToShopify = async (productId, locationId = null, storeId = null, stores = null) => {
    const transaction = await db.sequelize.transaction();
    let effectiveStores = []; // Initialize for proper scoping in error handling

    try {
        // Fetch product with all associations (options, values, variants, images)
        // Add retry logic for database connection issues
        let product = null;
        let retryCount = 0;
        const maxRetries = 3;

        while (retryCount < maxRetries) {
            try {
                product = await db.Product.findByPk(productId, {
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
                break; // Success, exit the retry loop
            } catch (dbError) {
                retryCount++;
                if (retryCount >= maxRetries) {
                    logger.error(`Failed to fetch product ${productId} after ${maxRetries} retries:`, dbError.message);
                    throw dbError;
                }
                logger.warn(`Database error fetching product ${productId}, retry ${retryCount}/${maxRetries}:`, dbError.message);
                await new Promise(resolve => setTimeout(resolve, 2000 * retryCount)); // Increased exponential backoff for database connection recovery
            }
        }

        if (!product) {
            throw new AppError("Product not found", 404);
        }

        // Check if product is already synced
        if (product.syncStatus === 'synced') {
            logger.info(`Product ${productId} is already synced to Shopify`);
            return {
                ...product.toJSON(),
                message: "Product already synced to Shopify",
                alreadySynced: true
            };
        }

        // Handle the new format where stores is an array of objects with storeId and optional locationId

        if (stores && Array.isArray(stores) && stores.length > 0) {
            // New format: array of objects with storeId and optional locationId
            effectiveStores = stores.map(storeObj => ({
                storeId: storeObj.storeId,
                locationId: storeObj.locationId || locationId || null
            })).filter(store => store.storeId !== null && store.storeId !== undefined && store.storeId !== ''); // Additional filter to ensure valid store IDs

            logger.info(`Using stores from request parameter: ${JSON.stringify(effectiveStores.map(s => s.storeId))}`);
        } else if (storeId) {
            // Legacy format: single store ID with locationId
            effectiveStores = [{
                storeId: storeId,
                locationId: locationId
            }];
        } else {
            // Default: use product's storeId
            effectiveStores = [{
                storeId: product.storeId,
                locationId: locationId
            }].filter(store => store.storeId !== null && store.storeId !== undefined && store.storeId !== '');
        }

        if (!effectiveStores || effectiveStores.length === 0) {
            // If no stores are found from parameters, try to use the product's storeId as fallback
            if (product.storeId) {
                effectiveStores = [{
                    storeId: product.storeId,
                    locationId: locationId
                }];
                logger.info(`Using fallback storeId ${product.storeId} for product ${productId}`);
            } else {
                logger.error(`No store ID found for product ${productId}. Request stores: ${JSON.stringify(stores)}, storeId: ${storeId}, product.storeId: ${product.storeId}`);
                throw new AppError("Store ID not found for this product", 400);
            }
        }

        logger.info(`Starting sync for product ID: ${productId} using ${effectiveStores.length} store(s)`);

        // Process each store individually
        const results = [];
        const shopifyResultsByStore = {}; // Track shopify results per store

        for (const storeConfig of effectiveStores) {
            const effectiveStoreId = storeConfig.storeId;
            const effectiveLocationId = storeConfig.locationId;

            // Get Shopify credentials from Store table using storeId from product
            const store = await db.Store.findByPk(effectiveStoreId);
            if (!store || !store.shopifyDomain || !store.shopifyAccessToken) {
                logger.error(`Shopify credentials not found for store ID: ${effectiveStoreId}`);
                results.push({
                    storeId: effectiveStoreId,
                    success: false,
                    error: "Shopify credentials not found for this store"
                });
                continue; // Skip to next store
            }

            const shopifyConfig = {
                shopDomain: store.shopifyDomain,
                accessToken: store.shopifyAccessToken,
                locationId: effectiveLocationId || null,
            };

            logger.info(`Shopify credentials retrieved for store: ${store.storeName} (ID: ${effectiveStoreId})`);

            // Check if product already has shopifyProductId
            let shopifyResult;
            if (product && product.shopifyProductId) {
                // Update existing Shopify product
                logger.info(`Updating existing Shopify product: ${product.shopifyProductId}`);

                const shopifyInput = {
                    title: product.title,
                    descriptionHtml: product.description,
                    productType: product.productType,
                    vendor: product.vendor || '',
                    tags: product.tags || [],
                    status: product.status === 'published' ? 'ACTIVE' : 'DRAFT',
                };

                shopifyResult = await updateShopifyProduct(
                    shopifyConfig.shopDomain,
                    shopifyConfig.accessToken,
                    product.shopifyProductId,
                    shopifyInput
                );

                logger.info(`Shopify product updated: ${shopifyResult.shopifyProductId}`);
            } else {
                // Create new Shopify product
                logger.info("Creating new Shopify product");

                // Build Shopify product input
                const shopifyInput = {
                    title: product.title,
                    descriptionHtml: product.description,
                    productType: product.productType,
                    vendor: product.vendor || '',
                    tags: product.tags || [],
                    status: product.status === 'published' ? 'ACTIVE' : 'DRAFT',
                };

                // Build options directly from ProductOption and ProductOptionValue tables
                if (product.options && product.options.length > 0) {
                    // Filter valid options (must have name and at least one value)
                    const validOptions = product.options
                        .filter(option =>
                            option.name &&
                            option.name.trim() !== '' &&
                            option.values &&
                            option.values.length > 0 &&
                            option.values.some(value => value.value && value.value.trim() !== '')
                        )
                        .slice(0, 3); // Shopify limit to 3 options

                    logger.info(`Database returned ${product.options.length} raw options`);
                    product.options.forEach((option, index) => {
                        logger.info(`DB Option ${index + 1}: name=${option.name}, ${option.values?.length || 0} values`);
                    });

                    logger.info(`After filtering, ${validOptions.length} valid options`);
                    validOptions.forEach((option, index) => {
                        logger.info(`Valid Option ${index + 1}: name=${option.name}, ${option.values?.length || 0} values`);
                    });

                    // Format options for Shopify (extract option names and their values from DB)
                    const formattedOptions = validOptions.map((option) => ({
                        name: option.name,
                        values: option.values
                            .filter(value => value.value && value.value.trim() !== '')
                            .map(value => value.value),
                    }));

                    if (formattedOptions.length > 0) {
                        shopifyInput.options = formattedOptions;
                        logger.info(`Prepared ${formattedOptions.length} options from database:`, JSON.stringify(formattedOptions, null, 2));
                    }
                }

                // Build variants with ALL option values from DB structure
                if (product.variants && product.variants.length > 0) {
                    // Get product options in order (as they are stored in DB)
                    const productOptions = product.options
                        .filter(option =>
                            option.name &&
                            option.name.trim() !== '' &&
                            option.values &&
                            option.values.length > 0 &&
                            option.values.some(value => value.value && value.value.trim() !== '')
                        )
                        .slice(0, 3); // Shopify limit

                    logger.info(`Product has ${productOptions.length} options: ${productOptions.map(o => o.name).join(', ')}`);

                    // Generate store-specific SKUs and update variants in the database
                    const variantSkuMap = {};
                    let variantIndex = 0;

                    // First, initialize all variants' storeSpecificSKUs if not already present
                    for (const variant of product.variants) {
                        if (!variant.storeSpecificSKUs) {
                            variant.storeSpecificSKUs = {};
                        } else if (typeof variant.storeSpecificSKUs === 'string') {
                            try {
                                variant.storeSpecificSKUs = JSON.parse(variant.storeSpecificSKUs);
                            } catch (parseError) {
                                logger.warn(`Failed to parse storeSpecificSKUs for variant ${variant.id}, initializing as empty object`);
                                variant.storeSpecificSKUs = {};
                            }
                        }
                    }

                    for (const variant of product.variants) {
                        // Build a map of option ID to option name and value for this variant
                        const variantOptionMap = new Map();

                        // Populate the map from variantOptions
                        variant.variantOptions.forEach(vo => {
                            if (vo.optionValue && vo.optionValue.option) {
                                const optionId = vo.optionValue.option.id;
                                const optionName = vo.optionValue.option.name;
                                const optionValue = vo.optionValue.value;
                                variantOptionMap.set(optionId, {
                                    name: optionName,
                                    value: optionValue
                                });
                            }
                        });

                        // Build options array in the SAME ORDER as productOptions
                        // This ensures all variants have values for all product options
                        const options = productOptions.map((productOption) => {
                            // Get the value for this option from the variant's option map
                            const variantOption = variantOptionMap.get(productOption.id);

                            if (!variantOption || !variantOption.value) {
                                // If variant doesn't have a value for this option, use the first available value
                                const defaultValue = productOption.values[0].value;
                                logger.warn(`Variant ${variant.sku} missing value for option "${productOption.name}", using default: "${defaultValue}"`);
                                return defaultValue;
                            }

                            return variantOption.value;
                        });

                        // Validate that we have the correct number of option values
                        if (options.length !== productOptions.length) {
                            logger.error(`Variant ${variant.sku} has ${options.length} option values but product has ${productOptions.length} options`);
                            // Pad with default values if needed
                            while (options.length < productOptions.length) {
                                const missingOptionIndex = options.length;
                                const defaultValue = productOptions[missingOptionIndex].values[0].value;
                                logger.warn(`Adding default value "${defaultValue}" for option "${productOptions[missingOptionIndex].name}" to variant ${variant.sku}`);
                                options.push(defaultValue);
                            }
                        }

                        logger.debug(`Variant ${variant.sku}: ${productOptions.length} options = [${options.join(', ')}]`);

                        // Generate store-specific SKU
                        // let productTitle = product?.title;
                        // productTitle = productTitle.replace(/[^a-zA-Z0-9]/g, "-").toUpperCase();
                        const vendor = product?.vendor;
                        // const storeCode = store?.storeCode;

                        // const skuIndex = String(variantIndex + 1).padStart(3, '0');
                        // const vendorPrefix = vendor.split(" ").map(w => w[0]).join("").toUpperCase();
                        // const randomStoreCode = vendorPrefix + Math.floor(Math.random() * 100);

                        // const finalSKU = `${vendorPrefix}-${productTitle}-${skuIndex}-${storeCode || randomStoreCode}`;

                        const vendorPrefix = vendor
                            .split(' ')
                            .map(w => w[0])
                            .join('')
                            .toUpperCase();

                        const productCode = shortHash(product.id.toString());
                        const storeCode = store.storeCode.toUpperCase(); // US, EU, IN
                        const variantCode = String(variantIndex + 1).padStart(3, '0');
                        const randomStoreCode = vendorPrefix + variantCode;
                        finalSKU = `${vendorPrefix}-${productCode}-${variantCode}-${storeCode || randomStoreCode}`;
                        variantIndex++;

                        // Update the variant's storeSpecificSKUs field with store-specific SKU for this store
                        const currentSKUs = variant.storeSpecificSKUs;

                        // Add the store-specific SKU
                        currentSKUs[effectiveStoreId] = finalSKU;

                        // Update the variant in the database with the new SKU mapping
                        await db.ProductVariant.update(
                            { storeSpecificSKUs: currentSKUs },
                            { where: { id: variant.id }, transaction }
                        );

                        // Update the variant object in memory with the new SKU mapping
                        variant.storeSpecificSKUs = currentSKUs;
                    }

                    // Build the variants array from the mapping for the current store
                    // This ensures that the correct store-specific SKU is used for this store
                    const storeSpecificVariants = product.variants.map(variant => {
                        // Get the store-specific SKU for this variant and store
                        const storeSpecificSKU = variant.storeSpecificSKUs && variant.storeSpecificSKUs[effectiveStoreId] || variant.sku;

                        // Build a map of option ID to option name and value for this variant
                        const variantOptionMap = new Map();
                        variant.variantOptions.forEach(vo => {
                            if (vo.optionValue && vo.optionValue.option) {
                                const optionId = vo.optionValue.option.id;
                                const optionName = vo.optionValue.option.name;
                                const optionValue = vo.optionValue.value;
                                variantOptionMap.set(optionId, {
                                    name: optionName,
                                    value: optionValue
                                });
                            }
                        });

                        // Build options array in the SAME ORDER as productOptions
                        const options = productOptions.map((productOption) => {
                            const variantOption = variantOptionMap.get(productOption.id);
                            if (!variantOption || !variantOption.value) {
                                const defaultValue = productOption.values[0].value;
                                logger.warn(`Variant ${variant.sku} missing value for option "${productOption.name}", using default: "${defaultValue}"`);
                                return defaultValue;
                            }
                            return variantOption.value;
                        });

                        return {
                            sku: storeSpecificSKU || variant.sku,
                            price: variant.price ? variant.price.toString() : '0.00',
                            compareAtPrice: variant.compareAtPrice ? variant.compareAtPrice.toString() : null,
                            options: options,
                            imageUrl: variant.image_url || null,
                        };
                    });

                    // Set the variants for this specific store
                    shopifyInput.variants = storeSpecificVariants;

                    logger.info(`Prepared ${shopifyInput.variants.length} variants for Shopify`);
                }

                // Add images to Shopify input
                let allImages = [];
                const uniqueImageUrls = new Set(); // To prevent duplicates

                // Add product-level images from ProductImage table
                if (product.images && product.images.length > 0) {
                    const productImages = product.images.map((image, index) => ({
                        imageUrl: image.originalUrl || image.enhancedUrl,
                        altText: image.altText || `Product image ${index + 1}`
                    })).filter(img => img.imageUrl && !uniqueImageUrls.has(img.imageUrl));

                    // Add unique product images
                    productImages.forEach(img => {
                        if (!uniqueImageUrls.has(img.imageUrl)) {
                            uniqueImageUrls.add(img.imageUrl);
                            allImages.push(img);
                        }
                    });
                }

                // Add variant-specific images from ProductVariant table
                if (product.variants && product.variants.length > 0) {
                    const variantImages = product.variants
                        .filter(variant => variant.image_url && !uniqueImageUrls.has(variant.image_url))
                        .map((variant, index) => ({
                            imageUrl: variant.image_url,
                            altText: variant.altText || `Variant image ${index + 1}`
                        }));

                    // Add unique variant images
                    variantImages.forEach(img => {
                        if (!uniqueImageUrls.has(img.imageUrl)) {
                            uniqueImageUrls.add(img.imageUrl);
                            allImages.push(img);
                        }
                    });
                }

                // Use combined images
                if (allImages.length > 0) {
                    shopifyInput.images = allImages;
                }

                shopifyResult = await createShopifyProduct(
                    shopifyConfig.shopDomain,
                    shopifyConfig.accessToken,
                    shopifyInput
                );

                logger.info(`Shopify product created: ${shopifyResult.shopifyProductId}`);

                // Handle inventory updates with proper 3-step process
                if (shopifyConfig?.shopDomain && shopifyConfig?.accessToken && shopifyResult.inventoryItemIdMap && Object.keys(shopifyResult.inventoryItemIdMap).length > 0) {
                    try {
                        // Determine which locations to use - specific location if provided, otherwise all active locations
                        let locationsToUse = [];
                        const locationIdToUse = shopifyConfig?.locationId;

                        logger.info(`Checking for location ID. shopifyConfig.locationId: ${shopifyConfig?.locationId}, final locationIdToUse: ${locationIdToUse}`);

                        if (locationIdToUse) {
                            // Use specific location if provided
                            const allLocations = await getLocations(shopifyConfig.shopDomain, shopifyConfig.accessToken);
                            logger.info(`All available locations: ${JSON.stringify(allLocations.map(loc => ({ id: loc.id, name: loc.name })))}`);
                            logger.info(`Looking for location ID: ${locationIdToUse}`);
                            const specificLocation = allLocations.find(loc => loc.id === locationIdToUse);
                            if (specificLocation) {
                                locationsToUse = [specificLocation];
                                logger.info(`Using specific location: ${specificLocation.name} (${specificLocation.id})`);
                            } else {
                                logger.warn(`Specified location ID ${locationIdToUse} not found, using all active locations`);
                                locationsToUse = await getLocations(shopifyConfig.shopDomain, shopifyConfig.accessToken);
                            }
                        } else {
                            // Use all active locations
                            logger.info(`No location ID provided, using all active locations`);
                            locationsToUse = await getLocations(shopifyConfig.shopDomain, shopifyConfig.accessToken);
                        }

                        logger.info(`Found ${locationsToUse.length} locations to process`);

                        // For each variant with stock quantity from database
                        for (const variant of product.variants) {
                            // Get the store-specific SKU for this variant from storeSpecificSKUs
                            let currentSKUs = variant.storeSpecificSKUs || {};
                            if (typeof currentSKUs === 'string') {
                                try {
                                    currentSKUs = JSON.parse(currentSKUs);
                                } catch (parseError) {
                                    logger.warn(`Failed to parse storeSpecificSKUs for variant ${variant.id}, using empty object`);
                                    currentSKUs = {};
                                }
                            }

                            const storeSpecificSKU = currentSKUs[effectiveStoreId];
                            const inventoryItemId = shopifyResult.inventoryItemIdMap[storeSpecificSKU];

                            if (variant.stockQuantity > 0 && inventoryItemId) {
                                logger.info(`Processing inventory for variant: ${storeSpecificSKU}`);

                                // STEP 1: Enable inventory tracking
                                try {
                                    await enableInventoryTracking(
                                        shopifyConfig.shopDomain,
                                        shopifyConfig.accessToken,
                                        inventoryItemId
                                    );
                                    logger.info(`✓ Enabled tracking for ${storeSpecificSKU}`);
                                } catch (trackingError) {
                                    logger.error(`✗ Failed to enable tracking for ${storeSpecificSKU}:`, trackingError.message);
                                    continue; // Skip this variant if tracking fails
                                }

                                // STEP 2 & 3: Activate at location and set quantity
                                for (const location of locationsToUse) {
                                    try {
                                        // Activate inventory at this location
                                        await activateInventoryAtLocation(
                                            shopifyConfig.shopDomain,
                                            shopifyConfig.accessToken,
                                            inventoryItemId,
                                            location.id
                                        );
                                        logger.info(`✓ Activated at ${location.name}`);

                                        // Set the quantity
                                        await setInventoryQuantities(
                                            shopifyConfig.shopDomain,
                                            shopifyConfig.accessToken,
                                            inventoryItemId,
                                            location.id,
                                            variant.stockQuantity
                                        );
                                        logger.info(`✓ Set quantity ${variant.stockQuantity} for ${storeSpecificSKU} at ${location.name}`);

                                        // Save location-specific stock information to database
                                        try {
                                            await db.ProductLocation.create({
                                                productId: product.id,
                                                variantId: variant.id, // Add variant ID
                                                variantSku: storeSpecificSKU, // Add store-specific variant SKU
                                                locationId: location.id,
                                                locationName: location.name,
                                                stockQuantity: variant.stockQuantity,
                                                storeId: effectiveStoreId // Include storeId for multi-store tracking
                                            }, { transaction });
                                            logger.info(`Saved location stock info for ${storeSpecificSKU} at ${location.name} in store ${effectiveStoreId}`);
                                        } catch (dbError) {
                                            logger.error(`Failed to save location stock info for ${storeSpecificSKU} at ${location.name} in store ${effectiveStoreId}:`, dbError.message);
                                        }
                                    } catch (locationError) {
                                        logger.error(`✗ Failed for ${storeSpecificSKU} at ${location.name} in store ${effectiveStoreId}:`, locationError.message);
                                        // Continue with other locations even if one fails
                                    }
                                }
                            }
                        }
                    } catch (inventoryError) {
                        logger.error('Failed to process inventory:', inventoryError.message);
                    }
                }
            }

            // Store the shopify result for this store
            shopifyResultsByStore[effectiveStoreId] = shopifyResult;

            // Add successful result for this store
            results.push({
                storeId: effectiveStoreId,
                locationId: effectiveLocationId,
                success: true,
                shopifyProductId: shopifyResult.shopifyProductId,
                shopifyHandle: shopifyResult.handle,
                shopifyStatus: shopifyResult.status,
                message: `Product synced successfully to store ${effectiveStoreId}`
            });
        } // Close the for loop here
        // Prepare all unique image URLs for allImageUrls field
        const allUniqueImageUrls = new Set();

        // Add product-level images from ProductImage table
        if (product.images && product.images.length > 0) {
            product.images.forEach(image => {
                const imageUrl = image.originalUrl || image.enhancedUrl;
                if (imageUrl) {
                    allUniqueImageUrls.add(imageUrl);
                }
            });
        }

        // Add variant-specific images from ProductVariant table
        if (product.variants && product.variants.length > 0) {
            product.variants.forEach(variant => {
                if (variant.image_url) {
                    allUniqueImageUrls.add(variant.image_url);
                }
            });
        }

        // Update local product with Shopify data
        const updateData = {
            syncStatus: 'synced',
            allImageUrls: Array.from(allUniqueImageUrls), // Store all unique image URLs
        };

        // Include storeId in update if it was provided and is different
        // Update the product's storeId to the first storeId in the array if we're syncing to multiple stores
        if (effectiveStores && effectiveStores.length > 0) {
            updateData.storeId = effectiveStores[0].storeId; // Use first store ID as the primary
            updateData.storeIds = effectiveStores.map(s => s.storeId); // Store all store IDs
        }

        // Update multi-store sync tracking fields
        // Collect all store-specific data first to avoid multiple updates to the same record
        let currentShopifyProductIds = product.shopifyProductIds || {};
        let currentShopifyHandles = product.shopifyHandles || {};
        let currentShopifyStatuses = product.shopifyStatuses || {};
        let currentSyncStatuses = product.syncStatuses || {};
        let currentSyncErrors = product.syncErrors || {};

        // Ensure JSON fields are properly parsed
        if (typeof currentShopifyProductIds === 'string') {
            try {
                currentShopifyProductIds = JSON.parse(currentShopifyProductIds);
            } catch (parseError) {
                logger.warn(`Failed to parse shopifyProductIds for product ${productId}, initializing as empty object`);
                currentShopifyProductIds = {};
            }
        }

        if (typeof currentShopifyHandles === 'string') {
            try {
                currentShopifyHandles = JSON.parse(currentShopifyHandles);
            } catch (parseError) {
                logger.warn(`Failed to parse shopifyHandles for product ${productId}, initializing as empty object`);
                currentShopifyHandles = {};
            }
        }

        if (typeof currentShopifyStatuses === 'string') {
            try {
                currentShopifyStatuses = JSON.parse(currentShopifyStatuses);
            } catch (parseError) {
                logger.warn(`Failed to parse shopifyStatuses for product ${productId}, initializing as empty object`);
                currentShopifyStatuses = {};
            }
        }

        if (typeof currentSyncStatuses === 'string') {
            try {
                currentSyncStatuses = JSON.parse(currentSyncStatuses);
            } catch (parseError) {
                logger.warn(`Failed to parse syncStatuses for product ${productId}, initializing as empty object`);
                currentSyncStatuses = {};
            }
        }

        if (typeof currentSyncErrors === 'string') {
            try {
                currentSyncErrors = JSON.parse(currentSyncErrors);
            } catch (parseError) {
                logger.warn(`Failed to parse syncErrors for product ${productId}, initializing as empty object`);
                currentSyncErrors = {};
            }
        }

        // Update all store-specific data in a single pass
        for (const storeConfig of effectiveStores) {
            const effectiveStoreId = storeConfig.storeId;

            const storeResult = results.find(r => r.storeId === effectiveStoreId);
            if (storeResult && storeResult.success) {
                currentShopifyProductIds[effectiveStoreId] = storeResult.shopifyProductId;
                currentShopifyHandles[effectiveStoreId] = storeResult.shopifyHandle;
                currentShopifyStatuses[effectiveStoreId] = storeResult.shopifyStatus;
                currentSyncStatuses[effectiveStoreId] = 'synced';

                // Remove any error for this store if successful
                if (currentSyncErrors[effectiveStoreId]) {
                    delete currentSyncErrors[effectiveStoreId];
                }
            } else if (storeResult && !storeResult.success) {
                // Set error if sync failed
                currentSyncErrors[effectiveStoreId] = storeResult.error || 'Sync failed';
                currentSyncStatuses[effectiveStoreId] = 'failed';
            }
        }

        // Set all the updated data in one update operation
        updateData.shopifyProductIds = currentShopifyProductIds;
        updateData.shopifyHandles = currentShopifyHandles;
        updateData.shopifyStatuses = currentShopifyStatuses;
        updateData.syncStatuses = currentSyncStatuses;
        updateData.syncErrors = currentSyncErrors;

        await db.Product.update(
            updateData,
            {
                where: { id: productId },
                transaction,
            }
        );

        // Update variant shopifyVariantId and inventoryItemId
        if (product.variants && product.variants.length > 0) {
            // Collect all store-specific data for each variant first to avoid multiple updates to the same record
            const variantUpdates = {};

            for (const variant of product.variants) {
                // Initialize the update object for this variant
                variantUpdates[variant.id] = {
                    shopifyVariantIds: variant.shopifyVariantIds || {},
                    inventoryItemIds: variant.inventoryItemIds || {},
                    syncStatuses: variant.syncStatuses || {},
                    shopifyMediaIds: variant.shopifyMediaIds || {}
                };

                // Ensure JSON fields are properly parsed
                if (typeof variantUpdates[variant.id].shopifyVariantIds === 'string') {
                    try {
                        variantUpdates[variant.id].shopifyVariantIds = JSON.parse(variantUpdates[variant.id].shopifyVariantIds);
                    } catch (parseError) {
                        logger.warn(`Failed to parse shopifyVariantIds for variant ${variant.id}, initializing as empty object`);
                        variantUpdates[variant.id].shopifyVariantIds = {};
                    }
                }

                if (typeof variantUpdates[variant.id].inventoryItemIds === 'string') {
                    try {
                        variantUpdates[variant.id].inventoryItemIds = JSON.parse(variantUpdates[variant.id].inventoryItemIds);
                    } catch (parseError) {
                        logger.warn(`Failed to parse inventoryItemIds for variant ${variant.id}, initializing as empty object`);
                        variantUpdates[variant.id].inventoryItemIds = {};
                    }
                }

                if (typeof variantUpdates[variant.id].syncStatuses === 'string') {
                    try {
                        variantUpdates[variant.id].syncStatuses = JSON.parse(variantUpdates[variant.id].syncStatuses);
                    } catch (parseError) {
                        logger.warn(`Failed to parse syncStatuses for variant ${variant.id}, initializing as empty object`);
                        variantUpdates[variant.id].syncStatuses = {};
                    }
                }

                if (typeof variantUpdates[variant.id].shopifyMediaIds === 'string') {
                    try {
                        variantUpdates[variant.id].shopifyMediaIds = JSON.parse(variantUpdates[variant.id].shopifyMediaIds);
                    } catch (parseError) {
                        logger.warn(`Failed to parse shopifyMediaIds for variant ${variant.id}, initializing as empty object`);
                        variantUpdates[variant.id].shopifyMediaIds = {};
                    }
                }
            }

            // Process each store result and update the collected data
            for (const storeResult of results) {
                if (!storeResult.success) continue;

                const effectiveStoreId = storeResult.storeId;

                // Get the specific shopify result for this store
                const shopifyResultForStore = shopifyResultsByStore[effectiveStoreId];

                // Update each variant with store-specific data
                for (const variant of product.variants) {
                    // Get the store-specific SKU for this variant from storeSpecificSKUs
                    let currentSKUs = variant.storeSpecificSKUs || {};
                    if (typeof currentSKUs === 'string') {
                        try {
                            currentSKUs = JSON.parse(currentSKUs);
                        } catch (parseError) {
                            logger.warn(`Failed to parse storeSpecificSKUs for variant ${variant.id}, using empty object`);
                            currentSKUs = {};
                        }
                    }

                    const storeSpecificSKU = currentSKUs[effectiveStoreId];
                    // Get the specific shopify variant ID and inventory item ID for this variant
                    const shopifyVariantId = shopifyResultForStore?.variantIdMap?.[storeSpecificSKU] || null;
                    const inventoryItemId = shopifyResultForStore?.inventoryItemIdMap?.[storeSpecificSKU] || null;

                    // Update the collected data for this variant
                    variantUpdates[variant.id].shopifyVariantIds[effectiveStoreId] = shopifyVariantId;
                    variantUpdates[variant.id].inventoryItemIds[effectiveStoreId] = inventoryItemId;
                    variantUpdates[variant.id].syncStatuses[effectiveStoreId] = 'synced';

                    // Update shopifyMediaIds map if available
                    if (shopifyResultForStore?.mediaIdMap && shopifyResultForStore?.mediaIdMap[storeSpecificSKU]) {
                        variantUpdates[variant.id].shopifyMediaIds[effectiveStoreId] = shopifyResultForStore.mediaIdMap[storeSpecificSKU];
                    }
                }
            }

            // Now perform a single update for each variant with all the collected store-specific data
            for (const variant of product.variants) {
                const variantUpdateData = {
                    shopifyVariantIds: variantUpdates[variant.id].shopifyVariantIds,
                    inventoryItemIds: variantUpdates[variant.id].inventoryItemIds,
                    syncStatuses: variantUpdates[variant.id].syncStatuses,
                };

                // Only add shopifyMediaIds if it has content
                if (Object.keys(variantUpdates[variant.id].shopifyMediaIds).length > 0) {
                    variantUpdateData.shopifyMediaIds = variantUpdates[variant.id].shopifyMediaIds;
                }

                await db.ProductVariant.update(
                    variantUpdateData,
                    {
                        where: { id: variant.id },
                        transaction,
                    }
                );
            }
        }

        // For each store, fetch Shopify product details to get option IDs and save them to local database
        for (const storeResult of results) {
            if (!storeResult.success) continue;

            const effectiveStoreId = storeResult.storeId;
            const store = await db.Store.findByPk(effectiveStoreId);
            if (!store || !store.shopifyDomain || !store.shopifyAccessToken) {
                logger.warn(`Skipping option ID update for store ${effectiveStoreId} - no credentials`);
                continue;
            }

            const shopifyConfig = {
                shopDomain: store.shopifyDomain,
                accessToken: store.shopifyAccessToken,
            };

            // Fetch Shopify product details to get option IDs and save them to local database
            try {
                const shopifyProductResult = await getProductDetails(
                    shopifyConfig.shopDomain,
                    shopifyConfig.accessToken,
                    storeResult.shopifyProductId
                );

                if (shopifyProductResult.success && shopifyProductResult.product) {
                    const shopifyOptions = shopifyProductResult.product.options || [];

                    // Get the local product options to match with Shopify options
                    const localProductOptions = await db.ProductOption.findAll({
                        where: { productId: productId },
                        order: [['position', 'ASC']],
                        transaction
                    });

                    logger.info(`Found ${shopifyOptions.length} Shopify options and ${localProductOptions.length} local options for product ${productId}`);

                    // Update local options with Shopify option IDs per store
                    for (let i = 0; i < localProductOptions.length; i++) {
                        const localOption = localProductOptions[i];
                        let shopifyOptionId = null;

                        // Find corresponding Shopify option by position/index
                        if (i < shopifyOptions.length) {
                            const shopifyOption = shopifyOptions[i];
                            shopifyOptionId = shopifyOption.id;

                            logger.info(`Found Shopify option ID: ${shopifyOption.id} for local option ${localOption.id}`);
                        }

                        // Get current shopifyOptionIds or initialize as empty object
                        let currentOptionIds = localOption.shopifyOptionIds || {};

                        // Ensure currentOptionIds is a proper object, not a string representation
                        if (typeof currentOptionIds === 'string') {
                            try {
                                currentOptionIds = JSON.parse(currentOptionIds);
                            } catch (parseError) {
                                logger.warn(`Failed to parse shopifyOptionIds for option ${localOption.id}, initializing as empty object`);
                                currentOptionIds = {};
                            }
                        }

                        // Update the specific store's option ID
                        if (effectiveStoreId) {
                            currentOptionIds[effectiveStoreId] = shopifyOptionId;
                        }

                        await db.ProductOption.update(
                            { shopifyOptionIds: currentOptionIds },
                            { where: { id: localOption.id }, transaction }
                        );

                        logger.info(`Updated local option ${localOption.id} with Shopify option IDs:`, JSON.stringify(currentOptionIds));

                        // Also update the option values with their Shopify IDs per store
                        const localOptionValues = await db.ProductOptionValue.findAll({
                            where: { optionId: localOption.id },
                            transaction
                        });

                        for (let j = 0; j < localOptionValues.length; j++) {
                            const localOptionValue = localOptionValues[j];
                            let shopifyOptionValueId = null;

                            // Find corresponding Shopify option value if we have a matching Shopify option
                            if (i < shopifyOptions.length && shopifyOptions[i].optionValues && j < shopifyOptions[i].optionValues.length) {
                                const shopifyOptionValue = shopifyOptions[i].optionValues[j];
                                shopifyOptionValueId = shopifyOptionValue.id;

                                logger.info(`Found Shopify option value ID: ${shopifyOptionValue.id} for local option value ${localOptionValue.id}`);
                            }

                            // Get current shopifyOptionValueIds or initialize as empty object
                            let currentOptionValueIds = localOptionValue.shopifyOptionValueIds || {};

                            // Ensure currentOptionValueIds is a proper object, not a string representation
                            if (typeof currentOptionValueIds === 'string') {
                                try {
                                    currentOptionValueIds = JSON.parse(currentOptionValueIds);
                                } catch (parseError) {
                                    logger.warn(`Failed to parse shopifyOptionValueIds for option value ${localOptionValue.id}, initializing as empty object`);
                                    currentOptionValueIds = {};
                                }
                            }

                            // Update the specific store's option value ID
                            if (effectiveStoreId) {
                                currentOptionValueIds[effectiveStoreId] = shopifyOptionValueId;
                            }

                            await db.ProductOptionValue.update(
                                { shopifyOptionValueIds: currentOptionValueIds },
                                { where: { id: localOptionValue.id }, transaction }
                            );

                            logger.info(`Updated local option value ${localOptionValue.id} with Shopify option value IDs:`, JSON.stringify(currentOptionValueIds));
                        }
                    }

                    // If there are no options, ensure empty arrays are saved
                    if (localProductOptions.length === 0) {
                        logger.info(`No options found for product ${productId}, ensuring empty arrays are saved if needed`);
                    }
                }
            } catch (optionError) {
                logger.error('Failed to fetch and save Shopify option IDs:', optionError);
                // Don't fail the sync process if option ID mapping fails
            }
        }

        // Handle inventory setup using location ID for each store
        for (const storeResult of results) {
            if (!storeResult.success) continue;

            const effectiveStoreId = storeResult.storeId;
            const effectiveLocationId = storeResult.locationId;

            const store = await db.Store.findByPk(effectiveStoreId);
            if (!store || !store.shopifyDomain || !store.shopifyAccessToken) {
                logger.warn(`Skipping inventory setup for store ${effectiveStoreId} - no credentials`);
                continue;
            }

            const shopifyConfig = {
                shopDomain: store.shopifyDomain,
                accessToken: store.shopifyAccessToken,
                locationId: effectiveLocationId || null,
            };

            if (shopifyConfig.locationId) {
                // Get locations - specific location if provided, otherwise all active locations
                let locationsToUse = [];
                const locationIdToUse = shopifyConfig.locationId;

                if (locationIdToUse) {
                    // Use specific location if provided
                    const allLocations = await getLocations(shopifyConfig.shopDomain, shopifyConfig.accessToken);
                    const specificLocation = allLocations.find(loc => loc.id === locationIdToUse);
                    if (specificLocation) {
                        locationsToUse = [specificLocation];
                        logger.info(`Using specific location: ${specificLocation.name} (${specificLocation.id})`);
                    } else {
                        logger.warn(`Specified location ID ${locationIdToUse} not found, using all active locations`);
                        locationsToUse = await getLocations(shopifyConfig.shopDomain, shopifyConfig.accessToken);
                    }
                } else {
                    // Use all active locations
                    logger.info(`No location ID provided, using all active locations`);
                    locationsToUse = await getLocations(shopifyConfig.shopDomain, shopifyConfig.accessToken);
                }

                logger.info(`Found ${locationsToUse.length} locations to process for store ${effectiveStoreId}`);

                // Get the shopify result for this specific store
                const shopifyResultForStore = shopifyResultsByStore[effectiveStoreId];

                // For each variant with stock quantity
                for (const variant of product.variants) {
                    // Get the store-specific SKU for this variant from storeSpecificSKUs
                    let currentSKUs = variant.storeSpecificSKUs || {};
                    if (typeof currentSKUs === 'string') {
                        try {
                            currentSKUs = JSON.parse(currentSKUs);
                        } catch (parseError) {
                            logger.warn(`Failed to parse storeSpecificSKUs for variant ${variant.id}, using empty object`);
                            currentSKUs = {};
                        }
                    }

                    const storeSpecificSKU = currentSKUs[effectiveStoreId];
                    // Get the inventory item ID for this variant from the store-specific result
                    const inventoryItemId = shopifyResultForStore?.inventoryItemIdMap?.[storeSpecificSKU] || null;

                    if (variant.stockQuantity > 0 && inventoryItemId) {
                        logger.info(`Processing inventory for variant: ${storeSpecificSKU} in store ${effectiveStoreId}`);

                        // Enable inventory tracking
                        try {
                            await enableInventoryTracking(
                                shopifyConfig.shopDomain,
                                shopifyConfig.accessToken,
                                inventoryItemId
                            );
                            logger.info(`✓ Enabled tracking for ${storeSpecificSKU} in store ${effectiveStoreId}`);
                        } catch (trackingError) {
                            logger.error(`✗ Failed to enable tracking for ${storeSpecificSKU} in store ${effectiveStoreId}:`, trackingError.message);
                            continue; // Skip this variant if tracking fails
                        }

                        // Activate at location and set quantity for each location
                        for (const location of locationsToUse) {
                            try {
                                // Activate inventory at this location
                                await activateInventoryAtLocation(
                                    shopifyConfig.shopDomain,
                                    shopifyConfig.accessToken,
                                    inventoryItemId,
                                    location.id
                                );
                                logger.info(`✓ Activated at ${location.name} in store ${effectiveStoreId}`);

                                // Set the quantity
                                await setInventoryQuantities(
                                    shopifyConfig.shopDomain,
                                    shopifyConfig.accessToken,
                                    inventoryItemId,
                                    location.id,
                                    variant.stockQuantity
                                );
                                logger.info(`✓ Set quantity ${variant.stockQuantity} for ${storeSpecificSKU} at ${location.name} in store ${effectiveStoreId}`);

                                // Save location-specific stock information to database
                                try {
                                    await db.ProductLocation.create({
                                        productId: product.id,
                                        variantId: variant.id,
                                        variantSku: storeSpecificSKU,
                                        locationId: location.id,
                                        locationName: location.name,
                                        stockQuantity: variant.stockQuantity,
                                        storeId: effectiveStoreId // Include storeId for multi-store tracking
                                    }, { transaction });
                                    logger.info(`Saved location stock info for ${storeSpecificSKU} at ${location.name} in store ${effectiveStoreId}`);
                                } catch (dbError) {
                                    logger.error(`Failed to save location stock info for ${storeSpecificSKU} at ${location.name} in store ${effectiveStoreId}:`, dbError.message);
                                }
                            } catch (locationError) {
                                logger.error(`✗ Failed for ${storeSpecificSKU} at ${location.name} in store ${effectiveStoreId}:`, locationError.message);
                                // Continue with other locations even if one fails
                            }
                        }
                    }
                }
            }
        }

        // Commit transaction
        await transaction.commit();

        // Return synced product details
        const syncedProduct = await db.Product.findByPk(productId, {
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

        logger.info(`Product sync completed successfully: ${productId}`);
        return syncedProduct;
    } catch (error) {
        await transaction.rollback();
        logger.error('Product sync to Shopify failed:', error);

        // Update sync status to failed
        try {
            const product = await db.Product.findByPk(productId);

            // Prepare update data
            const updateData = {
                syncStatus: 'failed',
                syncError: error.message.substring(0, 2000),
                syncCompletedAt: new Date(),
            };

            // If we have effectiveStores, update multi-store sync tracking
            if (typeof effectiveStores !== 'undefined' && effectiveStores && effectiveStores.length > 0) {
                for (const storeConfig of effectiveStores) {
                    const effectiveStoreId = storeConfig.storeId;

                    // Update syncStatuses map
                    let currentSyncStatuses = product.syncStatuses || {};
                    // Ensure it's a proper object, not a string representation
                    if (typeof currentSyncStatuses === 'string') {
                        try {
                            currentSyncStatuses = JSON.parse(currentSyncStatuses);
                        } catch (parseError) {
                            logger.warn(`Failed to parse syncStatuses for product ${productId}, initializing as empty object`);
                            currentSyncStatuses = {};
                        }
                    }
                    currentSyncStatuses[effectiveStoreId] = 'failed';
                    updateData.syncStatuses = currentSyncStatuses;

                    // Update syncErrors map
                    let currentSyncErrors = product.syncErrors || {};
                    // Ensure it's a proper object, not a string representation
                    if (typeof currentSyncErrors === 'string') {
                        try {
                            currentSyncErrors = JSON.parse(currentSyncErrors);
                        } catch (parseError) {
                            logger.warn(`Failed to parse syncErrors for product ${productId}, initializing as empty object`);
                            currentSyncErrors = {};
                        }
                    }
                    currentSyncErrors[effectiveStoreId] = error.message.substring(0, 2000);
                    updateData.syncErrors = currentSyncErrors;
                }
            } else {
                // If effectiveStores is not defined or empty, try to get storeId from the product
                if (product && product.storeId) {
                    const effectiveStoreId = product.storeId;

                    // Update syncStatuses map
                    let currentSyncStatuses = product.syncStatuses || {};
                    // Ensure it's a proper object, not a string representation
                    if (typeof currentSyncStatuses === 'string') {
                        try {
                            currentSyncStatuses = JSON.parse(currentSyncStatuses);
                        } catch (parseError) {
                            logger.warn(`Failed to parse syncStatuses for product ${productId}, initializing as empty object`);
                            currentSyncStatuses = {};
                        }
                    }
                    currentSyncStatuses[effectiveStoreId] = 'failed';
                    updateData.syncStatuses = currentSyncStatuses;

                    // Update syncErrors map
                    let currentSyncErrors = product.syncErrors || {};
                    // Ensure it's a proper object, not a string representation
                    if (typeof currentSyncErrors === 'string') {
                        try {
                            currentSyncErrors = JSON.parse(currentSyncErrors);
                        } catch (parseError) {
                            logger.warn(`Failed to parse syncErrors for product ${productId}, initializing as empty object`);
                            currentSyncErrors = {};
                        }
                    }
                    currentSyncErrors[effectiveStoreId] = error.message.substring(0, 2000);
                    updateData.syncErrors = currentSyncErrors;
                }
            }

            await db.Product.update(
                updateData,
                {
                    where: { id: productId },
                }
            );
        } catch (updateError) {
            logger.error('Failed to update sync status to failed:', updateError);
        }

        throw error;
    }
};

module.exports = {
    bulkSyncProductsToShopifyService,
};