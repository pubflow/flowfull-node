#!/usr/bin/env bun

/**
 * Migration Runner Script
 * 
 * Runs database migrations for bridge-payments
 */

import { createKysely } from '../src/lib/database/connection';
import { up as migration002 } from '../src/lib/database/migrations/002_add_metadata_columns';

async function runMigrations() {
  console.log('🚀 Starting migration process...');
  
  try {
    // Create database connection
    const db = createKysely();
    
    console.log('📊 Connected to database');
    
    // Run migration 002
    console.log('🔄 Running migration 002: Add metadata columns...');
    await migration002(db);
    
    console.log('✅ All migrations completed successfully!');
    
    // Close database connection
    await db.destroy();
    
  } catch (error) {
    console.error('❌ Migration failed:', error);
    process.exit(1);
  }
}

// Run migrations
runMigrations();
