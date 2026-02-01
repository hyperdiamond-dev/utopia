/**
 * Submodule Service
 * Business logic for submodule operations, access control, and branching
 */

import { submoduleRepository } from "../db/submodules.ts";
import { branchingRuleRepository } from "../db/branchingRules.ts";
import { moduleRepository } from "../db/modules.ts";
import { auditRepository } from "../db/index.ts";
import type {
  Submodule,
  SubmoduleWithProgress,
  UserSubmoduleProgress,
} from "../db/submodules.ts";

// ============================================================================
// Type Definitions
// ============================================================================

export interface SubmoduleAccessResult {
  accessible: boolean;
  reason?: string;
  nextSubmodule?: Submodule;
}

export interface SubmoduleSubmissionData {
  responses: Record<string, unknown>;
  metadata?: Record<string, unknown>;
}

// ============================================================================
// Service Class
// ============================================================================

export class SubmoduleService {
  /**
   * Get all submodules for a module with user progress and accessibility
   */
  static async getSubmodulesForModule(
    userId: number,
    moduleId: number,
  ): Promise<SubmoduleWithProgress[]> {
    const submodules = await submoduleRepository.getSubmodulesWithProgress(
      userId,
      moduleId,
    );

    // Check accessibility for each submodule
    for (const submodule of submodules) {
      submodule.accessible = await this.isSubmoduleAccessible(
        userId,
        submodule.id,
      );
    }

    return submodules;
  }

  /**
   * Get a specific submodule by name with user progress
   */
  static async getSubmoduleByName(
    userId: number,
    moduleName: string,
    submoduleName: string,
  ): Promise<SubmoduleWithProgress | null> {
    const submodule = await submoduleRepository.getSubmoduleByName(
      moduleName,
      submoduleName,
    );

    if (!submodule) return null;

    const progress = await submoduleRepository.getUserSubmoduleProgress(
      userId,
      submodule.id,
    );

    const accessible = await this.isSubmoduleAccessible(userId, submodule.id);

    return {
      ...submodule,
      user_progress: progress || undefined,
      accessible,
    };
  }

  /**
   * Check if a submodule is accessible to a user
   * Combines sequential access check + branching rule check
   */
  static async isSubmoduleAccessible(
    userId: number,
    submoduleId: number,
  ): Promise<boolean> {
    // First check sequential access (previous submodules completed)
    const sequentiallyAccessible = await submoduleRepository
      .isSubmoduleAccessible(userId, submoduleId);

    if (!sequentiallyAccessible) return false;

    // Then check branching rules (if any rules target this submodule)
    const unlockedByRules = await branchingRuleRepository
      .isSubmoduleUnlockedByRules(
        userId,
        submoduleId,
      );

    return unlockedByRules;
  }

  /**
   * Check module access (must be accessible before accessing submodules)
   */
  static async checkModuleAccess(
    userId: number,
    moduleId: number,
  ): Promise<boolean> {
    return await moduleRepository.isModuleAccessible(userId, moduleId);
  }

  /**
   * Start a submodule for a user
   */
  static async startSubmodule(
    userId: number,
    moduleName: string,
    submoduleName: string,
  ): Promise<UserSubmoduleProgress> {
    const submodule = await submoduleRepository.getSubmoduleByName(
      moduleName,
      submoduleName,
    );

    if (!submodule) {
      throw new Error("Submodule not found");
    }

    // Check if parent module is accessible
    const moduleAccessible = await this.checkModuleAccess(
      userId,
      submodule.module_id,
    );

    if (!moduleAccessible) {
      throw new Error(
        "Parent module not accessible - complete previous modules first",
      );
    }

    // Check if submodule is accessible
    const submoduleAccessible = await this.isSubmoduleAccessible(
      userId,
      submodule.id,
    );

    if (!submoduleAccessible) {
      throw new Error(
        "Submodule not accessible - complete previous submodules or meet branching requirements first",
      );
    }

    // Check if already completed (read-only)
    const existingProgress = await submoduleRepository.getUserSubmoduleProgress(
      userId,
      submodule.id,
    );

    if (existingProgress?.status === "COMPLETED") {
      throw new Error(
        "Submodule is read-only - completed submodules cannot be restarted",
      );
    }

    // Start the submodule
    const progress = await submoduleRepository.startSubmodule(
      userId,
      submodule.id,
    );

    // Log audit event
    await auditRepository.logModuleStart(userId, {
      submodule_id: submodule.id,
      submodule_name: submoduleName,
      module_id: submodule.module_id,
      module_name: moduleName,
    });

    return progress;
  }

  /**
   * Save progress on a submodule without completing it
   */
  static async saveSubmoduleProgress(
    userId: number,
    moduleName: string,
    submoduleName: string,
    submissionData: SubmoduleSubmissionData,
  ): Promise<UserSubmoduleProgress> {
    const submodule = await submoduleRepository.getSubmoduleByName(
      moduleName,
      submoduleName,
    );

    if (!submodule) {
      throw new Error("Submodule not found");
    }

    // Check if already completed (read-only)
    const existingProgress = await submoduleRepository.getUserSubmoduleProgress(
      userId,
      submodule.id,
    );

    if (existingProgress?.status === "COMPLETED") {
      throw new Error(
        "Submodule is read-only - completed submodules cannot be modified",
      );
    }

    // Save progress
    const progress = await submoduleRepository.saveSubmoduleProgress(
      userId,
      submodule.id,
      submissionData,
    );

    return progress;
  }

