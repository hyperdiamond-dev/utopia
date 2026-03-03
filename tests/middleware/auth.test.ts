/**
 * Auth Middleware Tests
 * Unit tests for JWT authentication middleware
 */

import { restoreEnv, setupTestEnv } from "../test-config.ts";
const _envBak = setupTestEnv();

import {
  afterEach,
  assertEquals,
  assertExists,
  beforeEach,
  describe,
  initTestJwt,
  it,
  restore,
  TEST_JWT_SECRET,
} from "../test-config.ts";

import { Hono } from "hono";

const { authMiddleware } = await import("../../middleware/auth.ts");

await initTestJwt();

// deno-lint-ignore no-explicit-any
const jwt = (globalThis as any).__testJwt;

// deno-lint-ignore no-explicit-any
function createApp(): any {
  const app = new Hono();
  app.use("/protected/*", authMiddleware);
  // deno-lint-ignore no-explicit-any
  app.get("/protected/test", (c: any) => {
    const user = c.get("user");
    return c.json({ user });
  });
  return app;
}

async function makeRequest(
  // deno-lint-ignore no-explicit-any
  app: any,
  token?: string | null,
): Promise<Response> {
  const headers: Record<string, string> = {};
  if (token !== undefined && token !== null) {
    headers["Authorization"] = `Bearer ${token}`;
  }

  return await app.request(
    new Request("http://localhost/protected/test", { headers }),
  );
}

describe("Auth Middleware", () => {
  // deno-lint-ignore no-explicit-any
  let app: any;
  let originalEnv: Record<string, string>;

  beforeEach(() => {
    originalEnv = setupTestEnv();
    app = createApp();
  });

  afterEach(() => {
    restore();
    restoreEnv(originalEnv);
  });

  it("should pass through with valid JWT and set user context", async () => {
    const token = jwt.sign(
      {
        uuid: "user_abc-123",
        friendlyAlias: "BraveTiger",
        firebaseUid: "fb-uid-123",
      },
      TEST_JWT_SECRET,
      { expiresIn: "1h" },
    );

    const res = await makeRequest(app, token);

    assertEquals(res.status, 200);
    const body = await res.json();
    assertExists(body.user);
    assertEquals(body.user.uuid, "user_abc-123");
    assertEquals(body.user.friendlyAlias, "BraveTiger");
    assertEquals(body.user.firebaseUid, "fb-uid-123");
  });

  it("should return 401 when no Authorization header", async () => {
    const res = await makeRequest(app);

    assertEquals(res.status, 401);
    const body = await res.json();
    assertEquals(body.error, "No token provided");
  });

  it("should return 401 for invalid token", async () => {
    const res = await makeRequest(app, "not-a-valid-jwt");

    assertEquals(res.status, 401);
    const body = await res.json();
    assertEquals(body.error, "Invalid token");
  });

  it("should return 401 for expired JWT", async () => {
    const token = jwt.sign(
      {
        uuid: "user_abc-123",
        friendlyAlias: "BraveTiger",
        firebaseUid: "fb-uid-123",
      },
      TEST_JWT_SECRET,
      { expiresIn: "-1s" },
    );

    const res = await makeRequest(app, token);

    assertEquals(res.status, 401);
    const body = await res.json();
    assertEquals(body.error, "Invalid token");
  });

  it("should return 401 for JWT signed with wrong secret", async () => {
    const token = jwt.sign(
      {
        uuid: "user_abc-123",
        friendlyAlias: "BraveTiger",
        firebaseUid: "fb-uid-123",
      },
      "wrong-secret-key",
      { expiresIn: "1h" },
    );

    const res = await makeRequest(app, token);

    assertEquals(res.status, 401);
    const body = await res.json();
    assertEquals(body.error, "Invalid token");
  });

  it("should return 401 for empty Bearer token", async () => {
    // "Bearer " with replace("Bearer ", "") leaves " " (space), which is truthy
    // so it goes to jwt.verify and fails as invalid
    const res = await makeRequest(app, "");

    assertEquals(res.status, 401);
    const body = await res.json();
    assertEquals(body.error, "Invalid token");
  });
});
