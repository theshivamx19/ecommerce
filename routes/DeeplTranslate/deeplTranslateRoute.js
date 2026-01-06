const express = require("express");
const router = express.Router();
const deeplTranslateController = require("../../controllers/DeeplTranslate/deeplTranslateController");

router.post("/translate", deeplTranslateController);

module.exports = router;