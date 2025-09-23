import {
  auditRepository,
  moduleRepository,
  userRepository,
} from "../db/index.ts";
import type {
  Module,
  ModuleWithProgress,
  UserModuleProgress,
} from "../db/index.ts";

export interface ModuleAccessResult {
  accessible: boolean;
  reason?: string;
  nextModule?: Module;
}

export interface ModuleSubmissionData {
  responses: Record<string, unknown>;
  metadata?: Record<string, unknown>;
}

export class ModuleService {
  /**
   * Get all modules with user progress and accessibility information
   */
  static async getUserModuleOverview(
    userId: number,
  ): Promise<ModuleWithProgress[]> {
    return await moduleRepository.getModulesWithProgress(userId);
  }

  /**
   * Check if a user can access a specific module
   */
  static async checkModuleAccess(
    userId: number,
    moduleName: string,
  ): Promise<ModuleAccessResult> {
    const module = await moduleRepository.getModuleByName(moduleName);
    if (!module) {
      return {
        accessible: false,
        reason: "Module not found",
      };
    }

    const accessible = await moduleRepository.isModuleAccessible(
      userId,
      module.id,
    );

    if (!accessible) {
      const nextModule = await moduleRepository.getNextAccessibleModule(userId);
      return {
        accessible: false,
        reason: "Complete previous modules first",
        nextModule: nextModule || undefined,
      };
    }

    return { accessible: true };
  }

  /**
   * Start a module for a user
   */
  static async startModule(
    userId: number,
    moduleName: string,
  ): Promise<UserModuleProgress> {
    const module = await moduleRepository.getModuleByName(moduleName);
    if (!module) {
      throw new Error("Module not found");
    }

    // Check access
    const accessResult = await this.checkModuleAccess(userId, moduleName);
    if (!accessResult.accessible) {
      throw new Error(accessResult.reason || "Module not accessible");
    }

    // Start the module
    const progress = await moduleRepository.startModule(userId, module.id);

    // Log audit event
    await auditRepository.logModuleStart(userId, {
      module_id: module.id,
      module_name: moduleName,
      sequence_order: module.sequence_order,
    });

    // Update user's active module
    await userRepository.setActiveModule(userId, module.id);

    return progress;
  }

  /**
   * Submit module completion with response data
   */
  static async completeModule(
    userId: number,
    moduleName: string,
    submissionData: ModuleSubmissionData,
  ): Promise<UserModuleProgress> {
    const module = await moduleRepository.getModuleByName(moduleName);
    if (!module) {
      throw new Error("Module not found");
    }

    // Check access
    const accessResult = await this.checkModuleAccess(userId, moduleName);
    if (!accessResult.accessible) {
      throw new Error(accessResult.reason || "Module not accessible");
    }

    // Complete the module
    const progress = await moduleRepository.completeModule(
      userId,
      module.id,
      {
        ...submissionData,
        completed_at: new Date().toISOString(),
      },
    );

    // Log completion event
    await auditRepository.logModuleCompletion(userId, {
      module_id: module.id,
      module_name: moduleName,
      sequence_order: module.sequence_order,
      response_count: Object.keys(submissionData.responses).length,
    });

    // Update user's active module to next available
    const nextModule = await moduleRepository.getNextAccessibleModule(userId);
    await userRepository.setActiveModule(userId, nextModule?.id || null);

    return progress;
  }

  /**
   * Save partial progress without completing the module
   */
  static async saveModuleProgress(
    userId: number,
    moduleName: string,
    responseData: Record<string, unknown>,
  ): Promise<UserModuleProgress> {
    const module = await moduleRepository.getModuleByName(moduleName);
    if (!module) {
      throw new Error("Module not found");
    }

    // Check access
    const accessResult = await this.checkModuleAccess(userId, moduleName);
    if (!accessResult.accessible) {
      throw new Error(accessResult.reason || "Module not accessible");
    }

    // Start module if not already started
    let progress = await moduleRepository.getUserModuleProgress(
      userId,
      module.id,
    );
    if (!progress) {
      progress = await moduleRepository.startModule(userId, module.id);
    }

    // Update response data
    const updatedProgress = await moduleRepository.updateModuleResponse(
      userId,
      module.id,
      {
        responses: responseData,
        last_saved: new Date().toISOString(),
      },
    );

    return updatedProgress!;
  }

  /**
   * Get user's current module (what they should be working on)
   */
  static async getCurrentModule(userId: number): Promise<Module | null> {
    return await moduleRepository.getCurrentModule(userId);
  }

  /**
   * Get user's completion statistics
   */
  static async getUserProgress(userId: number) {
    return await moduleRepository.getUserCompletionStats(userId);
  }

  /**
   * Get module data for display (excluding sensitive progress data)
   */
  static async getModuleForUser(userId: number, moduleName: string): Promise<
    {
      module: Module;
      progress: UserModuleProgress | null;
      accessible: boolean;
      isCompleted: boolean;
      canReview: boolean;
    } | null
  > {
    const module = await moduleRepository.getModuleByName(moduleName);
    if (!module) return null;

    const progress = await moduleRepository.getUserModuleProgress(
      userId,
      module.id,
    );
    const accessible = await moduleRepository.isModuleAccessible(
      userId,
      module.id,
    );
    const isCompleted = progress?.status === "COMPLETED";

    // Users can review completed modules but not modify them
    const canReview = isCompleted;

    return {
      module,
      progress,
      accessible,
      isCompleted,
      canReview,
    };
  }

  /**
   * Initialize a new user's module progress (create consent module entry)
   */
  static async initializeUserModules(userId: number): Promise<void> {
    const consentModule = await moduleRepository.getModuleByName("consent");
    if (!consentModule) {
      throw new Error("Consent module not found");
    }

    // Start the consent module for new users
    await moduleRepository.startModule(userId, consentModule.id);
    await userRepository.setActiveModule(userId, consentModule.id);
  }

  /**
   * Handle access denied scenarios with proper audit logging
   */
  static async logAccessDenied(
    userId: number,
    moduleName: string,
    reason: string,
  ): Promise<void> {
    const module = await moduleRepository.getModuleByName(moduleName);

    await auditRepository.createAudit("MODULE_START", userId, {
      module_id: module?.id ?? null,
      module_name: moduleName,
      reason,
      timestamp: new Date().toISOString(),
    });
  }

  /**
   * Get the study navigation state for a user
   */
  static async getNavigationState(userId: number): Promise<{
    currentModule: Module | null;
    completedModules: string[];
    availableModules: string[];
    nextModule: Module | null;
    progressPercentage: number;
  }> {
    const modules = await moduleRepository.getModulesWithProgress(userId);
    const stats = await moduleRepository.getUserCompletionStats(userId);
    const currentModule = await moduleRepository.getCurrentModule(userId);
    const nextModule = await moduleRepository.getNextAccessibleModule(userId);

    const completedModules = modules
      .filter((m) => m.user_progress?.status === "COMPLETED")
      .map((m) => m.name);

    const availableModules = modules
      .filter((m) => m.accessible)
      .map((m) => m.name);

    return {
      currentModule,
      completedModules,
      availableModules,
      nextModule,
      progressPercentage: stats.completion_percentage,
    };
  }
}
