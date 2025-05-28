# Database Dialects Guide

Bridge-Payments supports multiple database providers through Kysely dialects. This guide covers installation and configuration for each supported database type.

## Quick Reference

| Database | Package | Use Case | Performance | Complexity |
|----------|---------|----------|-------------|------------|
| **PostgreSQL** | `pg` | Production, full features | ⭐⭐⭐⭐⭐ | ⭐⭐ |
| **Neon** | `kysely-neon` | Serverless PostgreSQL | ⭐⭐⭐⭐ | ⭐⭐ |
| **MySQL** | `mysql2` | Traditional hosting | ⭐⭐⭐⭐ | ⭐⭐ |
| **PlanetScale** | `kysely-planetscale` | Serverless MySQL | ⭐⭐⭐⭐ | ⭐⭐⭐ |
| **LibSQL/Turso** | `@libsql/kysely-libsql` | Edge databases | ⭐⭐⭐ | ⭐⭐ |
| **SQLite** | `better-sqlite3` | Development/testing | ⭐⭐⭐ | ⭐ |
| **Cloudflare D1** | `kysely-d1` | Edge workers | ⭐⭐⭐ | ⭐⭐⭐ |

## PostgreSQL (Standard)

### Installation

```bash
bun add pg @types/pg
```

### Configuration

```env
DATABASE_URL=postgresql://username:password@localhost:5432/bridge_payments
DATABASE_SSL=false
DATABASE_POOL_MIN=2
DATABASE_POOL_MAX=10
```

### Implementation

```typescript
import { PostgresDialect } from 'kysely';
import { Pool } from 'pg';

const dialect = new PostgresDialect({
  pool: new Pool({
    connectionString: process.env.DATABASE_URL,
    min: 2,
    max: 10,
    ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false
  })
});

// Lazy pool creation (recommended)
const dialect = new PostgresDialect({
  pool: async () => new Pool({
    connectionString: process.env.DATABASE_URL
  })
});
```

### Production Setup

```sql
-- Create database and user
CREATE DATABASE bridge_payments;
CREATE USER bridge_payments_user WITH PASSWORD 'secure_password';
GRANT ALL PRIVILEGES ON DATABASE bridge_payments TO bridge_payments_user;

-- Performance tuning
ALTER SYSTEM SET shared_buffers = '256MB';
ALTER SYSTEM SET effective_cache_size = '1GB';
SELECT pg_reload_conf();
```

## Neon Serverless PostgreSQL

### Installation

```bash
bun add kysely-neon @neondatabase/serverless ws
```

### Configuration

```env
DATABASE_URL=postgresql://username:password@ep-cool-darkness-123456.us-east-1.aws.neon.tech/neondb?sslmode=require
DATABASE_TYPE=neon
```

### Implementation

```typescript
import { NeonDialect, NeonHTTPDialect } from 'kysely-neon';
import ws from 'ws'; // For Node.js

// Standard WebSocket connection
const dialect = new NeonDialect({
  connectionString: process.env.DATABASE_URL,
  // Required for Node.js environments
  ...(typeof window === 'undefined' && { 
    webSocketConstructor: ws 
  })
});

// HTTP connection (experimental, no transactions)
const httpDialect = new NeonHTTPDialect({
  connectionString: process.env.DATABASE_URL
});
```

### Benefits

- ✅ Serverless scaling
- ✅ Automatic backups
- ✅ Branch-based development
- ✅ Global edge locations

## MySQL (Standard)

### Installation

```bash
bun add mysql2
```

### Configuration

```env
DATABASE_URL=mysql://username:password@localhost:3306/bridge_payments
DATABASE_SSL=false
DATABASE_POOL_MIN=2
DATABASE_POOL_MAX=10
```

### Implementation

```typescript
import { MysqlDialect } from 'kysely';
import { createPool } from 'mysql2';

const dialect = new MysqlDialect({
  pool: createPool({
    uri: process.env.DATABASE_URL,
    connectionLimit: 10,
    ssl: process.env.NODE_ENV === 'production' ? {} : false
  })
});

// Lazy pool creation
const dialect = new MysqlDialect({
  pool: async () => createPool({
    host: 'localhost',
    user: 'username',
    password: 'password',
    database: 'bridge_payments'
  })
});
```

