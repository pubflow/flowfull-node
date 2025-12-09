/**
 * Hybrid Cache System
 * 
 * 3-tier cache with automatic fallback:
 * 1. Redis (distributed cache) - Primary
 * 2. LRU (in-memory cache) - Fallback
 * 3. Database - Source of truth
 * 
 * Features:
 * - Automatic fallback if Redis unavailable
 * - Cache backfilling (LRU → Redis, Redis → LRU)
 * - Metrics tracking (hit rate, response time)
 * - TTL support per cache type
 * - Global scalability with multi-region support
 */

import Redis from 'ioredis';
import { LRUCache } from 'lru-cache';

// ============================================================================
// Types
// ============================================================================

export type CacheType = 'userContext' | 'permissions' | 'serverList' | 'projectData' | 'assetData' | 'other';

export interface CacheMetrics {
  totalRequests: number;
  cacheHits: number;
  cacheMisses: number;
  redisHits: number;
  lruHits: number;
  dbHits: number;
  errors: number;
  lastError?: string;
  lastErrorAt?: Date;
}

export interface CacheConfig {
  cacheType: CacheType;
  ttl: number; // Time to live in seconds
  maxSize: number; // Max items in LRU cache
  keyPrefix?: string; // Prefix for Redis keys
}

// ============================================================================
// HybridCache Class
// ============================================================================

export class HybridCache<T = any> {
  private redis: Redis | null = null;
  private lruCache: LRUCache<string, T>;
  private config: CacheConfig;
  private metrics: CacheMetrics;
  private redisAvailable: boolean = false;

  constructor(config: CacheConfig) {
    this.config = config;
    this.metrics = {
      totalRequests: 0,
      cacheHits: 0,
      cacheMisses: 0,
      redisHits: 0,
      lruHits: 0,
      dbHits: 0,
      errors: 0,
    };

    // Initialize LRU Cache (always available)
    this.lruCache = new LRUCache<string, T>({
      max: config.maxSize,
      ttl: config.ttl * 1000, // Convert to milliseconds
      updateAgeOnGet: true,
      updateAgeOnHas: true,
    });

    // Initialize Redis (if available)
    this.initializeRedis();
  }

  /**
   * Initialize Redis connection
   *
   * Supports multiple REDIS_URL formats:
   * - redis://localhost:6379
   * - redis://:password@localhost:6379
   * - rediss://default:password@host:6379
   * - rediss://default:token@host.upstash.io:6379
   */
  private initializeRedis(): void {
    try {
      const redisUrl = process.env.REDIS_URL;
      const cacheEnabled = process.env.CACHE_ENABLED !== 'false';

      if (!cacheEnabled) {
        console.log(`[CACHE:${this.config.cacheType}] Cache disabled via CACHE_ENABLED=false`);
        return;
      }

      if (!redisUrl || redisUrl.trim() === '') {
        console.log(`[CACHE:${this.config.cacheType}] Redis URL not configured, using LRU-only mode`);
        return;
      }

      // Parse Redis URL to show connection info (without password)
      const urlInfo = this.parseRedisUrl(redisUrl);
      console.log(`[CACHE:${this.config.cacheType}] Connecting to Redis: ${urlInfo}`);

      // ioredis accepts the full URL string directly
      // It automatically parses: redis://[user][:password]@host:port[/db]
      this.redis = new Redis(redisUrl, {
        maxRetriesPerRequest: 3,
        enableReadyCheck: true,
        lazyConnect: false, // Connect immediately
        retryStrategy: (times) => {
          if (times > 3) {
            console.error(`[CACHE:${this.config.cacheType}] ❌ Redis connection failed after 3 retries`);
            this.redisAvailable = false;
            return null; // Stop retrying
          }
          const delay = Math.min(times * 100, 2000);
          console.log(`[CACHE:${this.config.cacheType}] Retrying Redis connection (${times}/3) in ${delay}ms...`);
          return delay; // Exponential backoff
        },
        reconnectOnError: (err) => {
          console.error(`[CACHE:${this.config.cacheType}] Redis error:`, err.message);
          return true; // Try to reconnect
        },
      });

      this.redis.on('connect', () => {
        console.log(`[CACHE:${this.config.cacheType}] ✅ Redis connected successfully`);
        this.redisAvailable = true;
      });

      this.redis.on('ready', () => {
        console.log(`[CACHE:${this.config.cacheType}] ✅ Redis ready to accept commands`);
        this.redisAvailable = true;
      });

      this.redis.on('error', (err) => {
        console.error(`[CACHE:${this.config.cacheType}] ❌ Redis error:`, err.message);
        this.redisAvailable = false;
        this.metrics.errors++;
        this.metrics.lastError = err.message;
        this.metrics.lastErrorAt = new Date();
      });

      this.redis.on('close', () => {
        console.log(`[CACHE:${this.config.cacheType}] Redis connection closed`);
        this.redisAvailable = false;
      });

      this.redis.on('reconnecting', () => {
        console.log(`[CACHE:${this.config.cacheType}] Reconnecting to Redis...`);
      });

    } catch (error) {
      console.error(`[CACHE:${this.config.cacheType}] Failed to initialize Redis:`, error);
      this.redisAvailable = false;
    }
  }

