const express = require("express");
const cors = require("cors");
const helmet = require("helmet");
const rateLimit = require("express-rate-limit");
const mongoSanitize = require("express-mongo-sanitize");
const dotenv = require("dotenv");
const mongoose = require("mongoose");
const initCleanupJob = require("./utils/reservationCleanup");

dotenv.config();

const app = express();

// Security and proxy setup
app.set("trust proxy", 1);
app.use(helmet());

// CORS configuration
const allowedOrigins = [
  "http://localhost:3000",
  "http://localhost:3001",
  "http://localhost:5000",
  "http://localhost:8081",
];

if (process.env.FRONTEND_URL) {
  allowedOrigins.push(process.env.FRONTEND_URL);
}
if (process.env.MOBILE_URL) {
  allowedOrigins.push(process.env.MOBILE_URL);
}

app.use(
  cors({
    origin: function (origin, callback) {
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

// Payload size limit
app.use(express.json({ limit: "10kb" }));

// Data sanitization (NoSQL injection prevention)
app.use((req, res, next) => {
  if (req.body) req.body = mongoSanitize.sanitize(req.body);
  if (req.params) req.params = mongoSanitize.sanitize(req.params);
  next();
});

// Rate limiters
const globalLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 200,
  message: {
    success: false,
    error: "Too many requests, please try again later.",
  },
});
app.use(globalLimiter);

const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 15,
  message: {
    success: false,
    error: "Too many login attempts, please try again later.",
  },
});
app.use("/api/auth", authLimiter);

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

// Database and server initialization
const PORT = process.env.PORT || 5000;
const MONGO_URI =
  process.env.MONGO_URI || "mongodb://localhost:27017/lab-system";
const connectDB = require("./config/db");

connectDB();
initCleanupJob();

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
