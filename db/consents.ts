import { sql } from './connection.ts';

export interface Consent {
  id: number;
  user_id: number;
  version: string;
  content: string | null;
  consented_at: Date | null;
}

export class ConsentRepository {
  async createConsent(userId: number, version: string, content?: string): Promise<Consent> {
    const result = await sql`
      INSERT INTO consents (user_id, version, content, consented_at)
      VALUES (${userId}, ${version}, ${content || null}, NOW())
      RETURNING *
    `;
    return result[0] as Consent;
  }

  async findByUserAndVersion(userId: number, version: string): Promise<Consent | null> {
    const result = await sql`
      SELECT * FROM consents 
      WHERE user_id = ${userId} AND version = ${version}
      ORDER BY consented_at DESC
      LIMIT 1
    `;
    return result[0] as Consent || null;
  }

  async findByUser(userId: number): Promise<Consent[]> {
    const result = await sql`
      SELECT * FROM consents 
      WHERE user_id = ${userId}
      ORDER BY consented_at DESC
    `;
    return result as Consent[];
  }

  async getLatestConsentByUser(userId: number): Promise<Consent | null> {
    const result = await sql`
      SELECT * FROM consents 
      WHERE user_id = ${userId}
      ORDER BY consented_at DESC
      LIMIT 1
    `;
    return result[0] as Consent || null;
  }

  async hasUserConsentedToVersion(userId: number, version: string): Promise<boolean> {
    const result = await sql`
      SELECT COUNT(*) as count FROM consents 
      WHERE user_id = ${userId} AND version = ${version}
    `;
    return (result[0] as { count: number }).count > 0;
  }

  async revokeConsent(userId: number, version: string): Promise<boolean> {
    const result = await sql`
      DELETE FROM consents 
      WHERE user_id = ${userId} AND version = ${version}
    `;
    return (result as unknown as { count: number }).count > 0;
  }

  async getUsersWithoutConsent(version: string): Promise<number[]> {
    const result = await sql`
      SELECT u.id FROM users u
      LEFT JOIN consents c ON u.id = c.user_id AND c.version = ${version}
      WHERE c.id IS NULL
    `;
    return (result as { id: number }[]).map(row => row.id);
  }

  async getConsentStats(version: string): Promise<{ total_users: number; consented_users: number; consent_rate: number }> {
    const result = await sql`
      SELECT 
        COUNT(DISTINCT u.id) as total_users,
        COUNT(DISTINCT c.user_id) as consented_users,
        ROUND(
          (COUNT(DISTINCT c.user_id)::decimal / NULLIF(COUNT(DISTINCT u.id), 0) * 100), 2
        ) as consent_rate
      FROM users u
      LEFT JOIN consents c ON u.id = c.user_id AND c.version = ${version}
    `;
    
    const stats = result[0] as { total_users: number; consented_users: number; consent_rate: number };
    return {
      total_users: stats.total_users,
      consented_users: stats.consented_users,
      consent_rate: stats.consent_rate || 0
    };
  }
}

// Export a singleton instance
export const consentRepository = new ConsentRepository();