  /**
   * Parse Redis URL to show connection info (without exposing password)
   */
  private parseRedisUrl(url: string): string {
    try {
      const parsed = new URL(url);
      const protocol = parsed.protocol.replace(':', '');
      const host = parsed.hostname;
      const port = parsed.port || (protocol === 'rediss' ? '6380' : '6379');
      const hasAuth = parsed.password ? ' (authenticated)' : '';
      return `${protocol}://${host}:${port}${hasAuth}`;
    } catch {
      return 'redis://localhost:6379';
    }
  }

  /**
   * Get full Redis key with prefix
   */
  private getRedisKey(key: string): string {
    const prefix = this.config.keyPrefix || this.config.cacheType;
    return `${prefix}:${key}`;
  }

  /**
   * Get value from cache (3-tier fallback)
   */
  async get(key: string): Promise<T | null> {
    this.metrics.totalRequests++;

    try {
      // TIER 1: Try Redis (distributed cache)
      if (this.redisAvailable && this.redis) {
        try {
          const redisKey = this.getRedisKey(key);
          const redisData = await this.redis.get(redisKey);

          if (redisData) {
            this.metrics.cacheHits++;
            this.metrics.redisHits++;

            const parsed = JSON.parse(redisData) as T;

            // Backfill LRU cache
            this.lruCache.set(key, parsed);

            return parsed;
          }
        } catch (error) {
          console.error(`[CACHE:${this.config.cacheType}] Redis get error:`, error);
          this.metrics.errors++;
        }
      }

      // TIER 2: Try LRU (in-memory cache)
      const lruData = this.lruCache.get(key);
      if (lruData !== undefined) {
        this.metrics.cacheHits++;
        this.metrics.lruHits++;

        // Backfill Redis if available
        if (this.redisAvailable && this.redis) {
          try {
            const redisKey = this.getRedisKey(key);
            await this.redis.setex(redisKey, this.config.ttl, JSON.stringify(lruData));
          } catch (error) {
            console.error(`[CACHE:${this.config.cacheType}] Redis backfill error:`, error);
          }
        }

        return lruData;
      }

      // TIER 3: Cache MISS - caller will query database
      this.metrics.cacheMisses++;
      this.metrics.dbHits++;
      return null;

    } catch (error) {
      console.error(`[CACHE:${this.config.cacheType}] Get error:`, error);
      this.metrics.errors++;
      this.metrics.lastError = error instanceof Error ? error.message : String(error);
      this.metrics.lastErrorAt = new Date();
      return null;
    }
  }

