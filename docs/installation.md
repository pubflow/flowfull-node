# Installation & Setup Guide

## Prerequisites

Before installing Bridge-Payments, ensure you have the following:

- **Bun** >= 1.0.0 ([Install Bun](https://bun.sh/docs/installation))
- **Node.js** >= 18.0.0 (for compatibility)
- **Database**: PostgreSQL, MySQL, or SQLite
- **Flowless Backend**: Running and accessible
- **Payment Provider Accounts**: Stripe, PayPal, or Authorize.net

## 1. Project Setup

### Clone or Create Project

```bash
# Create new project directory
mkdir bridge-payments
cd bridge-payments

# Initialize Bun project
bun init -y
```

### Install Dependencies

```bash
# Core dependencies
bun add hono kysely zod nanoid

# Database drivers (choose based on your database)
# PostgreSQL (Standard)
bun add pg @types/pg

# Neon Serverless PostgreSQL
bun add kysely-neon @neondatabase/serverless ws

# MySQL (Standard)
bun add mysql2

# PlanetScale MySQL
bun add kysely-planetscale @planetscale/database undici

# LibSQL/Turso
bun add @libsql/kysely-libsql @libsql/client

# SQLite (Development/Testing)
bun add better-sqlite3

# Cloudflare D1 (Edge Workers)
bun add kysely-d1

# Payment providers
bun add stripe                    # Stripe
bun add @paypal/sdk-client        # PayPal
bun add authorizenet              # Authorize.net

# Development dependencies
bun add -d @types/bun typescript
```

## 2. Project Structure

Create the following directory structure:

```
bridge-payments/
├── src/
│   ├── lib/
│   │   ├── auth/
│   │   │   ├── bridge-validator.ts
│   │   │   └── middleware.ts
│   │   ├── database/
│   │   │   ├── connection.ts
│   │   │   ├── schema.ts
│   │   │   └── migrations/
│   │   ├── providers/
│   │   │   ├── base/
│   │   │   ├── stripe/
│   │   │   ├── paypal/
│   │   │   └── authorize-net/
│   │   └── utils/
│   ├── routes/
│   │   ├── payments.ts
│   │   ├── customers.ts
│   │   ├── payment-methods.ts
│   │   ├── webhooks.ts
│   │   └── health.ts
│   ├── config/
│   │   ├── database.ts
│   │   ├── providers.ts
│   │   └── environment.ts
│   └── index.ts
├── docs/
├── migrations/
├── tests/
├── .env.example
├── .env
├── package.json
├── tsconfig.json
└── README.md
```

## 3. Environment Configuration

### Create Environment Files

```bash
# Copy example environment file
cp .env.example .env
```

### Basic Environment Variables

```env
# Server Configuration
PORT=3001
NODE_ENV=development
BASE_URL=http://localhost:3001

# Database Configuration (choose one)
DATABASE_URL=postgresql://user:password@localhost:5432/bridge_payments
# DATABASE_URL=mysql://user:password@localhost:3306/bridge_payments
# DATABASE_URL=sqlite:./bridge_payments.db

# Flowless Integration
FLOWLESS_API_URL=http://localhost:3000
BRIDGE_VALIDATION_SECRET=your-shared-secret-key-here

# Guest Checkout Configuration
GUEST_CHECKOUT_ENABLED=true
GUEST_REQUIRE_EMAIL=true
GUEST_SESSION_DURATION=3600

# Security
CORS_ORIGINS=http://localhost:3000,http://localhost:5173
RATE_LIMIT_REQUESTS=100
RATE_LIMIT_WINDOW=900000

# Payment Providers
DEFAULT_PAYMENT_PROVIDER=stripe

# Stripe Configuration
STRIPE_SECRET_KEY=sk_test_...
STRIPE_WEBHOOK_SECRET=whsec_...
STRIPE_PUBLISHABLE_KEY=pk_test_...

# PayPal Configuration (optional)
PAYPAL_CLIENT_ID=your_paypal_client_id
PAYPAL_CLIENT_SECRET=your_paypal_client_secret
PAYPAL_ENVIRONMENT=sandbox

# Authorize.net Configuration (optional)
AUTHORIZE_NET_API_LOGIN=your_api_login
AUTHORIZE_NET_TRANSACTION_KEY=your_transaction_key
AUTHORIZE_NET_ENVIRONMENT=sandbox

# Logging
LOG_LEVEL=info
LOG_FORMAT=json
```

## 4. Database Setup

### Install Database Schema

```bash
# Create database (PostgreSQL example)
createdb bridge_payments

# Run migrations
bun run db:migrate
```

### Database Migration Script

Add to `package.json`:

```json
{
  "scripts": {
    "dev": "bun run --hot src/index.ts",
    "build": "bun build src/index.ts --outdir ./dist",
    "start": "bun run dist/index.js",
    "db:migrate": "bun run src/scripts/migrate.ts",
    "db:seed": "bun run src/scripts/seed.ts",
    "test": "bun test"
  }
}
```

## 5. TypeScript Configuration

Create `tsconfig.json`:

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "ESNext",
    "moduleResolution": "bundler",
    "allowImportingTsExtensions": true,
    "allowSyntheticDefaultImports": true,
    "esModuleInterop": true,
    "forceConsistentCasingInFileNames": true,
    "strict": true,
    "noImplicitAny": true,
    "skipLibCheck": true,
    "resolveJsonModule": true,
    "isolatedModules": true,
    "verbatimModuleSyntax": true,
    "declaration": true,
    "declarationMap": true,
    "sourceMap": true,
    "outDir": "./dist",
    "baseUrl": ".",
    "paths": {
      "@/*": ["./src/*"],
      "@/lib/*": ["./src/lib/*"],
      "@/routes/*": ["./src/routes/*"],
      "@/config/*": ["./src/config/*"]
    }
  },
  "include": [
    "src/**/*"
  ],
  "exclude": [
    "node_modules",
    "dist"
  ]
}
```

## 6. Basic Server Setup

Create `src/index.ts`:

```typescript
import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { logger } from 'hono/logger';
import { config } from '@/config/environment';

