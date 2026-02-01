#!/usr/bin/env deno run --allow-net --allow-read --allow-env

import "@std/dotenv/load";
import { sql } from "./connection.ts";

console.log("🌱 Seeding database with test data...\n");

try {
  // Check if already seeded
  const existingUsers = await sql`
    SELECT COUNT(*) as count FROM terminal_utopia.users
  `;
  const userCount = parseInt(existingUsers[0].count as string);

  if (userCount > 0) {
    console.log("⏭️  Database already seeded, skipping...");
    Deno.exit(0);
  }

  // Create test users
  console.log("👥 Creating test users...");
  const users = await sql`
    INSERT INTO terminal_utopia.users (uuid, alias, status, created_at)
    VALUES
      (gen_random_uuid(), 'BraveTiger', 'ACTIVE', NOW() - INTERVAL '5 days'),
      (gen_random_uuid(), 'CleverWolf', 'ACTIVE', NOW() - INTERVAL '3 days'),
      (gen_random_uuid(), 'SwiftHawk', 'ACTIVE', NOW() - INTERVAL '1 day')
    RETURNING *
  `;
  console.log(`   ✓ Created ${users.length} test users`);

  const [user1, user2, user3] = users;

  // User 1: Completed consent and module 1, currently on module 2
  console.log("\n📊 Setting up user progress - BraveTiger (advanced user)...");

  // Create consent for user 1
  await sql`
    INSERT INTO terminal_utopia.consents (user_id, version, content, consented_at)
    VALUES (${user1.id}, 'v1.0', 'I agree to participate', NOW() - INTERVAL '5 days')
  `;

  // Start and complete consent module
  await sql`
    INSERT INTO terminal_utopia.user_module_progress (user_id, module_id, status, started_at, completed_at, response_data)
    VALUES (
      ${user1.id},
      (SELECT id FROM terminal_utopia.modules WHERE name = 'consent'),
      'COMPLETED',
      NOW() - INTERVAL '5 days',
      NOW() - INTERVAL '5 days',
      '{"agreed": true, "signature": "BraveTiger"}'::json
    )
  `;

  // Complete module 1
  await sql`
    INSERT INTO terminal_utopia.user_module_progress (user_id, module_id, status, started_at, completed_at, response_data)
    VALUES (
      ${user1.id},
      (SELECT id FROM terminal_utopia.modules WHERE name = 'module1'),
      'COMPLETED',
      NOW() - INTERVAL '4 days',
      NOW() - INTERVAL '3 days',
      '{"age": 28, "occupation": "Developer", "experience": "Beginner"}'::json
    )
  `;

  // In progress on module 2
  await sql`
    INSERT INTO terminal_utopia.user_module_progress (user_id, module_id, status, started_at, response_data)
    VALUES (
      ${user1.id},
      (SELECT id FROM terminal_utopia.modules WHERE name = 'module2'),
      'IN_PROGRESS',
      NOW() - INTERVAL '2 days',
      '{"question1": "Partially answered..."}'::json
    )
  `;

  // Update active module
  await sql`
    UPDATE terminal_utopia.users
    SET active_module = (SELECT id FROM terminal_utopia.modules WHERE name = 'module2')
    WHERE id = ${user1.id}
  `;

  console.log(
    "   ✓ BraveTiger: Completed consent + module1, in progress on module2",
  );

  // User 2: Completed consent, currently on module 1
  console.log(
    "\n📊 Setting up user progress - CleverWolf (intermediate user)...",
  );

  await sql`
    INSERT INTO terminal_utopia.consents (user_id, version, consented_at)
    VALUES (${user2.id}, 'v1.0', NOW() - INTERVAL '3 days')
  `;

  await sql`
    INSERT INTO terminal_utopia.user_module_progress (user_id, module_id, status, started_at, completed_at, response_data)
    VALUES (
      ${user2.id},
      (SELECT id FROM terminal_utopia.modules WHERE name = 'consent'),
      'COMPLETED',
      NOW() - INTERVAL '3 days',
      NOW() - INTERVAL '3 days',
      '{"agreed": true, "signature": "CleverWolf"}'::json
    )
  `;

  await sql`
    INSERT INTO terminal_utopia.user_module_progress (user_id, module_id, status, started_at, response_data)
    VALUES (
      ${user2.id},
      (SELECT id FROM terminal_utopia.modules WHERE name = 'module1'),
      'IN_PROGRESS',
      NOW() - INTERVAL '1 day',
      '{"age": 35, "occupation": "Teacher"}'::json
    )
  `;

  await sql`
    UPDATE terminal_utopia.users
    SET active_module = (SELECT id FROM terminal_utopia.modules WHERE name = 'module1')
    WHERE id = ${user2.id}
  `;

  console.log("   ✓ CleverWolf: Completed consent, in progress on module1");

  // User 3: New user, just started consent
  console.log("\n📊 Setting up user progress - SwiftHawk (new user)...");

  await sql`
    INSERT INTO terminal_utopia.user_module_progress (user_id, module_id, status, started_at)
    VALUES (
      ${user3.id},
      (SELECT id FROM terminal_utopia.modules WHERE name = 'consent'),
      'IN_PROGRESS',
      NOW() - INTERVAL '1 day'
    )
  `;

  await sql`
    UPDATE terminal_utopia.users
    SET active_module = (SELECT id FROM terminal_utopia.modules WHERE name = 'consent')
    WHERE id = ${user3.id}
  `;

  console.log("   ✓ SwiftHawk: Just started, in progress on consent");

  // Create audit logs
  console.log("\n📝 Creating audit logs...");

  await sql`
    INSERT INTO terminal_utopia.audits (event_type, user_id, timestamp, details)
    VALUES
      ('LOGIN', ${user1.id}, NOW() - INTERVAL '5 days', '{"ip": "127.0.0.1"}'::json),
      ('CONSENT', ${user1.id}, NOW() - INTERVAL '5 days', '{"version": "v1.0"}'::json),
      ('MODULE_START', ${user1.id}, NOW() - INTERVAL '4 days', '{"module": "module1"}'::json),
      ('MODULE_COMPLETION', ${user1.id}, NOW() - INTERVAL '3 days', '{"module": "module1"}'::json),
      ('MODULE_START', ${user1.id}, NOW() - INTERVAL '2 days', '{"module": "module2"}'::json),
      ('LOGIN', ${user2.id}, NOW() - INTERVAL '3 days', '{"ip": "127.0.0.1"}'::json),
      ('CONSENT', ${user2.id}, NOW() - INTERVAL '3 days', '{"version": "v1.0"}'::json),
      ('MODULE_START', ${user2.id}, NOW() - INTERVAL '1 day', '{"module": "module1"}'::json),
      ('LOGIN', ${user3.id}, NOW() - INTERVAL '1 day', '{"ip": "127.0.0.1"}'::json),
      ('MODULE_START', ${user3.id}, NOW() - INTERVAL '1 day', '{"module": "consent"}'::json)
  `;

  console.log("   ✓ Created 10 audit log entries");

  console.log("\n✅ Database seeded successfully!\n");
  console.log("📋 Test Users:");
  console.log(
    "   • BraveTiger - Advanced (consent ✓, module1 ✓, module2 in progress)",
  );
  console.log(
    "   • CleverWolf - Intermediate (consent ✓, module1 in progress)",
  );
  console.log("   • SwiftHawk - New (consent in progress)");
  console.log("");
} catch (error) {
  console.error("❌ Seeding failed:", error);
  Deno.exit(1);
}
