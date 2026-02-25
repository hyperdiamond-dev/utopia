/**
 * Question Repository
 * Handles database operations for questions and user question responses
 */

import { sql } from "./connection.ts";

// ============================================================================
// Type Definitions
// ============================================================================

export type QuestionType =
  | "true_false"
  | "multiple_choice"
  | "fill_blank"
  | "free_form";

export interface Question {
  id: number;
  question_text: string;
  question_type: QuestionType;
  sequence_order: number;
  is_required: boolean;
  metadata: QuestionMetadata;
  is_active: boolean;
  created_at: Date;
  updated_at: Date;
}

export interface QuestionMetadata {
  // For multiple_choice questions
  choices?: Array<{
    id: string;
    text: string;
    value: string | number | boolean;
  }>;

  // For fill_blank and free_form questions
  validation?: {
    min_length?: number;
    max_length?: number;
    pattern?: string; // Regex pattern
    error_message?: string;
  };

  // For true_false questions
  true_label?: string; // Default: "True"
  false_label?: string; // Default: "False"

  // Additional metadata
  placeholder?: string;
  help_text?: string;
  allow_multiple?: boolean; // For multiple_choice
  [key: string]: unknown; // Allow additional custom fields
}

export interface UserQuestionResponse {
  id: number;
  user_id: number;
  question_id: number;
  module_id: number | null;
  submodule_id: number | null;
  response_value: ResponseValue;
  answered_at: Date;
  created_at: Date;
  updated_at: Date;
}

export type ResponseValue =
  | boolean // For true_false
  | string // For fill_blank, free_form, single multiple_choice
  | string[] // For multiple multiple_choice
  | number
  | null;

export interface QuestionWithResponse extends Question {
  user_response?: UserQuestionResponse;
}

// ============================================================================
// Repository Class
// ============================================================================

export class QuestionRepository {
  // ==========================================================================
  // Question CRUD Operations
  // ==========================================================================

  /**
   * Get question by ID
   */
  async getQuestionById(questionId: number): Promise<Question | null> {
    const result = await sql`
      SELECT *
      FROM terminal_utopia.questions
      WHERE id = ${questionId}
      AND is_active = true
    `;

    return result.length > 0 ? (result[0] as Question) : null;
  }

  /**
   * Get the module ID associated with a question via junction table
   */
  async getModuleIdForQuestion(questionId: number): Promise<number | null> {
    const result = await sql`
      SELECT module_id
      FROM terminal_utopia.question_modules
      WHERE question_id = ${questionId}
      LIMIT 1
    `;
    return result.length > 0
      ? (result[0] as { module_id: number }).module_id
      : null;
  }

  /**
   * Get the submodule ID associated with a question via junction table
   */
  async getSubmoduleIdForQuestion(
    questionId: number,
  ): Promise<number | null> {
    const result = await sql`
      SELECT submodule_id
      FROM terminal_utopia.question_submodules
      WHERE question_id = ${questionId}
      LIMIT 1
    `;
    return result.length > 0
      ? (result[0] as { submodule_id: number }).submodule_id
      : null;
  }

  /**
   * Get all questions for a module (not including submodule questions)
   */
  async getQuestionsByModuleId(moduleId: number): Promise<Question[]> {
    const result = await sql`
      SELECT q.*
      FROM terminal_utopia.questions q
      INNER JOIN terminal_utopia.question_modules qm ON q.id = qm.question_id
      WHERE qm.module_id = ${moduleId}
      AND q.is_active = true
      ORDER BY qm.sequence_order ASC
    `;

    return result as Question[];
  }

  /**
   * Get all questions for a submodule
   */
  async getQuestionsBySubmoduleId(submoduleId: number): Promise<Question[]> {
    const result = await sql`
      SELECT q.*
      FROM terminal_utopia.questions q
      INNER JOIN terminal_utopia.question_submodules qs ON q.id = qs.question_id
      WHERE qs.submodule_id = ${submoduleId}
      AND q.is_active = true
      ORDER BY qs.sequence_order ASC
    `;

    return result as Question[];
  }

