import { sql } from "./connection.ts";
import type { Module } from "./modules.ts";

export type PathStatus = "NOT_STARTED" | "IN_PROGRESS" | "COMPLETED";

export interface Path {
  id: number;
  name: string;
  title: string;
  description: string | null;
  parent_path_id: number | null;
  sequence_order: number;
  is_common: boolean;
  is_active: boolean;
  created_at: Date;
  updated_at: Date;
}

export interface PathModule {
  id: number;
  path_id: number;
  module_id: number;
  sequence_order: number;
  is_required: boolean;
  created_at: Date;
}

export interface QuestionPath {
  id: number;
  question_id: number;
  path_id: number;
  sequence_order: number;
  created_at: Date;
}

export interface UserPathProgress {
  id: number;
  user_id: number;
  path_id: number;
  status: PathStatus;
  unlocked_by_rule_id: number | null;
  started_at: Date | null;
  completed_at: Date | null;
  created_at: Date;
  updated_at: Date;
}

export interface PathWithProgress extends Path {
  user_progress?: UserPathProgress;
  accessible: boolean;
  modules?: Module[];
  children?: Path[];
}

export interface PathWithModules extends Path {
  modules: (Module & { sequence_order: number; is_required: boolean })[];
}

export class PathRepository {
  // ============================================================================
  // PATH CRUD OPERATIONS
  // ============================================================================

  // Get all active paths in sequence order
  async getAllPaths(includeInactive = false): Promise<Path[]> {
    const result = includeInactive
      ? await sql`
        SELECT * FROM terminal_utopia.paths
        ORDER BY sequence_order ASC
      `
      : await sql`
        SELECT * FROM terminal_utopia.paths
        WHERE is_active = true
        ORDER BY sequence_order ASC
      `;
    return result as Path[];
  }

  // Get path by name
  async getPathByName(name: string): Promise<Path | null> {
    const result = await sql`
      SELECT * FROM terminal_utopia.paths
      WHERE name = ${name} AND is_active = true
    `;
    return (result[0] as Path) || null;
  }

  // Get path by ID
  async getPathById(id: number): Promise<Path | null> {
    const result = await sql`
      SELECT * FROM terminal_utopia.paths
      WHERE id = ${id} AND is_active = true
    `;
    return (result[0] as Path) || null;
  }

  // Get child paths (sub-paths)
  async getChildPaths(parentPathId: number): Promise<Path[]> {
    const result = await sql`
      SELECT * FROM terminal_utopia.paths
      WHERE parent_path_id = ${parentPathId} AND is_active = true
      ORDER BY sequence_order ASC
    `;
    return result as Path[];
  }

  // Get root paths (paths without parent)
  async getRootPaths(): Promise<Path[]> {
    const result = await sql`
      SELECT * FROM terminal_utopia.paths
      WHERE parent_path_id IS NULL AND is_active = true
      ORDER BY sequence_order ASC
    `;
    return result as Path[];
  }

  // Get common paths (always accessible)
  async getCommonPaths(): Promise<Path[]> {
    const result = await sql`
      SELECT * FROM terminal_utopia.paths
      WHERE is_common = true AND is_active = true
      ORDER BY sequence_order ASC
    `;
    return result as Path[];
  }

  // Create a new path
  async createPath(data: {
    name: string;
    title: string;
    description?: string;
    parent_path_id?: number;
    sequence_order?: number;
    is_common?: boolean;
  }): Promise<Path> {
    const result = await sql`
      INSERT INTO terminal_utopia.paths (
        name, title, description, parent_path_id, sequence_order, is_common
      )
      VALUES (
        ${data.name},
        ${data.title},
        ${data.description || null},
        ${data.parent_path_id || null},
        ${data.sequence_order || 0},
        ${data.is_common || false}
      )
      RETURNING *
    `;
    return result[0] as Path;
  }

