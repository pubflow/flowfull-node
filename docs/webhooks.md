# Webhooks Documentation

Bridge-Payments provides a robust webhook system to notify your application about payment events in real-time. This system is built with **Bun + Hono** for maximum performance and follows **native-payments** standards.

## Overview

Webhooks allow Bridge-Payments to push real-time notifications to your application when events occur. This is essential for keeping your application state synchronized with payment provider events.

### Supported Providers

- **Stripe** - Full webhook support with signature validation
- **PayPal** - Complete webhook integration
- **Generic** - Support for custom payment providers

## Webhook Endpoints

### Base URL
```
https://your-domain.com/bridge-payment/webhooks
```

### Provider-Specific Endpoints

#### Stripe Webhooks
```http
POST /bridge-payment/webhooks/stripe
```

**Headers Required:**
- `stripe-signature` - Stripe webhook signature for validation

#### PayPal Webhooks
```http
POST /bridge-payment/webhooks/paypal
```

**Headers Required:**
- `paypal-transmission-sig` - PayPal webhook signature for validation

#### Generic Provider Webhooks
```http
POST /bridge-payment/webhooks/{providerId}
```

**Parameters:**
- `providerId` - The payment provider identifier

## Webhook Events

### Stripe Events

Bridge-Payments automatically handles these Stripe webhook events:

#### Payment Intent Events
- `payment_intent.succeeded` - Payment completed successfully
- `payment_intent.payment_failed` - Payment failed
- `payment_intent.canceled` - Payment was canceled
- `payment_intent.requires_action` - Payment requires additional action (3D Secure)

#### Payment Method Events
- `payment_method.attached` - Payment method attached to customer
- `payment_method.detached` - Payment method removed from customer

#### Customer Events
- `customer.created` - New customer created
- `customer.updated` - Customer information updated
- `customer.deleted` - Customer deleted

#### Invoice Events
- `invoice.payment_succeeded` - Invoice payment completed
- `invoice.payment_failed` - Invoice payment failed

### PayPal Events

#### Payment Events
- `PAYMENT.CAPTURE.COMPLETED` - Payment capture completed
- `PAYMENT.CAPTURE.DENIED` - Payment capture denied
- `PAYMENT.CAPTURE.FAILED` - Payment capture failed
- `PAYMENT.CAPTURE.PENDING` - Payment capture pending
- `PAYMENT.CAPTURE.REFUNDED` - Payment refunded
- `PAYMENT.CAPTURE.REVERSED` - Payment reversed

#### Billing/Subscription Events
- `BILLING.SUBSCRIPTION.CREATED` - Subscription created
- `BILLING.SUBSCRIPTION.UPDATED` - Subscription updated
- `BILLING.SUBSCRIPTION.CANCELLED` - Subscription cancelled
- `BILLING.SUBSCRIPTION.SUSPENDED` - Subscription suspended
- `BILLING.SUBSCRIPTION.PAYMENT.FAILED` - Subscription payment failed
- `BILLING.SUBSCRIPTION.ACTIVATED` - Subscription activated

## Webhook Processing

### Automatic Processing

Bridge-Payments automatically processes webhook events and:

1. **Validates webhook signatures** for security
2. **Stores webhook data** in `payment_webhooks` table
3. **Processes events asynchronously** to avoid timeouts
4. **Updates payment statuses** automatically
5. **Creates audit events** in `payment_events` table
6. **Responds with 200 OK** to acknowledge receipt

### Event Processing Flow

```
Provider Webhook → Signature Validation → Store in DB → Async Processing → Update Payment Status → Create Audit Event → Response
```

### Database Schema

#### payment_webhooks Table
```sql
CREATE TABLE payment_webhooks (
    id TEXT PRIMARY KEY,
    provider_id TEXT NOT NULL,
    event_type TEXT NOT NULL,
    payload TEXT NOT NULL,
    processed INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    processed_at TEXT,
    FOREIGN KEY (provider_id) REFERENCES payment_providers(id)
);
```

