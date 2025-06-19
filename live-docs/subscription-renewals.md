# Subscription Renewals System

The Bridge Payments subscription renewal system provides automatic billing, retry logic, and comprehensive webhook handling for subscription-based payments.

## 🚀 Implementation Status

**Current Status**: Fully implemented and operational
- ✅ **Automatic Billing**: Daily cron job processing
- ✅ **Retry Logic**: Exponential backoff with configurable attempts
- ✅ **Webhook Integration**: Stripe and PayPal event processing
- ✅ **Admin Interface**: Real-time monitoring and controls
- ✅ **Database Schema**: Complete billing fields and status tracking
- ✅ **Health Monitoring**: System health checks and diagnostics

**Integration**: Works with existing subscription system and webhook infrastructure.

## Overview

The renewal system consists of several core components:

- **BillingCalculator**: Handles date calculations for billing cycles
- **SubscriptionRenewalProcessor**: Processes subscription renewals and retries
- **RenewalScheduler**: Manages cron jobs for automatic processing
- **RenewalWebhookHandlers**: Processes webhook events from payment providers
- **RenewalSystem**: Main interface for managing the entire system

## Features

### ✅ Automatic Billing
- Daily cron job processes subscriptions due for renewal
- Flexible billing intervals: daily, weekly, monthly, yearly
- Interval multipliers for custom frequencies (e.g., every 2 months)
- Proper handling of edge cases (leap years, month-end dates)

### ✅ Retry Logic
- Configurable retry attempts for failed payments
- Exponential backoff with customizable delays
- Automatic suspension after max retries
- Separate retry processing queue

### ✅ Webhook Integration
- Stripe webhook support for renewal events (`invoice.payment_succeeded`, `invoice.payment_failed`)
- PayPal webhook support for subscription events (`BILLING.SUBSCRIPTION.*`)
- Automatic subscription status synchronization
- Event logging and audit trails
- Asynchronous webhook processing with error handling
- Webhook signature verification (Stripe)

### ✅ Admin Interface
- Real-time system status monitoring
- Manual renewal triggering
- Pause/resume functionality
- Health checks and diagnostics

## Database Schema

The renewal system adds the following fields to the `subscriptions` table:

```sql
-- Billing configuration
billing_interval VARCHAR(20) NOT NULL DEFAULT 'monthly',
interval_multiplier INTEGER NOT NULL DEFAULT 1,

-- Billing state
next_billing_date TIMESTAMP,
last_billing_attempt TIMESTAMP,
billing_retry_count INTEGER NOT NULL DEFAULT 0,
max_retry_attempts INTEGER NOT NULL DEFAULT 3,
billing_status VARCHAR(20) NOT NULL DEFAULT 'active'
```

### Billing Status Values
- `active`: Subscription is current and billing normally
- `past_due`: Payment failed, retries in progress
- `suspended`: Max retries reached, subscription suspended
- `cancelled`: Subscription cancelled by user or system

## API Endpoints

### Admin Endpoints

#### Get System Status
```http
GET /bridge-payment/admin/renewals/status
```

Returns comprehensive system status including:
- Scheduler status and next run times
- Health check results
- Environment configuration
- Job statistics

#### Trigger Manual Renewal
```http
POST /bridge-payment/admin/renewals/trigger
```

Manually triggers renewal processing for testing or emergency situations.

#### Pause/Resume Operations
```http
POST /bridge-payment/admin/renewals/pause
POST /bridge-payment/admin/renewals/resume
POST /bridge-payment/admin/renewals/pause-retries
POST /bridge-payment/admin/renewals/resume-retries
```

Control renewal and retry processing independently.

#### Get Due Subscriptions
```http
GET /bridge-payment/admin/renewals/due?limit=50
```

Returns subscriptions currently due for renewal.

#### Get Retry Queue
```http
GET /bridge-payment/admin/renewals/retries?limit=50
```

Returns subscriptions in the retry queue.

### Webhook Endpoints

#### Stripe Webhooks
```http
POST /bridge-payment/webhooks/renewals/stripe
```

Handles Stripe webhook events:
- `invoice.payment_succeeded`
- `invoice.payment_failed`
- `customer.subscription.updated`
- `customer.subscription.deleted`

#### PayPal Webhooks
```http
POST /bridge-payment/webhooks/renewals/paypal
```

Handles PayPal webhook events:
- `BILLING.SUBSCRIPTION.PAYMENT.COMPLETED`
- `BILLING.SUBSCRIPTION.PAYMENT.FAILED`
- `BILLING.SUBSCRIPTION.CANCELLED`
- `BILLING.SUBSCRIPTION.SUSPENDED`

#### Test Webhooks
```http
POST /bridge-payment/webhooks/renewals/test
```

Development endpoint for testing webhook processing.

### Current Webhook Implementation

The renewal system integrates with the main webhook infrastructure:

#### Main Webhook Endpoints
```http
POST /bridge-payment/webhooks/stripe     # Main Stripe webhook handler
POST /bridge-payment/webhooks/paypal     # Main PayPal webhook handler
```

#### Renewal-Specific Handlers
```http
POST /bridge-payment/webhooks/renewals/stripe   # Renewal-focused Stripe events
POST /bridge-payment/webhooks/renewals/paypal   # Renewal-focused PayPal events
```

#### Webhook Processing Flow
1. **Webhook Received**: Event stored in database with unique ID
2. **Signature Verification**: Stripe signatures validated (when configured)
3. **Asynchronous Processing**: Events processed in background
4. **Renewal Handler**: Subscription-specific events routed to renewal system
5. **Status Updates**: Subscription status and billing fields updated
6. **Notifications**: Email receipts and notifications sent
7. **Error Handling**: Failed processing logged and retried

