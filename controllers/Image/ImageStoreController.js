const {getAllStoreImagesService} = require('../../services/Image/ImageStoreService')

const getAllStoreImagesController = async (req, res, next) => {
    try {
        const storeId = req.params.storeId;
        const result = await getAllStoreImagesService(storeId);
        res.status(200).json({
            success: true,
            data: result,
        });
    } catch (error) {
        console.error('Get all store images error:', error);
        next(error);
    }
}

module.exports = {
    getAllStoreImagesController
}
