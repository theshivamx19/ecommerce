const express = require('express');
const { productScrapController } = require('../../controllers/Scrap/ProductScrapController')
const readCsvProducts = require('../../controllers/Scrap/ScrapCsvProductsController')
const auth = require('../../middlewares/auth');
const upload = require('../../middlewares/multerConfig');

const router = express.Router();


router.post('/scrap-image', auth(['admin', 'manager', 'member']), productScrapController);
router.post('/scrap-csv', auth(['admin', 'manager', 'member']), upload.single('file'), readCsvProducts);



module.exports = router;