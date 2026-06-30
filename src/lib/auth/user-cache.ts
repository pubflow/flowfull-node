// Secure User Authentication Cache System
import { LRUCache } from 'lru-cache';
import { runtimeRandomSecret, sha256Hex } from '@/lib/runtime';

export interface CachedUser {
  id: string;
  email: string;
  name: string;
  userType: string;
  isVerified: boolean;
  firstName?: string;
  lastName?: string;
  // Security metadata
  cachedAt: string;
  expiresAt: string;
  sessionExpiresAt?: string;
  tokenType: 'session' | 'token_login';
  originalIdentifier: string; // For audit trail
}

interface CacheEntry {
  user: CachedUser;
  lastValidated: string;
  hitCount: number;
  hash: string; // Security hash to prevent tampering
}

class SecureUserCache {
  private cache: LRUCache<string, CacheEntry>;
  private readonly CACHE_TTL = 10 * 60 * 1000; // 10 minutes (shorter for security)
  private readonly REVALIDATION_THRESHOLD = 3 * 60 * 1000; // 3 minutes
  private readonly MAX_ENTRIES = 500; // Smaller cache for security
  private readonly SECRET_KEY: string;

  constructor() {
    this.SECRET_KEY = process.env.CACHE_SECRET_KEY || runtimeRandomSecret();
    
    this.cache = new LRUCache<string, CacheEntry>({
      max: this.MAX_ENTRIES,
      ttl: this.CACHE_TTL,
      updateAgeOnGet: false, // Don't extend TTL on access for security
      allowStale: false
    });

    // Cleanup expired entries every 5 minutes
    setInterval(() => this.cleanup(), 5 * 60 * 1000);
  }

  /**
   * Generate secure cache key
   */
  private async generateCacheKey(type: 'session' | 'token', identifier: string): Promise<string> {
    const hash = await sha256Hex(`${type}:${identifier}`);
    return `auth:${type}:${hash.substring(0, 16)}`;
  }

  /**
   * Generate security hash for cache entry
   */
  private async generateSecurityHash(user: CachedUser): Promise<string> {
    const data = `${user.id}:${user.email}:${user.userType}:${user.cachedAt}:${this.SECRET_KEY}`;
    return sha256Hex(data);
  }

  /**
   * Verify cache entry integrity
   */
  private async verifyCacheEntry(entry: CacheEntry): Promise<boolean> {
    const expectedHash = await this.generateSecurityHash(entry.user);
    return entry.hash === expectedHash;
  }

  /**
   * Check if cached user is still valid
   */
  private isUserValid(user: CachedUser): boolean {
    const now = new Date();
    
    // Check cache expiration
    if (new Date(user.expiresAt) <= now) {
      return false;
    }

    // Check session expiration if available
    if (user.sessionExpiresAt && new Date(user.sessionExpiresAt) <= now) {
      return false;
    }

    return true;
  }

  /**
   * Check if entry needs revalidation
   */
  private needsRevalidation(entry: CacheEntry): boolean {
    const now = new Date();
    const lastValidated = new Date(entry.lastValidated);
    return (now.getTime() - lastValidated.getTime()) > this.REVALIDATION_THRESHOLD;
  }

  /**
   * Get user from cache with security checks
   */
  async get(type: 'session' | 'token', identifier: string): Promise<CachedUser | null> {
    try {
      const key = await this.generateCacheKey(type, identifier);
      const entry = this.cache.get(key);

      if (!entry) {
        return null;
      }

      // Verify cache entry integrity
      if (!(await this.verifyCacheEntry(entry))) {
        console.warn('🚨 Cache integrity check failed, removing entry');
        this.cache.delete(key);
        return null;
      }

      // Check if user is still valid
      if (!this.isUserValid(entry.user)) {
        this.cache.delete(key);
        return null;
      }

      // Update hit count
      entry.hitCount++;
      this.cache.set(key, entry);

      return entry.user;
    } catch (error) {
      console.error('Cache get error:', error);
      return null;
    }
  }

