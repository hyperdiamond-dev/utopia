/**
 * Storage Service Tests
 * Tests for file validation and utility methods
 */

import { assertEquals } from "../test-config.ts";
import { describe, it } from "@std/testing/bdd";
import {
  ALLOWED_MIME_TYPES,
  MAX_FILE_SIZE,
  StorageService,
} from "../../services/storageService.ts";

describe("StorageService", () => {
  describe("validateFile", () => {
    it("should accept a valid image file", () => {
      const result = StorageService.validateFile(1024, "image/png");
      assertEquals(result, null);
    });

    it("should accept a valid PDF file", () => {
      const result = StorageService.validateFile(5000, "application/pdf");
      assertEquals(result, null);
    });

    it("should accept a valid video file", () => {
      const result = StorageService.validateFile(
        5 * 1024 * 1024,
        "video/mp4",
      );
      assertEquals(result, null);
    });

    it("should reject files exceeding max size", () => {
      const result = StorageService.validateFile(
        MAX_FILE_SIZE + 1,
        "image/png",
      );
      assertEquals(typeof result, "string");
      assertEquals(result!.includes("exceeds maximum"), true);
    });

    it("should reject empty files", () => {
      const result = StorageService.validateFile(0, "image/png");
      assertEquals(result, "File is empty");
    });

    it("should reject disallowed MIME types", () => {
      const result = StorageService.validateFile(1024, "application/exe");
      assertEquals(typeof result, "string");
      assertEquals(result!.includes("not allowed"), true);
    });

    it("should reject JavaScript files", () => {
      const result = StorageService.validateFile(
        1024,
        "application/javascript",
      );
      assertEquals(typeof result, "string");
      assertEquals(result!.includes("not allowed"), true);
    });

    it("should accept all whitelisted MIME types", () => {
      for (const mimeType of ALLOWED_MIME_TYPES) {
        const result = StorageService.validateFile(1024, mimeType);
        assertEquals(result, null, `Expected ${mimeType} to be accepted`);
      }
    });

    it("should accept file at exactly max size", () => {
      const result = StorageService.validateFile(MAX_FILE_SIZE, "image/png");
      assertEquals(result, null);
    });
  });

  describe("getExtensionFromMimeType", () => {
    it("should return .jpg for image/jpeg", () => {
      assertEquals(
        StorageService.getExtensionFromMimeType("image/jpeg"),
        ".jpg",
      );
    });

    it("should return .png for image/png", () => {
      assertEquals(
        StorageService.getExtensionFromMimeType("image/png"),
        ".png",
      );
    });

    it("should return .pdf for application/pdf", () => {
      assertEquals(
        StorageService.getExtensionFromMimeType("application/pdf"),
        ".pdf",
      );
    });

    it("should return .mp4 for video/mp4", () => {
      assertEquals(
        StorageService.getExtensionFromMimeType("video/mp4"),
        ".mp4",
      );
    });

    it("should return .mp3 for audio/mpeg", () => {
      assertEquals(
        StorageService.getExtensionFromMimeType("audio/mpeg"),
        ".mp3",
      );
    });

    it("should return empty string for unknown MIME types", () => {
      assertEquals(
        StorageService.getExtensionFromMimeType("application/octet-stream"),
        "",
      );
    });
  });
});
