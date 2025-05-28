import { Hono } from 'hono';
import { checkDatabaseHealth, getDatabaseStats } from '@/lib/database/connection';
import { PaymentProviderFactory } from '@/lib/providers/factory';
import { bridgeValidator } from '@/lib/auth/bridge-validator';
import { config } from '@/config/environment';

const health = new Hono();

// Basic health check
health.get('/', async (c) => {
  const startTime = Date.now();

  try {
    const [dbHealth, providerHealth, flowlessHealth] = await Promise.all([
      checkDatabaseHealth(),
      PaymentProviderFactory.healthCheckAll(),
      bridgeValidator.healthCheck()
    ]);

    const responseTime = Date.now() - startTime;
    const allHealthy = dbHealth &&
                      Object.values(providerHealth).some(p => p.success) &&
                      flowlessHealth.success;

    return c.json({
      status: allHealthy ? 'healthy' : 'degraded',
      timestamp: new Date().toISOString(),
      response_time_ms: responseTime,
      version: '1.0.0',
      environment: config.NODE_ENV,
      services: {
        database: {
          status: dbHealth ? 'healthy' : 'unhealthy',
          healthy: dbHealth
        },
        payment_providers: {
          status: Object.values(providerHealth).some(p => p.success) ? 'healthy' : 'unhealthy',
          providers: providerHealth
        },
        flowless_bridge: {
          status: flowlessHealth.success ? 'healthy' : 'unhealthy',
          latency_ms: flowlessHealth.latency,
          error: flowlessHealth.error
        }
      }
    }, allHealthy ? 200 : 503);
  } catch (error) {
    const responseTime = Date.now() - startTime;

    return c.json({
      status: 'unhealthy',
      timestamp: new Date().toISOString(),
      response_time_ms: responseTime,
      error: error instanceof Error ? error.message : 'Unknown error'
    }, 503);
  }
});

// Detailed health check
health.get('/detailed', async (c) => {
  const startTime = Date.now();

  try {
    const [dbHealth, dbStats, providerHealth, flowlessHealth, cacheStats] = await Promise.all([
      checkDatabaseHealth(),
      getDatabaseStats(),
      PaymentProviderFactory.healthCheckAll(),
      bridgeValidator.healthCheck(),
      bridgeValidator.getCacheStats()
    ]);

    const responseTime = Date.now() - startTime;
    const providerStats = PaymentProviderFactory.getStats();

    return c.json({
      status: 'healthy',
      timestamp: new Date().toISOString(),
      response_time_ms: responseTime,
      version: '1.0.0',
      environment: config.NODE_ENV,
      uptime_seconds: process.uptime(),
      memory_usage: process.memoryUsage(),
      services: {
        database: {
          healthy: dbHealth,
          stats: dbStats,
          type: dbStats.database_type
        },
        payment_providers: {
          health: providerHealth,
          stats: providerStats
        },
        flowless_bridge: {
          healthy: flowlessHealth.success,
          latency_ms: flowlessHealth.latency,
          error: flowlessHealth.error,
          cache_stats: cacheStats
        }
      },
      configuration: {
        guest_checkout_enabled: config.GUEST_CHECKOUT_ENABLED,
        enabled_providers: config.ENABLED_PROVIDERS,
        default_provider: config.DEFAULT_PAYMENT_PROVIDER,
        failover_enabled: config.PROVIDER_FAILOVER_ENABLED,
        cors_origins: config.CORS_ORIGINS,
        rate_limiting_enabled: config.RATE_LIMIT_ENABLED
      }
    });
  } catch (error) {
    const responseTime = Date.now() - startTime;

    return c.json({
      status: 'error',
      timestamp: new Date().toISOString(),
      response_time_ms: responseTime,
      error: error instanceof Error ? error.message : 'Unknown error'
    }, 500);
  }
});

// Database health check
health.get('/database', async (c) => {
  try {
    const [dbHealth, dbStats] = await Promise.all([
      checkDatabaseHealth(),
      getDatabaseStats()
    ]);

    return c.json({
      healthy: dbHealth,
      stats: dbStats,
      timestamp: new Date().toISOString()
    }, dbHealth ? 200 : 503);
  } catch (error) {
    return c.json({
      healthy: false,
      error: error instanceof Error ? error.message : 'Unknown error',
      timestamp: new Date().toISOString()
    }, 503);
  }
});

