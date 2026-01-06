const {
    createProductType,
    getProductType,
    getProductTypeById,
    updateProductType
} = require('../../services/Product/ProductTypeService');
const AppError = require('../../utils/AppError');


const createProductTypeController = async (req, res, next) => {
    try {
        const { name, category } = req.body;
        if(!name || !category){
            throw new AppError("Name and category are required", 400)
        }
        const productType = await createProductType(name, category);
        return res.status(201).json({success: true, message: "Product type added successfully", data: productType});
    } catch (error) {
        console.error(error);
        next(error);
    }
}

const getProductTypeController = async (req, res, next) => {
    try {
        const productType = await getProductType();
        return res.status(200).json({success: true, message: "Product type fetched successfully", data: productType});
    } catch (error) {
        console.error(error);
        next(error);
    }
}


const getProductTypeByIdController = async (req, res, next) => {
    try {
        const { id } = req.params;
        const productType = await getProductTypeById(id);
        return res.status(200).json({success: true, message: "Product type fetched successfully", data: productType});
    } catch (error) {
        console.error(error);
        next(error);
    }
}

const updateProductTypeController = async (req, res, next) => {
    try {
        const { id } = req.params;
        const { name, category } = req.body;
        const productType = await updateProductType(id, name, category);
        return res.status(200).json({success: true, message: "Product type updated successfully", data: productType});
    } catch (error) {
        console.error(error);
        next(error);
    }
}


module.exports = {
    createProductTypeController,
    getProductTypeController,
    getProductTypeByIdController,
    updateProductTypeController
}
