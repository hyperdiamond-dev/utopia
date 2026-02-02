import type {
  Path,
  PathWithModules,
  PathWithProgress,
  UserPathProgress,
} from "../db/index.ts";
import { auditRepository, pathRepository } from "../db/index.ts";

export interface PathAccessResult {
  accessible: boolean;
  reason?: string;
  path?: Path;
}

export interface PathNavigationState {
  currentPaths: Path[];
  completedPaths: string[];
  availablePaths: string[];
  commonPaths: string[];
  progressPercentage: number;
}

export class PathService {
  /**
   * Get all paths with user progress and accessibility information
   */
  static async getUserPathOverview(userId: number): Promise<PathWithProgress[]> {
    return await pathRepository.getPathsWithProgress(userId);
  }

  /**
   * Check if a user can access a specific path
   */
  static async checkPathAccess(
    userId: number,
    pathName: string
  ): Promise<PathAccessResult> {
    const path = await pathRepository.getPathByName(pathName);
    if (!path) {
      return {
        accessible: false,
        reason: "Path not found",
      };
    }

    const accessible = await pathRepository.isPathAccessible(userId, path.id);

    if (!accessible) {
      return {
        accessible: false,
        reason: "Path not accessible - unlock via branching rules or complete prerequisites",
        path,
      };
    }

    return { accessible: true, path };
  }

  /**
   * Start a path for a user
   */
  static async startPath(
    userId: number,
    pathName: string,
    unlockedByRuleId?: number
  ): Promise<UserPathProgress> {
    const path = await pathRepository.getPathByName(pathName);
    if (!path) {
      throw new Error("Path not found");
    }

    // Check access (common paths are always accessible)
    const accessResult = await this.checkPathAccess(userId, pathName);
    if (!accessResult.accessible && !path.is_common) {
      throw new Error(accessResult.reason || "Path not accessible");
    }

    // Start the path
    const progress = await pathRepository.startPath(userId, path.id, unlockedByRuleId);

    // Log audit event
    await auditRepository.createAudit("PATH_START", userId, {
      path_id: path.id,
      path_name: pathName,
      sequence_order: path.sequence_order,
      is_common: path.is_common,
      unlocked_by_rule_id: unlockedByRuleId || null,
    });

    return progress;
  }

  /**
   * Complete a path for a user
   */
  static async completePath(
    userId: number,
    pathName: string
  ): Promise<UserPathProgress> {
    const path = await pathRepository.getPathByName(pathName);
    if (!path) {
      throw new Error("Path not found");
    }

    // Check access
    const accessResult = await this.checkPathAccess(userId, pathName);
    if (!accessResult.accessible) {
      throw new Error(accessResult.reason || "Path not accessible");
    }

    // Complete the path
    const progress = await pathRepository.completePath(userId, path.id);

    // Log completion event
    await auditRepository.createAudit("PATH_COMPLETION", userId, {
      path_id: path.id,
      path_name: pathName,
      sequence_order: path.sequence_order,
      is_common: path.is_common,
    });

    // Evaluate branching rules to unlock new paths
    await this.evaluatePathUnlocks(userId, path.id);

    return progress;
  }

  /**
   * Evaluate branching rules and unlock new paths based on path completion
   */
  static async evaluatePathUnlocks(
    userId: number,
    completedPathId: number
  ): Promise<Path[]> {
    // Import branching rules dynamically to avoid circular dependency
    const { branchingRuleRepository } = await import("../db/branchingRules.ts");

    // Get rules that have this path as a source
    const rules = await branchingRuleRepository.getRulesBySourcePath(completedPathId);
    const unlockedPaths: Path[] = [];

    for (const rule of rules) {
      if (!rule.target_path_id || !rule.is_active) continue;

      // Evaluate the rule
      const result = await branchingRuleRepository.evaluateSingleRule(rule, userId);
      if (result.unlocked) {
        const targetPath = await pathRepository.getPathById(rule.target_path_id);
        if (targetPath) {
          await pathRepository.unlockPath(userId, rule.target_path_id, rule.id);
          unlockedPaths.push(targetPath);

          // Log unlock event
          await auditRepository.createAudit("PATH_UNLOCK", userId, {
            path_id: rule.target_path_id,
            path_name: targetPath.name,
            unlocked_by_rule_id: rule.id,
            source_path_id: completedPathId,
          });
        }
      }
    }

    return unlockedPaths;
  }

