const express = require("express");
const shopifyRoute = require("./shopifyRoute");
const storeRoute = require("./storeRoute");

const router = express.Router();


router.use("/", shopifyRoute);
router.use("/store", storeRoute);

module.exports = router;