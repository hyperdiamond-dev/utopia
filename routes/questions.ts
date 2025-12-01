/**
 * Question Routes
 * API endpoints for question operations and response submission
 */

import { Hono } from "hono";
import { z } from "zod";
import { userRepository } from "../db/index.ts";
import { authMiddleware } from "../middleware/auth.ts";
import { QuestionService } from "../services/questionService.ts";

// Context type for authenticated requests
type QuestionContext = {
  Variables: {
    user: {
      uuid?: string;
      friendlyAlias?: string;
      firebaseUid?: string;
      [key: string]: unknown;
    };
  };
};

const questions = new Hono<QuestionContext>();

// Validation schemas
const singleResponseSchema = z.object({
  response_value: z.union([
    z.boolean(),
    z.string(),
    z.number(),
    z.array(z.string()),
    z.null(),
  ]),
});

const batchResponseSchema = z.object({
  responses: z.array(
    z.object({
      question_id: z.number(),
      response_value: z.union([
        z.boolean(),
        z.string(),
        z.number(),
        z.array(z.string()),
        z.null(),
      ]),
    }),
  ),
  module_id: z.number().optional(),
  submodule_id: z.number().optional(),
});

/**
 * GET /modules/:moduleName/questions - Get all questions for a module
 * Returns questions with user responses
 */