  // Update a path
  async updatePath(
    id: number,
    data: Partial<{
      name: string;
      title: string;
      description: string | null;
      parent_path_id: number | null;
      sequence_order: number;
      is_common: boolean;
      is_active: boolean;
    }>,
  ): Promise<Path | null> {
    const updates: string[] = [];
    const values: unknown[] = [];

    if (data.name !== undefined) {
      updates.push("name");
      values.push(data.name);
    }
    if (data.title !== undefined) {
      updates.push("title");
      values.push(data.title);
    }
    if (data.description !== undefined) {
      updates.push("description");
      values.push(data.description);
    }
    if (data.parent_path_id !== undefined) {
      updates.push("parent_path_id");
      values.push(data.parent_path_id);
    }
    if (data.sequence_order !== undefined) {
      updates.push("sequence_order");
      values.push(data.sequence_order);
    }
    if (data.is_common !== undefined) {
      updates.push("is_common");
      values.push(data.is_common);
    }
    if (data.is_active !== undefined) {
      updates.push("is_active");
      values.push(data.is_active);
    }

    if (updates.length === 0) {
      return this.getPathById(id);
    }

    // Build dynamic update query
    const result = await sql`
      UPDATE terminal_utopia.paths
      SET
        name = COALESCE(${data.name}, name),
        title = COALESCE(${data.title}, title),
        description = COALESCE(${data.description}, description),
        parent_path_id = ${
      data.parent_path_id !== undefined
        ? data.parent_path_id
        : sql`parent_path_id`
    },
        sequence_order = COALESCE(${data.sequence_order}, sequence_order),
        is_common = COALESCE(${data.is_common}, is_common),
        is_active = COALESCE(${data.is_active}, is_active),
        updated_at = NOW()
      WHERE id = ${id}
      RETURNING *
    `;
    return (result[0] as Path) || null;
  }

  // Soft delete a path
  async deletePath(id: number): Promise<boolean> {
    const result = await sql`
      UPDATE terminal_utopia.paths
      SET is_active = false, updated_at = NOW()
      WHERE id = ${id}
      RETURNING id
    `;
    return result.length > 0;
  }

  // Restore a soft-deleted path
  async restorePath(id: number): Promise<Path | null> {
    const result = await sql`
      UPDATE terminal_utopia.paths
      SET is_active = true, updated_at = NOW()
      WHERE id = ${id}
      RETURNING *
    `;
    return (result[0] as Path) || null;
  }

  // ============================================================================
  // PATH-MODULE JUNCTION OPERATIONS
  // ============================================================================

  // Get modules in a path
  async getPathModules(pathId: number): Promise<PathModule[]> {
    const result = await sql`
      SELECT pm.* FROM terminal_utopia.path_modules pm
      INNER JOIN terminal_utopia.modules m ON pm.module_id = m.id
      WHERE pm.path_id = ${pathId} AND m.is_active = true
      ORDER BY pm.sequence_order ASC
    `;
    return result as PathModule[];
  }

  // Get path with modules (enriched)
  async getPathWithModules(pathId: number): Promise<PathWithModules | null> {
    const path = await this.getPathById(pathId);
    if (!path) return null;

    const result = await sql`
      SELECT m.*, pm.sequence_order as path_sequence_order, pm.is_required
      FROM terminal_utopia.modules m
      INNER JOIN terminal_utopia.path_modules pm ON m.id = pm.module_id
      WHERE pm.path_id = ${pathId} AND m.is_active = true
      ORDER BY pm.sequence_order ASC
    `;

    const modules = (result as (Module & {
      path_sequence_order: number;
      is_required: boolean;
    })[]).map((m) => ({
      ...m,
      sequence_order: m.path_sequence_order,
    }));

    return {
      ...path,
      modules,
    };
  }

  // Add module to path
  async addModuleToPath(
    pathId: number,
    moduleId: number,
    sequenceOrder?: number,
    isRequired = true,
  ): Promise<PathModule> {
    // If no sequence order provided, append to end
    if (sequenceOrder === undefined) {
      const maxSeq = await sql`
        SELECT COALESCE(MAX(sequence_order), 0) as max_seq
        FROM terminal_utopia.path_modules
        WHERE path_id = ${pathId}
      `;
      sequenceOrder = parseInt(maxSeq[0].max_seq as string) + 1;
    }

    const result = await sql`
      INSERT INTO terminal_utopia.path_modules (path_id, module_id, sequence_order, is_required)
      VALUES (${pathId}, ${moduleId}, ${sequenceOrder}, ${isRequired})
      ON CONFLICT (path_id, module_id)
      DO UPDATE SET sequence_order = ${sequenceOrder}, is_required = ${isRequired}
      RETURNING *
    `;
    return result[0] as PathModule;
  }

