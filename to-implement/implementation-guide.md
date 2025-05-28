# Implementation Guide: Subscription Renewal System

## 🎯 Overview

This guide provides step-by-step instructions for implementing the complete subscription renewal system with automatic billing, retry logic, and webhook integration using Croner for cron jobs.

## 📋 Implementation Checklist

### Phase 1: Database Setup ✅
- [ ] Run database migration to add billing fields
- [ ] Update TypeScript types and interfaces
- [ ] Test database schema changes
- [ ] Verify data migration from metadata

### Phase 2: Core Services ✅
- [ ] Implement BillingCalculator service
- [ ] Implement SubscriptionRenewalProcessor
- [ ] Create billing types and interfaces
- [ ] Add error handling classes

### Phase 3: Cron Scheduler ✅
- [ ] Install Croner dependency
- [ ] Implement RenewalScheduler with Croner
- [ ] Set up daily renewal job
- [ ] Set up retry processing job
- [ ] Set up cleanup and health check jobs

### Phase 4: Webhook Integration ✅
- [ ] Implement renewal webhook handlers
- [ ] Update existing webhook processor
- [ ] Add renewal event types
- [ ] Test webhook processing

### Phase 5: API Updates 🔄
- [ ] Update subscription creation API
- [ ] Add billing_interval and interval_multiplier fields
- [ ] Update subscription repository
- [ ] Add renewal management endpoints

### Phase 6: Testing & Deployment 🔄
- [ ] Write unit tests
- [ ] Write integration tests
- [ ] Performance testing
- [ ] Documentation updates
- [ ] Production deployment

## 🚀 Step-by-Step Implementation

### Step 1: Database Migration

```bash
# 1. Backup your database
pg_dump your_database > backup_before_renewal_migration.sql

# 2. Run the migration
psql your_database < to-implement/database/migration-billing-fields.sql

# 3. Verify migration
psql your_database -c "SELECT billing_interval, interval_multiplier, next_billing_date FROM subscriptions LIMIT 5;"
```

### Step 2: Install Dependencies

```bash
# Install required packages
npm install croner date-fns winston

# Install dev dependencies
npm install --save-dev jest @types/jest ts-jest jest-mock-extended

# Update package.json scripts
# (See package-dependencies.md for details)
```

### Step 3: Copy Implementation Files

```bash
# Copy types
cp to-implement/types/billing.ts src/lib/types/

# Copy services
cp to-implement/services/billing-calculator.ts src/lib/services/
cp to-implement/services/renewal-processor.ts src/lib/services/

# Copy cron scheduler
cp to-implement/cron/renewal-scheduler.ts src/lib/cron/

# Copy webhook handlers
cp to-implement/webhooks/renewal-handlers.ts src/lib/webhooks/
```

### Step 4: Update Existing Files

#### A. Update Subscription Types

```typescript
// src/lib/database/types.ts
export interface SubscriptionTable {
  // ... existing fields
  billing_interval: string;
  interval_multiplier: number;
  next_billing_date: string | null;
  last_billing_attempt: string | null;
  billing_retry_count: number;
  max_retry_attempts: number;
  billing_status: string;
}
```

#### B. Update Subscription Repository

```typescript
// src/lib/database/repositories/subscriptions.ts
export class SubscriptionRepository extends BaseRepository<'subscriptions'> {
  
  // Add method to find subscriptions due for renewal
  async findDueForRenewal(limit: number = 100): Promise<SubscriptionTable[]> {
    const result = await this.db
      .selectFrom('subscriptions')
      .selectAll()
      .where('next_billing_date', '<=', new Date().toISOString())
      .where('billing_status', '=', 'active')
      .where('status', 'in', ['active', 'trialing'])
      .limit(limit)
      .execute();

    return result as SubscriptionTable[];
  }

  // Add method to find subscriptions ready for retry
  async findReadyForRetry(limit: number = 50): Promise<SubscriptionTable[]> {
    const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000).toISOString();
    
    const result = await this.db
      .selectFrom('subscriptions')
      .selectAll()
      .where('billing_status', '=', 'past_due')
      .where('billing_retry_count', '<', this.db.ref('max_retry_attempts'))
      .where('last_billing_attempt', '<=', oneHourAgo)
      .limit(limit)
      .execute();

    return result as SubscriptionTable[];
  }

  // Add method to update billing fields
  async updateBillingFields(
    id: string, 
    updates: {
      billing_interval?: string;
      interval_multiplier?: number;
      next_billing_date?: string;
      last_billing_attempt?: string;
      billing_retry_count?: number;
      billing_status?: string;
      current_period_start?: string;
      current_period_end?: string;
    }
  ): Promise<SubscriptionTable | null> {
    const result = await this.db
      .updateTable('subscriptions')
      .set({
        ...updates,
        updated_at: this.getCurrentTimestamp()
      } as any)
      .where('id', '=', id)
      .returningAll()
      .executeTakeFirst();

    return result as SubscriptionTable | null;
  }
}
```

