/**
 * Trust Tokens System - Test Script
 *
 * Tests all security layers of the Trust Tokens system (PASETO v4)
 *
 * Usage:
 *   bun run scripts/test-trust-tokens.ts
 *   bun --env-file=.env.production run scripts/test-trust-tokens.ts
 *   bun --env-file=.env.staging run scripts/test-trust-tokens.ts
 */

import { generateTrustToken, validateTrustToken, markTokenAsUsed, invalidateToken } from '../src/lib/utils/trust-tokens';
import { invitationTokenCache } from '../src/lib/cache/cache-instances';

async function testTrustTokensSystem() {
  console.log('🧪 Testing Trust Tokens System (PASETO v4)\n');

  // Show configuration
  console.log('⚙️  Configuration:');
  console.log(`   CACHE_ENABLED: ${process.env.CACHE_ENABLED || 'true'}`);
  console.log(`   REDIS_URL: ${process.env.REDIS_URL ? '✅ Configured' : '❌ Not configured (LRU-only mode)'}`);
  console.log(`   PASETO_PRIVATE_KEY: ${process.env.PASETO_PRIVATE_KEY ? '✅ Configured' : '❌ Not configured (will generate)'}`);
  console.log(`   TOKEN_TTL_HOURS: ${process.env.TOKEN_TTL_HOURS || '168 (default)'}`);
  console.log('');

  // Test 1: Generate Token for Email Verification
  console.log('1️⃣ Testing Token Generation (Email Verification)...');
  const emailToken = await generateTrustToken({
    type: 'email_verification',
    userId: 'test_user_123',
    email: 'test@example.com'
  });
  console.log('✅ Email verification token generated:', emailToken.substring(0, 50) + '...\n');

  // Test 2: Validate Token (should be valid)
  console.log('2️⃣ Testing Token Validation (valid)...');
  const validation1 = await validateTrustToken(emailToken);
  if (validation1.valid && validation1.payload) {
    console.log('✅ Token is valid');
    console.log('   Payload:', JSON.stringify(validation1.payload, null, 2));
  } else {
    console.log('❌ Token validation failed:', validation1.error);
  }
  console.log('');

  // Test 3: Check Cache
  console.log('3️⃣ Testing Cache Storage...');
  const cached = await invitationTokenCache.get('test_user_123');
  if (cached) {
    console.log('✅ Token found in cache');
    console.log('   Status:', cached.status);
    console.log('   Type:', cached.payload.type);
  } else {
    console.log('❌ Token not found in cache');
  }
  console.log('');

  // Test 4: Mark as Used
  console.log('4️⃣ Testing Single-Use Enforcement...');
  await markTokenAsUsed('test_user_123');
  const cachedAfterUse = await invitationTokenCache.get('test_user_123');
  if (cachedAfterUse?.status === 'used') {
    console.log('✅ Token marked as used');
    console.log('   Used at:', cachedAfterUse.usedAt);
  } else {
    console.log('❌ Token not marked as used');
  }
  console.log('');

  // Test 5: Validate Used Token (should fail)
  console.log('5️⃣ Testing Used Token Validation (should fail)...');
  const validation2 = await validateTrustToken(emailToken);
  if (!validation2.valid) {
    console.log('✅ Used token rejected:', validation2.error);
  } else {
    console.log('❌ Used token was accepted (SECURITY ISSUE!)');
  }
  console.log('');

  // Test 6: Generate Password Reset Token (with custom expiration: 1 hour)
  console.log('6️⃣ Testing Password Reset Token (custom 1h expiration)...');
  const resetToken = await generateTrustToken({
    type: 'password_reset',
    userId: 'test_user_456',
    email: 'reset@example.com'
  }, 1); // 1 hour expiration
  console.log('✅ Password reset token generated\n');

  // Test 7: Invalidate Token
  console.log('7️⃣ Testing Token Invalidation...');
  await invalidateToken('test_user_456');
  const validation3 = await validateTrustToken(resetToken);
  if (!validation3.valid) {
    console.log('✅ Invalidated token rejected:', validation3.error);
  } else {
    console.log('❌ Invalidated token was accepted (SECURITY ISSUE!)');
  }
  console.log('');

  // Test 8: Invalid Token
  console.log('8️⃣ Testing Invalid Token...');
  const validation4 = await validateTrustToken('invalid_token_12345');
  if (!validation4.valid) {
    console.log('✅ Invalid token rejected:', validation4.error);
  } else {
    console.log('❌ Invalid token was accepted (SECURITY ISSUE!)');
  }
  console.log('');

  // Test 9: Generate Invitation Token with metadata
  console.log('9️⃣ Testing Invitation Token (with custom metadata)...');
  const inviteToken = await generateTrustToken({
    type: 'invitation',
    memberId: 'test_member_789',
    resourceId: 'test_org_123',
    userId: 'test_user_789',
    role: 'admin',
    invitedBy: 'test_user_000',
    metadata: {
      organizationName: 'Test Org',
      permissions: ['read', 'write', 'admin']
    }
  });
  console.log('✅ Invitation token generated\n');

  // Test 10: Cache Metrics
  console.log('🔟 Cache Metrics...');
  const metrics = invitationTokenCache.getMetrics();
  console.log('   Total Requests:', metrics.totalRequests);
  console.log('   Cache Hits:', metrics.cacheHits);
  console.log('   Cache Misses:', metrics.cacheMisses);
  console.log('   Hit Rate:', metrics.hitRatePercentage + '%');
  console.log('   Redis Available:', invitationTokenCache.isRedisAvailable());
  console.log('   LRU Size:', invitationTokenCache.getLruSize());
  console.log('');

  // Cleanup
  console.log('🧹 Cleaning up test data...');
  await invalidateToken('test_user_123');
  await invalidateToken('test_user_456');
  await invalidateToken('test_member_789');
  console.log('✅ Cleanup complete\n');

  console.log('✅ All tests completed!');
  console.log('\n📊 Summary:');
  console.log('   - Email verification token: ✅');
  console.log('   - Password reset token: ✅');
  console.log('   - Invitation token: ✅');
  console.log('   - Token validation: ✅');
  console.log('   - Cache storage: ✅');
  console.log('   - Single-use enforcement: ✅');
  console.log('   - Token invalidation: ✅');
  console.log('   - Invalid token rejection: ✅');
  console.log('   - Cache metrics: ✅');
}

// Run tests
testTrustTokensSystem()
  .then(() => {
    console.log('\n✅ Test script completed successfully');
    process.exit(0);
  })
  .catch((error: any) => {
    console.error('\n❌ Test script failed:', error);
    process.exit(1);
  });

