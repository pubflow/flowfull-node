import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { logger } from 'hono/logger';
import { compress } from 'hono/compress';
import { timeout } from 'hono/timeout';
import { HTTPException } from 'hono/http-exception';
import { config, isDevelopment } from '@/config/environment';
import { authLoggingMiddleware } from '@/lib/auth/middleware';
import { initializeRenewalSystem, shutdownRenewalSystem } from '@/lib/renewal-system';

// Import routes
import healthRoutes from '@/routes/health';
import paymentRoutes from '@/routes/payments';
import webhookRoutes from '@/routes/webhooks';
import customerRoutes from '@/routes/customers';
import paymentMethodRoutes from '@/routes/payment-methods';
import addressRoutes from '@/routes/addresses';
import subscriptionRoutes from '@/routes/subscriptions';
import guestConversionRoutes from '@/routes/guest-conversion';
import renewalWebhookRoutes from '@/routes/webhooks/renewals';
import adminRenewalRoutes from '@/routes/admin/renewals';
import adminRoutes from './routes/admin';
// import testEmailRoutes from '@/routes/test-email';

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
app.route('/bridge-payment', paymentRoutes);
app.route('/bridge-payment/webhooks', webhookRoutes);
app.route('/bridge-payment/webhooks/renewals', renewalWebhookRoutes);
app.route('/bridge-payment/customers', customerRoutes);
app.route('/bridge-payment/payment-methods', paymentMethodRoutes);
app.route('/bridge-payment/addresses', addressRoutes);
app.route('/bridge-payment/subscriptions', subscriptionRoutes);
app.route('/bridge-payment/guest', guestConversionRoutes);
app.route('/bridge-payment/admin/renewals', adminRenewalRoutes);
app.route('/bridge-payment/admin', adminRoutes);
// app.route('/bridge-payment/test-email', testEmailRoutes);

// Root endpoint
app.get('/', (c) => {
  return c.json({
    name: 'Bridge Payments API',
    version: '1.0.0',
    environment: config.NODE_ENV,
    timestamp: new Date().toISOString(),
    endpoints: {
      health: '/health',
      payments: '/bridge-payment/payments',
      customers: '/bridge-payment/customers',
      payment_methods: '/bridge-payment/payment-methods',
      addresses: '/bridge-payment/addresses',
      subscriptions: '/bridge-payment/subscriptions',
      guest_conversion: '/bridge-payment/guest',
      webhooks: '/bridge-payment/webhooks',
      renewal_webhooks: '/bridge-payment/webhooks/renewals',
      admin_renewals: '/bridge-payment/admin/renewals',
      admin: '/bridge-payment/admin'
      // test_email: '/bridge-payment/test-email'
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
    // Shutdown renewal system
    await shutdownRenewalSystem();

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
    // Shutdown renewal system
    await shutdownRenewalSystem();

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

console.log(`🚀 Bridge Payments API starting...`);
console.log(`📊 Environment: ${config.NODE_ENV}`);
console.log(`🔌 Database: ${config.DATABASE_URL.replace(/\/\/.*@/, '//***:***@')}`);
console.log(`🔗 Flowless API: ${config.FLOWLESS_API_URL}`);
console.log(`💳 Enabled providers: ${config.ENABLED_PROVIDERS.join(', ')}`);
console.log(`🔒 Guest checkout: ${config.GUEST_CHECKOUT_ENABLED ? 'enabled' : 'disabled'}`);

// Initialize renewal system
if (process.env.RENEWALS_ENABLED !== 'false') {
  initializeRenewalSystem().catch(error => {
    console.error('❌ Failed to initialize renewal system:', error);
  });
} else {
  console.log('⏸️ Renewal system disabled via environment variable');
}

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