  /**
   * Set user in cache with security hash
   */
  async set(type: 'session' | 'token', identifier: string, user: CachedUser): Promise<void> {
    try {
      const key = await this.generateCacheKey(type, identifier);
      const securityHash = await this.generateSecurityHash(user);
      
      const entry: CacheEntry = {
        user: {
          ...user,
          originalIdentifier: identifier // Store for audit
        },
        lastValidated: new Date().toISOString(),
        hitCount: 1,
        hash: securityHash
      };

      this.cache.set(key, entry);
    } catch (error) {
      console.error('Cache set error:', error);
    }
  }

  /**
   * Check if user needs revalidation
   */
  async needsValidation(type: 'session' | 'token', identifier: string): Promise<boolean> {
    const key = await this.generateCacheKey(type, identifier);
    const entry = this.cache.get(key);

    if (!entry) {
      return true; // Not in cache, needs validation
    }

    // Always revalidate if integrity check fails
    if (!(await this.verifyCacheEntry(entry))) {
      return true;
    }

    return this.needsRevalidation(entry);
  }

  /**
   * Update last validated timestamp
   */
  async updateValidation(type: 'session' | 'token', identifier: string): Promise<void> {
    const key = await this.generateCacheKey(type, identifier);
    const entry = this.cache.get(key);

    if (entry && await this.verifyCacheEntry(entry)) {
      entry.lastValidated = new Date().toISOString();
      // Regenerate hash with new timestamp
      entry.hash = await this.generateSecurityHash(entry.user);
      this.cache.set(key, entry);
    }
  }

  /**
   * Invalidate user from cache
   */
  async invalidate(type: 'session' | 'token', identifier: string): Promise<void> {
    const key = await this.generateCacheKey(type, identifier);
    this.cache.delete(key);
  }

  /**
   * Clear all cache (security operation)
   */
  clear(): void {
    this.cache.clear();
    console.log('🔒 User cache cleared for security');
  }

  /**
   * Cleanup expired and invalid entries
   */
  async cleanup(): Promise<number> {
    const sizeBefore = this.cache.size;
    
    for (const [key, entry] of this.cache.entries()) {
      // Remove if integrity check fails or user is invalid
      if (!(await this.verifyCacheEntry(entry)) || !this.isUserValid(entry.user)) {
        this.cache.delete(key);
      }
    }

    const cleaned = sizeBefore - this.cache.size;
    if (cleaned > 0) {
      console.log(`🧹 Cleaned ${cleaned} invalid cache entries`);
    }
    
    return cleaned;
  }

  /**
   * Get cache statistics (for monitoring)
   */
  getStats() {
    return {
      size: this.cache.size,
      maxSize: this.MAX_ENTRIES,
      ttl: this.CACHE_TTL,
      revalidationThreshold: this.REVALIDATION_THRESHOLD,
      // Don't expose sensitive data in stats
      healthCheck: this.cache.size < this.MAX_ENTRIES * 0.9
    };
  }

  /**
   * Security audit - check for suspicious activity
   */
  async auditCache(): Promise<{ suspicious: boolean; issues: string[] }> {
    const issues: string[] = [];
    let suspiciousCount = 0;

    for (const [key, entry] of this.cache.entries()) {
      // Check for integrity issues
      if (!(await this.verifyCacheEntry(entry))) {
        issues.push(`Integrity check failed for key: ${key.substring(0, 16)}...`);
        suspiciousCount++;
      }

      // Check for unusual hit patterns
      if (entry.hitCount > 1000) {
        issues.push(`Unusual hit count (${entry.hitCount}) for key: ${key.substring(0, 16)}...`);
      }
    }

    return {
      suspicious: suspiciousCount > 0,
      issues
    };
  }
}

// Singleton instance
export const secureUserCache = new SecureUserCache();

// Export types
export type { CachedUser };
