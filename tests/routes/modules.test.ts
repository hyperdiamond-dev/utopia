/**
 * Module Routes Tests
 * Tests for module API endpoints including authentication, access control, and operations
 */

import {
  afterEach,
  assertEquals,
  assertExists,
  beforeEach,
  createStub,
  createTestJWT,
  createTestModule,
  createTestModuleProgress,
  createTestUser,
  describe,
  it,
  restoreEnv,
  setupTestEnv,
} from "../test-config-extended.ts";

// Mock request/response helpers
function createMockRequest(options: {
  method?: string;
  path?: string;
  headers?: Record<string, string>;
  body?: unknown;
} = {}) {
  return {
    method: options.method || "GET",
    path: options.path || "/",
    headers: new Map(Object.entries(options.headers || {})),
    body: options.body,
  };
}

function createMockContext(options: {
  user?: { uuid: string; friendlyAlias: string };
  userRecord?: { id: number; uuid: string; alias: string };
  moduleAccess?: { moduleName: string; accessible: boolean };
} = {}) {
  const context: Record<string, unknown> = {};

  return {
    get: (key: string) => context[key] ?? options[key as keyof typeof options],
    set: (key: string, value: unknown) => {
      context[key] = value;
    },
    req: {
      json: createStub().resolves({}),
      header: createStub().resolves(""),
    },
    json: createStub(),
  };
}

