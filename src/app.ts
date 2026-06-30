import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { logger } from 'hono/logger';
import { compress } from 'hono/compress';
import { timeout } from 'hono/timeout';
import { HTTPException } from 'hono/http-exception';
import { config, isDevelopment } from '@/config/environment';
import { authLoggingMiddleware } from '@/lib/auth/middleware';
import healthRoutes from '@/routes/health';
import apiRoutes from '@/routes/api';

const app = new Hono();

app.use('*', logger());

if (config.COMPRESSION_ENABLED && !config.COMPRESSION_FORCE_DISABLE) {
  try {
    if (typeof CompressionStream !== 'undefined' && CompressionStream) {
      app.use('*', compress());
      console.log('Compression middleware enabled');
    } else {
      console.warn('CompressionStream unavailable, compression disabled');
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    console.warn('Failed to initialize compression middleware:', message);
  }
} else if (config.COMPRESSION_FORCE_DISABLE) {
  console.log('Compression explicitly disabled via COMPRESSION_FORCE_DISABLE');
}

app.use('*', cors({
  origin: config.CORS_ORIGINS,
  allowMethods: config.CORS_METHODS,
  allowHeaders: config.CORS_HEADERS,
  credentials: config.CORS_CREDENTIALS,
  maxAge: config.CORS_MAX_AGE
}));

app.use('*', timeout(config.REQUEST_TIMEOUT));

if (config.DEV_LOG_REQUESTS) {
  app.use('*', authLoggingMiddleware);
}

app.use('*', async (c, next) => {
  const contentLength = c.req.header('content-length');
  if (contentLength && parseInt(contentLength) > config.MAX_REQUEST_SIZE) {
    throw new HTTPException(413, {
      message: `Request too large. Maximum size: ${config.MAX_REQUEST_SIZE} bytes`
    });
  }
  await next();
});

if (config.VALIDATE_CONTENT_TYPE) {
  app.use('*', async (c, next) => {
    const method = c.req.method;
    const path = c.req.path;
    const contentType = c.req.header('content-type');
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

app.route('/health', healthRoutes);
app.route('/api/v1', apiRoutes);

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

app.notFound((c) => {
  return c.json({
    error: 'Not Found',
    message: 'The requested endpoint does not exist',
    path: c.req.path,
    method: c.req.method,
    timestamp: new Date().toISOString()
  }, 404);
});

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

  if (err.message.includes('database') || err.message.includes('connection')) {
    return c.json({
      error: 'Database service unavailable',
      message: 'Please try again later',
      timestamp: new Date().toISOString(),
      ...(isDevelopment() && { details: err.message })
    }, 503);
  }

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

export { app };
export default app;
