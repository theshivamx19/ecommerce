const jwt = require("jsonwebtoken");

const generateAccessToken = async (userId) => {
  return await jwt.sign({ id: userId }, process.env.ACCESS_TOKEN_JWT_SECRET, {
    expiresIn: process.env.JWT_EXPIRES_IN || "1d",
  });
};

const generateRefreshToken = async (userId) => {
  return await jwt.sign({ id: userId }, process.env.REFRESH_TOKEN_JWT_SECRET, {
    expiresIn: process.env.JWT_EXPIRES_IN || "7d",
  });
};

const verfiyAccessToken = async (token) => {
  return await jwt.verify(token, process.env.ACCESS_TOKEN_JWT_SECRET);
};

const verfiyRefreshToken = async (token) => {
  return await jwt.verify(token, process.env.REFRESH_TOKEN_JWT_SECRET);
};

module.exports = { generateAccessToken, generateRefreshToken, verfiyAccessToken, verfiyRefreshToken };
