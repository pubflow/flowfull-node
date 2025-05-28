import { Kysely, PostgresDialect, MysqlDialect } from 'kysely';
import { Pool } from 'pg';
import { createPool } from 'mysql2';
import { config, detectDatabaseType } from '@/config/environment';
import type { Database as DatabaseSchema } from './types';

// Additional dialect imports for serverless/edge databases
let NeonDialect: any, NeonHTTPDialect: any;
let PlanetScaleDialect: any;
let LibsqlDialect: any;
let D1Dialect: any;

// Lazy load dialects to avoid import errors if packages aren't installed
async function loadDialects() {
  try {
    const neonModule = await import('kysely-neon');
    NeonDialect = neonModule.NeonDialect;
    NeonHTTPDialect = neonModule.NeonHTTPDialect;
  } catch (e) {
    // Neon not available
  }

  try {
    const planetscaleModule = await import('kysely-planetscale');
    PlanetScaleDialect = planetscaleModule.PlanetScaleDialect;
  } catch (e) {
    // PlanetScale not available
  }

  try {
    const libsqlModule = await import('@libsql/kysely-libsql');
    LibsqlDialect = libsqlModule.LibsqlDialect;
  } catch (e) {
    // LibSQL not available
  }

  try {
    const d1Module = await import('kysely-d1');
    D1Dialect = d1Module.D1Dialect;
  } catch (e) {
    // D1 not available
  }
}

// Create appropriate dialect based on database type
async function createDialect() {
  const dbUrl = config.DATABASE_URL;
  const dbType = detectDatabaseType(dbUrl);

  console.log(`🔌 Connecting to ${dbType} database...`);

  switch (dbType) {
    case 'neon':
      await loadDialects();
      if (!NeonDialect) {
        throw new Error('Neon dialect not available. Install: bun add kysely-neon @neondatabase/serverless ws');
      }
      return new NeonDialect({
        connectionString: dbUrl,
        // Add webSocketConstructor for Node.js/Bun
        ...(typeof window === 'undefined' && {
          webSocketConstructor: (await import('ws')).default
        })
      });

    case 'neon-http':
      await loadDialects();
      if (!NeonHTTPDialect) {
        throw new Error('Neon HTTP dialect not available. Install: bun add kysely-neon @neondatabase/serverless');
      }
      return new NeonHTTPDialect({
        connectionString: dbUrl
      });

    case 'planetscale':
      await loadDialects();
      if (!PlanetScaleDialect) {
        throw new Error('PlanetScale dialect not available. Install: bun add kysely-planetscale @planetscale/database undici');
      }
      return new PlanetScaleDialect({
        url: dbUrl,
        // Add fetch for Node.js/Bun environments
        ...(typeof window === 'undefined' && {
          fetch: (await import('undici')).fetch
        }),
        useSharedConnection: config.PLANETSCALE_SHARED_CONNECTION || false
      });

    case 'libsql':
      await loadDialects();
      if (!LibsqlDialect) {
        throw new Error('LibSQL dialect not available. Install: bun add @libsql/kysely-libsql @libsql/client');
      }
      return new LibsqlDialect({
        url: dbUrl,
        authToken: config.LIBSQL_AUTH_TOKEN
      });

    case 'd1':
      await loadDialects();
      if (!D1Dialect) {
        throw new Error('D1 dialect not available. Install: bun add kysely-d1');
      }
      // D1 requires the binding to be passed from Cloudflare Workers
      const d1Database = (globalThis as any).DB || process.env.DB;
      if (!d1Database) {
        throw new Error('D1 database binding not found. Ensure DB is bound in wrangler.toml');
      }
      return new D1Dialect({
        database: d1Database
      });

    case 'postgresql':
      return new PostgresDialect({
        pool: new Pool({
          connectionString: dbUrl,
          min: config.DATABASE_POOL_MIN,
          max: config.DATABASE_POOL_MAX,
          ssl: config.DATABASE_SSL ? { rejectUnauthorized: false } : false
        })
      });

    case 'mysql':
      return new MysqlDialect({
        pool: createPool({
          uri: dbUrl,
          connectionLimit: config.DATABASE_POOL_MAX,
          ssl: config.DATABASE_SSL ? {} : undefined
        })
      });

    default:
      throw new Error(`Unsupported database type: ${dbType}. Supported types: postgresql, mysql, neon, planetscale, libsql, d1`);
  }
}

