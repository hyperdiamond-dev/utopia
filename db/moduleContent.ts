import { sql } from "./connection.ts";

export type ContentType = "video" | "image" | "audio";

export interface ModuleContent {
  id: number;
  module_id: number | null;
  submodule_id: number | null;
  content_type: ContentType;
  title: string | null;
  description: string | null;
  url: string;
  thumbnail_url: string | null;
  duration_seconds: number | null;
  sequence_order: number;
  is_active: boolean;
  is_external: boolean;
  metadata: Record<string, unknown>;
  created_at: Date;
  updated_at: Date;
}

export type CreateModuleContentData = Omit<
  ModuleContent,
  "id" | "created_at" | "updated_at"
>;

export class ModuleContentRepository {
  async getContentByModuleId(moduleId: number): Promise<ModuleContent[]> {
    const result = await sql`
      SELECT * FROM terminal_utopia.module_content
      WHERE module_id = ${moduleId} AND is_active = true
      ORDER BY sequence_order ASC
    `;
    return result as ModuleContent[];
  }

  async getContentBySubmoduleId(
    submoduleId: number,
  ): Promise<ModuleContent[]> {
    const result = await sql`
      SELECT * FROM terminal_utopia.module_content
      WHERE submodule_id = ${submoduleId} AND is_active = true
      ORDER BY sequence_order ASC
    `;
    return result as ModuleContent[];
  }

  async getContentById(id: number): Promise<ModuleContent | null> {
    const result = await sql`
      SELECT * FROM terminal_utopia.module_content WHERE id = ${id}
    `;
    return (result[0] as ModuleContent) || null;
  }

  async createContent(
    data: CreateModuleContentData,
  ): Promise<ModuleContent> {
    const result = await sql`
      INSERT INTO terminal_utopia.module_content (
        module_id, submodule_id, content_type, title, description,
        url, thumbnail_url, duration_seconds, sequence_order,
        is_active, is_external, metadata
      ) VALUES (
        ${data.module_id}, ${data.submodule_id}, ${data.content_type},
        ${data.title}, ${data.description}, ${data.url},
        ${data.thumbnail_url}, ${data.duration_seconds},
        ${data.sequence_order}, ${data.is_active}, ${data.is_external},
        ${JSON.stringify(data.metadata)}
      )
      RETURNING *
    `;
    return result[0] as ModuleContent;
  }

  async updateContent(
    id: number,
    data: Partial<CreateModuleContentData>,
  ): Promise<ModuleContent | null> {
    const existing = await this.getContentById(id);
    if (!existing) return null;

    const updated = { ...existing, ...data };
    const result = await sql`
      UPDATE terminal_utopia.module_content SET
        module_id = ${updated.module_id},
        submodule_id = ${updated.submodule_id},
        content_type = ${updated.content_type},
        title = ${updated.title},
        description = ${updated.description},
        url = ${updated.url},
        thumbnail_url = ${updated.thumbnail_url},
        duration_seconds = ${updated.duration_seconds},
        sequence_order = ${updated.sequence_order},
        is_active = ${updated.is_active},
        is_external = ${updated.is_external},
        metadata = ${JSON.stringify(updated.metadata)}
      WHERE id = ${id}
      RETURNING *
    `;
    return (result[0] as ModuleContent) || null;
  }

  async deleteContent(id: number): Promise<boolean> {
    const result = await sql`
      DELETE FROM terminal_utopia.module_content
      WHERE id = ${id}
      RETURNING id
    `;
    return result.length > 0;
  }
}

export const moduleContentRepository = new ModuleContentRepository();
