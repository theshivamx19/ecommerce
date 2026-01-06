const express = require('express');

const {
    createProductTypeController,
    getProductTypeController,
    getProductTypeByIdController,
    updateProductTypeController
} = require('../../controllers/Product/ProductTypeController')
const auth = require('../../middlewares/auth')

const router = express.Router()

router.post('/create', auth(['admin']), createProductTypeController)
router.get('/get', auth(["admin"]), getProductTypeController)
router.get('/get/:id', auth(["admin"]), getProductTypeByIdController)
router.put('/update/:id', auth(["admin"]), updateProductTypeController)


module.exports = router;