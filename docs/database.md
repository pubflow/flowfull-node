# Database Schema & Management

## Overview

Bridge-Payments uses a flexible database schema that supports multiple database engines (PostgreSQL, MySQL, SQLite) through Kysely ORM. The schema is designed for payment processing with guest checkout support and automatic client secret cleanup.

## Database Configuration

### Supported Databases

Bridge-Payments supports multiple database providers through Kysely dialects:

#### PostgreSQL (Standard)
```env
DATABASE_URL=postgresql://username:password@localhost:5432/bridge_payments
DATABASE_SSL=false
DATABASE_POOL_MIN=2
DATABASE_POOL_MAX=10
```

#### Neon Serverless PostgreSQL
```env
DATABASE_URL=postgresql://username:password@ep-cool-darkness-123456.us-east-1.aws.neon.tech/neondb?sslmode=require
DATABASE_TYPE=neon
```

#### MySQL (Standard)
```env
DATABASE_URL=mysql://username:password@localhost:3306/bridge_payments
DATABASE_SSL=false
DATABASE_POOL_MIN=2
DATABASE_POOL_MAX=10
```

#### PlanetScale MySQL
```env
DATABASE_URL=mysql://username:password@aws.connect.psdb.cloud/bridge_payments?ssl={"rejectUnauthorized":true}
DATABASE_TYPE=planetscale
PLANETSCALE_HOST=aws.connect.psdb.cloud
PLANETSCALE_USERNAME=username
PLANETSCALE_PASSWORD=password
```

#### LibSQL/Turso
```env
DATABASE_URL=libsql://bridge-payments-database.turso.io
DATABASE_TYPE=libsql
LIBSQL_AUTH_TOKEN=your_auth_token
```

#### SQLite (Development/Testing)
```env
DATABASE_URL=sqlite:./data/bridge_payments.db
DATABASE_WAL_MODE=true
```

#### Cloudflare D1 (Edge Runtime)
```env
DATABASE_TYPE=d1
# D1 binding is passed through Cloudflare Workers environment
```

## Core Tables

### 1. Payment Users

Synchronized users from Flowless system:

```sql
CREATE TABLE payment_users (
    id VARCHAR(255) PRIMARY KEY,
    flowless_user_id VARCHAR(255) NOT NULL UNIQUE,
    email VARCHAR(255) NOT NULL,
    name VARCHAR(255) NOT NULL,
    user_type VARCHAR(50) NOT NULL DEFAULT 'individual',
    is_guest BOOLEAN NOT NULL DEFAULT false,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);
```

### 2. Payments (Core Table)

Enhanced payments table with guest checkout and payment intent support:

```sql
CREATE TABLE payments (
    id VARCHAR(255) PRIMARY KEY,
    order_id VARCHAR(255),
    subscription_id VARCHAR(255),
    user_id VARCHAR(255), -- Optional for guest checkout
    organization_id VARCHAR(255),
    payment_method_id VARCHAR(255),
    provider_id VARCHAR(50) NOT NULL,
    provider_payment_id VARCHAR(255), -- Final payment ID
    provider_intent_id VARCHAR(255), -- Intent ID (e.g., Stripe PI)
    client_secret VARCHAR(255), -- Auto-cleaned on completion
    amount_cents BIGINT NOT NULL,
    currency VARCHAR(3) NOT NULL DEFAULT 'USD',
    status VARCHAR(50) NOT NULL, -- pending, requires_confirmation, succeeded, failed
    description TEXT,
    error_message TEXT,
    is_guest_payment BOOLEAN NOT NULL DEFAULT false,
    guest_data JSONB, -- Guest information
    guest_email VARCHAR(255), -- Extracted for indexing
    metadata JSONB,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    completed_at TIMESTAMP,

    -- Constraints
    CHECK (user_id IS NOT NULL OR organization_id IS NOT NULL OR is_guest_payment = true)
);
```

### 3. Payment Methods

Tokenized payment methods:

