import { join } from '@std/path';
import { sql } from './connection.ts';

export class MigrationRunner {
  private migrationsPath = './db/migrations';

  async runMigrations(): Promise<void> {
    console.log('🚀 Starting database migrations...');
    
    try {
      // Ensure migrations table exists
      await this.ensureMigrationsTable();
      
      // Get all migration files
      const migrationFiles = await this.getMigrationFiles();
      
      // Get applied migrations
      const appliedMigrations = await this.getAppliedMigrations();
      
      // Run pending migrations
      for (const file of migrationFiles) {
        const version = this.getVersionFromFilename(file);
        
        if (!appliedMigrations.includes(version)) {
          console.log(`📝 Applying migration: ${file}`);
          await this.runMigration(file, version);
          console.log(`✅ Applied migration: ${file}`);
        } else {
          console.log(`⏭️  Skipping already applied migration: ${file}`);
        }
      }
      
      console.log('🎉 All migrations completed successfully!');
    } catch (error) {
      console.error('❌ Migration failed:', error);
      throw error;
    }
  }

  private async ensureMigrationsTable(): Promise<void> {
    await sql`
      CREATE TABLE IF NOT EXISTS schema_migrations (
        version VARCHAR PRIMARY KEY,
        applied_at TIMESTAMP WITHOUT TIME ZONE NOT NULL DEFAULT NOW()
      )
    `;
  }

  private async getMigrationFiles(): Promise<string[]> {
    const files: string[] = [];
    
    try {
      for await (const entry of Deno.readDir(this.migrationsPath)) {
        if (entry.isFile && entry.name.endsWith('.sql')) {
          files.push(entry.name);
        }
      }
    } catch (error) {
      if (error instanceof Deno.errors.NotFound) {
        console.log('No migrations directory found');
        return [];
      }
      throw error;
    }
    
    return files.sort(); // Ensure migrations run in order
  }

  private async getAppliedMigrations(): Promise<string[]> {
    const result = await sql`SELECT version FROM schema_migrations ORDER BY applied_at`;
    return (result as { version: string }[]).map(row => row.version);
  }

  private getVersionFromFilename(filename: string): string {
    return filename.replace('.sql', '');
  }

  private async runMigration(filename: string, version: string): Promise<void> {
    const filePath = join(this.migrationsPath, filename);
    const migrationSql = await Deno.readTextFile(filePath);
    
    // Execute the migration SQL
    await sql.unsafe(migrationSql);
    
    // Record the migration as applied
    await sql`
      INSERT INTO schema_migrations (version) 
      VALUES (${version})
      ON CONFLICT (version) DO NOTHING
    `;
  }

  rollback(targetVersion?: string): void {
    console.log('⚠️  Rollback functionality not implemented yet');
    console.log('For now, you can manually revert changes in your database');
    
    if (targetVersion) {
      console.log(`Target version: ${targetVersion}`);
    }
  }

  async status(): Promise<void> {
    const migrationFiles = await this.getMigrationFiles();
    const appliedMigrations = await this.getAppliedMigrations();
    
    console.log('\n📊 Migration Status:');
    console.log('==================');
    
    for (const file of migrationFiles) {
      const version = this.getVersionFromFilename(file);
      const status = appliedMigrations.includes(version) ? '✅ Applied' : '❌ Pending';
      console.log(`${status} - ${file}`);
    }
    
    console.log(`\nTotal migrations: ${migrationFiles.length}`);
    console.log(`Applied: ${appliedMigrations.length}`);
    console.log(`Pending: ${migrationFiles.length - appliedMigrations.length}`);
  }
}

export const migrationRunner = new MigrationRunner();
