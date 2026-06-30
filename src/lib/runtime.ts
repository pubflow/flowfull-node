export function getEnv(name: string): string | undefined {
  const deno = (globalThis as any).Deno;
  if (deno?.env?.get) {
    try {
      return deno.env.get(name);
    } catch {
      // Deno permission may be unavailable in some checks.
    }
  }

  return (globalThis as any).process?.env?.[name];
}

export function setEnv(name: string, value: string): void {
  const deno = (globalThis as any).Deno;
  if (deno?.env?.set) {
    try {
      deno.env.set(name, value);
      return;
    } catch {
      // Fall through to process env when available.
    }
  }

  const processEnv = (globalThis as any).process?.env;
  if (processEnv) {
    processEnv[name] = value;
  }
}

export function uptimeSeconds(): number {
  const uptime = (globalThis as any).process?.uptime;
  return typeof uptime === 'function' ? uptime() : 0;
}

export function memoryUsage() {
  const memory = (globalThis as any).process?.memoryUsage;
  if (typeof memory === 'function') {
    return memory();
  }

  return {
    rss: 0,
    heapTotal: 0,
    heapUsed: 0,
    external: 0,
    arrayBuffers: 0,
  };
}

export function exitProcess(code: number): never {
  const processExit = (globalThis as any).process?.exit;
  if (typeof processExit === 'function') {
    processExit(code);
  }
  throw new Error(`Process exit requested with code ${code}`);
}

export async function sha256Hex(input: string): Promise<string> {
  const cryptoHasher = (globalThis as any).Bun?.CryptoHasher;
  if (cryptoHasher) {
    const hasher = new cryptoHasher('sha256');
    hasher.update(input);
    return hasher.digest('hex');
  }

  const data = new TextEncoder().encode(input);
  const digest = await crypto.subtle.digest('SHA-256', data);
  return [...new Uint8Array(digest)]
    .map((byte) => byte.toString(16).padStart(2, '0'))
    .join('');
}

export function runtimeRandomSecret(): string {
  const bunHash = (globalThis as any).Bun?.hash;
  if (bunHash) {
    return bunHash(Date.now().toString()).toString();
  }
  return crypto.randomUUID();
}