  /**
   * Get path data with modules for display
   */
  static async getPathForUser(
    userId: number,
    pathName: string
  ): Promise<{
    path: Path;
    progress: UserPathProgress | null;
    accessible: boolean;
    isCompleted: boolean;
    canReview: boolean;
    modules: PathWithModules["modules"];
  } | null> {
    const path = await pathRepository.getPathByName(pathName);
    if (!path) return null;

    const progress = await pathRepository.getUserPathProgress(userId, path.id);
    const accessible = await pathRepository.isPathAccessible(userId, path.id);
    const isCompleted = progress?.status === "COMPLETED";
    const canReview = isCompleted;

    const pathWithModules = await pathRepository.getPathWithModules(path.id);
    const modules = pathWithModules?.modules || [];

    return {
      path,
      progress,
      accessible: accessible || path.is_common,
      isCompleted,
      canReview,
      modules,
    };
  }

  /**
   * Get modules within a path for a user
   */
  static async getPathModulesForUser(
    // deno-lint-ignore no-unused-vars
    userId: number,
    pathName: string
  ): Promise<PathWithModules["modules"]> {
    const path = await pathRepository.getPathByName(pathName);
    if (!path) {
      throw new Error("Path not found");
    }

    const pathWithModules = await pathRepository.getPathWithModules(path.id);
    return pathWithModules?.modules || [];
  }

  /**
   * Get user's currently active paths (in progress)
   */
  static async getActiveUserPaths(userId: number): Promise<Path[]> {
    return await pathRepository.getUserActivePaths(userId);
  }

  /**
   * Get user's unlocked paths (accessible but not necessarily started)
   */
  static async getUnlockedUserPaths(userId: number): Promise<Path[]> {
    return await pathRepository.getUserUnlockedPaths(userId);
  }

  /**
   * Get all common paths (always accessible)
   */
  static async getCommonPaths(): Promise<Path[]> {
    return await pathRepository.getCommonPaths();
  }

  /**
   * Get user's path progress statistics
   */
  static async getUserPathProgress(userId: number) {
    return await pathRepository.getUserPathCompletionStats(userId);
  }

  /**
   * Get child paths (sub-paths) for a parent path
   */
  static async getChildPaths(
    userId: number,
    parentPathName: string
  ): Promise<PathWithProgress[]> {
    const parentPath = await pathRepository.getPathByName(parentPathName);
    if (!parentPath) {
      throw new Error("Parent path not found");
    }

    const children = await pathRepository.getChildPaths(parentPath.id);
    const userProgress = await pathRepository.getUserProgress(userId);
    const progressMap = new Map(userProgress.map((p) => [p.path_id, p]));

    const childrenWithProgress: PathWithProgress[] = [];

    for (const child of children) {
      const progress = progressMap.get(child.id);
      const accessible = await pathRepository.isPathAccessible(userId, child.id);

      childrenWithProgress.push({
        ...child,
        user_progress: progress,
        accessible: accessible || child.is_common,
      });
    }

    return childrenWithProgress;
  }

  /**
   * Get the path navigation state for a user
   */
  static async getNavigationState(userId: number): Promise<PathNavigationState> {
    const paths = await pathRepository.getPathsWithProgress(userId);
    const stats = await pathRepository.getUserPathCompletionStats(userId);
    const currentPaths = await pathRepository.getUserActivePaths(userId);
    const commonPaths = await pathRepository.getCommonPaths();

    const completedPaths = paths
      .filter((p) => p.user_progress?.status === "COMPLETED")
      .map((p) => p.name);

    const availablePaths = paths
      .filter((p) => p.accessible)
      .map((p) => p.name);

    return {
      currentPaths,
      completedPaths,
      availablePaths,
      commonPaths: commonPaths.map((p) => p.name),
      progressPercentage: stats.completion_percentage,
    };
  }

  /**
   * Handle access denied scenarios with proper audit logging
   */
  static async logAccessDenied(
    userId: number,
    pathName: string,
    reason: string
  ): Promise<void> {
    const path = await pathRepository.getPathByName(pathName);

    await auditRepository.createAudit("PATH_ACCESS_DENIED", userId, {
      path_id: path?.id ?? null,
      path_name: pathName,
      reason,
      timestamp: new Date().toISOString(),
    });
  }

  /**
   * Initialize common paths for a new user (auto-start common paths)
   */
  static async initializeUserPaths(userId: number): Promise<void> {
    const commonPaths = await pathRepository.getCommonPaths();

    for (const path of commonPaths) {
      // Unlock common paths for the user
      await pathRepository.startPath(userId, path.id);
    }
  }
}
