#!/usr/bin/env bun

/**
 * Script to cleanup expired rate limit entries
 * Usage: bun run src/scripts/cleanup-rate-limits.ts
 */

import { getDatabase } from '@/lib/database/connection';

async function cleanupExpiredRateLimits() {
  try {
    const db = await getDatabase();
    const now = new Date().toISOString();
    
    console.log('🧹 Starting rate limits cleanup...');
    
    // Delete expired entries
    const result = await db.deleteFrom('rate_limits')
      .where('expires', '<', now)
      .execute();
    
    console.log(`✅ Cleaned up ${result.length || 0} expired rate limit entries`);
    
    // Get current count
    const currentCount = await db.selectFrom('rate_limits')
      .select(db => db.fn.count('key').as('count'))
      .executeTakeFirst();
    
    console.log(`📊 Current active rate limits: ${currentCount?.count || 0}`);
    
  } catch (error) {
    console.error('❌ Error cleaning up rate limits:', error);
    process.exit(1);
  }
}

async function showRateLimitStats() {
  try {
    const db = await getDatabase();
    const now = new Date().toISOString();
    
    console.log('\n📈 Rate Limit Statistics:');
    console.log('=' .repeat(40));
    
    // Total entries
    const total = await db.selectFrom('rate_limits')
      .select(db => db.fn.count('key').as('count'))
      .executeTakeFirst();
    
    // Expired entries
    const expired = await db.selectFrom('rate_limits')
      .select(db => db.fn.count('key').as('count'))
      .where('expires', '<', now)
      .executeTakeFirst();
    
    // Active entries
    const active = await db.selectFrom('rate_limits')
      .select(db => db.fn.count('key').as('count'))
      .where('expires', '>=', now)
      .executeTakeFirst();
    
    console.log(`Total entries: ${total?.count || 0}`);
    console.log(`Active entries: ${active?.count || 0}`);
    console.log(`Expired entries: ${expired?.count || 0}`);
    
    // Show top actions
    const topActions = await db.selectFrom('rate_limits')
      .select(['key'])
      .where('expires', '>=', now)
      .execute();
    
    const actionCounts: Record<string, number> = {};
    topActions.forEach(entry => {
      const action = entry.key.split(':')[1] || 'unknown';
      actionCounts[action] = (actionCounts[action] || 0) + 1;
    });
    
    console.log('\n🔥 Top Actions:');
    Object.entries(actionCounts)
      .sort(([,a], [,b]) => b - a)
      .slice(0, 5)
      .forEach(([action, count]) => {
        console.log(`   ${action}: ${count} entries`);
      });
    
  } catch (error) {
    console.error('❌ Error getting rate limit stats:', error);
  }
}

async function main() {
  const command = process.argv[2];
  
  switch (command) {
    case 'cleanup':
      await cleanupExpiredRateLimits();
      break;
    case 'stats':
      await showRateLimitStats();
      break;
    case 'both':
    default:
      await showRateLimitStats();
      await cleanupExpiredRateLimits();
      break;
  }
  
  console.log('\n✨ Done!');
}

if (import.meta.main) {
  main().catch(console.error);
}
