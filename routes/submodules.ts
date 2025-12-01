/**
 * Submodule Routes
 * API endpoints for submodule operations
 */

import { Hono } from "hono";
import { z } from "zod";
import { userRepository } from "../db/index.ts";
import { authMiddleware } from "../middleware/auth.ts";
import {
  submoduleAccessMiddleware,
  submoduleCompletionMiddleware,
  SubmoduleContext,
  submoduleNotCompletedMiddleware,
  submoduleReviewMiddleware,
} from "../middleware/submoduleAccess.ts";
import { SubmoduleService } from "../services/submoduleService.ts";
import { QuestionService } from "../services/questionService.ts";

const submodules = new Hono<SubmoduleContext>();

// Validation schemas
const submoduleResponseSchema = z.object({
  responses: z.record(z.unknown()),
  metadata: z.record(z.unknown()).optional(),
});

const partialResponseSchema = z.object({
  responses: z.record(z.unknown()),
});

/**
 * GET /modules/:moduleName/submodules - Get all submodules for a module
 * Returns submodules with progress and accessibility info
 */
submodules.get(
  "/:moduleName/submodules",
  authMiddleware,
  async (c) => {
    const user = c.get("user");
    if (!user) {
      return c.json({ error: "User not found in context" }, 500);
    }

    const moduleName = c.req.param("moduleName");

    try {
      const userRecord = await userRepository.findByUuid(user.uuid);
      if (!userRecord) {
        return c.json({ error: "User not found" }, 404);
      }

      // Get module by name
      const { moduleRepository } = await import("../db/modules.ts");
      const module = await moduleRepository.getModuleByName(moduleName);

      if (!module) {
        return c.json({ error: "Module not found" }, 404);
      }

      // Get all submodules with progress
      const submodulesData = await SubmoduleService.getSubmodulesForModule(
        userRecord.id,
        module.id,
      );

      return c.json({
        module: {
          name: module.name,
          title: module.title,
          allows_branching: module.allows_branching,
        },
        submodules: submodulesData.map((sub) => ({
          id: sub.id,
          name: sub.name,
          title: sub.title,
          description: sub.description,
          sequence_order: sub.sequence_order,
          branch_name: sub.branch_name,
          accessible: sub.accessible,
          questions_count: sub.questions_count || 0,
          progress: sub.user_progress
            ? {
              status: sub.user_progress.status,
              started_at: sub.user_progress.started_at,
              completed_at: sub.user_progress.completed_at,
            }
            : null,
        })),
      });
    } catch (error) {
      console.error("Failed to get submodules:", error);
      return c.json({ error: "Failed to get submodules" }, 500);
    }
  },
);

/**
 * GET /modules/:moduleName/submodules/:submoduleName - Get specific submodule
 * Protected by access middleware
 */
submodules.get(
  "/:moduleName/submodules/:submoduleName",
  authMiddleware,
  submoduleAccessMiddleware,
  async (c) => {
    const userRecord = c.get("userRecord");
    const submoduleAccess = c.get("submoduleAccess");

    if (!userRecord || !submoduleAccess) {
      return c.json({ error: "Validation failed" }, 500);
    }

    try {
      const submoduleData = await SubmoduleService.getSubmoduleByName(
        userRecord.id,
        submoduleAccess.moduleName,
        submoduleAccess.submoduleName,
      );

      if (!submoduleData) {
        return c.json({ error: "Submodule not found" }, 404);
      }

      // Get questions for this submodule
      const questions = await QuestionService.getQuestionsForSubmodule(
        userRecord.id,
        submoduleData.id,
      );

      return c.json({
        submodule: {
          id: submoduleData.id,
          name: submoduleData.name,
          title: submoduleData.title,
          description: submoduleData.description,
          sequence_order: submoduleData.sequence_order,
          branch_name: submoduleData.branch_name,
          accessible: submoduleData.accessible,
        },
        progress: submoduleData.user_progress
          ? {
            status: submoduleData.user_progress.status,
            started_at: submoduleData.user_progress.started_at,
            completed_at: submoduleData.user_progress.completed_at,
          }
          : null,
        questions: questions.map((q) => ({
          id: q.id,
          question_text: q.question_text,
          question_type: q.question_type,
          sequence_order: q.sequence_order,
          is_required: q.is_required,
          metadata: q.metadata,
          user_response: q.user_response
            ? {
              response_value: q.user_response.response_value,
              answered_at: q.user_response.answered_at,
            }
            : null,
        })),
      });
    } catch (error) {
      console.error("Failed to get submodule:", error);
      return c.json({ error: "Failed to get submodule" }, 500);
    }
  },
);