  /**
   * Get all questions for a module including its submodules
   */
  async getAllQuestionsForModule(moduleId: number): Promise<Question[]> {
    const result = await sql`
      SELECT q.*, NULL::integer as submodule_seq
      FROM terminal_utopia.questions q
      INNER JOIN terminal_utopia.question_modules qm ON q.id = qm.question_id
      WHERE qm.module_id = ${moduleId}
      AND q.is_active = true

      UNION ALL

      SELECT q.*, s.sequence_order as submodule_seq
      FROM terminal_utopia.questions q
      INNER JOIN terminal_utopia.question_submodules qsub ON q.id = qsub.question_id
      INNER JOIN terminal_utopia.submodules s ON qsub.submodule_id = s.id
      WHERE s.module_id = ${moduleId}
      AND q.is_active = true

      ORDER BY submodule_seq ASC NULLS FIRST, sequence_order ASC
    `;

    return result as Question[];
  }

  /**
   * Get questions with user responses for a module
   */
  async getQuestionsWithResponsesForModule(
    userId: number,
    moduleId: number,
  ): Promise<QuestionWithResponse[]> {
    interface QuestionWithResponseRow {
      id: number;
      question_text: string;
      question_type: QuestionType;
      sequence_order: number;
      is_required: boolean;
      metadata: QuestionMetadata;
      is_active: boolean;
      created_at: Date;
      updated_at: Date;
      response_id: number | null;
      response_value: unknown | null;
      answered_at: Date | null;
      response_created_at: Date | null;
      response_updated_at: Date | null;
    }

    const result = await sql`
      SELECT
        q.*,
        uqr.id as response_id,
        uqr.response_value,
        uqr.answered_at,
        uqr.created_at as response_created_at,
        uqr.updated_at as response_updated_at
      FROM terminal_utopia.questions q
      INNER JOIN terminal_utopia.question_modules qm ON q.id = qm.question_id
      LEFT JOIN terminal_utopia.user_question_responses uqr
        ON q.id = uqr.question_id AND uqr.user_id = ${userId}
      WHERE qm.module_id = ${moduleId}
      AND q.is_active = true
      ORDER BY qm.sequence_order ASC
    `;

    return this.transformQuestionsWithResponses(
      result as QuestionWithResponseRow[],
      userId,
    );
  }

  /**
   * Get questions with user responses for a submodule
   */
  async getQuestionsWithResponsesForSubmodule(
    userId: number,
    submoduleId: number,
  ): Promise<QuestionWithResponse[]> {
    interface QuestionWithResponseRow {
      id: number;
      question_text: string;
      question_type: QuestionType;
      sequence_order: number;
      is_required: boolean;
      metadata: QuestionMetadata;
      is_active: boolean;
      created_at: Date;
      updated_at: Date;
      response_id: number | null;
      response_value: unknown | null;
      answered_at: Date | null;
      response_created_at: Date | null;
      response_updated_at: Date | null;
    }

    const result = await sql`
      SELECT
        q.*,
        uqr.id as response_id,
        uqr.response_value,
        uqr.answered_at,
        uqr.created_at as response_created_at,
        uqr.updated_at as response_updated_at
      FROM terminal_utopia.questions q
      INNER JOIN terminal_utopia.question_submodules qs ON q.id = qs.question_id
      LEFT JOIN terminal_utopia.user_question_responses uqr
        ON q.id = uqr.question_id AND uqr.user_id = ${userId}
      WHERE qs.submodule_id = ${submoduleId}
      AND q.is_active = true
      ORDER BY qs.sequence_order ASC
    `;

    return this.transformQuestionsWithResponses(
      result as QuestionWithResponseRow[],
      userId,
    );
  }

