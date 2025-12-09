/**
 * Cache Instances
 * 
 * Pre-configured HybridCache instances for common use cases in Flowfull.
 * 
 * Available Caches:
 * - userContextCache: User session data and authentication info
 * - permissionsCache: User permissions and authorization data
 * 
 * Usage:
 * ```typescript
 * import { userContextCache } from '@/lib/cache/cache-instances';
 * 
 * // Get from cache
 * const user = await userContextCache.get(userId);
 * 
 * // Set in cache
 * await userContextCache.set(userId, userData, 300);
 * 
 * // Delete from cache
 * await userContextCache.delete(userId);
 * ```
 */

import { HybridCache } from './hybrid-cache';

// ============================================================================
// Cache Instance Configurations
// ============================================================================

/**
 * User Context Cache
 * 
 * Stores: User session data, authentication info, basic user details
 * TTL: 5 minutes (300 seconds)
 * Size: 10,000 users
 * Usage: Auth middleware, user lookups
 */
export const userContextCache = new HybridCache<{
  id: string;
  email: string;
  name: string;
  last_name?: string;
  user_type: string;
  profile_picture?: string;
  created_at: string;
}>({
  cacheType: 'userContext',
  ttl: 300, // 5 minutes
  maxSize: 10000,
  keyPrefix: 'user_ctx',
});

/**
 * Permissions Cache
 *
 * Stores: User permissions, roles, custom permissions
 * TTL: 10 minutes (600 seconds)
 * Size: 50,000 permission checks
 * Usage: Permission checker, authorization
 */
export const permissionsCache = new HybridCache<{
  userId: string;
  resourceId?: string;
  resourceType?: string;
  isOwner?: boolean;
  isAdmin?: boolean;
  customPermissions?: Record<string, boolean>;
  rolePermissions?: Record<string, boolean>;
  hasAccess: boolean;
}>({
  cacheType: 'permissions',
  ttl: 600, // 10 minutes
  maxSize: 50000,
  keyPrefix: 'perm',
});

/**
 * Trust Token Cache (PASETO)
 *
 * Stores: PASETO token metadata for single-use enforcement
 * TTL: 7 days (604800 seconds) - Default, configurable per token
 * Size: 50,000 tokens
 * Usage: Token validation, single-use enforcement
 *
 * Supports ANY token type:
 * - email_verification
 * - password_reset
 * - invitation
 * - magic_link
 * - api_key
 * - custom types (anything you need!)
 *
 * Security Features:
 * - Tokens are NOT stored in database (only metadata in cache)
 * - Cryptographically signed with PASETO v4 (Ed25519)
 * - Auto-expiration via Redis TTL
 * - Single-use enforcement via status tracking
 * - Audit trail for used tokens
 */
export const invitationTokenCache = new HybridCache<{
  status: 'pending' | 'used';
  payload: {
    type: string; // ANY type (email_verification, password_reset, invitation, custom, etc.)
    userId: string;
    memberId?: string;
    resourceId?: string;
    role?: string;
    invitedBy?: string;
    email?: string;
    metadata?: Record<string, any>; // Store any custom data
    exp: string;
    iat: string;
  };
  usedAt?: string;
}>({
  cacheType: 'other',
  ttl: 604800, // 7 days (default)
  maxSize: 50000,
  keyPrefix: 'trust_token',
});

// ============================================================================
// Helper Functions
// ============================================================================

/**
 * Get all cache instances
 */
export function getAllCacheInstances() {
  return {
    userContextCache,
    permissionsCache,
    invitationTokenCache,
  };
}

/**
 * Get combined metrics from all caches
 */
export function getAllCacheMetrics() {
  const instances = getAllCacheInstances();

  return {
    userContext: userContextCache.getMetrics(),
    permissions: permissionsCache.getMetrics(),
    invitationToken: invitationTokenCache.getMetrics(),
    summary: {
      totalRequests: Object.values(instances).reduce((sum, cache) => sum + cache.getMetrics().totalRequests, 0),
      totalHits: Object.values(instances).reduce((sum, cache) => sum + cache.getMetrics().cacheHits, 0),
      totalMisses: Object.values(instances).reduce((sum, cache) => sum + cache.getMetrics().cacheMisses, 0),
      totalErrors: Object.values(instances).reduce((sum, cache) => sum + cache.getMetrics().errors, 0),
      averageHitRate: Object.values(instances).reduce((sum, cache) => sum + cache.getMetrics().hitRatePercentage, 0) / Object.values(instances).length,
    },
  };
}

/**
 * Clear all caches
 */
export async function clearAllCaches() {
  const instances = getAllCacheInstances();
  await Promise.all(Object.values(instances).map(cache => cache.clear()));
  console.log('[CACHE] ✅ All caches cleared');
}

/**
 * Reset all cache metrics
 */
export function resetAllCacheMetrics() {
  const instances = getAllCacheInstances();
  Object.values(instances).forEach(cache => cache.resetMetrics());
  console.log('[CACHE] ✅ All cache metrics reset');
}

/**
 * Check Redis availability across all caches
 */
export function checkRedisAvailability() {
  const instances = getAllCacheInstances();
  return {
    userContext: userContextCache.isRedisAvailable(),
    permissions: permissionsCache.isRedisAvailable(),
    invitationToken: invitationTokenCache.isRedisAvailable(),
    allAvailable: Object.values(instances).every(cache => cache.isRedisAvailable()),
    anyAvailable: Object.values(instances).some(cache => cache.isRedisAvailable()),
  };
}

/**
 * Close all cache connections
 */
export async function closeAllCaches() {
  const instances = getAllCacheInstances();
  await Promise.all(Object.values(instances).map(cache => cache.close()));
  console.log('[CACHE] ✅ All cache connections closed');
}

