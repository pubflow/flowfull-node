# API Reference

## Base URL

All API endpoints are prefixed with `/bridge-payment/`:

```
Production: https://api.yourdomain.com/bridge-payment/
Development: http://localhost:3001/bridge-payment/
```

## Authentication

### Session-Based Authentication

Include session ID in requests using one of these methods:

```bash
# HTTP Header (Recommended)
curl -H "X-Session-ID: session_abc123" \
     https://api.yourdomain.com/bridge-payment/payments

# Cookie
curl -b "session_id=session_abc123" \
     https://api.yourdomain.com/bridge-payment/payments

# Query Parameter
curl "https://api.yourdomain.com/bridge-payment/payments?session_id=session_abc123"
```

### Guest Checkout

For guest checkout, no authentication is required. Include guest data in the request body.

## Core Endpoints

### Health Check

#### GET /health

Check service health and status.

**Response:**
```json
{
  "status": "ok",
  "timestamp": "2024-01-15T10:00:00Z",
  "version": "1.0.0",
  "database": "connected",
  "flowless": "connected"
}
```

### Configuration

#### GET /config

Get payment configuration and available providers.

**Response:**
```json
{
  "guest_checkout_enabled": true,
  "guest_require_email": true,
  "enabled_providers": ["stripe", "paypal"],
  "default_provider": "stripe",
  "supported_currencies": ["USD", "EUR", "GBP"],
  "supported_payment_types": ["credit_card", "paypal", "bank_account"]
}
```

## Payment Endpoints

### Create Payment

#### POST /payments

Create a new payment for authenticated users or guests.

**Authenticated User Request:**
```json
{
  "amount": 2999,
  "currency": "USD",
  "description": "Premium Membership",
  "provider": "stripe",
  "payment_method_id": "pm_123",
  "metadata": {
    "product_id": "premium_plan",
    "duration": "monthly"
  }
}
```

**Guest Checkout Request:**
```json
{
  "amount": 2999,
  "currency": "USD",
  "description": "Premium Membership",
  "provider": "stripe",
  "guest_data": {
    "email": "guest@example.com",
    "name": "John Doe",
    "phone": "+1234567890"
  },
  "payment_method": {
    "type": "card",
    "card": {
      "number": "4242424242424242",
      "exp_month": 12,
      "exp_year": 2025,
      "cvc": "123"
    }
  },
  "metadata": {
    "product_id": "premium_plan"
  }
}
```

**Response:**
```json
{
  "id": "pay_123",
  "status": "requires_confirmation",
  "amount": 2999,
  "currency": "USD",
  "client_secret": "pi_123_secret_abc",
  "provider_intent_id": "pi_stripe_123",
  "is_guest_payment": false,
  "created_at": "2024-01-15T10:00:00Z",
  "next_action": {
    "type": "use_stripe_sdk",
    "stripe_js": {
      "client_secret": "pi_123_secret_abc"
    }
  }
}
```

### Get Payment

#### GET /payments/:id

Retrieve payment details.

**Response:**
```json
{
  "id": "pay_123",
  "status": "succeeded",
  "amount": 2999,
  "currency": "USD",
  "description": "Premium Membership",
  "provider_id": "stripe",
  "provider_payment_id": "ch_stripe_456",
  "is_guest_payment": false,
  "metadata": {
    "product_id": "premium_plan"
  },
  "created_at": "2024-01-15T10:00:00Z",
  "completed_at": "2024-01-15T10:05:00Z"
}
```

### Confirm Payment

#### POST /payments/:id/confirm

Confirm a payment intent (typically after 3D Secure).

**Request:**
```json
{
  "payment_method_id": "pm_123"
}
```

**Response:**
```json
{
  "id": "pay_123",
  "status": "succeeded",
  "amount": 2999,
  "provider_payment_id": "ch_stripe_456",
  "completed_at": "2024-01-15T10:05:00Z"
}
```

### List Payments

#### GET /payments

List user's payments (authenticated users only).

**Query Parameters:**
- `limit` (optional): Number of payments to return (default: 20, max: 100)
- `offset` (optional): Number of payments to skip (default: 0)
- `status` (optional): Filter by status
- `provider` (optional): Filter by provider

**Response:**
```json
{
  "payments": [
    {
      "id": "pay_123",
      "status": "succeeded",
      "amount": 2999,
      "currency": "USD",
      "description": "Premium Membership",
      "created_at": "2024-01-15T10:00:00Z"
    }
  ],
  "total": 1,
  "has_more": false
}
```

## Payment Methods

### Save Payment Method

#### POST /payment-methods

Save a payment method for future use (authenticated users only).

**Request:**
```json
{
  "provider": "stripe",
  "payment_method": {
    "type": "card",
    "card": {
      "number": "4242424242424242",
      "exp_month": 12,
      "exp_year": 2025,
      "cvc": "123"
    }
  },
  "billing_details": {
    "name": "John Doe",
    "email": "john@example.com",
    "address": {
      "line1": "123 Main St",
      "city": "New York",
      "state": "NY",
      "postal_code": "10001",
      "country": "US"
    }
  },
  "is_default": true
}
```

