import { Env, Hono } from "hono";
import { z } from "zod";
import { consentVersionRepository, userRepository } from "../db/index.ts";
import { authMiddleware } from "../middleware/auth.ts";
import { ConsentService } from "../services/consentService.ts";

interface ConsentContext extends Env {
  Variables: {
    user?: { uuid: string; id?: string; name: string };
  };
}

const consent = new Hono<ConsentContext>();

// Validation schemas
const consentSubmissionSchema = z.object({
  version: z.string().min(1, "Consent version is required").optional(),
  content: z.string().optional(),
  responses: z.record(z.unknown()),
});

/**
 * POST /consent - Submit user consent
 * Creates consent record and completes the consent module
 */
consent.post("/", authMiddleware, async (c) => {
  const user = c.get("user");
  if (!user) {
    return c.json({ error: "User not found in context" }, 500);
  }

  try {
    const userRecord = await userRepository.findByUuid(user.uuid);
    if (!userRecord) {
      return c.json({ error: "User not found" }, 404);
    }

    const body = await c.req.json();
    const submission = consentSubmissionSchema.parse(body);

    const result = await ConsentService.submitConsent(
      userRecord.id,
      submission,
    );

    return c.json({
      message: "Consent submitted successfully",
      consent: {
        id: result.consent.id,
        version: result.usedVersion,
        consented_at: result.consent.consented_at,
      },
      module_completed: {
        status: result.moduleProgress.status,
        completed_at: result.moduleProgress.completed_at,
      },
      next_module: result.nextModule
        ? {
          name: result.nextModule.name,
          title: result.nextModule.title,
          sequence_order: result.nextModule.sequence_order,
        }
        : null,
    }, 201);
  } catch (error) {
    if (error instanceof z.ZodError) {
      return c.json({
        error: "Invalid consent submission",
        details: error.errors,
      }, 400);
    }

    console.error("Failed to submit consent:", error);
    return c.json({
      error: error instanceof Error
        ? error.message
        : "Failed to submit consent",
    }, 500);
  }
});

/**
 * GET /consent/status - Get user's consent status
 * Returns latest consent and module progress information
 */
consent.get("/status", authMiddleware, async (c) => {
  const user = c.get("user");
  if (!user) {
    return c.json({ error: "User not found in context" }, 500);
  }

  try {
    const userRecord = await userRepository.findByUuid(user.uuid);
    if (!userRecord) {
      return c.json({ error: "User not found" }, 404);
    }

    const status = await ConsentService.getConsentStatus(userRecord.id);

    return c.json({
      has_consented: status.hasConsented,
      latest_consent: status.latestConsent
        ? {
          id: status.latestConsent.id,
          version: status.latestConsent.version,
          consented_at: status.latestConsent.consented_at,
        }
        : null,
      consent_module: {
        status: status.consentModule.status,
        started_at: status.consentModule.progress?.started_at,
        completed_at: status.consentModule.progress?.completed_at,
      },
    });
  } catch (error) {
    console.error("Failed to get consent status:", error);
    return c.json({ error: "Failed to get consent status" }, 500);
  }
});

/**
 * GET /consent/history - Get user's consent history
 * Returns all consent records for the user
 */
consent.get("/history", authMiddleware, async (c) => {
  const user = c.get("user");
  if (!user) {
    return c.json({ error: "User not found in context" }, 500);
  }

  try {
    const userRecord = await userRepository.findByUuid(user.uuid);
    if (!userRecord) {
      return c.json({ error: "User not found" }, 404);
    }

    const history = await ConsentService.getUserConsentHistory(userRecord.id);

    return c.json({
      consents: history.map((consent) => ({
        id: consent.id,
        version: consent.version,
        consented_at: consent.consented_at,
      })),
      total_count: history.length,
    });
  } catch (error) {
    console.error("Failed to get consent history:", error);
    return c.json({ error: "Failed to get consent history" }, 500);
  }
});

/**
 * GET /consent/module - Get consent module information
 * Returns consent module details and progress
 */
consent.get("/module", authMiddleware, async (c) => {
  const user = c.get("user");
  if (!user) {
    return c.json({ error: "User not found in context" }, 500);
  }

  try {
    const userRecord = await userRepository.findByUuid(user.uuid);
    if (!userRecord) {
      return c.json({ error: "User not found" }, 404);
    }

    const moduleInfo = await ConsentService.getConsentModuleInfo(
      userRecord.id,
    );

    if (!moduleInfo.module) {
      return c.json({ error: "Consent module not found" }, 404);
    }

    return c.json({
      module: {
        name: moduleInfo.module.name,
        title: moduleInfo.module.title,
        description: moduleInfo.module.description,
        sequence_order: moduleInfo.module.sequence_order,
      },
      progress: {
        status: moduleInfo.progress?.status || "NOT_STARTED",
        started_at: moduleInfo.progress?.started_at,
        completed_at: moduleInfo.progress?.completed_at,
      },
      accessible: moduleInfo.accessible,
      is_completed: moduleInfo.isCompleted,
    });
  } catch (error) {
    console.error("Failed to get consent module info:", error);
    return c.json({ error: "Failed to get consent module info" }, 500);
  }
});

/**
 * GET /consent/version/current - Get current active consent version
 * Returns the consent version users should consent to
 */
consent.get("/version/current", async (c) => {
  try {
    const currentVersion = await ConsentService.getCurrentConsentVersion();

    if (!currentVersion) {
      return c.json({ error: "No active consent version available" }, 404);
    }

    return c.json({
      version: currentVersion.version,
      title: currentVersion.title,
      content_text: currentVersion.content_text,
      content_url: currentVersion.content_url,
      effective_date: currentVersion.effective_date,
    });
  } catch (error) {
    console.error("Failed to get current consent version:", error);
    return c.json({ error: "Failed to get current consent version" }, 500);
  }
});

/**
 * GET /consent/version/all - Get all consent versions
 * Returns all consent versions (for admin/audit purposes)
 */
consent.get("/version/all", authMiddleware, async (c) => {
  try {
    const versions = await consentVersionRepository.getAllVersions();

    return c.json({
      versions: versions.map((v) => ({
        version: v.version,
        title: v.title,
        status: v.status,
        effective_date: v.effective_date,
        deprecated_date: v.deprecated_date,
        created_at: v.created_at,
      })),
      total_count: versions.length,
    });
  } catch (error) {
    console.error("Failed to get consent versions:", error);
    return c.json({ error: "Failed to get consent versions" }, 500);
  }
});

/**
 * GET /consent/version/:version - Get specific consent version details
 * Returns details about a specific consent version
 */
consent.get("/version/:version", async (c) => {
  const versionName = c.req.param("version");

  try {
    const version = await consentVersionRepository.getVersionByName(
      versionName,
    );

    if (!version) {
      return c.json({ error: "Consent version not found" }, 404);
    }

    return c.json({
      version: version.version,
      title: version.title,
      content_text: version.content_text,
      content_url: version.content_url,
      status: version.status,
      effective_date: version.effective_date,
      deprecated_date: version.deprecated_date,
    });
  } catch (error) {
    console.error("Failed to get consent version:", error);
    return c.json({ error: "Failed to get consent version" }, 500);
  }
});

export { consent };