  // Remove module from path
  async removeModuleFromPath(
    pathId: number,
    moduleId: number,
  ): Promise<boolean> {
    const result = await sql`
      DELETE FROM terminal_utopia.path_modules
      WHERE path_id = ${pathId} AND module_id = ${moduleId}
      RETURNING id
    `;
    return result.length > 0;
  }

  // Update module sequence in path
  async updatePathModuleSequence(
    pathId: number,
    moduleId: number,
    sequenceOrder: number,
  ): Promise<PathModule | null> {
    const result = await sql`
      UPDATE terminal_utopia.path_modules
      SET sequence_order = ${sequenceOrder}
      WHERE path_id = ${pathId} AND module_id = ${moduleId}
      RETURNING *
    `;
    return (result[0] as PathModule) || null;
  }

  // Get paths that contain a specific module
  async getPathsContainingModule(moduleId: number): Promise<Path[]> {
    const result = await sql`
      SELECT p.* FROM terminal_utopia.paths p
      INNER JOIN terminal_utopia.path_modules pm ON p.id = pm.path_id
      WHERE pm.module_id = ${moduleId} AND p.is_active = true
      ORDER BY p.sequence_order ASC
    `;
    return result as Path[];
  }

  // ============================================================================
  // QUESTION-PATH JUNCTION OPERATIONS
  // ============================================================================

  // Get questions for a path
  async getPathQuestions(pathId: number): Promise<QuestionPath[]> {
    const result = await sql`
      SELECT qp.* FROM terminal_utopia.question_paths qp
      INNER JOIN terminal_utopia.questions q ON qp.question_id = q.id
      WHERE qp.path_id = ${pathId} AND q.is_active = true
      ORDER BY qp.sequence_order ASC
    `;
    return result as QuestionPath[];
  }

  // Add question to path
  async addQuestionToPath(
    questionId: number,
    pathId: number,
    sequenceOrder?: number,
  ): Promise<QuestionPath> {
    if (sequenceOrder === undefined) {
      const maxSeq = await sql`
        SELECT COALESCE(MAX(sequence_order), 0) as max_seq
        FROM terminal_utopia.question_paths
        WHERE path_id = ${pathId}
      `;
      sequenceOrder = parseInt(maxSeq[0].max_seq as string) + 1;
    }

    const result = await sql`
      INSERT INTO terminal_utopia.question_paths (question_id, path_id, sequence_order)
      VALUES (${questionId}, ${pathId}, ${sequenceOrder})
      ON CONFLICT (question_id, path_id)
      DO UPDATE SET sequence_order = ${sequenceOrder}
      RETURNING *
    `;
    return result[0] as QuestionPath;
  }

  // Remove question from path
  async removeQuestionFromPath(
    questionId: number,
    pathId: number,
  ): Promise<boolean> {
    const result = await sql`
      DELETE FROM terminal_utopia.question_paths
      WHERE question_id = ${questionId} AND path_id = ${pathId}
      RETURNING id
    `;
    return result.length > 0;
  }

  // ============================================================================
  // USER PROGRESS OPERATIONS
  // ============================================================================

  // Get user's progress for a specific path
  async getUserPathProgress(
    userId: number,
    pathId: number,
  ): Promise<UserPathProgress | null> {
    const result = await sql`
      SELECT * FROM terminal_utopia.user_path_progress
      WHERE user_id = ${userId} AND path_id = ${pathId}
    `;
    return (result[0] as UserPathProgress) || null;
  }

  // Get all user's path progress
  async getUserProgress(userId: number): Promise<UserPathProgress[]> {
    const result = await sql`
      SELECT * FROM terminal_utopia.user_path_progress
      WHERE user_id = ${userId}
      ORDER BY created_at ASC
    `;
    return result as UserPathProgress[];
  }

