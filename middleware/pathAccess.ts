import { createMiddleware } from "hono/factory";
import { userRepository } from "../db/index.ts";
import type { User } from "../db/users.ts";
import { PathService } from "../services/pathService.ts";

export type PathContext = {
  Variables: {
    user?: { uuid: string; id?: string; name: string };
    userRecord?: User;
    pathAccess?: {
      pathName: string;
      accessible: boolean;
      isCompleted: boolean;
      reason?: string;
    };
  };
};

/**
 * Middleware to check if a user can access a specific path
 * Expects path name to be in the URL path as :pathName
 */
export const pathAccessMiddleware = createMiddleware(async (c, next) => {
  const user = c.get("user");
  if (!user) {
    return c.json({ error: "Authentication required" }, 401);
  }

  // Get path name from URL parameters
  const pathName = c.req.param("pathName");
  if (!pathName) {
    return c.json({ error: "Path name required" }, 400);
  }

  try {
    // Get user record from database
    const userRecord = await userRepository.findByUuid(user.id);
    if (!userRecord) {
      return c.json({ error: "User not found" }, 404);
    }

    // Check path access
    const accessResult = await PathService.checkPathAccess(
      userRecord.id,
      pathName,
    );

    if (!accessResult.accessible) {
      // Log the access denial
      await PathService.logAccessDenied(
        userRecord.id,
        pathName,
        accessResult.reason || "Unknown",
      );

      return c.json({
        error: "Path access denied",
        reason: accessResult.reason,
        message: "Unlock this path via branching rules or complete prerequisites",
      }, 403);
    }

    // Get path completion status
    const pathData = await PathService.getPathForUser(userRecord.id, pathName);
    const isCompleted = pathData?.isCompleted || false;

    // Store access information in context for use in route handlers
    c.set("userRecord", userRecord);
    c.set("pathAccess", {
      pathName,
      accessible: true,
      isCompleted,
    });

    await next();
  } catch (_error) {
    console.error("Path access check failed:", _error);
    return c.json({ error: "Failed to check path access" }, 500);
  }
});

/**
 * Middleware specifically for path completion endpoints
 * Ensures user has started the path before allowing completion
 */
export const pathCompletionMiddleware = createMiddleware(async (c, next) => {
  const userRecord = c.get("userRecord");
  const pathAccess = c.get("pathAccess");

  if (!userRecord || !pathAccess) {
    return c.json({ error: "Path access validation required" }, 400);
  }

  try {
    // Get path data to check current progress
    const pathData = await PathService.getPathForUser(
      userRecord.id,
      pathAccess.pathName,
    );

    if (!pathData) {
      return c.json({ error: "Path not found" }, 404);
    }

    // Check if path has been started
    if (!pathData.progress || pathData.progress.status === "NOT_STARTED") {
      return c.json({
        error: "Path not started",
        message: "Please start the path before attempting to complete it",
      }, 400);
    }

    // Check if path is already completed
    if (pathData.isCompleted) {
      return c.json({
        error: "Path already completed",
        message: "This path has already been completed and cannot be resubmitted",
      }, 400);
    }

    await next();
  } catch (_error) {
    console.error("Path completion check failed:", _error);
    return c.json({ error: "Failed to validate path completion" }, 500);
  }
});

/**
 * Middleware to prevent modifications to completed paths
 * Ensures paths are read-only after completion
 */
export const pathNotCompletedMiddleware = createMiddleware(async (c, next) => {
  const userRecord = c.get("userRecord");
  const pathAccess = c.get("pathAccess");

  if (!userRecord || !pathAccess) {
    return c.json({ error: "Path access validation required" }, 400);
  }

  try {
    // Get path data to check completion status
    const pathData = await PathService.getPathForUser(
      userRecord.id,
      pathAccess.pathName,
    );

    if (!pathData) {
      return c.json({ error: "Path not found" }, 404);
    }

    // Check if path is already completed
    if (pathData.isCompleted) {
      return c.json({
        error: "Path is read-only",
        message:
          "This path has been completed and can no longer be modified. Completed paths are read-only.",
      }, 403);
    }

    await next();
  } catch (_error) {
    console.error("Path completion check failed:", _error);
    return c.json({ error: "Failed to validate path status" }, 500);
  }
});

/**
 * Middleware for read-only access to completed paths
 * Allows viewing but not modification of completed paths
 */
export const pathReviewMiddleware = createMiddleware(async (c, next) => {
  const userRecord = c.get("userRecord");
  const pathAccess = c.get("pathAccess");

  if (!userRecord || !pathAccess) {
    return c.json({ error: "Path access validation required" }, 400);
  }

  try {
    const pathData = await PathService.getPathForUser(
      userRecord.id,
      pathAccess.pathName,
    );

    if (!pathData) {
      return c.json({ error: "Path not found" }, 404);
    }

    // For review access, path must be completed or at least accessible
    if (!pathData.accessible && !pathData.isCompleted) {
      return c.json({
        error: "Path not accessible",
        message: "Unlock this path via branching rules or complete prerequisites",
      }, 403);
    }

    await next();
  } catch (_error) {
    console.error("Path review check failed:", _error);
    return c.json({ error: "Failed to validate path access" }, 500);
  }
});