questions.get(
  "/modules/:moduleName/questions",
  authMiddleware,
  async (c) => {
    const user = c.get("user");
    if (!user) {
      return c.json({ error: "User not found in context" }, 500);
    }
    if (!user.uuid) {
      return c.json({ error: "User UUID not found" }, 500);
    }

    const moduleName = c.req.param("moduleName");

    try {
      const userRecord = await userRepository.findByUuid(user.uuid!);
      if (!userRecord) {
        return c.json({ error: "User not found" }, 404);
      }

      // Get module by name
      const { moduleRepository } = await import("../db/modules.ts");
      const module = await moduleRepository.getModuleByName(moduleName);

      if (!module) {
        return c.json({ error: "Module not found" }, 404);
      }

      // Get questions with responses
      const questionsData = await QuestionService.getQuestionsForModule(
        userRecord.id,
        module.id,
      );

      return c.json({
        module: {
          name: module.name,
          title: module.title,
        },
        questions: questionsData.map((q) => ({
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
      console.error("Failed to get module questions:", error);
      return c.json({ error: "Failed to get questions" }, 500);
    }
  },
);

/**
 * GET /submodules/:submoduleName/questions - Get all questions for a submodule
 * Returns questions with user responses
 */
questions.get(
  "/submodules/:submoduleName/questions",
  authMiddleware,
  async (c) => {
    const user = c.get("user");
    if (!user) {
      return c.json({ error: "User not found in context" }, 500);
    }
    if (!user.uuid) {
      return c.json({ error: "User UUID not found" }, 500);
    }

    const submoduleName = c.req.param("submoduleName");

    try {
      const userRecord = await userRepository.findByUuid(user.uuid!);
      if (!userRecord) {
        return c.json({ error: "User not found" }, 404);
      }

      // Get submodule by name (we need moduleName too, but for simplicity we'll query)
      const { sql } = await import("../db/connection.ts");

      const submoduleResult = await sql`
        SELECT id, name, title
        FROM terminal_utopia.submodules
        WHERE name = ${submoduleName}
        AND is_active = true
        LIMIT 1
      `;

      if (submoduleResult.length === 0) {
        return c.json({ error: "Submodule not found" }, 404);
      }

      const submodule = submoduleResult[0] as {
        id: number;
        name: string;
        title: string;
      };

      // Get questions with responses
      const questionsData = await QuestionService.getQuestionsForSubmodule(
        userRecord.id,
        submodule.id,
      );

      return c.json({
        submodule: {
          name: submodule.name,
          title: submodule.title,
        },
        questions: questionsData.map((q) => ({
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
      console.error("Failed to get submodule questions:", error);
      return c.json({ error: "Failed to get questions" }, 500);
    }
  },
);

/**
 * GET /questions/:questionId - Get a specific question with user response
 */
questions.get(
  "/questions/:questionId",
  authMiddleware,
  async (c) => {
    const user = c.get("user");
    if (!user) {
      return c.json({ error: "User not found in context" }, 500);
    }
    if (!user.uuid) {
      return c.json({ error: "User UUID not found" }, 500);
    }

    const questionIdParam = c.req.param("questionId");
    const questionId = parseInt(questionIdParam, 10);

    if (isNaN(questionId)) {
      return c.json({ error: "Invalid question ID" }, 400);
    }

    try {
      const userRecord = await userRepository.findByUuid(user.uuid!);
      if (!userRecord) {
        return c.json({ error: "User not found" }, 404);
      }

      const questionData = await QuestionService.getQuestionById(
        userRecord.id,
        questionId,
      );

      if (!questionData) {
        return c.json({ error: "Question not found" }, 404);
      }

      return c.json({
        question: {
          id: questionData.id,
          question_text: questionData.question_text,
          question_type: questionData.question_type,
          sequence_order: questionData.sequence_order,
          is_required: questionData.is_required,
          metadata: questionData.metadata,
        },
        user_response: questionData.user_response
          ? {
            response_value: questionData.user_response.response_value,
            answered_at: questionData.user_response.answered_at,
          }
          : null,
      });
    } catch (error) {
      console.error("Failed to get question:", error);
      return c.json({ error: "Failed to get question" }, 500);
    }
  },
);

/**
 * POST /questions/:questionId/respond - Submit response to a single question
 */
questions.post(
  "/questions/:questionId/respond",
  authMiddleware,
  async (c) => {
    const user = c.get("user");
    if (!user) {
      return c.json({ error: "User not found in context" }, 500);
    }
    if (!user.uuid) {
      return c.json({ error: "User UUID not found" }, 500);
    }
    const questionIdParam = c.req.param("questionId");
    const questionId = parseInt(questionIdParam, 10);

    if (isNaN(questionId)) {
      return c.json({ error: "Invalid question ID" }, 400);
    }

    try {
      const userRecord = await userRepository.findByUuid(user.uuid!);
      if (!userRecord) {
        return c.json({ error: "User not found" }, 404);
      }

      // Validate request body
      const body = await c.req.json();
      const validatedData = singleResponseSchema.parse(body);

      // Submit response
      const response = await QuestionService.submitResponse(
        userRecord.id,
        questionId,
        validatedData.response_value,
      );

      return c.json({
        message: "Response submitted successfully",
        response: {
          question_id: response.question_id,
          response_value: response.response_value,
          answered_at: response.answered_at,
        },
      });
    } catch (error) {
      console.error("Failed to submit response:", error);

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
        : "Failed to submit response";
      return c.json(
        { error: errorMessage },
        400,
      );
    }
  },
);

/**
 * POST /questions/respond/batch - Submit multiple responses at once
 */
questions.post(
  "/questions/respond/batch",
  authMiddleware,
  async (c) => {
    const user = c.get("user");
    if (!user) {
      return c.json({ error: "User not found in context" }, 500);
    }
    if (!user.uuid) {
      return c.json({ error: "User UUID not found" }, 500);
    }

    try {
      const userRecord = await userRepository.findByUuid(user.uuid!);
      if (!userRecord) {
        return c.json({ error: "User not found" }, 404);
      }

      // Validate request body
      const body = await c.req.json();
      const validatedData = batchResponseSchema.parse(body);

      // Submit batch responses
      const result = await QuestionService.submitBatchResponses(
        userRecord.id,
        validatedData,
      );

      if (!result.validation.valid) {
        return c.json(
          {
            error: "Validation failed",
            errors: result.validation.errors,
          },
          400,
        );
      }

      return c.json({
        message: "Responses submitted successfully",
        responses: result.responses.map((r) => ({
          question_id: r.question_id,
          response_value: r.response_value,
          answered_at: r.answered_at,
        })),
      });
    } catch (error) {
      console.error("Failed to submit batch responses:", error);

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
        : "Failed to submit responses";
      return c.json(
        { error: errorMessage },
        400,
      );
    }
  },
);

/**
 * GET /questions/:questionId/response - Get user's response to a question
 */
questions.get(
  "/questions/:questionId/response",
  authMiddleware,
  async (c) => {
    const user = c.get("user");
    if (!user) {
      return c.json({ error: "User not found in context" }, 500);
    }
    if (!user.uuid) {
      return c.json({ error: "User UUID not found" }, 500);
    }

    const questionIdParam = c.req.param("questionId");
    const questionId = parseInt(questionIdParam, 10);

    if (isNaN(questionId)) {
      return c.json({ error: "Invalid question ID" }, 400);
    }

    try {
      const userRecord = await userRepository.findByUuid(user.uuid!);
      if (!userRecord) {
        return c.json({ error: "User not found" }, 404);
      }

      const response = await QuestionService.getUserResponse(
        userRecord.id,
        questionId,
      );

      if (!response) {
        return c.json(
          {
            message: "No response found for this question",
            response: null,
          },
          200,
        );
      }

      return c.json({
        response: {
          question_id: response.question_id,
          response_value: response.response_value,
          answered_at: response.answered_at,
        },
      });
    } catch (error) {
      console.error("Failed to get response:", error);
      return c.json({ error: "Failed to get response" }, 500);
    }
  },
);

/**
 * DELETE /questions/:questionId/response - Delete user's response (admin/testing)
 */
questions.delete(
  "/questions/:questionId/response",
  authMiddleware,
  async (c) => {
    const user = c.get("user");
    if (!user) {
      return c.json({ error: "User not found in context" }, 500);
    }

    if (!user.uuid) {
      return c.json({ error: "User UUID not found" }, 500);
    }

    const questionIdParam = c.req.param("questionId");
    const questionId = parseInt(questionIdParam, 10);

    if (isNaN(questionId)) {
      return c.json({ error: "Invalid question ID" }, 400);
    }

    try {
      const userRecord = await userRepository.findByUuid(user.uuid!);
      if (!userRecord) {
        return c.json({ error: "User not found" }, 404);
      }

      const deleted = await QuestionService.deleteResponse(
        userRecord.id,
        questionId,
      );

      if (!deleted) {
        return c.json({ error: "Response not found" }, 404);
      }

      return c.json({
        message: "Response deleted successfully",
      });
    } catch (error) {
      console.error("Failed to delete response:", error);
      const errorMessage = error instanceof Error
        ? error.message
        : "Failed to delete response";
      return c.json(
        { error: errorMessage },
        400,
      );
    }
  },
);

export default questions;
