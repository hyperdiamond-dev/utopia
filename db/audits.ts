import { sql } from "./connection.ts";

export type EventType =
  | "LOGIN"
  | "LOGOUT"
  | "CONSENT"
  | "MODULE_START"
  | "MODULE_COMPLETION";

// Define a more specific type for audit details
export type AuditDetails = Record<string, string | number | boolean | null>;

export interface Audit {
  id: number;
  event_type: EventType;
  user_id: number;
  timestamp: Date | null;
  details: AuditDetails | null;
}

export class AuditRepository {
  async createAudit(
    eventType: EventType,
    userId: number,
    details?: AuditDetails,
  ): Promise<Audit> {
    const result = await sql`
      INSERT INTO terminal_utopia.audits (event_type, user_id, timestamp, details)
      VALUES (${eventType}, ${userId}, NOW(), ${
      details ? JSON.stringify(details) : null
    })
      RETURNING *
    `;
    return result[0] as Audit;
  }

  async findByUser(userId: number, limit = 50, offset = 0): Promise<Audit[]> {
    const result = await sql`
      SELECT * FROM terminal_utopia.audits 
      WHERE user_id = ${userId}
      ORDER BY timestamp DESC
      LIMIT ${limit} OFFSET ${offset}
    `;
    return result as Audit[];
  }

  async findByEventType(
    eventType: EventType,
    limit = 100,
    offset = 0,
  ): Promise<Audit[]> {
    const result = await sql`
      SELECT * FROM terminal_utopia.audits 
      WHERE event_type = ${eventType}
      ORDER BY timestamp DESC
      LIMIT ${limit} OFFSET ${offset}
    `;
    return result as Audit[];
  }

  async findByUserAndEventType(
    userId: number,
    eventType: EventType,
    limit = 50,
    offset = 0,
  ): Promise<Audit[]> {
    const result = await sql`
      SELECT * FROM terminal_utopia.audits 
      WHERE user_id = ${userId} AND event_type = ${eventType}
      ORDER BY timestamp DESC
      LIMIT ${limit} OFFSET ${offset}
    `;
    return result as Audit[];
  }

  async findRecentAudits(limit = 100): Promise<Audit[]> {
    const result = await sql`
      SELECT a.*, u.alias as user_alias
      FROM terminal_utopia.audits a
      JOIN terminal_utopia.users u ON a.user_id = u.id
      ORDER BY a.timestamp DESC
      LIMIT ${limit}
    `;
    return result as (Audit & { user_alias: string })[];
  }

  async getAuditStats(days = 30): Promise<{
    total_events: number;
    events_by_type: Record<EventType, number>;
    unique_users: number;
  }> {
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - days);

    // Get total events and unique users
    const totalResult = await sql`
      SELECT 
        COUNT(*) as total_events,
        COUNT(DISTINCT user_id) as unique_users
      FROM terminal_utopia.audits 
      WHERE timestamp >= ${cutoffDate.toISOString()}
    `;

    // Get events by type
    const eventTypeResult = await sql`
      SELECT 
        event_type,
        COUNT(*) as count
      FROM terminal_utopia.audits 
      WHERE timestamp >= ${cutoffDate.toISOString()}
      GROUP BY event_type
    `;

    const stats = totalResult[0] as {
      total_events: number;
      unique_users: number;
    };
    const eventsByType =
      (eventTypeResult as { event_type: EventType; count: number }[]).reduce(
        (acc: Record<EventType, number>, row) => {
          acc[row.event_type] = row.count;
          return acc;
        },
        {} as Record<EventType, number>,
      );

    return {
      total_events: stats.total_events,
      events_by_type: eventsByType,
      unique_users: stats.unique_users,
    };
  }

  async getLastLoginByUser(userId: number): Promise<Audit | null> {
    const result = await sql`
      SELECT * FROM terminal_utopia.audits 
      WHERE user_id = ${userId} AND event_type = 'LOGIN'
      ORDER BY timestamp DESC
      LIMIT 1
    `;
    return result[0] as Audit || null;
  }

  async cleanupOldAudits(daysToKeep = 365): Promise<number> {
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - daysToKeep);

    const result = await sql`
      DELETE FROM terminal_utopia.audits 
      WHERE timestamp < ${cutoffDate.toISOString()}
    `;

    return (result as unknown as { count: number }).count;
  }

  // Helper methods for common audit logging
  logLogin(userId: number, details?: AuditDetails): Promise<Audit> {
    return this.createAudit("LOGIN", userId, details);
  }

  logLogout(userId: number, details?: AuditDetails): Promise<Audit> {
    return this.createAudit("LOGOUT", userId, details);
  }

  logConsent(userId: number, details?: AuditDetails): Promise<Audit> {
    return this.createAudit("CONSENT", userId, details);
  }

  logModuleStart(userId: number, details?: AuditDetails): Promise<Audit> {
    return this.createAudit("MODULE_START", userId, details);
  }

  logModuleCompletion(userId: number, details?: AuditDetails): Promise<Audit> {
    return this.createAudit("MODULE_COMPLETION", userId, details);
  }
}

// Export a singleton instance
export const auditRepository = new AuditRepository();
