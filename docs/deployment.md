# Deployment

Flowfull exposes the same Hono app through runtime-specific entrypoints:

- `src/index.ts` for custom Bun/Node-style hosting
- `src/deno.ts` for Deno Deploy
- `src/worker.ts` for Cloudflare Workers

## Runtime matrix

| Target | Entrypoint | Commands | Recommended databases | Notes |
| --- | --- | --- | --- | --- |
| Custom Bun/Node | `src/index.ts` | `bun run build`, `bun run start` | PostgreSQL, MySQL, LibSQL/Turso, Neon, PlanetScale | Full driver support is available on server runtimes. |
| Cloudflare Workers | `src/worker.ts` | `bun run dev:cf`, `bun run deploy:cf` | D1, LibSQL/Turso, Neon HTTP, PlanetScale | Hono runs directly through the Worker `fetch` export. Avoid raw TCP Postgres/MySQL drivers on Workers. |
| Deno Deploy | `src/deno.ts` | `bun run check:deno`, `bun run start:deno` | LibSQL/Turso, Neon HTTP, PlanetScale | Hono runs through `Deno.serve`. Prefer HTTP/serverless database drivers. |

## Custom Bun/Node

```bash
bun install
bun run validate-config
bun run build
bun run start
```

Set the same values from `.env.example`, especially `DATABASE_URL`, `FLOWLESS_API_URL`, and `BRIDGE_VALIDATION_SECRET`.

## Cloudflare Workers

```bash
bun run build:worker
bun run dev:cf
bun run deploy:cf
```

Use `wrangler.jsonc` as the starting point. Configure public environment variables under `vars` and secrets with `wrangler secret put`.

Worker-friendly database options:

- D1 with a `DB` binding and `DATABASE_TYPE=d1`
- LibSQL/Turso using `DATABASE_URL=libsql://...`
- Neon HTTP using `DATABASE_TYPE=neon-http`
- PlanetScale using `DATABASE_TYPE=planetscale`

## Deno Deploy

```bash
bun run check:deno
bun run start:deno
```

Suggested Deno Deploy settings:

- Entrypoint: `src/deno.ts`
- Install command: `deno install --allow-scripts`
- Check command: `bun run check:deno`
- Direct Deno check command: `deno cache --no-check src/deno.ts`
- Runtime command: Deno Deploy uses the entrypoint directly

Keep runtime-specific concerns in the entrypoints. Shared business logic should live behind the exported Hono app in `src/app.ts`.
