const express = require('express');
const productRoute = require('./productRoute');
const productTypeRoute = require('./productTypeRoute');

const router = express.Router();

router.use('/', productRoute);
router.use('/productType', productTypeRoute);


module.exports = router;
