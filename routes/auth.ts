// src/routes/auth.ts
import { Env, Hono } from "hono";
import jwt from "jsonwebtoken";
import { z } from "zod";
import { authMiddleware } from "../middleware/auth.ts";
import { UserService } from "../services/userService.ts";

interface AuthContext extends Env {
  Variables: {
    user?: {
      uuid?: string;
      friendlyAlias?: string;
      firebaseUid?: string;
      [key: string]: unknown;
    };
  };
}

const auth = new Hono<AuthContext>();

// Create anonymous user endpoint
auth.post("/create-anonymous", async (c) => {
  try {
    const user = await UserService.createAnonymousUser();

    return c.json({
      success: true,
      credentials: {
        username: user.friendlyAlias,
        password: user.password,
      },
      message: "Anonymous account created successfully",
    });
  } catch (_error) {
    return c.json({ error: "Failed to create user" }, 500);
  }
});

// Login endpoint
const loginSchema = z.object({
  username: z.string().min(1),
  password: z.string().min(1),
});

auth.post("/login", async (c) => {
  try {
    const body = await c.req.json();
    const { username, password } = loginSchema.parse(body);

    const user = await UserService.authenticateUser(username, password);
    if (!user) {
      return c.json({ error: "Invalid credentials" }, 401);
    }
    const jwtSecret = Deno.env.get("JWT_SECRET");
    if (!jwtSecret) {
      console.error("JWT_SECRET not configured");
      return c.json({ error: "Server configuration error" }, 500);
    }
    // Create JWT token
    const token = jwt.sign(
      {
        uuid: user.uuid,
        friendlyAlias: user.friendlyAlias,
        firebaseUid: user.firebaseUid,
      },
      Deno.env.get("JWT_SECRET")!,
      { expiresIn: "30d" },
    );

    return c.json({
      success: true,
      token,
      user: {
        uuid: user.uuid,
        username: user.friendlyAlias,
      },
    });
  } catch (_error) {
    return c.json({ error: "Authentication failed" }, 400);
  }
});

// Change password endpoint
const changePasswordSchema = z.object({
  currentPassword: z.string().min(8, "Password must be at least 8 characters"),
  newPassword: z.string().min(8, "Password must be at least 8 characters")
    .max(72, "Password must not exceed 72 characters"),
});

auth.post("/change-password", authMiddleware, async (c) => {
  try {
    const user = c.get("user");
    if (!user || !user.uuid) {
      return c.json({ error: "User not authenticated" }, 401);
    }

    const body = await c.req.json();
    const { currentPassword, newPassword } = changePasswordSchema.parse(body);

    // Prevent setting the same password
    if (currentPassword === newPassword) {
      return c.json({
        error: "New password must be different from current password",
      }, 400);
    }

    const result = await UserService.updatePassword(
      user.uuid,
      currentPassword,
      newPassword,
    );

    if (!result.success) {
      return c.json({ error: result.message }, 400);
    }

    return c.json({
      success: true,
      message: result.message,
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return c.json({
        error: "Validation failed",
        details: error.errors,
      }, 400);
    }
    return c.json({ error: "Failed to change password" }, 500);
  }
});

export { auth };
