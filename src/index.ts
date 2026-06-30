import app from '@/app';
import { config, getLocalNetworkInfo, isDevelopment, isLocalMode } from '@/config/environment';

async function closeResources() {
  const { closeDatabase } = await import('@/lib/database/connection');
  await closeDatabase();
}

function registerShutdown(signal: 'SIGTERM' | 'SIGINT') {
  process.on(signal, async () => {
    console.log(`${signal} received, shutting down gracefully...`);
    try {
      await closeResources();
      console.log('Graceful shutdown completed');
      process.exit(0);
    } catch (error) {
      console.error('Error during shutdown:', error);
      process.exit(1);
    }
  });
}

registerShutdown('SIGTERM');
registerShutdown('SIGINT');

const port = config.PORT;
const host = config.HOST;

console.log('FLOWFULL API starting...');
console.log(`Environment: ${config.NODE_ENV}`);
console.log(`Database: ${config.DATABASE_URL.replace(/\/\/.*@/, '//***:***@')}`);
console.log(`Flowless API: ${config.FLOWLESS_API_URL}`);
console.log(`Session validation: ${config.AUTH_VALIDATION_MODE}`);

if (isLocalMode()) {
  const networkInfo = getLocalNetworkInfo();
  if (networkInfo) {
    console.log('LOCAL MODE ENABLED');
    console.log(`Local IP: ${networkInfo.localIP}`);
    console.log(`Server URL: ${networkInfo.serverUrl}`);
    networkInfo.accessUrls.forEach(url => console.log(`- ${url}`));
  }
}

export default {
  port,
  hostname: host,
  fetch: app.fetch,
  idleTimeout: 60,
  development: isDevelopment(),
};

export { app };
