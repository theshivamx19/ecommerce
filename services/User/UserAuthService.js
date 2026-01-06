const jwt = require("jsonwebtoken");
const bcrypt = require("bcrypt");
const db = require("../../models/index.js");
const User = db.User;
const AppError = require("../../utils/AppError.js");
const { generateAccessToken,
  // generateRefreshToken,
  verfiyRefreshToken
} = require("../../utils/authTokenUtil.js");
const logger = require("../../utils/logger.js");
const { getUserByEmail, updateUser } = require("./UserService.js");
const emailService = require("../../services/EmailService/EmailService.js");

// User signup
const userSignUpService = async (
  firstName,
  lastName,
  email,
  password,
  role
) => {
  // Check if user already exists
  const existingUser = await User.findOne({ where: { email } });
  if (existingUser) {
    throw new AppError("Email already registered", 409);
  }

  // Hash password
  const hashedPassword = await bcrypt.hash(password, 10);

  // Create new user
  const user = await User.create({
    firstName,
    lastName,
    email,
    password: hashedPassword,
    role,
  });

  return {
    user: {
      id: user.id,
      firstName: user.firstName,
      lastName: user.lastName,
      email: user.email,
      role,
      createdAt: user.createdAt,
    },
  };
};

const userLoginService = async (email, password) => {
  // Find user and include password field
  const user = await User.findOne({ where: { email } });
  console.log(email, password);
  if (!user) {
    throw new AppError("Invalid email or password", 401);
  }

  // Check password
  const isPasswordCorrect = await bcrypt.compare(password, user.password);

  if (!isPasswordCorrect) {
    throw new AppError("Invalid email or password", 401);
  }

  // Generate token
  const accessToken = await generateAccessToken(user.id);
  // const refreshToken = await generateRefreshToken(user.id);
  // await db.RefreshToken.create({
  //   userId: user.id,
  //   token: refreshToken,
  //   expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
  // });

  return {
    id: user.id,
    firstName: user.firstName,
    lastName: user.lastName,
    email: user.email,
    createdAt: user.createdAt,
    accessToken,
    // refreshToken
  };
};

const userRefreshTokenService = async (refreshToken) => {

  const decodedRefresh = await verfiyRefreshToken(refreshToken)
  if (!decodedRefresh) {
    throw new AppError("Invalid refresh token", 401);
  }
  const userId = decodedRefresh.id;
  // Find user and include password field
  const userToken = await db.RefreshToken.findOne({ where: { token: refreshToken, userId } });
  if (!userToken) {
    throw new AppError("Invalid refresh token", 401);
  }

  // Generate token
  const accessToken = await generateAccessToken(userToken.userId);

  return {
    userId: userToken.userId,
    accessToken,
  };
};

// const userLogoutService = async (refreshToken) => {
//   const decodedRefresh = await verfiyRefreshToken(refreshToken);
//   if (!decodedRefresh) {
//     throw new AppError("Invalid refresh token", 401);
//   }
//   const userId = decodedRefresh.id;
//   // Find user and include password field
//   const token = await db.RefreshToken.findOne({ where: { token: refreshToken, userId } });
//   if (!token) {
//     throw new AppError("Invalid refresh token", 401);
//   }
//   await token.destroy();
//   return "User logged out successfully"
// };

const forgotPasswordService = async (email) => {
  const user = await getUserByEmail(email)
  if (!user) {
    throw new AppError("No user exists with given email id", 404)
  }
  const payload = {
    email,
    userId: user?.id
  }
  const tokenExpiry = "5m"
  const name = `${user?.firstName} ${user?.lastName}`
  const passwordResetToken = jwt.sign(payload, process.env.PASSWORD_RESET_JWT_SECRET, { expiresIn: tokenExpiry })
  const resetLink = `${process.env.FRONTEND_URL}/reset-password?token=${passwordResetToken}`
  const appName = "Gf-Ecom"
  const htmlContent = `
    <!DOCTYPE html>
      <html lang="en">
      <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>Password Reset Notification</title>
        <style>
          body {
            font-family: 'Helvetica Neue', Helvetica, Arial, sans-serif;
            background-color: #f8f9fa;
            margin: 0;
            padding: 0;
          }
          .container {
            max-width: 600px;
            margin: 50px auto;
            background-color: #ffffff;
            padding: 40px;
            border-radius: 6px;
            border: 1px solid #e0e0e0;
          }
          h1 {
            font-size: 22px;
            color: #212529;
            margin-bottom: 20px;
          }
          p {
            font-size: 16px;
            color: #495057;
            line-height: 1.6;
            margin-bottom: 20px;
          }
          .btn {
            display: inline-block;
            padding: 12px 25px;
            font-size: 16px;
            font-weight: 600;
            color: #ffffff !important;
            background-color: #0056b3;
            text-decoration: none;
            border-radius: 5px;
          }
          .btn:hover {
            background-color: #004085;
          }
          .footer {
            margin-top: 30px;
            font-size: 13px;
            color: #868e96;
            text-align: center;
          }
        </style>
      </head>
      <body>
        <div class="container">
          <h1>Password Reset Request</h1>
          <p>Dear ${name},</p>
          <p>We have received a request to reset the password associated with your account. To proceed, please click the button below to securely reset your password:</p>
          <a href="${resetLink}" class="btn">Reset Password</a>
          <p>This link will remain valid for ${tokenExpiry.split("m")[0]} minutes. If you did not request a password reset, no action is required, and your account will remain secure.</p>
          <p>Sincerely,<br>${appName}</p>
          <div class="footer">
            &copy; ${new Date().getFullYear()} ${appName}. All rights reserved.
          </div>
        </div>
      </body>
      </html>`

  return await emailService(user.email, "Password Reset", htmlContent)
}

const resetPasswordService = async (token, password) => {
  const decoded = jwt.verify(token, process.env.PASSWORD_RESET_JWT_SECRET)
  const user = await getUserByEmail(decoded.email)
  if (!user) {
    throw new AppError("Invalid password reset link", 400)
  }
  const updatedAtInSeconds = Math.floor(
    new Date(user?.updatedAt).getTime() / 1000
  );
  const isTokenUsed = updatedAtInSeconds > decoded.iat
  if (isTokenUsed) {
    throw new AppError("Invalid password reset link", 400)
  }
  const hashedPassword = await bcrypt.hash(password, 10)
  await updateUser(user.id, { password: hashedPassword })
}


module.exports = {
  userSignUpService,
  userLoginService,
  userRefreshTokenService,
  // userLogoutService,
  forgotPasswordService,
  resetPasswordService
};