```sql
CREATE TABLE payment_methods (
    id VARCHAR(255) PRIMARY KEY,
    user_id VARCHAR(255),
    organization_id VARCHAR(255),
    provider_id VARCHAR(50) NOT NULL,
    provider_payment_method_id VARCHAR(255) NOT NULL,
    payment_type VARCHAR(50) NOT NULL, -- credit_card, bank_account, paypal
    last_four VARCHAR(4),
    expiry_month VARCHAR(2),
    expiry_year VARCHAR(4),
    card_brand VARCHAR(50),
    is_default BOOLEAN NOT NULL DEFAULT false,
    billing_address_id VARCHAR(255),
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CHECK (user_id IS NOT NULL OR organization_id IS NOT NULL)
);
```

### 4. Payment Providers

Provider configuration:

```sql
CREATE TABLE payment_providers (
    id VARCHAR(50) PRIMARY KEY, -- stripe, paypal, authorize_net
    display_name VARCHAR(255) NOT NULL,
    picture VARCHAR(255),
    is_active BOOLEAN NOT NULL DEFAULT true,
    supports_subscriptions BOOLEAN NOT NULL DEFAULT false,
    supports_saved_methods BOOLEAN NOT NULL DEFAULT false,
    config JSONB,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);
```

## Automatic Client Secret Cleanup

### Cleanup Triggers

#### PostgreSQL Trigger
```sql
CREATE OR REPLACE FUNCTION cleanup_client_secret()
RETURNS TRIGGER AS $$
BEGIN
    -- Cleanup client_secret when payment is completed or failed
    IF NEW.status IN ('succeeded', 'failed', 'canceled') AND OLD.client_secret IS NOT NULL THEN
        NEW.client_secret = NULL;
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER payment_cleanup_trigger
    BEFORE UPDATE ON payments
    FOR EACH ROW
    EXECUTE FUNCTION cleanup_client_secret();
```

#### MySQL Trigger
```sql
DELIMITER $$
CREATE TRIGGER payment_cleanup_trigger
    BEFORE UPDATE ON payments
    FOR EACH ROW
BEGIN
    IF NEW.status IN ('succeeded', 'failed', 'canceled') AND OLD.client_secret IS NOT NULL THEN
        SET NEW.client_secret = NULL;
    END IF;
END$$
DELIMITER ;
```

#### SQLite Trigger
```sql
CREATE TRIGGER payment_cleanup_trigger
    BEFORE UPDATE ON payments
    FOR EACH ROW
    WHEN NEW.status IN ('succeeded', 'failed', 'canceled') AND OLD.client_secret IS NOT NULL
BEGIN
    UPDATE payments SET client_secret = NULL WHERE id = NEW.id;
END;
```

### Scheduled Cleanup

Cleanup old client secrets (older than 24 hours):

```sql
-- PostgreSQL/MySQL
DELETE FROM payments
SET client_secret = NULL
WHERE client_secret IS NOT NULL
  AND created_at < NOW() - INTERVAL '24 HOURS';

-- SQLite
UPDATE payments
SET client_secret = NULL
WHERE client_secret IS NOT NULL
  AND created_at < datetime('now', '-24 hours');
```

## Database Connection Setup

### Kysely Configuration

