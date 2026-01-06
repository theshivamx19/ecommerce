const express = require("express");
const userAuthRoute = require("./userAuthRoute");
const userRoute = require("./userRoute");

const router = express.Router();

router.use("/auth", userAuthRoute);
router.use("/", userRoute);

module.exports = router;