## PlanetScale MySQL

### Installation

```bash
bun add kysely-planetscale @planetscale/database undici
```

### Configuration

```env
DATABASE_URL=mysql://username:password@aws.connect.psdb.cloud/bridge_payments?ssl={"rejectUnauthorized":true}
DATABASE_TYPE=planetscale
PLANETSCALE_HOST=aws.connect.psdb.cloud
PLANETSCALE_USERNAME=username
PLANETSCALE_PASSWORD=password
PLANETSCALE_SHARED_CONNECTION=false
```

### Implementation

```typescript
import { PlanetScaleDialect } from 'kysely-planetscale';
import { fetch } from 'undici'; // For Node.js

// Using DATABASE_URL
const dialect = new PlanetScaleDialect({
  url: process.env.DATABASE_URL,
  fetch // Required for Node.js
});

// Using individual credentials
const dialect = new PlanetScaleDialect({
  host: process.env.PLANETSCALE_HOST,
  username: process.env.PLANETSCALE_USERNAME,
  password: process.env.PLANETSCALE_PASSWORD,
  fetch
});

// With shared connection (experimental)
const dialect = new PlanetScaleDialect({
  url: process.env.DATABASE_URL,
  useSharedConnection: true,
  fetch
});
```

### Custom Type Conversion

```typescript
import { cast } from '@planetscale/database';
import SqlString from 'sqlstring';

const dialect = new PlanetScaleDialect({
  url: process.env.DATABASE_URL,
  format: SqlString.format, // Custom format function
  cast: (field, value) => {
    if (field.type === 'INT64' || field.type === 'UINT64') {
      return BigInt(value);
    }
    return cast(field, value);
  }
});
```

## LibSQL/Turso

### Installation

```bash
bun add @libsql/kysely-libsql @libsql/client
```

### Configuration

```env
DATABASE_URL=libsql://bridge-payments-database.turso.io
DATABASE_TYPE=libsql
LIBSQL_AUTH_TOKEN=your_auth_token
```

### Implementation

```typescript
import { LibsqlDialect } from '@libsql/kysely-libsql';
import { createClient } from '@libsql/client';

// Direct configuration
const dialect = new LibsqlDialect({
  url: process.env.DATABASE_URL,
  authToken: process.env.LIBSQL_AUTH_TOKEN
});

// Using existing client
const client = createClient({
  url: process.env.DATABASE_URL,
  authToken: process.env.LIBSQL_AUTH_TOKEN
});

const dialect = new LibsqlDialect({ client });

// Remember to close client when done
process.on('SIGTERM', () => {
  client.close();
});
```

### Local Development

```bash
# Install Turso CLI
curl -sSfL https://get.tur.so/install.sh | bash

# Create local database
turso dev --db-file ./dev.db
```

## SQLite (Development)

### Installation

```bash
bun add better-sqlite3
```

### Configuration

```env
DATABASE_URL=sqlite:./data/bridge_payments.db
DATABASE_WAL_MODE=true
```

### Implementation

```typescript
import { SqliteDialect } from 'kysely';
import Database from 'better-sqlite3';

const dialect = new SqliteDialect({
  database: new Database('./data/bridge_payments.db', {
    verbose: process.env.NODE_ENV === 'development' ? console.log : undefined
  })
});

// With WAL mode for better performance
const dialect = new SqliteDialect({
  database: (() => {
    const db = new Database('./data/bridge_payments.db');
    db.pragma('journal_mode = WAL');
    return db;
  })()
});
```

## Cloudflare D1

### Installation

```bash
bun add kysely-d1
```

### Configuration

```typescript
// wrangler.toml
[[d1_databases]]
binding = "DB"
database_name = "bridge-payments"
database_id = "your-database-id"
```

### Implementation

