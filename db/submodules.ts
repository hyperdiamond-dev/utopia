/**
 * Submodule Repository
 * Handles database operations for submodules and user submodule progress
 */

import { sql } from "./connection.ts";

// ============================================================================
// Type Definitions
// ============================================================================

export interface Submodule {
  id: number;
  name: string;
  title: string;
  description: string | null;
  module_id: number;
  parent_submodule_id: number | null;
  sequence_order: number;
  branch_name: string | null;
  is_active: boolean;
  created_at: Date;
  updated_at: Date;
}

export interface UserSubmoduleProgress {
  id: number;
  user_id: number;
  submodule_id: number;
  status: SubmoduleStatus;
  started_at: Date | null;
  completed_at: Date | null;
  response_data: unknown | null;
  created_at: Date;
  updated_at: Date;
}

export type SubmoduleStatus = "NOT_STARTED" | "IN_PROGRESS" | "COMPLETED";

export interface SubmoduleWithProgress extends Submodule {
  user_progress?: UserSubmoduleProgress;
  accessible: boolean;
  questions_count?: number;
}

// ============================================================================
// Repository Class
// ============================================================================

export class SubmoduleRepository {
  // ==========================================================================
  // Submodule CRUD Operations
  // ==========================================================================

  /**
   * Get submodule by ID
   */
  async getSubmoduleById(submoduleId: number): Promise<Submodule | null> {
    const result = await sql`
      SELECT *
      FROM terminal_utopia.submodules
      WHERE id = ${submoduleId}
      AND is_active = true
    `;

    return result.length > 0 ? (result[0] as Submodule) : null;
  }

  /**
   * Get submodule by name within a module
   */
  async getSubmoduleByName(
    moduleName: string,
    submoduleName: string,
  ): Promise<Submodule | null> {
    const result = await sql`
      SELECT s.*
      FROM terminal_utopia.submodules s
      INNER JOIN terminal_utopia.modules m ON s.module_id = m.id
      WHERE m.name = ${moduleName}
      AND s.name = ${submoduleName}
      AND s.is_active = true
      AND m.is_active = true
    `;

    return result.length > 0 ? (result[0] as Submodule) : null;
  }

  /**
   * Get all submodules for a module
   */
  async getSubmodulesByModuleId(moduleId: number): Promise<Submodule[]> {
    const result = await sql`
      SELECT *
      FROM terminal_utopia.submodules
      WHERE module_id = ${moduleId}
      AND is_active = true
      ORDER BY sequence_order ASC
    `;

    return result as Submodule[];
  }

  /**
   * Get all submodules for a specific branch within a module
   */
  async getSubmodulesByBranch(
    moduleId: number,
    branchName: string | null,
  ): Promise<Submodule[]> {
    const result = await sql`
      SELECT *
      FROM terminal_utopia.submodules
      WHERE module_id = ${moduleId}
      AND (
        branch_name = ${branchName}
        OR (branch_name IS NULL AND ${branchName} IS NULL)
      )
      AND is_active = true
      ORDER BY sequence_order ASC
    `;

    return result as Submodule[];
  }

  /**
   * Get child submodules of a parent submodule
   */
  async getChildSubmodules(
    parentSubmoduleId: number,
  ): Promise<Submodule[]> {
    const result = await sql`
      SELECT *
      FROM terminal_utopia.submodules
      WHERE parent_submodule_id = ${parentSubmoduleId}
      AND is_active = true
      ORDER BY sequence_order ASC
    `;

    return result as Submodule[];
  }

  // ==========================================================================
  // User Progress Operations
  // ==========================================================================

  /**
   * Get user's progress for a specific submodule
   */
  async getUserSubmoduleProgress(
    userId: number,
    submoduleId: number,
  ): Promise<UserSubmoduleProgress | null> {
    const result = await sql`
      SELECT *
      FROM terminal_utopia.user_submodule_progress
      WHERE user_id = ${userId}
      AND submodule_id = ${submoduleId}
    `;

    return result.length > 0 ? (result[0] as UserSubmoduleProgress) : null;
  }

