(globalThis as any).process ??= {
  env: {},
  uptime: () => 0,
  memoryUsage: () => ({ rss: 0, heapTotal: 0, heapUsed: 0, external: 0, arrayBuffers: 0 }),
};

const { default: app } = await import('@/app');

export default {
  fetch: app.fetch,
};
