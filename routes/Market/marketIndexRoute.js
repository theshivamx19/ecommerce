const express = require("express");
const router = express.Router();    
const marketRoute = require("./marketRoute");

router.use("/", marketRoute);


module.exports = router;