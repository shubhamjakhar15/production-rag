const mongoose = require("mongoose");
const dns = require("dns");
const { URL, URLSearchParams } = require("url");

// Attempt to set standard DNS resolvers for environments where it is supported
try {
  dns.setServers(["8.8.8.8", "1.1.1.1"]);
} catch (e) {
  // Ignore in restricted environments
}

/**
 * Resolves a mongodb+srv:// URI into a direct replica-set mongodb:// URI
 * using DNS-over-HTTPS (DoH via Cloudflare/Google HTTPS port 443).
 * This completely bypasses ISP/router DNS blocks and Windows querySrv ECONNREFUSED errors.
 */
async function resolveSrvViaDoH(srvUri) {
  try {
    const parsed = new URL(srvUri);
    const host = parsed.hostname;

    console.log(`[MongoDB] Resolving Atlas SRV records for ${host} via DNS-over-HTTPS...`);

    // Query SRV records over HTTPS
    const srvRes = await fetch(
      `https://dns.google/resolve?name=_mongodb._tcp.${host}&type=SRV`,
      { signal: AbortSignal.timeout(5000) }
    );
    const srvJson = await srvRes.json();

    if (!srvJson.Answer || srvJson.Answer.length === 0) {
      console.warn("[MongoDB] No SRV records returned from DoH query.");
      return null;
    }

    // SRV Answer data format: "priority weight port target"
    const hostList = srvJson.Answer.map((ans) => {
      const parts = ans.data.trim().split(/\s+/);
      const port = parts[2] || "27017";
      const target = parts[3].replace(/\.$/, "");
      return `${target}:${port}`;
    }).join(",");

    // Query TXT record for replicaSet name
    let replicaSet = "";
    try {
      const txtRes = await fetch(
        `https://dns.google/resolve?name=${host}&type=TXT`,
        { signal: AbortSignal.timeout(3000) }
      );
      const txtJson = await txtRes.json();
      if (txtJson.Answer) {
        for (const ans of txtJson.Answer) {
          const match = ans.data.match(/replicaSet=([^&\s"]+)/);
          if (match) replicaSet = match[1];
        }
      }
    } catch (txtErr) {
      // Optional
    }

    const searchParams = new URLSearchParams(parsed.search);
    searchParams.set("ssl", "true");
    if (replicaSet && !searchParams.has("replicaSet")) {
      searchParams.set("replicaSet", replicaSet);
    }
    if (!searchParams.has("authSource")) {
      searchParams.set("authSource", "admin");
    }

    const auth = parsed.username
      ? `${parsed.username}:${parsed.password}@`
      : "";
    const pathname = parsed.pathname && parsed.pathname !== "/" ? parsed.pathname : "/";

    return `mongodb://${auth}${hostList}${pathname}?${searchParams.toString()}`;
  } catch (err) {
    console.warn(`[MongoDB] DoH SRV fallback resolution failed: ${err.message}`);
    return null;
  }
}

const connectDB = async () => {
  const rawUri = (process.env.MONGO_URI || "mongodb://localhost:27017/voice-chatbot").trim();

  // Try direct connection first
  try {
    const conn = await mongoose.connect(rawUri);
    console.log(`MongoDB Connected: ${conn.connection.host}`);
    return conn;
  } catch (initialError) {
    const isSrvIssue =
      rawUri.startsWith("mongodb+srv://") &&
      (initialError.message.includes("querySrv") ||
        initialError.message.includes("ECONNREFUSED") ||
        initialError.message.includes("ENOTFOUND"));

    if (isSrvIssue) {
      console.warn(`[MongoDB] Primary DNS SRV lookup failed (${initialError.message}). Resolving via DoH fallback...`);
      const directUri = await resolveSrvViaDoH(rawUri);

      if (directUri) {
        try {
          const conn = await mongoose.connect(directUri);
          console.log(`MongoDB Connected via Direct URI: ${conn.connection.host}`);
          return conn;
        } catch (fallbackError) {
          console.error(`MongoDB connection error: ${fallbackError.message}`);
          if (
            fallbackError.message.includes("bad auth") ||
            fallbackError.message.includes("authentication failed")
          ) {
            console.error("\n=======================================================");
            console.error(" [MongoDB Atlas Authentication Error]");
            console.error(" The database username or password in MONGO_URI is incorrect.");
            console.error(" 1. Go to MongoDB Atlas -> 'Database Access' -> 'Database Users'.");
            console.error(" 2. Confirm the username and set a new password.");
            console.error(" 3. Go to 'Network Access' -> ensure 0.0.0.0/0 is active.");
            console.error("=======================================================\n");
          }
          process.exit(1);
        }
      }
    }

    console.error(`MongoDB connection error: ${initialError.message}`);
    if (
      initialError.message.includes("bad auth") ||
      initialError.message.includes("authentication failed")
    ) {
      console.error("\n=======================================================");
      console.error(" [MongoDB Atlas Authentication Error]");
      console.error(" The database username or password in MONGO_URI is incorrect.");
      console.error(" 1. Go to MongoDB Atlas -> 'Database Access' -> 'Database Users'.");
      console.error(" 2. Confirm the username and set a new password.");
      console.error(" 3. Go to 'Network Access' -> ensure 0.0.0.0/0 is active.");
      console.error("=======================================================\n");
    }
    process.exit(1);
  }
};

module.exports = connectDB;