#### payment_events Table
```sql
CREATE TABLE payment_events (
    id TEXT PRIMARY KEY,
    entity_type TEXT NOT NULL,
    entity_id TEXT NOT NULL,
    event_type TEXT NOT NULL,
    data TEXT,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
```

## Webhook Management API

### Get Webhook Statistics

```http
GET /bridge-payment/webhooks/stats?provider_id={providerId}
```

**Response:**
```json
{
  "webhooks": {
    "total": 150,
    "processed": 148,
    "pending": 2
  },
  "events": {
    "total": 200,
    "by_entity_type": {
      "payment": 180,
      "customer": 20
    },
    "by_event_type": {
      "processed": 195,
      "failed": 5
    }
  }
}
```

### Get Webhooks by Provider

```http
GET /bridge-payment/webhooks/provider/{providerId}?limit=50
```

**Response:**
```json
{
  "webhooks": [
    {
      "id": "wh_123456",
      "event_type": "payment_intent.succeeded",
      "processed": true,
      "created_at": "2024-01-15T10:30:00Z",
      "processed_at": "2024-01-15T10:30:01Z"
    }
  ]
}
```

### Process Unprocessed Webhooks

```http
POST /bridge-payment/webhooks/process
```

**Response:**
```json
{
  "message": "Processing completed"
}
```

### Cleanup Old Webhooks

```http
DELETE /bridge-payment/webhooks/cleanup?days=30
```

**Response:**
```json
{
  "deleted_webhooks": 25,
  "deleted_events": 50
}
```

## Security

### Signature Validation

Bridge-Payments validates webhook signatures to ensure authenticity:

#### Stripe
- Uses `stripe-signature` header
- Validates using your Stripe webhook secret
- Automatically rejects invalid signatures

#### PayPal
- Uses `paypal-transmission-sig` header
- Validates using PayPal's verification system
- Automatically rejects invalid signatures

### Best Practices

1. **Always validate signatures** in production
2. **Use HTTPS endpoints** for webhook URLs
3. **Implement idempotency** in your webhook handlers
4. **Monitor webhook delivery** using the management API
5. **Set up proper logging** for debugging

## Configuration

### Environment Variables

```bash
# Webhook Security
STRIPE_WEBHOOK_SECRET=whsec_your_stripe_webhook_secret
PAYPAL_WEBHOOK_ID=your_paypal_webhook_id

# Webhook Processing
WEBHOOK_TIMEOUT=30000
WEBHOOK_RETRY_ATTEMPTS=3
WEBHOOK_BATCH_SIZE=10
```

### Provider Configuration

Webhooks are automatically configured when you initialize payment providers:

```bash
bun run init-providers
```

This sets up webhook event configurations for each provider based on their capabilities.

## Error Handling

### Webhook Failures

If webhook processing fails:

1. **Error is logged** with full details
2. **Webhook is marked as processed** to avoid infinite retries
3. **Error details are stored** for debugging
4. **Manual reprocessing** is available via API

### Retry Logic

- **Automatic retries** for temporary failures
- **Exponential backoff** for rate limiting
- **Manual retry** via management API
- **Dead letter queue** for persistent failures

## Monitoring

### Health Checks

Monitor webhook health using:

```http
GET /bridge-payment/webhooks/stats
```

### Logging

Bridge-Payments provides detailed logging:

```
🔔 Received Stripe webhook: payment_intent.succeeded (pi_123456)
🔄 Processing webhook event: payment_intent.succeeded (pi_123456)
✅ Webhook processed: payment_intent.succeeded - Payment abc123 updated to succeeded
```

### Metrics

Track important metrics:
- **Webhook delivery rate**
- **Processing latency**
- **Error rates by provider**
- **Event type distribution**

## Testing

### Development Mode

In development, webhooks can be tested using:

1. **Provider test environments** (Stripe test mode, PayPal sandbox)
2. **Webhook testing tools** (ngrok, webhook.site)
3. **Manual webhook simulation** via API

### Example Test Webhook

