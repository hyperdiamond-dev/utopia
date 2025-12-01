import { sql } from "./connection.ts";

export type ConsentVersionStatus = "DRAFT" | "ACTIVE" | "DEPRECATED";

export interface ConsentVersion {
  id: number;
  version: string;
  title: string;
  content_text: string | null;
  content_url: string | null;
  status: ConsentVersionStatus;
  effective_date: Date | null;
  deprecated_date: Date | null;
  created_at: Date;
  updated_at: Date;
}

export class ConsentVersionRepository {
  /**
   * Get the currently active consent version
   */
  async getActiveVersion(): Promise<ConsentVersion | null> {
    const result = await sql`
      SELECT * FROM terminal_utopia.consent_versions
      WHERE status = 'ACTIVE'
      ORDER BY effective_date DESC
      LIMIT 1
    `;
    return result[0] as ConsentVersion || null;
  }

  /**
   * Get all consent versions
   */
  async getAllVersions(): Promise<ConsentVersion[]> {
    const result = await sql`
      SELECT * FROM terminal_utopia.consent_versions
      ORDER BY created_at DESC
    `;
    return result as ConsentVersion[];
  }

  /**
   * Get versions by status
   */
  async getVersionsByStatus(
    status: ConsentVersionStatus,
  ): Promise<ConsentVersion[]> {
    const result = await sql`
      SELECT * FROM terminal_utopia.consent_versions
      WHERE status = ${status}
      ORDER BY effective_date DESC
    `;
    return result as ConsentVersion[];
  }

  /**
   * Get a specific version by version string
   */
  async getVersionByName(version: string): Promise<ConsentVersion | null> {
    const result = await sql`
      SELECT * FROM terminal_utopia.consent_versions
      WHERE version = ${version}
    `;
    return result[0] as ConsentVersion || null;
  }

  /**
   * Get a specific version by ID
   */
  async getVersionById(id: number): Promise<ConsentVersion | null> {
    const result = await sql`
      SELECT * FROM terminal_utopia.consent_versions
      WHERE id = ${id}
    `;
    return result[0] as ConsentVersion || null;
  }

  /**
   * Create a new consent version
   */
  async createVersion(data: {
    version: string;
    title: string;
    content_text?: string;
    content_url?: string;
    status?: ConsentVersionStatus;
    effective_date?: Date;
  }): Promise<ConsentVersion> {
    const result = await sql`
      INSERT INTO terminal_utopia.consent_versions (
        version,
        title,
        content_text,
        content_url,
        status,
        effective_date
      )
      VALUES (
        ${data.version},
        ${data.title},
        ${data.content_text || null},
        ${data.content_url || null},
        ${data.status || "DRAFT"},
        ${data.effective_date ? data.effective_date.toISOString() : null}
      )
      RETURNING *
    `;
    return result[0] as ConsentVersion;
  }

  /**
   * Update a consent version's status
   */
  async updateVersionStatus(
    version: string,
    status: ConsentVersionStatus,
  ): Promise<ConsentVersion | null> {
    const result = await sql`
      UPDATE terminal_utopia.consent_versions
      SET status = ${status}, updated_at = NOW()
      WHERE version = ${version}
      RETURNING *
    `;
    return result[0] as ConsentVersion || null;
  }

  /**
   * Activate a version (deactivates all others)
   */
  async activateVersion(
    version: string,
    effectiveDate?: Date,
  ): Promise<ConsentVersion | null> {
    // First, deactivate all other active versions
    await sql`
      UPDATE terminal_utopia.consent_versions
      SET status = 'DEPRECATED', deprecated_date = NOW()
      WHERE status = 'ACTIVE'
    `;

    // Then activate the specified version
    const result = await sql`
      UPDATE terminal_utopia.consent_versions
      SET
        status = 'ACTIVE',
        effective_date = ${
      effectiveDate ? effectiveDate.toISOString() : "NOW()"
    },
        deprecated_date = NULL,
        updated_at = NOW()
      WHERE version = ${version}
      RETURNING *
    `;

    return result[0] as ConsentVersion || null;
  }

  /**
   * Deprecate a version
   */
  async deprecateVersion(
    version: string,
    deprecatedDate?: Date,
  ): Promise<ConsentVersion | null> {
    const result = await sql`
      UPDATE terminal_utopia.consent_versions
      SET
        status = 'DEPRECATED',
        deprecated_date = ${
      deprecatedDate ? deprecatedDate.toISOString() : "NOW()"
    },
        updated_at = NOW()
      WHERE version = ${version}
      RETURNING *
    `;

    return result[0] as ConsentVersion || null;
  }

  /**
   * Check if a version exists and is active
   */
  async isVersionActive(version: string): Promise<boolean> {
    const result = await sql`
      SELECT COUNT(*) as count
      FROM terminal_utopia.consent_versions
      WHERE version = ${version} AND status = 'ACTIVE'
    `;
    return (result[0] as { count: number }).count > 0;
  }

  /**
   * Get consent statistics for a version
   */
  async getVersionStats(version: string): Promise<{
    total_consents: number;
    unique_users: number;
    first_consent: Date | null;
    latest_consent: Date | null;
  }> {
    const result = await sql`
      SELECT
        COUNT(*) as total_consents,
        COUNT(DISTINCT user_id) as unique_users,
        MIN(consented_at) as first_consent,
        MAX(consented_at) as latest_consent
      FROM terminal_utopia.consents
      WHERE version = ${version}
    `;

    const stats = result[0] as {
      total_consents: number;
      unique_users: number;
      first_consent: Date | null;
      latest_consent: Date | null;
    };

    return {
      total_consents: stats.total_consents,
      unique_users: stats.unique_users,
      first_consent: stats.first_consent,
      latest_consent: stats.latest_consent,
    };
  }
}

// Export a singleton instance
export const consentVersionRepository = new ConsentVersionRepository();