#### Supported Events

**Stripe Events**:
- `invoice.payment_succeeded` → Successful renewal processing
- `invoice.payment_failed` → Retry logic activation
- `customer.subscription.updated` → Subscription sync
- `customer.subscription.deleted` → Cancellation processing

**PayPal Events**:
- `BILLING.SUBSCRIPTION.PAYMENT.COMPLETED` → Successful renewal
- `BILLING.SUBSCRIPTION.PAYMENT.FAILED` → Failed payment handling
- `BILLING.SUBSCRIPTION.CANCELLED` → Cancellation processing
- `BILLING.SUBSCRIPTION.SUSPENDED` → Suspension handling

## Configuration

### Environment Variables

```bash
# Enable/disable renewal system
RENEWALS_ENABLED=true

# Cron schedules
RENEWAL_DAILY_CRON="0 2 * * *"        # Daily at 2 AM UTC
RENEWAL_RETRY_CRON="0 * * * *"        # Every hour
RENEWAL_CLEANUP_CRON="0 4 * * *"      # Daily at 4 AM UTC
RENEWAL_HEALTH_CRON="*/30 * * * *"    # Every 30 minutes

# Processing configuration
RENEWAL_BATCH_SIZE=50                  # Subscriptions per batch
RENEWAL_MAX_CONCURRENT=10              # Concurrent renewals
RENEWAL_RETRY_DELAY_MINUTES=60         # Delay between retries
RENEWAL_MAX_RETRY_ATTEMPTS=3           # Max retry attempts

# System configuration
RENEWAL_TIMEZONE=UTC                   # Timezone for cron jobs
RENEWAL_NOTIFICATIONS_ENABLED=false   # Enable notifications
```

### Billing Intervals

The system supports flexible billing intervals:

```typescript
// Standard intervals
{ interval: 'daily', multiplier: 1 }     // Every day
{ interval: 'weekly', multiplier: 1 }    // Every week
{ interval: 'monthly', multiplier: 1 }   // Every month
{ interval: 'yearly', multiplier: 1 }    // Every year

// Custom frequencies
{ interval: 'weekly', multiplier: 2 }    // Every 2 weeks (biweekly)
{ interval: 'monthly', multiplier: 2 }   // Every 2 months (bimonthly)
{ interval: 'monthly', multiplier: 3 }   // Every 3 months (quarterly)
{ interval: 'monthly', multiplier: 6 }   // Every 6 months (semiannually)
```

## Usage Examples

### Creating a Subscription with Billing

```typescript
// Monthly subscription
const subscription = await fetch('/bridge-payment/subscriptions', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    customer_id: 'cus_123',
    payment_method_id: 'pm_123',
    provider_id: 'stripe',
    price_cents: 2999,
    currency: 'usd',
    billing_interval: 'monthly',
    interval_multiplier: 1
  })
});

// Quarterly subscription (every 3 months)
const quarterlySubscription = await fetch('/bridge-payment/subscriptions', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    customer_id: 'cus_123',
    payment_method_id: 'pm_123',
    provider_id: 'stripe',
    price_cents: 8999,
    currency: 'usd',
    billing_interval: 'monthly',
    interval_multiplier: 3
  })
});
```

### Monitoring System Status

```typescript
// Get system status
const status = await fetch('/bridge-payment/admin/renewals/status');
const data = await status.json();

console.log('Renewal system status:', data.initialized);
console.log('Next renewal run:', data.nextRuns['daily-renewals']);
console.log('System health:', data.health.healthy);
```

### Manual Renewal Processing

```typescript
// Trigger manual renewal
const result = await fetch('/bridge-payment/admin/renewals/trigger', {
  method: 'POST'
});

const data = await result.json();
console.log(`Processed ${data.result.processed} subscriptions`);
console.log(`${data.result.successful} successful, ${data.result.failed} failed`);
```

## Error Handling

The renewal system includes comprehensive error handling:

### Payment Errors
- Declined cards trigger retry logic
- Invalid payment methods suspend subscriptions
- Network errors are retried automatically

### System Errors
- Database connection issues pause processing
- Provider API errors are logged and retried
- Configuration errors prevent system startup

### Monitoring
- Health checks verify system components
- Error rates are tracked and reported
- Failed renewals generate alerts (when enabled)

## Best Practices

### Production Deployment
1. Set appropriate batch sizes based on your volume
2. Configure retry delays to avoid overwhelming payment providers
3. Enable notifications for critical failures
4. Monitor system health regularly
5. Set up proper logging and alerting

### Testing
1. Use test webhook endpoints for development
2. Test with small batch sizes initially
3. Verify retry logic with failed payment scenarios
4. Test graceful shutdown procedures

### Maintenance
1. Monitor retry queue sizes
2. Review failed renewal patterns
3. Update payment methods proactively
4. Clean up old renewal logs periodically

## Troubleshooting

### Common Issues

**Renewals not processing**
- Check if `RENEWALS_ENABLED=true`
- Verify cron job schedules
- Check database connectivity
- Review system logs

**High retry queue**
- Check payment provider status
- Review payment method validity
- Adjust retry delays if needed
- Monitor error patterns

**Webhook failures**
- Verify webhook endpoint URLs
- Check signature validation
- Review provider webhook settings
- Test with webhook test endpoints

### Debugging

Enable debug logging:
```bash
DEBUG=renewal:* npm start
```

Check system health:
```bash
curl http://localhost:3000/bridge-payment/admin/renewals/health
```

Monitor renewal queue:
```bash
curl http://localhost:3000/bridge-payment/admin/renewals/due
curl http://localhost:3000/bridge-payment/admin/renewals/retries
```
