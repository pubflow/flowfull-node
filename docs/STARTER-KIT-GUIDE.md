# FLOWFULL - Starter Kit Guide

## 🚀 Quick Guide to Create a Backend with Flowfull

This guide will help you create a complete backend in **less than 30 minutes** using Flowfull's core concepts.

---

## 📋 Table of Contents

1. [Prerequisites](#prerequisites)
2. [Initial Setup](#initial-setup)
3. [Database Configuration](#database-configuration)
4. [Flowless Configuration](#flowless-configuration)
5. [Create Protected Routes](#create-protected-routes)
6. [Implement Cache](#implement-cache)
7. [Testing](#testing)
8. [Deployment](#deployment)

---

## Prerequisites

### Required Software

- **Bun** v1.0+ ([Install](https://bun.sh))
- **Database** (PostgreSQL, MySQL, or LibSQL/Turso)
- **Flowless** backend instance (for authentication)
- **Git** (optional)

### Recommended Knowledge

- Basic TypeScript
- REST APIs
- Basic SQL
- Environment variables

---

## Initial Setup

### 1. Clone Template

```bash
# Option 1: Copy directly
cp -r 2/flowfull my-new-backend
cd my-new-backend

# Option 2: Use as Git template
git clone <flowfull-repo> my-new-backend
cd my-new-backend
rm -rf .git
git init
```

### 2. Install Dependencies

```bash
bun install
```

### 3. Configure Environment

```bash
# Copy template
cp .env.example .env

# Edit with your values
nano .env  # or your preferred editor
```

**Minimum required values**:

```env
# Database
DATABASE_URL=postgresql://user:password@localhost:5432/mydb

# Flowless Integration
FLOWLESS_API_URL=http://localhost:3000
BRIDGE_VALIDATION_SECRET=your-super-secret-key-min-32-chars

# Server
PORT=3001
NODE_ENV=development
```

### 4. Validate Configuration

```bash
bun run validate-config
```

If everything is correct, you'll see:
```
✅ Configuration validated successfully
```

---

## Database Configuration

### Option 1: PostgreSQL (Recommended for Production)

**1. Install PostgreSQL**:
```bash
# macOS
brew install postgresql@15
brew services start postgresql@15

# Ubuntu/Debian
sudo apt install postgresql postgresql-contrib
sudo systemctl start postgresql
```

**2. Create Database**:
```bash
createdb myapp_db
```

**3. Configure .env**:
```env
DATABASE_URL=postgresql://postgres:password@localhost:5432/myapp_db
DATABASE_TYPE=postgresql
DATABASE_SSL=false
DATABASE_POOL_MIN=2
DATABASE_POOL_MAX=10
```

### Option 2: LibSQL/Turso (Recommended for Serverless)

**1. Create Turso account**:
```bash
# Install Turso CLI
curl -sSfL https://get.tur.so/install.sh | bash

# Login
turso auth login

# Create database
turso db create myapp-db
```

**2. Get credentials**:
```bash
turso db show myapp-db
```

**3. Configure .env**:
```env
DATABASE_URL=libsql://myapp-db-username.turso.io
LIBSQL_AUTH_TOKEN=your_auth_token_here
DATABASE_TYPE=libsql
```

### Option 3: MySQL

**1. Install MySQL**:
```bash
# macOS
brew install mysql
brew services start mysql

# Ubuntu/Debian
sudo apt install mysql-server
sudo systemctl start mysql
```

**2. Create Database**:
```bash
mysql -u root -p
CREATE DATABASE myapp_db;
```

**3. Configure .env**:
```env
DATABASE_URL=mysql://root:password@localhost:3306/myapp_db
DATABASE_TYPE=mysql
```

### Create Tables

**Flowfull does NOT include migrations by default**. You must create your own tables according to your application.

**Basic example**:
```sql
-- users table (if not using Flowless for users)
CREATE TABLE users (
  id VARCHAR(36) PRIMARY KEY,
  email VARCHAR(255) UNIQUE NOT NULL,
  name VARCHAR(255) NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- items table (example)
CREATE TABLE items (
  id VARCHAR(36) PRIMARY KEY,
  user_id VARCHAR(36) NOT NULL,
  title VARCHAR(255) NOT NULL,
  description TEXT,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);
```

---

## Flowless Configuration

### What is Flowless?

**Flowless** is the central authentication server that handles:
- User registration
- Login/Logout
- Session management
- Session validation (Bridge Validation)

### Flowless Setup

**Option 1: Use existing Flowless**

If you already have a Flowless server running:

```env
FLOWLESS_API_URL=https://your-flowless-instance.com
BRIDGE_VALIDATION_SECRET=shared-secret-between-flowless-and-flowfull
```

**Option 2: Run local Flowless**

```bash
# In another terminal
cd ../flowless
bun install
cp .env.example .env
# Configure Flowless .env
bun run dev
```

### Configure Bridge Secret

**IMPORTANT**: The `BRIDGE_VALIDATION_SECRET` must be the **same** in both Flowless and Flowfull.

**In Flowless** (`.env`):
```env
BRIDGE_VALIDATION_SECRET=my-super-secret-key-min-32-characters-long
```

**In Flowfull** (`.env`):
```env
BRIDGE_VALIDATION_SECRET=my-super-secret-key-min-32-characters-long
```

### Verify Connection

```bash
# Start Flowfull
bun run dev

# In another terminal, test health check
curl http://localhost:3001/health
```

You should see:
```json
{
  "status": "healthy",
  "timestamp": "2024-01-01T00:00:00.000Z",
  "uptime": 123
}
```

---

## Create Protected Routes

### Route Structure

**Location**: `src/routes/`

```
src/routes/
├── api.ts          # Main API routes
├── health.ts       # Health check (already included)
└── items.ts        # Example: Items CRUD
```

### Example: Items CRUD

**Create file**: `src/routes/items.ts`

```typescript
import { Hono } from 'hono';
import { requireAuth, optionalAuth } from '../lib/auth/middleware';
import { db } from '../config/database';
import { z } from 'zod';
import { nanoid } from 'nanoid';

const items = new Hono();

// Validation schemas
const createItemSchema = z.object({
  title: z.string().min(1).max(255),
  description: z.string().optional()
});

// GET /items - List items (optional auth)
items.get('/', optionalAuth(), async (c) => {
  const isGuest = c.get('is_guest');
  const userId = c.get('user_id');

  let query = db.selectFrom('items').selectAll();

  if (!isGuest && userId) {
    // Authenticated: show user's items
    query = query.where('user_id', '=', userId);
  } else {
    // Guest: show public items only
    query = query.where('is_public', '=', true);
  }

  const items = await query.execute();

  return c.json({
    success: true,
    items,
    count: items.length
  });
});

// POST /items - Create item (requires auth)
items.post('/', requireAuth(), async (c) => {
  const userId = c.get('user_id');
  const body = await c.req.json();

  // Validate input
  const validation = createItemSchema.safeParse(body);
  if (!validation.success) {
    return c.json({
      success: false,
      error: 'Validation failed',
      details: validation.error.errors
    }, 400);
  }

  const { title, description } = validation.data;

  // Create item
  const newItem = {
    id: nanoid(),
    user_id: userId,
    title,
    description: description || null,
    is_public: false,
    created_at: new Date().toISOString()
  };

  await db.insertInto('items').values(newItem).execute();

  return c.json({
    success: true,
    item: newItem
  }, 201);
});

// PUT /items/:id - Update item (requires auth + ownership)
items.put('/:id', requireAuth(), async (c) => {
  const id = c.req.param('id');
  const userId = c.get('user_id');

  // Check ownership
  const item = await db
    .selectFrom('items')
    .select('user_id')
    .where('id', '=', id)
    .executeTakeFirst();

  if (!item) {
    return c.json({ success: false, error: 'Item not found' }, 404);
  }

  if (item.user_id !== userId) {
    return c.json({ success: false, error: 'Access denied' }, 403);
  }

  // Update item
  const updated = await db
    .updateTable('items')
    .set({ title: 'Updated' })
    .where('id', '=', id)
    .returningAll()
    .executeTakeFirst();

  return c.json({ success: true, item: updated });
});

export default items;
```

### Register Routes

**Edit**: `src/index.ts`

```typescript
import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { config } from './config/environment';
import health from './routes/health';
import items from './routes/items'; // ← Import

const app = new Hono();

// CORS
app.use('/*', cors({
  origin: config.CORS_ORIGINS,
  credentials: true
}));

// Routes
app.route('/health', health);
app.route('/api/v1/items', items); // ← Register

export default {
  port: config.PORT,
  fetch: app.fetch
};
```

### Test Routes

```bash
# 1. Create item (requires authentication)
curl -X POST http://localhost:3001/api/v1/items \
  -H "Content-Type: application/json" \
  -H "X-Session-ID: your-session-id" \
  -d '{"title": "My First Item", "description": "Test item"}'

# 2. List items
curl http://localhost:3001/api/v1/items \
  -H "X-Session-ID: your-session-id"

# 3. Get specific item
curl http://localhost:3001/api/v1/items/item-id

# 4. Update item
curl -X PUT http://localhost:3001/api/v1/items/item-id \
  -H "Content-Type: application/json" \
  -H "X-Session-ID: your-session-id" \
  -d '{"title": "Updated Title"}'
```

---

## Implement Cache

### Option 1: Simple LRU Cache (Already included)

**Flowfull already includes** LRU cache for sessions in `src/lib/auth/bridge-validator.ts`.

**Current configuration**:
```typescript
const sessionCache = new LRUCache<string, SessionData>({
  max: 10000,        // 10k sessions
  ttl: 5 * 60 * 1000 // 5 minutes
});
```

### Option 2: HybridCache (Recommended for Production)

**HybridCache is NOT implemented in Flowfull**, but you can copy it from `pubflow-flowfull`.

**1. Copy files**:
```bash
# From pubflow-flowfull
cp ../pubflow-flowfull/src/lib/cache/hybrid-cache.ts src/lib/cache/
cp ../pubflow-flowfull/src/lib/cache/cache-instances.ts src/lib/cache/
```

**2. Install dependencies**:
```bash
bun add ioredis lru-cache
```

**3. Configure Redis** (`.env`):
```env
CACHE_ENABLED=true
REDIS_URL=redis://localhost:6379
```

**4. Use HybridCache**:
```typescript
import { HybridCache } from './lib/cache/hybrid-cache';

const userCache = new HybridCache<UserData>({
  cacheType: 'userContext',
  ttl: 300,
  maxSize: 10000,
  keyPrefix: 'user_ctx'
});

// Get from cache
const user = await userCache.get(userId);

// Set in cache
await userCache.set(userId, userData, 300);
```

---

## Testing

### Testing Setup

**1. Install dependencies**:
```bash
bun add -d @types/bun
```

**2. Create test file**: `src/routes/items.test.ts`

```typescript
import { describe, test, expect, beforeAll } from 'bun:test';
import app from '../index';

describe('Items API', () => {
  let sessionId: string;
  let itemId: string;

  beforeAll(async () => {
    // Get session from Flowless (mock or real)
    sessionId = 'test-session-id';
  });

  test('POST /api/v1/items - Create item', async () => {
    const res = await app.request('/api/v1/items', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Session-ID': sessionId
      },
      body: JSON.stringify({
        title: 'Test Item',
        description: 'Test description'
      })
    });

    expect(res.status).toBe(201);
    const data = await res.json();
    expect(data.success).toBe(true);
    expect(data.item.title).toBe('Test Item');

    itemId = data.item.id;
  });

  test('GET /api/v1/items - List items', async () => {
    const res = await app.request('/api/v1/items', {
      headers: {
        'X-Session-ID': sessionId
      }
    });

    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.success).toBe(true);
    expect(Array.isArray(data.items)).toBe(true);
  });
});
```

**3. Run tests**:
```bash
bun test
```

---

## Deployment

### Option 1: VPS (DigitalOcean, Linode, etc.)

**1. Prepare server**:
```bash
# SSH to server
ssh user@your-server.com

# Install Bun
curl -fsSL https://bun.sh/install | bash

# Install PostgreSQL (if using)
sudo apt update
sudo apt install postgresql
```

**2. Clone project**:
```bash
git clone your-repo.git
cd your-repo
bun install
```

**3. Configure environment**:
```bash
nano .env
# Configure production values
```

**4. Build and run**:
```bash
bun run build
bun run start
```

**5. Use PM2 to keep running**:
```bash
npm install -g pm2
pm2 start "bun run start" --name flowfull-api
pm2 save
pm2 startup
```

### Option 2: Docker

**Create**: `Dockerfile`

```dockerfile
FROM oven/bun:1 as base
WORKDIR /app

# Install dependencies
COPY package.json bun.lock ./
RUN bun install --frozen-lockfile

# Copy source
COPY . .

# Build
RUN bun run build

# Expose port
EXPOSE 3001

# Start
CMD ["bun", "run", "start"]
```

**Create**: `docker-compose.yml`

```yaml
version: '3.8'

services:
  api:
    build: .
    ports:
      - "3001:3001"
    environment:
      - DATABASE_URL=postgresql://postgres:password@db:5432/myapp
      - FLOWLESS_API_URL=http://flowless:3000
      - BRIDGE_VALIDATION_SECRET=${BRIDGE_VALIDATION_SECRET}
    depends_on:
      - db

  db:
    image: postgres:15
    environment:
      - POSTGRES_DB=myapp
      - POSTGRES_PASSWORD=password
    volumes:
      - postgres_data:/var/lib/postgresql/data

volumes:
  postgres_data:
```

**Run**:
```bash
docker-compose up -d
```

---

## 🎯 Final Checklist

Before going to production, verify:

- [ ] **Environment variables** configured correctly
- [ ] **Database** with tables created
- [ ] **Flowless** connected and working
- [ ] **Bridge secret** shared between Flowless and Flowfull
- [ ] **CORS** configured with correct origins
- [ ] **Rate limiting** enabled
- [ ] **Validation mode** configured (STANDARD or ADVANCED)
- [ ] **Logs** configured
- [ ] **Health check** working
- [ ] **Tests** passing
- [ ] **SSL/HTTPS** configured (production)
- [ ] **Database backups** configured

---

## 📚 Additional Resources

- **Core Concepts**: See `docs/CORE-CONCEPTS-EN.md`
- **Flowfull Repository**: `2/flowfull/`
- **Pubflow-Flowfull**: `2/pubflow-flowfull/` (complete implementation)

---

## 🆘 Troubleshooting

### Error: "Bridge validation failed"

**Cause**: Secret key doesn't match between Flowless and Flowfull

**Solution**:
```bash
# Verify they are equal
# In Flowless .env
echo $BRIDGE_VALIDATION_SECRET

# In Flowfull .env
echo $BRIDGE_VALIDATION_SECRET
```

### Error: "Database connection failed"

**Cause**: Incorrect DATABASE_URL or database not accessible

**Solution**:
```bash
# Test connection manually
psql $DATABASE_URL

# Verify server is running
sudo systemctl status postgresql
```

### Error: "Session validation timeout"

**Cause**: Flowless not responding or slow

**Solution**:
```env
# Increase timeout in .env
BRIDGE_VALIDATION_TIMEOUT=10000
BRIDGE_RETRY_ATTEMPTS=5
```

---

## 🎉 Done!

Now you have a complete backend with:

✅ Authentication with Bridge Validation
✅ Protected routes with middleware
✅ Input validation with Zod
✅ Session cache
✅ Multi-database support
✅ Environment configuration
✅ Testing setup
✅ Deployment ready

**Total time**: ~30 minutes 🚀
