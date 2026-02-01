import { Hono } from "hono";
import { z } from "zod";
import { moduleRepository, userRepository } from "../db/index.ts";
import { authMiddleware } from "../middleware/auth.ts";
import {
  moduleAccessMiddleware,
  moduleCompletionMiddleware,
  ModuleContext,
  moduleNotCompletedMiddleware,
  moduleReviewMiddleware,
} from "../middleware/moduleAccess.ts";
import { ModuleService } from "../services/moduleService.ts";

const modules = new Hono<ModuleContext>();

// Validation schemas
const moduleResponseSchema = z.object({
  responses: z.record(z.unknown()),
  metadata: z.record(z.unknown()).optional(),
});

const partialResponseSchema = z.object({
  responses: z.record(z.unknown()),
});

/**
 * GET /modules/list - Get all available modules (public)
 * Returns module definitions without user-specific data
 */
modules.get("/list", async (c) => {
  try {
    const allModules = await moduleRepository.getAllModules();

    return c.json({
      modules: allModules.map((module) => ({
        name: module.name,
        title: module.title,
        description: module.description,
        sequence_order: module.sequence_order,
      })),
    });
  } catch (error) {
    console.error("Failed to get module list:", error);
    return c.json({ error: "Failed to get module list" }, 500);
  }
});

/**
 * GET /modules - Get user's module overview
 * Returns all modules with progress and accessibility info
 */
modules.get("/", authMiddleware, async (c) => {
  const user = c.get("user");
  if (!user) {
    return c.json({ error: "User not found in context" }, 500);
  }
  try {
    const userRecord = await userRepository.findByUuid(user.uuid);
    if (!userRecord) {
      return c.json({ error: "User not found" }, 404);
    }

    const [moduleOverview, navigationState, progressStats] = await Promise.all([
      ModuleService.getUserModuleOverview(userRecord.id),
      ModuleService.getNavigationState(userRecord.id),
      ModuleService.getUserProgress(userRecord.id),
    ]);

    return c.json({
      modules: moduleOverview,
      navigation: navigationState,
      progress: progressStats,
    });
  } catch (error) {
    console.error("Failed to get module overview:", error);
    return c.json({ error: "Failed to get module overview" }, 500);
  }
});

/**
 * GET /modules/current - Get user's current module
 * Returns the module they should be working on
 */
modules.get("/current", authMiddleware, async (c) => {
  const user = c.get("user");
  if (!user) {
    return c.json({ error: "User not found in context" }, 500);
  }
  try {
    const userRecord = await userRepository.findByUuid(user.uuid);
    if (!userRecord) {
      return c.json({ error: "User not found" }, 404);
    }

    const currentModule = await ModuleService.getCurrentModule(userRecord.id);

    if (!currentModule) {
      return c.json({
        message: "All modules completed",
        current_module: null,
      });
    }

    const moduleData = await ModuleService.getModuleForUser(
      userRecord.id,
      currentModule.name,
    );

    return c.json({
      current_module: currentModule,
      progress: moduleData?.progress,
      accessible: moduleData?.accessible,
      is_completed: moduleData?.isCompleted,
    });
  } catch (error) {
    console.error("Failed to get current module:", error);
    return c.json({ error: "Failed to get current module" }, 500);
  }
});

/**
 * GET /modules/:moduleName - Get specific module data
 * Protected by sequential access middleware
 */
modules.get(
  "/:moduleName",
  authMiddleware,
  moduleAccessMiddleware,
  moduleReviewMiddleware,
  async (c) => {
    const userRecord = c.get("userRecord");
    const moduleAccess = c.get("moduleAccess");

    if (!userRecord) {
      return c.json({ error: "User record not found" }, 500);
    }

    if (!moduleAccess) {
      return c.json({ error: "Module access validation failed" }, 500);
    }

    try {
      const moduleData = await ModuleService.getModuleForUser(
        userRecord.id,
        moduleAccess.moduleName,
      );

      if (!moduleData) {
        return c.json({ error: "Module not found" }, 404);
      }

      return c.json({
        module: {
          name: moduleData.module.name,
          title: moduleData.module.title,
          description: moduleData.module.description,
          sequence_order: moduleData.module.sequence_order,
        },
        progress: {
          status: moduleData.progress?.status || "NOT_STARTED",
          started_at: moduleData.progress?.started_at,
          completed_at: moduleData.progress?.completed_at,
          response_data: moduleData.progress?.response_data,
        },
        accessible: moduleData.accessible,
        is_completed: moduleData.isCompleted,
        can_review: moduleData.canReview,
      });
    } catch (error) {
      console.error("Failed to get module data:", error);
      return c.json({ error: "Failed to get module data" }, 500);
    }
  },
);

/**
 * POST /modules/:moduleName/start - Start a module
 * Marks module as in progress
 */
modules.post(
  "/:moduleName/start",
  authMiddleware,
  moduleAccessMiddleware,
  moduleNotCompletedMiddleware,
  async (c) => {
    const userRecord = c.get("userRecord");
    const moduleAccess = c.get("moduleAccess");

    if (!userRecord) {
      return c.json({ error: "User record not found" }, 500);
    }

    if (!moduleAccess) {
      return c.json({ error: "Module access validation failed" }, 500);
    }

    try {
      const progress = await ModuleService.startModule(
        userRecord.id,
        moduleAccess.moduleName,
      );

      return c.json({
        message: "Module started successfully",
        progress: {
          status: progress.status,
          started_at: progress.started_at,
          module_id: progress.module_id,
        },
      });
    } catch (error) {
      console.error("Failed to start module:", error);
      return c.json({
        error: error instanceof Error
          ? error.message
          : "Failed to start module",
      }, 500);
    }
  },
);