```typescript
// src/lib/database/connection.ts
import { Kysely, PostgresDialect, MysqlDialect, SqliteDialect } from 'kysely';
import { Pool } from 'pg';
import { createPool } from 'mysql2';
import Database from 'better-sqlite3';
import { config } from '@/config/environment';

// Additional dialect imports
import { NeonDialect, NeonHTTPDialect } from 'kysely-neon';
import { PlanetScaleDialect } from 'kysely-planetscale';
import { LibsqlDialect } from '@libsql/kysely-libsql';
import { createClient } from '@libsql/client';
import { D1Dialect } from 'kysely-d1';

interface Database {
  payment_users: PaymentUserTable;
  payments: PaymentTable;
  payment_methods: PaymentMethodTable;
  payment_providers: PaymentProviderTable;
  // ... other tables
}

function createDialect() {
  const dbUrl = config.databaseUrl;
  const dbType = config.databaseType;

  // Handle specific database types
  switch (dbType) {
    case 'neon':
      return new NeonDialect({
        connectionString: dbUrl,
        // Add webSocketConstructor for Node.js
        ...(typeof window === 'undefined' && {
          webSocketConstructor: require('ws')
        })
      });

    case 'neon-http':
      return new NeonHTTPDialect({
        connectionString: dbUrl
      });

    case 'planetscale':
      return new PlanetScaleDialect({
        url: dbUrl,
        // Add fetch for Node.js environments
        ...(typeof window === 'undefined' && {
          fetch: require('undici').fetch
        }),
        useSharedConnection: config.planetscaleSharedConnection || false
      });

    case 'libsql':
      return new LibsqlDialect({
        url: dbUrl,
        authToken: config.libsqlAuthToken
      });

    case 'd1':
      // D1 requires the binding to be passed from Cloudflare Workers
      if (!config.d1Database) {
        throw new Error('D1 database binding not found');
      }
      return new D1Dialect({
        database: config.d1Database
      });
  }

  // Auto-detect from URL for standard databases
  if (dbUrl.startsWith('postgresql://') || dbUrl.startsWith('postgres://')) {
    return new PostgresDialect({
      pool: new Pool({
        connectionString: dbUrl,
        min: config.databasePoolMin,
        max: config.databasePoolMax,
        ssl: config.databaseSsl ? { rejectUnauthorized: false } : false
      })
    });
  }

  if (dbUrl.startsWith('mysql://')) {
    return new MysqlDialect({
      pool: createPool({
        uri: dbUrl,
        connectionLimit: config.databasePoolMax,
        ssl: config.databaseSsl ? {} : false
      })
    });
  }

  if (dbUrl.startsWith('sqlite:')) {
    const dbPath = dbUrl.replace('sqlite:', '');
    return new SqliteDialect({
      database: new Database(dbPath, {
        verbose: config.nodeEnv === 'development' ? console.log : undefined
      })
    });
  }

  if (dbUrl.startsWith('libsql:')) {
    return new LibsqlDialect({
      url: dbUrl,
      authToken: config.libsqlAuthToken
    });
  }

  throw new Error(`Unsupported database URL or type: ${dbUrl} (type: ${dbType})`);
}

export const db = new Kysely<Database>({
  dialect: createDialect(),
  log: config.nodeEnv === 'development' ? ['query', 'error'] : ['error']
});
```

### Type Definitions

```typescript
// src/lib/database/types.ts
export interface PaymentUserTable {
  id: string;
  flowless_user_id: string;
  email: string;
  name: string;
  user_type: string;
  is_guest: boolean;
  created_at: string;
  updated_at: string;
}

export interface PaymentTable {
  id: string;
  order_id: string | null;
  subscription_id: string | null;
  user_id: string | null;
  organization_id: string | null;
  payment_method_id: string | null;
  provider_id: string;
  provider_payment_id: string | null;
  provider_intent_id: string | null;
  client_secret: string | null;
  amount_cents: number;
  currency: string;
  status: string;
  description: string | null;
  error_message: string | null;
  is_guest_payment: boolean;
  guest_data: string | null; // JSON string
  guest_email: string | null;
  metadata: string | null; // JSON string
  created_at: string;
  updated_at: string;
  completed_at: string | null;
}
```

## Migration System

### Migration Structure

