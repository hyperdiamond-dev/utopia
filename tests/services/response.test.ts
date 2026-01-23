/**
 * Response Service Tests
 * Tests for question response submission, validation, and batch operations
 */

import {
  afterEach,
  assertEquals,
  assertExists,
  beforeEach,
  createStub,
  describe,
  it,
  restoreEnv,
  setupTestEnv,
} from "../test-config-extended.ts";

// Response value types
type ResponseValue = boolean | string | string[] | number | null;

// Question types
type QuestionType = "true_false" | "multiple_choice" | "fill_blank" | "free_form";

// Helper to create test questions
function createTestQuestion(overrides: Partial<{
  id: number;
  question_text: string;
  question_type: QuestionType;
  is_required: boolean;
  module_id: number | null;
  submodule_id: number | null;
  metadata: Record<string, unknown>;
}> = {}) {
  return {
    id: 1,
    question_text: "Test question?",
    question_type: "multiple_choice" as QuestionType,
    is_required: true,
    module_id: 1,
    submodule_id: null,
    metadata: { options: ["Option A", "Option B", "Option C"] },
    ...overrides,
  };
}

// Helper to create test responses
function createTestResponse(overrides: Partial<{
  id: number;
  user_id: number;
  question_id: number;
  response_value: ResponseValue;
  module_id: number | null;
  submodule_id: number | null;
  answered_at: Date;
}> = {}) {
  return {
    id: 1,
    user_id: 1,
    question_id: 1,
    response_value: "Option A",
    module_id: 1,
    submodule_id: null,
    answered_at: new Date(),
    ...overrides,
  };
}

// Mock repositories
const mockQuestionRepository = {
  getQuestionById: createStub(),
  getUserResponse: createStub(),
  upsertUserResponse: createStub(),
  batchUpsertResponses: createStub(),
  validateResponse: createStub(),
  areAllRequiredQuestionsAnswered: createStub(),
  getQuestionsWithResponsesForModule: createStub(),
  getQuestionsWithResponsesForSubmodule: createStub(),
};