**Response:**
```json
{
  "id": "pm_123",
  "payment_type": "credit_card",
  "last_four": "4242",
  "card_brand": "visa",
  "expiry_month": "12",
  "expiry_year": "2025",
  "is_default": true,
  "created_at": "2024-01-15T10:00:00Z"
}
```

### List Payment Methods

#### GET /payment-methods

List user's saved payment methods.

**Response:**
```json
{
  "payment_methods": [
    {
      "id": "pm_123",
      "payment_type": "credit_card",
      "last_four": "4242",
      "card_brand": "visa",
      "is_default": true,
      "created_at": "2024-01-15T10:00:00Z"
    }
  ]
}
```

### Delete Payment Method

#### DELETE /payment-methods/:id

Remove a saved payment method.

**Response:**
```json
{
  "success": true,
  "message": "Payment method deleted successfully"
}
```

## Customer Management

### Get Customer

#### GET /customers/me

Get current user's customer information.

**Response:**
```json
{
  "id": "cust_123",
  "email": "user@example.com",
  "name": "John Doe",
  "provider_customers": [
    {
      "provider": "stripe",
      "provider_customer_id": "cus_stripe_123"
    }
  ],
  "default_payment_method": "pm_123",
  "created_at": "2024-01-15T10:00:00Z"
}
```

## Webhooks

### Provider Webhooks

#### POST /webhooks/:provider

Handle webhooks from payment providers.

**Stripe Webhook:**
```bash
curl -X POST https://api.yourdomain.com/bridge-payment/webhooks/stripe \
     -H "Stripe-Signature: t=1234567890,v1=signature" \
     -d '{"type":"payment_intent.succeeded","data":{"object":{...}}}'
```

**PayPal Webhook:**
```bash
curl -X POST https://api.yourdomain.com/bridge-payment/webhooks/paypal \
     -H "PAYPAL-TRANSMISSION-ID: transmission-id" \
     -d '{"event_type":"PAYMENT.CAPTURE.COMPLETED","resource":{...}}'
```

## Error Responses

### Error Format

All errors follow this format:

```json
{
  "error": {
    "code": "ERROR_CODE",
    "message": "Human readable error message",
    "details": {
      "field": "Additional error details"
    },
    "timestamp": "2024-01-15T10:00:00Z",
    "request_id": "req_123456"
  }
}
```

### Common Error Codes

| Code | Status | Description |
|------|--------|-------------|
| `AUTH_REQUIRED` | 401 | Authentication required |
| `INVALID_SESSION` | 401 | Invalid or expired session |
| `FORBIDDEN` | 403 | Insufficient permissions |
| `NOT_FOUND` | 404 | Resource not found |
| `VALIDATION_ERROR` | 400 | Invalid request data |
| `PAYMENT_FAILED` | 400 | Payment processing failed |
| `PROVIDER_ERROR` | 502 | Payment provider error |
| `RATE_LIMITED` | 429 | Too many requests |
| `SERVER_ERROR` | 500 | Internal server error |

### Example Error Responses

**Authentication Error:**
```json
{
  "error": {
    "code": "AUTH_REQUIRED",
    "message": "Authentication required",
    "details": {
      "session_sources": ["header", "cookie", "query"],
      "guest_checkout_available": true
    },
    "timestamp": "2024-01-15T10:00:00Z",
    "request_id": "req_123456"
  }
}
```

**Validation Error:**
```json
{
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "Invalid request data",
    "details": {
      "amount": "Amount must be greater than 0",
      "currency": "Currency must be a valid 3-letter code"
    },
    "timestamp": "2024-01-15T10:00:00Z",
    "request_id": "req_123456"
  }
}
```

**Payment Error:**
```json
{
  "error": {
    "code": "PAYMENT_FAILED",
    "message": "Payment could not be processed",
    "details": {
      "provider": "stripe",
      "provider_error": "card_declined",
      "decline_code": "insufficient_funds"
    },
    "timestamp": "2024-01-15T10:00:00Z",
    "request_id": "req_123456"
  }
}
```

## Rate Limiting

### Rate Limit Headers

All responses include rate limiting headers:

```
X-RateLimit-Limit: 100
X-RateLimit-Remaining: 95
X-RateLimit-Reset: 1642248000
```

### Rate Limit Response

When rate limited:

```json
{
  "error": {
    "code": "RATE_LIMITED",
    "message": "Too many requests",
    "details": {
      "limit": 100,
      "window": 900,
      "retry_after": 60
    },
    "timestamp": "2024-01-15T10:00:00Z",
    "request_id": "req_123456"
  }
}
```

## Next Steps

- **[Provider Setup](./providers/)** - Configure payment providers
- **[Examples](./examples/)** - Code examples and use cases
- **[Webhooks](./webhooks.md)** - Webhook implementation guide
- **[Testing](./testing.md)** - API testing guide
