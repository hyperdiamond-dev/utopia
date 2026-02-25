import { Hono } from "hono";
import { pathRepository, userRepository } from "../db/index.ts";
import { authMiddleware } from "../middleware/auth.ts";
import {
  pathAccessMiddleware,
  pathCompletionMiddleware,
  PathContext,
  pathNotCompletedMiddleware,
  pathReviewMiddleware,
} from "../middleware/pathAccess.ts";
import { PathService } from "../services/pathService.ts";

const paths = new Hono<PathContext>();

/**
 * GET /paths/list - Get all available paths (public)
 * Returns path definitions without user-specific data
 */
paths.get("/list", async (c) => {
  try {
    const allPaths = await pathRepository.getAllPaths();

    return c.json({
      paths: allPaths.map((path) => ({
        name: path.name,
        title: path.title,
        description: path.description,
        sequence_order: path.sequence_order,
        is_common: path.is_common,
        parent_path_id: path.parent_path_id,
      })),
    });
  } catch (error) {
    console.error("Failed to get path list:", error);
    return c.json({ error: "Failed to get path list" }, 500);
  }
});

/**
 * GET /paths - Get user's path overview
 * Returns all paths with progress and accessibility info
 */
paths.get("/", authMiddleware, async (c) => {
  const user = c.get("user");
  if (!user) {
    return c.json({ error: "User not found in context" }, 500);
  }
  try {
    const userRecord = await userRepository.findByUuid(user.uuid);
    if (!userRecord) {
      return c.json({ error: "User not found" }, 404);
    }

    const [pathOverview, navigationState, progressStats] = await Promise.all([
      PathService.getUserPathOverview(userRecord.id),
      PathService.getNavigationState(userRecord.id),
      PathService.getUserPathProgress(userRecord.id),
    ]);

    return c.json({
      paths: pathOverview,
      navigation: navigationState,
      progress: progressStats,
    });
  } catch (error) {
    console.error("Failed to get path overview:", error);
    return c.json({ error: "Failed to get path overview" }, 500);
  }
});

/**
 * GET /paths/common - Get common (always accessible) paths
 */
paths.get("/common", authMiddleware, async (c) => {
  try {
    const commonPaths = await PathService.getCommonPaths();

    return c.json({
      common_paths: commonPaths.map((path) => ({
        name: path.name,
        title: path.title,
        description: path.description,
        sequence_order: path.sequence_order,
      })),
    });
  } catch (error) {
    console.error("Failed to get common paths:", error);
    return c.json({ error: "Failed to get common paths" }, 500);
  }
});

/**
 * GET /paths/active - Get user's currently active paths
 * Returns paths they are in progress with
 */
paths.get("/active", authMiddleware, async (c) => {
  const user = c.get("user");
  if (!user) {
    return c.json({ error: "User not found in context" }, 500);
  }
  try {
    const userRecord = await userRepository.findByUuid(user.uuid);
    if (!userRecord) {
      return c.json({ error: "User not found" }, 404);
    }

    const activePaths = await PathService.getActiveUserPaths(userRecord.id);

    return c.json({
      active_paths: activePaths.map((path) => ({
        name: path.name,
        title: path.title,
        description: path.description,
        sequence_order: path.sequence_order,
        is_common: path.is_common,
      })),
    });
  } catch (error) {
    console.error("Failed to get active paths:", error);
    return c.json({ error: "Failed to get active paths" }, 500);
  }
});

/**
 * GET /paths/unlocked - Get user's unlocked paths
 * Returns paths that are accessible but not necessarily started
 */
paths.get("/unlocked", authMiddleware, async (c) => {
  const user = c.get("user");
  if (!user) {
    return c.json({ error: "User not found in context" }, 500);
  }
  try {
    const userRecord = await userRepository.findByUuid(user.uuid);
    if (!userRecord) {
      return c.json({ error: "User not found" }, 404);
    }

    const unlockedPaths = await PathService.getUnlockedUserPaths(userRecord.id);

    return c.json({
      unlocked_paths: unlockedPaths.map((path) => ({
        name: path.name,
        title: path.title,
        description: path.description,
        sequence_order: path.sequence_order,
        is_common: path.is_common,
      })),
    });
  } catch (error) {
    console.error("Failed to get unlocked paths:", error);
    return c.json({ error: "Failed to get unlocked paths" }, 500);
  }
});

/**
 * GET /paths/:pathName - Get specific path data
 * Protected by access middleware
 */
paths.get(
  "/:pathName",
  authMiddleware,
  pathAccessMiddleware,
  pathReviewMiddleware,
  async (c) => {
    const userRecord = c.get("userRecord");
    const pathAccess = c.get("pathAccess");

    if (!userRecord) {
      return c.json({ error: "User record not found" }, 500);
    }

    if (!pathAccess) {
      return c.json({ error: "Path access validation failed" }, 500);
    }

    try {
      const pathData = await PathService.getPathForUser(
        userRecord.id,
        pathAccess.pathName,
      );

      if (!pathData) {
        return c.json({ error: "Path not found" }, 404);
      }

      return c.json({
        path: {
          name: pathData.path.name,
          title: pathData.path.title,
          description: pathData.path.description,
          sequence_order: pathData.path.sequence_order,
          is_common: pathData.path.is_common,
          parent_path_id: pathData.path.parent_path_id,
        },
        progress: {
          status: pathData.progress?.status || "NOT_STARTED",
          started_at: pathData.progress?.started_at,
          completed_at: pathData.progress?.completed_at,
          unlocked_by_rule_id: pathData.progress?.unlocked_by_rule_id,
        },
        modules: pathData.modules.map((m) => ({
          id: m.id,
          name: m.name,
          title: m.title,
          description: m.description,
          sequence_order: m.sequence_order,
          is_required: m.is_required,
        })),
        accessible: pathData.accessible,
        is_completed: pathData.isCompleted,
        can_review: pathData.canReview,
      });
    } catch (error) {
      console.error("Failed to get path data:", error);
      return c.json({ error: "Failed to get path data" }, 500);
    }
  },
);