/**
 * POST /modules/:moduleName/submodules/:submoduleName/start - Start a submodule
 * Marks the submodule as in progress
 */
submodules.post(
  "/:moduleName/submodules/:submoduleName/start",
  authMiddleware,
  submoduleAccessMiddleware,
  submoduleNotCompletedMiddleware,
  async (c) => {
    const userRecord = c.get("userRecord");
    const submoduleAccess = c.get("submoduleAccess");

    if (!userRecord || !submoduleAccess) {
      return c.json({ error: "Validation failed" }, 500);
    }

    try {
      const progress = await SubmoduleService.startSubmodule(
        userRecord.id,
        submoduleAccess.moduleName,
        submoduleAccess.submoduleName,
      );

      return c.json({
        message: "Submodule started successfully",
        progress: {
          status: progress.status,
          started_at: progress.started_at,
        },
      });
    } catch (error) {
      console.error("Failed to start submodule:", error);
      const errorMessage = error instanceof Error
        ? error.message
        : "Failed to start submodule";
      return c.json(
        { error: errorMessage },
        400,
      );
    }
  },
);

/**
 * POST /modules/:moduleName/submodules/:submoduleName/save - Save progress
 * Updates response data without completing the submodule
 */
submodules.post(
  "/:moduleName/submodules/:submoduleName/save",
  authMiddleware,
  submoduleAccessMiddleware,
  submoduleNotCompletedMiddleware,
  async (c) => {
    const userRecord = c.get("userRecord");
    const submoduleAccess = c.get("submoduleAccess");

    if (!userRecord || !submoduleAccess) {
      return c.json({ error: "Validation failed" }, 500);
    }

    try {
      // Validate request body
      const body = await c.req.json();
      const validatedData = partialResponseSchema.parse(body);

      // Save progress
      const progress = await SubmoduleService.saveSubmoduleProgress(
        userRecord.id,
        submoduleAccess.moduleName,
        submoduleAccess.submoduleName,
        validatedData,
      );

      return c.json({
        message: "Progress saved successfully",
        progress: {
          status: progress.status,
          updated_at: progress.updated_at,
        },
      });
    } catch (error) {
      console.error("Failed to save submodule progress:", error);

      if (
        error && typeof error === "object" && "name" in error &&
        error.name === "ZodError"
      ) {
        return c.json(
          {
            error: "Invalid request data",
            details: "errors" in error ? error.errors : undefined,
          },
          400,
        );
      }

      const errorMessage = error instanceof Error
        ? error.message
        : "Failed to save progress";
      return c.json(
        { error: errorMessage },
        400,
      );
    }
  },
);

/**
 * POST /modules/:moduleName/submodules/:submoduleName/complete - Complete submodule
 * Marks submodule as completed and triggers branching rules
 */