```typescript
// src/lib/database/migrations/001_initial_schema.ts
import { Kysely } from 'kysely';

export async function up(db: Kysely<any>): Promise<void> {
  // Create payment_users table
  await db.schema
    .createTable('payment_users')
    .addColumn('id', 'varchar(255)', (col) => col.primaryKey())
    .addColumn('flowless_user_id', 'varchar(255)', (col) => col.notNull().unique())
    .addColumn('email', 'varchar(255)', (col) => col.notNull())
    .addColumn('name', 'varchar(255)', (col) => col.notNull())
    .addColumn('user_type', 'varchar(50)', (col) => col.notNull().defaultTo('individual'))
    .addColumn('is_guest', 'boolean', (col) => col.notNull().defaultTo(false))
    .addColumn('created_at', 'timestamp', (col) => col.notNull().defaultTo('CURRENT_TIMESTAMP'))
    .addColumn('updated_at', 'timestamp', (col) => col.notNull().defaultTo('CURRENT_TIMESTAMP'))
    .execute();

  // Create payments table
  await db.schema
    .createTable('payments')
    .addColumn('id', 'varchar(255)', (col) => col.primaryKey())
    .addColumn('user_id', 'varchar(255)')
    .addColumn('provider_id', 'varchar(50)', (col) => col.notNull())
    .addColumn('provider_intent_id', 'varchar(255)')
    .addColumn('client_secret', 'varchar(255)')
    .addColumn('amount_cents', 'bigint', (col) => col.notNull())
    .addColumn('currency', 'varchar(3)', (col) => col.notNull().defaultTo('USD'))
    .addColumn('status', 'varchar(50)', (col) => col.notNull())
    .addColumn('is_guest_payment', 'boolean', (col) => col.notNull().defaultTo(false))
    .addColumn('guest_data', 'text')
    .addColumn('guest_email', 'varchar(255)')
    .addColumn('created_at', 'timestamp', (col) => col.notNull().defaultTo('CURRENT_TIMESTAMP'))
    .addColumn('updated_at', 'timestamp', (col) => col.notNull().defaultTo('CURRENT_TIMESTAMP'))
    .execute();

  // Add indexes
  await db.schema
    .createIndex('idx_payments_user_id')
    .on('payments')
    .column('user_id')
    .execute();

  await db.schema
    .createIndex('idx_payments_guest_email')
    .on('payments')
    .column('guest_email')
    .execute();
}

export async function down(db: Kysely<any>): Promise<void> {
  await db.schema.dropTable('payments').execute();
  await db.schema.dropTable('payment_users').execute();
}
```

### Migration Runner

```typescript
// src/scripts/migrate.ts
import { promises as fs } from 'fs';
import { join } from 'path';
import { db } from '@/lib/database/connection';

async function runMigrations() {
  // Create migrations table if it doesn't exist
  await db.schema
    .createTable('migrations')
    .ifNotExists()
    .addColumn('id', 'varchar(255)', (col) => col.primaryKey())
    .addColumn('executed_at', 'timestamp', (col) => col.notNull().defaultTo('CURRENT_TIMESTAMP'))
    .execute();

  // Get executed migrations
  const executedMigrations = await db
    .selectFrom('migrations')
    .select('id')
    .execute();

  const executedIds = new Set(executedMigrations.map(m => m.id));

  // Get migration files
  const migrationsDir = join(__dirname, '../lib/database/migrations');
  const files = await fs.readdir(migrationsDir);
  const migrationFiles = files
    .filter(f => f.endsWith('.ts') || f.endsWith('.js'))
    .sort();

  // Run pending migrations
  for (const file of migrationFiles) {
    const migrationId = file.replace(/\.(ts|js)$/, '');

    if (executedIds.has(migrationId)) {
      console.log(`Skipping migration: ${migrationId}`);
      continue;
    }

    console.log(`Running migration: ${migrationId}`);

    const migration = await import(join(migrationsDir, file));
    await migration.up(db);

    await db
      .insertInto('migrations')
      .values({ id: migrationId })
      .execute();

    console.log(`Completed migration: ${migrationId}`);
  }

  console.log('All migrations completed');
}

runMigrations().catch(console.error);
```

## Performance Optimization

### Indexes

