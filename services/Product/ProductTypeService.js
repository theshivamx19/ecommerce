const db = require('../../models/index')

const createProductType = async (name, category) => {
    try {
        const productType = await db.ProductType.create({ name, category });
        return productType;
    } catch (error) {
        console.error(error);
        throw error;
    }
}

const getProductType = async () => {
    try {
        const productType = await db.ProductType.findAll();
        if(productType.length <= 0){
            throw new AppError("Product type not found", 404)
        }
        return productType;
    } catch (error) {
        console.error(error);
        throw error;
    }
}


const getProductTypeById = async (id) => {
    try {
        const productType = await db.ProductType.findByPk(id);
        if(!productType){
            throw new AppError("Product type not found", 404)
        }
        return productType;
    } catch (error) {
        console.error(error);
        throw error;
    }
}

const updateProductType = async (id, name, category) => {
    try {
        const productType = await db.ProductType.update({ name, category }, { where: { id } });
        return productType;
    } catch (error) {
        console.error(error);
        throw error;
    }
}

module.exports ={
    createProductType,
    getProductType,
    getProductTypeById,
    updateProductType
}