const {
    createMultipleProductImages,
    getProductImages,
    updateProductImage,
    deleteProductImage
} = require("../../services/Image/ImageService");

const { createImageStoreService } = require("../../services/Image/ImageStoreService");
const AppError = require("../../utils/AppError");
const logger = require("../../utils/logger");

/**
 * Upload multiple images for a product
 * Expects: productId in body, multiple files in req.files
 */
const uploadProductImagesController = async (req, res, next) => {
    try {
        const { storeId, altText } = req.body;
        const files = req.files;

        // Validate input
        if (!storeId) {
            throw new AppError("Store ID is required", 400);
        }

        if (!files || files.length === 0) {
            throw new AppError("Please provide at least one image", 400);
        }

        // Parse altTexts if provided (should be JSON array)
        let parsedAltTexts = [];
        if (altText) {
            try {
                parsedAltTexts = JSON.parse(altText);
            } catch (error) {
                logger.warn("Failed to parse altTexts, using empty array");
            }
        }

        // Get base URL from request
        const protocol = req.protocol; // http or https
        const host = req.get('host'); // localhost:8000
        const baseUrl = `${protocol}://${host}`;

        // Prepare image data for bulk insert
        // const imagesData = files.map((file, index) => ({
        //     storeId: parseInt(storeId),
        //     imageUrl: `${baseUrl}/uploads/products/${file.filename}`,
        //     // enhancedUrl: null, // Can be updated later after image enhancement
        //     // displayOrder: index + 1,
        //     altText: parsedAltTexts[index] || `Product image ${index + 1}`,
        //     // isPrimary: index === 0 // First image is primary by default
        // }));

        const imagesData = files.map((img, index) =>{
            return {
                imageUrl: img?.location,
                storeId: parseInt(storeId),
                altText: parsedAltTexts[index] || `Product image ${index + 1}`,
            }
        })
        // Create all images in database
        // const result = await createImageStoreService(imagesData);

        logger.info(`Uploaded ${files.length} images for product ${storeId}`);

        res.status(201).json({
            success: true,
            message: `${files.length} image(s) uploaded successfully`,
            // data: result,
            data: imagesData
        });
    } catch (error) {
        next(error);
    }
};

/**
 * Get all images for a specific product
 */
const getProductImagesController = async (req, res, next) => {
    try {
        const { productId } = req.params;

        if (!productId) {
            throw new AppError("Product ID is required", 400);
        }

        const images = await getProductImages(parseInt(productId));

        res.status(200).json({
            success: true,
            message: "Product images retrieved successfully",
            data: images,
        });
    } catch (error) {
        next(error);
    }
};

/**
 * Update image metadata (altText, displayOrder, isPrimary, enhancedUrl)
 */
const updateProductImageController = async (req, res, next) => {
    try {
        const { imageId } = req.params;
        const { altText, displayOrder, isPrimary, enhancedUrl } = req.body;

        if (!imageId) {
            throw new AppError("Image ID is required", 400);
        }

        const updateData = {};
        if (altText !== undefined) updateData.altText = altText;
        if (displayOrder !== undefined) updateData.displayOrder = displayOrder;
        if (isPrimary !== undefined) updateData.isPrimary = isPrimary;
        if (enhancedUrl !== undefined) updateData.enhancedUrl = enhancedUrl;

        const result = await updateProductImage(parseInt(imageId), updateData);

        logger.info(`Updated image ${imageId}`);

        res.status(200).json({
            success: true,
            message: "Image updated successfully",
            data: result,
        });
    } catch (error) {
        next(error);
    }
};

/**
 * Delete a product image
 */
const deleteProductImageController = async (req, res, next) => {
    try {
        const { imageId } = req.params;

        if (!imageId) {
            throw new AppError("Image ID is required", 400);
        }

        await deleteProductImage(parseInt(imageId));

        logger.info(`Deleted image ${imageId}`);

        res.status(200).json({
            success: true,
            message: "Image deleted successfully",
        });
    } catch (error) {
        next(error);
    }
};

module.exports = {
    uploadProductImagesController,
    getProductImagesController,
    updateProductImageController,
    deleteProductImageController
};