  /**
   * Complete a submodule and trigger branching rule evaluation
   */
  static async completeSubmodule(
    userId: number,
    moduleName: string,
    submoduleName: string,
    submissionData: SubmoduleSubmissionData,
  ): Promise<{
    progress: UserSubmoduleProgress;
    unlockedSubmodules: number[];
    moduleCompleted: boolean;
  }> {
    const submodule = await submoduleRepository.getSubmoduleByName(
      moduleName,
      submoduleName,
    );

    if (!submodule) {
      throw new Error("Submodule not found");
    }

    // Check if submodule is accessible
    const accessible = await this.isSubmoduleAccessible(userId, submodule.id);
    if (!accessible) {
      throw new Error(
        "Submodule not accessible - complete previous submodules first",
      );
    }

    // Complete the submodule
    const progress = await submoduleRepository.completeSubmodule(
      userId,
      submodule.id,
      submissionData,
    );

    // Log completion audit event
    await auditRepository.logModuleCompletion(userId, {
      submodule_id: submodule.id,
      submodule_name: submoduleName,
      module_id: submodule.module_id,
      module_name: moduleName,
    });

    // Evaluate branching rules to unlock new submodules
    const unlockedSubmodules = await this.unlockBranchedSubmodules(
      userId,
      submodule.module_id,
      submodule.id,
    );

    // Check if all required submodules are completed for parent module
    let moduleCompleted = false;
    const module = await moduleRepository.getModuleById(submodule.module_id);

    if (module?.requires_all_submodules) {
      const allComplete = await submoduleRepository
        .areAllRequiredSubmodulesCompleted(
          userId,
          submodule.module_id,
        );

      if (allComplete) {
        // Auto-complete the parent module
        await moduleRepository.completeModule(
          userId,
          submodule.module_id,
          { auto_completed: true, completed_via_submodules: true },
        );
        moduleCompleted = true;

        // Log module completion
        await auditRepository.logModuleCompletion(userId, {
          module_id: submodule.module_id,
          module_name: moduleName,
          auto_completed: true,
        });
      }
    }

    return {
      progress,
      unlockedSubmodules,
      moduleCompleted,
    };
  }

  /**
   * Evaluate branching rules after submodule completion and return unlocked submodule IDs
   */
  static async unlockBranchedSubmodules(
    userId: number,
    moduleId: number,
    completedSubmoduleId?: number,
  ): Promise<number[]> {
    const results = await branchingRuleRepository.evaluateRules(
      userId,
      moduleId,
      completedSubmoduleId,
    );

    const unlockedIds = results
      .filter((r) => r.unlocked)
      .map((r) => r.target_submodule_id);

    // Log unlocked submodules
    if (unlockedIds.length > 0) {
      await auditRepository.logModuleStart(userId, {
        module_id: moduleId,
        unlocked_submodules: JSON.stringify(unlockedIds),
        trigger: completedSubmoduleId ? "submodule_completion" : "module_start",
      });
    }

    return unlockedIds;
  }

  /**
   * Get the next accessible submodule in a module for a user
   */
  static async getNextAccessibleSubmodule(
    userId: number,
    moduleId: number,
  ): Promise<Submodule | null> {
    const submodules = await submoduleRepository.getSubmodulesByModuleId(
      moduleId,
    );

    for (const submodule of submodules) {
      const progress = await submoduleRepository.getUserSubmoduleProgress(
        userId,
        submodule.id,
      );

      // If submodule not started or in progress, and it's accessible, return it
      if (
        (!progress || progress.status !== "COMPLETED") &&
        (await this.isSubmoduleAccessible(userId, submodule.id))
      ) {
        return submodule;
      }
    }

    return null; // All submodules completed or none accessible
  }

  /**
   * Get current active submodule for a user in a module
   */
  static async getCurrentSubmodule(
    userId: number,
    moduleId: number,
  ): Promise<Submodule | null> {
    // First check if there's an in-progress submodule
    const progressList = await submoduleRepository.getUserProgressForModule(
      userId,
      moduleId,
    );

    const inProgress = progressList.find((p) => p.status === "IN_PROGRESS");

    if (inProgress) {
      return await submoduleRepository.getSubmoduleById(
        inProgress.submodule_id,
      );
    }

    // If no in-progress submodule, get the next accessible one
    return await this.getNextAccessibleSubmodule(userId, moduleId);
  }

  /**
   * Get completion statistics for submodules in a module
   */
  static async getSubmoduleCompletionStats(
    userId: number,
    moduleId: number,
  ): Promise<{
    total_submodules: number;
    completed_submodules: number;
    current_submodule?: string;
    completion_percentage: number;
  }> {
    const allSubmodules = await submoduleRepository.getSubmodulesByModuleId(
      moduleId,
    );
    const total = allSubmodules.length;

    const completed = await submoduleRepository.getCompletedSubmoduleCount(
      userId,
      moduleId,
    );

    const currentSubmodule = await this.getCurrentSubmodule(userId, moduleId);

    return {
      total_submodules: total,
      completed_submodules: completed,
      current_submodule: currentSubmodule?.name,
      completion_percentage: total > 0
        ? Math.round((completed / total) * 100)
        : 0,
    };
  }
}
