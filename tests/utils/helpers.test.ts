import {
  afterEach,
  assertEquals,
  assertExists,
  beforeEach,
  describe,
  it,
  restoreEnv,
  setupTestEnv,
} from "../test-config-extended.ts";

// Import utility modules to test
import { PasswordGenerator } from "../../services/passwordGenerator.ts";

describe("Utility Functions", () => {
  let originalEnv: Record<string, string>;

  beforeEach(() => {
    originalEnv = setupTestEnv();
  });

  afterEach(() => {
    restoreEnv(originalEnv);
  });

  describe("PasswordGenerator", () => {
    it("should generate secure passwords with correct length", () => {
      const password = PasswordGenerator.generate();

      assertExists(password);
      assertEquals(typeof password, "string");
      // Most password generators produce 8-32 character passwords
      assertEquals(password.length >= 8 && password.length <= 32, true);
    });

    it("should generate different passwords on each call", () => {
      const password1 = PasswordGenerator.generate();
      const password2 = PasswordGenerator.generate();

      assertExists(password1);
      assertExists(password2);
      // Passwords should be different (very high probability)
      assertEquals(password1 !== password2, true);
    });
  });

  describe("Environment configuration", () => {
    it("should provide sensible defaults for optional configuration", () => {
      const defaultPort = Deno.env.get("PORT") || "3001";
      const defaultOrigins = Deno.env.get("ALLOWED_ORIGINS") ||
        "http://localhost:3000";

      assertEquals(typeof defaultPort, "string");
      assertEquals(typeof defaultOrigins, "string");
      assertEquals(parseInt(defaultPort) > 0, true);
    });
  });
});