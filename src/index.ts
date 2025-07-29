import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { logger } from 'hono/logger';
import { compress } from 'hono/compress';
import { timeout } from 'hono/timeout';
import { HTTPException } from 'hono/http-exception';
import { config, isDevelopment } from '@/config/environment';
import { authLoggingMiddleware } from '@/lib/auth/middleware';

// Import routes
import healthRoutes from '@/routes/health';
import apiRoutes from '@/routes/api';

// Create Hono app
const app = new Hono();

// Global middleware
app.use('*', logger());

// Compression middleware with Bun CompressionStream compatibility check
if (config.COMPRESSION_ENABLED && !config.COMPRESSION_FORCE_DISABLE) {
  try {
    // Check if CompressionStream is available in the current Bun runtime
    if (typeof CompressionStream !== 'undefined' && CompressionStream) {
      app.use('*', compress());
      console.log('✅ Compression middleware enabled (CompressionStream available)');
    } else {
      console.warn('⚠️ CompressionStream not available in this Bun runtime, compression disabled');
      console.warn('💡 Consider updating Bun or setting COMPRESSION_FORCE_DISABLE=true to suppress this warning');
    }
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    console.warn('⚠️ Failed to initialize compression middleware:', errorMessage);
    console.warn('🔧 Running without compression - this may affect performance but won\'t break functionality');
    console.warn('💡 Set COMPRESSION_FORCE_DISABLE=true to disable compression and suppress these warnings');
  }
} else if (config.COMPRESSION_FORCE_DISABLE) {
  console.log('🔧 Compression explicitly disabled via COMPRESSION_FORCE_DISABLE');
}

// CORS middleware
app.use('*', cors({
  origin: config.CORS_ORIGINS,
  allowMethods: config.CORS_METHODS,
  allowHeaders: config.CORS_HEADERS,
  credentials: config.CORS_CREDENTIALS,
  maxAge: config.CORS_MAX_AGE
}));

// Request timeout middleware
app.use('*', timeout(config.REQUEST_TIMEOUT));

// Authentication logging middleware
if (config.DEV_LOG_REQUESTS) {
  app.use('*', authLoggingMiddleware);
}

// Request size limit middleware
app.use('*', async (c, next) => {
  const contentLength = c.req.header('content-length');
  if (contentLength && parseInt(contentLength) > config.MAX_REQUEST_SIZE) {
    throw new HTTPException(413, {
      message: `Request too large. Maximum size: ${config.MAX_REQUEST_SIZE} bytes`
    });
  }
  await next();
});

// Content type validation middleware
if (config.VALIDATE_CONTENT_TYPE) {
  app.use('*', async (c, next) => {
    const method = c.req.method;
    const path = c.req.path;
    const contentType = c.req.header('content-type');

    // Skip content-type validation for test-email routes and health checks
    const skipValidation = path.startsWith('/bridge-payment/test-email') ||
                          path.startsWith('/health') ||
                          path === '/';

    if (['POST', 'PUT', 'PATCH'].includes(method) && !skipValidation) {
      if (!contentType || !contentType.includes('application/json')) {
        throw new HTTPException(400, {
          message: 'Content-Type must be application/json'
        });
      }
    }

    await next();
  });
}

// User agent requirement middleware
if (config.REQUIRE_USER_AGENT) {
  app.use('*', async (c, next) => {
    const userAgent = c.req.header('user-agent');
    if (!userAgent) {
      throw new HTTPException(400, {
        message: 'User-Agent header is required'
      });
    }
    await next();
  });
}

// Routes
app.route('/health', healthRoutes);
app.route('/api/v1', apiRoutes);

// Root endpoint
app.get('/', (c) => {
  return c.json({
    name: 'FLOWFULL API',
    version: '1.0.0',
    description: 'Standard architecture backend API template with Flowless session validation',
    environment: config.NODE_ENV,
    timestamp: new Date().toISOString(),
    features: {
      session_validation: 'Bridge Validator with LFU cache',
      multi_database: 'libsql, MySQL, PostgreSQL support',
      authentication: 'Flowless integration',
      security: 'Zod validation and sanitization',
      cron_jobs: 'Croner integration',
      email_system: 'i18n template support'
    },
    endpoints: {
      health: '/health',
      api: '/api/v1'
    }
  });
});

// 404 handler
app.notFound((c) => {
  return c.json({
    error: 'Not Found',
    message: 'The requested endpoint does not exist',
    path: c.req.path,
    method: c.req.method,
    timestamp: new Date().toISOString()
  }, 404);
});

// Global error handler
app.onError((err, c) => {
  console.error('Global error handler:', err);

  if (err instanceof HTTPException) {
    return c.json({
      error: err.message,
      status: err.status,
      timestamp: new Date().toISOString(),
      ...(isDevelopment() && { stack: err.stack })
    }, err.status);
  }

  // Database connection errors
  if (err.message.includes('database') || err.message.includes('connection')) {
    return c.json({
      error: 'Database service unavailable',
      message: 'Please try again later',
      timestamp: new Date().toISOString(),
      ...(isDevelopment() && { details: err.message })
    }, 503);
  }

  // Payment provider errors
  if (err.message.includes('provider') || err.message.includes('payment')) {
    return c.json({
      error: 'Payment service unavailable',
      message: 'Please try again later',
      timestamp: new Date().toISOString(),
      ...(isDevelopment() && { details: err.message })
    }, 503);
  }

  // Generic server error
  return c.json({
    error: 'Internal Server Error',
    message: 'An unexpected error occurred',
    timestamp: new Date().toISOString(),
    ...(isDevelopment() && {
      details: err.message,
      stack: err.stack
    })
  }, 500);
});

// Graceful shutdown handler
process.on('SIGTERM', async () => {
  console.log('🛑 SIGTERM received, shutting down gracefully...');

  try {
    // Close database connections
    const { closeDatabase } = await import('@/lib/database/connection');
    await closeDatabase();

    console.log('✅ Graceful shutdown completed');
    process.exit(0);
  } catch (error) {
    console.error('❌ Error during shutdown:', error);
    process.exit(1);
  }
});

process.on('SIGINT', async () => {
  console.log('🛑 SIGINT received, shutting down gracefully...');

  try {
    // Close database connections
    const { closeDatabase } = await import('@/lib/database/connection');
    await closeDatabase();

    console.log('✅ Graceful shutdown completed');
    process.exit(0);
  } catch (error) {
    console.error('❌ Error during shutdown:', error);
    process.exit(1);
  }
});

// Start server
const port = config.PORT;
const host = config.HOST;

console.log(`🚀 FLOWFULL API starting...`);
console.log(`📊 Environment: ${config.NODE_ENV}`);
console.log(`🔌 Database: ${config.DATABASE_URL.replace(/\/\/.*@/, '//***:***@')}`);
console.log(`🔗 Flowless API: ${config.FLOWLESS_API_URL}`);
console.log(`🔒 Session validation: ${config.AUTH_VALIDATION_MODE}`);
console.log(`💾 Cache: LFU enabled for session optimization`);

export default {
  port,
  hostname: host,
  fetch: app.fetch,
  // Increase server timeout to handle slow backend responses
  idleTimeout: 60, // 60 seconds (Bun expects seconds, not milliseconds)
  // Development settings
  development: isDevelopment(),
};

// Export app for testing
export { app };
