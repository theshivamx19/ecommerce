const db = require("../../models/index.js");
const { deleteShopifyVariant } = require("../Shopify/ShopifyGraphqlService.js");
const { updateShopifyProduct } = require("../Shopify/ShopifyGraphqlService.js");
const AppError = require("../../utils/AppError.js");
const logger = require("../../utils/logger.js");

/**
 * Handle zero inventory deletion for a variant
 * Deletes the variant from ALL Shopify stores where it exists
 * If it's the last variant, archives the product instead
 * 
 * @param {number} variantId - Local variant ID
 * @returns {object} - Deletion result
 */
const handleZeroInventoryDeletion = async (variantId) => {
    const transaction = await db.sequelize.transaction();

    try {
        logger.info(`Starting zero inventory deletion check for variant ${variantId}`);

        // 1. Fetch the variant with product details
        const variant = await db.ProductVariant.findByPk(variantId, {
            include: [
                {
                    model: db.Product,
                    as: "product",
                },
            ],
            transaction,
        });

        if (!variant) {
            throw new AppError(`Variant ${variantId} not found`, 404);
        }

        const product = variant.product;

        if (!product) {
            throw new AppError(`Product not found for variant ${variantId}`, 404);
        }

        logger.info(`Variant ${variantId} belongs to product ${product.id} (${product.title})`);

        // 2. Check if this is the last variant of the product
        const variantCount = await db.ProductVariant.count({
            where: { productId: product.id },
            transaction,
        });

        logger.info(`Product ${product.id} has ${variantCount} variant(s)`);

        // 3. If last variant, archive the product instead of deleting
        if (variantCount === 1) {
            logger.warn(`Variant ${variantId} is the LAST variant of product ${product.id}. Archiving product instead of deleting.`);

            // Get all stores this product is synced to
            const shopifyProductIds = variant.product.shopifyProductIds || {};
            const storeIds = Object.keys(shopifyProductIds);

            if (storeIds.length === 0) {
                logger.info(`Product ${product.id} is not synced to any stores. Skipping archive.`);
                await transaction.commit();
                return {
                    success: true,
                    action: "skipped",
                    reason: "Product not synced to any stores",
                    variantId,
                    productId: product.id,
                };
            }

            // Archive product on all stores
            const archiveResults = [];
            for (const storeId of storeIds) {
                try {
                    const store = await db.Store.findByPk(storeId);
                    if (!store) {
                        logger.warn(`Store ${storeId} not found, skipping`);
                        continue;
                    }

                    const shopifyProductId = shopifyProductIds[storeId];
                    if (!shopifyProductId) {
                        logger.warn(`No Shopify product ID for store ${storeId}, skipping`);
                        continue;
                    }

                    logger.info(`Archiving product ${shopifyProductId} on store ${storeId} (${store.storeName})`);

                    // Update product status to DRAFT (archived)
                    const archiveResult = await updateShopifyProduct(
                        store.shopifyDomain,
                        store.shopifyAccessToken,
                        shopifyProductId,
                        { status: "DRAFT" }
                    );

                    archiveResults.push({
                        storeId,
                        storeName: store.storeName,
                        success: true,
                        shopifyProductId,
                    });

                    logger.info(`✓ Archived product on store ${store.storeName}`);
                } catch (error) {
                    logger.error(`Failed to archive product on store ${storeId}: ${error.message}`);
                    archiveResults.push({
                        storeId,
                        success: false,
                        error: error.message,
                    });
                }
            }

            // Update local product status
            await db.Product.update(
                { status: "draft" },
                { where: { id: product.id }, transaction }
            );

            await transaction.commit();

            return {
                success: true,
                action: "archived_product",
                reason: "Last variant - archived product instead of deleting",
                variantId,
                productId: product.id,
                archiveResults,
            };
        }

        // 4. Not the last variant - proceed with deletion from all stores
        logger.info(`Proceeding with variant deletion (not the last variant)`);

        // Get shopifyVariantIds JSON field
        const shopifyVariantIds = variant.shopifyVariantIds || {};
        const storeIds = Object.keys(shopifyVariantIds);

        if (storeIds.length === 0) {
            logger.info(`Variant ${variantId} is not synced to any stores. Deleting from local DB only.`);

            // Delete from local database
            await db.ProductVariant.destroy({
                where: { id: variantId },
                transaction,
            });

            await transaction.commit();

            return {
                success: true,
                action: "deleted_local_only",
                reason: "Variant not synced to any stores",
                variantId,
                deletedFromStores: [],
            };
        }

        logger.info(`Variant ${variantId} exists in ${storeIds.length} store(s): ${storeIds.join(", ")}`);

        // 5. Delete from each Shopify store
        const deletionResults = [];
        for (const storeId of storeIds) {
            try {
                const store = await db.Store.findByPk(storeId);
                if (!store) {
                    logger.warn(`Store ${storeId} not found, skipping`);
                    deletionResults.push({
                        storeId,
                        success: false,
                        error: "Store not found",
                    });
                    continue;
                }

                const shopifyVariantId = shopifyVariantIds[storeId];
                if (!shopifyVariantId) {
                    logger.warn(`No Shopify variant ID for store ${storeId}, skipping`);
                    deletionResults.push({
                        storeId,
                        storeName: store.storeName,
                        success: false,
                        error: "No Shopify variant ID",
                    });
                    continue;
                }

                logger.info(`Deleting variant ${shopifyVariantId} from store ${storeId} (${store.storeName})`);

                // Call Shopify API to delete variant
                const deleteResult = await deleteShopifyVariant(
                    store.shopifyDomain,
                    store.shopifyAccessToken,
                    shopifyVariantId
                );

                deletionResults.push({
                    storeId,
                    storeName: store.storeName,
                    success: true,
                    deletedShopifyVariantId: deleteResult.deletedProductVariantId,
                });

                logger.info(`✓ Deleted variant from store ${store.storeName}`);
            } catch (error) {
                logger.error(`Failed to delete variant from store ${storeId}: ${error.message}`);
                deletionResults.push({
                    storeId,
                    success: false,
                    error: error.message,
                });
            }
        }

        // 6. Delete from local database (hard delete as per user requirement)
        logger.info(`Deleting variant ${variantId} from local database`);
        await db.ProductVariant.destroy({
            where: { id: variantId },
            transaction,
        });

        await transaction.commit();

        logger.info(`✓ Successfully completed deletion process for variant ${variantId}`);

        return {
            success: true,
            action: "deleted",
            variantId,
            productId: product.id,
            deletedFromStores: deletionResults,
            deletedFromLocalDB: true,
        };
    } catch (error) {
        await transaction.rollback();
        logger.error(`Error in handleZeroInventoryDeletion for variant ${variantId}:`, error);
        throw error;
    }
};