  /**
   * Get all user's progress for submodules in a module
   */
  async getUserProgressForModule(
    userId: number,
    moduleId: number,
  ): Promise<UserSubmoduleProgress[]> {
    const result = await sql`
      SELECT usp.*
      FROM terminal_utopia.user_submodule_progress usp
      INNER JOIN terminal_utopia.submodules s ON usp.submodule_id = s.id
      WHERE usp.user_id = ${userId}
      AND s.module_id = ${moduleId}
      ORDER BY s.sequence_order ASC
    `;

    return result as UserSubmoduleProgress[];
  }

  /**
   * Get submodules with user progress for a module
   */
  async getSubmodulesWithProgress(
    userId: number,
    moduleId: number,
  ): Promise<SubmoduleWithProgress[]> {
    interface SubmoduleProgressRow {
      id: number;
      name: string;
      title: string;
      description: string | null;
      module_id: number;
      parent_submodule_id: number | null;
      sequence_order: number;
      branch_name: string | null;
      is_active: boolean;
      created_at: Date;
      updated_at: Date;
      progress_id: number | null;
      progress_status: SubmoduleStatus | null;
      progress_started_at: Date | null;
      progress_completed_at: Date | null;
      progress_response_data: unknown | null;
      questions_count: string;
    }

    const result = await sql`
      SELECT
        s.*,
        usp.id as progress_id,
        usp.status as progress_status,
        usp.started_at as progress_started_at,
        usp.completed_at as progress_completed_at,
        usp.response_data as progress_response_data,
        (
          SELECT COUNT(*)
          FROM terminal_utopia.questions q
          WHERE q.submodule_id = s.id
          AND q.is_active = true
        ) as questions_count
      FROM terminal_utopia.submodules s
      LEFT JOIN terminal_utopia.user_submodule_progress usp
        ON s.id = usp.submodule_id AND usp.user_id = ${userId}
      WHERE s.module_id = ${moduleId}
      AND s.is_active = true
      ORDER BY s.sequence_order ASC
    `;

    // Transform the flat result into nested structure
    return (result as SubmoduleProgressRow[]).map((
      row,
    ): SubmoduleWithProgress => ({
      id: row.id,
      name: row.name,
      title: row.title,
      description: row.description,
      module_id: row.module_id,
      parent_submodule_id: row.parent_submodule_id,
      sequence_order: row.sequence_order,
      branch_name: row.branch_name,
      is_active: row.is_active,
      created_at: row.created_at,
      updated_at: row.updated_at,
      questions_count: parseInt(row.questions_count || "0", 10),
      accessible: false, // Will be computed by service layer
      user_progress: row.progress_id && row.progress_status
        ? {
          id: row.progress_id,
          user_id: userId,
          submodule_id: row.id,
          status: row.progress_status,
          started_at: row.progress_started_at,
          completed_at: row.progress_completed_at,
          response_data: row.progress_response_data,
          created_at: row.created_at,
          updated_at: row.updated_at,
        }
        : undefined,
    }));
  }

  /**
   * Create or update user submodule progress
   */
  async upsertUserProgress(
    userId: number,
    submoduleId: number,
    status: SubmoduleStatus,
    responseData?: unknown,
  ): Promise<UserSubmoduleProgress> {
    const now = new Date();
    const startedAt = status !== "NOT_STARTED" ? now : null;
    const completedAt = status === "COMPLETED" ? now : null;

    const result = await sql`
      INSERT INTO terminal_utopia.user_submodule_progress (
        user_id,
        submodule_id,
        status,
        started_at,
        completed_at,
        response_data
      )
      VALUES (
        ${userId},
        ${submoduleId},
        ${status},
        ${startedAt},
        ${completedAt},
        ${responseData ? JSON.stringify(responseData) : null}
      )
      ON CONFLICT (user_id, submodule_id)
      DO UPDATE SET
        status = EXCLUDED.status,
        started_at = COALESCE(terminal_utopia.user_submodule_progress.started_at, EXCLUDED.started_at),
        completed_at = EXCLUDED.completed_at,
        response_data = COALESCE(EXCLUDED.response_data, terminal_utopia.user_submodule_progress.response_data),
        updated_at = ${now}
      RETURNING *
    `;

    return result[0] as UserSubmoduleProgress;
  }

