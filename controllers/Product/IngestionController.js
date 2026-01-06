const { createProduct } = require("../../services/Product/ProductService");
const { createMultipleProductImages } = require("../../services/Image/ImageService");
const { createMultipleVariants } = require("../../services/Product/ProductVariantService");
const { v4: uuidv4 } = require('uuid');
const AppError = require('../../utils/AppError');
const logger = require('../../utils/logger');

const ingestProductController = async (req, res, next) => {
    try {
        const userId = req.userId;
        const files = req.files;

        // 1. Extract and Parse Data
        const {
            title,
            description,
            productType,
            vendor,
            flowId,
            tags,
            variants: variantsJson,
            status
        } = req.body;
        console.log(variantsJson)
        if (!title || !productType) {
            throw new AppError("Title and Product Type are required", 400);
        }

        // Parse JSON fields
        let variants = [];
        try {
            if (variantsJson) variants = JSON.parse(variantsJson);
        } catch (e) {
            throw new AppError("Invalid variants JSON format", 400);
        }

        let parsedTags = [];
        try {
            if (tags) parsedTags = JSON.parse(tags);
        } catch (e) {
            // If tags is just a string, maybe split it? Or just ignore. 
            // Assuming it comes as JSON array string or just array if handled by body parser (but multipart usually sends strings)
            if (typeof tags === 'string') parsedTags = [tags];
        }

        // 2. Create Product
        const uniqueReferenceCode = uuidv4();
        const productData = {
            uniqueReferenceCode,
            flowId: flowId || null,
            title,
            description: description || '',
            productType,
            vendor: vendor || null,
            tags: parsedTags,
            status: status || 'draft',
            createdBy: userId,
            isEnriched: false
        };

        const product = await createProduct(productData);
        logger.info(`Product created: ${product.id}`);

        // 3. Handle Images
        if (files && files.length > 0) {
            const protocol = req.protocol;
            const host = req.get('host');
            const baseUrl = `${protocol}://${host}`;

            const imagesData = files.map((file, index) => ({
                productId: product.id,
                originalUrl: `${baseUrl}/uploads/products/${file.filename}`,
                displayOrder: index + 1,
                isPrimary: index === 0,
                altText: title // Default alt text
            }));

            await createMultipleProductImages(imagesData);
            logger.info(`Linked ${files.length} images to product ${product.id}`);
        }

        // 4. Handle Variants
        if (variants.length > 0) {
            const variantsData = variants.map(v => ({
                ...v,
                productId: product.id
            }));
            await createMultipleVariants(variantsData);
            logger.info(`Created ${variants.length} variants for product ${product.id}`);
        }

        res.status(201).json({
            success: true,
            message: "Product ingested successfully",
            data: {
                productId: product.id,
                referenceCode: uniqueReferenceCode
            }
        });

    } catch (error) {
        console.error("Ingestion Error:", error);
        next(error);
    }
};

module.exports = { ingestProductController };
