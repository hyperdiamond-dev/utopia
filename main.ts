// src/index.ts
import { serve } from "@hono/node-server";
import "@std/dotenv/load";
import { Env, Hono } from "hono";
import { cors } from "hono/cors";
import { logger } from "hono/logger";
import { secureHeaders } from "hono/secure-headers";
import { authMiddleware } from "./middleware/auth.ts";
import { globalRateLimit } from "./middleware/rateLimit.ts";
import { auth } from "./routes/auth.ts";
import { consent } from "./routes/consent.ts";
import { modules } from "./routes/modules.ts";
import { paths } from "./routes/paths.ts";
import submodules from "./routes/submodules.ts";
import questions from "./routes/questions.ts";
import { uploads } from "./routes/upload.ts";

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

// Debug middleware to log request details
app.use("*", async (c, next) => {
  const start = Date.now();
  console.log(`\n� === DEBUG INFO ===`);
  console.log(`� ${c.req.method} ${c.req.url}`);
  console.log(`🌐 User-Agent: ${c.req.header("user-agent") || "Unknown"}`);
  console.log(
    `� Authorization: ${c.req.header("authorization") ? "Present" : "Missing"}`,
  );
  console.log(
    `� Content-Type: ${c.req.header("content-type") || "Not specified"}`,
  );

  await next();

  const ms = Date.now() - start;
  console.log(`📤 Response: ${c.res.status} (${ms}ms)`);
  console.log(`🔍 === END DEBUG ===\n`);
});
app.use(
  "*",
  cors({
    origin: Deno.env.get("ALLOWED_ORIGINS")?.split(",") ||
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

// Path routes (protected)
app.route("/api/paths", paths);

// Submodule routes (protected) - nested under modules
app.route("/api/modules", submodules);

// Question routes (protected)
app.route("/api", questions);

// Upload routes (protected)
app.route("/api/upload", uploads);

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
