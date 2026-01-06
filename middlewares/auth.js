const jwt = require("jsonwebtoken");
const AppError = require("../utils/AppError.js");
const { getUserById } = require('../services/User/UserService.js');
const { verfiyAccessToken } = require("../utils/authTokenUtil.js");
const logger = require("../utils/logger.js");

const auth = (roles = []) => {
  return async (req, res, next) => {

    try {
      // Get token from header
      const authHeader = req.headers.authorization;
      if (!authHeader || !authHeader.startsWith("Bearer ")) {
        throw new AppError(
          "No token provided. Please login to access this resource",
          401
        );
      }

      const token = authHeader.split(" ")[1];
      if (!token) {
        throw new AppError(
          "No token provided. Please login to access this resource",
          401
        );
      }

      // Verify token
      const decoded = await verfiyAccessToken(token)
      let user = await getUserById(decoded.id);

      if (!user) {
        throw new AppError("User not found", 404);
      }

      if (!roles.includes(user.role)) {
        // throw new AppError("Unauthorized", 401);
        return next(new AppError("Unauthorized", 401));
      }
      // Attach user id and role to request
      req.userId = decoded.id;
      req.userRole = user.role;  // Assuming the role is included in the JWT payload
      console.log(req.userId, req.userRole)
      next();
    } catch (error) {
      logger.error('Authentication error:', error);
      if (error.name === "JsonWebTokenError") {
        return next(new AppError("Invalid token. Please login again", 401));
      }
      if (error.name === "TokenExpiredError") {
        return next(new AppError("Token expired. Please login again", 401));
      }
      next(error);
    }
  }
}


module.exports = auth;
