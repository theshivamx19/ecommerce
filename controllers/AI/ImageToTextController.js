const { generateMetadataMultiple } = require('../../services/AI/ImageToTextService')


const imageToTextController = async (req, res) => {
    try {
        const images = req.files;
        const { title, description, flowId } = req.body;

        const result = await generateMetadataMultiple({ images, title, description }, flowId);
        return res.status(200).json({
            success: true,
            message: 'Metadata generated successfully',
            data: result
        });
    } catch (error) {
        console.error('Error generating metadata:', error);
        return res.status(500).json({
            success: false,
            message: 'Failed to generate metadata',
            error: error.message
        });
    }
};

module.exports = imageToTextController


