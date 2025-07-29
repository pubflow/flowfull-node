import { z } from 'zod';

// Environment validation schema
const envSchema = z.object({
  // Server Configuration
  PORT: z.string().default('3001').transform(Number),
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
  BASE_URL: z.string().url().default('http://localhost:3001'),
  HOST: z.string().default('0.0.0.0'),

  // Database Configuration
  DATABASE_URL: z.string().min(1, 'DATABASE_URL is required'),
  DATABASE_TYPE: z.enum(['postgresql', 'mysql', 'neon', 'neon-http', 'planetscale', 'libsql', 'd1']).optional(),
  DATABASE_SSL: z.string().default('false').transform(val => val === 'true'),
  DATABASE_POOL_MIN: z.string().default('2').transform(Number),
  DATABASE_POOL_MAX: z.string().default('10').transform(Number),

  // Database-specific settings
  LIBSQL_AUTH_TOKEN: z.string().optional(),
  PLANETSCALE_HOST: z.string().optional(),
  PLANETSCALE_USERNAME: z.string().optional(),
  PLANETSCALE_PASSWORD: z.string().optional(),
  PLANETSCALE_SHARED_CONNECTION: z.string().default('false').transform(val => val === 'true'),

  // Flowless Integration
  FLOWLESS_API_URL: z.string().url().default('http://localhost:3000'),
  BRIDGE_VALIDATION_SECRET: z.string().min(32, 'Bridge validation secret must be at least 32 characters').default('bridge-payments-secret-key-development-only-change-in-production'),
  BRIDGE_VALIDATION_TIMEOUT: z.string().default('5000').transform(Number),
  BRIDGE_RETRY_ATTEMPTS: z.string().default('3').transform(Number),

  // Session Management
  SESSION_VALIDATION_CACHE_TTL: z.string().default('300').transform(Number),
  SESSION_HEADER_NAME: z.string().default('X-Session-ID'),
  SESSION_COOKIE_NAME: z.string().default('session_id'),
  SESSION_REQUIRE_HTTPS: z.string().default('false').transform(val => val === 'true'),

  // Authentication Validation Mode (Simplified)
  AUTH_VALIDATION_MODE: z.enum(['DISABLED', 'STANDARD', 'ADVANCED', 'STRICT']).default('STANDARD'),
  AUTH_ENABLE_VALIDATION_MODE: z.string().default('true').transform(val => val === 'true'),
  AUTH_IP_VALIDATION: z.string().default('true').transform(val => val === 'true'),
  AUTH_USER_AGENT_VALIDATION: z.string().default('true').transform(val => val === 'true'),
  AUTH_DEVICE_VALIDATION: z.string().default('false').transform(val => val === 'true'),
  AUTH_AUTO_INVALIDATE: z.string().default('false').transform(val => val === 'true'),
  AUTH_LOG_VIOLATIONS: z.string().default('true').transform(val => val === 'true'),

  // Application Features
  FEATURES_ENABLED: z.string().default('').transform(val => val.split(',').map(f => f.trim()).filter(Boolean)),

  // Security
  CORS_ORIGINS: z.string().default('http://localhost:3000').transform(val => val.split(',').map(o => o.trim())),
  CORS_METHODS: z.string().default('GET,POST,PUT,DELETE,OPTIONS').transform(val => val.split(',').map(m => m.trim())),
  CORS_HEADERS: z.string().default('Content-Type,Authorization,X-Session-ID').transform(val => val.split(',').map(h => h.trim())),
  CORS_CREDENTIALS: z.string().default('true').transform(val => val === 'true'),
  CORS_MAX_AGE: z.string().default('86400').transform(Number),

  // Rate Limiting
  RATE_LIMIT_ENABLED: z.string().default('true').transform(val => val === 'true'),
  RATE_LIMIT_REQUESTS: z.string().default('100').transform(Number),
  RATE_LIMIT_WINDOW: z.string().default('900000').transform(Number),
  RATE_LIMIT_SKIP_SUCCESSFUL: z.string().default('false').transform(val => val === 'true'),
  RATE_LIMIT_STORE: z.enum(['memory', 'redis']).default('memory'),

  // Request Security
  MAX_REQUEST_SIZE: z.string().default('1048576').transform(Number),
  REQUEST_TIMEOUT: z.string().default('30000').transform(Number),
  VALIDATE_CONTENT_TYPE: z.string().default('true').transform(val => val === 'true'),
  REQUIRE_USER_AGENT: z.string().default('false').transform(val => val === 'true'),

  // Client Secret Management
  CLIENT_SECRET_AUTO_CLEANUP: z.string().default('true').transform(val => val === 'true'),
  CLIENT_SECRET_CLEANUP_INTERVAL: z.string().default('3600').transform(Number),
  CLIENT_SECRET_MAX_AGE: z.string().default('86400').transform(Number),
  CLIENT_SECRET_CLEANUP_ON_SUCCESS: z.string().default('true').transform(val => val === 'true'),
  CLIENT_SECRET_CLEANUP_ON_FAILURE: z.string().default('false').transform(val => val === 'true'),

  // Logging
  LOG_LEVEL: z.enum(['error', 'warn', 'info', 'debug']).default('info'),
  LOG_FORMAT: z.enum(['json', 'text']).default('json'),
  LOG_MODE: z.string().default('false').transform(val => val === 'true'),
  LOG_FILE_ENABLED: z.string().default('true').transform(val => val === 'true'),
  LOG_FILE_PATH: z.string().default('./logs/bridge-payments.log'),
  LOG_ROTATION_ENABLED: z.string().default('true').transform(val => val === 'true'),
  LOG_MAX_SIZE: z.string().default('10485760').transform(Number),
  LOG_MAX_FILES: z.string().default('5').transform(Number),

  // Monitoring
  METRICS_ENABLED: z.string().default('true').transform(val => val === 'true'),
  METRICS_PORT: z.string().default('9090').transform(Number),
  HEALTH_CHECK_ENABLED: z.string().default('true').transform(val => val === 'true'),
  HEALTH_CHECK_PATH: z.string().default('/health'),

  // Development
  DEV_MODE: z.string().default('false').transform(val => val === 'true'),
  DEV_CORS_RELAXED: z.string().default('false').transform(val => val === 'true'),
  DEV_LOG_REQUESTS: z.string().default('false').transform(val => val === 'true'),
  DEV_MOCK_PROVIDERS: z.string().default('false').transform(val => val === 'true'),
  DEV_SEED_DATA: z.string().default('false').transform(val => val === 'true'),

  // Testing
  TEST_DATABASE_URL: z.string().default('sqlite::memory:'),
  TEST_MOCK_FLOWLESS: z.string().default('true').transform(val => val === 'true'),
  TEST_MOCK_PROVIDERS: z.string().default('true').transform(val => val === 'true'),
  TEST_TIMEOUT: z.string().default('10000').transform(Number),

  // Performance
  COMPRESSION_ENABLED: z.string().default('true').transform(val => val === 'true'),
  COMPRESSION_FORCE_DISABLE: z.string().default('false').transform(val => val === 'true'),
  CACHE_ENABLED: z.string().default('true').transform(val => val === 'true'),
  CACHE_TTL: z.string().default('300').transform(Number),
});

