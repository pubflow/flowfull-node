# HybridCache System

3-tier caching system with automatic fallback for Flowfull.

## Architecture

```
Request → Redis (Tier 1) → LRU (Tier 2) → Database (Tier 3)
          ⚡ 5-10ms        ⚡ 1-2ms        ⚡ 20-50ms
```

## Features

- **3-Tier Fallback**: Redis → LRU → Database
- **Automatic Backfilling**: Cache data across tiers
- **Metrics Tracking**: Hit rate, response time, errors
- **Redis Optional**: Works without Redis (LRU-only mode)
- **Type-Safe**: Full TypeScript support

## Quick Start

### 1. Install Dependencies

```bash
bun add ioredis lru-cache
```

### 2. Configure Environment

```env
# Enable caching
CACHE_ENABLED=true

# Redis URL (optional - if not provided, uses LRU-only mode)
# Supports multiple formats:
# - Standard: redis://localhost:6379
# - With password: redis://:password@localhost:6379
# - SSL/TLS: rediss://default:password@host:6379
# - Upstash: rediss://default:YOUR_TOKEN@your-instance.upstash.io:6379
REDIS_URL=redis://localhost:6379
```

**Important:**
- If `REDIS_URL` is **not configured**, HybridCache automatically uses **LRU-only mode** (in-memory cache only)
- LRU-only mode is perfect for development or single-server deployments
- For production with multiple servers, configure Redis for distributed caching

### 3. Use Pre-configured Caches

```typescript
import { userContextCache } from '@/lib/cache/cache-instances';

// Get from cache
const user = await userContextCache.get(userId);

if (user) {
  console.log('✅ Cache hit!');
  return user;
}

// Cache miss - query database
const userData = await db.selectFrom('users')
  .where('id', '=', userId)
  .selectAll()
  .executeTakeFirst();

// Store in cache
if (userData) {
  await userContextCache.set(userId, userData, 300);
}

return userData;
```

## Available Cache Instances

### userContextCache

- **Purpose**: User session data and authentication info
- **TTL**: 5 minutes (300 seconds)
- **Size**: 10,000 users
- **Usage**: Auth middleware, user lookups

### permissionsCache

- **Purpose**: User permissions and authorization data
- **TTL**: 10 minutes (600 seconds)
- **Size**: 50,000 permission checks
- **Usage**: Permission checker, authorization

## Custom Cache Instance

```typescript
import { HybridCache } from '@/lib/cache/hybrid-cache';

const myCache = new HybridCache<MyDataType>({
  cacheType: 'other',
  ttl: 300,        // 5 minutes
  maxSize: 5000,   // 5k items in LRU
  keyPrefix: 'my_cache'
});
```

## Cache Operations

### Get

```typescript
const data = await cache.get(key);
```

### Set

```typescript
await cache.set(key, value, 300); // TTL in seconds
```

### Delete

```typescript
await cache.delete(key);
```

### Delete Pattern

```typescript
await cache.deletePattern('user:*');
```

### Clear All

```typescript
await cache.clear();
```

## Metrics

```typescript
const metrics = cache.getMetrics();

console.log({
  totalRequests: metrics.totalRequests,
  cacheHits: metrics.cacheHits,
  cacheMisses: metrics.cacheMisses,
  hitRatePercentage: metrics.hitRatePercentage,
  redisHits: metrics.redisHits,
  lruHits: metrics.lruHits,
  dbHits: metrics.dbHits,
  errors: metrics.errors
});
```

## Helper Functions

```typescript
import {
  getAllCacheMetrics,
  clearAllCaches,
  resetAllCacheMetrics,
  checkRedisAvailability
} from '@/lib/cache/cache-instances';

// Get all metrics
const allMetrics = getAllCacheMetrics();

// Clear all caches
await clearAllCaches();

// Reset metrics
resetAllCacheMetrics();

// Check Redis status
const redisStatus = checkRedisAvailability();
```

## Best Practices

✅ **DO**:
- Use short TTLs for frequently changing data (1-5 minutes)
- Use longer TTLs for static data (10-60 minutes)
- Invalidate cache after updates
- Monitor hit rates to optimize cache size

❌ **DON'T**:
- Cache sensitive data without encryption
- Set TTL too high for dynamic data
- Forget to invalidate after updates
- Cache everything - only cache hot data

## Documentation

See [HYBRIDCACHE-GUIDE.md](../../../docs/HYBRIDCACHE-GUIDE.md) for complete documentation.

