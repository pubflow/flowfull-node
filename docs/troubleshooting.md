# Troubleshooting Guide

## Common Issues and Solutions

This guide covers the most common issues you might encounter when setting up and using Bridge-Payments.

## Installation Issues

### Bun Not Found

**Error:**
```bash
bun: command not found
```

**Solution:**
```bash
# Install Bun
curl -fsSL https://bun.sh/install | bash

# Reload shell
source ~/.bashrc
# or
source ~/.zshrc

# Verify installation
bun --version
```

### Module Resolution Errors

**Error:**
```
Cannot resolve module '@/lib/database'
```

**Solution:**
1. Check `tsconfig.json` paths configuration:
```json
{
  "compilerOptions": {
    "baseUrl": ".",
    "paths": {
      "@/*": ["./src/*"],
      "@/lib/*": ["./src/lib/*"]
    }
  }
}
```

2. Restart TypeScript server in your IDE
3. Verify file structure matches path mappings

### Dependency Installation Failures

**Error:**
```bash
error: package not found
```

**Solution:**
```bash
# Clear cache and reinstall
rm -rf node_modules bun.lockb
bun install

# If specific package fails
bun add package-name --force
```

## Database Issues

### Connection Failures

**Error:**
```
Error: connect ECONNREFUSED 127.0.0.1:5432
```

**Solutions:**

1. **PostgreSQL not running:**
```bash
# Start PostgreSQL
sudo systemctl start postgresql
# or
brew services start postgresql
```

2. **Wrong connection string:**
```env
# Verify DATABASE_URL format
DATABASE_URL=postgresql://username:password@localhost:5432/database_name
```

3. **Database doesn't exist:**
```bash
# Create database
createdb bridge_payments
```

4. **Permission issues:**
```sql
-- Grant permissions
GRANT ALL PRIVILEGES ON DATABASE bridge_payments TO username;
```

### Migration Failures

**Error:**
```
Migration failed: relation "payments" already exists
```

**Solutions:**

1. **Check migration state:**
```bash
# Check migrations table
SELECT * FROM migrations;
```

2. **Reset migrations (development only):**
```bash
# Drop all tables and re-run migrations
bun run db:reset
bun run db:migrate
```

3. **Manual migration fix:**
```sql
-- Mark migration as completed
INSERT INTO migrations (id) VALUES ('001_initial_schema');
```

### SSL Connection Issues

**Error:**
```
SSL connection required
```

**Solution:**
```env
# Enable SSL for production databases
DATABASE_SSL=true
DATABASE_URL=postgresql://user:pass@host:5432/db?sslmode=require
```

## Authentication Issues

### Session Validation Failures

**Error:**
```json
{
  "error": {
    "code": "INVALID_SESSION",
    "message": "Invalid or expired session"
  }
}
```

**Solutions:**

1. **Check Flowless connectivity:**
```bash
# Test Flowless API
curl -X POST http://localhost:3000/auth/bridge/validate \
  -H "Content-Type: application/json" \
  -H "X-Bridge-Secret: your-secret" \
  -d '{"sessionId":"test"}'
```

2. **Verify shared secret:**
```env
# Ensure both services have same secret
# Bridge-Payments
BRIDGE_VALIDATION_SECRET=same-secret-here

# Flowless
BRIDGE_VALIDATION_SECRET=same-secret-here
```

3. **Check session ID format:**
```javascript
// Ensure session ID is being sent correctly
const sessionId = getCookie('session_id') || getHeader('X-Session-ID');
```

### Bridge Validation Timeout

**Error:**
```
Bridge validation timeout
```

**Solutions:**

1. **Increase timeout:**
```env
BRIDGE_VALIDATION_TIMEOUT=10000
```

2. **Check network connectivity:**
```bash
# Test network connection
ping flowless-api-host
telnet flowless-api-host 3000
```

3. **Enable retry logic:**
```env
BRIDGE_RETRY_ATTEMPTS=3
```

## Payment Provider Issues

### Stripe Issues

**Error:**
```
Invalid API key provided
```

**Solutions:**

1. **Verify API keys:**
```env
# Check key format
STRIPE_SECRET_KEY=sk_test_51... # Test key
STRIPE_SECRET_KEY=sk_live_51... # Live key
```

2. **Test key validity:**
```bash
curl https://api.stripe.com/v1/payment_intents \
  -u sk_test_your_key: \
  -d amount=2000 \
  -d currency=usd
```

**Error:**
```
Webhook signature verification failed
```

**Solutions:**

1. **Verify webhook secret:**
```env
STRIPE_WEBHOOK_SECRET=whsec_...
```

2. **Check webhook endpoint:**
```bash
# Test webhook endpoint
curl -X POST http://localhost:3001/bridge-payment/webhooks/stripe \
  -H "Stripe-Signature: test" \
  -d '{}'
```

### PayPal Issues

**Error:**
```
Authentication failed
```

**Solutions:**

