const logger = require("../utils/logger.js");

// middleware/errorHandler.js
const errorHandler = (err, req, res, next) => {
  const errorDetails = {
    message: err.message,
    stack: err.stack,
    route: req.originalUrl,
    method: req.method,
    ip: req.ip,
    userAgent: req.get('User-Agent'),
    timestamp: new Date().toISOString()
  };

  console.log("Error stack:", err.stack)
  logger.error('Error:', errorDetails);

  const message = err.message || "Internal Server Error";
  // Prevent duplicate responses
  if (res.headersSent) {
    return next(err);
  }

  // Handle Mongoose validation errors
  if (err.name === "ValidationError") {
    const messages = Object.values(err.errors).map((e) => e.message);
    return res.status(400).json({
      success: false,
      error: messages.join(", "),
    });
  }

  // Set status code
  const statusCode = err.statusCode || err.status || 500;

  // Send error response
  res.status(statusCode).json({
    success: false,
    message,
    // ...(process.env.NODE_ENV === "development" && { stack: err.stack }),
    // message: process.env.NODE_ENV === 'production'
    //   ? 'Something went wrong!'
    //   : err.message,
    ...(process.env.NODE_ENV === 'development' && {
      // stack: err.stack,
      details: errorDetails
    })
  });
};

/**
 * 404 Not Found handler
 */
const notFound = (req, res, next) => {
  logger.error('Not Found error:', req.originalUrl);
  const error = new Error(`Not Found - ${req.originalUrl}`);
  error.statusCode = 404;
  next(error);
};

module.exports = {
  errorHandler,
  notFound
};