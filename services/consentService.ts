import {
  auditRepository,
  consentRepository,
  consentVersionRepository,
  moduleRepository,
} from "../db/index.ts";
import type {
  Consent,
  ConsentVersion,
  Module,
  UserModuleProgress,
} from "../db/index.ts";
import { ModuleService } from "./moduleService.ts";

export interface ConsentSubmission {
  version?: string; // Optional - will use active version if not provided
  content?: string;
  responses: Record<string, unknown>;
}

export interface ConsentStatusResponse {
  hasConsented: boolean;
  latestConsent: Consent | null;
  consentModule: {
    status: "NOT_STARTED" | "IN_PROGRESS" | "COMPLETED";
    progress: UserModuleProgress | null;
  };
}

export class ConsentService {
  /**
   * Get the current active consent version
   */
  static async getCurrentConsentVersion(): Promise<ConsentVersion | null> {
    return await consentVersionRepository.getActiveVersion();
  }

  /**
   * Submit user consent - creates consent record and completes consent module
   */
  static async submitConsent(
    userId: number,
    submission: ConsentSubmission,
  ): Promise<{
    consent: Consent;
    moduleProgress: UserModuleProgress;
    nextModule: Module | null;
    usedVersion: string;
  }> {
    // Get the consent module
    const consentModule = await moduleRepository.getModuleByName("consent");
    if (!consentModule) {
      throw new Error("Consent module not found");
    }

    // Determine which version to use
    let versionToUse = submission.version;
    if (!versionToUse) {
      // Auto-use current active version if not provided
      const activeVersion = await consentVersionRepository.getActiveVersion();
      if (!activeVersion) {
        throw new Error("No active consent version available");
      }
      versionToUse = activeVersion.version;
    }

    // Validate the version exists and is active
    const consentVersion = await consentVersionRepository.getVersionByName(
      versionToUse,
    );
    if (!consentVersion) {
      throw new Error(`Consent version "${versionToUse}" not found`);
    }

    if (consentVersion.status !== "ACTIVE") {
      throw new Error(
        `Consent version "${versionToUse}" is ${consentVersion.status.toLowerCase()} and cannot be used. Please use the current active version.`,
      );
    }

    // Check if user has already consented to this version
    const existingConsent = await consentRepository.findByUserAndVersion(
      userId,
      versionToUse,
    );
    if (existingConsent) {
      throw new Error(
        `User has already consented to version ${versionToUse}`,
      );
    }

    // Check if consent module is already completed
    const moduleData = await ModuleService.getModuleForUser(
      userId,
      "consent",
    );
    if (moduleData?.isCompleted) {
      throw new Error("Consent module is already completed");
    }

    // Create consent record
    const consent = await consentRepository.createConsent(
      userId,
      versionToUse,
      submission.content,
    );

    // Complete the consent module with the consent responses
    const moduleProgress = await ModuleService.completeModule(
      userId,
      "consent",
      {
        responses: submission.responses,
        metadata: {
          consent_version: versionToUse,
          consent_version_title: consentVersion.title,
          consent_id: consent.id,
        },
      },
    );

    // Log consent in audit trail
    await auditRepository.logConsent(userId, {
      consent_id: consent.id,
      version: versionToUse,
      version_title: consentVersion.title,
      module_id: consentModule.id,
      timestamp: new Date().toISOString(),
    });

    // Get next available module
    const nextModule = await ModuleService.getCurrentModule(userId);

    return {
      consent,
      moduleProgress,
      nextModule,
      usedVersion: versionToUse,
    };
  }

  /**
   * Get user's consent status including latest consent and module progress
   */
  static async getConsentStatus(
    userId: number,
  ): Promise<ConsentStatusResponse> {
    // Get latest consent record
    const latestConsent = await consentRepository.getLatestConsentByUser(
      userId,
    );

    // Get consent module progress
    const consentModule = await moduleRepository.getModuleByName("consent");
    let moduleProgress: UserModuleProgress | null = null;
    let status: "NOT_STARTED" | "IN_PROGRESS" | "COMPLETED" = "NOT_STARTED";

    if (consentModule) {
      moduleProgress = await moduleRepository.getUserModuleProgress(
        userId,
        consentModule.id,
      );
      status = moduleProgress?.status || "NOT_STARTED";
    }

    return {
      hasConsented: !!latestConsent,
      latestConsent,
      consentModule: {
        status,
        progress: moduleProgress,
      },
    };
  }

  /**
   * Get user's complete consent history
   */
  static async getUserConsentHistory(userId: number): Promise<Consent[]> {
    return await consentRepository.findByUser(userId);
  }

  /**
   * Check if user has consented to a specific version
   */
  static async hasConsentedToVersion(
    userId: number,
    version: string,
  ): Promise<boolean> {
    return await consentRepository.hasUserConsentedToVersion(userId, version);
  }

  /**
   * Get consent module information for user
   */
  static async getConsentModuleInfo(userId: number): Promise<{
    module: Module | null;
    progress: UserModuleProgress | null;
    accessible: boolean;
    isCompleted: boolean;
  }> {
    const moduleData = await ModuleService.getModuleForUser(userId, "consent");

    if (!moduleData) {
      return {
        module: null,
        progress: null,
        accessible: false,
        isCompleted: false,
      };
    }

    return {
      module: moduleData.module,
      progress: moduleData.progress,
      accessible: moduleData.accessible,
      isCompleted: moduleData.isCompleted,
    };
  }
}
