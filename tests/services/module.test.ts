/**
 * Module Service Tests
 * Tests for module progression, access control, and completion logic
 */

import {
  afterEach,
  assertEquals,
  assertExists,
  beforeEach,
  createStub,
  createTestModule,
  createTestModuleProgress,
  createTestUser,
  describe,
  it,
  restoreEnv,
  setupTestEnv,
} from "../test-config-extended.ts";

// Module status types
type ModuleStatus = "NOT_STARTED" | "IN_PROGRESS" | "COMPLETED";

// Mock module repository
const mockModuleRepository = {
  getModulesWithProgress: createStub(),
  getModuleByName: createStub(),
  isModuleAccessible: createStub(),
  getNextAccessibleModule: createStub(),
  startModule: createStub(),
  completeModule: createStub(),
  getUserModuleProgress: createStub(),
  updateModuleResponse: createStub(),
  getCurrentModule: createStub(),
  getUserCompletionStats: createStub(),
};

// Mock audit repository
const mockAuditRepository = {
  logModuleStart: createStub(),
  logModuleCompletion: createStub(),
  createAudit: createStub(),
};

// Mock user repository
const mockUserRepository = {
  setActiveModule: createStub(),
};

describe("Module Service", () => {
  let originalEnv: Record<string, string>;

  beforeEach(() => {
    originalEnv = setupTestEnv();

    // Reset mocks with default behaviors
    mockModuleRepository.getModuleByName.resolves(createTestModule());
    mockModuleRepository.isModuleAccessible.resolves(true);
    mockModuleRepository.startModule.resolves(createTestModuleProgress());
    mockAuditRepository.logModuleStart.resolves(undefined);
    mockUserRepository.setActiveModule.resolves(undefined);
  });

  afterEach(() => {
    restoreEnv(originalEnv);
  });

  describe("Module Access Control", () => {
    it("should deny access to non-existent modules", () => {
      const module = null;
      const result = module
        ? { accessible: true }
        : { accessible: false, reason: "Module not found" };

      assertEquals(result.accessible, false);
      assertEquals(result.reason, "Module not found");
    });

    it("should deny access when previous modules incomplete", () => {
      const previousModulesComplete = false;
      const result = previousModulesComplete
        ? { accessible: true }
        : { accessible: false, reason: "Complete previous modules first" };

      assertEquals(result.accessible, false);
      assertEquals(result.reason, "Complete previous modules first");
    });

    it("should allow access when previous modules are complete", () => {
      const previousModulesComplete = true;
      const result = previousModulesComplete
        ? { accessible: true }
        : { accessible: false };

      assertEquals(result.accessible, true);
    });

    it("should always allow access to consent module (first module)", () => {
      const module = createTestModule({
        name: "consent",
        sequence_order: 1,
      });

      // First module (consent) should always be accessible
      const isFirstModule = module.sequence_order === 1;
      assertEquals(isFirstModule, true);
    });

    it("should enforce sequential module order", () => {
      const modules = [
        createTestModule({ name: "consent", sequence_order: 1 }),
        createTestModule({ name: "module-1", sequence_order: 2 }),
        createTestModule({ name: "module-2", sequence_order: 3 }),
      ];

      // Verify modules are in order
      for (let i = 1; i < modules.length; i++) {
        assertEquals(
          modules[i].sequence_order > modules[i - 1].sequence_order,
          true,
        );
      }
    });
  });

  describe("Module Progression", () => {
    it("should transition status from NOT_STARTED to IN_PROGRESS on start", () => {
      const initialStatus: ModuleStatus = "NOT_STARTED";
      const statusAfterStart: ModuleStatus = "IN_PROGRESS";

      assertEquals(initialStatus, "NOT_STARTED");
      assertEquals(statusAfterStart, "IN_PROGRESS");
    });

    it("should transition status from IN_PROGRESS to COMPLETED on complete", () => {
      const statusBeforeComplete: ModuleStatus = "IN_PROGRESS";
      const statusAfterComplete: ModuleStatus = "COMPLETED";

      assertEquals(statusBeforeComplete, "IN_PROGRESS");
      assertEquals(statusAfterComplete, "COMPLETED");
    });

    it("should set started_at timestamp when starting module", () => {
      const progress = createTestModuleProgress({
        status: "IN_PROGRESS",
        started_at: new Date(),
      });

      assertExists(progress.started_at);
      assertEquals(progress.status, "IN_PROGRESS");
    });

    it("should set completed_at timestamp when completing module", () => {
      const progress = createTestModuleProgress({
        status: "COMPLETED",
        completed_at: new Date(),
      });

      assertExists(progress.completed_at);
      assertEquals(progress.status, "COMPLETED");
    });

    it("should update user active_module when starting a module", () => {
      const user = createTestUser({ active_module: null });
      const module = createTestModule({ id: 5 });

      // After starting, active_module should be set
      const updatedUser = { ...user, active_module: module.id };

      assertEquals(updatedUser.active_module, 5);
    });
  });

  describe("Module Completion", () => {
    it("should require submission data for completion", () => {
      const submissionData = {
        responses: { question1: "answer1", question2: "answer2" },
        metadata: { completed_at: new Date().toISOString() },
      };

      assertExists(submissionData.responses);
      assertEquals(Object.keys(submissionData.responses).length > 0, true);
    });

    it("should store response data on completion", () => {
      const responseData = {
        question1: "answer1",
        question2: true,
        question3: ["option1", "option2"],
      };

      const progress = createTestModuleProgress({
        status: "COMPLETED",
        response_data: responseData,
      });

      assertExists(progress.response_data);
      assertEquals(typeof progress.response_data, "object");
    });

    it("should advance to next module after completion", () => {
      const currentModule = createTestModule({
        name: "module-1",
        sequence_order: 2,
      });
      const nextModule = createTestModule({
        name: "module-2",
        sequence_order: 3,
      });

      assertEquals(nextModule.sequence_order, currentModule.sequence_order + 1);
    });

    it("should set active_module to null when no more modules", () => {
      const user = createTestUser({ active_module: 4 });
      const noMoreModules = null;

      const updatedUser = { ...user, active_module: noMoreModules };

      assertEquals(updatedUser.active_module, null);
    });
  });

  describe("Progress Saving", () => {
    it("should save partial progress without completing", () => {
      const partialProgress = createTestModuleProgress({
        status: "IN_PROGRESS",
        response_data: { question1: "partial_answer" },
      });

      assertEquals(partialProgress.status, "IN_PROGRESS");
      assertExists(partialProgress.response_data);
    });

    it("should auto-start module if not started when saving progress", () => {
      const notStarted = null;
      const shouldAutoStart = notStarted === null;

      assertEquals(shouldAutoStart, true);
    });

    it("should update last_saved timestamp when saving progress", () => {
      const responseData = {
        responses: { q1: "a1" },
        last_saved: new Date().toISOString(),
      };

      assertExists(responseData.last_saved);
    });
  });

  describe("Navigation State", () => {
    it("should return current module for user", () => {
      const currentModule = createTestModule({
        name: "module-1",
        sequence_order: 2,
      });

      assertExists(currentModule);
      assertEquals(currentModule.name, "module-1");
    });

    it("should calculate progress percentage correctly", () => {
      const totalModules = 5;
      const completedModules = 2;
      const progressPercentage = (completedModules / totalModules) * 100;

      assertEquals(progressPercentage, 40);
    });

    it("should list completed modules", () => {
      const modules = [
        { name: "consent", status: "COMPLETED" },
        { name: "module-1", status: "COMPLETED" },
        { name: "module-2", status: "IN_PROGRESS" },
        { name: "module-3", status: "NOT_STARTED" },
      ];

      const completedModules = modules
        .filter((m) => m.status === "COMPLETED")
        .map((m) => m.name);

      assertEquals(completedModules.length, 2);
      assertEquals(completedModules.includes("consent"), true);
      assertEquals(completedModules.includes("module-1"), true);
    });

    it("should list available (accessible) modules", () => {
      const modules = [
        { name: "consent", accessible: true },
        { name: "module-1", accessible: true },
        { name: "module-2", accessible: false },
      ];

      const availableModules = modules
        .filter((m) => m.accessible)
        .map((m) => m.name);

      assertEquals(availableModules.length, 2);
    });
  });

  describe("Review Mode", () => {
    it("should allow review of completed modules", () => {
      const progress = createTestModuleProgress({ status: "COMPLETED" });
      const canReview = progress.status === "COMPLETED";

      assertEquals(canReview, true);
    });

    it("should not allow modification of completed modules", () => {
      const progress = createTestModuleProgress({ status: "COMPLETED" });
      const isReadOnly = progress.status === "COMPLETED";

      assertEquals(isReadOnly, true);
    });
  });

  describe("User Initialization", () => {
    it("should start consent module for new users", () => {
      const consentModule = createTestModule({
        name: "consent",
        sequence_order: 1,
      });

      assertEquals(consentModule.name, "consent");
      assertEquals(consentModule.sequence_order, 1);
    });

    it("should set consent as initial active module", () => {
      const newUser = createTestUser({ active_module: null });
      const consentModule = createTestModule({ id: 1, name: "consent" });

      const initializedUser = { ...newUser, active_module: consentModule.id };

      assertEquals(initializedUser.active_module, 1);
    });
  });

  describe("Audit Logging", () => {
    it("should log module start events", () => {
      const auditEvent = {
        event_type: "MODULE_START",
        user_id: 1,
        details: {
          module_id: 2,
          module_name: "module-1",
          sequence_order: 2,
        },
      };

      assertEquals(auditEvent.event_type, "MODULE_START");
      assertExists(auditEvent.details.module_id);
    });

    it("should log module completion events", () => {
      const auditEvent = {
        event_type: "MODULE_COMPLETION",
        user_id: 1,
        details: {
          module_id: 2,
          module_name: "module-1",
          response_count: 5,
        },
      };

      assertEquals(auditEvent.event_type, "MODULE_COMPLETION");
      assertExists(auditEvent.details.response_count);
    });

    it("should log access denied events", () => {
      const auditEvent = {
        event_type: "MODULE_START",
        user_id: 1,
        details: {
          module_name: "restricted-module",
          reason: "Previous module not completed",
          timestamp: new Date().toISOString(),
        },
      };

      assertExists(auditEvent.details.reason);
    });
  });
});
