// utils/AppError.js
class AppError extends Error {
  constructor(message, statusCode) {
    super(message);
    this.statusCode = statusCode;
    this.isOperational = true;

    // Clean stack trace (excludes constructor)
    Error.captureStackTrace(this, this.constructor);
  }
}

module.exports = AppError;
