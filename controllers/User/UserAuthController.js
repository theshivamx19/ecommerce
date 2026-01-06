const {
  userLoginService,
  userSignUpService,
  userRefreshTokenService,
  forgotPasswordService,
  resetPasswordService,
  // userLogoutService,
} = require("../../services/User/UserAuthService");
const AppError = require("../../utils/AppError");
const logger = require("../../utils/logger");

// Signup controller
const userSignupController = async (req, res, next) => {
  try {
    const { firstName, lastName, email, password, role } = req.body;
    // Validate input
    if (!firstName || !lastName || !email || !password) {
      throw new AppError("Please provide name, email and password", 400);
    }
    // if (!role || role === "" || !["admin", "manager", "member"].includes(role)) {
    //   throw new AppError("Please provide valid role", 400);
    // }

    const result = await userSignUpService(
      firstName,
      lastName,
      email,
      password,
      role
    );
    logger.info(`User registered: ${email}`);
    res.status(201).json({
      success: true,
      message: "User registered successfully",
      data: result,
    });
  } catch (error) {
    next(error);
  }
};

// Login controller
const userLoginController = async (req, res, next) => {

  try {
    const { email, password } = req.body;
    // Validate input
    if (!email || !password) {
      throw new AppError("Please provide email and password", 400);
    }
    const result = await userLoginService(email, password);

    // res.cookie("refreshToken", refreshToken, {
    //   httpOnly: true,
    //   secure: true,
    //   sameSite: "strict",
    //   maxAge: 7 * 24 * 60 * 60 * 1000, // 7 days
    // })
    res.status(200).json({
      success: true,
      message: "Login successful",
      user: result,
    });
  } catch (error) {
    next(error);
  }
};

// Refresh token controller
const userRefreshTokenController = async (req, res, next) => {
  try {
    const { refreshToken } = req.cookies;
    // Validate input
    if (!refreshToken) {
      throw new AppError("Please provide refresh token", 400);
    }

    const result = await userRefreshTokenService(refreshToken);

    res.status(200).json({
      success: true,
      message: "Refresh token successful",
      data: result,
    });
  } catch (error) {
    next(error);
  }
};

// Logout controller
const userLogoutController = async (req, res, next) => {
  try {
    // const { refreshToken } = req.cookies;
    // if (!refreshToken) {
    //   throw new AppError("Please provide refresh token", 400);
    // }
    // const result = await userLogoutService(refreshToken);
    // res.clearCookie("refreshToken");
    res.clearCookie("authToken");
    res.status(200).json({
      success: true,
      message: "Logout successful",
    });
  } catch (error) {
    next(error);
  }
};


const forgotPasswordController = async (req, res, next) => {
  try {
    const { email } = req?.body;
    if (!email) {
      throw new AppError("Email is required", 400)
    }
    await forgotPasswordService(email);
    return res.status(200).json({ success: true, message: `Password reset link sent successfully to email: ${email}` })
  } catch (error) {
    next(error)
  }
}

const resetPasswordController = async (req, res, next) => {
  try {
    const { token, password, confirmPassword } = req?.body;
    if (!token || !password) {
      throw new AppError("Token and password are required", 400)
    }
    if (password !== confirmPassword) {
      throw new AppError("Password and confirm password do not match", 400)
    }
    await resetPasswordService(token, password);
    return res.status(200).json({ success: true, message: `Password reset successfully` })
  } catch (error) {
    if (error?.name === "JsonWebTokenError" || error?.name === "TokenExpiredError") {
      throw new AppError("Password reset link expired/invalid", 400)
    }
    next(error)
  }
}

module.exports = {
  userLoginController,
  userSignupController,
  userRefreshTokenController,
  userLogoutController,
  forgotPasswordController,
  resetPasswordController,
};