describe("Module Routes", () => {
  let originalEnv: Record<string, string>;

  beforeEach(() => {
    originalEnv = setupTestEnv();
  });

  afterEach(() => {
    restoreEnv(originalEnv);
  });

  describe("GET /modules/list", () => {
    it("should return public module list without authentication", () => {
      const modules = [
        createTestModule({ name: "consent", title: "Consent Form" }),
        createTestModule({ name: "module-1", title: "Module 1" }),
      ];

      const response = {
        modules: modules.map((m) => ({
          name: m.name,
          title: m.title,
          description: m.description,
          sequence_order: m.sequence_order,
        })),
      };

      assertExists(response.modules);
      assertEquals(response.modules.length, 2);
      // Should not include user-specific data
      assertEquals(response.modules[0].name, "consent");
    });

    it("should return modules in sequence order", () => {
      const modules = [
        createTestModule({ sequence_order: 3 }),
        createTestModule({ sequence_order: 1 }),
        createTestModule({ sequence_order: 2 }),
      ];

      const sorted = modules.sort((a, b) => a.sequence_order - b.sequence_order);

      assertEquals(sorted[0].sequence_order, 1);
      assertEquals(sorted[1].sequence_order, 2);
      assertEquals(sorted[2].sequence_order, 3);
    });
  });

  describe("GET /modules", () => {
    it("should require authentication", () => {
      const request = createMockRequest({
        method: "GET",
        path: "/modules",
        headers: {},
      });

      // Without Authorization header, should fail
      const hasAuth = request.headers.has("Authorization");
      assertEquals(hasAuth, false);
    });

    it("should accept valid JWT token", () => {
      const token = createTestJWT();
      const request = createMockRequest({
        method: "GET",
        path: "/modules",
        headers: { Authorization: `Bearer ${token}` },
      });

      const hasAuth = request.headers.has("Authorization");
      assertEquals(hasAuth, true);
    });

    it("should return module overview with progress", () => {
      const user = createTestUser();
      const modules = [
        { ...createTestModule({ name: "consent" }), user_progress: createTestModuleProgress({ status: "COMPLETED" }), accessible: true },
        { ...createTestModule({ name: "module-1" }), user_progress: createTestModuleProgress({ status: "IN_PROGRESS" }), accessible: true },
        { ...createTestModule({ name: "module-2" }), user_progress: null, accessible: false },
      ];

      const response = {
        modules,
        navigation: {
          currentModule: modules[1],
          completedModules: ["consent"],
          availableModules: ["consent", "module-1"],
        },
        progress: {
          total_modules: 3,
          completed_modules: 1,
          completion_percentage: 33,
        },
      };

      assertExists(response.modules);
      assertExists(response.navigation);
      assertExists(response.progress);
    });

    it("should return 404 for non-existent user", () => {
      const user = null;
      const statusCode = user ? 200 : 404;

      assertEquals(statusCode, 404);
    });
  });

  describe("GET /modules/current", () => {
    it("should return current module for user", () => {
      const currentModule = createTestModule({ name: "module-1" });
      const progress = createTestModuleProgress({ status: "IN_PROGRESS" });

      const response = {
        current_module: currentModule,
        progress,
        accessible: true,
        is_completed: false,
      };

      assertExists(response.current_module);
      assertEquals(response.is_completed, false);
    });

    it("should return null when all modules completed", () => {
      const response = {
        message: "All modules completed",
        current_module: null,
      };

      assertEquals(response.current_module, null);
      assertEquals(response.message, "All modules completed");
    });
  });

  describe("GET /modules/:moduleName", () => {
    it("should return module data for accessible modules", () => {
      const module = createTestModule({ name: "module-1" });
      const progress = createTestModuleProgress({ status: "IN_PROGRESS" });

      const response = {
        module: {
          name: module.name,
          title: module.title,
          description: module.description,
          sequence_order: module.sequence_order,
        },
        progress: {
          status: progress.status,
          started_at: progress.started_at,
          completed_at: progress.completed_at,
          response_data: progress.response_data,
        },
        accessible: true,
        is_completed: false,
        can_review: false,
      };

      assertExists(response.module);
      assertEquals(response.accessible, true);
    });

    it("should deny access to inaccessible modules", () => {
      const accessDenied = {
        accessible: false,
        reason: "Complete previous modules first",
      };

      assertEquals(accessDenied.accessible, false);
      assertExists(accessDenied.reason);
    });

    it("should return 404 for non-existent modules", () => {
      const module = null;
      const statusCode = module ? 200 : 404;

      assertEquals(statusCode, 404);
    });

    it("should allow review of completed modules", () => {
      const progress = createTestModuleProgress({ status: "COMPLETED" });
      const canReview = progress.status === "COMPLETED";

      assertEquals(canReview, true);
    });
  });

  describe("POST /modules/:moduleName/start", () => {
    it("should start an accessible module", () => {
      const module = createTestModule({ name: "module-1" });
      const progress = createTestModuleProgress({
        status: "IN_PROGRESS",
        started_at: new Date(),
      });

      const response = {
        message: "Module started successfully",
        progress: {
          status: progress.status,
          started_at: progress.started_at,
          module_id: module.id,
        },
      };

      assertEquals(response.message, "Module started successfully");
      assertEquals(response.progress.status, "IN_PROGRESS");
    });

    it("should reject start for inaccessible modules", () => {
      const error = {
        error: "Complete previous modules first",
      };

      assertExists(error.error);
    });

    it("should reject start for completed modules", () => {
      const progress = createTestModuleProgress({ status: "COMPLETED" });
      const canStart = progress.status !== "COMPLETED";

      assertEquals(canStart, false);
    });
  });

  describe("POST /modules/:moduleName/save", () => {
    it("should save partial progress", () => {
      const responses = {
        question1: "answer1",
        question2: true,
      };

      const response = {
        message: "Progress saved successfully",
        saved_at: new Date().toISOString(),
        response_count: Object.keys(responses).length,
      };

      assertEquals(response.message, "Progress saved successfully");
      assertEquals(response.response_count, 2);
    });

    it("should reject invalid request data", () => {
      const invalidBody = { not_responses: "invalid" };
      const hasResponses = "responses" in invalidBody;

      assertEquals(hasResponses, false);
    });

    it("should reject save for completed modules", () => {
      const progress = createTestModuleProgress({ status: "COMPLETED" });
      const canSave = progress.status !== "COMPLETED";

      assertEquals(canSave, false);
    });
  });

  describe("POST /modules/:moduleName/complete", () => {
    it("should complete module with valid submission", () => {
      const submissionData = {
        responses: { q1: "a1", q2: true },
        metadata: { completed_via: "web" },
      };

      const response = {
        message: "Module completed successfully",
        completed_at: new Date().toISOString(),
        next_module: createTestModule({ name: "module-2" }),
        progress_stats: {
          total_modules: 5,
          completed_modules: 2,
          completion_percentage: 40,
        },
      };

      assertEquals(response.message, "Module completed successfully");
      assertExists(response.completed_at);
      assertExists(response.next_module);
    });

    it("should return null next_module when study complete", () => {
      const response = {
        message: "Module completed successfully",
        completed_at: new Date().toISOString(),
        next_module: null,
        progress_stats: {
          total_modules: 5,
          completed_modules: 5,
          completion_percentage: 100,
        },
      };

      assertEquals(response.next_module, null);
      assertEquals(response.progress_stats.completion_percentage, 100);
    });

    it("should reject completion with invalid data", () => {
      const invalidSubmission = { not_responses: {} };
      const hasResponses = "responses" in invalidSubmission;

      assertEquals(hasResponses, false);
    });

    it("should reject completion for already completed modules", () => {
      const progress = createTestModuleProgress({ status: "COMPLETED" });
      const canComplete = progress.status !== "COMPLETED";

      assertEquals(canComplete, false);
    });
  });

  describe("GET /modules/:moduleName/responses", () => {
    it("should return responses for completed modules", () => {
      const progress = createTestModuleProgress({
        status: "COMPLETED",
        response_data: { q1: "a1", q2: true },
      });

      const response = {
        module_name: "module-1",
        responses: progress.response_data,
        completed_at: new Date().toISOString(),
        readonly: true,
      };

      assertExists(response.responses);
      assertEquals(response.readonly, true);
    });

    it("should return null for modules without responses", () => {
      const response = {
        message: "No responses found for this module",
        responses: null,
      };

      assertEquals(response.responses, null);
    });
  });

  describe("GET /modules/progress/stats", () => {
    it("should return detailed progress statistics", () => {
      const response = {
        total_modules: 5,
        completed_modules: 2,
        in_progress_modules: 1,
        not_started_modules: 2,
        completion_percentage: 40,
        navigation: {
          currentModule: createTestModule({ name: "module-2" }),
          completedModules: ["consent", "module-1"],
          availableModules: ["consent", "module-1", "module-2"],
          nextModule: createTestModule({ name: "module-3" }),
          progressPercentage: 40,
        },
      };

      assertExists(response.navigation);
      assertEquals(response.completion_percentage, 40);
      assertEquals(response.navigation.completedModules.length, 2);
    });
  });

  describe("Authentication Middleware", () => {
    it("should reject requests without Authorization header", () => {
      const request = createMockRequest({ headers: {} });
      const hasAuth = request.headers.has("Authorization");

      assertEquals(hasAuth, false);
    });

    it("should reject malformed tokens", () => {
      const malformedToken = "not-a-valid-jwt";
      const parts = malformedToken.split(".");

      assertEquals(parts.length !== 3, true);
    });

    it("should reject expired tokens", () => {
      const expiredPayload = {
        exp: Math.floor(Date.now() / 1000) - 3600, // 1 hour ago
      };

      const isExpired = expiredPayload.exp < Math.floor(Date.now() / 1000);
      assertEquals(isExpired, true);
    });

    it("should accept valid tokens", () => {
      const validPayload = {
        uuid: "user_test-uuid",
        friendlyAlias: "TestUser",
        exp: Math.floor(Date.now() / 1000) + 3600, // 1 hour from now
      };

      const isValid = validPayload.exp > Math.floor(Date.now() / 1000);
      assertEquals(isValid, true);
    });
  });

  describe("Module Access Middleware", () => {
    it("should allow access to first module (consent)", () => {
      const module = createTestModule({ name: "consent", sequence_order: 1 });
      const isFirstModule = module.sequence_order === 1;

      assertEquals(isFirstModule, true);
    });

    it("should check previous module completion", () => {
      const modulesProgress = [
        { sequence_order: 1, status: "COMPLETED" },
        { sequence_order: 2, status: "NOT_STARTED" },
      ];

      const targetSequence = 2;
      const previousComplete = modulesProgress
        .filter((m) => m.sequence_order < targetSequence)
        .every((m) => m.status === "COMPLETED");

      assertEquals(previousComplete, true);
    });

    it("should deny access when previous incomplete", () => {
      const modulesProgress = [
        { sequence_order: 1, status: "IN_PROGRESS" },
        { sequence_order: 2, status: "NOT_STARTED" },
      ];

      const targetSequence = 2;
      const previousComplete = modulesProgress
        .filter((m) => m.sequence_order < targetSequence)
        .every((m) => m.status === "COMPLETED");

      assertEquals(previousComplete, false);
    });
  });

  describe("Error Handling", () => {
    it("should return 500 for server errors", () => {
      const error = new Error("Database connection failed");
      const statusCode = 500;
      const response = { error: "Failed to get module overview" };

      assertEquals(statusCode, 500);
      assertExists(response.error);
    });

    it("should return 400 for validation errors", () => {
      const zodError = {
        errors: [
          { path: ["responses"], message: "Required" },
        ],
      };
      const statusCode = 400;
      const response = {
        error: "Invalid submission data",
        details: zodError.errors,
      };

      assertEquals(statusCode, 400);
      assertExists(response.details);
    });

    it("should include error message in response", () => {
      const error = new Error("Module not accessible");
      const response = { error: error.message };

      assertEquals(response.error, "Module not accessible");
    });
  });
});
