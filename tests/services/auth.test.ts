/**
 * Auth Service Tests
 * Tests for UserService: user creation, authentication, and password management
 * Stubs Firebase auth, bcrypt, repositories, and helper classes
 */

// Set env BEFORE any service imports (Firebase initializes at import time)
import {
  setupTestEnv,
  restoreEnv,
} from "../test-config.ts";
const _originalEnv = setupTestEnv();

import {
  afterEach,
  assertEquals,
  assertExists,
  assertRejects,
  beforeEach,
  describe,
  it,
  restore,
  stubMethod as stub,
} from "../test-config.ts";

// Dynamic imports — must come AFTER setupTestEnv() so DATABASE_URL and Firebase env vars are set
const { UserService } = await import("../../services/userService.ts");
const { userRepository } = await import("../../db/index.ts");
const { ModuleService } = await import("../../services/moduleService.ts");
const { AliasGenerator } = await import("../../services/aliasGenerator.ts");
const { PasswordGenerator } = await import("../../services/passwordGenerator.ts");

// Import firebase auth and bcrypt for stubbing
// deno-lint-ignore no-explicit-any
let auth: any;
// deno-lint-ignore no-explicit-any
let bcrypt: any;

try {
  const firebaseModule = await import("../../config/firebase.ts");
  auth = firebaseModule.auth;
} catch {
  // Firebase may fail to init in test -- create a dummy object to stub
  auth = {
    createUser: () => Promise.resolve({ uid: "" }),
    setCustomUserClaims: () => Promise.resolve(),
    listUsers: () => Promise.resolve({ users: [] }),
    getUser: () => Promise.resolve({ uid: "", customClaims: {} }),
    updateUser: () => Promise.resolve({}),
  };
}

const bcryptModule = await import("bcryptjs");
bcrypt = bcryptModule.default;

