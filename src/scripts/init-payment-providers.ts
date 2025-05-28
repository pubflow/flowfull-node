#!/usr/bin/env bun

/**
 * Payment Providers Initialization Script
 * Executes SQL initialization following native-payments standards
 */

import { promises as fs } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { getDatabase } from '@/lib/database/connection';
import { sql } from 'kysely';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

async function executeInitSQL() {
  console.log('🚀 Initializing payment providers from SQL file...');
  console.log('📋 Following native-payments standards\n');

  try {
    // Read the SQL file
    const sqlPath = join(__dirname, '../../sql/init-providers.sql');
    const sqlContent = await fs.readFile(sqlPath, 'utf-8');
    
    console.log('📄 Reading SQL file:', sqlPath);
    
    // Get database connection
    const db = await getDatabase();
    
    // Split SQL into individual statements (simple approach)
    const statements = sqlContent
      .split(';')
      .map(stmt => stmt.trim())
      .filter(stmt => stmt.length > 0 && !stmt.startsWith('--'));
    
    console.log(`🔧 Executing ${statements.length} SQL statements...\n`);
    
    let successCount = 0;
    
    for (const statement of statements) {
      if (statement.toLowerCase().includes('insert') || statement.toLowerCase().includes('replace')) {
        try {
          await sql.raw(statement).execute(db);
          
          // Extract provider name from INSERT statement for better logging
          const providerMatch = statement.match(/'(stripe|paypal)'/);
          const providerName = providerMatch ? providerMatch[1] : 'unknown';
          
          console.log(`   ✅ Initialized provider: ${providerName}`);
          successCount++;
        } catch (error) {
          console.error(`   ❌ Failed to execute statement:`, error);
          console.error(`   Statement: ${statement.substring(0, 100)}...`);
        }
      }
    }
    
    console.log(`\n📊 Initialization Summary:`);
    console.log(`   ✅ Successfully initialized: ${successCount} providers`);
    
    // Verify the results
    console.log('\n🔍 Verifying initialization...');
    const providers = await db
      .selectFrom('payment_providers')
      .select(['id', 'display_name', 'is_active', 'supports_subscriptions', 'supports_saved_methods'])
      .where('id', 'in', ['stripe', 'paypal'])
      .execute();
    
    console.log('\n📋 Initialized providers:');
    for (const provider of providers) {
      console.log(`   • ${provider.display_name} (${provider.id})`);
      console.log(`     - Active: ${provider.is_active ? 'Yes' : 'No'}`);
      console.log(`     - Subscriptions: ${provider.supports_subscriptions ? 'Yes' : 'No'}`);
      console.log(`     - Saved Methods: ${provider.supports_saved_methods ? 'Yes' : 'No'}`);
    }
    
    if (providers.length === 2) {
      console.log('\n🎉 Payment providers initialization completed successfully!');
      console.log('\n🔗 Next steps:');
      console.log('   1. Configure your provider API keys in environment variables');
      console.log('   2. Run: bun run validate-config');
      console.log('   3. Run: bun run test-providers');
      console.log('   4. Start the server: bun run dev');
    } else {
      console.log('\n⚠️  Not all providers were initialized correctly.');
      process.exit(1);
    }
    
  } catch (error) {
    console.error('❌ Failed to initialize payment providers:', error);
    process.exit(1);
  }
}

async function main() {
  try {
    await executeInitSQL();
    process.exit(0);
  } catch (error) {
    console.error('❌ Initialization script failed:', error);
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