```bash
curl -X POST https://your-domain.com/bridge-payment/webhooks/stripe \
  -H "Content-Type: application/json" \
  -H "stripe-signature: t=1234567890,v1=signature" \
  -d '{
    "id": "evt_test_webhook",
    "type": "payment_intent.succeeded",
    "data": {
      "object": {
        "id": "pi_test_123",
        "status": "succeeded"
      }
    },
    "created": 1234567890
  }'
```

## Troubleshooting

### Common Issues

#### Webhook Not Received
- Check webhook URL configuration in provider dashboard
- Verify HTTPS endpoint is accessible
- Check firewall and security settings

#### Signature Validation Failed
- Verify webhook secret is correct
- Check timestamp tolerance settings
- Ensure payload is not modified in transit

#### Processing Failures
- Check application logs for errors
- Verify database connectivity
- Check payment provider API status

### Debug Commands

```bash
# Check webhook processing status
bun run check-tables

# View recent webhook activity
GET /bridge-payment/webhooks/stats

# Process stuck webhooks
POST /bridge-payment/webhooks/process

# Clean up old data
DELETE /bridge-payment/webhooks/cleanup
```

## Support

For webhook-related issues:

1. **Check the logs** for detailed error information
2. **Use the management API** to inspect webhook status
3. **Verify provider configuration** in their dashboards
4. **Test with webhook simulation tools**

The webhook system is designed to be robust and self-healing, automatically handling most common scenarios while providing detailed monitoring and management capabilities.

## Quick Start Guide

### 1. Setup Webhook Endpoints

Configure your payment providers to send webhooks to Bridge-Payments:

#### Stripe Setup
1. Go to Stripe Dashboard → Developers → Webhooks
2. Add endpoint: `https://your-domain.com/bridge-payment/webhooks/stripe`
3. Select events: `payment_intent.*`, `payment_method.*`, `customer.*`
4. Copy webhook signing secret to your environment

#### PayPal Setup
1. Go to PayPal Developer Dashboard → Applications
2. Create webhook: `https://your-domain.com/bridge-payment/webhooks/paypal`
3. Select events: `PAYMENT.*`, `BILLING.SUBSCRIPTION.*`
4. Copy webhook ID to your environment

### 2. Environment Configuration

```bash
# Add to your .env file
STRIPE_WEBHOOK_SECRET=whsec_your_stripe_webhook_secret
PAYPAL_WEBHOOK_ID=your_paypal_webhook_id
```

### 3. Initialize Database

```bash
# Run migrations to create webhook tables
bun run db:migrate

# Initialize payment providers
bun run init-providers
```

### 4. Test Webhook Delivery

```bash
# Check webhook processing
curl https://your-domain.com/bridge-payment/webhooks/stats

# Process any pending webhooks
curl -X POST https://your-domain.com/bridge-payment/webhooks/process
```

### 5. Monitor Webhook Activity

```bash
# View webhook statistics
GET /bridge-payment/webhooks/stats

# View recent webhooks for a provider
GET /bridge-payment/webhooks/provider/stripe?limit=10
```

## Integration Examples

### Handling Webhook Events in Your Application

While Bridge-Payments automatically processes webhooks and updates payment statuses, you may want to listen for additional events in your application:

```typescript
// Example: Listen for payment events
app.post('/your-webhook-handler', async (c) => {
  const event = await c.req.json();

  switch (event.type) {
    case 'payment.succeeded':
      // Send confirmation email
      await sendPaymentConfirmation(event.data.payment_id);
      break;

    case 'payment.failed':
      // Handle failed payment
      await handlePaymentFailure(event.data.payment_id);
      break;
  }

  return c.json({ received: true });
});
```

### Custom Event Processing

You can extend the webhook processor for custom business logic:

```typescript
import { webhookProcessor } from '@/lib/webhooks/event-processor';

// Add custom processing after webhook events
webhookProcessor.on('payment_processed', async (paymentId, status) => {
  if (status === 'succeeded') {
    // Custom business logic
    await fulfillOrder(paymentId);
    await updateInventory(paymentId);
    await sendNotifications(paymentId);
  }
});
```

This completes the comprehensive webhook documentation for Bridge-Payments!
