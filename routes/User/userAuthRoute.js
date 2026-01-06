const express = require("express");
const {
  userLoginController,
  userSignupController,
  // userRefreshTokenController,
  userLogoutController,
  forgotPasswordController,
  resetPasswordController,
} = require("../../controllers/User/UserAuthController");
const auth = require("../../middlewares/auth");

const router = express.Router();


router.post("/signup", auth(["admin"]), userSignupController);
router.post("/login", userLoginController);
// router.post('/refresh', userRefreshTokenController)
router.post('/logout', userLogoutController)
router.post('/forgot-password', forgotPasswordController)
router.post('/reset-password', resetPasswordController)

module.exports = router;
