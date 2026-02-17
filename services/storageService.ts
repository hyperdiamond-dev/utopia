/**
 * Storage Service
 * Handles file upload/download/delete operations with Cloudflare R2 (S3-compatible)
 */

import {
  DeleteObjectCommand,
  GetObjectCommand,
  PutObjectCommand,
  S3Client,
} from "@aws-sdk/client-s3";
import { getSignedUrl as s3GetSignedUrl } from "@aws-sdk/s3-request-presigner";

// ============================================================================
// Configuration
// ============================================================================

const R2_ACCOUNT_ID = Deno.env.get("R2_ACCOUNT_ID") || "";
const R2_ACCESS_KEY_ID = Deno.env.get("R2_ACCESS_KEY_ID") || "";
const R2_SECRET_ACCESS_KEY = Deno.env.get("R2_SECRET_ACCESS_KEY") || "";
const R2_BUCKET_NAME = Deno.env.get("R2_BUCKET_NAME") || "backrooms-uploads";
const R2_PUBLIC_URL = Deno.env.get("R2_PUBLIC_URL") || "";

// ============================================================================
// Constants
// ============================================================================

export const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10MB

export const ALLOWED_MIME_TYPES = [
  "image/jpeg",
  "image/png",
  "image/gif",
  "image/webp",
  "application/pdf",
  "text/plain",
  "audio/mpeg",
  "audio/wav",
  "video/mp4",
  "video/webm",
] as const;

export type AllowedMimeType = (typeof ALLOWED_MIME_TYPES)[number];

const SIGNED_URL_EXPIRY = 3600; // 1 hour

// ============================================================================
// S3 Client
// ============================================================================

function getS3Client(): S3Client {
  return new S3Client({
    region: "auto",
    endpoint: `https://${R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
    credentials: {
      accessKeyId: R2_ACCESS_KEY_ID,
      secretAccessKey: R2_SECRET_ACCESS_KEY,
    },
  });
}

// ============================================================================
// Service Class
// ============================================================================

export class StorageService {
  /**
   * Upload a file to R2 storage
   * @param fileBuffer - The file content as ArrayBuffer or Uint8Array
   * @param storedFilename - The generated filename to store as (e.g. "uuid.ext")
   * @param mimeType - The file's MIME type
   * @returns The storage URL for the uploaded file
   */
  static async uploadFile(
    fileBuffer: ArrayBuffer | Uint8Array,
    storedFilename: string,
    mimeType: string,
  ): Promise<string> {
    const client = getS3Client();

    const command = new PutObjectCommand({
      Bucket: R2_BUCKET_NAME,
      Key: `uploads/${storedFilename}`,
      Body: new Uint8Array(fileBuffer),
      ContentType: mimeType,
    });

    await client.send(command);

    // Return the public URL or construct one
    if (R2_PUBLIC_URL) {
      return `${R2_PUBLIC_URL}/uploads/${storedFilename}`;
    }

    return `https://${R2_BUCKET_NAME}.${R2_ACCOUNT_ID}.r2.cloudflarestorage.com/uploads/${storedFilename}`;
  }

  /**
   * Generate a time-limited signed URL for downloading a file
   * @param storedFilename - The stored filename in R2
   * @returns A signed URL valid for 1 hour
   */
  static async getSignedUrl(storedFilename: string): Promise<string> {
    const client = getS3Client();

    const command = new GetObjectCommand({
      Bucket: R2_BUCKET_NAME,
      Key: `uploads/${storedFilename}`,
    });

    return await s3GetSignedUrl(client, command, {
      expiresIn: SIGNED_URL_EXPIRY,
    });
  }

  /**
   * Delete a file from R2 storage
   * @param storedFilename - The stored filename to delete
   */
  static async deleteFile(storedFilename: string): Promise<void> {
    const client = getS3Client();

    const command = new DeleteObjectCommand({
      Bucket: R2_BUCKET_NAME,
      Key: `uploads/${storedFilename}`,
    });

    await client.send(command);
  }

  /**
   * Validate a file's size and MIME type
   * @returns null if valid, error message string if invalid
   */
  static validateFile(
    fileSize: number,
    mimeType: string,
  ): string | null {
    if (fileSize > MAX_FILE_SIZE) {
      return `File size ${(fileSize / 1024 / 1024).toFixed(1)}MB exceeds maximum of ${MAX_FILE_SIZE / 1024 / 1024}MB`;
    }

    if (fileSize === 0) {
      return "File is empty";
    }

    if (!ALLOWED_MIME_TYPES.includes(mimeType as AllowedMimeType)) {
      return `File type "${mimeType}" is not allowed. Allowed types: ${ALLOWED_MIME_TYPES.join(", ")}`;
    }

    return null;
  }

  /**
   * Extract file extension from a MIME type
   */
  static getExtensionFromMimeType(mimeType: string): string {
    const map: Record<string, string> = {
      "image/jpeg": ".jpg",
      "image/png": ".png",
      "image/gif": ".gif",
      "image/webp": ".webp",
      "application/pdf": ".pdf",
      "text/plain": ".txt",
      "audio/mpeg": ".mp3",
      "audio/wav": ".wav",
      "video/mp4": ".mp4",
      "video/webm": ".webm",
    };

    return map[mimeType] || "";
  }
}
