const ProductEnrichmentService = require('../../services/AI/ProductEnrichmentService')


const enrichProductController = async (req, res) => {
    try {
        // const images = req.files;
        const { images, flowId } = req?.body;
        const result = await ProductEnrichmentService.enrichProductData({ images }, flowId);
        return res.status(200).json({
            success: true,
            message: 'Images enhanced successfully',
            data: result
        });
    } catch (error) {
        console.error('Error enhancing images:', error);
        return res.status(500).json({
            success: false,
            message: 'Failed to enhance images',
            error: error.message
        });
    }
};

module.exports = {
    enrichProductController
}