// Payment providers health check
health.get('/providers', async (c) => {
  try {
    const providerHealth = await PaymentProviderFactory.healthCheckAll();
    const providerStats = PaymentProviderFactory.getStats();

    const allHealthy = Object.values(providerHealth).some(p => p.success);

    return c.json({
      healthy: allHealthy,
      providers: providerHealth,
      stats: providerStats,
      timestamp: new Date().toISOString()
    }, allHealthy ? 200 : 503);
  } catch (error) {
    return c.json({
      healthy: false,
      error: error instanceof Error ? error.message : 'Unknown error',
      timestamp: new Date().toISOString()
    }, 503);
  }
});

// Flowless bridge health check
health.get('/flowless', async (c) => {
  try {
    const flowlessHealth = await bridgeValidator.healthCheck();
    const cacheStats = bridgeValidator.getCacheStats();

    return c.json({
      healthy: flowlessHealth.success,
      latency_ms: flowlessHealth.latency,
      error: flowlessHealth.error,
      cache_stats: cacheStats,
      timestamp: new Date().toISOString()
    }, flowlessHealth.success ? 200 : 503);
  } catch (error) {
    return c.json({
      healthy: false,
      error: error instanceof Error ? error.message : 'Unknown error',
      timestamp: new Date().toISOString()
    }, 503);
  }
});

// Readiness check (for Kubernetes)
health.get('/ready', async (c) => {
  try {
    // Check if all critical services are ready
    const [dbHealth, hasProviders] = await Promise.all([
      checkDatabaseHealth(),
      Promise.resolve(PaymentProviderFactory.getAvailableProviders().length > 0)
    ]);

    const ready = dbHealth && hasProviders;

    return c.json({
      ready,
      timestamp: new Date().toISOString(),
      checks: {
        database: dbHealth,
        payment_providers: hasProviders
      }
    }, ready ? 200 : 503);
  } catch (error) {
    return c.json({
      ready: false,
      error: error instanceof Error ? error.message : 'Unknown error',
      timestamp: new Date().toISOString()
    }, 503);
  }
});

// Liveness check (for Kubernetes)
health.get('/live', (c) => {
  return c.json({
    alive: true,
    timestamp: new Date().toISOString(),
    uptime_seconds: process.uptime()
  });
});

// Metrics endpoint (Prometheus format)
health.get('/metrics', async (c) => {
  if (!config.METRICS_ENABLED) {
    return c.json({
      error: 'Metrics are disabled'
    }, 404);
  }

  try {
    const [dbStats, providerHealth] = await Promise.all([
      getDatabaseStats(),
      PaymentProviderFactory.healthCheckAll()
    ]);

    // Simple Prometheus-style metrics
    const metrics = [
      `# HELP bridge_payments_uptime_seconds Application uptime in seconds`,
      `# TYPE bridge_payments_uptime_seconds counter`,
      `bridge_payments_uptime_seconds ${process.uptime()}`,
      '',
      `# HELP bridge_payments_memory_usage_bytes Memory usage in bytes`,
      `# TYPE bridge_payments_memory_usage_bytes gauge`,
      `bridge_payments_memory_usage_bytes{type="rss"} ${process.memoryUsage().rss}`,
      `bridge_payments_memory_usage_bytes{type="heapTotal"} ${process.memoryUsage().heapTotal}`,
      `bridge_payments_memory_usage_bytes{type="heapUsed"} ${process.memoryUsage().heapUsed}`,
      '',
      `# HELP bridge_payments_database_records_total Total number of database records`,
      `# TYPE bridge_payments_database_records_total gauge`,
      `bridge_payments_database_records_total{table="payments"} ${dbStats.payments}`,
      `bridge_payments_database_records_total{table="users"} ${dbStats.users}`,
      `bridge_payments_database_records_total{table="customers"} ${dbStats.customers}`,
      `bridge_payments_database_records_total{table="payment_methods"} ${dbStats.payment_methods}`,
      `bridge_payments_database_records_total{table="addresses"} ${dbStats.addresses}`,
      `bridge_payments_database_records_total{table="webhooks"} ${dbStats.webhooks}`,
      '',
      `# HELP bridge_payments_provider_health Provider health status (1=healthy, 0=unhealthy)`,
      `# TYPE bridge_payments_provider_health gauge`
    ];

    // Add provider health metrics
    Object.entries(providerHealth).forEach(([provider, health]) => {
      metrics.push(`bridge_payments_provider_health{provider="${provider}"} ${health.success ? 1 : 0}`);
      if (health.latency) {
        metrics.push(`bridge_payments_provider_latency_ms{provider="${provider}"} ${health.latency}`);
      }
    });

    return c.text(metrics.join('\n'), 200, {
      'Content-Type': 'text/plain; version=0.0.4; charset=utf-8'
    });
  } catch (error) {
    return c.json({
      error: error instanceof Error ? error.message : 'Unknown error'
    }, 500);
  }
});

export default health;
