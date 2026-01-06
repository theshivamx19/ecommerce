const express = require("express");
const userRoute = require("./User/userIndexRoute");
const productRoute = require("./Product/productIndexRoute");
const imageRoute = require("./Image/imageIndexRoute");
const aiRoute = require("./AI/aiIndexRoute");
const scrapRoute = require("./Scrap/scrapIndexRoute");
const shopifyRoute = require("./Shopify/shopifyIndexRoute");
const deeplTranslateRoute = require("./DeeplTranslate/deeplTranslateIndexRoute");
const flowRoute = require("./Flow/flowIndexRoute");
const marketRoute = require("./Market/marketIndexRoute");

const router = express.Router();

router.use("/user", userRoute);
router.use("/product", productRoute);
router.use("/image", imageRoute);
router.use("/ai", aiRoute);
router.use("/scrap", scrapRoute);
router.use("/shopify", shopifyRoute);
router.use("/deepl", deeplTranslateRoute);
router.use("/flow", flowRoute);
router.use("/market", marketRoute);

module.exports = router;
