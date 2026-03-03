/**
 * ConsentService Tests
 * Unit tests for consent business logic
 */

import { restoreEnv, setupTestEnv } from "../test-config.ts";
const _envBak = setupTestEnv();

import {
  afterEach,
  assertEquals,
  assertRejects,
  beforeEach,
  createTestModule,
  createTestModuleProgress,
  describe,
  it,
  restore,
  stubMethod as stub,
} from "../test-config.ts";

const { ConsentService } = await import("../../services/consentService.ts");
const {
  auditRepository,
  consentRepository,
  consentVersionRepository,
  moduleRepository,
} = await import("../../db/index.ts");
const { ModuleService } = await import("../../services/moduleService.ts");

describe("ConsentService", () => {
  let originalEnv: Record<string, string>;

  beforeEach(() => {
    originalEnv = setupTestEnv();
  });

  afterEach(() => {
    restore();
    restoreEnv(originalEnv);
  });

  describe("getCurrentConsentVersion", () => {
    it("should return active version", async () => {
      const activeVersion = {
        id: 1,
        version: "1.0",
        title: "Consent V1",
        status: "ACTIVE",
        content_text: "Please agree",
        content_url: null,
        effective_date: new Date(),
        deprecated_date: null,
        created_at: new Date(),
      };

      stub(
        consentVersionRepository,
        "getActiveVersion",
        () => Promise.resolve(activeVersion),
      );

      const result = await ConsentService.getCurrentConsentVersion();
      assertEquals(result?.version, "1.0");
      assertEquals(result?.status, "ACTIVE");
    });

    it("should return null when no active version", async () => {
      stub(
        consentVersionRepository,
        "getActiveVersion",
        () => Promise.resolve(null),
      );

      const result = await ConsentService.getCurrentConsentVersion();
      assertEquals(result, null);
    });
  });

  describe("submitConsent", () => {
    const consentModule = createTestModule({
      id: 1,
      name: "consent",
      title: "Consent Form",
    });

    const activeVersion = {
      id: 1,
      version: "1.0",
      title: "V1",
      status: "ACTIVE" as const,
      content_text: "Agree",
      content_url: null,
      effective_date: new Date(),
      deprecated_date: null,
      created_at: new Date(),
    };

    function setupHappyPath() {
      stub(
        moduleRepository,
        "getModuleByName",
        () => Promise.resolve(consentModule),
      );
      stub(
        consentVersionRepository,
        "getActiveVersion",
        () => Promise.resolve(activeVersion),
      );
      stub(
        consentVersionRepository,
        "getVersionByName",
        () => Promise.resolve(activeVersion),
      );
      stub(
        consentRepository,
        "findByUserAndVersion",
        () => Promise.resolve(null),
      );
      stub(ModuleService, "getModuleForUser", () =>
        Promise.resolve({
          module: consentModule,
          progress: createTestModuleProgress({ status: "NOT_STARTED" }),
          accessible: true,
          isCompleted: false,
          canReview: false,
        }));
      stub(consentRepository, "createConsent", () =>
        Promise.resolve({
          id: 1,
          user_id: 1,
          version: "1.0",
          content: null,
          consented_at: new Date(),
        }));
      stub(ModuleService, "completeModule", () =>
        Promise.resolve(
          createTestModuleProgress({
            status: "COMPLETED",
            completed_at: new Date(),
          }),
        ));
      stub(auditRepository, "logConsent", () => Promise.resolve());
      stub(
        ModuleService,
        "getCurrentModule",
        () =>
          Promise.resolve(
            createTestModule({ name: "module-1", sequence_order: 2 }),
          ),
      );
    }

    it("should submit consent successfully", async () => {
      setupHappyPath();

      const result = await ConsentService.submitConsent(1, {
        responses: { agreed: true },
      });

      assertEquals(result.usedVersion, "1.0");
      assertEquals(result.consent.id, 1);
      assertEquals(result.moduleProgress.status, "COMPLETED");
      assertEquals(result.nextModule?.name, "module-1");
    });

    it("should throw when consent module not found", async () => {
      stub(
        moduleRepository,
        "getModuleByName",
        () => Promise.resolve(null),
      );

      await assertRejects(
        () =>
          ConsentService.submitConsent(1, { responses: { agreed: true } }),
        Error,
        "Consent module not found",
      );
    });

    it("should throw when no active version and none provided", async () => {
      stub(
        moduleRepository,
        "getModuleByName",
        () => Promise.resolve(consentModule),
      );
      stub(
        consentVersionRepository,
        "getActiveVersion",
        () => Promise.resolve(null),
      );

      await assertRejects(
        () =>
          ConsentService.submitConsent(1, { responses: { agreed: true } }),
        Error,
        "No active consent version available",
      );
    });

    it("should throw when version not found", async () => {
      stub(
        moduleRepository,
        "getModuleByName",
        () => Promise.resolve(consentModule),
      );
      stub(
        consentVersionRepository,
        "getVersionByName",
        () => Promise.resolve(null),
      );

      await assertRejects(
        () =>
          ConsentService.submitConsent(1, {
            version: "99.0",
            responses: { agreed: true },
          }),
        Error,
        'Consent version "99.0" not found',
      );
    });

    it("should throw when version is not active", async () => {
      const deprecatedVersion = {
        ...activeVersion,
        status: "DEPRECATED" as const,
      };

      stub(
        moduleRepository,
        "getModuleByName",
        () => Promise.resolve(consentModule),
      );
      stub(
        consentVersionRepository,
        "getVersionByName",
        () => Promise.resolve(deprecatedVersion),
      );

      await assertRejects(
        () =>
          ConsentService.submitConsent(1, {
            version: "1.0",
            responses: { agreed: true },
          }),
        Error,
        "deprecated and cannot be used",
      );
    });

    it("should throw when user already consented", async () => {
      stub(
        moduleRepository,
        "getModuleByName",
        () => Promise.resolve(consentModule),
      );
      stub(
        consentVersionRepository,
        "getActiveVersion",
        () => Promise.resolve(activeVersion),
      );
      stub(
        consentVersionRepository,
        "getVersionByName",
        () => Promise.resolve(activeVersion),
      );
      stub(consentRepository, "findByUserAndVersion", () =>
        Promise.resolve({
          id: 1,
          user_id: 1,
          version: "1.0",
          content: null,
          consented_at: new Date(),
        }));

      await assertRejects(
        () =>
          ConsentService.submitConsent(1, { responses: { agreed: true } }),
        Error,
        "User has already consented",
      );
    });

    it("should throw when consent module already completed", async () => {
      stub(
        moduleRepository,
        "getModuleByName",
        () => Promise.resolve(consentModule),
      );
      stub(
        consentVersionRepository,
        "getActiveVersion",
        () => Promise.resolve(activeVersion),
      );
      stub(
        consentVersionRepository,
        "getVersionByName",
        () => Promise.resolve(activeVersion),
      );
      stub(
        consentRepository,
        "findByUserAndVersion",
        () => Promise.resolve(null),
      );
      stub(ModuleService, "getModuleForUser", () =>
        Promise.resolve({
          module: consentModule,
          progress: createTestModuleProgress({ status: "COMPLETED" }),
          accessible: true,
          isCompleted: true,
          canReview: true,
        }));

      await assertRejects(
        () =>
          ConsentService.submitConsent(1, { responses: { agreed: true } }),
        Error,
        "Consent module is already completed",
      );
    });
  });

  describe("getConsentStatus", () => {
    it("should return status for user with consent", async () => {
      const latestConsent = {
        id: 5,
        user_id: 1,
        version: "1.0",
        content: null,
        consented_at: new Date(),
      };
      const consentModule = createTestModule({ id: 1, name: "consent" });
      const progress = createTestModuleProgress({
        status: "COMPLETED",
        completed_at: new Date(),
      });

      stub(
        consentRepository,
        "getLatestConsentByUser",
        () => Promise.resolve(latestConsent),
      );
      stub(
        moduleRepository,
        "getModuleByName",
        () => Promise.resolve(consentModule),
      );
      stub(
        moduleRepository,
        "getUserModuleProgress",
        () => Promise.resolve(progress),
      );

      const status = await ConsentService.getConsentStatus(1);
      assertEquals(status.hasConsented, true);
      assertEquals(status.latestConsent?.version, "1.0");
      assertEquals(status.consentModule.status, "COMPLETED");
    });

    it("should return status for user without consent", async () => {
      stub(
        consentRepository,
        "getLatestConsentByUser",
        () => Promise.resolve(null),
      );
      stub(
        moduleRepository,
        "getModuleByName",
        () => Promise.resolve(createTestModule({ id: 1, name: "consent" })),
      );
      stub(
        moduleRepository,
        "getUserModuleProgress",
        () => Promise.resolve(null),
      );

      const status = await ConsentService.getConsentStatus(1);
      assertEquals(status.hasConsented, false);
      assertEquals(status.latestConsent, null);
      assertEquals(status.consentModule.status, "NOT_STARTED");
    });
  });

  describe("getUserConsentHistory", () => {
    it("should delegate to consentRepository.findByUser", async () => {
      const history = [
        {
          id: 1,
          user_id: 1,
          version: "1.0",
          content: null,
          consented_at: new Date(),
        },
      ];

      stub(consentRepository, "findByUser", () => Promise.resolve(history));

      const result = await ConsentService.getUserConsentHistory(1);
      assertEquals(result.length, 1);
      assertEquals(result[0].version, "1.0");
    });
  });

  describe("hasConsentedToVersion", () => {
    it("should return true when consented", async () => {
      stub(
        consentRepository,
        "hasUserConsentedToVersion",
        () => Promise.resolve(true),
      );

      const result = await ConsentService.hasConsentedToVersion(1, "1.0");
      assertEquals(result, true);
    });

    it("should return false when not consented", async () => {
      stub(
        consentRepository,
        "hasUserConsentedToVersion",
        () => Promise.resolve(false),
      );

      const result = await ConsentService.hasConsentedToVersion(1, "1.0");
      assertEquals(result, false);
    });
  });

  describe("getConsentModuleInfo", () => {
    it("should return module info when found", async () => {
      const moduleData = {
        module: createTestModule({ name: "consent" }),
        progress: createTestModuleProgress({ status: "NOT_STARTED" }),
        accessible: true,
        isCompleted: false,
        canReview: false,
      };

      stub(
        ModuleService,
        "getModuleForUser",
        () => Promise.resolve(moduleData),
      );

      const result = await ConsentService.getConsentModuleInfo(1);
      assertEquals(result.module?.name, "consent");
      assertEquals(result.accessible, true);
      assertEquals(result.isCompleted, false);
    });

    it("should return nulls when module not found", async () => {
      stub(
        ModuleService,
        "getModuleForUser",
        () => Promise.resolve(null),
      );

      const result = await ConsentService.getConsentModuleInfo(1);
      assertEquals(result.module, null);
      assertEquals(result.progress, null);
      assertEquals(result.accessible, false);
      assertEquals(result.isCompleted, false);
    });
  });
});
