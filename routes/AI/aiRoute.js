const express = require('express');
const imageToTextController = require('../../controllers/AI/ImageToTextController');
const {enrichProductController} = require('../../controllers/AI/ProductEnrichmentController');
const auth = require('../../middlewares/auth');
const upload = require('../../middlewares/uploadMiddleware');

const router = express.Router();

router.post('/image-to-text', auth(['admin', 'manager', 'member']), upload.array('images', 10), imageToTextController);
router.post('/enrich-product', auth(['admin', 'manager', 'member']), upload.array('images', 10), enrichProductController);

module.exports = router;