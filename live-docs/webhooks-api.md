# Webhooks API Reference

The Webhooks API allows you to receive real-time notifications about payment events from payment providers like Stripe. This enables you to update your application state, send notifications, and handle payment lifecycle events automatically.

## Base URL

```
https://your-api-domain.com/bridge-payment/webhooks
```

## Authentication

Webhooks use signature verification instead of traditional authentication:
- **Stripe**: Uses `Stripe-Signature` header with HMAC-SHA256
- **PayPal**: Uses certificate-based verification
- **Other providers**: Provider-specific verification methods

## Webhook Security

All webhook endpoints verify the authenticity of incoming requests using:
1. **Signature verification**: Cryptographic signatures from payment providers
2. **Timestamp validation**: Prevents replay attacks
3. **IP allowlisting**: Optional IP-based filtering
4. **Idempotency**: Handles duplicate webhook deliveries

## Supported Providers

| Provider | Endpoint | Events Supported |
|----------|----------|------------------|
| Stripe | `/webhooks/stripe` | payment_intent.*, customer.*, payment_method.* |
| PayPal | `/webhooks/paypal` | PAYMENT.*, BILLING.* |
| Authorize.net | `/webhooks/authorizenet` | Payment notifications |

---

## Stripe Webhooks

Handle Stripe webhook events for payment processing.

### Endpoint

```http
POST /bridge-payment/webhooks/stripe
```

### Headers

```http
Content-Type: application/json
Stripe-Signature: t=1234567890,v1=signature_hash
User-Agent: Stripe/1.0 (+https://stripe.com/docs/webhooks)
```

### Request Body

Stripe sends the raw event object as JSON:

```json
{
  "id": "evt_1234567890",
  "object": "event",
  "api_version": "2020-08-27",
  "created": 1234567890,
  "data": {
    "object": {
      "id": "pi_1234567890",
      "object": "payment_intent",
      "amount": 2000,
      "currency": "usd",
      "status": "succeeded"
    }
  },
  "livemode": false,
  "pending_webhooks": 1,
  "request": {
    "id": "req_1234567890",
    "idempotency_key": null
  },
  "type": "payment_intent.succeeded"
}
```

### Response

```http
HTTP/1.1 200 OK
Content-Type: application/json
```

```json
{
  "received": true,
  "processed": true,
  "event_id": "evt_1234567890",
  "timestamp": "2025-01-15T10:30:00Z"
}
```

### Supported Events

#### Payment Intent Events
- `payment_intent.created` - Payment intent created
- `payment_intent.succeeded` - Payment completed successfully
- `payment_intent.payment_failed` - Payment failed
- `payment_intent.requires_action` - Requires customer action (3D Secure)
- `payment_intent.canceled` - Payment intent canceled

#### Customer Events
- `customer.created` - Customer created
- `customer.updated` - Customer information updated
- `customer.deleted` - Customer deleted

#### Payment Method Events
- `payment_method.attached` - Payment method attached to customer
- `payment_method.detached` - Payment method detached from customer

### Examples

#### Test Webhook Locally
```bash
# Using Stripe CLI for local testing
stripe listen --forward-to localhost:3000/bridge-payment/webhooks/stripe

# Send test event
stripe trigger payment_intent.succeeded
```

#### Production Webhook Setup
```bash
# Configure webhook endpoint in Stripe Dashboard
# URL: https://your-api.com/bridge-payment/webhooks/stripe
# Events: payment_intent.*, customer.*, payment_method.*
```

---

## PayPal Webhooks

Handle PayPal webhook events for payment processing.

### Endpoint

```http
POST /bridge-payment/webhooks/paypal
```

### Headers

```http
Content-Type: application/json
PAYPAL-TRANSMISSION-ID: unique_transmission_id
PAYPAL-CERT-ID: certificate_id
PAYPAL-AUTH-ALGO: SHA256withRSA
PAYPAL-TRANSMISSION-SIG: signature
PAYPAL-TRANSMISSION-TIME: 2025-01-15T10:30:00Z
```

