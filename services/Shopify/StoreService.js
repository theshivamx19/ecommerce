const AppError = require('../../utils/AppError');
const db = require('../../models/index');
const logger = require('../../utils/logger');


const getAllStores = async () => {
    const stores = await db.Store.findAll({
        attributes: ['id', 'storeName', 'shopifyDomain', 'storeCode', 'isActive', 'installedAt', 'storeCategory', 'createdAt'],
        order: [['createdAt', 'DESC']]
    });
    return stores
};

const getStoreDetails = async (id) => {
    const store = await db.Store.findByPk(id, {
        attributes: ['id', 'storeName', 'shopifyDomain', 'storeCode', 'isActive', 'installedAt', 'storeCategory', 'createdAt'],
        include: [
            {
                model: ProductSync,
                as: 'syncs',
                attributes: ['syncStatus']
            }
        ]
    });

    if (!store) {
        throw new AppError('Store not found', 404);
    }
    // Calculate sync statistics
    const syncStats = {
        total: store.syncs.length,
        synced: store.syncs.filter(s => s.syncStatus === 'synced').length,
        pending: store.syncs.filter(s => s.syncStatus === 'pending').length,
        failed: store.syncs.filter(s => s.syncStatus === 'failed').length,
        outOfSync: store.syncs.filter(s => s.syncStatus === 'out_of_sync').length
    };

    const data = {
        id: store.id,
        shopDomain: store.shopDomain,
        isInstalled: store.isInstalled,
        installedAt: store.installedAt,
        createdAt: store.createdAt,
        syncStats
    }
    return data;
};



const updateStoreDetailsById = async (id, data) => {
    const store = await db.Store.findByPk(id);
    if (!store) {
        throw new AppError('Store not found', 404);
    }
    const updatedStore = await store.update(data);
    return updatedStore;
}



const createOrUpdateExistingStore = async (shop, accessToken) => {
    const store = await db.Store.upsert({
        storeName: shop,
        shopifyDomain: shop,
        shopifyAccessToken: accessToken,
        // market: "ABC",
        // storeCategory: "Test Category",
        installedAt: new Date(),
        isActive: true
    });
    return store;
}


const getAllActiveStores = async () => {
    const stores = await db.Store.findAll({
        where: { isActive: true },
        include: [
            {
                model: db.Market,
                as: 'market',
                attributes: ['id', 'country', 'countryCode', 'percentage', 'sign']
            }
        ],
        attributes: ['id', 'storeName', 'shopifyDomain', 'storeCode', 'isActive', 'installedAt', 'storeCategory', 'createdAt'],
        order: [['createdAt', 'DESC']]
    });
    return stores;
}


const deleteStore = async (id) => {
    const store = await db.Store.findByPk(id);
    if (!store) {
        throw new AppError('Store not found', 404);
    }
    // await db.ProductSync.destroy({
    //     where: { storeId: id }
    // });
    logger.info(`Store deleted successfully: ${id}`);
    await store.destroy();
    return true;
};

module.exports = {
    getAllStores,
    getStoreDetails,
    deleteStore,
    createOrUpdateExistingStore,
    getAllActiveStores,
    updateStoreDetailsById
};
