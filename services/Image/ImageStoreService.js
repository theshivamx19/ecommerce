const db = require('../../models/index.js')



const createImageStoreService = async (imageStoreData) => {
    try {
        const result = await db.ImageStore.bulkCreate(imageStoreData);
        return result;
    } catch (error) {
        throw error;
    }
}

const getAllStoreImagesService = async (storedId) => {
    try {
        const result = await db.ImageStore.findAll({ where: { storeId: storedId } });
        return result;
    } catch (error) {
        throw error;
    }
}

module.exports = {
    createImageStoreService,
    getAllStoreImagesService
}