  // Get paths with user progress and accessibility
  async getPathsWithProgress(userId: number): Promise<PathWithProgress[]> {
    const paths = await this.getAllPaths();
    const userProgress = await this.getUserProgress(userId);
    const progressMap = new Map(userProgress.map((p) => [p.path_id, p]));

    const pathsWithProgress: PathWithProgress[] = [];

    for (const path of paths) {
      const progress = progressMap.get(path.id);
      const accessible = await this.isPathAccessible(userId, path.id);

      pathsWithProgress.push({
        ...path,
        user_progress: progress,
        accessible,
      });
    }

    return pathsWithProgress;
  }

  // Check if a path is accessible to a user
  async isPathAccessible(userId: number, pathId: number): Promise<boolean> {
    const path = await this.getPathById(pathId);
    if (!path) return false;

    // Common paths are always accessible
    if (path.is_common) return true;

    // Check if path was unlocked by a branching rule
    const progress = await this.getUserPathProgress(userId, pathId);
    if (progress) return true;

    // Check if any branching rule has unlocked this path
    const unlockedByRule = await sql`
      SELECT 1 FROM terminal_utopia.user_path_progress
      WHERE user_id = ${userId} AND path_id = ${pathId}
      LIMIT 1
    `;
    if (unlockedByRule.length > 0) return true;

    // If path has a parent, check if parent is accessible and in progress/completed
    if (path.parent_path_id) {
      const parentProgress = await this.getUserPathProgress(
        userId,
        path.parent_path_id,
      );
      if (!parentProgress || parentProgress.status === "NOT_STARTED") {
        return false;
      }
    }

    return false;
  }

  // Start a path (mark as in progress)
  async startPath(
    userId: number,
    pathId: number,
    unlockedByRuleId?: number,
  ): Promise<UserPathProgress> {
    const accessible = await this.isPathAccessible(userId, pathId);
    const path = await this.getPathById(pathId);

    // Allow starting common paths even if not explicitly accessible
    if (!accessible && !path?.is_common) {
      throw new Error(
        "Path not accessible - unlock via branching rules or complete prerequisites",
      );
    }

    const result = await sql`
      INSERT INTO terminal_utopia.user_path_progress (
        user_id, path_id, status, started_at, unlocked_by_rule_id
      )
      VALUES (
        ${userId}, ${pathId}, 'IN_PROGRESS', NOW(), ${unlockedByRuleId || null}
      )
      ON CONFLICT (user_id, path_id)
      DO UPDATE SET
        status = 'IN_PROGRESS',
        started_at = COALESCE(user_path_progress.started_at, NOW()),
        updated_at = NOW()
      WHERE user_path_progress.status != 'COMPLETED'
      RETURNING *
    `;

    if (result.length === 0) {
      throw new Error(
        "Path is read-only - completed paths cannot be restarted",
      );
    }

    return result[0] as UserPathProgress;
  }

  // Complete a path
  async completePath(
    userId: number,
    pathId: number,
  ): Promise<UserPathProgress> {
    const accessible = await this.isPathAccessible(userId, pathId);
    if (!accessible) {
      throw new Error("Path not accessible");
    }

    // Check if all required modules in path are completed
    const allModulesComplete = await this.areAllRequiredModulesCompleted(
      userId,
      pathId,
    );
    if (!allModulesComplete) {
      throw new Error(
        "Cannot complete path - all required modules must be completed first",
      );
    }

    const result = await sql`
      INSERT INTO terminal_utopia.user_path_progress (
        user_id, path_id, status, started_at, completed_at
      )
      VALUES (${userId}, ${pathId}, 'COMPLETED', NOW(), NOW())
      ON CONFLICT (user_id, path_id)
      DO UPDATE SET
        status = 'COMPLETED',
        completed_at = NOW(),
        started_at = COALESCE(user_path_progress.started_at, NOW()),
        updated_at = NOW()
      RETURNING *
    `;

    return result[0] as UserPathProgress;
  }