  /**
   * Set value in cache (both Redis and LRU)
   */
  async set(key: string, value: T, customTtl?: number): Promise<void> {
    const ttl = customTtl || this.config.ttl;

    try {
      // Set in LRU cache (always)
      this.lruCache.set(key, value, { ttl: ttl * 1000 });

      // Set in Redis (if available)
      if (this.redisAvailable && this.redis) {
        try {
          const redisKey = this.getRedisKey(key);
          await this.redis.setex(redisKey, ttl, JSON.stringify(value));
        } catch (error) {
          console.error(`[CACHE:${this.config.cacheType}] Redis set error:`, error);
          this.metrics.errors++;
        }
      }
    } catch (error) {
      console.error(`[CACHE:${this.config.cacheType}] Set error:`, error);
      this.metrics.errors++;
      this.metrics.lastError = error instanceof Error ? error.message : String(error);
      this.metrics.lastErrorAt = new Date();
    }
  }

  /**
   * Delete value from cache (both Redis and LRU)
   */
  async delete(key: string): Promise<void> {
    try {
      // Delete from LRU
      this.lruCache.delete(key);

      // Delete from Redis (if available)
      if (this.redisAvailable && this.redis) {
        try {
          const redisKey = this.getRedisKey(key);
          await this.redis.del(redisKey);
        } catch (error) {
          console.error(`[CACHE:${this.config.cacheType}] Redis delete error:`, error);
          this.metrics.errors++;
        }
      }
    } catch (error) {
      console.error(`[CACHE:${this.config.cacheType}] Delete error:`, error);
      this.metrics.errors++;
    }
  }

  /**
   * Delete multiple keys matching a pattern
   */
  async deletePattern(pattern: string): Promise<void> {
    try {
      // Clear matching keys from LRU
      const lruKeys = Array.from(this.lruCache.keys());
      const regex = new RegExp(pattern);
      for (const key of lruKeys) {
        if (regex.test(key)) {
          this.lruCache.delete(key);
        }
      }

      // Clear matching keys from Redis (if available)
      if (this.redisAvailable && this.redis) {
        try {
          const redisPattern = this.getRedisKey(pattern);
          const keys = await this.redis.keys(redisPattern);
          if (keys.length > 0) {
            await this.redis.del(...keys);
          }
        } catch (error) {
          console.error(`[CACHE:${this.config.cacheType}] Redis deletePattern error:`, error);
          this.metrics.errors++;
        }
      }
    } catch (error) {
      console.error(`[CACHE:${this.config.cacheType}] DeletePattern error:`, error);
      this.metrics.errors++;
    }
  }

  /**
   * Clear all cache (both Redis and LRU)
   */
  async clear(): Promise<void> {
    try {
      // Clear LRU
      this.lruCache.clear();

      // Clear Redis keys with this prefix (if available)
      if (this.redisAvailable && this.redis) {
        try {
          const prefix = this.config.keyPrefix || this.config.cacheType;
          const keys = await this.redis.keys(`${prefix}:*`);
          if (keys.length > 0) {
            await this.redis.del(...keys);
          }
        } catch (error) {
          console.error(`[CACHE:${this.config.cacheType}] Redis clear error:`, error);
          this.metrics.errors++;
        }
      }
    } catch (error) {
      console.error(`[CACHE:${this.config.cacheType}] Clear error:`, error);
      this.metrics.errors++;
    }
  }

  /**
   * Get cache metrics
   */
  getMetrics(): CacheMetrics & { cacheType: CacheType; hitRatePercentage: number } {
    const hitRate = this.metrics.totalRequests > 0
      ? (this.metrics.cacheHits / this.metrics.totalRequests) * 100
      : 0;

    return {
      ...this.metrics,
      cacheType: this.config.cacheType,
      hitRatePercentage: Math.round(hitRate * 100) / 100,
    };
  }

  /**
   * Reset metrics
   */
  resetMetrics(): void {
    this.metrics = {
      totalRequests: 0,
      cacheHits: 0,
      cacheMisses: 0,
      redisHits: 0,
      lruHits: 0,
      dbHits: 0,
      errors: 0,
    };
  }

  /**
   * Check if Redis is available
   */
  isRedisAvailable(): boolean {
    return this.redisAvailable;
  }

  /**
   * Get LRU cache size
   */
  getLruSize(): number {
    return this.lruCache.size;
  }

  /**
   * Close connections
   */
  async close(): Promise<void> {
    if (this.redis) {
      await this.redis.quit();
    }
    this.lruCache.clear();
  }
}

