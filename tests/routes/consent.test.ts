/**
 * Consent Routes Tests
 * Integration-style tests for consent API endpoints using Hono's app.request()
 */

import { restoreEnv, setupTestEnv } from "../test-config.ts";
const _envBak = setupTestEnv();

import {
  afterEach,
  assertEquals,
  assertExists,
  beforeEach,
  createSignedTestJWT,
  createTestModule,
  createTestModuleProgress,
  createTestUser,
  describe,
  initTestJwt,
  it,
  restore,
  stubMethod as stub,
} from "../test-config.ts";

import { Hono } from "hono";

const { consent } = await import("../../routes/consent.ts");
const { consentVersionRepository, userRepository } = await import(
  "../../db/index.ts"
);
const { ConsentService } = await import("../../services/consentService.ts");

await initTestJwt();

async function makeRequest(
  app: Hono,
  method: string,
  path: string,
  options: { token?: string; body?: unknown } = {},
): Promise<Response> {
  const headers: Record<string, string> = {};
  if (options.token) headers["Authorization"] = `Bearer ${options.token}`;
  if (options.body) headers["Content-Type"] = "application/json";

  return await app.request(
    new Request(`http://localhost${path}`, {
      method,
      headers,
      body: options.body ? JSON.stringify(options.body) : undefined,
    }),
  );
}

