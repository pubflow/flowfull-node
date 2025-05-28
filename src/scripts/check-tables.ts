#!/usr/bin/env bun

/**
 * Check Tables Script
 * Verifies what tables exist in the database
 */

import { getDatabase } from '@/lib/database/connection';
import { sql } from 'kysely';

async function checkTables() {
  console.log('🔍 Checking database tables...\n');

  try {
    const db = await getDatabase();

    // Get list of tables (SQLite specific)
    const tables = await sql`
      SELECT name FROM sqlite_master
      WHERE type='table'
      ORDER BY name
    `.execute(db);

    console.log('📋 Existing tables:');
    if (tables.rows.length === 0) {
      console.log('   ❌ No tables found - database might not be migrated');
    } else {
      for (const table of tables.rows) {
        console.log(`   ✅ ${table.name}`);
      }
    }

    console.log(`\n📊 Total tables: ${tables.rows.length}`);

    // Check if required tables exist
    const requiredTables = [
      'payment_users',
      'payment_providers',
      'payments',
      'payment_methods',
      'customers',
      'billing_addresses',
      'payment_webhooks',
      'payment_events',
      'refunds'
    ];

    console.log('\n🔧 Required tables check:');
    const existingTableNames = tables.rows.map(row => row.name as string);

    for (const requiredTable of requiredTables) {
      const exists = existingTableNames.includes(requiredTable);
      const icon = exists ? '✅' : '❌';
      console.log(`   ${icon} ${requiredTable}`);
    }

    const missingTables = requiredTables.filter(table =>
      !existingTableNames.includes(table)
    );

    if (missingTables.length > 0) {
      console.log('\n⚠️  Missing tables detected!');
      console.log('   Run: bun run db:migrate');
    } else {
      console.log('\n🎉 All required tables exist!');
    }

  } catch (error) {
    console.error('❌ Failed to check tables:', error);
    process.exit(1);
  }
}

async function main() {
  try {
    await checkTables();
    process.exit(0);
  } catch (error) {
    console.error('❌ Script failed:', error);
    process.exit(1);
  }
}

// Run if called directly
if (import.meta.main) {
  main().catch(error => {
    console.error('❌ Script execution failed:', error);
    process.exit(1);
  });
}