### Request Body

PayPal sends event data in their format:

```json
{
  "id": "WH-1234567890",
  "event_version": "1.0",
  "create_time": "2025-01-15T10:30:00Z",
  "resource_type": "payment",
  "event_type": "PAYMENT.CAPTURE.COMPLETED",
  "summary": "Payment completed",
  "resource": {
    "id": "PAY-1234567890",
    "amount": {
      "total": "20.00",
      "currency": "USD"
    },
    "state": "approved"
  }
}
```

### Response

```http
HTTP/1.1 200 OK
Content-Type: application/json
```

```json
{
  "received": true,
  "processed": true,
  "event_id": "WH-1234567890",
  "timestamp": "2025-01-15T10:30:00Z"
}
```

### Supported Events

#### Payment Events
- `PAYMENT.CAPTURE.COMPLETED` - Payment captured successfully
- `PAYMENT.CAPTURE.DENIED` - Payment capture denied
- `PAYMENT.CAPTURE.PENDING` - Payment capture pending

#### Billing Events
- `BILLING.SUBSCRIPTION.CREATED` - Subscription created
- `BILLING.SUBSCRIPTION.CANCELLED` - Subscription cancelled
- `BILLING.SUBSCRIPTION.PAYMENT.FAILED` - Subscription payment failed

---

## Webhook Event Processing

### Event Storage

All webhook events are stored in the database for:
- **Audit trails**: Complete history of payment events
- **Debugging**: Troubleshooting payment issues
- **Compliance**: Regulatory requirements
- **Analytics**: Payment performance analysis

### Event Processing Flow

1. **Receive webhook**: Endpoint receives the webhook request
2. **Verify signature**: Cryptographically verify the request authenticity
3. **Parse event**: Extract event type and data
4. **Store event**: Save to database with processing status
5. **Process event**: Update payment status, send notifications, etc.
6. **Mark processed**: Update event status to prevent reprocessing
7. **Return response**: Send success response to provider

### Idempotency Handling

```javascript
// Example idempotency check
const existingEvent = await webhookRepo.findByProviderEventId(event.id);
if (existingEvent) {
  return { received: true, processed: true, duplicate: true };
}
```

### Error Handling

```javascript
// Example error handling
try {
  await processPaymentEvent(event);
  await webhookRepo.markProcessed(event.id);
} catch (error) {
  await webhookRepo.markFailed(event.id, error.message);
  // Provider will retry based on response status
  throw error;
}
```

---

## Webhook Configuration

### Environment Variables

```bash
# Stripe webhook configuration
STRIPE_WEBHOOK_SECRET=whsec_1234567890abcdef
STRIPE_WEBHOOK_TOLERANCE=300  # 5 minutes

# PayPal webhook configuration
PAYPAL_WEBHOOK_ID=webhook_id_from_paypal
PAYPAL_CLIENT_ID=your_paypal_client_id
PAYPAL_CLIENT_SECRET=your_paypal_client_secret

# General webhook settings
WEBHOOK_TIMEOUT=30000  # 30 seconds
WEBHOOK_RETRY_ATTEMPTS=3
```

### Provider Setup

#### Stripe Setup
1. Go to Stripe Dashboard → Webhooks
2. Add endpoint: `https://your-api.com/bridge-payment/webhooks/stripe`
3. Select events: `payment_intent.*`, `customer.*`, `payment_method.*`
4. Copy webhook signing secret to `STRIPE_WEBHOOK_SECRET`

#### PayPal Setup
1. Go to PayPal Developer Dashboard → Webhooks
2. Create webhook: `https://your-api.com/bridge-payment/webhooks/paypal`
3. Select events: `PAYMENT.*`, `BILLING.*`
4. Configure authentication credentials

---

## Testing Webhooks

### Local Development

#### Using ngrok
```bash
# Install ngrok
npm install -g ngrok

# Expose local server
ngrok http 3000

# Use ngrok URL for webhook endpoint
# https://abc123.ngrok.io/bridge-payment/webhooks/stripe
```