  /**
   * Helper to transform flat query results into QuestionWithResponse objects
   */
  private transformQuestionsWithResponses(
    results: Array<{
      id: number;
      question_text: string;
      question_type: QuestionType;
      sequence_order: number;
      is_required: boolean;
      metadata: QuestionMetadata;
      is_active: boolean;
      created_at: Date;
      updated_at: Date;
      response_id: number | null;
      response_value: unknown | null;
      answered_at: Date | null;
      response_created_at: Date | null;
      response_updated_at: Date | null;
    }>,
    userId: number,
  ): QuestionWithResponse[] {
    return results.map((row) => ({
      id: row.id,
      question_text: row.question_text,
      question_type: row.question_type,
      sequence_order: row.sequence_order,
      is_required: row.is_required,
      metadata: row.metadata || {},
      is_active: row.is_active,
      created_at: row.created_at,
      updated_at: row.updated_at,
      user_response: row.response_id
        ? {
          id: row.response_id,
          user_id: userId,
          question_id: row.id,
          module_id: null,
          submodule_id: null,
          response_value: row.response_value as ResponseValue,
          answered_at: row.answered_at!,
          created_at: row.response_created_at!,
          updated_at: row.response_updated_at!,
        }
        : undefined,
    }));
  }

  // ==========================================================================
  // User Response Operations
  // ==========================================================================

  /**
   * Get user's response to a specific question
   */
  async getUserResponse(
    userId: number,
    questionId: number,
  ): Promise<UserQuestionResponse | null> {
    const result = await sql`
      SELECT *
      FROM terminal_utopia.user_question_responses
      WHERE user_id = ${userId}
      AND question_id = ${questionId}
    `;

    return result.length > 0 ? (result[0] as UserQuestionResponse) : null;
  }

  /**
   * Get all user responses for a module
   */
  async getUserResponsesForModule(
    userId: number,
    moduleId: number,
  ): Promise<UserQuestionResponse[]> {
    const result = await sql`
      SELECT uqr.*
      FROM terminal_utopia.user_question_responses uqr
      INNER JOIN terminal_utopia.question_modules qm ON uqr.question_id = qm.question_id
      WHERE uqr.user_id = ${userId}
      AND qm.module_id = ${moduleId}
      ORDER BY qm.sequence_order ASC
    `;

    return result as UserQuestionResponse[];
  }

  /**
   * Get all user responses for a submodule
   */
  async getUserResponsesForSubmodule(
    userId: number,
    submoduleId: number,
  ): Promise<UserQuestionResponse[]> {
    const result = await sql`
      SELECT uqr.*
      FROM terminal_utopia.user_question_responses uqr
      INNER JOIN terminal_utopia.question_submodules qs ON uqr.question_id = qs.question_id
      WHERE uqr.user_id = ${userId}
      AND qs.submodule_id = ${submoduleId}
      ORDER BY qs.sequence_order ASC
    `;

    return result as UserQuestionResponse[];
  }

  /**
   * Save or update a user's response to a question
   */
  async upsertUserResponse(
    userId: number,
    questionId: number,
    responseValue: ResponseValue,
    moduleId?: number | null,
    submoduleId?: number | null,
  ): Promise<UserQuestionResponse> {
    const now = new Date();

    const result = await sql`
      INSERT INTO terminal_utopia.user_question_responses (
        user_id,
        question_id,
        module_id,
        submodule_id,
        response_value,
        answered_at
      )
      VALUES (
        ${userId},
        ${questionId},
        ${moduleId ?? null},
        ${submoduleId ?? null},
        ${JSON.stringify(responseValue)},
        ${now}
      )
      ON CONFLICT (user_id, question_id)
      DO UPDATE SET
        response_value = EXCLUDED.response_value,
        answered_at = EXCLUDED.answered_at,
        updated_at = ${now}
      RETURNING *
    `;

    return result[0] as UserQuestionResponse;
  }

  /**
   * Save multiple responses at once (batch operation)
   */
  async batchUpsertResponses(
    userId: number,
    responses: Array<{
      question_id: number;
      response_value: ResponseValue;
      module_id?: number | null;
      submodule_id?: number | null;
    }>,
  ): Promise<UserQuestionResponse[]> {
    if (responses.length === 0) return [];

    const results: UserQuestionResponse[] = [];

    for (const response of responses) {
      const result = await this.upsertUserResponse(
        userId,
        response.question_id,
        response.response_value,
        response.module_id,
        response.submodule_id,
      );
      results.push(result);
    }

    return results;
  }

