const db = require("../../models/index");
const AppError = require("../../utils/AppError");


const createMarketService = async (data) => {
    const result = await db.Market.create(data);
    if (!result) {
        throw new AppError("Market not created", 400);
    }
    return result;
}

const getAllMarketService = async () => {
    const result = await db.Market.findAll(
        {
            include: [
                {
                    model: db.Store,
                    as: "store",
                    attributes: {
                        exclude: ["createdAt", "updatedAt", "shopifyDomain", "shopifyAccessToken"]
                    }
                }
            ]
        }
    );
    if (!result) {
        throw new AppError("No markets found", 404);
    }
    return result;

}

const getMarketDetailsByIdService = async (id) => {
    
    const result = await db.Market.findByPk(id, {
        include: [
            {
                model: db.Store,
                as: "store",
                attributes: {
                    exclude: ["createdAt", "updatedAt", "shopifyDomain", "shopifyAccessToken"]
                }
            }
        ]
    });
    if (!result) {
        throw new AppError("Market not found", 404);
    }
    return result;

}

const updateMarketService = async (id, data) => {
    const market = await db.Market.findByPk(id);
    if (!market) {
        throw new AppError("Market not found", 404);
    }
    const result = await db.Market.update(data, {
        where: {
            id: id
        }
    });
    return result;

}

const deleteMarketService = async (id) => {
    const market = await db.Market.findByPk(id);
    if (!market) {
        throw new AppError("Market not found", 404);
    }    
    const result = await db.Market.destroy({
        where: {
            id: id
        }
    });
    return result;

}

module.exports = {
    createMarketService,
    getAllMarketService,
    getMarketDetailsByIdService,
    updateMarketService,
    deleteMarketService
}