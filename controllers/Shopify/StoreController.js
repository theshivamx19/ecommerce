const {
    getAllActiveStores,
    getStoreDetails,
    deleteStore,
    updateStoreDetailsById
} = require('../../services/Shopify/StoreService');


/**
 * GET /api/stores
 * Get all connected stores
 */
const getAllActiveStoresController = async (req, res, next) => {
    try {
        const stores = await getAllActiveStores();
        return res.status(200).json({
            success: true,
            count: stores.length,
            stores
        });
    } catch (error) {
        console.error('Error fetching stores:', error);
        next(error);
    }
};

/**
 * GET /api/stores/:id
 * Get store details with sync statistics
 */
const getStoreDetailsController = async (req, res, next) => {
    try {
        const store = await getStoreDetails(req.params.id);
        return res.status(200).json({
            success: true,
            store
        });
    } catch (error) {
        console.error('Error fetching store:', error);
        next(error)
    }
};

/**
 * DELETE /api/stores/:id
 * Remove a store connection
 */
const deleteStoreController = async (req, res, next) => {
    try {
        const store = await deleteStore(req.params.id)

        return res.status(200).json({
            success: true,
            message: 'Store removed successfully'
        });
    } catch (error) {
        console.error('Error removing store:', error);
        next(error);
    }
};

/**
 * PUT /api/stores/:id
 * Update store details
 */
const updateStoreController = async (req, res, next) => {
    const storeId = req.params.id;
    if (!storeId) {
        return res.status(400).json({
            success: false,
            message: 'No store ID provided'
        });
    }
    const { storeName, storeCategory, storeCode } = req?.body;
    if (!storeName && !storeCategory && !storeCode) {
        return res.status(400).json({
            success: false,
            message: 'No data provided'
        });
    }
    const data = {
        storeName,
        storeCategory, 
        storeCode,
    } 
    try {
        const store = await updateStoreDetailsById(storeId, data)

        return res.status(200).json({
            success: true,
            message: 'Store updated successfully'
        });
    } catch (error) {
        console.error('Error updating store:', error);
        next(error);
    }
};

module.exports = {
    getAllActiveStoresController,
    getStoreDetailsController,
    deleteStoreController,
    updateStoreController
}
