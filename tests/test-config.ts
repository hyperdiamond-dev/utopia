// Test configuration and utilities
import { assertEquals, assertExists, assertRejects, assertThrows } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { describe, it, beforeEach, afterEach, beforeAll, afterAll } from "https://deno.land/std@0.224.0/testing/bdd.ts";
import { spy, stub, restore } from "https://deno.land/std@0.224.0/testing/mock.ts";

// Re-export testing utilities for convenience
export {
  assertEquals,
  assertExists,
  assertRejects,
  assertThrows,
  describe,
  it,
  beforeEach,
  afterEach,
  beforeAll,
  afterAll,
  spy,
  stub,
  restore,
};

// Test database configuration
export const TEST_DATABASE_URL = "postgresql://test:test@localhost:5432/test_utopia";

// Mock environment variables for testing
export function setupTestEnv() {
  const originalEnv = { ...Deno.env.toObject() };

  // Set test environment variables
  Deno.env.set("DATABASE_URL", TEST_DATABASE_URL);
  Deno.env.set("JWT_SECRET", "test-jwt-secret-key-for-testing-only");
  Deno.env.set("FIREBASE_PROJECT_ID", "test-project");
  Deno.env.set("FIREBASE_CLIENT_EMAIL", "test@test.com");
  Deno.env.set("FIREBASE_PRIVATE_KEY", "test-key");
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
  private queries: Array<{ query: string; params: unknown[]; result: unknown }> = [];

  query(query: string, ..._params: unknown[]) {
    const mockResult = this.queries.find(q =>
      q.query.includes(query.toLowerCase()) ||
      query.toLowerCase().includes(q.query.toLowerCase())
    );

    return mockResult ? mockResult.result : [];
  }

  // Template literal function to match SQL template usage
  __call__(strings: TemplateStringsArray, ...values: unknown[]) {
    const query = strings.join('');
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

// Helper to create test users
export function createTestUser(overrides: Partial<Record<string, unknown>> = {}) {
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
export function createTestModule(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    id: 1,
    name: "test-module",
    title: "Test Module",
    description: "A test module",
    sequence_order: 1,
    is_active: true,
    created_at: new Date(),
    updated_at: new Date(),
    ...overrides,
  };
}

// Helper to create test module progress
export function createTestModuleProgress(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    id: 1,
    user_id: 1,
    module_id: 1,
    status: "NOT_STARTED",
    started_at: null,
    completed_at: null,
    response_data: null,
    created_at: new Date(),
    updated_at: new Date(),
    ...overrides,
  };
}

// Helper to create JWT tokens for testing
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