#!/usr/bin/env bun

import { promises as fs } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { getDatabase } from '@/lib/database/connection';
import { sql } from 'kysely';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

interface Migration {
  id: string;
  up: (db: any) => Promise<void>;
  down: (db: any) => Promise<void>;
}

async function createMigrationsTable() {
  const db = await getDatabase();
  
  // Create migrations table if it doesn't exist
  await db.schema
    .createTable('migrations')
    .ifNotExists()
    .addColumn('id', 'varchar(255)', (col) => col.primaryKey())
    .addColumn('executed_at', 'timestamp', (col) => col.notNull().defaultTo(sql`CURRENT_TIMESTAMP`))
    .execute();
}

async function getExecutedMigrations() {
  const db = await getDatabase();
  
  try {
    const executedMigrations = await db
      .selectFrom('migrations')
      .select('id')
      .execute();
    
    return new Set(executedMigrations.map(m => m.id));
  } catch (error) {
    // If migrations table doesn't exist, return empty set
    return new Set<string>();
  }
}

async function getMigrationFiles(): Promise<string[]> {
  const migrationsDir = join(__dirname, '../lib/database/migrations');
  
  try {
    const files = await fs.readdir(migrationsDir);
    return files
      .filter(f => f.endsWith('.ts') || f.endsWith('.js'))
      .sort(); // Ensure migrations run in order
  } catch (error) {
    console.error('❌ Could not read migrations directory:', error);
    return [];
  }
}

async function loadMigration(filePath: string): Promise<Migration> {
  try {
    const migration = await import(filePath);
    const id = filePath.split('/').pop()?.replace(/\.(ts|js)$/, '') || '';
    
    return {
      id,
      up: migration.up,
      down: migration.down
    };
  } catch (error) {
    throw new Error(`Failed to load migration ${filePath}: ${error}`);
  }
}

async function executeMigration(migration: Migration) {
  const db = await getDatabase();
  
  console.log(`🔄 Running migration: ${migration.id}`);
  
  try {
    // Execute migration
    await migration.up(db);
    
    // Record migration as executed
    await db
      .insertInto('migrations')
      .values({ id: migration.id })
      .execute();
    
    console.log(`✅ Completed migration: ${migration.id}`);
  } catch (error) {
    console.error(`❌ Failed migration: ${migration.id}`, error);
    throw error;
  }
}

async function rollbackMigration(migration: Migration) {
  const db = await getDatabase();
  
  console.log(`🔄 Rolling back migration: ${migration.id}`);
  
  try {
    // Execute rollback
    await migration.down(db);
    
    // Remove migration record
    await db
      .deleteFrom('migrations')
      .where('id', '=', migration.id)
      .execute();
    
    console.log(`✅ Rolled back migration: ${migration.id}`);
  } catch (error) {
    console.error(`❌ Failed rollback: ${migration.id}`, error);
    throw error;
  }
}

async function runMigrations() {
  console.log('🚀 Starting database migrations...');
  
  try {
    // Ensure migrations table exists
    await createMigrationsTable();
    
    // Get executed migrations
    const executedMigrations = await getExecutedMigrations();
    
    // Get migration files
    const migrationFiles = await getMigrationFiles();
    
    if (migrationFiles.length === 0) {
      console.log('📝 No migration files found');
      return;
    }
    
    let executedCount = 0;
    
    // Run pending migrations
    for (const file of migrationFiles) {
      const migrationId = file.replace(/\.(ts|js)$/, '');
      
      if (executedMigrations.has(migrationId)) {
        console.log(`⏭️  Skipping migration: ${migrationId} (already executed)`);
        continue;
      }
      
      const migrationPath = join(__dirname, '../lib/database/migrations', file);
      const migration = await loadMigration(migrationPath);
      
      await executeMigration(migration);
      executedCount++;
    }
    
    if (executedCount === 0) {
      console.log('✅ All migrations are up to date');
    } else {
      console.log(`✅ Successfully executed ${executedCount} migration(s)`);
    }
    
  } catch (error) {
    console.error('❌ Migration failed:', error);
    process.exit(1);
  }
}

async function rollbackLastMigration() {
  console.log('🔄 Rolling back last migration...');
  
  try {
    await createMigrationsTable();
    
    const db = await getDatabase();
    
    // Get last executed migration
    const lastMigration = await db
      .selectFrom('migrations')
      .select('id')
      .orderBy('executed_at', 'desc')
      .limit(1)
      .executeTakeFirst();
    
    if (!lastMigration) {
      console.log('📝 No migrations to rollback');
      return;
    }
    
    // Load and execute rollback
    const migrationFiles = await getMigrationFiles();
    const migrationFile = migrationFiles.find(f => f.startsWith(lastMigration.id));
    
    if (!migrationFile) {
      throw new Error(`Migration file not found for: ${lastMigration.id}`);
    }
    
    const migrationPath = join(__dirname, '../lib/database/migrations', migrationFile);
    const migration = await loadMigration(migrationPath);
    
    await rollbackMigration(migration);
    
    console.log('✅ Rollback completed successfully');
    
  } catch (error) {
    console.error('❌ Rollback failed:', error);
    process.exit(1);
  }
}

async function resetDatabase() {
  console.log('🔄 Resetting database...');
  
  try {
    await createMigrationsTable();
    
    const db = await getDatabase();
    
    // Get all executed migrations in reverse order
    const executedMigrations = await db
      .selectFrom('migrations')
      .select('id')
      .orderBy('executed_at', 'desc')
      .execute();
    
    // Rollback all migrations
    for (const { id } of executedMigrations) {
      const migrationFiles = await getMigrationFiles();
      const migrationFile = migrationFiles.find(f => f.startsWith(id));
      
      if (migrationFile) {
        const migrationPath = join(__dirname, '../lib/database/migrations', migrationFile);
        const migration = await loadMigration(migrationPath);
        await rollbackMigration(migration);
      }
    }
    
    console.log('✅ Database reset completed');
    
  } catch (error) {
    console.error('❌ Database reset failed:', error);
    process.exit(1);
  }
}

// CLI interface
async function main() {
  const command = process.argv[2];
  
  switch (command) {
    case 'up':
    case undefined:
      await runMigrations();
      break;
    case 'down':
      await rollbackLastMigration();
      break;
    case 'reset':
      await resetDatabase();
      break;
    default:
      console.log('Usage: bun run migrate [up|down|reset]');
      console.log('  up (default): Run pending migrations');
      console.log('  down: Rollback last migration');
      console.log('  reset: Rollback all migrations');
      process.exit(1);
  }
  
  process.exit(0);
}

// Run if called directly
if (import.meta.main) {
  main().catch(error => {
    console.error('❌ Migration script failed:', error);
    process.exit(1);
  });
}