  /**
   * Start a submodule (set status to IN_PROGRESS)
   */
  startSubmodule(
    userId: number,
    submoduleId: number,
  ): Promise<UserSubmoduleProgress> {
    return this.upsertUserProgress(userId, submoduleId, "IN_PROGRESS");
  }

  /**
   * Complete a submodule (set status to COMPLETED)
   */
  completeSubmodule(
    userId: number,
    submoduleId: number,
    responseData?: unknown,
  ): Promise<UserSubmoduleProgress> {
    return this.upsertUserProgress(
      userId,
      submoduleId,
      "COMPLETED",
      responseData,
    );
  }

  /**
   * Save progress on a submodule without completing it
   */
  async saveSubmoduleProgress(
    userId: number,
    submoduleId: number,
    responseData: unknown,
  ): Promise<UserSubmoduleProgress> {
    const existing = await this.getUserSubmoduleProgress(userId, submoduleId);
    const status = existing?.status || "IN_PROGRESS";

    return this.upsertUserProgress(userId, submoduleId, status, responseData);
  }

  // ==========================================================================
  // Access Control Operations
  // ==========================================================================

  /**
   * Check if a submodule is accessible to a user based on sequential completion
   * Does NOT include branching logic - that's handled by BranchingRuleRepository
   */
  async isSubmoduleAccessible(
    userId: number,
    submoduleId: number,
  ): Promise<boolean> {
    const submodule = await this.getSubmoduleById(submoduleId);
    if (!submodule) return false;

    // First submodule in sequence is always accessible (if parent module is accessible)
    if (submodule.sequence_order === 1 && !submodule.parent_submodule_id) {
      return true;
    }

    // Check if all previous submodules in the same branch are completed
    const result = await sql`
      SELECT COUNT(*) as incomplete_count
      FROM terminal_utopia.submodules s
      LEFT JOIN terminal_utopia.user_submodule_progress usp
        ON s.id = usp.submodule_id AND usp.user_id = ${userId}
      WHERE s.module_id = ${submodule.module_id}
      AND s.sequence_order < ${submodule.sequence_order}
      AND (
        s.branch_name = ${submodule.branch_name}
        OR (s.branch_name IS NULL AND ${submodule.branch_name} IS NULL)
      )
      AND s.parent_submodule_id ${
      submodule.parent_submodule_id
        ? sql`= ${submodule.parent_submodule_id}`
        : sql`IS NULL`
    }
      AND s.is_active = true
      AND (usp.status IS NULL OR usp.status != 'COMPLETED')
    `;

    const incompleteCount = parseInt(
      (result[0] as { incomplete_count: string }).incomplete_count,
      10,
    );
    return incompleteCount === 0;
  }

  /**
   * Get the count of completed submodules in a module for a user
   */
  async getCompletedSubmoduleCount(
    userId: number,
    moduleId: number,
  ): Promise<number> {
    const result = await sql`
      SELECT COUNT(*) as count
      FROM terminal_utopia.user_submodule_progress usp
      INNER JOIN terminal_utopia.submodules s ON usp.submodule_id = s.id
      WHERE usp.user_id = ${userId}
      AND s.module_id = ${moduleId}
      AND usp.status = 'COMPLETED'
    `;

    return parseInt((result[0] as { count: string }).count, 10);
  }

