const express = require("express");
const deeplTranslateRoute = require("../../routes/DeeplTranslate/deeplTranslateRoute");

const router = express.Router();

router.use("/", deeplTranslateRoute);

module.exports = router;