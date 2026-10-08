const path = require("path");
const dotenv = require("dotenv");
dotenv.config({ path: path.join(__dirname, ".env") });
dotenv.config();

const express = require("express");
const cors = require("cors");
const { clerkMiddleware } = require("@clerk/express");

const chatRoutes = require("./routes/chatRoutes");
const connectDB = require("./config/db");

// Connect to MongoDB
connectDB();

const app = express();

const allowedOrigins = [
  "http://localhost:5173",
  "http://localhost:5174",
  "http://localhost:3000",
  "http://localhost:4173",
  "http://127.0.0.1:5173",
  "http://127.0.0.1:5174",
  "http://127.0.0.1:3000",
  "https://the-ai-automation.netlify.app",
];

if (process.env.FRONTEND_URL) {
  process.env.FRONTEND_URL.split(",").forEach((url) => {
    const cleaned = url.trim().replace(/\/$/, "");
    if (cleaned && !allowedOrigins.includes(cleaned)) {
      allowedOrigins.push(cleaned);
    }
  });
}

const corsOptions = {
  origin: (origin, callback) => {
    // Allow requests with no origin (like mobile apps, curl, Postman)
    if (!origin) return callback(null, true);

    // Allow explicitly listed origins
    if (allowedOrigins.includes(origin)) {
      return callback(null, true);
    }

    // Allow localhost/127.0.0.1 on any port for local development
    if (/^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(origin)) {
      return callback(null, true);
    }

    // Allow Netlify and Vercel domains (including deploy previews)
    if (
      /^https:\/\/([a-zA-Z0-9_-]+\.)*netlify\.app$/.test(origin) ||
      /^https:\/\/([a-zA-Z0-9_-]+\.)*vercel\.app$/.test(origin)
    ) {
      return callback(null, true);
    }

    // Fallback: allow dynamically to prevent CORS blockage
    return callback(null, true);
  },
  credentials: true,
  methods: ["GET", "POST", "PUT", "DELETE", "PATCH", "OPTIONS", "HEAD"],
  allowedHeaders: [
    "Origin",
    "X-Requested-With",
    "Content-Type",
    "Accept",
    "Authorization",
    "Access-Control-Allow-Headers",
    "Access-Control-Request-Method",
    "Access-Control-Request-Headers",
  ],
  exposedHeaders: ["Authorization"],
  optionsSuccessStatus: 200,
};

app.use(cors(corsOptions));
app.use(express.json());


const clerkPublishableKey =
  process.env.CLERK_PUBLISHABLE_KEY || process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY;

app.use(
  clerkMiddleware({
    publishableKey: clerkPublishableKey,
    secretKey: process.env.CLERK_SECRET_KEY,
  })
);


app.get("/", (req, res) => {
  res.json({
    success: true,
    message: "Municipal Policy AI Copilot Server is running",
  });
});

const adminRoutes = require("./routes/adminRoutes");
const sourceRoutes = require("./routes/sourceRoutes");

app.use("/api/chat", chatRoutes);
app.use("/api/query", chatRoutes);
app.use("/api/sources", sourceRoutes);
app.use("/api/admin", adminRoutes);

app.use((err, req, res, next) => {
  if (err.message === 'Unauthenticated' || err.status === 401) {
    return res.status(401).json({ success: false, message: 'Unauthenticated' });
  }
  console.error(err.stack);
  res.status(500).json({ success: false, message: err.message || 'Internal Server Error' });
});
const PORT = process.env.PORT || 5000;

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});