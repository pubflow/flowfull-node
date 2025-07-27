// Enhanced Session Cache System (Compatible with Flowless)
import { LRUCache } from 'lru-cache';
import type { CachedUser } from './user-cache';
import type { ValidationModeType } from './config';
import { getAuthConfig } from './config';

export interface CachedSessionData {
  user: CachedUser;
  expiresAt: string;
  sessionExpiresAt?: string;
  ipAddress: string;
  userAgent?: string;
  userDevice?: string;
  cachedAt: string;
  lastValidated: string;
}

export interface SessionValidationResult {
  session: CachedSessionData;
  user: CachedUser;
  fromCache: boolean;
}

class EnhancedSessionCache {
  private cache: LRUCache<string, CachedSessionData> | null = null;
  private enabled: boolean = false;
  private validationMode: ValidationModeType;
  private maxEntries: number;

  constructor() {
    const authConfig = getAuthConfig();
    this.validationMode = authConfig.VALIDATION_MODE;
    this.enabled = authConfig.ENABLE_VALIDATION_MODE;
    this.maxEntries = authConfig.USER_CACHE_MAX_ENTRIES;

    if (this.enabled) {
      this.initializeCache();
    }
  }

  private initializeCache(): void {
    this.cache = new LRUCache<string, CachedSessionData>({
      max: this.maxEntries,
      ttl: 0, // Dynamic TTL based on session expiration
      updateAgeOnGet: false,
      allowStale: false
    });
  }

  /**
   * Generate simple cache key
   */
  private generateCacheKey(sessionId: string): string {
    return `session:${sessionId}`;
  }

  /**
   * Check if session is still valid based on expiration
   */
  private isSessionValid(sessionData: CachedSessionData): boolean {
    const now = Date.now();

    // Check session expiration if available
    if (sessionData.sessionExpiresAt) {
      const sessionExpiresAt = new Date(sessionData.sessionExpiresAt).getTime();
      if (sessionExpiresAt <= now) {
        return false;
      }
    }

    return true;
  }

  /**
   * Get session from cache
   */
  get(sessionId: string): SessionValidationResult | null {
    if (!this.enabled || !this.cache) {
      return null;
    }

    try {
      const cacheKey = this.generateCacheKey(sessionId);
      const cached = this.cache.get(cacheKey);

      if (!cached) {
        return null;
      }

      // Check if session is still valid
      if (!this.isSessionValid(cached)) {
        this.cache.delete(cacheKey);
        return null;
      }

      return {
        session: cached,
        user: cached.user,
        fromCache: true
      };

    } catch (error) {
      console.error('Cache get error:', error);
      return null;
    }
  }

  /**
   * Set session in cache with dynamic TTL
   */
  set(sessionId: string, sessionData: Omit<CachedSessionData, 'cachedAt'>): void {
    if (!this.enabled || !this.cache) {
      return;
    }

    try {
      const now = new Date();
      const cachedData: CachedSessionData = {
        ...sessionData,
        cachedAt: now.toISOString()
      };

      const cacheKey = this.generateCacheKey(sessionId);

      // Calculate dynamic TTL based on session expiration
      const sessionExpiresAt = new Date(sessionData.sessionExpiresAt || sessionData.expiresAt).getTime();
      const timeUntilExpiry = sessionExpiresAt - now.getTime();

      // Only cache if session hasn't expired
      if (timeUntilExpiry > 0) {
        this.cache.set(cacheKey, cachedData, { ttl: timeUntilExpiry });
      }

    } catch (error) {
      console.error('Cache set error:', error);
    }
  }

  /**
   * Invalidate session from cache
   */
  invalidate(sessionId: string): void {
    if (!this.enabled || !this.cache) {
      return;
    }

    const cacheKey = this.generateCacheKey(sessionId);
    this.cache.delete(cacheKey);
  }

  /**
   * Clear all cache entries
   */
  clear(): void {
    if (!this.enabled || !this.cache) {
      return;
    }

    this.cache.clear();
  }

  /**
   * Get cache statistics
   */
  getStats() {
    if (!this.enabled || !this.cache) {
      return { enabled: false };
    }

    return {
      enabled: true,
      size: this.cache.size,
      max: this.cache.max,
      validationMode: this.validationMode
    };
  }
}

// Export singleton instance
export const enhancedSessionCache = new EnhancedSessionCache();