/**
 * POST /modules/:moduleName/save - Save partial progress
 * Updates response data without completing the module
 */
modules.post(
  "/:moduleName/save",
  authMiddleware,
  moduleAccessMiddleware,
  moduleNotCompletedMiddleware,
  async (c) => {
    const userRecord = c.get("userRecord");
    const moduleAccess = c.get("moduleAccess");

    if (!userRecord) {
      return c.json({ error: "User record not found" }, 500);
    }

    if (!moduleAccess) {
      return c.json({ error: "Module access validation failed" }, 500);
    }

    try {
      const body = await c.req.json();
      const { responses } = partialResponseSchema.parse(body);

      await ModuleService.saveModuleProgress(
        userRecord.id,
        moduleAccess.moduleName,
        responses,
      );

      return c.json({
        message: "Progress saved successfully",
        saved_at: new Date().toISOString(),
        response_count: Object.keys(responses).length,
      });
    } catch (error) {
      if (error instanceof z.ZodError) {
        return c.json(
          { error: "Invalid request data", details: error.errors },
          400,
        );
      }

      console.error("Failed to save module progress:", error);
      return c.json({
        error: error instanceof Error
          ? error.message
          : "Failed to save progress",
      }, 500);
    }
  },
);

/**
 * POST /modules/:moduleName/complete - Complete a module
 * Marks module as completed and unlocks next module
 */
modules.post(
  "/:moduleName/complete",
  authMiddleware,
  moduleAccessMiddleware,
  moduleCompletionMiddleware,
  async (c) => {
    const userRecord = c.get("userRecord");
    const moduleAccess = c.get("moduleAccess");

    if (!userRecord) {
      return c.json({ error: "User record not found" }, 500);
    }

    if (!moduleAccess) {
      return c.json({ error: "Module access validation failed" }, 500);
    }

    try {
      const body = await c.req.json();
      const submissionData = moduleResponseSchema.parse(body);

      const progress = await ModuleService.completeModule(
        userRecord.id,
        moduleAccess.moduleName,
        submissionData,
      );

      // Get next available module
      const nextModule = await ModuleService.getCurrentModule(userRecord.id);

      return c.json({
        message: "Module completed successfully",
        completed_at: progress.completed_at,
        next_module: nextModule
          ? {
            name: nextModule.name,
            title: nextModule.title,
            sequence_order: nextModule.sequence_order,
          }
          : null,
        progress_stats: await ModuleService.getUserProgress(userRecord.id),
      });
    } catch (error) {
      if (error instanceof z.ZodError) {
        return c.json({
          error: "Invalid submission data",
          details: error.errors,
        }, 400);
      }

      console.error("Failed to complete module:", error);
      return c.json({
        error: error instanceof Error
          ? error.message
          : "Failed to complete module",
      }, 500);
    }
  },
);

/**
 * GET /modules/:moduleName/responses - Get module responses (read-only)
 * For reviewing completed modules
 */
modules.get(
  "/:moduleName/responses",
  authMiddleware,
  moduleAccessMiddleware,
  moduleReviewMiddleware,
  async (c) => {
    const userRecord = c.get("userRecord");
    const moduleAccess = c.get("moduleAccess");

    if (!userRecord) {
      return c.json({ error: "User record not found" }, 500);
    }

    if (!moduleAccess) {
      return c.json({ error: "Module access validation failed" }, 500);
    }

    try {
      const moduleData = await ModuleService.getModuleForUser(
        userRecord.id,
        moduleAccess.moduleName,
      );

      if (!moduleData?.progress?.response_data) {
        return c.json({
          message: "No responses found for this module",
          responses: null,
        });
      }

      return c.json({
        module_name: moduleAccess.moduleName,
        responses: moduleData.progress.response_data,
        completed_at: moduleData.progress.completed_at,
        readonly: moduleData.isCompleted,
      });
    } catch (error) {
      console.error("Failed to get module responses:", error);
      return c.json({ error: "Failed to get module responses" }, 500);
    }
  },
);

/**
 * GET /modules/progress/stats - Get detailed progress statistics
 */
modules.get("/progress/stats", authMiddleware, async (c) => {
  const user = c.get("user");
  if (!user) {
    return c.json({ error: "User not found in context" }, 500);
  }
  try {
    const userRecord = await userRepository.findByUuid(user.uuid);
    if (!userRecord) {
      return c.json({ error: "User not found" }, 404);
    }

    const [progressStats, navigationState] = await Promise.all([
      ModuleService.getUserProgress(userRecord.id),
      ModuleService.getNavigationState(userRecord.id),
    ]);

    return c.json({
      ...progressStats,
      navigation: navigationState,
    });
  } catch (error) {
    console.error("Failed to get progress stats:", error);
    return c.json({ error: "Failed to get progress statistics" }, 500);
  }
});

export { modules };
