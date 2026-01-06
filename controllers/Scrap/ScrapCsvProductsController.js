const readCsv = require("../../utils/csvParser");
const AppError = require("../../utils/AppError");
const { productScrapService } = require("../../services/Scrap/ProductScrapService");

const readCsvProducts = async (req, res, next) => {
  try {
    if (!req.file) throw new AppError('Please upload a file', 400);
    const productUrls = await readCsv(req?.file?.path);
    const results = await Promise.all(
      productUrls.map(async (url) => {
        const productJson = await productScrapService(url);
        return productJson;
      })
    );

    return res.status(200).json({ success: true, message: `Scrapped product image URLs: ${productUrls.length}`, data: results });
  } catch (e) { next(e); }
};

module.exports = readCsvProducts