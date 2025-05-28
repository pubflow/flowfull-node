# Package Dependencies for Subscription Renewal System

## Required Dependencies

### Core Dependencies

```bash
# Croner - Cron scheduler for JavaScript/TypeScript
npm install croner

# Date manipulation (if needed for complex date calculations)
npm install date-fns

# Logging (if not already installed)
npm install winston

# Environment configuration (if not already installed)
npm install dotenv
```

### Development Dependencies

```bash
# Testing
npm install --save-dev jest @types/jest ts-jest

# Type definitions
npm install --save-dev @types/node

# Testing utilities for cron jobs
npm install --save-dev jest-mock-extended
```

## Package.json Updates

Add these scripts to your `package.json`:

```json
{
  "scripts": {
    "renewal:start": "node dist/cron/start-scheduler.js",
    "renewal:stop": "node dist/cron/stop-scheduler.js",
    "renewal:status": "node dist/cron/scheduler-status.js",
    "renewal:trigger": "node dist/cron/trigger-renewals.js",
    "test:renewals": "jest --testPathPattern=renewals",
    "test:billing": "jest --testPathPattern=billing"
  }
}
```

## Environment Variables

Add these to your `.env` file:

```bash
# Renewal System Configuration
RENEWAL_ENABLED=true
RENEWAL_TIMEZONE=UTC
RENEWAL_BATCH_SIZE=50
RENEWAL_MAX_CONCURRENT=10
RENEWAL_RETRY_DELAY_MINUTES=60
RENEWAL_MAX_RETRY_ATTEMPTS=3

# Cron Job Schedules (optional overrides)
RENEWAL_DAILY_SCHEDULE="0 2 * * *"
RENEWAL_RETRY_SCHEDULE="0 * * * *"
RENEWAL_CLEANUP_SCHEDULE="0 4 * * *"
RENEWAL_HEALTH_CHECK_SCHEDULE="*/30 * * * *"

# Notification Settings
RENEWAL_NOTIFICATIONS_ENABLED=true
RENEWAL_SLACK_WEBHOOK_URL=
RENEWAL_EMAIL_ALERTS_TO=admin@yourcompany.com

# Database Settings (if different from main app)
RENEWAL_DB_POOL_SIZE=10
RENEWAL_DB_TIMEOUT_MS=30000

# Monitoring
RENEWAL_METRICS_ENABLED=true
RENEWAL_LOG_LEVEL=info
```

## TypeScript Configuration

Update your `tsconfig.json` to include the new directories:

```json
{
  "compilerOptions": {
    // ... existing options
  },
  "include": [
    "src/**/*",
    "to-implement/**/*"
  ],
  "exclude": [
    "node_modules",
    "dist",
    "to-implement/**/*.test.ts"
  ]
}
```

## Jest Configuration

Create or update `jest.config.js`:

```javascript
module.exports = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  roots: ['<rootDir>/src', '<rootDir>/to-implement'],
  testMatch: [
    '**/__tests__/**/*.ts',
    '**/?(*.)+(spec|test).ts'
  ],
  transform: {
    '^.+\\.ts$': 'ts-jest',
  },
  collectCoverageFrom: [
    'src/**/*.ts',
    'to-implement/**/*.ts',
    '!**/*.d.ts',
    '!**/node_modules/**',
  ],
  setupFilesAfterEnv: ['<rootDir>/jest.setup.js'],
  testTimeout: 30000, // 30 seconds for integration tests
};
```

## Docker Configuration (Optional)

If using Docker, update your `Dockerfile`:

```dockerfile
# Add cron support if needed
RUN apt-get update && apt-get install -y cron

# Copy renewal system files
COPY to-implement/ ./to-implement/

# Install dependencies
RUN npm install

# Build TypeScript
RUN npm run build

# Start command that includes renewal scheduler
CMD ["npm", "run", "start:with-renewals"]
```

## PM2 Configuration (Optional)

If using PM2 for process management, create `ecosystem.config.js`:

```javascript
module.exports = {
  apps: [
    {
      name: 'bridge-payments-api',
      script: 'dist/index.js',
      instances: 1,
      exec_mode: 'cluster',
      env: {
        NODE_ENV: 'production',
        RENEWAL_ENABLED: 'true'
      }
    },
    {
      name: 'renewal-scheduler',
      script: 'dist/cron/start-scheduler.js',
      instances: 1,
      exec_mode: 'fork',
      cron_restart: '0 0 * * *', // Restart daily
      env: {
        NODE_ENV: 'production',
        RENEWAL_ENABLED: 'true'
      }
    }
  ]
};
```

## Installation Commands

Run these commands to set up the renewal system:

```bash
# 1. Install dependencies
npm install croner date-fns winston dotenv

# 2. Install dev dependencies
npm install --save-dev jest @types/jest ts-jest jest-mock-extended

# 3. Create environment file
cp .env.example .env
# Edit .env with renewal configuration

# 4. Run database migration
npm run migrate:up

# 5. Build TypeScript
npm run build

# 6. Test the system
npm run test:renewals

# 7. Start renewal scheduler
npm run renewal:start
```

## Monitoring and Logging

### Log Configuration

```typescript
// logger.config.ts
import winston from 'winston';

export const renewalLogger = winston.createLogger({
  level: process.env.RENEWAL_LOG_LEVEL || 'info',
  format: winston.format.combine(
    winston.format.timestamp(),
    winston.format.errors({ stack: true }),
    winston.format.json()
  ),
  defaultMeta: { service: 'renewal-system' },
  transports: [
    new winston.transports.File({ 
      filename: 'logs/renewal-error.log', 
      level: 'error' 
    }),
    new winston.transports.File({ 
      filename: 'logs/renewal-combined.log' 
    }),
    new winston.transports.Console({
      format: winston.format.simple()
    })
  ]
});
```

### Health Check Endpoint

```typescript
// Add to your main app
app.get('/health/renewals', async (req, res) => {
  const scheduler = RenewalScheduler.getInstance();
  const status = scheduler.getJobStatus();
  
  res.json({
    enabled: process.env.RENEWAL_ENABLED === 'true',
    running: scheduler.isSchedulerRunning(),
    jobs: status,
    nextRuns: scheduler.getNextRunTimes()
  });
});
```

## Security Considerations

1. **Environment Variables**: Store sensitive configuration in environment variables
2. **Database Access**: Use read-only database user for renewal queries where possible
3. **Rate Limiting**: Implement rate limiting for manual trigger endpoints
4. **Monitoring**: Set up alerts for failed renewals and system errors
5. **Backup**: Ensure renewal logs are backed up for audit purposes

## Performance Optimization

1. **Database Indexing**: Ensure proper indexes on renewal-related columns
2. **Batch Processing**: Process renewals in configurable batch sizes
3. **Connection Pooling**: Use database connection pooling for concurrent operations
4. **Memory Management**: Monitor memory usage during large batch processing
5. **Caching**: Cache frequently accessed subscription data

This completes the package dependencies and configuration setup for the renewal system!
