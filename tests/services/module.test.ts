/**
 * Module Service Tests
 * Tests for module progression, access control, and completion logic
 * Uses stub() on real repository singletons to test actual ModuleService methods
 */

import {
  afterEach,
  assertEquals,
  assertExists,
  assertRejects,
  beforeEach,
  describe,
  it,
  restore,
  setupTestEnv,
  restoreEnv,
  stubMethod as stub,
  createTestModule,
  createTestModuleProgress,
  createTestUser,
} from "../test-config.ts";

// Set env before dynamic imports that trigger db/connection.ts
setupTestEnv();

const { ModuleService } = await import("../../services/moduleService.ts");
const { auditRepository, moduleRepository, userRepository } = await import("../../db/index.ts");

describe("ModuleService", () => {
  let originalEnv: Record<string, string>;

  beforeEach(() => {
    originalEnv = setupTestEnv();
  });

  afterEach(() => {
    restore();
    restoreEnv(originalEnv);
  });

  describe("checkModuleAccess", () => {
    it("should return inaccessible when module not found", async () => {
      stub(moduleRepository, "getModuleByName", () => Promise.resolve(null));

      const result = await ModuleService.checkModuleAccess(1, "nonexistent");

      assertEquals(result.accessible, false);
      assertEquals(result.reason, "Module not found");
    });

    it("should return inaccessible when previous modules incomplete", async () => {
      const testModule = createTestModule({ id: 3, name: "module-2" });
      const nextModule = createTestModule({ id: 2, name: "module-1" });

      stub(moduleRepository, "getModuleByName", () => Promise.resolve(testModule));
      stub(moduleRepository, "isModuleAccessible", () => Promise.resolve(false));
      stub(moduleRepository, "getNextAccessibleModule", () => Promise.resolve(nextModule));

      const result = await ModuleService.checkModuleAccess(1, "module-2");

      assertEquals(result.accessible, false);
      assertEquals(result.reason, "Complete previous modules first");
      assertEquals(result.nextModule?.name, "module-1");
    });

    it("should return accessible when module is available", async () => {
      const testModule = createTestModule({ id: 1, name: "consent" });

      stub(moduleRepository, "getModuleByName", () => Promise.resolve(testModule));
      stub(moduleRepository, "isModuleAccessible", () => Promise.resolve(true));

      const result = await ModuleService.checkModuleAccess(1, "consent");

      assertEquals(result.accessible, true);
      assertEquals(result.reason, undefined);
    });
  });

  describe("startModule", () => {
    it("should start module and log audit event", async () => {
      const testModule = createTestModule({ id: 2, name: "module-1", sequence_order: 2 });
      const testProgress = createTestModuleProgress({
        status: "IN_PROGRESS",
        started_at: new Date(),
        module_id: 2,
      });

      stub(moduleRepository, "getModuleByName", () => Promise.resolve(testModule));
      stub(moduleRepository, "isModuleAccessible", () => Promise.resolve(true));
      stub(moduleRepository, "startModule", () => Promise.resolve(testProgress));
      const auditStub = stub(auditRepository, "logModuleStart", () => Promise.resolve());
      const activeModuleStub = stub(userRepository, "setActiveModule", () => Promise.resolve());

      const result = await ModuleService.startModule(1, "module-1");

      assertEquals(result.status, "IN_PROGRESS");
      assertExists(result.started_at);
      assertEquals(auditStub.calls.length, 1);
      assertEquals(auditStub.calls[0].args[0], 1); // userId
      assertEquals((auditStub.calls[0].args[1] as Record<string, unknown>).module_name, "module-1");
      assertEquals(activeModuleStub.calls.length, 1);
      assertEquals(activeModuleStub.calls[0].args, [1, 2]); // userId, moduleId
    });

    it("should throw when module not found", async () => {
      stub(moduleRepository, "getModuleByName", () => Promise.resolve(null));

      await assertRejects(
        () => ModuleService.startModule(1, "nonexistent"),
        Error,
        "Module not found",
      );
    });

    it("should throw when access denied", async () => {
      const testModule = createTestModule({ id: 3, name: "module-2" });

      stub(moduleRepository, "getModuleByName", () => Promise.resolve(testModule));
      stub(moduleRepository, "isModuleAccessible", () => Promise.resolve(false));
      stub(moduleRepository, "getNextAccessibleModule", () => Promise.resolve(null));

      await assertRejects(
        () => ModuleService.startModule(1, "module-2"),
        Error,
        "Complete previous modules first",
      );
    });
  });

  describe("completeModule", () => {
    it("should complete module, log audit, and set next active module", async () => {
      const testModule = createTestModule({ id: 2, name: "module-1", sequence_order: 2 });
      const completedProgress = createTestModuleProgress({
        status: "COMPLETED",
        completed_at: new Date(),
        module_id: 2,
      });
      const nextModule = createTestModule({ id: 3, name: "module-2" });
      const submissionData = {
        responses: { q1: "answer1", q2: "answer2" },
        metadata: { source: "web" },
      };

      stub(moduleRepository, "getModuleByName", () => Promise.resolve(testModule));
      stub(moduleRepository, "isModuleAccessible", () => Promise.resolve(true));
      stub(moduleRepository, "completeModule", () => Promise.resolve(completedProgress));
      stub(moduleRepository, "getNextAccessibleModule", () => Promise.resolve(nextModule));
      const auditStub = stub(auditRepository, "logModuleCompletion", () => Promise.resolve());
      const activeModuleStub = stub(userRepository, "setActiveModule", () => Promise.resolve());

      const result = await ModuleService.completeModule(1, "module-1", submissionData);

      assertEquals(result.status, "COMPLETED");
      assertExists(result.completed_at);
      assertEquals(auditStub.calls.length, 1);
      assertEquals((auditStub.calls[0].args[1] as Record<string, unknown>).response_count, 2);
      assertEquals(activeModuleStub.calls[0].args, [1, 3]); // userId, nextModuleId
    });

    it("should set active module to null when no more modules", async () => {
      const testModule = createTestModule({ id: 4, name: "module-3", sequence_order: 4 });
      const completedProgress = createTestModuleProgress({ status: "COMPLETED" });

      stub(moduleRepository, "getModuleByName", () => Promise.resolve(testModule));
      stub(moduleRepository, "isModuleAccessible", () => Promise.resolve(true));
      stub(moduleRepository, "completeModule", () => Promise.resolve(completedProgress));
      stub(moduleRepository, "getNextAccessibleModule", () => Promise.resolve(null));
      stub(auditRepository, "logModuleCompletion", () => Promise.resolve());
      const activeModuleStub = stub(userRepository, "setActiveModule", () => Promise.resolve());

      await ModuleService.completeModule(1, "module-3", { responses: { q1: "a1" } });

      assertEquals(activeModuleStub.calls[0].args, [1, null]);
    });

    it("should throw when module not found", async () => {
      stub(moduleRepository, "getModuleByName", () => Promise.resolve(null));

      await assertRejects(
        () => ModuleService.completeModule(1, "nonexistent", { responses: {} }),
        Error,
        "Module not found",
      );
    });
  });

  describe("saveModuleProgress", () => {
    it("should update existing progress without restarting", async () => {
      const testModule = createTestModule({ id: 2, name: "module-1" });
      const existingProgress = createTestModuleProgress({ status: "IN_PROGRESS" });
      const updatedProgress = createTestModuleProgress({
        status: "IN_PROGRESS",
        response_data: { q1: "a1" },
      });

      stub(moduleRepository, "getModuleByName", () => Promise.resolve(testModule));
      stub(moduleRepository, "isModuleAccessible", () => Promise.resolve(true));
      stub(moduleRepository, "getUserModuleProgress", () => Promise.resolve(existingProgress));
      const startStub = stub(moduleRepository, "startModule", () => Promise.resolve(existingProgress));
      const updateStub = stub(moduleRepository, "updateModuleResponse", () => Promise.resolve(updatedProgress));

      const result = await ModuleService.saveModuleProgress(1, "module-1", { q1: "a1" });

      assertEquals(startStub.calls.length, 0); // Should NOT start again
      assertEquals(updateStub.calls.length, 1);
      assertExists(result);
    });

    it("should auto-start module when no progress exists", async () => {
      const testModule = createTestModule({ id: 2, name: "module-1" });
      const newProgress = createTestModuleProgress({ status: "IN_PROGRESS" });
      const updatedProgress = createTestModuleProgress({
        status: "IN_PROGRESS",
        response_data: { q1: "a1" },
      });

      stub(moduleRepository, "getModuleByName", () => Promise.resolve(testModule));
      stub(moduleRepository, "isModuleAccessible", () => Promise.resolve(true));
      stub(moduleRepository, "getUserModuleProgress", () => Promise.resolve(null));
      const startStub = stub(moduleRepository, "startModule", () => Promise.resolve(newProgress));
      stub(moduleRepository, "updateModuleResponse", () => Promise.resolve(updatedProgress));

      await ModuleService.saveModuleProgress(1, "module-1", { q1: "a1" });

      assertEquals(startStub.calls.length, 1); // Should auto-start
    });

    it("should throw when module not found", async () => {
      stub(moduleRepository, "getModuleByName", () => Promise.resolve(null));

      await assertRejects(
        () => ModuleService.saveModuleProgress(1, "nonexistent", {}),
        Error,
        "Module not found",
      );
    });
  });

  describe("getModuleForUser", () => {
    it("should return module data with progress for active module", async () => {
      const testModule = createTestModule({ id: 2, name: "module-1" });
      const progress = createTestModuleProgress({ status: "IN_PROGRESS" });

      stub(moduleRepository, "getModuleByName", () => Promise.resolve(testModule));
      stub(moduleRepository, "getUserModuleProgress", () => Promise.resolve(progress));
      stub(moduleRepository, "isModuleAccessible", () => Promise.resolve(true));

      const result = await ModuleService.getModuleForUser(1, "module-1");

      assertExists(result);
      assertEquals(result!.module.name, "module-1");
      assertEquals(result!.progress?.status, "IN_PROGRESS");
      assertEquals(result!.accessible, true);
      assertEquals(result!.isCompleted, false);
      assertEquals(result!.canReview, false);
    });

    it("should mark completed module as reviewable", async () => {
      const testModule = createTestModule({ id: 1, name: "consent" });
      const progress = createTestModuleProgress({ status: "COMPLETED" });

      stub(moduleRepository, "getModuleByName", () => Promise.resolve(testModule));
      stub(moduleRepository, "getUserModuleProgress", () => Promise.resolve(progress));
      stub(moduleRepository, "isModuleAccessible", () => Promise.resolve(true));

      const result = await ModuleService.getModuleForUser(1, "consent");

      assertExists(result);
      assertEquals(result!.isCompleted, true);
      assertEquals(result!.canReview, true);
    });

    it("should return null for non-existent module", async () => {
      stub(moduleRepository, "getModuleByName", () => Promise.resolve(null));

      const result = await ModuleService.getModuleForUser(1, "nonexistent");

      assertEquals(result, null);
    });
  });

  describe("initializeUserModules", () => {
    it("should start consent module and set it as active", async () => {
      const consentModule = createTestModule({ id: 1, name: "consent" });
      const progress = createTestModuleProgress({ status: "IN_PROGRESS" });

      stub(moduleRepository, "getModuleByName", () => Promise.resolve(consentModule));
      const startStub = stub(moduleRepository, "startModule", () => Promise.resolve(progress));
      const activeStub = stub(userRepository, "setActiveModule", () => Promise.resolve());

      await ModuleService.initializeUserModules(1);

      assertEquals(startStub.calls.length, 1);
      assertEquals(startStub.calls[0].args, [1, 1]); // userId, consentModuleId
      assertEquals(activeStub.calls.length, 1);
      assertEquals(activeStub.calls[0].args, [1, 1]); // userId, consentModuleId
    });

    it("should throw when consent module not found", async () => {
      stub(moduleRepository, "getModuleByName", () => Promise.resolve(null));

      await assertRejects(
        () => ModuleService.initializeUserModules(1),
        Error,
        "Consent module not found",
      );
    });
  });

  describe("getCurrentModule", () => {
    it("should delegate to moduleRepository", async () => {
      const testModule = createTestModule({ name: "module-1" });
      const repoStub = stub(moduleRepository, "getCurrentModule", () => Promise.resolve(testModule));

      const result = await ModuleService.getCurrentModule(1);

      assertEquals(result?.name, "module-1");
      assertEquals(repoStub.calls.length, 1);
      assertEquals(repoStub.calls[0].args[0], 1);
    });

    it("should return null when no current module", async () => {
      stub(moduleRepository, "getCurrentModule", () => Promise.resolve(null));

      const result = await ModuleService.getCurrentModule(1);

      assertEquals(result, null);
    });
  });

  describe("getUserProgress", () => {
    it("should delegate to moduleRepository", async () => {
      const stats = {
        total_modules: 5,
        completed_modules: 2,
        completion_percentage: 40,
      };
      stub(moduleRepository, "getUserCompletionStats", () => Promise.resolve(stats));

      const result = await ModuleService.getUserProgress(1);

      assertEquals(result.completion_percentage, 40);
      assertEquals(result.total_modules, 5);
    });
  });

  describe("getNavigationState", () => {
    it("should return correct navigation state", async () => {
      const modules = [
        {
          ...createTestModule({ name: "consent" }),
          user_progress: { status: "COMPLETED" },
          accessible: true,
        },
        {
          ...createTestModule({ name: "module-1" }),
          user_progress: { status: "COMPLETED" },
          accessible: true,
        },
        {
          ...createTestModule({ name: "module-2" }),
          user_progress: { status: "IN_PROGRESS" },
          accessible: true,
        },
        {
          ...createTestModule({ name: "module-3" }),
          user_progress: null,
          accessible: false,
        },
      ];
      const stats = { completion_percentage: 50, total_modules: 4, completed_modules: 2 };
      const currentModule = createTestModule({ name: "module-2" });
      const nextModule = createTestModule({ name: "module-3" });

      stub(moduleRepository, "getModulesWithProgress", () => Promise.resolve(modules));
      stub(moduleRepository, "getUserCompletionStats", () => Promise.resolve(stats));
      stub(moduleRepository, "getCurrentModule", () => Promise.resolve(currentModule));
      stub(moduleRepository, "getNextAccessibleModule", () => Promise.resolve(nextModule));

      const result = await ModuleService.getNavigationState(1);

      assertEquals(result.currentModule?.name, "module-2");
      assertEquals(result.completedModules, ["consent", "module-1"]);
      assertEquals(result.availableModules, ["consent", "module-1", "module-2"]);
      assertEquals(result.nextModule?.name, "module-3");
      assertEquals(result.progressPercentage, 50);
    });
  });

  describe("logAccessDenied", () => {
    it("should create audit entry for access denial", async () => {
      const testModule = createTestModule({ id: 3, name: "module-2" });
      stub(moduleRepository, "getModuleByName", () => Promise.resolve(testModule));
      const auditStub = stub(auditRepository, "createAudit", () => Promise.resolve());

      await ModuleService.logAccessDenied(1, "module-2", "Previous module not completed");

      assertEquals(auditStub.calls.length, 1);
      assertEquals(auditStub.calls[0].args[0], "MODULE_START");
      assertEquals(auditStub.calls[0].args[1], 1);
      const details = auditStub.calls[0].args[2] as Record<string, unknown>;
      assertEquals(details.module_id, 3);
      assertEquals(details.module_name, "module-2");
      assertEquals(details.reason, "Previous module not completed");
    });
  });
});
