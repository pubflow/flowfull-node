#!/usr/bin/env bun

import { getDatabase } from '@/lib/database/connection';
import { config } from '@/config/environment';

async function confirmReset(): Promise<boolean> {
  if (config.NODE_ENV === 'production') {
    console.error('❌ Database reset is not allowed in production environment');
    return false;
  }

  console.log('⚠️  WARNING: This will delete ALL data in the database!');
  console.log(`Environment: ${config.NODE_ENV}`);
  console.log(`Database: ${config.DATABASE_URL.replace(/\/\/.*@/, '//***:***@')}`);
  
  // In test environment, auto-confirm
  if (config.NODE_ENV === 'test') {
    return true;
  }

  // For development, require explicit confirmation
  const readline = await import('readline');
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout
  });

  return new Promise((resolve) => {
    rl.question('Type "RESET" to confirm database reset: ', (answer) => {
      rl.close();
      resolve(answer === 'RESET');
    });
  });
}

async function dropAllTables() {
  const db = await getDatabase();
  
  console.log('🗑️  Dropping all tables...');

  const tables = [
    'refunds',
    'webhook_events',
    'billing_addresses',
    'customers',
    'payment_methods',
    'payments',
    'payment_providers',
    'payment_users',
    'migrations'
  ];

  for (const table of tables) {
    try {
      await db.schema.dropTable(table).ifExists().execute();
      console.log(`✅ Dropped table: ${table}`);
    } catch (error) {
      console.warn(`⚠️  Could not drop table ${table}:`, error);
    }
  }
}

async function runMigrations() {
  console.log('🔄 Running migrations...');
  
  try {
    // Import and run the migrate script
    const { default: migrate } = await import('./migrate');
    await migrate();
  } catch (error) {
    console.error('❌ Failed to run migrations:', error);
    throw error;
  }
}

async function runSeeding() {
  console.log('🌱 Running seeding...');
  
  try {
    // Import and run the seed script
    const { default: seed } = await import('./seed');
    await seed();
  } catch (error) {
    console.error('❌ Failed to run seeding:', error);
    throw error;
  }
}

async function resetDatabase() {
  console.log('🔄 Starting database reset...');
  
  try {
    // Drop all tables
    await dropAllTables();
    
    // Run migrations to recreate schema
    await runMigrations();
    
    // Run seeding to populate initial data
    await runSeeding();
    
    console.log('✅ Database reset completed successfully');
  } catch (error) {
    console.error('❌ Database reset failed:', error);
    throw error;
  }
}

async function main() {
  try {
    // Confirm reset operation
    const confirmed = await confirmReset();
    
    if (!confirmed) {
      console.log('❌ Database reset cancelled');
      process.exit(1);
    }
    
    await resetDatabase();
    
  } catch (error) {
    console.error('❌ Reset script failed:', error);
    process.exit(1);
  }
  
  process.exit(0);
}

// Run if called directly
if (import.meta.main) {
  main().catch(error => {
    console.error('❌ Reset script failed:', error);
    process.exit(1);
  });
}