/**
 * Check if a variant should be deleted based on stock quantity
 * This is called after inventory updates
 * 
 * @param {number} variantId - Local variant ID
 * @param {number} newStockQuantity - New stock quantity
 * @param {object} variantSnapshot - Optional pre-fetched variant object (to avoid re-fetch)
 * @returns {object|null} - Deletion result or null if no deletion needed
 */
const checkAndDeleteIfZeroInventory = async (variantId, newStockQuantity, variantSnapshot = null) => {
    try {
        // Only trigger deletion if stock is exactly 0
        if (newStockQuantity !== 0) {
            return null;
        }

        logger.info(`Variant ${variantId} stock reached 0. Triggering auto-deletion.`);

        // Use snapshot if provided, otherwise fetch
        if (variantSnapshot) {
            return await handleZeroInventoryDeletionWithSnapshot(variantSnapshot);
        } else {
            return await handleZeroInventoryDeletion(variantId);
        }
    } catch (error) {
        logger.error(`Error in checkAndDeleteIfZeroInventory for variant ${variantId}:`, error);
        // Don't throw - we don't want to break the update flow
        return {
            success: false,
            error: error.message,
            variantId,
        };
    }
};

/**
 * Handle deletion using a pre-fetched variant snapshot
 * This avoids race conditions where variant might be deleted before we can fetch it
 */