const app = new Hono();

// Middleware
app.use('*', logger());
app.use('*', cors({
  origin: config.corsOrigins,
  credentials: true
}));

// Health check
app.get('/health', (c) => {
  return c.json({
    status: 'ok',
    timestamp: new Date().toISOString(),
    version: '1.0.0'
  });
});

// Routes will be added here
app.get('/', (c) => {
  return c.json({
    message: 'Bridge-Payments API',
    docs: '/docs'
  });
});

export default {
  port: config.port,
  fetch: app.fetch,
};
```

## 7. Verification

### Test Installation

```bash
# Start development server
bun run dev

# Test health endpoint
curl http://localhost:3001/health

# Expected response:
# {"status":"ok","timestamp":"2024-01-15T10:00:00.000Z","version":"1.0.0"}
```

### Verify Database Connection

```bash
# Test database connection
bun run src/scripts/test-db.ts
```

## 8. Next Steps

After successful installation:

1. **[Configure Environment](./configuration.md)** - Detailed environment setup
2. **[Setup Database](./database.md)** - Database schema and migrations
3. **[Configure Flowless Integration](./authentication.md)** - Authentication setup
4. **[Setup Payment Providers](./providers/)** - Provider configuration
5. **[Test API Endpoints](./examples/)** - API testing examples

## Troubleshooting

### Common Issues

**Bun not found:**
```bash
# Install Bun
curl -fsSL https://bun.sh/install | bash
source ~/.bashrc
```

**Database connection errors:**
- Verify database is running
- Check connection string in `.env`
- Ensure database exists

**Port already in use:**
```bash
# Change port in .env
PORT=3002
```

**Module resolution errors:**
- Verify `tsconfig.json` paths
- Check import statements
- Restart TypeScript server

For more help, see [Troubleshooting Guide](./troubleshooting.md).