describe("UserService", () => {
  let envBackup: Record<string, string>;

  beforeEach(() => {
    envBackup = setupTestEnv();
  });

  afterEach(() => {
    restore();
    restoreEnv(envBackup);
  });

  describe("createAnonymousUser", () => {
    it("should create user with all dependencies and return credentials", async () => {
      const testUuid = "test-uuid-12345";

      stub(AliasGenerator, "generateUnique", () => Promise.resolve("BraveTiger42"));
      stub(PasswordGenerator, "generate", () => "SecurePass123");
      stub(bcrypt, "hash", () => Promise.resolve("$2a$12$hashedpassword"));
      const fbCreateStub = stub(auth, "createUser", () =>
        Promise.resolve({ uid: testUuid })
      );
      const fbClaimsStub = stub(auth, "setCustomUserClaims", () => Promise.resolve());
      const dbCreateStub = stub(userRepository, "createUser", () =>
        Promise.resolve({
          id: 1,
          uuid: testUuid,
          alias: "BraveTiger42",
          status: "ACTIVE",
          created_at: new Date(),
        })
      );
      const initStub = stub(ModuleService, "initializeUserModules", () => Promise.resolve());

      const result = await UserService.createAnonymousUser();

      assertEquals(result.friendlyAlias, "BraveTiger42");
      assertEquals(result.password, "SecurePass123");
      assertExists(result.uuid);

      // Verify Firebase user created
      assertEquals(fbCreateStub.calls.length, 1);
      assertEquals(
        (fbCreateStub.calls[0].args[0] as Record<string, unknown>).disabled,
        false,
      );

      // Verify custom claims set
      assertEquals(fbClaimsStub.calls.length, 1);
      const claims = fbClaimsStub.calls[0].args[1] as Record<string, unknown>;
      assertEquals(claims.isAnonymous, true);
      assertEquals(claims.friendlyAlias, "BraveTiger42");
      assertExists(claims.password);
      assertExists(claims.createdAt);
      assertExists(claims.expiresAt);

      // Verify DB user created
      assertEquals(dbCreateStub.calls.length, 1);
      assertEquals(dbCreateStub.calls[0].args[0], "BraveTiger42");
      assertEquals(dbCreateStub.calls[0].args[2], "ACTIVE");

      // Verify modules initialized
      assertEquals(initStub.calls.length, 1);
      assertEquals(initStub.calls[0].args[0], 1); // dbUser.id
    });

    it("should still succeed when module initialization fails", async () => {
      stub(AliasGenerator, "generateUnique", () => Promise.resolve("SwiftEagle99"));
      stub(PasswordGenerator, "generate", () => "TestPass456");
      stub(bcrypt, "hash", () => Promise.resolve("$2a$12$hashed"));
      stub(auth, "createUser", () => Promise.resolve({ uid: "uuid-123" }));
      stub(auth, "setCustomUserClaims", () => Promise.resolve());
      stub(userRepository, "createUser", () =>
        Promise.resolve({ id: 2, uuid: "uuid-123", alias: "SwiftEagle99", status: "ACTIVE", created_at: new Date() })
      );
      stub(ModuleService, "initializeUserModules", () =>
        Promise.reject(new Error("DB connection failed"))
      );

      const result = await UserService.createAnonymousUser();

      // Should still return credentials despite init failure
      assertEquals(result.friendlyAlias, "SwiftEagle99");
      assertEquals(result.password, "TestPass456");
    });

    it("should propagate Firebase createUser errors", async () => {
      stub(AliasGenerator, "generateUnique", () => Promise.resolve("TestAlias1"));
      stub(PasswordGenerator, "generate", () => "TestPass789");
      stub(bcrypt, "hash", () => Promise.resolve("$2a$12$hashed"));
      stub(auth, "createUser", () =>
        Promise.reject(new Error("Firebase unavailable"))
      );

      await assertRejects(
        () => UserService.createAnonymousUser(),
        Error,
        "Firebase unavailable",
      );
    });
  });

  describe("authenticateUser", () => {
    it("should authenticate valid user with correct password", async () => {
      const futureDate = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString();
      const pastDate = new Date(Date.now() - 1000).toISOString();

      stub(auth, "listUsers", () =>
        Promise.resolve({
          users: [
            {
              uid: "user-uid-1",
              customClaims: {
                friendlyAlias: "BraveTiger42",
                password: "$2a$12$hashedpassword",
                createdAt: pastDate,
                expiresAt: futureDate,
              },
            },
          ],
        })
      );
      stub(bcrypt, "compare", () => Promise.resolve(true));

      const result = await UserService.authenticateUser("BraveTiger42", "correct-password");

      assertExists(result);
      assertEquals(result!.uuid, "user-uid-1");
      assertEquals(result!.friendlyAlias, "BraveTiger42");
      assertEquals(result!.firebaseUid, "user-uid-1");
    });

    it("should return null when user not found", async () => {
      stub(auth, "listUsers", () =>
        Promise.resolve({ users: [] })
      );

      const result = await UserService.authenticateUser("NonexistentUser", "password");

      assertEquals(result, null);
    });

    it("should return null when password is incorrect", async () => {
      const futureDate = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString();

      stub(auth, "listUsers", () =>
        Promise.resolve({
          users: [
            {
              uid: "user-uid-1",
              customClaims: {
                friendlyAlias: "BraveTiger42",
                password: "$2a$12$hashedpassword",
                createdAt: new Date().toISOString(),
                expiresAt: futureDate,
              },
            },
          ],
        })
      );
      stub(bcrypt, "compare", () => Promise.resolve(false));

      const result = await UserService.authenticateUser("BraveTiger42", "wrong-password");

      assertEquals(result, null);
    });

    it("should return null and disable expired accounts", async () => {
      const expiredDate = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();

      stub(auth, "listUsers", () =>
        Promise.resolve({
          users: [
            {
              uid: "expired-uid",
              customClaims: {
                friendlyAlias: "ExpiredUser",
                password: "$2a$12$hashed",
                createdAt: new Date(Date.now() - 31 * 24 * 60 * 60 * 1000).toISOString(),
                expiresAt: expiredDate,
              },
            },
          ],
        })
      );
      const updateStub = stub(auth, "updateUser", () => Promise.resolve({}));

      const result = await UserService.authenticateUser("ExpiredUser", "password");

      assertEquals(result, null);
      assertEquals(updateStub.calls.length, 1);
      assertEquals(updateStub.calls[0].args[0], "expired-uid");
      assertEquals(
        (updateStub.calls[0].args[1] as Record<string, unknown>).disabled,
        true,
      );
    });

    it("should return null when Firebase throws an error", async () => {
      stub(auth, "listUsers", () =>
        Promise.reject(new Error("Firebase connection error"))
      );

      const result = await UserService.authenticateUser("AnyUser", "password");

      assertEquals(result, null);
    });
  });

  describe("updatePassword", () => {
    it("should update password successfully", async () => {
      const futureDate = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString();

      stub(auth, "getUser", () =>
        Promise.resolve({
          uid: "user-uid-1",
          customClaims: {
            friendlyAlias: "TestUser",
            password: "$2a$12$oldhash",
            createdAt: new Date().toISOString(),
            expiresAt: futureDate,
          },
        })
      );
      stub(bcrypt, "compare", () => Promise.resolve(true));
      stub(bcrypt, "hash", () => Promise.resolve("$2a$12$newhash"));
      const claimsStub = stub(auth, "setCustomUserClaims", () => Promise.resolve());

      const result = await UserService.updatePassword("user-uid-1", "oldPassword", "newPassword");

      assertEquals(result.success, true);
      assertEquals(result.message, "Password updated successfully");
      assertEquals(claimsStub.calls.length, 1);
      const updatedClaims = claimsStub.calls[0].args[1] as Record<string, unknown>;
      assertEquals(updatedClaims.password, "$2a$12$newhash");
    });

    it("should fail when user not found", async () => {
      stub(auth, "getUser", () =>
        Promise.resolve({ uid: "uid", customClaims: null })
      );

      const result = await UserService.updatePassword("uid", "old", "new");

      assertEquals(result.success, false);
      assertEquals(result.message, "User not found");
    });

    it("should fail when account is expired", async () => {
      const expiredDate = new Date(Date.now() - 1000).toISOString();

      stub(auth, "getUser", () =>
        Promise.resolve({
          uid: "uid",
          customClaims: {
            password: "$2a$12$hash",
            expiresAt: expiredDate,
          },
        })
      );

      const result = await UserService.updatePassword("uid", "old", "new");

      assertEquals(result.success, false);
      assertEquals(result.message, "Account has expired");
    });

    it("should fail when current password is incorrect", async () => {
      const futureDate = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString();

      stub(auth, "getUser", () =>
        Promise.resolve({
          uid: "uid",
          customClaims: {
            password: "$2a$12$hash",
            expiresAt: futureDate,
          },
        })
      );
      stub(bcrypt, "compare", () => Promise.resolve(false));

      const result = await UserService.updatePassword("uid", "wrongPassword", "newPassword");

      assertEquals(result.success, false);
      assertEquals(result.message, "Invalid credentials");
    });

    it("should handle Firebase errors gracefully", async () => {
      stub(auth, "getUser", () =>
        Promise.reject(new Error("Firebase error"))
      );

      const result = await UserService.updatePassword("uid", "old", "new");

      assertEquals(result.success, false);
      assertEquals(result.message, "Failed to update password");
    });
  });
});
