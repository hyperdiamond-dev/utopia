#!/usr/bin/env deno run --allow-net --allow-read --allow-env

import { migrationRunner } from './migrationRunner.ts';

async function main() {
  const command = Deno.args[0];

  switch (command) {
    case 'migrate': {
      await migrationRunner.runMigrations();
      break;
    }
    
    case 'status': {
      await migrationRunner.status();
      break;
    }
    
    case 'rollback': {
      const targetVersion = Deno.args[1];
      migrationRunner.rollback(targetVersion);
      break;
    }
    
    default: {
      console.log('📋 Database Management Commands:');
      console.log('================================');
      console.log('');
      console.log('🔧 deno run --allow-net --allow-read --allow-env db/init.ts migrate   - Run pending migrations');
      console.log('📊 deno run --allow-net --allow-read --allow-env db/init.ts status    - Check migration status');
      console.log('↩️  deno run --allow-net --allow-read --allow-env db/init.ts rollback  - Rollback info');
      console.log('');
      console.log('💡 Make sure to set your DATABASE_URL environment variable first!');
      console.log('   Example: export DATABASE_URL="postgresql://user:pass@host:port/db"');
    }
  }
}

if (import.meta.main) {
  try {
    await main();
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    console.error('❌ Database operation failed:', errorMessage);
    Deno.exit(1);
  }
}
