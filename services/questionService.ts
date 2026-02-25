/**
 * Question Service
 * Business logic for question operations, response validation, and answer submission
 */

import { questionRepository } from "../db/questions.ts";
import { submoduleRepository } from "../db/submodules.ts";
import { moduleRepository } from "../db/modules.ts";
import { auditRepository } from "../db/index.ts";
import type {
  Question,
  QuestionWithResponse,
  ResponseValue,
  UserQuestionResponse,
} from "../db/questions.ts";

// ============================================================================
// Type Definitions
// ============================================================================

export interface QuestionSubmissionData {
  question_id: number;
  response_value: ResponseValue;
}

export interface BatchQuestionSubmission {
  responses: QuestionSubmissionData[];
  module_id?: number;
  submodule_id?: number;
}

export interface QuestionValidationResult {
  valid: boolean;
  errors: Record<number, string>; // question_id -> error message
}

// ============================================================================
// Service Class
// ============================================================================

export class QuestionService {
  /**
   * Get all questions for a module (excluding submodule questions)
   */
  static async getQuestionsForModule(
    userId: number,
    moduleId: number,
  ): Promise<QuestionWithResponse[]> {
    return await questionRepository.getQuestionsWithResponsesForModule(
      userId,
      moduleId,
    );
  }

  /**
   * Get all questions for a submodule
   */
  static async getQuestionsForSubmodule(
    userId: number,
    submoduleId: number,
  ): Promise<QuestionWithResponse[]> {
    return await questionRepository.getQuestionsWithResponsesForSubmodule(
      userId,
      submoduleId,
    );
  }

  /**
   * Get a single question by ID with user's response
   */
  static async getQuestionById(
    userId: number,
    questionId: number,
  ): Promise<QuestionWithResponse | null> {
    const question = await questionRepository.getQuestionById(questionId);
    if (!question) return null;

    const response = await questionRepository.getUserResponse(
      userId,
      questionId,
    );

    return {
      ...question,
      user_response: response || undefined,
    };
  }

  /**
   * Submit a response to a single question
   */
  static async submitResponse(
    userId: number,
    questionId: number,
    responseValue: ResponseValue,
  ): Promise<UserQuestionResponse> {
    const question = await questionRepository.getQuestionById(questionId);

    if (!question) {
      throw new Error("Question not found");
    }

    // Look up module/submodule association via junction tables
    const submoduleId = await questionRepository.getSubmoduleIdForQuestion(
      questionId,
    );
    const moduleId = submoduleId
      ? null
      : await questionRepository.getModuleIdForQuestion(questionId);

    // Check if the module/submodule is already completed (read-only)
    if (submoduleId) {
      const submoduleProgress = await submoduleRepository
        .getUserSubmoduleProgress(
          userId,
          submoduleId,
        );

      if (submoduleProgress?.status === "COMPLETED") {
        throw new Error(
          "Submodule is read-only - completed submodules cannot be modified",
        );
      }
    } else if (moduleId) {
      const moduleProgress = await moduleRepository.getUserModuleProgress(
        userId,
        moduleId,
      );

      if (moduleProgress?.status === "COMPLETED") {
        throw new Error(
          "Module is read-only - completed modules cannot be modified",
        );
      }
    }

    // Validate the response
    const validation = questionRepository.validateResponse(
      question,
      responseValue,
    );

    if (!validation.valid) {
      throw new Error(validation.error || "Invalid response");
    }

    // Save the response
    const response = await questionRepository.upsertUserResponse(
      userId,
      questionId,
      responseValue,
      moduleId,
      submoduleId,
    );

    // Log audit event
    await auditRepository.logModuleStart(userId, {
      action: "question_answered",
      question_id: questionId,
      module_id: moduleId,
      submodule_id: submoduleId,
    });

    return response;
  }

  /**
   * Submit multiple responses at once (batch operation)
   */
  static async submitBatchResponses(
    userId: number,
    submission: BatchQuestionSubmission,
  ): Promise<{
    responses: UserQuestionResponse[];
    validation: QuestionValidationResult;
  }> {
    const errors: Record<number, string> = {};
    const validResponses: QuestionSubmissionData[] = [];

    // Validate all responses first
    for (const item of submission.responses) {
      const question = await questionRepository.getQuestionById(
        item.question_id,
      );

      if (!question) {
        errors[item.question_id] = "Question not found";
        continue;
      }

      const validation = questionRepository.validateResponse(
        question,
        item.response_value,
      );

      if (!validation.valid) {
        errors[item.question_id] = validation.error || "Invalid response";
      } else {
        validResponses.push(item);
      }
    }

    // If there are validation errors, return them
    if (Object.keys(errors).length > 0) {
      return {
        responses: [],
        validation: {
          valid: false,
          errors,
        },
      };
    }

    // Save all valid responses
    const responses = await questionRepository.batchUpsertResponses(
      userId,
      validResponses.map((r) => ({
        question_id: r.question_id,
        response_value: r.response_value,
        module_id: submission.module_id || null,
        submodule_id: submission.submodule_id || null,
      })),
    );

    // Log audit event
    await auditRepository.logModuleStart(userId, {
      action: "batch_questions_answered",
      question_count: responses.length,
      module_id: submission.module_id ?? null,
      submodule_id: submission.submodule_id ?? null,
    });

    return {
      responses,
      validation: {
        valid: true,
        errors: {},
      },
    };
  }