```sql
-- Core performance indexes
CREATE INDEX idx_payments_user_id ON payments(user_id);
CREATE INDEX idx_payments_status ON payments(status);
CREATE INDEX idx_payments_provider_intent_id ON payments(provider_intent_id);
CREATE INDEX idx_payments_guest_email ON payments(guest_email);
CREATE INDEX idx_payments_is_guest_payment ON payments(is_guest_payment);
CREATE INDEX idx_payments_created_at ON payments(created_at);

-- Composite indexes for common queries
CREATE INDEX idx_payments_user_status ON payments(user_id, status);
CREATE INDEX idx_payments_guest_status ON payments(is_guest_payment, status);
```

### Query Optimization

```typescript
// Optimized queries using Kysely
export class PaymentRepository {
  static async findUserPayments(userId: string, limit = 20) {
    return await db
      .selectFrom('payments')
      .selectAll()
      .where('user_id', '=', userId)
      .orderBy('created_at', 'desc')
      .limit(limit)
      .execute();
  }

  static async findGuestPayments(email: string) {
    return await db
      .selectFrom('payments')
      .selectAll()
      .where('guest_email', '=', email)
      .where('is_guest_payment', '=', true)
      .orderBy('created_at', 'desc')
      .execute();
  }
}
```

## Backup & Recovery

### Automated Backups

```bash
#!/bin/bash
# backup-database.sh

DB_NAME="bridge_payments"
BACKUP_DIR="/backups"
DATE=$(date +%Y%m%d_%H%M%S)

# PostgreSQL backup
pg_dump $DB_NAME > "$BACKUP_DIR/bridge_payments_$DATE.sql"

# Compress backup
gzip "$BACKUP_DIR/bridge_payments_$DATE.sql"

# Keep only last 30 days
find $BACKUP_DIR -name "bridge_payments_*.sql.gz" -mtime +30 -delete
```

### Recovery Procedures

```bash
# Restore from backup
gunzip bridge_payments_20240115_120000.sql.gz
psql bridge_payments < bridge_payments_20240115_120000.sql
```

## Monitoring & Maintenance

### Database Health Checks

```typescript
// src/lib/database/health.ts
export class DatabaseHealth {
  static async checkConnection(): Promise<boolean> {
    try {
      await db.selectFrom('payment_providers').select('id').limit(1).execute();
      return true;
    } catch (error) {
      console.error('Database health check failed:', error);
      return false;
    }
  }

  static async getStats() {
    const [paymentCount, userCount] = await Promise.all([
      db.selectFrom('payments').select(db.fn.count('id').as('count')).executeTakeFirst(),
      db.selectFrom('payment_users').select(db.fn.count('id').as('count')).executeTakeFirst()
    ]);

    return {
      payments: Number(paymentCount?.count || 0),
      users: Number(userCount?.count || 0),
      timestamp: new Date().toISOString()
    };
  }
}
```

### Cleanup Jobs

```typescript
// src/lib/database/cleanup.ts
export class DatabaseCleanup {
  static async cleanupExpiredSecrets(): Promise<number> {
    const result = await db
      .updateTable('payments')
      .set({ client_secret: null })
      .where('client_secret', 'is not', null)
      .where('created_at', '<', new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString())
      .execute();

    return Number(result.numUpdatedRows || 0);
  }

  static async cleanupOldGuestData(retentionDays = 30): Promise<number> {
    const cutoffDate = new Date(Date.now() - retentionDays * 24 * 60 * 60 * 1000);

    const result = await db
      .deleteFrom('payments')
      .where('is_guest_payment', '=', true)
      .where('status', 'in', ['succeeded', 'failed', 'canceled'])
      .where('created_at', '<', cutoffDate.toISOString())
      .execute();

    return Number(result.numDeletedRows || 0);
  }
}
```

## Next Steps

- **[API Reference](./api-reference.md)** - Complete API documentation
- **[Provider Setup](./providers/)** - Payment provider configuration
- **[Deployment](./deployment.md)** - Production deployment guide
- **[Examples](./examples/)** - Database usage examples