#### Using Stripe CLI
```bash
# Install Stripe CLI
# Login to Stripe
stripe login

# Forward webhooks to local server
stripe listen --forward-to localhost:3000/bridge-payment/webhooks/stripe

# Trigger test events
stripe trigger payment_intent.succeeded
stripe trigger payment_intent.payment_failed
```

### Test Events

#### Stripe Test Events
```bash
# Successful payment
curl -X POST "http://localhost:3000/bridge-payment/webhooks/stripe" \
  -H "Content-Type: application/json" \
  -H "Stripe-Signature: t=1234567890,v1=test_signature" \
  -d '{
    "id": "evt_test_webhook",
    "object": "event",
    "type": "payment_intent.succeeded",
    "data": {
      "object": {
        "id": "pi_test_123",
        "status": "succeeded",
        "amount": 2000,
        "currency": "usd"
      }
    }
  }'
```

#### PayPal Test Events
```bash
# Payment completion
curl -X POST "http://localhost:3000/bridge-payment/webhooks/paypal" \
  -H "Content-Type: application/json" \
  -H "PAYPAL-TRANSMISSION-ID: test_transmission" \
  -d '{
    "id": "WH-test-123",
    "event_type": "PAYMENT.CAPTURE.COMPLETED",
    "resource": {
      "id": "PAY-test-456",
      "amount": {"total": "20.00", "currency": "USD"},
      "state": "approved"
    }
  }'
```

---

## Error Responses

### Common Error Codes

| Status Code | Error | Description |
|-------------|-------|-------------|
| 400 | Bad Request | Invalid webhook payload or signature |
| 401 | Unauthorized | Invalid or missing webhook signature |
| 404 | Not Found | Webhook endpoint not found |
| 409 | Conflict | Duplicate event (already processed) |
| 422 | Validation Error | Webhook payload failed validation |
| 500 | Internal Server Error | Server error during processing |

### Error Response Format

```json
{
  "error": "Invalid signature",
  "message": "Webhook signature verification failed",
  "timestamp": "2025-01-15T18:00:00Z",
  "event_id": "evt_1234567890",
  "provider": "stripe"
}
```

### Example Error Responses

#### Invalid Signature
```http
HTTP/1.1 401 Unauthorized
Content-Type: application/json
```

```json
{
  "error": "Invalid signature",
  "message": "Webhook signature verification failed",
  "timestamp": "2025-01-15T18:00:00Z",
  "details": {
    "provider": "stripe",
    "signature_header": "Stripe-Signature",
    "verification_failed": true
  }
}
```

#### Duplicate Event
```http
HTTP/1.1 409 Conflict
Content-Type: application/json
```

```json
{
  "error": "Duplicate event",
  "message": "This event has already been processed",
  "timestamp": "2025-01-15T18:00:00Z",
  "event_id": "evt_1234567890",
  "processed_at": "2025-01-15T10:30:00Z"
}
```

---

## Best Practices

### Security
- **Verify signatures**: Always verify webhook signatures before processing
- **Use HTTPS**: Webhook endpoints must use HTTPS in production
- **IP allowlisting**: Consider allowlisting provider IP ranges
- **Timeout handling**: Set appropriate timeouts for webhook processing

### Reliability
- **Idempotency**: Handle duplicate webhook deliveries gracefully
- **Error handling**: Return appropriate HTTP status codes
- **Retry logic**: Implement exponential backoff for failed processing
- **Dead letter queues**: Store failed events for manual review

### Performance
- **Async processing**: Process webhooks asynchronously when possible
- **Database transactions**: Use transactions for atomic updates
- **Monitoring**: Monitor webhook processing times and failure rates
- **Scaling**: Design for high webhook volumes

### Compliance
- **Event logging**: Log all webhook events for audit trails
- **Data retention**: Implement appropriate data retention policies
- **Error tracking**: Track and alert on webhook failures
- **Documentation**: Document webhook handling procedures

---

## Monitoring and Debugging

### Webhook Logs