#### C. Update Subscription API

```typescript
// src/routes/subscriptions.ts

// Update validation schema
const createSubscriptionSchema = z.object({
  // ... existing fields
  billing_interval: z.enum(['daily', 'weekly', 'monthly', 'yearly']).default('monthly'),
  interval_multiplier: z.number().int().min(1).max(12).default(1),
  // ... rest of fields
});

// Update subscription creation logic
subscriptionData = {
  // ... existing fields
  billing_interval: validatedData.billing_interval,
  interval_multiplier: validatedData.interval_multiplier,
  next_billing_date: periodEnd, // Use calculated period end
  billing_retry_count: 0,
  max_retry_attempts: 3,
  billing_status: 'active',
  // ... rest of fields
};
```

### Step 5: Integrate with Main Application

#### A. Update Main App Entry Point

```typescript
// src/index.ts
import { RenewalScheduler } from '@/lib/cron/renewal-scheduler';

// Add renewal scheduler startup
let renewalScheduler: RenewalScheduler | null = null;

if (process.env.RENEWAL_ENABLED === 'true') {
  renewalScheduler = new RenewalScheduler();
  
  // Start renewal jobs
  renewalScheduler.startAllJobs().catch(error => {
    console.error('❌ Failed to start renewal scheduler:', error);
  });
  
  console.log('✅ Renewal scheduler started');
}

// Graceful shutdown
process.on('SIGTERM', async () => {
  console.log('🛑 Shutting down gracefully...');
  
  if (renewalScheduler) {
    await renewalScheduler.stopAllJobs();
  }
  
  process.exit(0);
});
```

#### B. Update Webhook Processor

```typescript
// src/lib/webhooks/event-processor.ts
import { RenewalWebhookHandlers } from '@/lib/webhooks/renewal-handlers';

export class WebhookEventProcessor {
  private renewalHandlers: RenewalWebhookHandlers;

  constructor() {
    this.renewalHandlers = new RenewalWebhookHandlers();
  }

  async processEvent(webhookId: string, eventData: WebhookEventData): Promise<ProcessedWebhookResult> {
    // ... existing code

    // Add renewal event handling
    if (this.isRenewalEvent(eventData.type)) {
      if (eventData.type.startsWith('invoice.') || eventData.type.startsWith('customer.subscription.')) {
        await this.renewalHandlers.handleStripeRenewalEvent(eventData.type, eventData.data);
      } else if (eventData.type.startsWith('BILLING.SUBSCRIPTION.')) {
        await this.renewalHandlers.handlePayPalRenewalEvent(eventData.type, eventData.data);
      }
    }

    // ... rest of existing code
  }

  private isRenewalEvent(eventType: string): boolean {
    const renewalEvents = [
      'invoice.payment_succeeded',
      'invoice.payment_failed',
      'customer.subscription.updated',
      'customer.subscription.deleted',
      'BILLING.SUBSCRIPTION.PAYMENT.COMPLETED',
      'BILLING.SUBSCRIPTION.PAYMENT.FAILED',
      'BILLING.SUBSCRIPTION.CANCELLED',
      'BILLING.SUBSCRIPTION.SUSPENDED'
    ];
    
    return renewalEvents.includes(eventType);
  }
}
```

### Step 6: Add Management Endpoints

```typescript
// src/routes/admin.ts (create if doesn't exist)
import { Hono } from 'hono';
import { RenewalScheduler } from '@/lib/cron/renewal-scheduler';

const admin = new Hono();

// Get renewal system status
admin.get('/renewals/status', async (c) => {
  const scheduler = RenewalScheduler.getInstance();
  
  return c.json({
    enabled: process.env.RENEWAL_ENABLED === 'true',
    running: scheduler.isSchedulerRunning(),
    jobs: scheduler.getJobStatus(),
    nextRuns: scheduler.getNextRunTimes()
  });
});

// Manually trigger renewal processing
admin.post('/renewals/trigger', async (c) => {
  const scheduler = RenewalScheduler.getInstance();
  const result = await scheduler.triggerRenewalProcessing();
  
  return c.json(result);
});

// Pause/resume specific jobs
admin.post('/renewals/jobs/:jobName/pause', async (c) => {
  const jobName = c.req.param('jobName');
  const scheduler = RenewalScheduler.getInstance();
  const success = scheduler.pauseJob(jobName);
  
  return c.json({ success, message: success ? 'Job paused' : 'Job not found' });
});

admin.post('/renewals/jobs/:jobName/resume', async (c) => {
  const jobName = c.req.param('jobName');
  const scheduler = RenewalScheduler.getInstance();
  const success = scheduler.resumeJob(jobName);
  
  return c.json({ success, message: success ? 'Job resumed' : 'Job not found' });
});

export default admin;
```

