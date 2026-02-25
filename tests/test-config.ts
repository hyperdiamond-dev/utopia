// Test configuration and utilities
import {
  assertEquals,
  assertExists,
  assertRejects,
  assertThrows,
} from "@std/assert";
import {
  afterAll,
  afterEach,
  beforeAll,
  beforeEach,
  describe,
  it,
} from "@std/testing/bdd";
import { restore, spy, stub } from "@std/testing/mock";

// Re-export testing utilities for convenience
export {
  afterAll,
  afterEach,
  assertEquals,
  assertExists,
  assertRejects,
  assertThrows,
  beforeAll,
  beforeEach,
  describe,
  it,
  restore,
  spy,
  stub,
};

// Test database configuration
export const TEST_DATABASE_URL =
  "postgresql://test:test@localhost:5432/test_utopia";

// Real RSA private key generated for testing only — not used for any real service
const TEST_FIREBASE_PRIVATE_KEY = `-----BEGIN PRIVATE KEY-----
MIIEvgIBADANBgkqhkiG9w0BAQEFAASCBKgwggSkAgEAAoIBAQCcpdEi/yt8OMUJ
fKiQTIs+609LH0sFkT34ZC0r3XdoOPaf+UNkVk3o3mKvuIgm/wzPTdkM9NuGURxq
nOGVDKeE6x8r7cyDr1BZ6rPPO+BFrSjheXAe8K1jj/fYC07uck0gBpxdFVL42w1/
/po/Qxq8OqpJ/4y68o6bnWHxtBe04xVeFh+i+09OraI0ANFWFd/N2wxSnU1QgDhN
SNfW9zmXh20nO5TE2AlZMnY5Ri+m2ZRxwCg+ZR8Wvw5ebnVaCRT3nlbv2VMK3KuP
nbS68l7uuJo3/DmecWf98o8JTlwZGVXzwLME8npoLpsl8lEzLrX+NDWXbl7rRvWa
7arp7kYvAgMBAAECggEAF4nzO0cMycXeFebdjZFy+ylw6ODy7Qs+PK0Q/J5y6v5k
UPWr4s/1NSD1w2H/U5zP1/bivseslSprErowS61zHs4WCQvax474jApwqptcwBud
IQSWjI+t/mAL5jMM0VfrrvxPUs15gluoU6t2kjsLMW2/WQ9FnnIEa+3iYeemCFA7
BE92D1T6pzjUvyTwUOgaekqyUuZzRSXmfXbBpaFLMDzRWO6pjIV4xCYHXR0ck2PE
djXMbfFpCgi65SydQgWxs4oYBSyQIlkNoMDsGqHI3CFljLkJv5uObRaspKNyIAGu
/iy+qBRH3YBF3qbXENoQfk0semHTzf0Ssed9FBKcAQKBgQDUUYJ2TNMlya9WAY4e
I0I0kJfF7S1YJVCfDR6GMZpcaeylHpC8jpE8S6ZVihzQRboy30Cjp+FEVYa6Ly0L
hkQ9arKQsGsU2V4+R3O79YuhqkLzNLP0hL3slTPNu84BEyJtHEPTju+WiN7UjZyg
WozKG/6GNG0lwJi5NynY8rJnwQKBgQC84Dd5HvfdFq72GhKi01ygki8w1K0lUnXL
fWCer3n1DclSzWXx6pquBkzQ9BactwBmGJL/ZUjR7k00a8jw1FDpMfGBOUfXEq9M
YIh3vi11kzfYI/gJZhfFN/Mdwl+HpSni0IclNeIIopVa5jKaz3PtVHDhuY+ECZeM
5a8M7yGp7wKBgQC1hnrkagqc5DLkda/sVHjmODmLH50FH+IuGile0koHeQi6o8db
bwj9ZDByMgMwjm0D0ZyST5ZptjXaOTtp/wGZAQBqdGsZCD9rP+vTZ7xaHBfhl83D
4ToAbBA+dbNLd/CXGPNkjXCKY7sgP3MKJmD467ZRR8GJ5YCt2lwNAHNIAQKBgQCO
5Zgyo/JlK9c9TKaS2BR5S4A2koFY/lUumnHyPNKpSz/ozIt3hsZ2KUAOys0czfuY
QrlcTpXUdlWk9nM1eXypoWaVHPA0UOedgl9dMN4V2Ubj2Pq8qagMRvNBraA28QeK
mbfVuDmFzPPwrL7Wj2OmyD8LGCfzfopRSCizQWyXswKBgEaJECXjqSgw5ilq/Rpw
s8OuwWv482VJNbhYigw24ddGRTDxKpVTagejFtm4My6Xh+yMUXL5m7Z4h+dKHBMR
dQ6SXcH7h+8rh6fu+FSgElPCDt2t7vWsYmeUmRjfFdFOa6zkPikWp2aoWOYDserH
eB5mugL2zPoF2lN7LAP1rLUh
-----END PRIVATE KEY-----`;

// Mock environment variables for testing
export function setupTestEnv() {
  const originalEnv = { ...Deno.env.toObject() };

  // Set test environment variables
  Deno.env.set("DATABASE_URL", TEST_DATABASE_URL);
  Deno.env.set("JWT_SECRET", "test-jwt-secret-key-for-testing-only");
  Deno.env.set("FIREBASE_PROJECT_ID", "test-project");
  Deno.env.set("FIREBASE_CLIENT_EMAIL", "test@test.com");
  Deno.env.set("FIREBASE_PRIVATE_KEY", TEST_FIREBASE_PRIVATE_KEY);
  Deno.env.set("ALLOWED_ORIGINS", "http://localhost:3000");

  return originalEnv;
}

