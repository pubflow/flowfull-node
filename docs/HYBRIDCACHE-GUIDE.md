# ⚡ HybridCache - Lightning-Fast Performance

**Developer-Friendly Guide to 3-Tier Caching in Flowfull**

---

## 👋 What is HybridCache?

HybridCache is a **3-tier caching system** that makes your Flowfull backend blazingly fast by storing frequently accessed data in memory and Redis.

### The Problem It Solves

Without caching, every request hits your database:

```
Request → Database → Response  (10-50ms per request)
```

With HybridCache:

```
Request → Memory Cache → Response  (1-2ms per request) ⚡
```

**Result**: 97% cache hit rate, 50x faster responses!

---

## 🏗️ The 3-Tier Architecture

```
┌─────────────────────────────────────────────────────────┐
│                    REQUEST FLOW                          │
├─────────────────────────────────────────────────────────┤
│                                                          │
│  1️⃣ Check LRU Cache (In-Memory)                         │
│     ├─ Hit? Return immediately (1-2ms)                  │
│     └─ Miss? Go to step 2                               │
│                                                          │
│  2️⃣ Check Redis Cache (Shared)                          │
│     ├─ Hit? Backfill LRU + Return (5-10ms)              │
│     └─ Miss? Go to step 3                               │
│                                                          │
│  3️⃣ Query Database (Source of Truth)                    │
│     └─ Backfill Redis + LRU + Return (20-50ms)          │
│                                                          │
└─────────────────────────────────────────────────────────┘
```

### Why 3 Tiers?

| Tier | Speed | Shared? | Use Case |
|------|-------|---------|----------|
| **LRU (Memory)** | ⚡⚡⚡ 1-2ms | ❌ Per instance | Hot data (frequently accessed) |
| **Redis** | ⚡⚡ 5-10ms | ✅ All instances | Warm data (shared across servers) |
| **Database** | ⚡ 20-50ms | ✅ Source of truth | Cold data (rarely accessed) |

---

## 🚀 Quick Start

### 1. Install Dependencies

```bash
bun add ioredis lru-cache
```

### 2. Configure Environment

```env
# Enable caching
CACHE_ENABLED=true

# Redis connection
REDIS_URL=redis://localhost:6379

# Optional: Redis password
REDIS_PASSWORD=your-password
```

### 3. Copy HybridCache Implementation

```bash
# From pubflow-flowfull (complete implementation)
cp ../pubflow-flowfull/src/lib/cache/hybrid-cache.ts src/lib/cache/
cp ../pubflow-flowfull/src/lib/cache/cache-instances.ts src/lib/cache/
```

### 4. Use in Your Code

```typescript
import { HybridCache } from './lib/cache/hybrid-cache';

// Create cache instance
const userCache = new HybridCache<UserData>({
  cacheType: 'userContext',
  ttl: 300,           // 5 minutes
  maxSize: 10000,     // 10k items in LRU
  keyPrefix: 'user'
});

// Get from cache
const user = await userCache.get(userId);

// Set in cache
await userCache.set(userId, userData, 300);

// Delete from cache
await userCache.delete(userId);

// Clear all cache
await userCache.clear();
```

---

## 💡 Real-World Examples

### Example 1: User Profile Cache

```typescript
import { HybridCache } from './lib/cache/hybrid-cache';

const profileCache = new HybridCache<UserProfile>({
  cacheType: 'userProfile',
  ttl: 600,        // 10 minutes
  maxSize: 5000,
  keyPrefix: 'profile'
});

async function getUserProfile(userId: string) {
  // Try cache first
  let profile = await profileCache.get(userId);
  
  if (profile) {
    console.log('✅ Cache hit!');
    return profile;
  }
  
  // Cache miss - query database
  console.log('❌ Cache miss - querying DB');
  profile = await db.selectFrom('users')
    .where('id', '=', userId)
    .selectAll()
    .executeTakeFirst();
  
  // Store in cache for next time
  if (profile) {
    await profileCache.set(userId, profile, 600);
  }
  
  return profile;
}
```

### Example 2: Session Cache

```typescript
const sessionCache = new HybridCache<SessionData>({
  cacheType: 'session',
  ttl: 300,        // 5 minutes
  maxSize: 10000,  // 10k sessions
  keyPrefix: 'sess'
});

async function validateSession(sessionId: string) {
  // Check cache
  let session = await sessionCache.get(sessionId);
  
  if (session) {
    return { valid: true, session };
  }
  
  // Validate with Flowless
  const response = await fetch(`${FLOWLESS_URL}/bridge/validate`, {
    method: 'POST',
    headers: { 'X-Bridge-Secret': BRIDGE_SECRET },
    body: JSON.stringify({ session_id: sessionId })
  });
  
  if (response.ok) {
    session = await response.json();
    await sessionCache.set(sessionId, session, 300);
    return { valid: true, session };
  }
  
  return { valid: false };
}
```

### Example 3: API Response Cache

```typescript
const apiCache = new HybridCache<any>({
  cacheType: 'apiResponse',
  ttl: 60,         // 1 minute
  maxSize: 1000,
  keyPrefix: 'api'
});

app.get('/api/stats', async (c) => {
  const cacheKey = 'global_stats';
  
  // Try cache
  let stats = await apiCache.get(cacheKey);
  
  if (stats) {
    return c.json({ ...stats, cached: true });
  }
  
  // Compute expensive stats
  stats = await computeExpensiveStats();
  
  // Cache for 1 minute
  await apiCache.set(cacheKey, stats, 60);
  
  return c.json({ ...stats, cached: false });
});
```

