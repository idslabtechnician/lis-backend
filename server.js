const express = require("express");
const cors = require("cors");
const helmet = require("helmet");
const rateLimit = require("express-rate-limit");
const mongoSanitize = require("express-mongo-sanitize");
const dotenv = require("dotenv");
const mongoose = require("mongoose");
const initCleanupJob = require("./utils/reservationCleanup");

// Load env vars
dotenv.config();

const app = express();

// Trust proxy for Render/Vercel/Cloudflare (essential for correct link protocol in emails)
app.set("trust proxy", 1);

// ─── Security Middleware ────────────────────────────────────────────────
// Set security HTTP headers (X-Content-Type-Options, X-Frame-Options, etc.)
app.use(helmet());

// Restrict CORS to known origins
const allowedOrigins = [
  "http://localhost:3000", // Next.js dev
  "http://localhost:3001", // Next.js dev (alternative port)
  "http://localhost:5000", // Backend dev (self)
  "http://localhost:8081", // Expo mobile dev
];
// FOR PRODUCTION
// Add frontend production URL if provided in environment variables
if (process.env.FRONTEND_URL) {
  allowedOrigins.push(process.env.FRONTEND_URL);
}
if (process.env.MOBILE_URL) {
  allowedOrigins.push(process.env.MOBILE_URL);
}
app.use(
  cors({
    origin: function (origin, callback) {
      // Allow requests with no origin (mobile apps, curl, Postman)
      if (!origin) return callback(null, true);
      if (allowedOrigins.includes(origin)) {
        callback(null, true);
      } else {
        callback(new Error("Not allowed by CORS"));
      }
    },
    credentials: true,
    methods: ["GET", "POST", "PUT", "DELETE"],
  }),
);

// Body parser with size limit (prevent payload DoS)
app.use(express.json({ limit: "10kb" }));

// Sanitize data — prevent NoSQL injection (strips $ and . from user input)
// Note: We sanitize body and params manually because req.query is read-only in newer Express
app.use((req, res, next) => {
  if (req.body) req.body = mongoSanitize.sanitize(req.body);
  if (req.params) req.params = mongoSanitize.sanitize(req.params);
  next();
});

// ─── Rate Limiting ──────────────────────────────────────────────────────
// Global rate limit: 200 requests per 15 minutes per IP
const globalLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 200,
  message: {
    success: false,
    error: "Too many requests, please try again later.",
  },
});
app.use(globalLimiter);

// Stricter limit for authentication: 10 requests per 15 minutes per IP
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 15,
  message: {
    success: false,
    error: "Too many login attempts, please try again later.",
  },
});
app.use("/api/auth", authLimiter);

// Stricter limit for reservation creation only: 5 POST requests per 15 minutes per IP
const reservationCreateLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  message: {
    success: false,
    error: "Too many reservation attempts, please try again later.",
  },
});
app.post("/api/reservations", reservationCreateLimiter);

// Routes
const auth = require("./routes/authRoutes");
const users = require("./routes/userRoutes");
const inventory = require("./routes/itemRoutes");
const damages = require("./routes/damageRoutes");
const requests = require("./routes/requestRoutes");
const reservations = require("./routes/reservationRoutes");

app.use("/api/auth", auth);
app.use("/api/users", users);
app.use("/api/inventory", inventory);
app.use("/api/damages", damages);
app.use("/api/requests", requests);
app.use("/api/reservations", reservations);

app.get("/api/health", (req, res) => {
  res.status(200).json({ status: "success", message: "Backend is running" });
});

app.get("/", (req, res) => {
  res.send(
    "<h1>Lab System Backend is Running </h1><p>Send requests to the <code>/api</code> endpoints.</p>",
  );
});

// Database Connection
const PORT = process.env.PORT || 5000;
const MONGO_URI =
  process.env.MONGO_URI || "mongodb://localhost:27017/lab-system";
const connectDB = require("./config/db");

connectDB();

// Initialize reservation cleanup job
initCleanupJob();

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
