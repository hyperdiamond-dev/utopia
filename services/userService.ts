// src/services/userService.ts
import bcrypt from "bcryptjs";
import { v4 as uuidv4 } from "uuid";
import { auth } from "../config/firebase.ts";
import { userRepository } from "../db/index.ts";
import { AliasGenerator } from "./aliasGenerator.ts";
import { ModuleService } from "./moduleService.ts";
import { PasswordGenerator } from "./passwordGenerator.ts";

export interface AnonymousUser {
  uuid: string;
  friendlyAlias: string;
  firebaseUid: string;
  password: string;
  createdAt: Date;
  expiresAt: Date;
}

export class UserService {
  static async createAnonymousUser(): Promise<{
    friendlyAlias: string;
    password: string;
    uuid: string;
  }> {
    // Generate unique friendly alias
    const friendlyAlias = await AliasGenerator.generateUnique(
      async (alias) => await this.aliasExists(alias),
    );

    // Generate secure password
    const password = PasswordGenerator.generate();

    // Create UUID-based identifier
    const uuid = `${uuidv4()}`;

    // Hash password for storage
    const hashedPassword = await bcrypt.hash(password, 12);

    // Create Firebase user with custom claims
    const firebaseUser = await auth.createUser({
      uid: uuid,
      disabled: false,
    });

    // Set custom claims for the user (includes hashed password and metadata)
    await auth.setCustomUserClaims(firebaseUser.uid, {
      isAnonymous: true,
      friendlyAlias,
      password: hashedPassword, // Store hashed password in custom claims
      createdAt: new Date().toISOString(),
      expiresAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(), // 30 days
    });

    const dbUser = await userRepository.createUser(
      friendlyAlias,
      uuid,
      "ACTIVE",
    );

    // Initialize user's module progress (starts with consent)
    try {
      await ModuleService.initializeUserModules(dbUser.id);
    } catch (error) {
      console.error("Failed to initialize user modules:", error);
      // Continue without failing user creation
    }

    return {
      friendlyAlias,
      password, // Return plain password for user
      uuid,
    };
  }

  static async authenticateUser(
    friendlyAlias: string,
    password: string,
  ): Promise<AnonymousUser | null> {
    try {
      // Find user by custom claims (search through Firebase users)
      // TODO: listUsers(1000) only fetches the first page.
      // If user count exceeds 1000, implement pagination using nextPageToken.
      const listUsersResult = await auth.listUsers(1000);

      // Find user with matching friendlyAlias in custom claims
      const userRecord = listUsersResult.users.find((user) => {
        const customClaims = user.customClaims;
        return customClaims && customClaims.friendlyAlias === friendlyAlias;
      });

      if (!userRecord || !userRecord.customClaims) {
        return null;
      }

      const claims = userRecord.customClaims;

      // Check if account has expired
      if (claims.expiresAt && new Date(claims.expiresAt) < new Date()) {
        // Disable expired user
        await auth.updateUser(userRecord.uid, { disabled: true });
        return null;
      }

      // Compare password with stored hash
      const isValid = await bcrypt.compare(password, claims.password);

      if (!isValid) {
        return null;
      }

      // Return user data
      return {
        uuid: userRecord.uid,
        friendlyAlias: claims.friendlyAlias,
        firebaseUid: userRecord.uid,
        password: claims.password, // hashed password
        createdAt: new Date(claims.createdAt),
        expiresAt: new Date(claims.expiresAt),
      };
    } catch (error) {
      console.error("Error during authentication:", error);
      return null;
    }
  }

  static async updatePassword(
    uuid: string,
    currentPassword: string,
    newPassword: string,
  ): Promise<{ success: boolean; message: string }> {
    try {
      // Fetch user from Firebase
      const userRecord = await auth.getUser(uuid);

      if (!userRecord || !userRecord.customClaims) {
        return { success: false, message: "User not found" };
      }

      const claims = userRecord.customClaims;

      // Check if account has expired
      if (claims.expiresAt && new Date(claims.expiresAt) < new Date()) {
        return { success: false, message: "Account has expired" };
      }

      // Verify current password
      const isValid = await bcrypt.compare(currentPassword, claims.password);
      if (!isValid) {
        return { success: false, message: "Invalid credentials" };
      }

      // Hash new password
      const hashedPassword = await bcrypt.hash(newPassword, 12);

      // Update custom claims with new password
      await auth.setCustomUserClaims(userRecord.uid, {
        ...claims,
        password: hashedPassword,
      });

      return { success: true, message: "Password updated successfully" };
    } catch (error) {
      console.error("Error updating password:", error);
      return { success: false, message: "Failed to update password" };
    }
  }

  private static async aliasExists(alias: string): Promise<boolean> {
    try {
      // TODO: listUsers(1000) only fetches the first page.
      // If user count exceeds 1000, implement pagination using nextPageToken.
      const listUsersResult = await auth.listUsers(1000);

      return listUsersResult.users.some((user) => {
        const customClaims = user.customClaims;
        return customClaims && customClaims.friendlyAlias === alias;
      });
    } catch (error) {
      console.error("Error checking alias existence:", error);
      return false;
    }
  }
}
