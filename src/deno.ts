declare const Deno: {
  env: {
    get: (name: string) => string | undefined;
    set: (name: string, value: string) => void;
  };
  serve: (options: { port: number; hostname?: string }, handler: (request: Request) => Response | Promise<Response>) => unknown;
};

(globalThis as any).process ??= {
  env: new Proxy({} as Record<string, string | undefined>, {
    get: (_target, property: string) => Deno.env.get(property),
    set: (_target, property: string, value: string) => {
      Deno.env.set(property, value);
      return true;
    }
  }),
  uptime: () => 0,
  memoryUsage: () => ({ rss: 0, heapTotal: 0, heapUsed: 0, external: 0, arrayBuffers: 0 }),
};

const { default: app } = await import('@/app');
const { config } = await import('@/config/environment');

Deno.serve({ port: config.PORT, hostname: config.HOST }, app.fetch);

export { app };
