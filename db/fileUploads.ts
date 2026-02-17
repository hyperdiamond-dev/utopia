/**
 * File Uploads Repository
 * Handles database operations for file upload metadata
 */

import { sql } from "./connection.ts";

// ============================================================================
// Type Definitions
// ============================================================================

export interface FileUpload {
  id: number;
  user_id: number;
  question_id: number;
  original_filename: string;
  stored_filename: string;
  mime_type: string;
  file_size: number;
  storage_url: string;
  created_at: Date;
}

export type CreateFileUploadData = Omit<FileUpload, "id" | "created_at">;

// ============================================================================
// Repository Class
// ============================================================================

export class FileUploadRepository {
  /**
   * Create a new file upload record
   */
  async createUpload(data: CreateFileUploadData): Promise<FileUpload> {
    const result = await sql`
      INSERT INTO terminal_utopia.file_uploads (
        user_id,
        question_id,
        original_filename,
        stored_filename,
        mime_type,
        file_size,
        storage_url
      )
      VALUES (
        ${data.user_id},
        ${data.question_id},
        ${data.original_filename},
        ${data.stored_filename},
        ${data.mime_type},
        ${data.file_size},
        ${data.storage_url}
      )
      RETURNING *
    `;

    return result[0] as FileUpload;
  }

  /**
   * Get a file upload by ID
   */
  async getUploadById(id: number): Promise<FileUpload | null> {
    const result = await sql`
      SELECT *
      FROM terminal_utopia.file_uploads
      WHERE id = ${id}
    `;

    return result.length > 0 ? (result[0] as FileUpload) : null;
  }

  /**
   * Get all uploads for a specific question
   */
  async getUploadsByQuestion(questionId: number): Promise<FileUpload[]> {
    const result = await sql`
      SELECT *
      FROM terminal_utopia.file_uploads
      WHERE question_id = ${questionId}
      ORDER BY created_at DESC
    `;

    return result as FileUpload[];
  }

  /**
   * Get all uploads by a specific user
   */
  async getUploadsByUser(userId: number): Promise<FileUpload[]> {
    const result = await sql`
      SELECT *
      FROM terminal_utopia.file_uploads
      WHERE user_id = ${userId}
      ORDER BY created_at DESC
    `;

    return result as FileUpload[];
  }

  /**
   * Get uploads for a specific user and question combination
   */
  async getUploadsByUserAndQuestion(
    userId: number,
    questionId: number,
  ): Promise<FileUpload[]> {
    const result = await sql`
      SELECT *
      FROM terminal_utopia.file_uploads
      WHERE user_id = ${userId}
      AND question_id = ${questionId}
      ORDER BY created_at DESC
    `;

    return result as FileUpload[];
  }

  /**
   * Delete a file upload record (hard delete)
   */
  async deleteUpload(id: number): Promise<boolean> {
    const result = await sql`
      DELETE FROM terminal_utopia.file_uploads
      WHERE id = ${id}
      RETURNING id
    `;

    return result.length > 0;
  }
}

// ============================================================================
// Singleton Export
// ============================================================================

export const fileUploadRepository = new FileUploadRepository();
