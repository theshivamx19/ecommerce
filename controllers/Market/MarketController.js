const {
    createMarketService,
    getAllMarketService,
    getMarketDetailsByIdService,
    updateMarketService,
    deleteMarketService
} = require('../../services/Market/MarketService')
const AppError = require('../../utils/AppError');


const createMarketController = async (req, res, next) => {
    try {
        const {storeId, country, countryCode, percentage, sign} = req.body;
        if (!country || !countryCode || !percentage || !sign) {
            throw new AppError("All fields are required", 400);
        }
        if(!["POSITIVE", "NEGATIVE"].includes(sign)) {
            throw new AppError("Sign must be POSITIVE or NEGATIVE", 400);
        }
        const result = await createMarketService({ storeId, country, countryCode, percentage, sign });
        return res.status(200).json({
            success: true,
            message: "Market created successfully",
            data: result,
        });
    } catch (error) {
        next(error);
    }
};

const getAllMarketController = async (req, res, next) => {
    try {
        const result = await getAllMarketService();
        return res.status(200).json({
            success: true,
            message: "Market fetched successfully",
            data: result,
        });
    } catch (error) {
        next(error);
    }
};

const getMarketDetailsByIdController = async (req, res, next) => {
    try {
        const { id } = req.params;
        const result = await getMarketDetailsByIdService(id);
        return res.status(200).json({
            success: true,
            message: "Market details fetched successfully",
            data: result,
        });
    } catch (error) {
        next(error);
    }
};

const updateMarketController = async (req, res, next) => {
    try {
        const { id } = req.params;
        const result = await updateMarketService(id, req.body);
        return res.status(200).json({
            success: true,
            message: "Market updated successfully",
            data: result,
        });
    } catch (error) {
        next(error);
    }
};

const deleteMarketController = async (req, res, next) => {
    try {
        const { id } = req.params;
        const market = await db.Market.findByPk(id);
        if (!market) {
            throw new AppError("Market not found", 404);
        }
        const result = await deleteMarketService(id);
        return res.status(200).json({
            success: true,
            message: "Market deleted successfully",
            data: result,
        });
    } catch (error) {
        next(error);
    }
};


module.exports = {
    createMarketController,
    getAllMarketController,
    getMarketDetailsByIdController,
    updateMarketController,
    deleteMarketController
}