import { sql } from "./connection.ts";

export type ModuleStatus = "NOT_STARTED" | "IN_PROGRESS" | "COMPLETED";

export interface Module {
  id: number;
  name: string;
  title: string;
  description: string | null;
  sequence_order: number;
  is_active: boolean;
  requires_all_submodules: boolean;
  allows_branching: boolean;
  created_at: Date;
  updated_at: Date;
}

export interface UserModuleProgress {
  id: number;
  user_id: number;
  module_id: number;
  status: ModuleStatus;
  started_at: Date | null;
  completed_at: Date | null;
  response_data: unknown | null;
  created_at: Date;
  updated_at: Date;
}

export interface ModuleWithProgress extends Module {
  user_progress?: UserModuleProgress;
  accessible: boolean;
}

export class ModuleRepository {
  // Get all active modules in sequence order
  async getAllModules(): Promise<Module[]> {
    const result = await sql`
      SELECT * FROM terminal_utopia.modules
      WHERE is_active = true
      ORDER BY sequence_order ASC
    `;
    return result as Module[];
  }

  // Get module by name
  async getModuleByName(name: string): Promise<Module | null> {
    const result = await sql`
      SELECT * FROM terminal_utopia.modules WHERE name = ${name} AND is_active = true
    `;
    return result[0] as Module || null;
  }

  // Get module by ID
  async getModuleById(id: number): Promise<Module | null> {
    const result = await sql`
      SELECT * FROM terminal_utopia.modules WHERE id = ${id} AND is_active = true
    `;
    return result[0] as Module || null;
  }

  // Get user's progress for a specific module
  async getUserModuleProgress(
    userId: number,
    moduleId: number,
  ): Promise<UserModuleProgress | null> {
    const result = await sql`
      SELECT * FROM terminal_utopia.user_module_progress
      WHERE user_id = ${userId} AND module_id = ${moduleId}
    `;
    return result[0] as UserModuleProgress || null;
  }

  // Get all user's module progress
  async getUserProgress(userId: number): Promise<UserModuleProgress[]> {
    const result = await sql`
      SELECT * FROM terminal_utopia.user_module_progress
      WHERE user_id = ${userId}
      ORDER BY created_at ASC
    `;
    return result as UserModuleProgress[];
  }

  // Get modules with user progress and accessibility
  async getModulesWithProgress(userId: number): Promise<ModuleWithProgress[]> {
    const modules = await this.getAllModules();
    const userProgress = await this.getUserProgress(userId);
    const progressMap = new Map(userProgress.map((p) => [p.module_id, p]));

    const modulesWithProgress: ModuleWithProgress[] = [];

    for (const module of modules) {
      const progress = progressMap.get(module.id);
      const accessible = await this.isModuleAccessible(userId, module.id);

      modulesWithProgress.push({
        ...module,
        user_progress: progress,
        accessible,
      });
    }

    return modulesWithProgress;
  }

  // Check if a module is accessible to a user (based on sequential completion)
  async isModuleAccessible(userId: number, moduleId: number): Promise<boolean> {
    const targetModule = await this.getModuleById(moduleId);
    if (!targetModule) return false;

    // First module (consent) is always accessible
    if (targetModule.sequence_order === 1) return true;

    // Check if all previous modules are completed
    const result = await sql`
      SELECT COUNT(*) as incomplete_count
      FROM terminal_utopia.modules m
      LEFT JOIN terminal_utopia.user_module_progress ump ON m.id = ump.module_id AND ump.user_id = ${userId}
      WHERE m.is_active = true
        AND m.sequence_order < ${targetModule.sequence_order}
        AND (ump.status IS NULL OR ump.status != 'COMPLETED')
    `;

    const incompleteCount = parseInt(result[0].incomplete_count as string);
    return incompleteCount === 0;
  }

  // Start a module (mark as in progress)
  async startModule(
    userId: number,
    moduleId: number,
  ): Promise<UserModuleProgress> {
    // Check if module is accessible
    const accessible = await this.isModuleAccessible(userId, moduleId);
    if (!accessible) {
      throw new Error(
        "Module not accessible - complete previous modules first",
      );
    }

    // Atomic insert/update with WHERE clause to prevent overwriting COMPLETED status
    const result = await sql`
      INSERT INTO terminal_utopia.user_module_progress (user_id, module_id, status, started_at)
      VALUES (${userId}, ${moduleId}, 'IN_PROGRESS', NOW())
      ON CONFLICT (user_id, module_id)
      DO UPDATE SET
        status = 'IN_PROGRESS',
        started_at = COALESCE(user_module_progress.started_at, NOW()),
        updated_at = NOW()
      WHERE user_module_progress.status != 'COMPLETED'
      RETURNING *
    `;

    // If no rows returned, the module was already COMPLETED
    if (result.length === 0) {
      throw new Error(
        "Module is read-only - completed modules cannot be restarted",
      );
    }

    return result[0] as UserModuleProgress;
  }