---

## 📊 Performance Metrics

### Typical Performance

| Operation | Latency | Cache Tier |
|-----------|---------|------------|
| LRU Hit | 1-2ms | ⚡⚡⚡ Memory |
| Redis Hit | 5-10ms | ⚡⚡ Redis |
| Database Query | 20-50ms | ⚡ Database |

### Real-World Results

From **DadosBall Server** (production):

```
Cache Statistics:
├─ Total Requests: 1,000,000
├─ Cache Hits: 970,000 (97%)
├─ Cache Misses: 30,000 (3%)
├─ Avg Response Time: 2.3ms
└─ Performance Improvement: 50x faster
```

---

## 🎯 Best Practices

### ✅ DO

- **Use short TTLs** for frequently changing data (1-5 minutes)
- **Use longer TTLs** for static data (10-60 minutes)
- **Invalidate cache** after updates (create, update, delete)
- **Monitor hit rates** to optimize cache size
- **Use key prefixes** to organize cache namespaces

### ❌ DON'T

- **Cache sensitive data** without encryption
- **Set TTL too high** for dynamic data
- **Forget to invalidate** after updates
- **Cache everything** - only cache hot data
- **Ignore cache metrics** - monitor and optimize

---

## 🔧 Advanced Configuration

### Custom Cache Instance

```typescript
const customCache = new HybridCache<MyData>({
  cacheType: 'custom',
  ttl: 300,
  maxSize: 5000,
  keyPrefix: 'custom',

  // Advanced options
  redisOptions: {
    host: 'redis.example.com',
    port: 6380,
    password: 'secret',
    db: 2,
    tls: {
      rejectUnauthorized: false
    }
  },

  // LRU options
  lruOptions: {
    max: 5000,
    ttl: 300000,  // 5 minutes in ms
    updateAgeOnGet: true,
    updateAgeOnHas: false
  }
});
```

### Cache Invalidation Patterns

```typescript
// Pattern 1: Invalidate on update
async function updateUser(userId: string, data: Partial<User>) {
  // Update database
  await db.updateTable('users')
    .set(data)
    .where('id', '=', userId)
    .execute();

  // Invalidate cache
  await userCache.delete(userId);
}

// Pattern 2: Refresh cache after update
async function updateUserAndRefresh(userId: string, data: Partial<User>) {
  // Update database
  const updated = await db.updateTable('users')
    .set(data)
    .where('id', '=', userId)
    .returningAll()
    .executeTakeFirst();

  // Refresh cache with new data
  if (updated) {
    await userCache.set(userId, updated, 600);
  }
}

// Pattern 3: Clear all related cache
async function deleteUser(userId: string) {
  // Delete from database
  await db.deleteFrom('users')
    .where('id', '=', userId)
    .execute();

  // Clear all related caches
  await userCache.delete(userId);
  await profileCache.delete(userId);
  await sessionCache.clear(); // Clear all sessions
}
```

---

## 🐛 Troubleshooting

### Cache Not Working

**Problem**: Cache always misses

**Solutions**:
```bash
# Check Redis connection
redis-cli ping
# Should return: PONG

# Check environment variables
echo $CACHE_ENABLED  # Should be: true
echo $REDIS_URL      # Should be: redis://...

# Check logs
LOG_LEVEL=debug bun run dev
```

### Redis Connection Failed

**Problem**: `Error: Redis connection failed`

**Solutions**:
```env
# Option 1: Use local Redis
REDIS_URL=redis://localhost:6379

# Option 2: Use Redis Cloud
REDIS_URL=redis://username:password@host:port

# Option 3: Disable Redis (LRU only)
CACHE_ENABLED=true
REDIS_URL=  # Leave empty
```

### High Memory Usage

**Problem**: Flowfull using too much memory

**Solutions**:
```typescript
// Reduce LRU cache size
const cache = new HybridCache({
  maxSize: 1000,  // Reduce from 10000
  ttl: 60         // Shorter TTL
});

// Or disable LRU, use Redis only
const cache = new HybridCache({
  maxSize: 0,     // Disable LRU
  ttl: 300
});
```

---

## 📚 Additional Resources

- **[Core Concepts](CORE-CONCEPTS.md)** - Full architecture guide
- **[Starter Kit Guide](STARTER-KIT-GUIDE.md)** - Implementation tutorial
- **[Pubflow Documentation](https://pubflow.com/docs)** - Complete Pubflow guide

---

## 🎉 Summary

HybridCache gives you:

✅ **97% cache hit rate** - Most requests served from memory
✅ **50x faster responses** - 1-2ms instead of 50ms
✅ **Horizontal scaling** - Redis shared across instances
✅ **Automatic fallback** - LRU → Redis → Database
✅ **Production ready** - Battle-tested in DadosBall Server

**Next Steps**:
1. Copy HybridCache from `pubflow-flowfull`
2. Configure Redis in `.env`
3. Implement in your routes
4. Monitor cache hit rates
5. Optimize TTL and size based on metrics

🚀 **Ready to make your backend lightning-fast!**
