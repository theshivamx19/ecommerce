const db = require('../../models/index');



const getAllActiveStores = async () => {
    const stores = await db.Store.findAll({ where: { isActive: true } });
    return stores;
}

const getStoreDetails = async (storeId) => {
    const store = await db.Store.findOne({ where: { id: storeId } });
    return store;
}

module.exports ={
    getStoreDetails,
    getAllActiveStores
}