  // Complete a module
  async completeModule(
    userId: number,
    moduleId: number,
    responseData?: unknown,
  ): Promise<UserModuleProgress> {
    // Check if module is accessible
    const accessible = await this.isModuleAccessible(userId, moduleId);
    if (!accessible) {
      throw new Error(
        "Module not accessible - complete previous modules first",
      );
    }

    // Check if all required submodules are completed (if module has submodules)
    const module = await this.getModuleById(moduleId);
    if (module?.requires_all_submodules) {
      const allSubmodulesComplete = await this
        .areAllRequiredSubmodulesCompleted(userId, moduleId);
      if (!allSubmodulesComplete) {
        throw new Error(
          "Cannot complete module - all required submodules must be completed first",
        );
      }
    }

    const result = await sql`
      INSERT INTO terminal_utopia.user_module_progress (user_id, module_id, status, started_at, completed_at, response_data)
      VALUES (${userId}, ${moduleId}, 'COMPLETED', NOW(), NOW(), ${
      JSON.stringify(responseData)
    })
      ON CONFLICT (user_id, module_id)
      DO UPDATE SET
        status = 'COMPLETED',
        completed_at = NOW(),
        response_data = ${JSON.stringify(responseData)},
        started_at = COALESCE(user_module_progress.started_at, NOW()),
        updated_at = NOW()
      RETURNING *
    `;

    return result[0] as UserModuleProgress;
  }

  // Check if all required submodules are completed for a module
  async areAllRequiredSubmodulesCompleted(
    userId: number,
    moduleId: number,
  ): Promise<boolean> {
    // Import is done here to avoid circular dependency
    const { submoduleRepository } = await import("./submodules.ts");
    return await submoduleRepository.areAllRequiredSubmodulesCompleted(
      userId,
      moduleId,
    );
  }

  // Update module response data without completing
  async updateModuleResponse(
    userId: number,
    moduleId: number,
    responseData: unknown,
  ): Promise<UserModuleProgress | null> {
    // Atomic update with status check in WHERE clause to prevent race conditions
    const result = await sql`
      UPDATE terminal_utopia.user_module_progress
      SET response_data = ${JSON.stringify(responseData)}, updated_at = NOW()
      WHERE user_id = ${userId}
        AND module_id = ${moduleId}
        AND status != 'COMPLETED'
      RETURNING *
    `;

    // If no rows affected, check if it's because module is completed or doesn't exist
    if (result.length === 0) {
      const existingProgress = await this.getUserModuleProgress(
        userId,
        moduleId,
      );
      if (existingProgress?.status === "COMPLETED") {
        throw new Error(
          "Module is read-only - completed modules cannot be modified",
        );
      }
      return null;
    }

    return result[0] as UserModuleProgress;
  }

  // Get next accessible module for user
  async getNextAccessibleModule(userId: number): Promise<Module | null> {
    const modules = await this.getAllModules();

    for (const module of modules) {
      const progress = await this.getUserModuleProgress(userId, module.id);

      // If module not started or in progress, and it's accessible, return it
      if (
        (!progress || progress.status !== "COMPLETED") &&
        await this.isModuleAccessible(userId, module.id)
      ) {
        return module;
      }
    }

    return null; // All modules completed or none accessible
  }

  // Get user's current module (the one they should be working on)
  async getCurrentModule(userId: number): Promise<Module | null> {
    // First, check if there's an in-progress module
    const result = await sql`
      SELECT m.* FROM terminal_utopia.modules m
      INNER JOIN terminal_utopia.user_module_progress ump ON m.id = ump.module_id
      WHERE ump.user_id = ${userId} AND ump.status = 'IN_PROGRESS'
      ORDER BY m.sequence_order ASC
      LIMIT 1
    `;

    if (result.length > 0) {
      return result[0] as Module;
    }

    // If no in-progress module, get the next accessible one
    return this.getNextAccessibleModule(userId);
  }

  // Get user completion statistics
  async getUserCompletionStats(userId: number): Promise<{
    total_modules: number;
    completed_modules: number;
    current_module?: string;
    completion_percentage: number;
  }> {
    const totalModules = await sql`
      SELECT COUNT(*) as count FROM terminal_utopia.modules WHERE is_active = true
    `;

    const completedModules = await sql`
      SELECT COUNT(*) as count FROM terminal_utopia.user_module_progress ump
      INNER JOIN terminal_utopia.modules m ON ump.module_id = m.id
      WHERE ump.user_id = ${userId} AND ump.status = 'COMPLETED' AND m.is_active = true
    `;

    const currentModule = await this.getCurrentModule(userId);

    const total = parseInt(totalModules[0].count as string);
    const completed = parseInt(completedModules[0].count as string);

    return {
      total_modules: total,
      completed_modules: completed,
      current_module: currentModule?.name,
      completion_percentage: total > 0
        ? Math.round((completed / total) * 100)
        : 0,
    };
  }
}

// Export a singleton instance
export const moduleRepository = new ModuleRepository();