1. **Verify credentials:**
```env
PAYPAL_CLIENT_ID=your_client_id
PAYPAL_CLIENT_SECRET=your_client_secret
PAYPAL_ENVIRONMENT=sandbox # or live
```

2. **Test API access:**
```bash
# Get access token
curl -v https://api.sandbox.paypal.com/v1/oauth2/token \
  -H "Accept: application/json" \
  -H "Accept-Language: en_US" \
  -u "client_id:client_secret" \
  -d "grant_type=client_credentials"
```

### Authorize.net Issues

**Error:**
```
Invalid login credentials
```

**Solutions:**

1. **Verify credentials:**
```env
AUTHORIZE_NET_API_LOGIN=your_api_login
AUTHORIZE_NET_TRANSACTION_KEY=your_transaction_key
AUTHORIZE_NET_ENVIRONMENT=sandbox # or production
```

2. **Test API connection:**
```bash
# Test with sample transaction
curl -X POST https://apitest.authorize.net/xml/v1/request.api \
  -H "Content-Type: application/json" \
  -d '{"getTransactionDetailsRequest":{"merchantAuthentication":{"name":"api_login","transactionKey":"transaction_key"}}}'
```

## API Issues

### CORS Errors

**Error:**
```
Access to fetch blocked by CORS policy
```

**Solutions:**

1. **Configure CORS origins:**
```env
CORS_ORIGINS=http://localhost:3000,https://yourdomain.com
```

2. **Check request headers:**
```javascript
// Ensure proper headers
fetch('/bridge-payment/payments', {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'X-Session-ID': sessionId
  },
  body: JSON.stringify(data)
});
```

### Rate Limiting

**Error:**
```json
{
  "error": {
    "code": "RATE_LIMITED",
    "message": "Too many requests"
  }
}
```

**Solutions:**

1. **Adjust rate limits:**
```env
RATE_LIMIT_REQUESTS=200
RATE_LIMIT_WINDOW=900000
```

2. **Implement retry logic:**
```javascript
async function retryRequest(url, options, maxRetries = 3) {
  for (let i = 0; i < maxRetries; i++) {
    const response = await fetch(url, options);

    if (response.status !== 429) {
      return response;
    }

    const retryAfter = response.headers.get('Retry-After') || 1;
    await new Promise(resolve => setTimeout(resolve, retryAfter * 1000));
  }

  throw new Error('Max retries exceeded');
}
```

### Request Validation Errors

**Error:**
```json
{
  "error": {
    "code": "VALIDATION_ERROR",
    "details": {
      "amount": "Amount must be greater than 0"
    }
  }
}
```

**Solutions:**

1. **Validate input data:**
```javascript
function validatePaymentData(data) {
  if (!data.amount || data.amount <= 0) {
    throw new Error('Amount must be greater than 0');
  }

  if (!data.currency || data.currency.length !== 3) {
    throw new Error('Currency must be a valid 3-letter code');
  }

  return true;
}
```

2. **Check required fields:**
```javascript
const requiredFields = ['amount', 'currency'];
const missingFields = requiredFields.filter(field => !data[field]);

if (missingFields.length > 0) {
  throw new Error(`Missing required fields: ${missingFields.join(', ')}`);
}
```

## Performance Issues

### Slow Database Queries

**Symptoms:**
- High response times
- Database connection timeouts

**Solutions:**

1. **Check database indexes:**
```sql
-- Verify indexes exist
\d+ payments

-- Add missing indexes
CREATE INDEX idx_payments_user_id ON payments(user_id);
CREATE INDEX idx_payments_status ON payments(status);
```

2. **Optimize connection pool:**
```env
DATABASE_POOL_MIN=5
DATABASE_POOL_MAX=20
```

3. **Enable query logging:**
```env
LOG_LEVEL=debug
```

### Memory Issues

**Symptoms:**
- Out of memory errors
- High memory usage

**Solutions:**

1. **Increase memory limits:**
```bash
# Docker
docker run -m 2g your-image

# Node.js
node --max-old-space-size=2048 dist/index.js
```

2. **Check for memory leaks:**
```javascript
// Monitor memory usage
setInterval(() => {
  const usage = process.memoryUsage();
  console.log('Memory usage:', usage);
}, 60000);
```

## Debugging Tools

### Enable Debug Logging

```env
LOG_LEVEL=debug
DEV_LOG_REQUESTS=true
```

### Database Query Logging

```typescript
// Enable Kysely query logging
export const db = new Kysely<Database>({
  dialect: createDialect(),
  log: ['query', 'error'] // Log all queries and errors
});
```

### Database Dialect Configuration Issues

**Error:**
```
Dialect not supported or incorrectly configured
```

**Solutions by Database Type:**

#### PostgreSQL Standard
```typescript
import { PostgresDialect } from 'kysely';
import { Pool } from 'pg';

new PostgresDialect({
  pool: new Pool({
    database: 'bridge_payments',
    host: 'localhost',
    user: 'username',
    password: 'password',
    port: 5432,
    ssl: process.env.NODE_ENV === 'production'
  })
});

// Lazy pool creation
new PostgresDialect({
  pool: async () => new Pool({
    connectionString: process.env.DATABASE_URL
  })
});
```