  /**
   * Delete a user's response (rare operation, mostly for testing)
   */
  async deleteUserResponse(
    userId: number,
    questionId: number,
  ): Promise<boolean> {
    const result = await sql`
      DELETE FROM terminal_utopia.user_question_responses
      WHERE user_id = ${userId}
      AND question_id = ${questionId}
    `;

    return (result as unknown as { count: number }).count > 0;
  }

  // ==========================================================================
  // Validation Operations
  // ==========================================================================

  /**
   * Validate a response value against question type and metadata
   */
  validateResponse(question: Question, responseValue: ResponseValue): {
    valid: boolean;
    error?: string;
  } {
    if (
      question.is_required &&
      (responseValue === null || responseValue === undefined)
    ) {
      return { valid: false, error: "This question is required" };
    }

    if (
      !question.is_required &&
      (responseValue === null || responseValue === undefined)
    ) {
      return { valid: true };
    }

    switch (question.question_type) {
      case "true_false":
        return this.validateTrueFalse(responseValue);

      case "multiple_choice":
        return this.validateMultipleChoice(question, responseValue);

      case "fill_blank":
      case "free_form":
        return this.validateTextResponse(question, responseValue);

      default:
        return { valid: false, error: "Unknown question type" };
    }
  }

  private validateTrueFalse(responseValue: ResponseValue): {
    valid: boolean;
    error?: string;
  } {
    if (typeof responseValue !== "boolean") {
      return { valid: false, error: "Response must be true or false" };
    }
    return { valid: true };
  }

  private validateMultipleChoice(
    question: Question,
    responseValue: ResponseValue,
  ): { valid: boolean; error?: string } {
    const choices = question.metadata.choices || [];
    const allowMultiple = question.metadata.allow_multiple || false;

    if (allowMultiple) {
      if (!Array.isArray(responseValue)) {
        return { valid: false, error: "Response must be an array" };
      }

      const validValues = choices.map((c) => String(c.value));
      const invalidChoices = responseValue.filter(
        (v) => !validValues.includes(String(v)),
      );

      if (invalidChoices.length > 0) {
        return { valid: false, error: "Invalid choice(s) selected" };
      }
    } else {
      const validValues = choices.map((c) => String(c.value));
      if (!validValues.includes(String(responseValue))) {
        return { valid: false, error: "Invalid choice selected" };
      }
    }

    return { valid: true };
  }

  private validateTextResponse(
    question: Question,
    responseValue: ResponseValue,
  ): { valid: boolean; error?: string } {
    if (typeof responseValue !== "string") {
      return { valid: false, error: "Response must be text" };
    }

    const validation = question.metadata.validation;
    if (!validation) return { valid: true };

    if (validation.min_length && responseValue.length < validation.min_length) {
      return {
        valid: false,
        error: validation.error_message ||
          `Response must be at least ${validation.min_length} characters`,
      };
    }

    if (validation.max_length && responseValue.length > validation.max_length) {
      return {
        valid: false,
        error: validation.error_message ||
          `Response must be at most ${validation.max_length} characters`,
      };
    }

    if (validation.pattern) {
      const regex = new RegExp(validation.pattern);
      if (!regex.test(responseValue)) {
        return {
          valid: false,
          error: validation.error_message || "Response format is invalid",
        };
      }
    }

    return { valid: true };
  }

