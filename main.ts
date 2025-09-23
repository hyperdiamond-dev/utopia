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
import { modules } from "./routes/modules.ts";

interface AppContext extends Env {
  Variables: {
    user?: { id: string; name: string };
  };
}

const app = new Hono<AppContext>();

// Global middleware
app.use("*", secureHeaders());
// @ts-ignore - TypeScript compatibility issue with hono-rate-limiter
app.use("*", globalRateLimit); // Apply global rate limiting
app.use("*", logger());
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

// Module routes (protected)
app.route("/api/modules", modules);

// Protected routes example
app.get("/api/profile", authMiddleware, (c) => {
  const user = c.get("user") as { id: string; name: string };
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
