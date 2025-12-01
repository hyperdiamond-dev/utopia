/**
 * Submodule Access Middleware
 * Handles access control for submodule endpoints
 */

import { createMiddleware } from "hono/factory";
import { userRepository } from "../db/index.ts";
import { User } from "../db/users.ts";
import { SubmoduleService } from "../services/submoduleService.ts";
import { submoduleRepository } from "../db/submodules.ts";

export type SubmoduleContext = {
  Variables: {
    user?: { uuid: string; id?: string; name: string };
    userRecord?: User;
    submoduleAccess?: {
      moduleName: string;
      submoduleName: string;
      accessible: boolean;
      reason?: string;
    };
  };
};

/**
 * Middleware to check if a user can access a specific submodule
 * Expects module name and submodule name in URL path as :moduleName and :submoduleName
 */
export const submoduleAccessMiddleware = createMiddleware(async (c, next) => {
  const user = c.get("user");
  if (!user) {
    return c.json({ error: "Authentication required" }, 401);
  }

  // Get module and submodule names from URL parameters
  const moduleName = c.req.param("moduleName");
  const submoduleName = c.req.param("submoduleName");

  if (!moduleName || !submoduleName) {
    return c.json(
      { error: "Module name and submodule name required" },
      400,
    );
  }

  try {
    // Get user record from database
    const userRecord = await userRepository.findByUuid(user.id);
    if (!userRecord) {
      return c.json({ error: "User not found" }, 404);
    }

    // Get submodule
    const submodule = await submoduleRepository.getSubmoduleByName(
      moduleName,
      submoduleName,
    );

    if (!submodule) {
      return c.json({ error: "Submodule not found" }, 404);
    }

    // Check parent module access first
    const moduleAccessible = await SubmoduleService.checkModuleAccess(
      userRecord.id,
      submodule.module_id,
    );

    if (!moduleAccessible) {
      return c.json(
        {
          error: "Parent module not accessible",
          reason: "Complete previous modules first",
          message:
            "You must unlock the parent module before accessing this submodule",
        },
        403,
      );
    }

    // Check submodule access (sequential + branching rules)
    const submoduleAccessible = await SubmoduleService.isSubmoduleAccessible(
      userRecord.id,
      submodule.id,
    );

    if (!submoduleAccessible) {
      // Get next accessible submodule
      const nextSubmodule = await SubmoduleService.getNextAccessibleSubmodule(
        userRecord.id,
        submodule.module_id,
      );

      return c.json(
        {
          error: "Submodule access denied",
          reason:
            "Complete previous submodules or meet branching requirements first",
          next_submodule: nextSubmodule?.name,
          message: nextSubmodule
            ? `Please complete "${nextSubmodule.title}" first`
            : "Complete previous submodules to unlock this content",
        },
        403,
      );
    }

    // Store access information in context for use in route handlers
    c.set("userRecord", userRecord);
    c.set("submoduleAccess", {
      moduleName,
      submoduleName,
      accessible: true,
    });

    await next();
  } catch (error) {
    console.error("Submodule access check failed:", error);
    return c.json({ error: "Failed to check submodule access" }, 500);
  }
});

/**
 * Middleware specifically for submodule completion endpoints
 * Ensures user has started the submodule before allowing completion
 */
export const submoduleCompletionMiddleware = createMiddleware(
  async (c, next) => {
    const userRecord = c.get("userRecord");
    const submoduleAccess = c.get("submoduleAccess");

    if (!userRecord || !submoduleAccess) {
      return c.json(
        { error: "Submodule access validation required" },
        400,
      );
    }

    try {
      // Get submodule data to check current progress
      const submoduleData = await SubmoduleService.getSubmoduleByName(
        userRecord.id,
        submoduleAccess.moduleName,
        submoduleAccess.submoduleName,
      );

      if (!submoduleData) {
        return c.json({ error: "Submodule not found" }, 404);
      }

      // If submodule hasn't been started, require it to be started first
      const progress = submoduleData.user_progress;
      if (!progress || progress.status === "NOT_STARTED") {
        return c.json(
          {
            error: "Submodule not started",
            message:
              "You must start the submodule before you can complete it. Call the /start endpoint first.",
          },
          400,
        );
      }

      // If already completed, it's read-only
      if (progress.status === "COMPLETED") {
        return c.json(
          {
            error: "Submodule already completed",
            message: "This submodule is read-only and cannot be modified.",
          },
          400,
        );
      }

      await next();
    } catch (error) {
      console.error("Submodule completion check failed:", error);
      return c.json(
        { error: "Failed to validate submodule completion" },
        500,
      );
    }
  },
);

/**
 * Middleware to prevent editing completed submodules
 * Used for save/update endpoints
 */
export const submoduleNotCompletedMiddleware = createMiddleware(
  async (c, next) => {
    const userRecord = c.get("userRecord");
    const submoduleAccess = c.get("submoduleAccess");

    if (!userRecord || !submoduleAccess) {
      return c.json(
        { error: "Submodule access validation required" },
        400,
      );
    }

    try {
      // Get submodule data to check current progress
      const submoduleData = await SubmoduleService.getSubmoduleByName(
        userRecord.id,
        submoduleAccess.moduleName,
        submoduleAccess.submoduleName,
      );

      if (!submoduleData) {
        return c.json({ error: "Submodule not found" }, 404);
      }

      // If already completed, it's read-only
      const progress = submoduleData.user_progress;
      if (progress?.status === "COMPLETED") {
        return c.json(
          {
            error: "Submodule is read-only",
            message:
              "Completed submodules cannot be modified. You can review your responses using the /responses endpoint.",
          },
          403,
        );
      }

      await next();
    } catch (error) {
      console.error("Submodule completion status check failed:", error);
      return c.json(
        { error: "Failed to check submodule status" },
        500,
      );
    }
  },
);

/**
 * Middleware to allow read-only access to completed submodules
 * Used for review/response viewing endpoints
 */
export const submoduleReviewMiddleware = createMiddleware(async (c, next) => {
  const userRecord = c.get("userRecord");
  const submoduleAccess = c.get("submoduleAccess");

  if (!userRecord || !submoduleAccess) {
    return c.json({ error: "Submodule access validation required" }, 400);
  }

  try {
    // Get submodule data
    const submoduleData = await SubmoduleService.getSubmoduleByName(
      userRecord.id,
      submoduleAccess.moduleName,
      submoduleAccess.submoduleName,
    );

    if (!submoduleData) {
      return c.json({ error: "Submodule not found" }, 404);
    }

    // Allow review only if submodule is completed
    const progress = submoduleData.user_progress;
    if (!progress || progress.status !== "COMPLETED") {
      return c.json(
        {
          error: "Submodule not completed",
          message:
            "You can only review responses after completing the submodule.",
        },
        403,
      );
    }

    await next();
  } catch (error) {
    console.error("Submodule review check failed:", error);
    return c.json({ error: "Failed to check submodule review access" }, 500);
  }
});
