/**
 * Trust Tokens System (PASETO v4)
 *
 * Ultra-secure token system using PASETO v4 (Ed25519 signatures)
 * + HybridCache (Redis + LRU) for maximum security and performance.
 *
 * Features:
 * - Cryptographically signed tokens with Ed25519 (impossible to forge)
 * - Zero database storage (tokens NOT stored in DB, only metadata in cache)
 * - Flexible expiration (configurable via env or function parameter)
 * - Single-use enforcement (cache status tracking)
 * - 6 layers of security validation
 *
 * Security Layers:
 * 1. PASETO Signature Verification (Ed25519)
 * 2. Expiration Check (configurable time limit)
 * 3. Cache Status Check (single-use enforcement)
 * 4. Database Status Check (application-specific, optional)
 * 5. User Ownership Verification (application-specific, optional)
 * 6. Resource Validation (application-specific, optional)
 */

import { V4 } from 'paseto';
import { generateKeyPairSync, createPrivateKey, createPublicKey, KeyObject } from 'crypto';
import { invitationTokenCache } from '../cache/cache-instances';

// ============================================================================
// Types
// ============================================================================

export interface TrustTokenPayload {
  type: string;
  userId: string;
  memberId?: string;
  resourceId?: string;
  role?: string;
  invitedBy?: string;
  email?: string;
  metadata?: Record<string, any>;
  exp: string;
  iat: string;
}

interface TokenCacheData {
  status: 'pending' | 'used';
  payload: TrustTokenPayload;
  usedAt?: string;
}

// ============================================================================
// Configuration
// ============================================================================

const DEFAULT_EXPIRATION_HOURS = 168; // 7 days
const CACHE_TTL_SECONDS = 7 * 24 * 60 * 60; // 7 days in seconds
const USED_TOKEN_TTL_SECONDS = 24 * 60 * 60; // Keep used tokens for 24h audit trail

// ============================================================================
// Ed25519 Key Management
// ============================================================================

let cachedKeyPair: { privateKey: KeyObject; publicKey: KeyObject } | null = null;

/**
 * Get or generate Ed25519 key pair for PASETO v4
 *
 * In production, store the private key in environment variable PASETO_PRIVATE_KEY
 * For development, a new key pair is generated and logged to console
 */
function getKeyPair(): { privateKey: KeyObject; publicKey: KeyObject } {
  if (cachedKeyPair) {
    return cachedKeyPair;
  }

  const storedPrivateKey = process.env.PASETO_PRIVATE_KEY;

  if (storedPrivateKey) {
    try {
      const privateKey = createPrivateKey({
        key: Buffer.from(storedPrivateKey, 'base64'),
        format: 'der',
        type: 'pkcs8'
      });

      const publicKey = createPublicKey(privateKey);

      cachedKeyPair = { privateKey, publicKey };
      console.log('[PASETO] ✅ Loaded Ed25519 key pair from environment');
      return cachedKeyPair;
    } catch (error) {
      console.error('[PASETO] ❌ Failed to load PASETO_PRIVATE_KEY:', error);
      throw new Error('Invalid PASETO_PRIVATE_KEY format');
    }
  }

  // Generate new key pair (development only)
  console.warn('[PASETO] ⚠️  No PASETO_PRIVATE_KEY found, generating new key pair');

  const { privateKey, publicKey } = generateKeyPairSync('ed25519');

  cachedKeyPair = { privateKey, publicKey };

  // Export and log the private key for storage
  const privateKeyDer = privateKey.export({ format: 'der', type: 'pkcs8' });
  const privateKeyBase64 = Buffer.from(privateKeyDer).toString('base64');

  console.log('\n' + '='.repeat(80));
  console.log('⚠️  SAVE THIS PRIVATE KEY TO YOUR .env FILE:');
  console.log('='.repeat(80));
  console.log(`PASETO_PRIVATE_KEY=${privateKeyBase64}`);
  console.log('='.repeat(80) + '\n');

  return cachedKeyPair;
}

// ============================================================================
// Token Generation
// ============================================================================

/**
 * Generate a Trust Token (PASETO v4)
 *
 * @param data - Token payload data (without exp/iat)
 * @param expirationHours - Optional: custom expiration in hours (overrides env defaults)
 * @returns PASETO token string (format: v4.public.xxxxx)
 *
 * @example
 * // Email verification (uses TOKEN_EMAIL_VERIFICATION_TTL_HOURS or default)
 * const token = await generateTrustToken({
 *   type: 'email_verification',
 *   userId: user.id,
 *   email: user.email
 * });
 *
 * @example
 * // Custom expiration (1 hour)
 * const token = await generateTrustToken({
 *   type: 'password_reset',
 *   userId: user.id
 * }, 1);
 */