  /**
   * Check if all required questions are answered for a module
   */
  static async validateModuleQuestions(
    userId: number,
    moduleId: number,
  ): Promise<QuestionValidationResult> {
    const allAnswered = await questionRepository
      .areAllRequiredQuestionsAnswered(
        userId,
        moduleId,
      );

    if (!allAnswered) {
      return {
        valid: false,
        errors: {
          0: "Not all required questions have been answered",
        },
      };
    }

    // Additional validation: check each answer is valid
    const questions = await questionRepository
      .getQuestionsWithResponsesForModule(
        userId,
        moduleId,
      );

    const errors: Record<number, string> = {};

    for (const question of questions) {
      if (question.is_required && !question.user_response) {
        errors[question.id] = "This question is required";
        continue;
      }

      if (question.user_response) {
        const validation = questionRepository.validateResponse(
          question,
          question.user_response.response_value,
        );

        if (!validation.valid) {
          errors[question.id] = validation.error || "Invalid response";
        }
      }
    }

    return {
      valid: Object.keys(errors).length === 0,
      errors,
    };
  }

  /**
   * Check if all required questions are answered for a submodule
   */
  static async validateSubmoduleQuestions(
    userId: number,
    submoduleId: number,
  ): Promise<QuestionValidationResult> {
    const allAnswered = await questionRepository
      .areAllRequiredQuestionsAnswered(
        userId,
        0, // Not used when submoduleId is provided
        submoduleId,
      );

    if (!allAnswered) {
      return {
        valid: false,
        errors: {
          0: "Not all required questions have been answered",
        },
      };
    }

    // Additional validation: check each answer is valid
    const questions = await questionRepository
      .getQuestionsWithResponsesForSubmodule(
        userId,
        submoduleId,
      );

    const errors: Record<number, string> = {};

    for (const question of questions) {
      if (question.is_required && !question.user_response) {
        errors[question.id] = "This question is required";
        continue;
      }

      if (question.user_response) {
        const validation = questionRepository.validateResponse(
          question,
          question.user_response.response_value,
        );

        if (!validation.valid) {
          errors[question.id] = validation.error || "Invalid response";
        }
      }
    }

    return {
      valid: Object.keys(errors).length === 0,
      errors,
    };
  }

  /**
   * Get user's response to a specific question
   */
  static async getUserResponse(
    userId: number,
    questionId: number,
  ): Promise<UserQuestionResponse | null> {
    return await questionRepository.getUserResponse(userId, questionId);
  }

  /**
   * Get all user responses for a module
   */
  static async getUserResponsesForModule(
    userId: number,
    moduleId: number,
  ): Promise<UserQuestionResponse[]> {
    return await questionRepository.getUserResponsesForModule(userId, moduleId);
  }

  /**
   * Get all user responses for a submodule
   */
  static async getUserResponsesForSubmodule(
    userId: number,
    submoduleId: number,
  ): Promise<UserQuestionResponse[]> {
    return await questionRepository.getUserResponsesForSubmodule(
      userId,
      submoduleId,
    );
  }

  /**
   * Delete a user's response (for testing or admin purposes)
   */
  static async deleteResponse(
    userId: number,
    questionId: number,
  ): Promise<boolean> {
    const question = await questionRepository.getQuestionById(questionId);

    if (!question) {
      throw new Error("Question not found");
    }

    // Look up module/submodule association via junction tables
    const submoduleId = await questionRepository.getSubmoduleIdForQuestion(
      questionId,
    );
    const moduleId = submoduleId
      ? null
      : await questionRepository.getModuleIdForQuestion(questionId);

    // Check if the module/submodule is already completed (read-only)
    if (submoduleId) {
      const submoduleProgress = await submoduleRepository
        .getUserSubmoduleProgress(
          userId,
          submoduleId,
        );

      if (submoduleProgress?.status === "COMPLETED") {
        throw new Error(
          "Submodule is read-only - completed submodules cannot be modified",
        );
      }
    } else if (moduleId) {
      const moduleProgress = await moduleRepository.getUserModuleProgress(
        userId,
        moduleId,
      );

      if (moduleProgress?.status === "COMPLETED") {
        throw new Error(
          "Module is read-only - completed modules cannot be modified",
        );
      }
    }

    return await questionRepository.deleteUserResponse(userId, questionId);
  }

  /**
   * Create a new question (admin operation)
   */
  static async createQuestion(
    data: Omit<Question, "id" | "created_at" | "updated_at" | "is_active">,
    moduleId?: number,
    submoduleId?: number,
  ): Promise<Question> {
    // Validate that question belongs to either module or submodule
    if (!moduleId && !submoduleId) {
      throw new Error("Question must belong to a module or submodule");
    }

    // Validate question type
    const validTypes = [
      "true_false",
      "multiple_choice",
      "fill_blank",
      "free_form",
    ];
    if (!validTypes.includes(data.question_type)) {
      throw new Error(`Invalid question type: ${data.question_type}`);
    }

    return await questionRepository.createQuestion(data, moduleId, submoduleId);
  }

  /**
   * Update a question (admin operation)
   */
  static async updateQuestion(
    questionId: number,
    data: Partial<Omit<Question, "id" | "created_at" | "updated_at">>,
  ): Promise<Question | null> {
    return await questionRepository.updateQuestion(questionId, data);
  }

  /**
   * Delete a question (admin operation - soft delete)
   */
  static async deleteQuestion(questionId: number): Promise<boolean> {
    return await questionRepository.deleteQuestion(questionId);
  }
}