### Step 7: Environment Configuration

```bash
# Add to .env
RENEWAL_ENABLED=true
RENEWAL_TIMEZONE=UTC
RENEWAL_BATCH_SIZE=50
RENEWAL_MAX_CONCURRENT=10
RENEWAL_RETRY_DELAY_MINUTES=60
RENEWAL_MAX_RETRY_ATTEMPTS=3
RENEWAL_NOTIFICATIONS_ENABLED=true
RENEWAL_LOG_LEVEL=info
```

### Step 8: Testing

#### A. Unit Tests

```typescript
// tests/billing-calculator.test.ts
import { BillingCalculator } from '@/lib/services/billing-calculator';

describe('BillingCalculator', () => {
  let calculator: BillingCalculator;

  beforeEach(() => {
    calculator = new BillingCalculator();
  });

  test('should calculate monthly billing correctly', () => {
    const startDate = new Date('2024-01-15');
    const config = { interval: 'monthly' as const, multiplier: 1 };
    
    const nextDate = calculator.calculateNextBillingDate(startDate, config);
    
    expect(nextDate.getMonth()).toBe(1); // February
    expect(nextDate.getDate()).toBe(15);
  });

  test('should calculate bimonthly billing correctly', () => {
    const startDate = new Date('2024-01-15');
    const config = { interval: 'monthly' as const, multiplier: 2 };
    
    const nextDate = calculator.calculateNextBillingDate(startDate, config);
    
    expect(nextDate.getMonth()).toBe(2); // March
    expect(nextDate.getDate()).toBe(15);
  });
});
```

#### B. Integration Tests

```typescript
// tests/renewal-integration.test.ts
import { SubscriptionRenewalProcessor } from '@/lib/services/renewal-processor';

describe('Renewal Integration', () => {
  test('should process renewal end-to-end', async () => {
    // Create test subscription
    // Trigger renewal
    // Verify payment creation
    // Verify subscription update
  });
});
```

### Step 9: Deployment

```bash
# 1. Build the application
npm run build

# 2. Run database migration in production
npm run migrate:production

# 3. Deploy with renewal system enabled
RENEWAL_ENABLED=true npm start

# 4. Verify renewal system is running
curl http://localhost:3000/admin/renewals/status
```

## 🔧 Configuration Options

### Billing Intervals

The system supports these billing configurations:

```typescript
// Standard intervals
{ interval: 'weekly', multiplier: 1 }     // Every week
{ interval: 'monthly', multiplier: 1 }    // Every month
{ interval: 'yearly', multiplier: 1 }     // Every year

// Custom intervals
{ interval: 'weekly', multiplier: 2 }     // Every 2 weeks (biweekly)
{ interval: 'monthly', multiplier: 2 }    // Every 2 months (bimonthly)
{ interval: 'monthly', multiplier: 3 }    // Every 3 months (quarterly)
{ interval: 'monthly', multiplier: 6 }    // Every 6 months (semiannually)
```

### Cron Schedules

Default cron schedules (customizable via environment variables):

- **Daily Renewals**: `0 2 * * *` (2 AM UTC daily)
- **Retry Processing**: `0 * * * *` (Every hour)
- **Cleanup**: `0 4 * * *` (4 AM UTC daily)
- **Health Check**: `*/30 * * * *` (Every 30 minutes)

## 🚨 Troubleshooting

### Common Issues

1. **Migration Fails**: Check database permissions and backup before running
2. **Cron Jobs Not Starting**: Verify RENEWAL_ENABLED=true in environment
3. **Webhooks Not Processing**: Check webhook handler registration
4. **High Memory Usage**: Reduce RENEWAL_BATCH_SIZE and RENEWAL_MAX_CONCURRENT

### Monitoring

- Check logs in `logs/renewal-*.log`
- Monitor `/admin/renewals/status` endpoint
- Set up alerts for failed renewals
- Monitor database performance during batch processing

This completes the implementation guide! The system is now ready for production use with automatic subscription renewals, retry logic, and comprehensive webhook integration.
