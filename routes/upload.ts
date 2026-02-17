/**
 * Upload Routes
 * API endpoints for participant file uploads
 */

import { Hono } from "hono";
import { v4 as uuidv4 } from "uuid";
import { userRepository } from "../db/index.ts";
import { fileUploadRepository } from "../db/fileUploads.ts";
import { questionRepository } from "../db/questions.ts";
import { moduleRepository } from "../db/modules.ts";
import { submoduleRepository } from "../db/submodules.ts";
import { authMiddleware } from "../middleware/auth.ts";
import { StorageService } from "../services/storageService.ts";

// Context type for authenticated requests
type UploadContext = {
  Variables: {
    user: {
      uuid?: string;
      friendlyAlias?: string;
      firebaseUid?: string;
      [key: string]: unknown;
    };
  };
};

export const uploads = new Hono<UploadContext>();

/**
 * Helper to get the authenticated user record
 */
async function getUserRecord(c: { get: (key: string) => unknown }) {
  const user = c.get("user") as UploadContext["Variables"]["user"] | undefined;
  if (!user?.uuid) return null;
  return await userRepository.findByUuid(user.uuid);
}

/**
 * Helper to check if a question's module/submodule is completed (read-only)
 */
async function isQuestionReadOnly(
  userId: number,
  question: { module_id: number | null; submodule_id: number | null },
): Promise<boolean> {
  if (question.submodule_id) {
    const progress = await submoduleRepository.getUserSubmoduleProgress(
      userId,
      question.submodule_id,
    );
    if (progress?.status === "COMPLETED") return true;
  } else if (question.module_id) {
    const progress = await moduleRepository.getUserModuleProgress(
      userId,
      question.module_id,
    );
    if (progress?.status === "COMPLETED") return true;
  }
  return false;
}

/**
 * POST /question/:questionId - Upload a file for a question response
 */
uploads.post(
  "/question/:questionId",
  authMiddleware,
  async (c) => {
    const userRecord = await getUserRecord(c);
    if (!userRecord) {
      return c.json({ error: "User not found" }, 404);
    }

    const questionId = parseInt(c.req.param("questionId"), 10);
    if (isNaN(questionId)) {
      return c.json({ error: "Invalid question ID" }, 400);
    }

    try {
      // Verify question exists
      const question = await questionRepository.getQuestionById(questionId);
      if (!question) {
        return c.json({ error: "Question not found" }, 404);
      }

      // Check if module/submodule is completed (read-only)
      if (await isQuestionReadOnly(userRecord.id, question)) {
        return c.json(
          { error: "Cannot upload to a completed module" },
          403,
        );
      }

      // Parse multipart form data
      const formData = await c.req.formData();
      const file = formData.get("file");

      if (!file || !(file instanceof File)) {
        return c.json({ error: "No file provided" }, 400);
      }

      // Validate file
      const validationError = StorageService.validateFile(
        file.size,
        file.type,
      );
      if (validationError) {
        return c.json({ error: validationError }, 400);
      }

      // Generate stored filename
      const extension = StorageService.getExtensionFromMimeType(file.type);
      const storedFilename = `${uuidv4()}${extension}`;

      // Upload to R2
      const fileBuffer = await file.arrayBuffer();
      const storageUrl = await StorageService.uploadFile(
        fileBuffer,
        storedFilename,
        file.type,
      );

      // Save metadata to database
      const upload = await fileUploadRepository.createUpload({
        user_id: userRecord.id,
        question_id: questionId,
        original_filename: file.name,
        stored_filename: storedFilename,
        mime_type: file.type,
        file_size: file.size,
        storage_url: storageUrl,
      });

      return c.json({
        upload: {
          id: upload.id,
          original_filename: upload.original_filename,
          mime_type: upload.mime_type,
          file_size: upload.file_size,
          created_at: upload.created_at,
        },
      }, 201);
    } catch (error) {
      console.error("Failed to upload file:", error);
      return c.json({ error: "Failed to upload file" }, 500);
    }
  },
);

/**
 * GET /question/:questionId - List user's uploads for a question
 */
uploads.get(
  "/question/:questionId",
  authMiddleware,
  async (c) => {
    const userRecord = await getUserRecord(c);
    if (!userRecord) {
      return c.json({ error: "User not found" }, 404);
    }

    const questionId = parseInt(c.req.param("questionId"), 10);
    if (isNaN(questionId)) {
      return c.json({ error: "Invalid question ID" }, 400);
    }

    try {
      const uploadList = await fileUploadRepository.getUploadsByUserAndQuestion(
        userRecord.id,
        questionId,
      );

      return c.json({
        uploads: uploadList.map((u) => ({
          id: u.id,
          original_filename: u.original_filename,
          mime_type: u.mime_type,
          file_size: u.file_size,
          created_at: u.created_at,
        })),
      });
    } catch (error) {
      console.error("Failed to list uploads:", error);
      return c.json({ error: "Failed to list uploads" }, 500);
    }
  },
);

/**
 * GET /:fileId - Get a signed URL for a specific upload
 */
uploads.get(
  "/:fileId",
  authMiddleware,
  async (c) => {
    const userRecord = await getUserRecord(c);
    if (!userRecord) {
      return c.json({ error: "User not found" }, 404);
    }

    const fileId = parseInt(c.req.param("fileId"), 10);
    if (isNaN(fileId)) {
      return c.json({ error: "Invalid file ID" }, 400);
    }

    try {
      const upload = await fileUploadRepository.getUploadById(fileId);
      if (!upload) {
        return c.json({ error: "Upload not found" }, 404);
      }

      // Only the owning user can access their uploads
      if (upload.user_id !== userRecord.id) {
        return c.json({ error: "Access denied" }, 403);
      }

      const signedUrl = await StorageService.getSignedUrl(
        upload.stored_filename,
      );

      return c.json({
        url: signedUrl,
        upload: {
          id: upload.id,
          original_filename: upload.original_filename,
          mime_type: upload.mime_type,
          file_size: upload.file_size,
        },
      });
    } catch (error) {
      console.error("Failed to get upload:", error);
      return c.json({ error: "Failed to get upload" }, 500);
    }
  },
);

/**
 * DELETE /:fileId - Delete an upload
 */
uploads.delete(
  "/:fileId",
  authMiddleware,
  async (c) => {
    const userRecord = await getUserRecord(c);
    if (!userRecord) {
      return c.json({ error: "User not found" }, 404);
    }

    const fileId = parseInt(c.req.param("fileId"), 10);
    if (isNaN(fileId)) {
      return c.json({ error: "Invalid file ID" }, 400);
    }

    try {
      const upload = await fileUploadRepository.getUploadById(fileId);
      if (!upload) {
        return c.json({ error: "Upload not found" }, 404);
      }

      // Only the owning user can delete their uploads
      if (upload.user_id !== userRecord.id) {
        return c.json({ error: "Access denied" }, 403);
      }

      // Check if module/submodule is completed
      const question = await questionRepository.getQuestionById(
        upload.question_id,
      );
      if (question && await isQuestionReadOnly(userRecord.id, question)) {
        return c.json(
          { error: "Cannot delete uploads from a completed module" },
          403,
        );
      }

      // Delete from R2 storage
      await StorageService.deleteFile(upload.stored_filename);

      // Delete from database
      await fileUploadRepository.deleteUpload(fileId);

      return c.json({ message: "Upload deleted successfully" });
    } catch (error) {
      console.error("Failed to delete upload:", error);
      return c.json({ error: "Failed to delete upload" }, 500);
    }
  },
);