  /**
   * Check if all required submodules in a module are completed
   */
  async areAllRequiredSubmodulesCompleted(
    userId: number,
    moduleId: number,
  ): Promise<boolean> {
    // Get the module to check if it requires all submodules
    const moduleResult = await sql`
      SELECT requires_all_submodules, allows_branching
      FROM terminal_utopia.modules
      WHERE id = ${moduleId}
    `;

    if (moduleResult.length === 0) return false;

    const module = moduleResult[0] as {
      requires_all_submodules: boolean;
      allows_branching: boolean;
    };

    // If module doesn't have submodules requirement, return true
    if (!module.requires_all_submodules) return true;

    // If module doesn't allow branching, check all submodules
    if (!module.allows_branching) {
      const result = await sql`
        SELECT COUNT(*) as incomplete_count
        FROM terminal_utopia.submodules s
        LEFT JOIN terminal_utopia.user_submodule_progress usp
          ON s.id = usp.submodule_id AND usp.user_id = ${userId}
        WHERE s.module_id = ${moduleId}
        AND s.is_active = true
        AND (usp.status IS NULL OR usp.status != 'COMPLETED')
      `;

      return parseInt(
        (result[0] as { incomplete_count: string }).incomplete_count,
        10,
      ) === 0;
    }

    // For branching modules, we need to check that at least one complete branch exists
    // This is complex and should be handled by the service layer with BranchingRuleRepository
    // For now, return false to be conservative
    return false;
  }

  // ==========================================================================
  // Administrative Operations
  // ==========================================================================

  /**
   * Create a new submodule
   */
  async createSubmodule(
    data: Omit<
      Submodule,
      "id" | "created_at" | "updated_at" | "is_active"
    >,
  ): Promise<Submodule> {
    const result = await sql`
      INSERT INTO terminal_utopia.submodules (
        name,
        title,
        description,
        module_id,
        parent_submodule_id,
        sequence_order,
        branch_name
      )
      VALUES (
        ${data.name},
        ${data.title},
        ${data.description},
        ${data.module_id},
        ${data.parent_submodule_id},
        ${data.sequence_order},
        ${data.branch_name}
      )
      RETURNING *
    `;

    return result[0] as Submodule;
  }

  /**
   * Update a submodule
   */
  async updateSubmodule(
    submoduleId: number,
    data: Partial<Omit<Submodule, "id" | "created_at" | "updated_at">>,
  ): Promise<Submodule | null> {
    const updates: string[] = [];
    const values: unknown[] = [];

    if (data.name !== undefined) {
      updates.push(`name = $${values.length + 1}`);
      values.push(data.name);
    }
    if (data.title !== undefined) {
      updates.push(`title = $${values.length + 1}`);
      values.push(data.title);
    }
    if (data.description !== undefined) {
      updates.push(`description = $${values.length + 1}`);
      values.push(data.description);
    }
    if (data.sequence_order !== undefined) {
      updates.push(`sequence_order = $${values.length + 1}`);
      values.push(data.sequence_order);
    }
    if (data.branch_name !== undefined) {
      updates.push(`branch_name = $${values.length + 1}`);
      values.push(data.branch_name);
    }
    if (data.is_active !== undefined) {
      updates.push(`is_active = $${values.length + 1}`);
      values.push(data.is_active);
    }

    if (updates.length === 0) {
      return this.getSubmoduleById(submoduleId);
    }

    const result = await sql`
      UPDATE terminal_utopia.submodules
      SET ${sql.unsafe(updates.join(", "))}
      WHERE id = ${submoduleId}
      RETURNING *
    `;

    return result.length > 0 ? (result[0] as Submodule) : null;
  }

  /**
   * Delete a submodule (soft delete by setting is_active = false)
   */
  async deleteSubmodule(submoduleId: number): Promise<boolean> {
    const result = await sql`
      UPDATE terminal_utopia.submodules
      SET is_active = false
      WHERE id = ${submoduleId}
    `;

    return (result as unknown as { count: number }).count > 0;
  }
}

// ============================================================================
// Singleton Export
// ============================================================================

export const submoduleRepository = new SubmoduleRepository();