  // Check if all required modules in a path are completed
  async areAllRequiredModulesCompleted(
    userId: number,
    pathId: number,
  ): Promise<boolean> {
    const result = await sql`
      SELECT COUNT(*) as incomplete_count
      FROM terminal_utopia.path_modules pm
      INNER JOIN terminal_utopia.modules m ON pm.module_id = m.id
      LEFT JOIN terminal_utopia.user_module_progress ump
        ON pm.module_id = ump.module_id AND ump.user_id = ${userId}
      WHERE pm.path_id = ${pathId}
        AND pm.is_required = true
        AND m.is_active = true
        AND (ump.status IS NULL OR ump.status != 'COMPLETED')
    `;

    const incompleteCount = parseInt(result[0].incomplete_count as string);
    return incompleteCount === 0;
  }

  // Unlock a path for a user (typically called by branching rule evaluation)
  async unlockPath(
    userId: number,
    pathId: number,
    unlockedByRuleId: number,
  ): Promise<UserPathProgress> {
    const result = await sql`
      INSERT INTO terminal_utopia.user_path_progress (
        user_id, path_id, status, unlocked_by_rule_id
      )
      VALUES (${userId}, ${pathId}, 'NOT_STARTED', ${unlockedByRuleId})
      ON CONFLICT (user_id, path_id)
      DO NOTHING
      RETURNING *
    `;

    // If already exists, just return the existing progress
    if (result.length === 0) {
      const existing = await this.getUserPathProgress(userId, pathId);
      if (existing) return existing;
      throw new Error("Failed to unlock path");
    }

    return result[0] as UserPathProgress;
  }

  // Get user's active paths (in progress)
  async getUserActivePaths(userId: number): Promise<Path[]> {
    const result = await sql`
      SELECT p.* FROM terminal_utopia.paths p
      INNER JOIN terminal_utopia.user_path_progress upp ON p.id = upp.path_id
      WHERE upp.user_id = ${userId}
        AND upp.status = 'IN_PROGRESS'
        AND p.is_active = true
      ORDER BY p.sequence_order ASC
    `;
    return result as Path[];
  }

  // Get user's unlocked paths (accessible but not necessarily started)
  async getUserUnlockedPaths(userId: number): Promise<Path[]> {
    const result = await sql`
      SELECT DISTINCT p.* FROM terminal_utopia.paths p
      LEFT JOIN terminal_utopia.user_path_progress upp ON p.id = upp.path_id AND upp.user_id = ${userId}
      WHERE p.is_active = true
        AND (
          p.is_common = true
          OR upp.id IS NOT NULL
        )
      ORDER BY p.sequence_order ASC
    `;
    return result as Path[];
  }

  // Get user completion statistics for paths
  async getUserPathCompletionStats(userId: number): Promise<{
    total_paths: number;
    completed_paths: number;
    in_progress_paths: number;
    completion_percentage: number;
  }> {
    const totalPaths = await sql`
      SELECT COUNT(*) as count FROM terminal_utopia.paths WHERE is_active = true
    `;

    const completedPaths = await sql`
      SELECT COUNT(*) as count FROM terminal_utopia.user_path_progress upp
      INNER JOIN terminal_utopia.paths p ON upp.path_id = p.id
      WHERE upp.user_id = ${userId} AND upp.status = 'COMPLETED' AND p.is_active = true
    `;

    const inProgressPaths = await sql`
      SELECT COUNT(*) as count FROM terminal_utopia.user_path_progress upp
      INNER JOIN terminal_utopia.paths p ON upp.path_id = p.id
      WHERE upp.user_id = ${userId} AND upp.status = 'IN_PROGRESS' AND p.is_active = true
    `;

    const total = parseInt(totalPaths[0].count as string);
    const completed = parseInt(completedPaths[0].count as string);
    const inProgress = parseInt(inProgressPaths[0].count as string);

    return {
      total_paths: total,
      completed_paths: completed,
      in_progress_paths: inProgress,
      completion_percentage: total > 0
        ? Math.round((completed / total) * 100)
        : 0,
    };
  }
}

// Export a singleton instance
export const pathRepository = new PathRepository();
