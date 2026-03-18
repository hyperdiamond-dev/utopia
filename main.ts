// src/index.ts
import { serve } from "@hono/node-server";
import "@std/dotenv/load";
import { Env, Hono } from "hono";
import { cors } from "hono/cors";
import { logger } from "hono/logger";
import { secureHeaders } from "hono/secure-headers";
import { authMiddleware } from "./middleware/auth.ts";
import {
  authRateLimit,
  globalRateLimit,
  strictRateLimit,
} from "./middleware/rateLimit.ts";
import { auth } from "./routes/auth.ts";
import { consent } from "./routes/consent.ts";
import { modules } from "./routes/modules.ts";
import submodules from "./routes/submodules.ts";
import questions from "./routes/questions.ts";
import { uploads } from "./routes/upload.ts";
import { content } from "./routes/content.ts";
import { admin } from "./routes/admin.ts";
import { themes } from "./routes/themes.ts";

// Validate required environment variables at startup
const REQUIRED_ENV_VARS = [
  "DATABASE_URL",
  "JWT_SECRET",
  "FIREBASE_PROJECT_ID",
  "FIREBASE_CLIENT_EMAIL",
  "FIREBASE_PRIVATE_KEY",
  "ADMIN_SECRET",
];

for (const varName of REQUIRED_ENV_VARS) {
  if (!Deno.env.get(varName)) {
    console.error(`FATAL: Required environment variable ${varName} is not set`);
    Deno.exit(1);
  }
}

interface AppContext extends Env {
  Variables: {
    user?: { uuid: string; id?: string; name: string };
  };
}

const app = new Hono<AppContext>();

// Global middleware
app.use("*", secureHeaders());
// @ts-ignore - TypeScript compatibility issue with hono-rate-limiter
app.use("*", globalRateLimit); // Apply global rate limiting

// Enhanced logging for debugging
app.use(
  "*",
  logger((message, ...rest) => {
    console.log(`[${new Date().toISOString()}] ${message}`, ...rest);
  }),
);

// Auth route rate limiting
// @ts-ignore - TypeScript compatibility issue with hono-rate-limiter
app.use("/api/auth/login", authRateLimit);
// @ts-ignore - TypeScript compatibility issue with hono-rate-limiter
app.use("/api/auth/create-anonymous", strictRateLimit);

app.use(
  "*",
  cors({
    origin: Deno.env.get("ALLOWED_ORIGINS")?.split(",").map((s) => s.trim()) ||
      ["http://localhost:3000"],
    credentials: true,
  }),
);

// Auth routes (public)
app.route("/api/auth", auth);

// Consent routes (protected)
app.route("/api/consent", consent);

// Module routes (protected)
app.route("/api/modules", modules);

// Submodule routes (protected) - nested under modules
app.route("/api/modules", submodules);

// Question routes (protected)
app.route("/api", questions);

// Upload routes (protected)
app.route("/api/upload", uploads);

// Content routes (media content for modules/submodules)
app.route("/api/content", content);

// Admin routes (service-to-service for levelzero dashboard)
app.route("/api/admin", admin);

// Theme routes (public - consumed by terminal for rendering)
app.route("/api/themes", themes);

// Protected routes example
app.get("/api/profile", authMiddleware, (c) => {
  const user = c.get("user");
  return c.json({
    message: "Protected route accessed",
    user,
  });
});

// Health check
app.get("/health", (c) => c.json({ status: "ok" }));

const port = Number(Deno.env.get("PORT")) || 3001;
console.log(`🔥 Hono server running on http://localhost:${port}`);

serve({
  fetch: app.fetch,
  port,
});
