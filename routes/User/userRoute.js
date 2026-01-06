const express = require('express');
const auth = require('../../middlewares/auth');
const { getAllUsersController } = require('../../controllers/User/UserController');

const router = express.Router();

router.get('/users', auth(['admin', 'manager', 'member']), getAllUsersController);


module.exports = router;