const handleZeroInventoryDeletionWithSnapshot = async (variantSnapshot) => {
    const variantId = variantSnapshot.id;
    const transaction = await db.sequelize.transaction();

    try {
        logger.info(`Starting zero inventory deletion for variant ${variantId} (using snapshot)`);

        const product = variantSnapshot.product;

        if (!product) {
            throw new AppError(`Product not found for variant ${variantId}`, 404);
        }

        logger.info(`Variant ${variantId} belongs to product ${product.id} (${product.title})`);

        // Check if this is the last variant of the product
        const variantCount = await db.ProductVariant.count({
            where: { productId: product.id },
            transaction,
        });

        logger.info(`Product ${product.id} has ${variantCount} variant(s)`);

        // If last variant, archive the product instead of deleting
        if (variantCount === 1) {
            logger.warn(`Variant ${variantId} is the LAST variant of product ${product.id}. Archiving product instead of deleting.`);

            const shopifyProductIds = product.shopifyProductIds || {};
            const storeIds = Object.keys(shopifyProductIds);

            if (storeIds.length === 0) {
                await transaction.commit();
                return {
                    success: true,
                    action: "skipped",
                    reason: "Product not synced to any stores",
                    variantId,
                    productId: product.id,
                };
            }

            // Archive product on all stores
            const archiveResults = [];
            for (const storeId of storeIds) {
                try {
                    const store = await db.Store.findByPk(storeId);
                    if (!store) continue;

                    const shopifyProductId = shopifyProductIds[storeId];
                    if (!shopifyProductId) continue;

                    await updateShopifyProduct(
                        store.shopifyDomain,
                        store.shopifyAccessToken,
                        shopifyProductId,
                        { status: "DRAFT" }
                    );

                    archiveResults.push({
                        storeId,
                        storeName: store.storeName,
                        success: true,
                        shopifyProductId,
                    });
                } catch (error) {
                    logger.error(`Failed to archive product on store ${storeId}: ${error.message}`);
                    archiveResults.push({ storeId, success: false, error: error.message });
                }
            }

            await db.Product.update({ status: "draft" }, { where: { id: product.id }, transaction });
            await transaction.commit();

            return {
                success: true,
                action: "archived_product",
                reason: "Last variant - archived product instead of deleting",
                variantId,
                productId: product.id,
                archiveResults,
            };
        }

        // Not the last variant - proceed with deletion
        const shopifyVariantIds = variantSnapshot.shopifyVariantIds || {};
        const storeIds = Object.keys(shopifyVariantIds);

        if (storeIds.length === 0) {
            await db.ProductVariant.destroy({ where: { id: variantId }, transaction });
            await transaction.commit();
            return {
                success: true,
                action: "deleted_local_only",
                reason: "Variant not synced to any stores",
                variantId,
                deletedFromStores: [],
            };
        }

        // Delete from each Shopify store
        const deletionResults = [];
        for (const storeId of storeIds) {
            try {
                const store = await db.Store.findByPk(storeId);
                if (!store) {
                    deletionResults.push({ storeId, success: false, error: "Store not found" });
                    continue;
                }

                const shopifyVariantId = shopifyVariantIds[storeId];
                if (!shopifyVariantId) {
                    deletionResults.push({ storeId, storeName: store.storeName, success: false, error: "No Shopify variant ID" });
                    continue;
                }

                const deleteResult = await deleteShopifyVariant(
                    store.shopifyDomain,
                    store.shopifyAccessToken,
                    shopifyVariantId
                );

                deletionResults.push({
                    storeId,
                    storeName: store.storeName,
                    success: true,
                    deletedShopifyVariantId: deleteResult.deletedProductVariantId,
                });
            } catch (error) {
                logger.error(`Failed to delete variant from store ${storeId}: ${error.message}`);
                deletionResults.push({ storeId, success: false, error: error.message });
            }
        }

        // Delete from local database
        await db.ProductVariant.destroy({ where: { id: variantId }, transaction });
        await transaction.commit();

        return {
            success: true,
            action: "deleted",
            variantId,
            productId: product.id,
            deletedFromStores: deletionResults,
            deletedFromLocalDB: true,
        };
    } catch (error) {
        await transaction.rollback();
        logger.error(`Error in handleZeroInventoryDeletionWithSnapshot for variant ${variantId}:`, error);
        throw error;
    }
};

module.exports = {
    handleZeroInventoryDeletion,
    checkAndDeleteIfZeroInventory,
};
