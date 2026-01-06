const express = require('express');
const {
    uploadProductImagesController,
    getProductImagesController,
    updateProductImageController,
    deleteProductImageController
} = require('../../controllers/Image/ImageController');
const auth = require('../../middlewares/auth');
// const upload = require('../../middlewares/multerConfig');
const upload = require('../../middlewares/uploadMiddleware');
const { getAllStoreImagesController } = require('../../controllers/Image/ImageStoreController');

const router = express.Router();


router.post('/upload', auth(['admin', 'manager', 'member']), upload.array('images', 10), uploadProductImagesController);
router.get('/store/:storeId', auth(['admin', 'manager', 'member']), getAllStoreImagesController);

router.get('/product/:productId', auth(['admin', 'manager', 'member']), getProductImagesController);
router.patch('/:imageId', auth(['admin', 'manager', 'member']), updateProductImageController);
router.delete('/:imageId', auth(['admin', 'manager']), deleteProductImageController);

module.exports = router;
