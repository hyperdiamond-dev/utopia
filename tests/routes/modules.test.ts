/**
 * Module Routes Tests
 * Integration-style tests for module API endpoints using Hono's app.request()
 * Stubs repositories and services to test the full middleware chain
 */

import {
  setupTestEnv,
  restoreEnv,
} from "../test-config.ts";
// Set env before imports
const _envBak = setupTestEnv();

import {
  afterEach,
  assertEquals,
  assertExists,
  beforeEach,
  describe,
  it,
  restore,
  stubMethod as stub,
  createTestModule,
  createTestModuleProgress,
  createTestUser,
  initTestJwt,
  createSignedTestJWT,
} from "../test-config.ts";

import { Hono } from "hono";

// Dynamic imports — must come AFTER setupTestEnv() so DATABASE_URL and Firebase env vars are set
const { modules } = await import("../../routes/modules.ts");
const { moduleRepository, userRepository } = await import("../../db/index.ts");
const { ModuleService } = await import("../../services/moduleService.ts");

// Initialize JWT signing for route tests
await initTestJwt();

// Helper to make requests
function makeRequest(
  app: Hono,
  method: string,
  path: string,
  options: { token?: string; body?: unknown } = {},
): Promise<Response> {
  const headers: Record<string, string> = {};
  if (options.token) headers["Authorization"] = `Bearer ${options.token}`;
  if (options.body) headers["Content-Type"] = "application/json";

  return app.request(
    new Request(`http://localhost${path}`, {
      method,
      headers,
      body: options.body ? JSON.stringify(options.body) : undefined,
    }),
  );
}

