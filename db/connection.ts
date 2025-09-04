import { neon } from '@neon/serverless';

// Ensure DATABASE_URL is available
const databaseUrl = Deno.env.get('DATABASE_URL');

if (!databaseUrl) {
  throw new Error('DATABASE_URL environment variable is required');
}

// Create and export the SQL connection
export const sql = neon(databaseUrl);

// Export the database URL if needed elsewhere
export { databaseUrl };
