const express = require("express");
const router = express.Router();
const {
    createMarketController,
    getAllMarketController,
    getMarketDetailsByIdController,
    updateMarketController,
    deleteMarketController
} = require("../../controllers/Market/MarketController");
const auth = require("../../middlewares/auth");

router.post("/create", auth(['admin', 'manager', 'member']), createMarketController);
router.get("/", auth(['admin', 'manager', 'member']), getAllMarketController);
router.get("/:id", auth(['admin', 'manager', 'member']), getMarketDetailsByIdController);
router.put("/:id", auth(['admin', 'manager', 'member']), updateMarketController);
router.delete("/:id", auth(['admin', 'manager', 'member']), deleteMarketController);

module.exports = router;