```javascript
// Example webhook logging
app.post('/bridge-payment/webhooks/stripe', async (req, res) => {
  const startTime = Date.now();
  const eventId = req.body.id;

  try {
    console.log(`📥 Webhook received: ${eventId}`);
    await processWebhook(req.body);

    const duration = Date.now() - startTime;
    console.log(`✅ Webhook processed: ${eventId} (${duration}ms)`);

    res.json({ received: true, processed: true });
  } catch (error) {
    const duration = Date.now() - startTime;
    console.error(`❌ Webhook failed: ${eventId} (${duration}ms)`, error);

    res.status(500).json({
      error: 'Processing failed',
      event_id: eventId
    });
  }
});
```

### Health Monitoring

```javascript
// Webhook health endpoint
app.get('/bridge-payment/webhooks/health', async (req, res) => {
  const stats = await getWebhookStats();

  res.json({
    status: 'healthy',
    processed_today: stats.processedToday,
    failed_today: stats.failedToday,
    average_processing_time: stats.avgProcessingTime,
    last_processed: stats.lastProcessed
  });
});
```

### Debugging Tools

#### Webhook Event Inspector
```bash
# Get recent webhook events
curl -X GET "https://api.example.com/bridge-payment/webhooks/events?limit=10" \
  -H "Authorization: Bearer admin_token"
```

#### Replay Failed Events
```bash
# Replay a failed webhook event
curl -X POST "https://api.example.com/bridge-payment/webhooks/replay/evt_1234567890" \
  -H "Authorization: Bearer admin_token"
```

---

## Integration Examples

### Express.js Integration

```javascript
const express = require('express');
const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);

app.post('/bridge-payment/webhooks/stripe',
  express.raw({type: 'application/json'}),
  async (req, res) => {
    const sig = req.headers['stripe-signature'];
    let event;

    try {
      event = stripe.webhooks.constructEvent(
        req.body,
        sig,
        process.env.STRIPE_WEBHOOK_SECRET
      );
    } catch (err) {
      return res.status(400).send(`Webhook signature verification failed: ${err.message}`);
    }

    // Handle the event
    switch (event.type) {
      case 'payment_intent.succeeded':
        await handlePaymentSuccess(event.data.object);
        break;
      case 'payment_intent.payment_failed':
        await handlePaymentFailure(event.data.object);
        break;
      default:
        console.log(`Unhandled event type ${event.type}`);
    }

    res.json({received: true});
  }
);
```

### Next.js API Route

```javascript
// pages/api/webhooks/stripe.js
import Stripe from 'stripe';

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).end();
  }

  const sig = req.headers['stripe-signature'];
  let event;

  try {
    event = stripe.webhooks.constructEvent(
      req.body,
      sig,
      process.env.STRIPE_WEBHOOK_SECRET
    );
  } catch (err) {
    return res.status(400).json({ error: err.message });
  }

  // Process event
  await processWebhookEvent(event);

  res.json({ received: true });
}

export const config = {
  api: {
    bodyParser: {
      sizeLimit: '1mb',
    },
  },
}
```

---

## Rate Limits

### Provider Limits

- **Stripe**: No explicit rate limits, but recommends responding within 10 seconds
- **PayPal**: 100 events per second per webhook endpoint
- **General**: Most providers retry failed webhooks with exponential backoff

### Response Time Requirements

- **Target**: Respond within 2 seconds
- **Maximum**: 10 seconds before provider timeout
- **Retry**: Providers typically retry 3-5 times with increasing delays

### Scaling Considerations

```javascript
// Example queue-based processing for high volume
const Queue = require('bull');
const webhookQueue = new Queue('webhook processing');

app.post('/webhooks/stripe', async (req, res) => {
  // Quickly acknowledge receipt
  res.json({ received: true });

  // Queue for async processing
  await webhookQueue.add('process-stripe-webhook', {
    event: req.body,
    signature: req.headers['stripe-signature']
  });
});

webhookQueue.process('process-stripe-webhook', async (job) => {
  const { event, signature } = job.data;
  await processStripeWebhook(event, signature);
});
```