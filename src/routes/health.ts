import { Hono } from 'hono';
import { getDatabase, getDatabaseStats } from '@/lib/database/connection';
import { config } from '@/config/environment';
import { requireAdmin } from '@/lib/auth/auth-middleware';

const health = new Hono();

// Basic health check - Template version
health.get('/', async (c) => {
  const startTime = Date.now();

  try {
    // Simple database health check
    const db = await getDatabase();
    await db.selectFrom('users').select('id').limit(1).execute();

    const responseTime = Date.now() - startTime;

    return c.json({
      status: 'healthy',
      timestamp: new Date().toISOString(),
      response_time_ms: responseTime,
      version: '1.0.0',
      environment: config.NODE_ENV || 'development',
      services: {
        database: {
          status: 'healthy',
          healthy: true
        },
        api: {
          status: 'healthy',
          uptime_seconds: process.uptime()
        }
      },
      note: 'Template health check - customize for your specific system'
    }, 200);
  } catch (error) {
    const responseTime = Date.now() - startTime;

    return c.json({
      status: 'unhealthy',
      timestamp: new Date().toISOString(),
      response_time_ms: responseTime,
      error: error instanceof Error ? error.message : 'Unknown error',
      services: {
        database: {
          status: 'unhealthy',
          healthy: false
        }
      }
    }, 503);
  }
});

// Detailed health check - ADMIN ONLY (contains sensitive system stats)
health.get('/detailed', requireAdmin(), async (c) => {
  const startTime = Date.now();

  try {
    // Database health check with basic stats
    const db = await getDatabase();
    await db.selectFrom('users').select('id').limit(1).execute();

    const dbStats = await getDatabaseStats();
    const responseTime = Date.now() - startTime;

    return c.json({
      status: 'healthy',
      timestamp: new Date().toISOString(),
      response_time_ms: responseTime,
      version: '1.0.0',
      environment: config.NODE_ENV || 'development',
      uptime_seconds: process.uptime(),
      memory_usage: process.memoryUsage(),
      services: {
        database: {
          healthy: true,
          stats: dbStats,
          type: dbStats.database_type
        },
        api: {
          healthy: true,
          uptime_seconds: process.uptime()
        }
      },
      note: 'Template detailed health check - customize for your specific system'
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

// Database health check - Template version
health.get('/database', async (c) => {
  try {
    const db = await getDatabase();
    await db.selectFrom('users').select('id').limit(1).execute();

    return c.json({
      healthy: true,
      timestamp: new Date().toISOString(),
      note: 'Template database health check'
    }, 200);
  } catch (error) {
    return c.json({
      healthy: false,
      error: error instanceof Error ? error.message : 'Unknown error',
      timestamp: new Date().toISOString()
    }, 503);
  }
});

// Readiness check (for Kubernetes) - Template version
health.get('/ready', async (c) => {
  try {
    // Check if system is ready
    const db = await getDatabase();
    await db.selectFrom('users').select('id').limit(1).execute();

    return c.json({
      ready: true,
      timestamp: new Date().toISOString(),
      checks: {
        database: true
      },
      note: 'Template readiness check'
    }, 200);
  } catch (error) {
    return c.json({
      ready: false,
      error: error instanceof Error ? error.message : 'Unknown error',
      timestamp: new Date().toISOString()
    }, 503);
  }
});

// Liveness check (for Kubernetes) - Template version
health.get('/live', (c) => {
  return c.json({
    alive: true,
    timestamp: new Date().toISOString(),
    uptime_seconds: process.uptime(),
    note: 'Template liveness check'
  });
});

// Metrics endpoint (Prometheus format) - ADMIN ONLY (exposes system metrics)
health.get('/metrics', requireAdmin(), async (c) => {
  try {
    const dbStats = await getDatabaseStats();

    // Simple Prometheus-style metrics for template
    const metrics = [
      `# HELP flowfull_template_uptime_seconds Application uptime in seconds`,
      `# TYPE flowfull_template_uptime_seconds counter`,
      `flowfull_template_uptime_seconds ${process.uptime()}`,
      '',
      `# HELP flowfull_template_memory_usage_bytes Memory usage in bytes`,
      `# TYPE flowfull_template_memory_usage_bytes gauge`,
      `flowfull_template_memory_usage_bytes{type="rss"} ${process.memoryUsage().rss}`,
      `flowfull_template_memory_usage_bytes{type="heapTotal"} ${process.memoryUsage().heapTotal}`,
      `flowfull_template_memory_usage_bytes{type="heapUsed"} ${process.memoryUsage().heapUsed}`,
      '',
      `# HELP flowfull_template_database_records_total Total number of database records`,
      `# TYPE flowfull_template_database_records_total gauge`,
      `flowfull_template_database_records_total{table="users"} ${dbStats.users}`,
      '',
      `# HELP flowfull_template_system_health System health status (1=healthy, 0=unhealthy)`,
      `# TYPE flowfull_template_system_health gauge`,
      `flowfull_template_system_health{component="database"} 1`,
      `flowfull_template_system_health{component="api"} 1`
    ];

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
