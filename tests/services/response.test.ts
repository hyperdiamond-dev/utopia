/**
 * Response Handling Tests
 * Tests for Zod schema validation and response data flow through ModuleService
 * Since there is no standalone ResponseService, this tests:
 * 1. The Zod validation schemas used by module routes
 * 2. Response data handling in ModuleService.saveModuleProgress() and completeModule()
 */

import {
  afterEach,
  assertEquals,
  assertExists,
  beforeEach,
  createTestModule,
  createTestModuleProgress,
  describe,
  it,
  restore,
  restoreEnv,
  setupTestEnv,
  stubMethod as stub,
} from "../test-config.ts";

import { z } from "zod";

// Set env before dynamic imports that trigger db/connection.ts
setupTestEnv();

const { ModuleService } = await import("../../services/moduleService.ts");
const { auditRepository, moduleRepository, userRepository } = await import(
  "../../db/index.ts"
);

// Recreate the Zod schemas used in routes/modules.ts (not exported)
const moduleResponseSchema = z.object({
  responses: z.record(z.unknown()),
  metadata: z.record(z.unknown()).optional(),
});

const partialResponseSchema = z.object({
  responses: z.record(z.unknown()),
});

describe("Response Validation Schemas", () => {
  describe("moduleResponseSchema", () => {
    it("should accept valid submission with responses and metadata", () => {
      const input = {
        responses: { q1: "answer1", q2: true, q3: ["a", "b"] },
        metadata: { submitted_from: "web", duration_seconds: 120 },
      };

      const result = moduleResponseSchema.safeParse(input);

      assertEquals(result.success, true);
      if (result.success) {
        assertEquals(Object.keys(result.data.responses).length, 3);
        assertExists(result.data.metadata);
      }
    });

    it("should accept valid submission without metadata", () => {
      const input = {
        responses: { q1: "answer1" },
      };

      const result = moduleResponseSchema.safeParse(input);

      assertEquals(result.success, true);
    });

    it("should reject submission without responses field", () => {
      const input = { metadata: { source: "web" } };

      const result = moduleResponseSchema.safeParse(input);

      assertEquals(result.success, false);
    });

    it("should reject empty body", () => {
      const result = moduleResponseSchema.safeParse({});

      assertEquals(result.success, false);
    });

    it("should reject null body", () => {
      const result = moduleResponseSchema.safeParse(null);

      assertEquals(result.success, false);
    });

    it("should accept responses with various value types", () => {
      const input = {
        responses: {
          text_response: "A text answer",
          boolean_response: true,
          number_response: 42,
          array_response: ["opt1", "opt2"],
          null_response: null,
          nested_response: { key: "value" },
        },
      };

      const result = moduleResponseSchema.safeParse(input);

      assertEquals(result.success, true);
    });
  });

  describe("partialResponseSchema", () => {
    it("should accept valid partial responses", () => {
      const input = {
        responses: { q1: "partial answer" },
      };

      const result = partialResponseSchema.safeParse(input);

      assertEquals(result.success, true);
    });

    it("should reject empty body", () => {
      const result = partialResponseSchema.safeParse({});

      assertEquals(result.success, false);
    });

    it("should reject body with wrong field name", () => {
      const input = { answers: { q1: "a" } };

      const result = partialResponseSchema.safeParse(input);

      assertEquals(result.success, false);
    });

    it("should accept empty responses object", () => {
      const input = { responses: {} };

      const result = partialResponseSchema.safeParse(input);

      assertEquals(result.success, true);
    });
  });
});