submodules.post(
  "/:moduleName/submodules/:submoduleName/complete",
  authMiddleware,
  submoduleAccessMiddleware,
  submoduleCompletionMiddleware,
  async (c) => {
    const userRecord = c.get("userRecord");
    const submoduleAccess = c.get("submoduleAccess");

    if (!userRecord || !submoduleAccess) {
      return c.json({ error: "Validation failed" }, 500);
    }

    try {
      // Validate request body
      const body = await c.req.json();
      const validatedData = submoduleResponseSchema.parse(body);

      // Complete the submodule
      const result = await SubmoduleService.completeSubmodule(
        userRecord.id,
        submoduleAccess.moduleName,
        submoduleAccess.submoduleName,
        validatedData,
      );

      return c.json({
        message: "Submodule completed successfully",
        progress: {
          status: result.progress.status,
          completed_at: result.progress.completed_at,
        },
        unlocked_submodules: result.unlockedSubmodules,
        module_completed: result.moduleCompleted,
      });
    } catch (error) {
      console.error("Failed to complete submodule:", error);

      if (
        error && typeof error === "object" && "name" in error &&
        error.name === "ZodError"
      ) {
        return c.json(
          {
            error: "Invalid request data",
            details: "errors" in error ? error.errors : undefined,
          },
          400,
        );
      }

      const errorMessage = error instanceof Error
        ? error.message
        : "Failed to complete submodule";
      return c.json(
        { error: errorMessage },
        400,
      );
    }
  },
);

/**
 * GET /modules/:moduleName/submodules/:submoduleName/responses - View responses
 * Read-only access to completed submodule responses
 */
submodules.get(
  "/:moduleName/submodules/:submoduleName/responses",
  authMiddleware,
  submoduleAccessMiddleware,
  submoduleReviewMiddleware,
  async (c) => {
    const userRecord = c.get("userRecord");
    const submoduleAccess = c.get("submoduleAccess");

    if (!userRecord || !submoduleAccess) {
      return c.json({ error: "Validation failed" }, 500);
    }

    try {
      const submoduleData = await SubmoduleService.getSubmoduleByName(
        userRecord.id,
        submoduleAccess.moduleName,
        submoduleAccess.submoduleName,
      );

      if (!submoduleData) {
        return c.json({ error: "Submodule not found" }, 404);
      }

      // Get questions with responses
      const questions = await QuestionService.getQuestionsForSubmodule(
        userRecord.id,
        submoduleData.id,
      );

      return c.json({
        submodule: {
          name: submoduleData.name,
          title: submoduleData.title,
          completed_at: submoduleData.user_progress?.completed_at,
        },
        responses: questions.map((q) => ({
          question_id: q.id,
          question_text: q.question_text,
          question_type: q.question_type,
          response: q.user_response
            ? {
              value: q.user_response.response_value,
              answered_at: q.user_response.answered_at,
            }
            : null,
        })),
        legacy_response_data: submoduleData.user_progress?.response_data,
      });
    } catch (error) {
      console.error("Failed to get submodule responses:", error);
      return c.json({ error: "Failed to get responses" }, 500);
    }
  },
);

/**
 * GET /modules/:moduleName/submodules/stats - Get completion statistics
 * Returns progress stats for all submodules in a module
 */
submodules.get(
  "/:moduleName/submodules/stats",
  authMiddleware,
  async (c) => {
    const user = c.get("user");
    if (!user) {
      return c.json({ error: "User not found in context" }, 500);
    }

    const moduleName = c.req.param("moduleName");

    try {
      const userRecord = await userRepository.findByUuid(user.uuid);
      if (!userRecord) {
        return c.json({ error: "User not found" }, 404);
      }

      // Get module by name
      const { moduleRepository } = await import("../db/modules.ts");
      const module = await moduleRepository.getModuleByName(moduleName);

      if (!module) {
        return c.json({ error: "Module not found" }, 404);
      }

      // Get completion stats
      const stats = await SubmoduleService.getSubmoduleCompletionStats(
        userRecord.id,
        module.id,
      );

      return c.json(stats);
    } catch (error) {
      console.error("Failed to get submodule stats:", error);
      return c.json({ error: "Failed to get statistics" }, 500);
    }
  },
);

export default submodules;
