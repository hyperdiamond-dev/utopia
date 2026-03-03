/**
 * Admin Routes
 * Service-to-service endpoints for the levelzero admin dashboard.
 * Authenticated via X-Admin-Secret header (no JWT required).
 */

import { Hono } from "hono";
import { sql } from "../db/connection.ts";

const admin = new Hono();

/**
 * Middleware: validate X-Admin-Secret header
 */
const requireAdminSecret: Parameters<typeof admin.use>[1] = async (c, next) => {
  const secret = c.req.header("x-admin-secret");
  const expected = Deno.env.get("ADMIN_SECRET");

  if (!expected) {
    console.error("ADMIN_SECRET environment variable is not set");
    return c.json({ error: "Server misconfiguration" }, 500);
  }

  if (!secret) {
    return c.json({ error: "Forbidden" }, 403);
  }

  // Constant-time comparison to prevent timing attacks
  const encoder = new TextEncoder();
  const a = encoder.encode(secret);
  const b = encoder.encode(expected);
  if (a.byteLength !== b.byteLength) {
    return c.json({ error: "Forbidden" }, 403);
  }
  // Use constant-time XOR comparison
  let mismatch = 0;
  for (let i = 0; i < a.byteLength; i++) {
    mismatch |= a[i] ^ b[i];
  }
  if (mismatch !== 0) {
    return c.json({ error: "Forbidden" }, 403);
  }

  await next();
};

// Apply admin secret check to all routes
admin.use("*", requireAdminSecret);

/**
 * GET /api/admin/stats
 * Dashboard statistics for the admin panel.
 */
admin.get("/stats", async (c) => {
  const [responseStats, userStats, completionStats] = await Promise.all([
    // Total responses
    sql`
      SELECT COUNT(*) as total_responses
      FROM terminal_utopia.user_question_responses
    `,

    // Unique participants (active users)
    sql`
      SELECT COUNT(*) as unique_participants
      FROM terminal_utopia.users
      WHERE status = 'ACTIVE'
    `,

    // Completion breakdown based on module progress
    sql`
      SELECT
        COUNT(DISTINCT u.id) FILTER (
          WHERE NOT EXISTS (
            SELECT 1 FROM terminal_utopia.user_module_progress ump WHERE ump.user_id = u.id
          )
        ) as not_started,
        COUNT(DISTINCT u.id) FILTER (
          WHERE EXISTS (
            SELECT 1 FROM terminal_utopia.user_module_progress ump
            WHERE ump.user_id = u.id AND ump.status != 'COMPLETED'
          )
          AND NOT EXISTS (
            SELECT 1 FROM terminal_utopia.user_module_progress ump
            WHERE ump.user_id = u.id AND ump.status = 'COMPLETED'
            HAVING COUNT(*) = (SELECT COUNT(*) FROM terminal_utopia.modules WHERE is_active = true)
          )
        ) as in_progress,
        COUNT(DISTINCT u.id) FILTER (
          WHERE (
            SELECT COUNT(*) FROM terminal_utopia.user_module_progress ump
            WHERE ump.user_id = u.id AND ump.status = 'COMPLETED'
          ) = (SELECT COUNT(*) FROM terminal_utopia.modules WHERE is_active = true)
          AND (SELECT COUNT(*) FROM terminal_utopia.modules WHERE is_active = true) > 0
        ) as completed
      FROM terminal_utopia.users u
      WHERE u.status = 'ACTIVE'
    `,
  ]);

  return c.json({
    totalResponses: parseInt(
      (responseStats[0] as { total_responses: string }).total_responses,
      10,
    ),
    uniqueParticipants: parseInt(
      (userStats[0] as { unique_participants: string }).unique_participants,
      10,
    ),
    completionStats: {
      notStarted: parseInt(
        (completionStats[0] as { not_started: string }).not_started,
        10,
      ),
      inProgress: parseInt(
        (completionStats[0] as { in_progress: string }).in_progress,
        10,
      ),
      completed: parseInt(
        (completionStats[0] as { completed: string }).completed,
        10,
      ),
    },
  });
});

/**
 * GET /api/admin/export/responses
 * Export participant responses as JSON.
 * Optional query param: moduleId (filter by module)
 */
admin.get("/export/responses", async (c) => {
  const moduleIdParam = c.req.query("moduleId");
  const moduleId = moduleIdParam ? parseInt(moduleIdParam, 10) : null;

  if (moduleIdParam && (isNaN(moduleId!) || moduleId! <= 0)) {
    return c.json({ error: "Invalid moduleId parameter" }, 400);
  }

  let responses;

  if (moduleId) {
    responses = await sql`
      SELECT
        u.alias as participant_alias,
        q.question_text,
        q.question_type,
        uqr.response_value,
        uqr.answered_at,
        m.name as module_name,
        m.title as module_title
      FROM terminal_utopia.user_question_responses uqr
      INNER JOIN terminal_utopia.users u ON uqr.user_id = u.id
      INNER JOIN terminal_utopia.questions q ON uqr.question_id = q.id
      INNER JOIN terminal_utopia.question_modules qm ON q.id = qm.question_id
      INNER JOIN terminal_utopia.modules m ON qm.module_id = m.id
      WHERE qm.module_id = ${moduleId}
      ORDER BY u.alias ASC, qm.sequence_order ASC
    `;
  } else {
    responses = await sql`
      SELECT
        u.alias as participant_alias,
        q.question_text,
        q.question_type,
        uqr.response_value,
        uqr.answered_at,
        COALESCE(m.name, sm_m.name) as module_name,
        COALESCE(m.title, sm_m.title) as module_title
      FROM terminal_utopia.user_question_responses uqr
      INNER JOIN terminal_utopia.users u ON uqr.user_id = u.id
      INNER JOIN terminal_utopia.questions q ON uqr.question_id = q.id
      LEFT JOIN terminal_utopia.question_modules qm ON q.id = qm.question_id
      LEFT JOIN terminal_utopia.modules m ON qm.module_id = m.id
      LEFT JOIN terminal_utopia.question_submodules qs ON q.id = qs.question_id
      LEFT JOIN terminal_utopia.submodules s ON qs.submodule_id = s.id
      LEFT JOIN terminal_utopia.modules sm_m ON s.module_id = sm_m.id
      ORDER BY u.alias ASC, uqr.answered_at ASC
    `;
  }

  return c.json(responses);
});

export { admin };
