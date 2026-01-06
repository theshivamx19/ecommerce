const express = require('express');
const scrapRoute = require('./scrapRoute');
const router = express.Router();

router.use('/', scrapRoute);

module.exports = router;