export async function generateTrustToken(
  data: Omit<TrustTokenPayload, 'exp' | 'iat'>,
  expirationHours?: number
): Promise<string> {
  const now = new Date();
  const exp = new Date(now.getTime() + (expirationHours || DEFAULT_EXPIRATION_HOURS) * 60 * 60 * 1000);

  const payload: TrustTokenPayload = {
    ...data,
    exp: exp.toISOString(),
    iat: now.toISOString()
  };

  // Sign with PASETO v4 (Ed25519 signature)
  const { privateKey } = getKeyPair();
  const token = await V4.sign(payload as any, privateKey);

  // Store metadata in HybridCache (Redis + LRU)
  const cacheKey = data.memberId || data.userId;
  const cacheData: TokenCacheData = {
    status: 'pending',
    payload
  };

  await invitationTokenCache.set(cacheKey, cacheData, CACHE_TTL_SECONDS);

  console.log(`[TRUST-TOKEN] ✅ Generated ${data.type} token (expires in ${expirationHours || DEFAULT_EXPIRATION_HOURS}h)`);

  return token;
}

/**
 * Alias for backward compatibility
 * @deprecated Use generateTrustToken instead
 */
export const generateInvitationToken = generateTrustToken;

// ============================================================================
// Token Validation
// ============================================================================

/**
 * Validate a Trust Token (PASETO v4)
 *
 * Performs 6 layers of security validation:
 * 1. PASETO signature verification (Ed25519)
 * 2. Expiration check
 * 3. Cache status check (single-use enforcement)
 * 4. (DB status check done by caller)
 * 5. (User ownership check done by caller)
 * 6. (Resource validation done by caller)
 *
 * @param token PASETO token to validate
 * @returns Validation result with payload or error
 *
 * @example
 * const result = await validateTrustToken(token);
 * if (result.valid) {
 *   // Token is valid - perform action
 *   await performAction(result.payload);
 *   await markTokenAsUsed(result.payload.userId);
 * }
 */
export async function validateTrustToken(
  token: string
): Promise<{ valid: boolean; payload?: TrustTokenPayload; error?: string }> {
  try {
    // Layer 1: Verify PASETO signature (Ed25519)
    const { publicKey } = getKeyPair();
    const payload = await V4.verify(token, publicKey) as any as TrustTokenPayload;

    // Layer 2: Check expiration
    if (new Date(payload.exp) < new Date()) {
      console.log(`[TRUST-TOKEN] ❌ Token expired for ${payload.type}`);
      return { valid: false, error: 'Token has expired' };
    }

    // Layer 3: Check cache status (single-use enforcement)
    const cacheKey = payload.memberId || payload.userId;
    const cached = await invitationTokenCache.get(cacheKey);

    if (!cached) {
      console.log(`[TRUST-TOKEN] ❌ Token not found in cache for ${payload.type}`);
      return { valid: false, error: 'Token not found or has expired' };
    }

    if (cached.status === 'used') {
      console.log(`[TRUST-TOKEN] ❌ Token already used for ${payload.type}`);
      return { valid: false, error: 'Token has already been used' };
    }

    // Layers 4-6 are performed by the caller:
    // - DB status check (verify user/resource exists)
    // - User ownership check (verify user owns resource)
    // - Resource validation (verify resource is valid)

    console.log(`[TRUST-TOKEN] ✅ Token validated successfully for ${payload.type}`);
    return { valid: true, payload };

  } catch (error) {
    console.error('[TRUST-TOKEN] ❌ Token validation error:', error);
    return {
      valid: false,
      error: 'Invalid token signature or format'
    };
  }
}

/**
 * Alias for backward compatibility
 * @deprecated Use validateTrustToken instead
 */
export const validateInvitationToken = validateTrustToken;

// ============================================================================
// Token Consumption
// ============================================================================

/**
 * Mark a token as used (single-use enforcement)
 *
 * This should be called AFTER successfully performing the action
 * to prevent the token from being reused.
 *
 * @param memberId Member ID or User ID to mark as used
 * @param auditTTL Optional: TTL in seconds for audit trail (default: 24 hours)
 *
 * @example
 * // After email verification
 * await markTokenAsUsed(userId);
 *
 * @example
 * // With custom audit TTL (7 days)
 * await markTokenAsUsed(userId, 7 * 24 * 60 * 60);
 */
export async function markTokenAsUsed(memberId: string, auditTTL?: number): Promise<void> {
  try {
    const cached = await invitationTokenCache.get(memberId);

    if (cached) {
      const updatedData: TokenCacheData = {
        ...cached,
        status: 'used',
        usedAt: new Date().toISOString()
      };

      // Keep used tokens for audit trail (default: 24 hours)
      const ttl = auditTTL ?? (24 * 60 * 60);
      await invitationTokenCache.set(memberId, updatedData, ttl);

      console.log(`[TRUST-TOKEN] ✅ Token marked as used for ${cached.payload.type}`);
    }
  } catch (error) {
    console.error(`[TRUST-TOKEN] ❌ Error marking token as used:`, error);
    // Don't throw - this is a non-critical operation
  }
}

// ============================================================================
// Utility Functions
// ============================================================================

/**
 * Invalidate a token (e.g., when action is cancelled)
 *
 * @param memberId Member ID or User ID to invalidate
 *
 * @example
 * // Cancel invitation
 * await invalidateToken(memberId);
 */
export async function invalidateToken(memberId: string): Promise<void> {
  try {
    await invitationTokenCache.delete(memberId);
    console.log(`[TRUST-TOKEN] ✅ Token invalidated`);
  } catch (error) {
    console.error(`[TRUST-TOKEN] ❌ Error invalidating token:`, error);
  }
}