export function restoreEnv(originalEnv: Record<string, string>) {
  // Clear test env vars and restore original ones
  for (const key of Object.keys(Deno.env.toObject())) {
    if (originalEnv[key]) {
      Deno.env.set(key, originalEnv[key]);
    } else {
      Deno.env.delete(key);
    }
  }
}

// Mock SQL client for testing
export class MockSqlClient {
  private queries: Array<
    { query: string; params: unknown[]; result: unknown }
  > = [];

  query(query: string, ..._params: unknown[]) {
    const mockResult = this.queries.find((q) =>
      q.query.includes(query.toLowerCase()) ||
      query.toLowerCase().includes(q.query.toLowerCase())
    );

    return mockResult ? mockResult.result : [];
  }

  // Template literal function to match SQL template usage
  __call__(strings: TemplateStringsArray, ...values: unknown[]) {
    const query = strings.join("");
    return this.query(query, ...values);
  }

  // Add expected query results for testing
  mockQuery(query: string, result: unknown, params: unknown[] = []) {
    this.queries.push({ query: query.toLowerCase(), params, result });
  }

  // Clear all mocked queries
  clearMocks() {
    this.queries = [];
  }

  // Get all executed queries for verification
  getExecutedQueries() {
    return [...this.queries];
  }
}

import type { User } from "../db/users.ts";
import type {
  Module,
  ModuleStatus,
  UserModuleProgress,
} from "../db/modules.ts";

// Helper to create test users
export function createTestUser(
  overrides: Partial<User> = {},
): User {
  return {
    id: 1,
    uuid: "user_test-uuid",
    alias: "TestUser",
    status: "ACTIVE",
    created_at: new Date(),
    last_login: null,
    active_module: null,
    ...overrides,
  };
}

// Helper to create test modules
export function createTestModule(
  overrides: Partial<Module> = {},
): Module {
  return {
    id: 1,
    name: "test-module",
    title: "Test Module",
    description: "A test module",
    sequence_order: 1,
    is_active: true,
    requires_all_submodules: false,
    allows_branching: false,
    created_at: new Date(),
    updated_at: new Date(),
    ...overrides,
  };
}

// Helper to create test module progress
export function createTestModuleProgress(
  overrides: Partial<UserModuleProgress> = {},
): UserModuleProgress {
  return {
    id: 1,
    user_id: 1,
    module_id: 1,
    status: "NOT_STARTED" as ModuleStatus,
    started_at: null,
    completed_at: null,
    response_data: null,
    created_at: new Date(),
    updated_at: new Date(),
    ...overrides,
  };
}

// Type-safe stub wrapper that bypasses strict return type checking
// deno-lint-ignore no-explicit-any
export function stubMethod<T extends Record<string, any>>(
  obj: T,
  method: keyof T & string,
  // deno-lint-ignore no-explicit-any
  fn: (...args: any[]) => any,
) {
  // deno-lint-ignore no-explicit-any
  return stub(obj as any, method, fn as any);
}

// Helper to create fake JWT tokens for testing (not verifiable)
export function createTestJWT(payload: Record<string, unknown> = {}) {
  const header = btoa(JSON.stringify({ alg: "HS256", typ: "JWT" }));
  const testPayload = btoa(JSON.stringify({
    uuid: "user_test-uuid",
    friendlyAlias: "TestUser",
    firebaseUid: "test-firebase-uid",
    exp: Math.floor(Date.now() / 1000) + 3600, // 1 hour from now
    ...payload,
  }));
  const signature = "test-signature";

  return `${header}.${testPayload}.${signature}`;
}

// JWT secret used in test environment
export const TEST_JWT_SECRET = "test-jwt-secret-key-for-testing-only";

// Helper to create real signed JWT tokens for route tests
export function createSignedTestJWT(
  payload: Record<string, unknown> = {},
): string {
  // Use dynamic import to avoid issues at module load
  // deno-lint-ignore no-explicit-any
  const jwt = (globalThis as any).__testJwt;
  if (!jwt) {
    throw new Error(
      "Call initTestJwt() before using createSignedTestJWT",
    );
  }
  return jwt.sign(
    {
      uuid: "user_test-uuid",
      id: "user_test-uuid", // moduleAccessMiddleware uses user.id for findByUuid
      friendlyAlias: "TestUser",
      firebaseUid: "test-firebase-uid",
      ...payload,
    },
    TEST_JWT_SECRET,
    { expiresIn: "1h" },
  );
}

// Initialize jwt for test signing (call once at top of route test files)
export async function initTestJwt() {
  const jwt = await import("jsonwebtoken");
  // deno-lint-ignore no-explicit-any
  (globalThis as any).__testJwt = jwt.default;
}

// HTTP testing helpers
export async function createTestApp() {
  // Dynamic import to avoid circular dependencies during testing
  const { Hono } = await import("hono");
  return new Hono();
}

// Database testing helpers
export function setupTestDatabase() {
  // This would typically set up a test database
  // For now, we'll use mocks
  console.log("Setting up test database...");
}

export function teardownTestDatabase() {
  // This would typically clean up the test database
  console.log("Tearing down test database...");
}
