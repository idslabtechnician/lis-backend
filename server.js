const express = require("express");
const cors = require("cors");
const dotenv = require("dotenv");
const mongoose = require("mongoose");

// Load env vars
dotenv.config();

const app = express();

// Middleware
app.use(cors());
app.use(express.json());

// Routes
const auth = require("./routes/authRoutes");
const users = require("./routes/userRoutes");
const inventory = require("./routes/itemRoutes");
const orders = require("./routes/orderRoutes");
const damages = require("./routes/damageRoutes");

app.use("/api/auth", auth);
app.use("/api/users", users);
app.use("/api/inventory", inventory);
app.use("/api/orders", orders);
app.use("/api/damages", damages);

app.get("/api/health", (req, res) => {
  res.status(200).json({ status: "success", message: "Backend is running" });
});

app.get("/", (req, res) => {
  res.send(
    "<h1>Lab System Backend is Running 🚀</h1><p>Send requests to the <code>/api</code> endpoints.</p>",
  );
});

// Database Connection
const PORT = process.env.PORT || 5000;
const MONGO_URI =
  process.env.MONGO_URI || "mongodb://localhost:27017/lab-system";

mongoose
  .connect(MONGO_URI)
  .then(() => {
    console.log("MongoDB Connected");
    app.listen(PORT, () => console.log(`Server running on port ${PORT}`));
  })
  .catch((err) => {
    console.error("Database connection error:", err);
    process.exit(1);
  });