// Create and export database instance
let dbInstance: Kysely<DatabaseSchema> | null = null;

export async function createDatabase(): Promise<Kysely<DatabaseSchema>> {
  if (dbInstance) {
    return dbInstance;
  }

  try {
    const dialect = await createDialect();

    dbInstance = new Kysely<DatabaseSchema>({
      dialect,
      log: config.DEV_MODE ? ['query', 'error'] : ['error']
    });

    // Test connection
    await testConnection(dbInstance);

    console.log('✅ Database connected successfully');
    return dbInstance;
  } catch (error) {
    console.error('❌ Database connection failed:', error);
    throw error;
  }
}

// Test database connection
async function testConnection(db: Kysely<DatabaseSchema>): Promise<void> {
  try {
    // Try a simple query that works across all database types
    await db.selectFrom('payment_providers').select('id').limit(1).execute();
  } catch (error) {
    // If table doesn't exist, that's okay - we just want to test connectivity
    if (error instanceof Error && error.message.includes('does not exist')) {
      return;
    }
    throw error;
  }
}

// Get database instance (lazy initialization)
export async function getDatabase(): Promise<Kysely<DatabaseSchema>> {
  if (!dbInstance) {
    return await createDatabase();
  }
  return dbInstance;
}

// Close database connection
export async function closeDatabase(): Promise<void> {
  if (dbInstance) {
    await dbInstance.destroy();
    dbInstance = null;
    console.log('🔌 Database connection closed');
  }
}

// Database health check
export async function checkDatabaseHealth(): Promise<boolean> {
  try {
    const db = await getDatabase();
    await testConnection(db);
    return true;
  } catch (error) {
    console.error('Database health check failed:', error);
    return false;
  }
}

// Get database statistics
export async function getDatabaseStats() {
  try {
    const db = await getDatabase();

    // Use the correct table names from the database schema
    const [paymentCount, userCount, customerCount, methodCount, addressCount, webhookCount] = await Promise.all([
      db.selectFrom('payments').select(db.fn.count('id').as('count')).executeTakeFirst(),
      db.selectFrom('payment_users').select(db.fn.count('id').as('count')).executeTakeFirst(),
      db.selectFrom('customers').select(db.fn.count('id').as('count')).executeTakeFirst(),
      db.selectFrom('payment_methods').select(db.fn.count('id').as('count')).executeTakeFirst(),
      db.selectFrom('addresses').select(db.fn.count('id').as('count')).executeTakeFirst(),
      db.selectFrom('payment_webhooks').select(db.fn.count('id').as('count')).executeTakeFirst()
    ]);

    return {
      payments: Number(paymentCount?.count || 0),
      users: Number(userCount?.count || 0),
      customers: Number(customerCount?.count || 0),
      payment_methods: Number(methodCount?.count || 0),
      addresses: Number(addressCount?.count || 0),
      webhooks: Number(webhookCount?.count || 0),
      timestamp: new Date().toISOString(),
      database_type: detectDatabaseType(config.DATABASE_URL)
    };
  } catch (error) {
    console.error('Failed to get database stats:', error);
    return {
      payments: 0,
      users: 0,
      customers: 0,
      payment_methods: 0,
      addresses: 0,
      webhooks: 0,
      timestamp: new Date().toISOString(),
      database_type: detectDatabaseType(config.DATABASE_URL),
      error: error instanceof Error ? error.message : 'Unknown error'
    };
  }
}

// Export database instance for direct use (will be initialized on first access)
export const db = new Proxy({} as Kysely<DatabaseSchema>, {
  get(_target, prop) {
    if (!dbInstance) {
      throw new Error('Database not initialized. Call createDatabase() first or use getDatabase()');
    }
    return (dbInstance as any)[prop];
  }
});

// Initialize database on module load in non-test environments
if (config.NODE_ENV !== 'test') {
  createDatabase().catch(error => {
    console.error('Failed to initialize database:', error);
    process.exit(1);
  });
}
