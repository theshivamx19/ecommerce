const express = require('express');
const imageRoute = require('./imageRoute');

const router = express.Router();

router.use('/', imageRoute);

module.exports = router;
