# Webhook API Reference

Quick reference for Bridge-Payments webhook endpoints and events.

## Webhook Endpoints

### Receive Webhooks

| Method | Endpoint | Description | Headers Required |
|--------|----------|-------------|------------------|
| `POST` | `/bridge-payment/webhooks/stripe` | Stripe webhooks | `stripe-signature` |
| `POST` | `/bridge-payment/webhooks/paypal` | PayPal webhooks | `paypal-transmission-sig` |
| `POST` | `/bridge-payment/webhooks/{providerId}` | Generic provider webhooks | None |

### Management API

| Method | Endpoint | Description | Parameters |
|--------|----------|-------------|------------|
| `GET` | `/bridge-payment/webhooks/stats` | Get webhook statistics | `provider_id` (optional) |
| `GET` | `/bridge-payment/webhooks/provider/{providerId}` | Get webhooks by provider | `limit` (default: 50) |
| `POST` | `/bridge-payment/webhooks/process` | Process unprocessed webhooks | None |
| `DELETE` | `/bridge-payment/webhooks/cleanup` | Cleanup old webhooks | `days` (default: 30) |

## Supported Events

### Stripe Events

#### Payment Intent Events
- `payment_intent.succeeded` → Updates payment status to `succeeded`
- `payment_intent.payment_failed` → Updates payment status to `failed`
- `payment_intent.canceled` → Updates payment status to `canceled`
- `payment_intent.requires_action` → Updates payment status to `requires_action`

#### Payment Method Events
- `payment_method.attached` → Logs attachment event
- `payment_method.detached` → Logs detachment event

#### Customer Events
- `customer.created` → Logs customer creation
- `customer.updated` → Logs customer update
- `customer.deleted` → Logs customer deletion

#### Invoice Events
- `invoice.payment_succeeded` → Logs successful invoice payment
- `invoice.payment_failed` → Logs failed invoice payment

### PayPal Events

#### Payment Events
- `PAYMENT.CAPTURE.COMPLETED` → Updates payment status to `succeeded`
- `PAYMENT.CAPTURE.DENIED` → Updates payment status to `failed`
- `PAYMENT.CAPTURE.FAILED` → Updates payment status to `failed`

#### Subscription Events
- `BILLING.SUBSCRIPTION.CREATED` → Logs subscription creation
- `BILLING.SUBSCRIPTION.CANCELLED` → Logs subscription cancellation
- `BILLING.SUBSCRIPTION.PAYMENT.FAILED` → Logs subscription payment failure

## Response Formats

### Webhook Statistics Response

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

### Webhook List Response

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

### Process Response

```json
{
  "message": "Processing completed"
}
```

### Cleanup Response

```json
{
  "deleted_webhooks": 25,
  "deleted_events": 50
}
```

## Error Responses

### 400 Bad Request
```json
{
  "error": "Missing signature",
  "timestamp": "2024-01-15T10:30:00Z"
}
```

### 401 Unauthorized
```json
{
  "error": "Invalid signature",
  "timestamp": "2024-01-15T10:30:00Z"
}
```

### 404 Not Found
```json
{
  "error": "Provider not supported",
  "timestamp": "2024-01-15T10:30:00Z"
}
```

### 500 Internal Server Error
```json
{
  "error": "Internal server error",
  "timestamp": "2024-01-15T10:30:00Z"
}
```

## Database Schema

### payment_webhooks Table

| Column | Type | Description |
|--------|------|-------------|
| `id` | TEXT | Primary key |
| `provider_id` | TEXT | Payment provider ID |
| `event_type` | TEXT | Webhook event type |
| `payload` | TEXT | JSON webhook payload |
| `processed` | INTEGER | 0 = pending, 1 = processed |
| `created_at` | TEXT | ISO timestamp |
| `processed_at` | TEXT | ISO timestamp (nullable) |

### payment_events Table

| Column | Type | Description |
|--------|------|-------------|
| `id` | TEXT | Primary key |
| `entity_type` | TEXT | Entity type (payment, customer, etc.) |
| `entity_id` | TEXT | Entity ID |
| `event_type` | TEXT | Event type (processed, failed, etc.) |
| `data` | TEXT | JSON event data (nullable) |
| `created_at` | TEXT | ISO timestamp |

## Environment Variables

```bash
# Required for signature validation
STRIPE_WEBHOOK_SECRET=whsec_your_stripe_webhook_secret
PAYPAL_WEBHOOK_ID=your_paypal_webhook_id

# Optional webhook configuration
WEBHOOK_TIMEOUT=30000
WEBHOOK_RETRY_ATTEMPTS=3
WEBHOOK_BATCH_SIZE=10
```

## cURL Examples

### Get Webhook Statistics
```bash
curl -X GET "https://your-domain.com/bridge-payment/webhooks/stats" \
  -H "Authorization: Bearer your_api_key"
```

### Get Webhooks by Provider
```bash
curl -X GET "https://your-domain.com/bridge-payment/webhooks/provider/stripe?limit=10" \
  -H "Authorization: Bearer your_api_key"
```

### Process Unprocessed Webhooks
```bash
curl -X POST "https://your-domain.com/bridge-payment/webhooks/process" \
  -H "Authorization: Bearer your_api_key"
```

### Cleanup Old Webhooks
```bash
curl -X DELETE "https://your-domain.com/bridge-payment/webhooks/cleanup?days=30" \
  -H "Authorization: Bearer your_api_key"
```

### Test Stripe Webhook
```bash
curl -X POST "https://your-domain.com/bridge-payment/webhooks/stripe" \
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

## Status Codes

| Code | Description |
|------|-------------|
| `200` | Webhook received and processed successfully |
| `400` | Bad request (missing signature, invalid JSON) |
| `401` | Unauthorized (invalid signature) |
| `404` | Provider not found |
| `500` | Internal server error |

## Rate Limiting

- **Stripe**: No rate limiting (handled by Stripe)
- **PayPal**: No rate limiting (handled by PayPal)
- **Management API**: 500 requests per 15 minutes per IP/session

## Security Notes

1. **Always validate signatures** in production
2. **Use HTTPS** for all webhook endpoints
3. **Implement idempotency** in your handlers
4. **Monitor webhook delivery** regularly
5. **Set up proper logging** for debugging

## Monitoring Commands

```bash
# Check database tables
bun run check-tables

# View application logs
tail -f logs/bridge-payments.log

# Check webhook processing status
curl https://your-domain.com/bridge-payment/webhooks/stats

# Process stuck webhooks
curl -X POST https://your-domain.com/bridge-payment/webhooks/process
```

This reference provides all the essential information for working with Bridge-Payments webhooks.