#### Neon Serverless PostgreSQL
```bash
npm install kysely-neon @neondatabase/serverless ws
```

```typescript
import { NeonDialect } from 'kysely-neon';
import ws from 'ws'; // For Node.js

// Edge runtime (Cloudflare Workers, Vercel Edge)
new NeonDialect({
  connectionString: process.env.DATABASE_URL
});

// Node.js runtime
new NeonDialect({
  connectionString: process.env.DATABASE_URL,
  webSocketConstructor: ws
});

// HTTP Dialect (experimental, no transactions)
import { NeonHTTPDialect } from 'kysely-neon';

new NeonHTTPDialect({
  connectionString: process.env.DATABASE_URL
});
```

#### MySQL Standard
```typescript
import { MysqlDialect } from 'kysely';
import { createPool } from 'mysql2';

new MysqlDialect({
  pool: createPool({
    database: 'bridge_payments',
    host: 'localhost',
    user: 'username',
    password: 'password',
    port: 3306
  })
});

// Lazy pool creation
new MysqlDialect({
  pool: async () => createPool({
    uri: process.env.DATABASE_URL
  })
});
```

#### PlanetScale MySQL
```bash
npm install kysely-planetscale @planetscale/database
```

```typescript
import { PlanetScaleDialect } from 'kysely-planetscale';
import { fetch } from 'undici'; // For Node.js

// Basic configuration
new PlanetScaleDialect({
  host: process.env.PLANETSCALE_HOST,
  username: process.env.PLANETSCALE_USERNAME,
  password: process.env.PLANETSCALE_PASSWORD
});

// Using DATABASE_URL
new PlanetScaleDialect({
  url: process.env.DATABASE_URL,
  fetch // Required for Node.js
});

// With shared connection (experimental)
new PlanetScaleDialect({
  url: process.env.DATABASE_URL,
  useSharedConnection: true
});
```

#### LibSQL/Turso
```bash
npm install @libsql/kysely-libsql @libsql/client
```

```typescript
import { LibsqlDialect } from '@libsql/kysely-libsql';
import { createClient } from '@libsql/client';

// Direct configuration
new LibsqlDialect({
  url: 'libsql://localhost:8080?tls=0',
  authToken: process.env.LIBSQL_AUTH_TOKEN // optional
});

// Using existing client
const client = createClient({
  url: process.env.LIBSQL_URL,
  authToken: process.env.LIBSQL_AUTH_TOKEN
});

new LibsqlDialect({ client });

// Remember to close client when done
// client.close();
```

#### Cloudflare D1
```bash
npm install kysely-d1
```

```typescript
import { D1Dialect } from 'kysely-d1';

// In Cloudflare Worker
export interface Env {
  DB: D1Database;
}

new D1Dialect({
  database: env.DB
});
```

### Request Tracing

```typescript
// Add request ID for tracing
app.use('*', async (c, next) => {
  const requestId = nanoid();
  c.set('requestId', requestId);
  c.header('X-Request-ID', requestId);

  console.log(`[${requestId}] ${c.req.method} ${c.req.url}`);
  await next();
});
```

### Health Check Debugging

```bash
# Check service health
curl http://localhost:3001/health

# Check database connectivity
curl http://localhost:3001/health/database

# Check Flowless connectivity
curl http://localhost:3001/health/flowless
```

## Getting Help

### Log Analysis

When reporting issues, include:

1. **Error logs** with timestamps
2. **Request/response** data (sanitized)
3. **Environment** information
4. **Steps to reproduce** the issue

### Useful Commands

```bash
# Check service status
curl http://localhost:3001/health

# Test database connection
bun run src/scripts/test-db.ts

# Validate configuration
bun run src/scripts/validate-config.ts

# Check provider connectivity
bun run src/scripts/test-providers.ts
```

### Support Channels

1. **Documentation**: Check relevant docs sections
2. **GitHub Issues**: Report bugs and feature requests
3. **Community**: Join discussions and get help
4. **Professional Support**: Contact for enterprise support

## Prevention Tips

### Development Best Practices

1. **Use environment validation**
2. **Implement comprehensive error handling**
3. **Add proper logging and monitoring**
4. **Test with realistic data volumes**
5. **Regular dependency updates**

### Production Monitoring

1. **Set up health checks**
2. **Monitor key metrics**
3. **Configure alerting**
4. **Regular backup verification**
5. **Performance monitoring**

## Next Steps

- **[Monitoring Setup](./monitoring.md)** - Set up comprehensive monitoring
- **[Security Guide](./security.md)** - Security best practices
- **[Performance Tuning](./performance.md)** - Optimize performance
- **[Maintenance](./maintenance.md)** - Ongoing maintenance procedures