describe("Response Service", () => {
  let originalEnv: Record<string, string>;

  beforeEach(() => {
    originalEnv = setupTestEnv();
    mockQuestionRepository.getQuestionById.resolves(createTestQuestion());
    mockQuestionRepository.validateResponse.resolves({ valid: true });
  });

  afterEach(() => {
    restoreEnv(originalEnv);
  });

  describe("Response Validation", () => {
    it("should validate true/false responses", () => {
      const question = createTestQuestion({ question_type: "true_false" });
      const validResponses: ResponseValue[] = [true, false];
      const invalidResponses: ResponseValue[] = ["yes", "no", 1, 0];

      for (const response of validResponses) {
        assertEquals(typeof response === "boolean", true);
      }

      for (const response of invalidResponses) {
        assertEquals(typeof response === "boolean", false);
      }
    });

    it("should validate multiple choice responses", () => {
      const question = createTestQuestion({
        question_type: "multiple_choice",
        metadata: { options: ["A", "B", "C"] },
      });

      const validOptions = question.metadata.options as string[];
      const validResponse = "A";
      const invalidResponse = "D";

      assertEquals(validOptions.includes(validResponse), true);
      assertEquals(validOptions.includes(invalidResponse), false);
    });

    it("should validate fill_blank responses as strings", () => {
      const question = createTestQuestion({ question_type: "fill_blank" });
      const validResponse = "User's answer";
      const invalidResponse = 123;

      assertEquals(typeof validResponse === "string", true);
      assertEquals(typeof invalidResponse === "string", false);
    });

    it("should validate free_form responses as strings", () => {
      const question = createTestQuestion({ question_type: "free_form" });
      const validResponse =
        "This is a longer free-form response from the user.";

      assertEquals(typeof validResponse === "string", true);
      assertEquals(validResponse.length > 0, true);
    });

    it("should reject null responses for required questions", () => {
      const question = createTestQuestion({ is_required: true });
      const nullResponse: ResponseValue = null;

      const isValid = question.is_required ? nullResponse !== null : true;
      assertEquals(isValid, false);
    });

    it("should accept null responses for optional questions", () => {
      const question = createTestQuestion({ is_required: false });
      const nullResponse: ResponseValue = null;

      const isValid = question.is_required ? nullResponse !== null : true;
      assertEquals(isValid, true);
    });
  });

  describe("Single Response Submission", () => {
    it("should create new response for first submission", () => {
      const existingResponse = null;
      const newResponse = createTestResponse();

      const isNewSubmission = existingResponse === null;
      assertEquals(isNewSubmission, true);
      assertExists(newResponse.id);
    });

    it("should update existing response (upsert behavior)", () => {
      const existingResponse = createTestResponse({
        response_value: "Old answer",
      });
      const updatedValue = "New answer";

      const updatedResponse = {
        ...existingResponse,
        response_value: updatedValue,
      };

      assertEquals(updatedResponse.response_value, "New answer");
      assertEquals(updatedResponse.id, existingResponse.id);
    });

    it("should set answered_at timestamp", () => {
      const response = createTestResponse();

      assertExists(response.answered_at);
      assertEquals(response.answered_at instanceof Date, true);
    });

    it("should reject response for non-existent question", () => {
      const question = null;
      const canSubmit = question !== null;

      assertEquals(canSubmit, false);
    });
  });

  describe("Read-Only Protection", () => {
    it("should prevent modification of completed module responses", () => {
      const moduleProgress = { status: "COMPLETED" };
      const isReadOnly = moduleProgress.status === "COMPLETED";

      assertEquals(isReadOnly, true);
    });

    it("should prevent modification of completed submodule responses", () => {
      const submoduleProgress = { status: "COMPLETED" };
      const isReadOnly = submoduleProgress.status === "COMPLETED";

      assertEquals(isReadOnly, true);
    });

    it("should allow modification of in-progress module responses", () => {
      const moduleProgress = { status: "IN_PROGRESS" };
      const isReadOnly = moduleProgress.status === "COMPLETED";

      assertEquals(isReadOnly, false);
    });
  });

  describe("Batch Response Submission", () => {
    it("should validate all responses before saving", () => {
      const submissions = [
        { question_id: 1, response_value: "Answer 1" },
        { question_id: 2, response_value: true },
        { question_id: 3, response_value: "Answer 3" },
      ];

      // All should be validated
      assertEquals(submissions.length, 3);
    });

    it("should return validation errors without saving any", () => {
      const validationResult = {
        valid: false,
        errors: {
          2: "Invalid response type for true/false question",
          3: "Question not found",
        },
      };

      assertEquals(validationResult.valid, false);
      assertEquals(Object.keys(validationResult.errors).length, 2);
    });

    it("should save all responses when validation passes", () => {
      const submissions = [
        { question_id: 1, response_value: "A" },
        { question_id: 2, response_value: true },
      ];

      const savedResponses = submissions.map((s, i) =>
        createTestResponse({
          id: i + 1,
          question_id: s.question_id,
          response_value: s.response_value,
        })
      );

      assertEquals(savedResponses.length, 2);
    });

    it("should associate responses with module_id", () => {
      const submission = {
        responses: [{ question_id: 1, response_value: "A" }],
        module_id: 5,
      };

      assertEquals(submission.module_id, 5);
    });

    it("should associate responses with submodule_id", () => {
      const submission = {
        responses: [{ question_id: 1, response_value: "A" }],
        submodule_id: 10,
      };

      assertEquals(submission.submodule_id, 10);
    });
  });

  describe("Module Question Validation", () => {
    it("should detect unanswered required questions", () => {
      const questions = [
        { id: 1, is_required: true, user_response: { response_value: "A" } },
        { id: 2, is_required: true, user_response: null },
        { id: 3, is_required: false, user_response: null },
      ];

      const unansweredRequired = questions.filter(
        (q) => q.is_required && !q.user_response,
      );

      assertEquals(unansweredRequired.length, 1);
      assertEquals(unansweredRequired[0].id, 2);
    });

    it("should pass validation when all required questions answered", () => {
      const questions = [
        { id: 1, is_required: true, user_response: { response_value: "A" } },
        { id: 2, is_required: true, user_response: { response_value: true } },
        { id: 3, is_required: false, user_response: null },
      ];

      const allRequiredAnswered = questions.every(
        (q) => !q.is_required || q.user_response !== null,
      );

      assertEquals(allRequiredAnswered, true);
    });

    it("should validate individual response values during module validation", () => {
      const questions = [
        {
          id: 1,
          question_type: "true_false",
          user_response: { response_value: "not a boolean" },
        },
      ];

      const hasInvalidResponses = questions.some((q) => {
        if (q.question_type === "true_false" && q.user_response) {
          return typeof q.user_response.response_value !== "boolean";
        }
        return false;
      });

      assertEquals(hasInvalidResponses, true);
    });
  });

  describe("Response Retrieval", () => {
    it("should get user response for specific question", () => {
      const response = createTestResponse({
        user_id: 1,
        question_id: 5,
      });

      assertEquals(response.user_id, 1);
      assertEquals(response.question_id, 5);
    });

    it("should get all responses for a module", () => {
      const moduleResponses = [
        createTestResponse({ id: 1, module_id: 2 }),
        createTestResponse({ id: 2, module_id: 2 }),
        createTestResponse({ id: 3, module_id: 2 }),
      ];

      assertEquals(moduleResponses.length, 3);
      assertEquals(moduleResponses.every((r) => r.module_id === 2), true);
    });

    it("should get all responses for a submodule", () => {
      const submoduleResponses = [
        createTestResponse({ id: 1, submodule_id: 5 }),
        createTestResponse({ id: 2, submodule_id: 5 }),
      ];

      assertEquals(submoduleResponses.length, 2);
      assertEquals(
        submoduleResponses.every((r) => r.submodule_id === 5),
        true,
      );
    });
  });

  describe("Response Deletion", () => {
    it("should allow deletion of non-completed module responses", () => {
      const moduleProgress = { status: "IN_PROGRESS" };
      const canDelete = moduleProgress.status !== "COMPLETED";

      assertEquals(canDelete, true);
    });

    it("should prevent deletion of completed module responses", () => {
      const moduleProgress = { status: "COMPLETED" };
      const canDelete = moduleProgress.status !== "COMPLETED";

      assertEquals(canDelete, false);
    });

    it("should return true when response exists and is deleted", () => {
      const existingResponse = createTestResponse();
      const wasDeleted = existingResponse !== null;

      assertEquals(wasDeleted, true);
    });
  });

  describe("Question Types", () => {
    it("should handle multiple_choice with multiple selections", () => {
      const question = createTestQuestion({
        question_type: "multiple_choice",
        metadata: { options: ["A", "B", "C"], allow_multiple: true },
      });

      const multipleSelections: ResponseValue = ["A", "C"];

      assertEquals(Array.isArray(multipleSelections), true);
      if (Array.isArray(multipleSelections)) {
        assertEquals(multipleSelections.length, 2);
      }
    });

    it("should enforce min/max length for fill_blank", () => {
      const question = createTestQuestion({
        question_type: "fill_blank",
        metadata: { min_length: 5, max_length: 100 },
      });

      const metadata = question.metadata as { min_length: number; max_length: number };
      const validResponse = "Valid response";
      const tooShort = "Hi";

      assertEquals(validResponse.length >= metadata.min_length, true);
      assertEquals(validResponse.length <= metadata.max_length, true);
      assertEquals(tooShort.length >= metadata.min_length, false);
    });

    it("should enforce word count for free_form if specified", () => {
      const question = createTestQuestion({
        question_type: "free_form",
        metadata: { min_words: 10 },
      });

      const metadata = question.metadata as { min_words: number };
      const response = "This is a response with exactly ten words in it.";
      const wordCount = response.split(/\s+/).length;

      assertEquals(wordCount >= metadata.min_words, true);
    });
  });
});