describe("Module Routes", () => {
  let app: Hono;
  let originalEnv: Record<string, string>;
  let validToken: string;

  beforeEach(() => {
    originalEnv = setupTestEnv();
    app = new Hono();
    app.route("/modules", modules);
    validToken = createSignedTestJWT();
  });

  afterEach(() => {
    restore();
    restoreEnv(originalEnv);
  });

  describe("GET /modules/list", () => {
    it("should return public module list without authentication", async () => {
      const testModules = [
        createTestModule({ id: 1, name: "consent", title: "Consent Form", sequence_order: 1 }),
        createTestModule({ id: 2, name: "module-1", title: "Module 1", sequence_order: 2 }),
      ];

      stub(moduleRepository, "getAllModules", () => Promise.resolve(testModules));

      const res = await makeRequest(app, "GET", "/modules/list");

      assertEquals(res.status, 200);
      const body = await res.json();
      assertExists(body.modules);
      assertEquals(body.modules.length, 2);
      assertEquals(body.modules[0].name, "consent");
      assertEquals(body.modules[1].name, "module-1");
      // Should only include public fields
      assertExists(body.modules[0].title);
      assertExists(body.modules[0].description);
      assertExists(body.modules[0].sequence_order);
    });

    it("should return 500 when repository throws", async () => {
      stub(moduleRepository, "getAllModules", () =>
        Promise.reject(new Error("DB error"))
      );

      const res = await makeRequest(app, "GET", "/modules/list");

      assertEquals(res.status, 500);
      const body = await res.json();
      assertExists(body.error);
    });
  });

  describe("GET /modules (authenticated)", () => {
    it("should return 401 without token", async () => {
      const res = await makeRequest(app, "GET", "/modules");

      assertEquals(res.status, 401);
    });

    it("should return module overview for authenticated user", async () => {
      const testUser = createTestUser({ id: 1, uuid: "user_test-uuid" });
      const overview = [
        { ...createTestModule({ name: "consent" }), user_progress: { status: "COMPLETED" }, accessible: true },
        { ...createTestModule({ name: "module-1" }), user_progress: { status: "IN_PROGRESS" }, accessible: true },
      ];
      const navState = {
        currentModule: createTestModule({ name: "module-1" }),
        completedModules: ["consent"],
        availableModules: ["consent", "module-1"],
        nextModule: null,
        progressPercentage: 50,
      };
      const progressStats = { total_modules: 2, completed_modules: 1, completion_percentage: 50 };

      stub(userRepository, "findByUuid", () => Promise.resolve(testUser));
      stub(ModuleService, "getUserModuleOverview", () => Promise.resolve(overview));
      stub(ModuleService, "getNavigationState", () => Promise.resolve(navState));
      stub(ModuleService, "getUserProgress", () => Promise.resolve(progressStats));

      const res = await makeRequest(app, "GET", "/modules", { token: validToken });

      assertEquals(res.status, 200);
      const body = await res.json();
      assertExists(body.modules);
      assertExists(body.navigation);
      assertExists(body.progress);
      assertEquals(body.modules.length, 2);
      assertEquals(body.progress.completion_percentage, 50);
    });

    it("should return 404 when user not found in database", async () => {
      stub(userRepository, "findByUuid", () => Promise.resolve(null));

      const res = await makeRequest(app, "GET", "/modules", { token: validToken });

      assertEquals(res.status, 404);
    });
  });

  describe("GET /modules/current", () => {
    it("should return current module for user", async () => {
      const testUser = createTestUser({ id: 1, uuid: "user_test-uuid" });
      const currentModule = createTestModule({ name: "module-1" });
      const moduleData = {
        module: currentModule,
        progress: createTestModuleProgress({ status: "IN_PROGRESS" }),
        accessible: true,
        isCompleted: false,
        canReview: false,
      };

      stub(userRepository, "findByUuid", () => Promise.resolve(testUser));
      stub(ModuleService, "getCurrentModule", () => Promise.resolve(currentModule));
      stub(ModuleService, "getModuleForUser", () => Promise.resolve(moduleData));

      const res = await makeRequest(app, "GET", "/modules/current", { token: validToken });

      assertEquals(res.status, 200);
      const body = await res.json();
      assertExists(body.current_module);
      assertEquals(body.current_module.name, "module-1");
      assertEquals(body.is_completed, false);
    });

    it("should return null when all modules completed", async () => {
      const testUser = createTestUser({ id: 1, uuid: "user_test-uuid" });

      stub(userRepository, "findByUuid", () => Promise.resolve(testUser));
      stub(ModuleService, "getCurrentModule", () => Promise.resolve(null));

      const res = await makeRequest(app, "GET", "/modules/current", { token: validToken });

      assertEquals(res.status, 200);
      const body = await res.json();
      assertEquals(body.current_module, null);
      assertEquals(body.message, "All modules completed");
    });
  });

  describe("GET /modules/:moduleName", () => {
    it("should return module data for accessible module", async () => {
      const testUser = createTestUser({ id: 1, uuid: "user_test-uuid" });
      const testModule = createTestModule({ id: 2, name: "module-1" });
      const moduleData = {
        module: testModule,
        progress: createTestModuleProgress({ status: "IN_PROGRESS" }),
        accessible: true,
        isCompleted: false,
        canReview: false,
      };

      stub(userRepository, "findByUuid", () => Promise.resolve(testUser));
      stub(ModuleService, "checkModuleAccess", () =>
        Promise.resolve({ accessible: true })
      );
      stub(ModuleService, "logAccessDenied", () => Promise.resolve());
      stub(ModuleService, "getModuleForUser", () => Promise.resolve(moduleData));

      const res = await makeRequest(app, "GET", "/modules/module-1", { token: validToken });

      assertEquals(res.status, 200);
      const body = await res.json();
      assertExists(body.module);
      assertEquals(body.module.name, "module-1");
      assertEquals(body.accessible, true);
      assertEquals(body.is_completed, false);
    });

    it("should return 403 when module is not accessible", async () => {
      const testUser = createTestUser({ id: 1, uuid: "user_test-uuid" });
      const nextModule = createTestModule({ name: "consent", title: "Consent Form" });

      stub(userRepository, "findByUuid", () => Promise.resolve(testUser));
      stub(ModuleService, "checkModuleAccess", () =>
        Promise.resolve({
          accessible: false,
          reason: "Complete previous modules first",
          nextModule,
        })
      );
      stub(ModuleService, "logAccessDenied", () => Promise.resolve());

      const res = await makeRequest(app, "GET", "/modules/module-2", { token: validToken });

      assertEquals(res.status, 403);
      const body = await res.json();
      assertEquals(body.error, "Module access denied");
      assertExists(body.reason);
    });
  });

  describe("POST /modules/:moduleName/start", () => {
    it("should start an accessible module", async () => {
      const testUser = createTestUser({ id: 1, uuid: "user_test-uuid" });
      const progress = createTestModuleProgress({
        status: "IN_PROGRESS",
        started_at: new Date(),
        module_id: 2,
      });
      const moduleData = {
        module: createTestModule({ id: 2, name: "module-1" }),
        progress: createTestModuleProgress({ status: "NOT_STARTED" }),
        accessible: true,
        isCompleted: false,
        canReview: false,
      };

      stub(userRepository, "findByUuid", () => Promise.resolve(testUser));
      stub(ModuleService, "checkModuleAccess", () =>
        Promise.resolve({ accessible: true })
      );
      stub(ModuleService, "getModuleForUser", () => Promise.resolve(moduleData));
      stub(ModuleService, "startModule", () => Promise.resolve(progress));

      const res = await makeRequest(app, "POST", "/modules/module-1/start", { token: validToken });

      assertEquals(res.status, 200);
      const body = await res.json();
      assertEquals(body.message, "Module started successfully");
      assertEquals(body.progress.status, "IN_PROGRESS");
    });

    it("should return 403 for completed module", async () => {
      const testUser = createTestUser({ id: 1, uuid: "user_test-uuid" });
      const moduleData = {
        module: createTestModule({ id: 1, name: "consent" }),
        progress: createTestModuleProgress({ status: "COMPLETED" }),
        accessible: true,
        isCompleted: true,
        canReview: true,
      };

      stub(userRepository, "findByUuid", () => Promise.resolve(testUser));
      stub(ModuleService, "checkModuleAccess", () =>
        Promise.resolve({ accessible: true })
      );
      stub(ModuleService, "getModuleForUser", () => Promise.resolve(moduleData));

      const res = await makeRequest(app, "POST", "/modules/consent/start", { token: validToken });

      assertEquals(res.status, 403);
      const body = await res.json();
      assertEquals(body.error, "Module is read-only");
    });
  });

  describe("POST /modules/:moduleName/save", () => {
    it("should save partial progress", async () => {
      const testUser = createTestUser({ id: 1, uuid: "user_test-uuid" });
      const moduleData = {
        module: createTestModule({ id: 2, name: "module-1" }),
        progress: createTestModuleProgress({ status: "IN_PROGRESS" }),
        accessible: true,
        isCompleted: false,
        canReview: false,
      };

      stub(userRepository, "findByUuid", () => Promise.resolve(testUser));
      stub(ModuleService, "checkModuleAccess", () =>
        Promise.resolve({ accessible: true })
      );
      stub(ModuleService, "getModuleForUser", () => Promise.resolve(moduleData));
      stub(ModuleService, "saveModuleProgress", () =>
        Promise.resolve(createTestModuleProgress({ status: "IN_PROGRESS" }))
      );

      const res = await makeRequest(app, "POST", "/modules/module-1/save", {
        token: validToken,
        body: { responses: { q1: "answer1", q2: true } },
      });

      assertEquals(res.status, 200);
      const body = await res.json();
      assertEquals(body.message, "Progress saved successfully");
      assertEquals(body.response_count, 2);
      assertExists(body.saved_at);
    });

    it("should return 400 for invalid request body", async () => {
      const testUser = createTestUser({ id: 1, uuid: "user_test-uuid" });
      const moduleData = {
        module: createTestModule({ id: 2, name: "module-1" }),
        progress: createTestModuleProgress({ status: "IN_PROGRESS" }),
        accessible: true,
        isCompleted: false,
        canReview: false,
      };

      stub(userRepository, "findByUuid", () => Promise.resolve(testUser));
      stub(ModuleService, "checkModuleAccess", () =>
        Promise.resolve({ accessible: true })
      );
      stub(ModuleService, "getModuleForUser", () => Promise.resolve(moduleData));

      const res = await makeRequest(app, "POST", "/modules/module-1/save", {
        token: validToken,
        body: { not_responses: "invalid" },
      });

      assertEquals(res.status, 400);
      const body = await res.json();
      assertExists(body.error);
    });
  });

  describe("POST /modules/:moduleName/complete", () => {
    it("should complete module with valid submission", async () => {
      const testUser = createTestUser({ id: 1, uuid: "user_test-uuid" });
      const moduleDataInProgress = {
        module: createTestModule({ id: 2, name: "module-1" }),
        progress: createTestModuleProgress({ status: "IN_PROGRESS" }),
        accessible: true,
        isCompleted: false,
        canReview: false,
      };
      const completedProgress = createTestModuleProgress({
        status: "COMPLETED",
        completed_at: new Date(),
      });
      const nextModule = createTestModule({ id: 3, name: "module-2", title: "Module 2", sequence_order: 3 });
      const progressStats = { total_modules: 4, completed_modules: 2, completion_percentage: 50 };

      stub(userRepository, "findByUuid", () => Promise.resolve(testUser));
      stub(ModuleService, "checkModuleAccess", () =>
        Promise.resolve({ accessible: true })
      );
      stub(ModuleService, "getModuleForUser", () => Promise.resolve(moduleDataInProgress));
      stub(ModuleService, "completeModule", () => Promise.resolve(completedProgress));
      stub(ModuleService, "getCurrentModule", () => Promise.resolve(nextModule));
      stub(ModuleService, "getUserProgress", () => Promise.resolve(progressStats));

      const res = await makeRequest(app, "POST", "/modules/module-1/complete", {
        token: validToken,
        body: { responses: { q1: "a1", q2: "a2" }, metadata: { source: "web" } },
      });

      assertEquals(res.status, 200);
      const body = await res.json();
      assertEquals(body.message, "Module completed successfully");
      assertExists(body.completed_at);
      assertExists(body.next_module);
      assertEquals(body.next_module.name, "module-2");
      assertEquals(body.progress_stats.completion_percentage, 50);
    });

    it("should return 400 for invalid submission body", async () => {
      const testUser = createTestUser({ id: 1, uuid: "user_test-uuid" });
      const moduleData = {
        module: createTestModule({ id: 2, name: "module-1" }),
        progress: createTestModuleProgress({ status: "IN_PROGRESS" }),
        accessible: true,
        isCompleted: false,
        canReview: false,
      };

      stub(userRepository, "findByUuid", () => Promise.resolve(testUser));
      stub(ModuleService, "checkModuleAccess", () =>
        Promise.resolve({ accessible: true })
      );
      stub(ModuleService, "getModuleForUser", () => Promise.resolve(moduleData));

      const res = await makeRequest(app, "POST", "/modules/module-1/complete", {
        token: validToken,
        body: { invalid: "data" },
      });

      assertEquals(res.status, 400);
      const body = await res.json();
      assertEquals(body.error, "Invalid submission data");
      assertExists(body.details);
    });

    it("should return 400 when module not started", async () => {
      const testUser = createTestUser({ id: 1, uuid: "user_test-uuid" });
      const moduleData = {
        module: createTestModule({ id: 2, name: "module-1" }),
        progress: createTestModuleProgress({ status: "NOT_STARTED" }),
        accessible: true,
        isCompleted: false,
        canReview: false,
      };

      stub(userRepository, "findByUuid", () => Promise.resolve(testUser));
      stub(ModuleService, "checkModuleAccess", () =>
        Promise.resolve({ accessible: true })
      );
      stub(ModuleService, "getModuleForUser", () => Promise.resolve(moduleData));

      const res = await makeRequest(app, "POST", "/modules/module-1/complete", {
        token: validToken,
        body: { responses: { q1: "a1" } },
      });

      assertEquals(res.status, 400);
      const body = await res.json();
      assertEquals(body.error, "Module not started");
    });
  });

  describe("GET /modules/:moduleName/responses", () => {
    it("should return responses for completed module", async () => {
      const testUser = createTestUser({ id: 1, uuid: "user_test-uuid" });
      const moduleData = {
        module: createTestModule({ id: 1, name: "consent" }),
        progress: createTestModuleProgress({
          status: "COMPLETED",
          completed_at: new Date(),
          response_data: { q1: "yes", q2: true },
        }),
        accessible: true,
        isCompleted: true,
        canReview: true,
      };

      stub(userRepository, "findByUuid", () => Promise.resolve(testUser));
      stub(ModuleService, "checkModuleAccess", () =>
        Promise.resolve({ accessible: true })
      );
      stub(ModuleService, "getModuleForUser", () => Promise.resolve(moduleData));

      const res = await makeRequest(app, "GET", "/modules/consent/responses", { token: validToken });

      assertEquals(res.status, 200);
      const body = await res.json();
      assertEquals(body.module_name, "consent");
      assertExists(body.responses);
      assertEquals(body.readonly, true);
    });

    it("should return null responses when none exist", async () => {
      const testUser = createTestUser({ id: 1, uuid: "user_test-uuid" });
      const moduleData = {
        module: createTestModule({ id: 2, name: "module-1" }),
        progress: createTestModuleProgress({ status: "IN_PROGRESS", response_data: null }),
        accessible: true,
        isCompleted: false,
        canReview: false,
      };

      stub(userRepository, "findByUuid", () => Promise.resolve(testUser));
      stub(ModuleService, "checkModuleAccess", () =>
        Promise.resolve({ accessible: true })
      );
      stub(ModuleService, "getModuleForUser", () => Promise.resolve(moduleData));

      const res = await makeRequest(app, "GET", "/modules/module-1/responses", { token: validToken });

      assertEquals(res.status, 200);
      const body = await res.json();
      assertEquals(body.responses, null);
    });
  });

  describe("GET /modules/progress/stats", () => {
    it("should return detailed progress statistics", async () => {
      const testUser = createTestUser({ id: 1, uuid: "user_test-uuid" });
      const progressStats = {
        total_modules: 5,
        completed_modules: 2,
        in_progress_modules: 1,
        not_started_modules: 2,
        completion_percentage: 40,
      };
      const navState = {
        currentModule: createTestModule({ name: "module-2" }),
        completedModules: ["consent", "module-1"],
        availableModules: ["consent", "module-1", "module-2"],
        nextModule: createTestModule({ name: "module-3" }),
        progressPercentage: 40,
      };

      stub(userRepository, "findByUuid", () => Promise.resolve(testUser));
      stub(ModuleService, "getUserProgress", () => Promise.resolve(progressStats));
      stub(ModuleService, "getNavigationState", () => Promise.resolve(navState));

      const res = await makeRequest(app, "GET", "/modules/progress/stats", { token: validToken });

      assertEquals(res.status, 200);
      const body = await res.json();
      assertEquals(body.completion_percentage, 40);
      assertExists(body.navigation);
      assertEquals(body.navigation.completedModules.length, 2);
    });
  });

  describe("Authentication middleware", () => {
    it("should return 401 for missing token", async () => {
      const res = await makeRequest(app, "GET", "/modules");

      assertEquals(res.status, 401);
      const body = await res.json();
      assertEquals(body.error, "No token provided");
    });

    it("should return 401 for invalid token", async () => {
      const res = await makeRequest(app, "GET", "/modules", {
        token: "invalid-jwt-token",
      });

      assertEquals(res.status, 401);
      const body = await res.json();
      assertEquals(body.error, "Invalid token");
    });
  });
});
