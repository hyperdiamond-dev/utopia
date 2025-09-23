// Quick database connection test
import "@std/dotenv/load";
import { sql } from "./db/connection.ts";

async function testConnection() {
  try {
    console.log("🧪 Testing database connection...");
    
    // Test basic connection
    const result = await sql`SELECT NOW() as current_time`;
    console.log("✅ Database connected successfully");
    console.log("📅 Current time:", result[0]?.current_time);
    
    // Test schema access
    try {
      const schemaTest = await sql`
        SELECT table_name 
        FROM information_schema.tables 
        WHERE table_schema = 'terminal_utopia' 
        ORDER BY table_name
      `;
      console.log("✅ terminal_utopia schema tables found:", 
        schemaTest.map((row: any) => row.table_name));
    } catch (e) {
      console.error("❌ Schema test failed:", e.message);
    }
    
    // Test users table specifically
    try {
      const userTest = await sql`
        SELECT COUNT(*) as count 
        FROM terminal_utopia.users
      `;
      console.log("✅ Users table accessible, count:", userTest[0]?.count);
    } catch (e) {
      console.error("❌ Users table test failed:", e.message);
    }
    
  } catch (error) {
    console.error("❌ Database connection failed:", error.message);
    process.exit(1);
  }
}

// Run the test
testConnection();
