import { join } from "@std/path";
import { sql } from "./connection.ts";

export class MigrationRunner {
  private migrationsPath = "./db/migrations";

  async runMigrations(): Promise<void> {
    console.log("🚀 Starting database migrations...");

    try {
      // Ensure schema and migrations table exist
      await this.ensureSchema();
      await this.ensureMigrationsTable();

      // Get all migration files
      const migrationFiles = await this.getMigrationFiles();

      // Get applied migrations
      const appliedMigrations = await this.getAppliedMigrations();

      let applied = 0;
      // Run pending migrations
      for (const file of migrationFiles) {
        const version = this.getVersionFromFilename(file);

        if (!appliedMigrations.includes(version)) {
          console.log(`📝 Applying migration: ${file}`);
          await this.runMigration(file, version);
          console.log(`✅ Applied migration: ${file}`);
          applied++;
        } else {
          console.log(`⏭️  Skipping already applied migration: ${file}`);
        }
      }

      if (applied === 0) {
        console.log("🎉 Database is up to date — no pending migrations.");
      } else {
        console.log(`🎉 Applied ${applied} migration(s) successfully!`);
      }
    } catch (error) {
      console.error("❌ Migration failed:", error);
      throw error;
    }
  }

  private async ensureSchema(): Promise<void> {
    await sql`CREATE SCHEMA IF NOT EXISTS terminal_utopia`;
  }

  private async ensureMigrationsTable(): Promise<void> {
    await sql`
      CREATE TABLE IF NOT EXISTS terminal_utopia.schema_migrations (
        version VARCHAR PRIMARY KEY,
        applied_at TIMESTAMP WITHOUT TIME ZONE NOT NULL DEFAULT NOW()
      )
    `;
  }

  private async getMigrationFiles(): Promise<string[]> {
    const files: string[] = [];

    try {
      for await (const entry of Deno.readDir(this.migrationsPath)) {
        if (entry.isFile && entry.name.endsWith(".sql")) {
          files.push(entry.name);
        }
      }
    } catch (error) {
      if (error instanceof Deno.errors.NotFound) {
        console.log("No migrations directory found");
        return [];
      }
      throw error;
    }

    return files.sort(); // Ensure migrations run in order
  }

  private async getAppliedMigrations(): Promise<string[]> {
    const result = await sql`
      SELECT version FROM terminal_utopia.schema_migrations ORDER BY applied_at
    `;
    return (result as { version: string }[]).map((row) => row.version);
  }

  private getVersionFromFilename(filename: string): string {
    return filename.replace(".sql", "");
  }

  /**
   * Split a SQL file into individual statements and execute them one at a time.
   * Neon's HTTP SQL API does not support multi-statement queries.
   */
  private splitStatements(rawSql: string): string[] {
    const statements: string[] = [];
    let current = "";
    let inDollarQuote = false;
    let dollarTag = "";

    const lines = rawSql.split("\n");

    for (const line of lines) {
      const trimmed = line.trim();

      // Skip empty lines and comments outside of dollar-quoted blocks
      if (!inDollarQuote && (trimmed === "" || trimmed.startsWith("--"))) {
        continue;
      }

      // Check for dollar-quote start/end (used in CREATE FUNCTION bodies)
      const dollarMatches = line.match(/\$([a-zA-Z_]*)\$/g);
      if (dollarMatches) {
        for (const match of dollarMatches) {
          if (!inDollarQuote) {
            inDollarQuote = true;
            dollarTag = match;
          } else if (match === dollarTag) {
            inDollarQuote = false;
            dollarTag = "";
          }
        }
      }

      current += line + "\n";

      // Statement ends at semicolon, but only when not inside a dollar-quoted block
      if (!inDollarQuote && trimmed.endsWith(";")) {
        const stmt = current.trim();
        if (stmt.length > 0) {
          statements.push(stmt);
        }
        current = "";
      }
    }

    // Catch any trailing statement without a semicolon
    const remaining = current.trim();
    if (remaining.length > 0) {
      statements.push(remaining);
    }

    return statements;
  }

  private async runMigration(
    filename: string,
    version: string,
  ): Promise<void> {
    const filePath = join(this.migrationsPath, filename);
    const migrationSql = await Deno.readTextFile(filePath);

    // Split into individual statements for Neon HTTP API compatibility
    const statements = this.splitStatements(migrationSql);

    console.log(`   Running ${statements.length} statement(s)...`);

    for (let i = 0; i < statements.length; i++) {
      const stmt = statements[i];
      // Skip SET search_path — we use fully-qualified table names
      if (stmt.trim().toUpperCase().startsWith("SET SEARCH_PATH")) {
        continue;
      }
      // Skip duplicate migration tracking (each .sql file has its own INSERT INTO schema_migrations)
      // We handle this ourselves after all statements succeed
      if (
        stmt.includes("INSERT INTO terminal_utopia.schema_migrations") ||
        stmt.includes("INSERT INTO schema_migrations")
      ) {
        continue;
      }

      try {
        await sql.unsafe(stmt);
      } catch (error) {
        const preview = stmt.substring(0, 80).replace(/\n/g, " ");
        console.error(`   ❌ Statement ${i + 1} failed: ${preview}...`);
        throw error;
      }
    }

    // Record the migration as applied
    await sql`
      INSERT INTO terminal_utopia.schema_migrations (version)
      VALUES (${version})
      ON CONFLICT (version) DO NOTHING
    `;
  }

  rollback(targetVersion?: string): void {
    console.log("⚠️  Rollback functionality not implemented yet");
    console.log("For now, you can manually revert changes in your database");

    if (targetVersion) {
      console.log(`Target version: ${targetVersion}`);
    }
  }

  async status(): Promise<void> {
    const migrationFiles = await this.getMigrationFiles();
    const appliedMigrations = await this.getAppliedMigrations();

    console.log("\n📊 Migration Status:");
    console.log("==================");

    for (const file of migrationFiles) {
      const version = this.getVersionFromFilename(file);
      const status = appliedMigrations.includes(version)
        ? "✅ Applied"
        : "❌ Pending";
      console.log(`${status} - ${file}`);
    }

    console.log(`\nTotal migrations: ${migrationFiles.length}`);
    console.log(`Applied: ${appliedMigrations.length}`);
    console.log(`Pending: ${migrationFiles.length - appliedMigrations.length}`);
  }
}

export const migrationRunner = new MigrationRunner();
