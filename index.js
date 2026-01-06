const express = require("express");

// Handle uncaught exceptions immediately
process.on('uncaughtException', (err) => {
  console.error('UNCAUGHT EXCEPTION! 💥 Shutting down...');
  console.error(err.name, err.message);
  console.error(err.stack);
  process.exit(1);
});

// Handle unhandled rejections
process.on('unhandledRejection', (err) => {
  console.error('UNHANDLED REJECTION! 💥 Shutting down...');
  console.error(err.name, err.message);
  process.exit(1);
});

const session = require("express-session");
const routes = require("./routes/indexRoute.js");
const { errorHandler, notFound } = require("./middlewares/errorHandler.js");
const auth = require("./middlewares/auth.js");
const cors = require("cors");
const corsOptions = require("./config/corsOptions.js");
const cookieParser = require("cookie-parser");
const logger = require("./utils/logger");
const helmet = require("helmet");
const { rateLimit } = require("express-rate-limit");
const dotenv = require("dotenv");
dotenv.config();

const app = express();

// Security middleware
app.use(helmet());
app.use(cors(corsOptions));

const limiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 min
  max: 100, // 100 req / IP / window
  standardHeaders: "draft-8", // RateLimit-* headers
  legacyHeaders: false,
  handler: (req, res) =>
    res.status(429).json({
      error: "Rate limit exceeded",
      retryAfter: Math.round(req.rateLimit.resetTime / 1000),
    }),
});

// app.use(limiter);
app.use(express.json({ limit: "10mb" }));
app.use(express.urlencoded({ extended: true, limit: "10mb" }));
app.use(cookieParser());

app.use(session({
  secret: process.env.SESSION_SECRET,
  resave: false,
  saveUninitialized: true,
  cookie: {
    secure: false,         // ❌ DO NOT USE true when behind tunnels
    sameSite: 'lax',       // ❌ DO NOT use 'none'
  }
}));


// Serve static files from uploads directory
app.use("/uploads", express.static("uploads"));
// Routes
app.get("/", (req, res) => {
  res.send("Hello World!");
});

// Auth routes
app.use("/api", routes);

// 404 handler
app.get('/favicon.ico', (req, res) => res.status(204).end());
app.use(notFound);
// Global error handler - MUST BE LAST
app.use(errorHandler);

const PORT = process.env.PORT || 8000;
app.listen(PORT, () => {
  logger.info(`Server is running on port ${PORT}`);
});
