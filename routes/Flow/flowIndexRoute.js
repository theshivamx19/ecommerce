const express = require("express");
const router = express.Router();
const flowIndexRoute = require("./flowRoute");

router.use("/", flowIndexRoute);

module.exports = router;