```typescript
import { D1Dialect } from 'kysely-d1';

// In Cloudflare Worker
export interface Env {
  DB: D1Database;
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const db = new Kysely<Database>({
      dialect: new D1Dialect({ database: env.DB })
    });
    
    // Your application logic
  }
};
```

### Local Development

```bash
# Install Wrangler
npm install -g wrangler

# Create D1 database
wrangler d1 create bridge-payments

# Run migrations
wrangler d1 migrations apply bridge-payments --local
```

## Migration Compatibility

### Schema Differences

Some databases have specific requirements:

#### PostgreSQL/Neon
- Supports `JSONB` for better performance
- Full transaction support
- Advanced indexing options

#### MySQL/PlanetScale
- Uses `JSON` type (MySQL 5.7+)
- PlanetScale doesn't support foreign keys
- Limited transaction support in PlanetScale

#### SQLite/LibSQL/D1
- Uses `TEXT` for JSON storage
- Limited concurrent write support
- D1 has additional edge-specific limitations

### Universal Schema

```sql
-- Use compatible types across all databases
CREATE TABLE payments (
    id VARCHAR(255) PRIMARY KEY,
    user_id VARCHAR(255),
    amount_cents BIGINT NOT NULL,
    currency VARCHAR(3) NOT NULL DEFAULT 'USD',
    status VARCHAR(50) NOT NULL,
    metadata TEXT, -- JSON as TEXT for compatibility
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);
```

## Performance Considerations

### Connection Pooling

| Database | Pool Type | Recommended Settings |
|----------|-----------|---------------------|
| PostgreSQL | pg.Pool | min: 2, max: 10 |
| MySQL | mysql2.Pool | connectionLimit: 10 |
| Neon | Built-in | Auto-managed |
| PlanetScale | Built-in | Auto-managed |
| LibSQL | Single connection | N/A |
| SQLite | Single connection | N/A |
| D1 | Serverless | N/A |

### Query Optimization

```typescript
// Use appropriate indexes for each database
const indexes = {
  postgresql: [
    'CREATE INDEX CONCURRENTLY idx_payments_user_id ON payments(user_id)',
    'CREATE INDEX CONCURRENTLY idx_payments_status ON payments(status)'
  ],
  mysql: [
    'CREATE INDEX idx_payments_user_id ON payments(user_id)',
    'CREATE INDEX idx_payments_status ON payments(status)'
  ],
  sqlite: [
    'CREATE INDEX idx_payments_user_id ON payments(user_id)',
    'CREATE INDEX idx_payments_status ON payments(status)'
  ]
};
```

## Testing Setup

### Test Database Configuration

```typescript
// test-config.ts
const testConfig = {
  postgresql: {
    DATABASE_URL: 'postgresql://test:test@localhost:5432/bridge_payments_test'
  },
  mysql: {
    DATABASE_URL: 'mysql://test:test@localhost:3306/bridge_payments_test'
  },
  sqlite: {
    DATABASE_URL: 'sqlite::memory:'
  },
  neon: {
    DATABASE_URL: process.env.NEON_TEST_DATABASE_URL
  }
};
```

### Test Utilities

```typescript
// test-utils.ts
export async function setupTestDatabase(dialect: string) {
  switch (dialect) {
    case 'sqlite':
      return new Kysely({
        dialect: new SqliteDialect({
          database: new Database(':memory:')
        })
      });
    
    case 'postgresql':
      // Setup test PostgreSQL database
      break;
      
    // ... other dialects
  }
}
```

## Next Steps

1. **Choose your database** based on your deployment environment
2. **Install required packages** for your chosen dialect
3. **Configure environment variables** according to your database
4. **Test the connection** using the provided examples
5. **Run migrations** to set up the schema
6. **Monitor performance** and adjust pool settings as needed

For specific deployment guides, see:
- **[Deployment Guide](./deployment.md)** - Production deployment
- **[Performance Tuning](./performance.md)** - Optimization tips
- **[Troubleshooting](./troubleshooting.md)** - Common issues
