const express = require('express');
const aiRoute = require('./aiRoute');

const router = express.Router();

router.use('/', aiRoute);

module.exports = router;