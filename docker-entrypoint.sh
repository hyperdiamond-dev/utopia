#!/bin/sh
set -e

echo "🚀 Starting Utopia Application..."
echo ""

# Wait for database to be ready (additional check beyond healthcheck)
echo "⏳ Waiting for database connection..."
until deno run --allow-net --allow-env - <<'EOF'
import "@std/dotenv/load";

const dbUrl = Deno.env.get("DATABASE_URL");
if (!dbUrl) {
  console.error("DATABASE_URL not set");
  Deno.exit(1);
}

// Simple connection test
try {
  const { neon } = await import("@neon/serverless");
  const sql = neon(dbUrl);
  await sql`SELECT 1`;
  console.log("✅ Database connection successful");
} catch (err) {
  console.error("❌ Database connection failed:", err.message);
  Deno.exit(1);
}
EOF
do
  echo "Database not ready, waiting..."
  sleep 2
done

echo ""
echo "🔄 Running database migrations..."
deno run --allow-net --allow-read --allow-env db/init.ts migrate

echo ""
echo "✅ Migrations complete!"
echo ""
echo "🌱 Seeding database with test data..."
deno run --allow-net --allow-read --allow-env db/seed.ts

echo ""
echo "🚀 Starting application server..."
echo ""

# Start the application
exec deno run --allow-net --allow-read --allow-write --allow-env main.ts