  /**
   * Check if all required questions in a module or submodule are answered
   */
  async areAllRequiredQuestionsAnswered(
    userId: number,
    moduleId: number,
    submoduleId?: number,
  ): Promise<boolean> {
    const result = submoduleId
      ? await sql`
        SELECT COUNT(*) as unanswered_count
        FROM terminal_utopia.questions q
        INNER JOIN terminal_utopia.question_submodules qs ON q.id = qs.question_id
        LEFT JOIN terminal_utopia.user_question_responses uqr
          ON q.id = uqr.question_id AND uqr.user_id = ${userId}
        WHERE qs.submodule_id = ${submoduleId}
        AND q.is_required = true
        AND q.is_active = true
        AND uqr.id IS NULL
      `
      : await sql`
        SELECT COUNT(*) as unanswered_count
        FROM terminal_utopia.questions q
        INNER JOIN terminal_utopia.question_modules qm ON q.id = qm.question_id
        LEFT JOIN terminal_utopia.user_question_responses uqr
          ON q.id = uqr.question_id AND uqr.user_id = ${userId}
        WHERE qm.module_id = ${moduleId}
        AND q.is_required = true
        AND q.is_active = true
        AND uqr.id IS NULL
      `;

    return parseInt(
      (result[0] as { unanswered_count: string }).unanswered_count,
      10,
    ) === 0;
  }

  // ==========================================================================
  // Administrative Operations
  // ==========================================================================

  /**
   * Create a new question and link it to a module or submodule via junction table
   */
  async createQuestion(
    data: Omit<Question, "id" | "created_at" | "updated_at" | "is_active">,
    moduleId?: number,
    submoduleId?: number,
  ): Promise<Question> {
    const result = await sql`
      INSERT INTO terminal_utopia.questions (
        question_text,
        question_type,
        sequence_order,
        is_required,
        metadata
      )
      VALUES (
        ${data.question_text},
        ${data.question_type},
        ${data.sequence_order},
        ${data.is_required},
        ${JSON.stringify(data.metadata)}
      )
      RETURNING *
    `;

    const question = result[0] as Question;

    if (moduleId) {
      await sql`
        INSERT INTO terminal_utopia.question_modules (question_id, module_id, sequence_order)
        VALUES (${question.id}, ${moduleId}, ${data.sequence_order})
      `;
    }
    if (submoduleId) {
      await sql`
        INSERT INTO terminal_utopia.question_submodules (question_id, submodule_id, sequence_order)
        VALUES (${question.id}, ${submoduleId}, ${data.sequence_order})
      `;
    }

    return question;
  }

  /**
   * Update a question
   */
  async updateQuestion(
    questionId: number,
    data: Partial<Omit<Question, "id" | "created_at" | "updated_at">>,
  ): Promise<Question | null> {
    if (Object.keys(data).length === 0) {
      return this.getQuestionById(questionId);
    }

    const updateData: Record<string, unknown> = {};

    if (data.question_text !== undefined) {
      updateData.question_text = data.question_text;
    }
    if (data.question_type !== undefined) {
      updateData.question_type = data.question_type;
    }
    if (data.sequence_order !== undefined) {
      updateData.sequence_order = data.sequence_order;
    }
    if (data.is_required !== undefined) {
      updateData.is_required = data.is_required;
    }
    if (data.metadata !== undefined) {
      updateData.metadata = JSON.stringify(data.metadata);
    }
    if (data.is_active !== undefined) {
      updateData.is_active = data.is_active;
    }

    const entries = Object.entries(updateData);
    if (entries.length === 0) {
      return this.getQuestionById(questionId);
    }

    const setClause = entries.map(([key], index) => `${key} = $${index + 2}`)
      .join(", ");

    const result = await sql`
      UPDATE terminal_utopia.questions
      SET ${sql.unsafe(setClause)}
      WHERE id = ${questionId}
      RETURNING *
    `;

    return result.length > 0 ? (result[0] as Question) : null;
  }

  /**
   * Delete a question (soft delete by setting is_active = false)
   */
  async deleteQuestion(questionId: number): Promise<boolean> {
    const result = await sql`
      UPDATE terminal_utopia.questions
      SET is_active = false
      WHERE id = ${questionId}
    `;

    return (result as unknown as { count: number }).count > 0;
  }
}

// ============================================================================
// Singleton Export
// ============================================================================

export const questionRepository = new QuestionRepository();