describe("Response Data Flow Through ModuleService", () => {
  let originalEnv: Record<string, string>;

  beforeEach(() => {
    originalEnv = setupTestEnv();
  });

  afterEach(() => {
    restore();
    restoreEnv(originalEnv);
  });

  describe("saveModuleProgress response data", () => {
    it("should pass response data with last_saved timestamp to repository", async () => {
      const testModule = createTestModule({ id: 2, name: "module-1" });
      const progress = createTestModuleProgress({ status: "IN_PROGRESS" });
      const responseData = { q1: "answer1", q2: true };

      stub(
        moduleRepository,
        "getModuleByName",
        () => Promise.resolve(testModule),
      );
      stub(moduleRepository, "isModuleAccessible", () => Promise.resolve(true));
      stub(
        moduleRepository,
        "getUserModuleProgress",
        () => Promise.resolve(progress),
      );
      const updateStub = stub(
        moduleRepository,
        "updateModuleResponse",
        () =>
          Promise.resolve(
            createTestModuleProgress({ response_data: responseData }),
          ),
      );

      await ModuleService.saveModuleProgress(1, "module-1", responseData);

      assertEquals(updateStub.calls.length, 1);
      assertEquals(updateStub.calls[0].args[0], 1); // userId
      assertEquals(updateStub.calls[0].args[1], 2); // moduleId

      const savedData = updateStub.calls[0].args[2] as Record<string, unknown>;
      assertEquals(
        (savedData.responses as Record<string, unknown>).q1,
        "answer1",
      );
      assertEquals((savedData.responses as Record<string, unknown>).q2, true);
      assertExists(savedData.last_saved);
      // last_saved should be an ISO string
      assertEquals(typeof savedData.last_saved, "string");
    });

    it("should preserve all response values on save", async () => {
      const testModule = createTestModule({ id: 2, name: "module-1" });
      const progress = createTestModuleProgress({ status: "IN_PROGRESS" });
      const complexResponses = {
        text_field: "Long text response here",
        boolean_field: false,
        multi_select: ["option1", "option3"],
        numeric_field: 7,
      };

      stub(
        moduleRepository,
        "getModuleByName",
        () => Promise.resolve(testModule),
      );
      stub(moduleRepository, "isModuleAccessible", () => Promise.resolve(true));
      stub(
        moduleRepository,
        "getUserModuleProgress",
        () => Promise.resolve(progress),
      );
      const updateStub = stub(
        moduleRepository,
        "updateModuleResponse",
        () =>
          Promise.resolve(
            createTestModuleProgress({ response_data: complexResponses }),
          ),
      );

      await ModuleService.saveModuleProgress(1, "module-1", complexResponses);

      const savedData = updateStub.calls[0].args[2] as Record<string, unknown>;
      const responses = savedData.responses as Record<string, unknown>;
      assertEquals(responses.text_field, "Long text response here");
      assertEquals(responses.boolean_field, false);
      assertEquals(responses.multi_select, ["option1", "option3"]);
      assertEquals(responses.numeric_field, 7);
    });
  });

  describe("completeModule response data", () => {
    it("should pass submission data with completed_at timestamp to repository", async () => {
      const testModule = createTestModule({
        id: 2,
        name: "module-1",
        sequence_order: 2,
      });
      const submissionData = {
        responses: { q1: "final_answer", q2: true },
        metadata: { duration: 300 },
      };

      stub(
        moduleRepository,
        "getModuleByName",
        () => Promise.resolve(testModule),
      );
      stub(moduleRepository, "isModuleAccessible", () => Promise.resolve(true));
      const completeStub = stub(
        moduleRepository,
        "completeModule",
        () =>
          Promise.resolve(
            createTestModuleProgress({
              status: "COMPLETED",
              completed_at: new Date(),
            }),
          ),
      );
      stub(
        moduleRepository,
        "getNextAccessibleModule",
        () => Promise.resolve(null),
      );
      stub(auditRepository, "logModuleCompletion", () => Promise.resolve());
      stub(userRepository, "setActiveModule", () => Promise.resolve());

      await ModuleService.completeModule(1, "module-1", submissionData);

      assertEquals(completeStub.calls.length, 1);
      const passedData = completeStub.calls[0].args[2] as Record<
        string,
        unknown
      >;
      assertExists(passedData.completed_at);
      assertEquals(typeof passedData.completed_at, "string"); // ISO string
      assertEquals(
        (passedData.responses as Record<string, unknown>).q1,
        "final_answer",
      );
      assertEquals(passedData.metadata, { duration: 300 });
    });

    it("should count response keys for audit logging", async () => {
      const testModule = createTestModule({
        id: 2,
        name: "module-1",
        sequence_order: 2,
      });
      const submissionData = {
        responses: { q1: "a", q2: "b", q3: "c", q4: "d", q5: "e" },
      };

      stub(
        moduleRepository,
        "getModuleByName",
        () => Promise.resolve(testModule),
      );
      stub(moduleRepository, "isModuleAccessible", () => Promise.resolve(true));
      stub(
        moduleRepository,
        "completeModule",
        () =>
          Promise.resolve(createTestModuleProgress({ status: "COMPLETED" })),
      );
      stub(
        moduleRepository,
        "getNextAccessibleModule",
        () => Promise.resolve(null),
      );
      const auditStub = stub(
        auditRepository,
        "logModuleCompletion",
        () => Promise.resolve(),
      );
      stub(userRepository, "setActiveModule", () => Promise.resolve());

      await ModuleService.completeModule(1, "module-1", submissionData);

      const auditDetails = auditStub.calls[0].args[1] as Record<
        string,
        unknown
      >;
      assertEquals(auditDetails.response_count, 5);
    });
  });
});
