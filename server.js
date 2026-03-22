const express = require("express");
const mongoose = require("mongoose");
const cors = require("cors");
const compression = require("compression");
require("dotenv").config();

const authRoutes = require("./routes/authRoutes");
const userRoutes = require("./routes/userRoutes");
const paymentRoutes = require("./routes/paymentRoutes");
const withdrawalRoutes = require("./routes/WithdrawalRoutes");
const adminRoutes = require("./routes/adminRoutes");
const transferRoutes = require("./routes/transferRoutes");
const publicRoutes = require("./routes/publicRoutes");
const { loadCoinPrice } = require("./config/coinConfig");

const app = express();

// CORS Configuration - Allow localhost dev + production domains reliably.
const normalizeOrigin = (origin) => {
  if (!origin || typeof origin !== "string") return "";
  return origin.replace(/\/$/, "").toLowerCase();
};

const allowedOrigins = new Set([
  "http://localhost:5173",
  "http://localhost:3000",
  "http://127.0.0.1:5173",
  "http://127.0.0.1:3000",
  "http://zuxcoin.in",
  "https://zuxcoin.in",
  "http://www.zuxcoin.in",
  "https://www.zuxcoin.in",
  process.env.FRONTEND_URL,
  process.env.frontend_url_http,
  process.env.frontend_url_https,
  process.env.frontend_url_http_www,
  process.env.frontend_url_https_www,
].filter(Boolean).map(normalizeOrigin));

const corsOptions = {
  origin(origin, callback) {
    // Allow server-to-server requests and tools with no Origin header.
    if (!origin) {
      return callback(null, true);
    }

    const normalized = normalizeOrigin(origin);
    if (allowedOrigins.has(normalized)) {
      return callback(null, true);
    }

    return callback(new Error(`CORS blocked for origin: ${origin}`));
  },
  credentials: true,
  methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
  allowedHeaders: ["Content-Type", "Authorization"],
  optionsSuccessStatus: 200,
};

app.use(compression());
app.use(cors(corsOptions));
app.use(express.json());

mongoose.connect(process.env.MONGO_URI)
  .then(async () => {
    console.log("MongoDB Connected");
    await loadCoinPrice();
  })
  .catch(err => console.log(err));

app.use("/api/admin", adminRoutes);
app.use("/api/auth", authRoutes);
app.use("/api/user", userRoutes);
app.use("/api/payment", paymentRoutes);
app.use("/api/withdrawal", withdrawalRoutes);
app.use("/api/transfer", transferRoutes);
app.use("/api/public", publicRoutes);
app.listen(process.env.PORT, () => {
  console.log(`Server running on port ${process.env.PORT}`);
});
  //  const selfPingUrl = process.env.SERVER_URL || `http://localhost:${PORT}`;
  // if (process.env.ENABLE_SELF_PING === 'true') {
  //   setInterval(() => {
  //     fetch(selfPingUrl)
  //       .then(() => console.log("Self ping success"))
  //       .catch(() => console.log("Ping failed"));
  //   }, 30000); // every 30 seconds
  //   console.log(`Self-ping enabled for ${selfPingUrl}`);
  // }
