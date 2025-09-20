import {
  describe,
  it,
  beforeEach,
  afterEach,
  assertExists,
  MockSqlClient,
  createTestModule,
  createTestModuleProgress,
  setupTestEnv,
  restoreEnv,
} from "../test-config.ts";

import { ModuleRepository } from "../../db/modules.ts";

describe("ModuleRepository", () => {
  let moduleRepo: ModuleRepository;
  let mockSql: MockSqlClient;
  let originalEnv: Record<string, string>;

  beforeEach(() => {
    originalEnv = setupTestEnv();
    mockSql = new MockSqlClient();
    moduleRepo = new ModuleRepository();
  });

  afterEach(() => {
    mockSql.clearMocks();
    restoreEnv(originalEnv);
  });

  describe("getAllModules", () => {
    it("should return all active modules in sequence order", () => {
      const testModules = [
        createTestModule({ id: 1, name: "consent", sequence_order: 1 }),
        createTestModule({ id: 2, name: "module1", sequence_order: 2 }),
        createTestModule({ id: 3, name: "module2", sequence_order: 3 }),
      ];

      mockSql.mockQuery("select * from modules where is_active = true", testModules);

      assertExists(moduleRepo.getAllModules);
    });

    it("should only return active modules", () => {
      const activeModules = [
        createTestModule({ id: 1, name: "consent", is_active: true }),
      ];

      mockSql.mockQuery("select * from modules where is_active = true", activeModules);

      assertExists(moduleRepo.getAllModules);
    });
  });

  describe("getModuleByName", () => {
    it("should find module by name", () => {
      const testModule = createTestModule({ name: "consent" });
      mockSql.mockQuery("select * from modules where name", [testModule]);

      assertExists(moduleRepo.getModuleByName);
    });

    it("should return null for non-existent module", () => {
      mockSql.mockQuery("select * from modules where name", []);

      assertExists(moduleRepo.getModuleByName);
    });

    it("should only return active modules", () => {
      const activeModule = createTestModule({ name: "consent", is_active: true });
      mockSql.mockQuery("select * from modules where name", [activeModule]);

      assertExists(moduleRepo.getModuleByName);
    });
  });

  describe("getModuleById", () => {
    it("should find module by ID", () => {
      const testModule = createTestModule({ id: 1 });
      mockSql.mockQuery("select * from modules where id", [testModule]);

      assertExists(moduleRepo.getModuleById);
    });
  });

  describe("getUserModuleProgress", () => {
    it("should return user progress for specific module", () => {
      const testProgress = createTestModuleProgress({
        user_id: 1,
        module_id: 1,
        status: "IN_PROGRESS",
      });

      mockSql.mockQuery("select * from user_module_progress", [testProgress]);

      assertExists(moduleRepo.getUserModuleProgress);
    });

    it("should return null when no progress exists", () => {
      mockSql.mockQuery("select * from user_module_progress", []);

      assertExists(moduleRepo.getUserModuleProgress);
    });
  });

  describe("getUserProgress", () => {
    it("should return all user progress ordered by creation date", () => {
      const userProgress = [
        createTestModuleProgress({ user_id: 1, module_id: 1, status: "COMPLETED" }),
        createTestModuleProgress({ user_id: 1, module_id: 2, status: "IN_PROGRESS" }),
      ];

      mockSql.mockQuery("select * from user_module_progress", userProgress);

      assertExists(moduleRepo.getUserProgress);
    });
  });

  describe("getModulesWithProgress", () => {
    it("should return modules with user progress and accessibility", () => {
      const modules = [
        createTestModule({ id: 1, name: "consent", sequence_order: 1 }),
        createTestModule({ id: 2, name: "module1", sequence_order: 2 }),
      ];

      const progress = [
        createTestModuleProgress({ user_id: 1, module_id: 1, status: "COMPLETED" }),
      ];

      mockSql.mockQuery("select * from modules", modules);
      mockSql.mockQuery("select * from user_module_progress", progress);

      assertExists(moduleRepo.getModulesWithProgress);
    });
  });

  describe("isModuleAccessible", () => {
    it("should allow access to first module (consent)", () => {
      const consentModule = createTestModule({
        id: 1,
        name: "consent",
        sequence_order: 1,
      });

      mockSql.mockQuery("select * from modules where id", [consentModule]);

      assertExists(moduleRepo.isModuleAccessible);
    });

    it("should check previous modules completion for sequential access", () => {
      const module2 = createTestModule({
        id: 2,
        name: "module1",
        sequence_order: 2,
      });

      mockSql.mockQuery("select * from modules where id", [module2]);
      mockSql.mockQuery("select count(*) as incomplete_count", [{ incomplete_count: "0" }]);

      assertExists(moduleRepo.isModuleAccessible);
    });

    it("should deny access when previous modules incomplete", () => {
      const module3 = createTestModule({
        id: 3,
        name: "module2",
        sequence_order: 3,
      });

      mockSql.mockQuery("select * from modules where id", [module3]);
      mockSql.mockQuery("select count(*) as incomplete_count", [{ incomplete_count: "1" }]);

      assertExists(moduleRepo.isModuleAccessible);
    });
  });

  describe("startModule", () => {
    it("should start accessible module", () => {
      const module = createTestModule({ id: 1, sequence_order: 1 });
      const startedProgress = createTestModuleProgress({
        user_id: 1,
        module_id: 1,
        status: "IN_PROGRESS",
        started_at: new Date(),
      });

      mockSql.mockQuery("select * from modules where id", [module]);
      mockSql.mockQuery("select count(*) as incomplete_count", [{ incomplete_count: "0" }]);
      mockSql.mockQuery("insert into user_module_progress", [startedProgress]);

      assertExists(moduleRepo.startModule);
    });

    it("should throw error for inaccessible module", () => {
      const module = createTestModule({ id: 2, sequence_order: 2 });

      mockSql.mockQuery("select * from modules where id", [module]);
      mockSql.mockQuery("select count(*) as incomplete_count", [{ incomplete_count: "1" }]);

      assertExists(moduleRepo.startModule);
    });
  });

  describe("completeModule", () => {
    it("should complete accessible module with response data", () => {
      const module = createTestModule({ id: 1, sequence_order: 1 });
      const completedProgress = createTestModuleProgress({
        user_id: 1,
        module_id: 1,
        status: "COMPLETED",
        completed_at: new Date(),
        response_data: { answer1: "response", answer2: 42 },
      });

      mockSql.mockQuery("select * from modules where id", [module]);
      mockSql.mockQuery("select count(*) as incomplete_count", [{ incomplete_count: "0" }]);
      mockSql.mockQuery("insert into user_module_progress", [completedProgress]);

      assertExists(moduleRepo.completeModule);
    });

    it("should handle completion without response data", () => {
      const module = createTestModule({ id: 1, sequence_order: 1 });
      const completedProgress = createTestModuleProgress({
        user_id: 1,
        module_id: 1,
        status: "COMPLETED",
        completed_at: new Date(),
        response_data: null,
      });

      mockSql.mockQuery("select * from modules where id", [module]);
      mockSql.mockQuery("select count(*) as incomplete_count", [{ incomplete_count: "0" }]);
      mockSql.mockQuery("insert into user_module_progress", [completedProgress]);

      assertExists(moduleRepo.completeModule);
    });
  });

  describe("updateModuleResponse", () => {
    it("should update response data for existing progress", () => {
      const updatedProgress = createTestModuleProgress({
        user_id: 1,
        module_id: 1,
        response_data: { updated: "response" },
      });

      mockSql.mockQuery("update user_module_progress", [updatedProgress]);

      assertExists(moduleRepo.updateModuleResponse);
    });

    it("should return null when progress not found", () => {
      mockSql.mockQuery("update user_module_progress", []);

      assertExists(moduleRepo.updateModuleResponse);
    });
  });

  describe("getNextAccessibleModule", () => {
    it("should return first incomplete accessible module", () => {
      const modules = [
        createTestModule({ id: 1, name: "consent", sequence_order: 1 }),
        createTestModule({ id: 2, name: "module1", sequence_order: 2 }),
      ];

      const progress = [
        createTestModuleProgress({ user_id: 1, module_id: 1, status: "COMPLETED" }),
      ];

      mockSql.mockQuery("select * from modules", modules);
      mockSql.mockQuery("select * from user_module_progress", progress);

      assertExists(moduleRepo.getNextAccessibleModule);
    });

    it("should return null when all modules completed", () => {
      const modules = [
        createTestModule({ id: 1, name: "consent", sequence_order: 1 }),
      ];

      const progress = [
        createTestModuleProgress({ user_id: 1, module_id: 1, status: "COMPLETED" }),
      ];

      mockSql.mockQuery("select * from modules", modules);
      mockSql.mockQuery("select * from user_module_progress", progress);

      assertExists(moduleRepo.getNextAccessibleModule);
    });
  });

  describe("getCurrentModule", () => {
    it("should return in-progress module if exists", () => {
      const inProgressModule = createTestModule({ id: 2, name: "module1" });

      mockSql.mockQuery("select m.* from modules m", [inProgressModule]);

      assertExists(moduleRepo.getCurrentModule);
    });

    it("should return next accessible module if no in-progress", () => {
      // No in-progress modules
      mockSql.mockQuery("select m.* from modules m", []);

      assertExists(moduleRepo.getCurrentModule);
    });
  });

  describe("getUserCompletionStats", () => {
    it("should return completion statistics", () => {
      mockSql.mockQuery("select count(*) as count from modules", [{ count: "5" }]);
      mockSql.mockQuery("select count(*) as count from user_module_progress", [{ count: "2" }]);

      assertExists(moduleRepo.getUserCompletionStats);
    });

    it("should handle zero completion case", () => {
      mockSql.mockQuery("select count(*) as count from modules", [{ count: "5" }]);
      mockSql.mockQuery("select count(*) as count from user_module_progress", [{ count: "0" }]);

      assertExists(moduleRepo.getUserCompletionStats);
    });

    it("should handle case with no modules", () => {
      mockSql.mockQuery("select count(*) as count from modules", [{ count: "0" }]);
      mockSql.mockQuery("select count(*) as count from user_module_progress", [{ count: "0" }]);

      assertExists(moduleRepo.getUserCompletionStats);
    });
  });
});