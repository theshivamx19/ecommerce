const { productScrapService } = require('../../services/Scrap/ProductScrapService');

const productScrapController = async (req, res) => {
  try {
    const { productUrls } = req?.body; // expects an array of URLs
    if (!Array.isArray(productUrls) || productUrls.length === 0) {
      return res.status(400).json({ success: false, message: 'Please provide an array of product URLs' });
    }

    // Use Promise.all for concurrent execution of scraping each URL
    const results = await Promise.all(
      productUrls.map(async (url) => {
        const productJson = await productScrapService(url);
        // return { url, images };
        return productJson;
      })
    );
    const finalProducts = results.filter(Boolean);

    return res.status(200).json({
      success: true,
      message: `Scrapped product image URLs: ${finalProducts.length}`,
      total: productUrls.length,
      scrapSuccess: finalProducts.length,
      failed: productUrls.length - finalProducts.length,
      data: finalProducts
    });
  } catch (error) {
    console.error('Error in productScrapController:', error);
    res.status(500).json({ error: 'Internal Server Error' });
  }
};

module.exports = {
  productScrapController,
};




// const {scrapImageService} = require('../../services/Scrap/ImageScrapService')

// const productScrapController = async (req, res) => {
//     try {
//         const {productUrl} = req?.body
//         const result = await scrapImageService(productUrl);
//         return res.status(200).json({success: true, message: "Scrapped product image URLs", data: result});
//     } catch (error) {
//         console.error('Error in productScrapController:', error);
//         res.status(500).json({ error: 'Internal Server Error' });
//     }
// }

// module.exports ={
//     productScrapController
// }