// Parse and validate environment variables
function parseEnvironment() {
  try {
    // Auto-detect Flowless API URL based on environment if not explicitly set
    if (!process.env.FLOWLESS_API_URL) {
      const nodeEnv = process.env.NODE_ENV || 'development';

      switch (nodeEnv) {
        case 'production':
          process.env.FLOWLESS_API_URL = 'https://api.flowless.app';
          break;
        case 'development':
          process.env.FLOWLESS_API_URL = 'http://localhost:3000';
          break;
        case 'test':
          process.env.FLOWLESS_API_URL = 'http://localhost:3000';
          break;
        default:
          process.env.FLOWLESS_API_URL = 'http://localhost:3000';
      }

      console.log(`🔗 Auto-detected Flowless API URL for ${nodeEnv}: ${process.env.FLOWLESS_API_URL}`);
    }

    return envSchema.parse(process.env);
  } catch (error) {
    console.error('❌ Environment validation failed:');
    if (error instanceof z.ZodError) {
      error.errors.forEach(err => {
        console.error(`  - ${err.path.join('.')}: ${err.message}`);
      });
    }
    process.exit(1);
  }
}

// Export validated configuration
export const config = parseEnvironment();

// Type for the configuration
export type Config = typeof config;

// Helper functions
export function isDevelopment(): boolean {
  return config.NODE_ENV === 'development';
}

export function isProduction(): boolean {
  return config.NODE_ENV === 'production';
}

export function isTest(): boolean {
  return config.NODE_ENV === 'test';
}

// Database type detection
export function detectDatabaseType(url: string): string {
  if (config.DATABASE_TYPE) {
    return config.DATABASE_TYPE;
  }

  if (url.startsWith('postgresql://') || url.startsWith('postgres://')) {
    return 'postgresql';
  }
  if (url.startsWith('mysql://')) {
    return 'mysql';
  }
  if (url.startsWith('libsql:')) {
    return 'libsql';
  }
  // Note: D1 requires special binding setup in Cloudflare Workers
  // SQLite is handled through LibSQL or D1 only

  throw new Error(`Unable to detect database type from URL: ${url}. Supported: postgresql, mysql, libsql, d1`);
}

// Basic configuration validation
export function validateConfig(): void {
  if (!config.DATABASE_URL) {
    console.error('❌ DATABASE_URL is required');
    process.exit(1);
  }

  if (!config.FLOWLESS_API_URL) {
    console.error('❌ FLOWLESS_API_URL is required');
    process.exit(1);
  }

  console.log('✅ Configuration validated successfully');
}

// Validate configuration on import
validateConfig();
