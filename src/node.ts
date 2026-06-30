import { serve } from '@hono/node-server';

if (process.env.PUBFLOW_WEB_PREVIEW === 'true') {
  process.env.DATABASE_URL ||= 'file:preview.db';
  process.env.DATABASE_TYPE ||= 'libsql';
  process.env.BRIDGE_VALIDATION_SECRET ||= 'pubflow-web-preview-only-secret-change-before-production';
  process.env.AUTH_VALIDATION_MODE ||= 'DISABLED';
  process.env.RATE_LIMIT_ENABLED ||= 'false';
}

const [{ default: app }, { config }] = await Promise.all([
  import('@/app'),
  import('@/config/environment'),
]);

const server = serve({
  fetch: app.fetch,
  hostname: config.HOST,
  port: config.PORT,
});

console.log(`FLOWFULL API listening on http://${config.HOST}:${config.PORT}`);

async function shutdown(signal: NodeJS.Signals) {
  console.log(`${signal} received, shutting down gracefully...`);
  server.close(async () => {
    try {
      const { closeDatabase } = await import('@/lib/database/connection');
      await closeDatabase();
      process.exit(0);
    } catch (error) {
      console.error('Error during shutdown:', error);
      process.exit(1);
    }
  });
}

process.once('SIGTERM', () => void shutdown('SIGTERM'));
process.once('SIGINT', () => void shutdown('SIGINT'));