/**
 * GET /paths/:pathName/modules - Get modules in a path
 * Returns the modules within a specific path
 */
paths.get(
  "/:pathName/modules",
  authMiddleware,
  pathAccessMiddleware,
  async (c) => {
    const userRecord = c.get("userRecord");
    const pathAccess = c.get("pathAccess");

    if (!userRecord) {
      return c.json({ error: "User record not found" }, 500);
    }

    if (!pathAccess) {
      return c.json({ error: "Path access validation failed" }, 500);
    }

    try {
      const modules = await PathService.getPathModulesForUser(
        userRecord.id,
        pathAccess.pathName,
      );

      return c.json({
        path_name: pathAccess.pathName,
        modules: modules.map((m) => ({
          id: m.id,
          name: m.name,
          title: m.title,
          description: m.description,
          sequence_order: m.sequence_order,
          is_required: m.is_required,
        })),
        module_count: modules.length,
      });
    } catch (error) {
      console.error("Failed to get path modules:", error);
      return c.json({ error: "Failed to get path modules" }, 500);
    }
  },
);

/**
 * GET /paths/:pathName/children - Get sub-paths (child paths)
 * Returns paths that are nested under this path
 */
paths.get(
  "/:pathName/children",
  authMiddleware,
  pathAccessMiddleware,
  async (c) => {
    const userRecord = c.get("userRecord");
    const pathAccess = c.get("pathAccess");

    if (!userRecord) {
      return c.json({ error: "User record not found" }, 500);
    }

    if (!pathAccess) {
      return c.json({ error: "Path access validation failed" }, 500);
    }

    try {
      const children = await PathService.getChildPaths(
        userRecord.id,
        pathAccess.pathName,
      );

      return c.json({
        parent_path: pathAccess.pathName,
        children: children.map((child) => ({
          name: child.name,
          title: child.title,
          description: child.description,
          sequence_order: child.sequence_order,
          is_common: child.is_common,
          accessible: child.accessible,
          progress: child.user_progress
            ? {
              status: child.user_progress.status,
              started_at: child.user_progress.started_at,
              completed_at: child.user_progress.completed_at,
            }
            : null,
        })),
      });
    } catch (error) {
      console.error("Failed to get child paths:", error);
      return c.json({ error: "Failed to get child paths" }, 500);
    }
  },
);

/**
 * POST /paths/:pathName/start - Start a path
 * Marks path as in progress
 */
paths.post(
  "/:pathName/start",
  authMiddleware,
  pathAccessMiddleware,
  pathNotCompletedMiddleware,
  async (c) => {
    const userRecord = c.get("userRecord");
    const pathAccess = c.get("pathAccess");

    if (!userRecord) {
      return c.json({ error: "User record not found" }, 500);
    }

    if (!pathAccess) {
      return c.json({ error: "Path access validation failed" }, 500);
    }

    try {
      const progress = await PathService.startPath(
        userRecord.id,
        pathAccess.pathName,
      );

      return c.json({
        message: "Path started successfully",
        progress: {
          status: progress.status,
          started_at: progress.started_at,
          path_id: progress.path_id,
        },
      });
    } catch (error) {
      console.error("Failed to start path:", error);
      return c.json({
        error: error instanceof Error ? error.message : "Failed to start path",
      }, 500);
    }
  },
);

/**
 * POST /paths/:pathName/complete - Complete a path
 * Marks path as completed and evaluates branching rules
 */
paths.post(
  "/:pathName/complete",
  authMiddleware,
  pathAccessMiddleware,
  pathCompletionMiddleware,
  async (c) => {
    const userRecord = c.get("userRecord");
    const pathAccess = c.get("pathAccess");

    if (!userRecord) {
      return c.json({ error: "User record not found" }, 500);
    }

    if (!pathAccess) {
      return c.json({ error: "Path access validation failed" }, 500);
    }

    try {
      const progress = await PathService.completePath(
        userRecord.id,
        pathAccess.pathName,
      );

      // Get unlocked paths
      const unlockedPaths = await PathService.getUnlockedUserPaths(
        userRecord.id,
      );

      return c.json({
        message: "Path completed successfully",
        completed_at: progress.completed_at,
        unlocked_paths: unlockedPaths.map((p) => ({
          name: p.name,
          title: p.title,
        })),
        progress_stats: await PathService.getUserPathProgress(userRecord.id),
      });
    } catch (error) {
      console.error("Failed to complete path:", error);
      return c.json({
        error: error instanceof Error
          ? error.message
          : "Failed to complete path",
      }, 500);
    }
  },
);

/**
 * GET /paths/progress/stats - Get detailed path progress statistics
 */
paths.get("/progress/stats", authMiddleware, async (c) => {
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
      PathService.getUserPathProgress(userRecord.id),
      PathService.getNavigationState(userRecord.id),
    ]);

    return c.json({
      ...progressStats,
      navigation: navigationState,
    });
  } catch (error) {
    console.error("Failed to get path progress stats:", error);
    return c.json({ error: "Failed to get path progress statistics" }, 500);
  }
});

export { paths };