describe("Consent Routes", () => {
  let app: Hono;
  let originalEnv: Record<string, string>;
  let validToken: string;

  beforeEach(() => {
    originalEnv = setupTestEnv();
    app = new Hono();
    app.route("/consent", consent);
    validToken = createSignedTestJWT();
  });

  afterEach(() => {
    restore();
    restoreEnv(originalEnv);
  });

  describe("POST /consent", () => {
    it("should submit consent successfully", async () => {
      const testUser = createTestUser({ id: 1, uuid: "user_test-uuid" });
      const consentResult = {
        consent: { id: 10, consented_at: new Date() },
        moduleProgress: createTestModuleProgress({
          status: "COMPLETED",
          completed_at: new Date(),
        }),
        nextModule: createTestModule({
          name: "module-1",
          title: "Module 1",
          sequence_order: 2,
        }),
        usedVersion: "1.0",
      };

      stub(userRepository, "findByUuid", () => Promise.resolve(testUser));
      stub(
        ConsentService,
        "submitConsent",
        () => Promise.resolve(consentResult),
      );

      const res = await makeRequest(app, "POST", "/consent", {
        token: validToken,
        body: { responses: { agreed: true } },
      });

      assertEquals(res.status, 201);
      const body = await res.json();
      assertEquals(body.message, "Consent submitted successfully");
      assertExists(body.consent);
      assertEquals(body.consent.version, "1.0");
      assertExists(body.next_module);
      assertEquals(body.next_module.name, "module-1");
    });

    it("should return 401 without token", async () => {
      const res = await makeRequest(app, "POST", "/consent", {
        body: { responses: { agreed: true } },
      });

      assertEquals(res.status, 401);
    });

    it("should return 404 when user not found", async () => {
      stub(userRepository, "findByUuid", () => Promise.resolve(null));

      const res = await makeRequest(app, "POST", "/consent", {
        token: validToken,
        body: { responses: { agreed: true } },
      });

      assertEquals(res.status, 404);
      const body = await res.json();
      assertEquals(body.error, "User not found");
    });

    it("should return 400 for invalid body", async () => {
      const testUser = createTestUser({ id: 1, uuid: "user_test-uuid" });
      stub(userRepository, "findByUuid", () => Promise.resolve(testUser));

      const res = await makeRequest(app, "POST", "/consent", {
        token: validToken,
        body: { invalid: "data" },
      });

      assertEquals(res.status, 400);
      const body = await res.json();
      assertEquals(body.error, "Invalid consent submission");
      assertExists(body.details);
    });

    it("should return 500 when service throws", async () => {
      const testUser = createTestUser({ id: 1, uuid: "user_test-uuid" });
      stub(userRepository, "findByUuid", () => Promise.resolve(testUser));
      stub(
        ConsentService,
        "submitConsent",
        () => Promise.reject(new Error("User has already consented")),
      );

      const res = await makeRequest(app, "POST", "/consent", {
        token: validToken,
        body: { responses: { agreed: true } },
      });

      assertEquals(res.status, 500);
      const body = await res.json();
      assertEquals(body.error, "User has already consented");
    });
  });

  describe("GET /consent/status", () => {
    it("should return consent status for authenticated user", async () => {
      const testUser = createTestUser({ id: 1, uuid: "user_test-uuid" });
      const status = {
        hasConsented: true,
        latestConsent: {
          id: 5,
          version: "1.0",
          consented_at: new Date(),
        },
        consentModule: {
          status: "COMPLETED" as const,
          progress: createTestModuleProgress({
            status: "COMPLETED",
            completed_at: new Date(),
          }),
        },
      };

      stub(userRepository, "findByUuid", () => Promise.resolve(testUser));
      stub(ConsentService, "getConsentStatus", () => Promise.resolve(status));

      const res = await makeRequest(app, "GET", "/consent/status", {
        token: validToken,
      });

      assertEquals(res.status, 200);
      const body = await res.json();
      assertEquals(body.has_consented, true);
      assertExists(body.latest_consent);
      assertEquals(body.latest_consent.version, "1.0");
      assertEquals(body.consent_module.status, "COMPLETED");
    });

    it("should return 401 without token", async () => {
      const res = await makeRequest(app, "GET", "/consent/status");
      assertEquals(res.status, 401);
    });

    it("should return 404 when user not found", async () => {
      stub(userRepository, "findByUuid", () => Promise.resolve(null));

      const res = await makeRequest(app, "GET", "/consent/status", {
        token: validToken,
      });

      assertEquals(res.status, 404);
    });
  });

  describe("GET /consent/history", () => {
    it("should return consent history", async () => {
      const testUser = createTestUser({ id: 1, uuid: "user_test-uuid" });
      const history = [
        { id: 1, version: "1.0", consented_at: new Date() },
      ];

      stub(userRepository, "findByUuid", () => Promise.resolve(testUser));
      stub(
        ConsentService,
        "getUserConsentHistory",
        () => Promise.resolve(history),
      );

      const res = await makeRequest(app, "GET", "/consent/history", {
        token: validToken,
      });

      assertEquals(res.status, 200);
      const body = await res.json();
      assertExists(body.consents);
      assertEquals(body.total_count, 1);
    });

    it("should return 404 when user not found", async () => {
      stub(userRepository, "findByUuid", () => Promise.resolve(null));

      const res = await makeRequest(app, "GET", "/consent/history", {
        token: validToken,
      });

      assertEquals(res.status, 404);
    });
  });

  describe("GET /consent/module", () => {
    it("should return consent module info", async () => {
      const testUser = createTestUser({ id: 1, uuid: "user_test-uuid" });
      const moduleInfo = {
        module: createTestModule({ name: "consent", title: "Consent Form" }),
        progress: createTestModuleProgress({ status: "NOT_STARTED" }),
        accessible: true,
        isCompleted: false,
      };

      stub(userRepository, "findByUuid", () => Promise.resolve(testUser));
      stub(
        ConsentService,
        "getConsentModuleInfo",
        () => Promise.resolve(moduleInfo),
      );

      const res = await makeRequest(app, "GET", "/consent/module", {
        token: validToken,
      });

      assertEquals(res.status, 200);
      const body = await res.json();
      assertExists(body.module);
      assertEquals(body.module.name, "consent");
      assertEquals(body.accessible, true);
      assertEquals(body.is_completed, false);
    });

    it("should return 404 when consent module not found", async () => {
      const testUser = createTestUser({ id: 1, uuid: "user_test-uuid" });
      const moduleInfo = {
        module: null,
        progress: null,
        accessible: false,
        isCompleted: false,
      };

      stub(userRepository, "findByUuid", () => Promise.resolve(testUser));
      stub(
        ConsentService,
        "getConsentModuleInfo",
        () => Promise.resolve(moduleInfo),
      );

      const res = await makeRequest(app, "GET", "/consent/module", {
        token: validToken,
      });

      assertEquals(res.status, 404);
      const body = await res.json();
      assertEquals(body.error, "Consent module not found");
    });
  });

  describe("GET /consent/version/current", () => {
    it("should return current version without auth", async () => {
      const version = {
        version: "1.0",
        title: "Informed Consent",
        content_text: "Please read and agree...",
        content_url: null,
        effective_date: new Date(),
      };

      stub(
        ConsentService,
        "getCurrentConsentVersion",
        () => Promise.resolve(version),
      );

      const res = await makeRequest(
        app,
        "GET",
        "/consent/version/current",
      );

      assertEquals(res.status, 200);
      const body = await res.json();
      assertEquals(body.version, "1.0");
      assertEquals(body.title, "Informed Consent");
    });

    it("should return 404 when no active version", async () => {
      stub(
        ConsentService,
        "getCurrentConsentVersion",
        () => Promise.resolve(null),
      );

      const res = await makeRequest(
        app,
        "GET",
        "/consent/version/current",
      );

      assertEquals(res.status, 404);
      const body = await res.json();
      assertEquals(body.error, "No active consent version available");
    });
  });

  describe("GET /consent/version/all", () => {
    it("should return all versions for authenticated user", async () => {
      const versions = [
        {
          version: "1.0",
          title: "V1",
          status: "ACTIVE",
          effective_date: new Date(),
          deprecated_date: null,
          created_at: new Date(),
        },
      ];

      stub(
        consentVersionRepository,
        "getAllVersions",
        () => Promise.resolve(versions),
      );

      const res = await makeRequest(app, "GET", "/consent/version/all", {
        token: validToken,
      });

      assertEquals(res.status, 200);
      const body = await res.json();
      assertExists(body.versions);
      assertEquals(body.total_count, 1);
    });

    it("should return 401 without token", async () => {
      const res = await makeRequest(app, "GET", "/consent/version/all");
      assertEquals(res.status, 401);
    });
  });

  describe("GET /consent/version/:version", () => {
    it("should return specific version details", async () => {
      const version = {
        version: "1.0",
        title: "V1",
        content_text: "Consent text here",
        content_url: null,
        status: "ACTIVE",
        effective_date: new Date(),
        deprecated_date: null,
      };

      stub(
        consentVersionRepository,
        "getVersionByName",
        () => Promise.resolve(version),
      );

      const res = await makeRequest(app, "GET", "/consent/version/1.0");

      assertEquals(res.status, 200);
      const body = await res.json();
      assertEquals(body.version, "1.0");
      assertEquals(body.status, "ACTIVE");
    });

    it("should return 404 for unknown version", async () => {
      stub(
        consentVersionRepository,
        "getVersionByName",
        () => Promise.resolve(null),
      );

      const res = await makeRequest(
        app,
        "GET",
        "/consent/version/nonexistent",
      );

      assertEquals(res.status, 404);
      const body = await res.json();
      assertEquals(body.error, "Consent version not found");
    });
  });
});
