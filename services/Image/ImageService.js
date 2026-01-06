const db = require('../../models/index.js');
const AppError = require('../../utils/AppError');

// Create a single product image
const createProductImage = async (imageData) => {
    return await db.ProductImage.create(imageData);
};


// Create multiple product images
const createMultipleProductImages = async (imagesData, transaction = null) => {
    console.log(imagesData)
    return await db.ProductImage.bulkCreate(imagesData, { transaction });
};

// Get all images for a product
const getProductImages = async (productId) => {
    return await db.ProductImage.findAll({
        where: { productId },
        order: [['displayOrder', 'ASC'], ['isPrimary', 'DESC']]
    });
};

// Get primary image for a product
const getPrimaryProductImage = async (productId) => {
    return await db.ProductImage.findOne({
        where: { productId, isPrimary: true }
    });
};

// Update product image
const updateProductImage = async (imageId, updateData) => {
    const image = await db.ProductImage.findByPk(imageId);
    if (!image) {
        throw new AppError('Image not found', 404);
    }
    return await image.update(updateData);
};

// Delete product image
const deleteProductImage = async (imageId) => {
    const image = await db.ProductImage.findByPk(imageId);
    if (!image) {
        throw new AppError('Image not found', 404);
    }
    return await image.destroy();
};

module.exports = {
    createProductImage,
    createMultipleProductImages,
    getProductImages,
    getPrimaryProductImage,
    updateProductImage,
    deleteProductImage
};
