# Payments API Reference (Payment Intents)

The Payments API allows you to create, confirm, and manage payment intents for both authenticated users and guest customers. This API integrates with payment providers like Stripe and supports various payment flows including one-time payments and saved payment methods.

## Base URL

```
https://your-api-domain.com/bridge-payment
```

## Authentication

- **Authenticated Users**: Include `Authorization: Bearer <token>` header
- **Guest Users**: No authentication required, provide `guest_data` in request

## Payment Flow

1. **Create Payment Intent**: Initialize payment with amount and currency
2. **Confirm Payment Intent**: Complete payment with payment method
3. **Handle Results**: Process success, failure, or required actions

## Endpoints Overview

| Method | Endpoint | Description | Auth Required |
|--------|----------|-------------|---------------|
| POST | `/payments/intents` | Create payment intent | Optional |
| POST | `/payments/intents/:id/confirm` | Confirm payment intent | Optional |
| GET | `/payments/:id` | Get payment by ID | Optional |
| GET | `/payments` | List user payments | Yes |
| POST | `/payments/:id/cancel` | Cancel payment intent | Optional |

---

## Create Payment Intent

Create a new payment intent to initialize a payment process.

### Request

```http
POST /bridge-payment/payments/intents
```

#### Headers

```http
Authorization: Bearer <token>  # Optional for authenticated users
Content-Type: application/json
```

#### Request Body

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `amount_cents` | number | Yes | Payment amount in cents (e.g., 2000 = $20.00) |
| `currency` | string | Yes | 3-letter currency code (e.g., "USD", "EUR") |
| `description` | string | No | Payment description |
| `provider_id` | string | Yes | Payment provider (e.g., "stripe") |
| `payment_method_id` | string | No | Existing payment method ID |
| `return_url` | string | No | URL to redirect after payment |
| `metadata` | object | No | Additional metadata |
| `guest_data` | object | No* | Guest customer data (*required for guests) |
| `guest_data.email` | string | Yes | Guest email address |
| `guest_data.name` | string | Yes | Guest full name |
| `guest_data.phone` | string | No | Guest phone number |

### Response

```http
HTTP/1.1 201 Created
Content-Type: application/json
```

```json
{
  "id": "pay_1234567890",
  "provider_intent_id": "pi_1234567890abcdef",
  "client_secret": "pi_1234567890abcdef_secret_xyz",
  "amount_cents": 2000,
  "currency": "USD",
  "status": "requires_confirmation",
  "provider_id": "stripe",
  "is_guest_payment": false,
  "created_at": "2025-01-15T10:30:00Z"
}
```

### Examples

#### Authenticated User Payment
```bash
curl -X POST "https://api.example.com/bridge-payment/payments/intents" \
  -H "Authorization: Bearer your_token_here" \
  -H "Content-Type: application/json" \
  -d '{
    "amount_cents": 2000,
    "currency": "USD",
    "description": "Premium subscription",
    "provider_id": "stripe",
    "payment_method_id": "pm_1234567890",
    "metadata": {
      "order_id": "order_123",
      "customer_id": "cust_456"
    }
  }'
```

#### Guest Payment
```bash
curl -X POST "https://api.example.com/bridge-payment/payments/intents" \
  -H "Content-Type: application/json" \
  -d '{
    "amount_cents": 1500,
    "currency": "USD",
    "description": "Guest purchase",
    "provider_id": "stripe",
    "guest_data": {
      "email": "guest@example.com",
      "name": "Guest User",
      "phone": "+1-555-123-4567"
    },
    "metadata": {
      "product_id": "prod_789"
    }
  }'
```

---

## Confirm Payment Intent

Confirm a payment intent to complete the payment process.

### Request

```http
POST /bridge-payment/payments/intents/{id}/confirm
```

#### Path Parameters

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `id` | string | Yes | Payment intent ID |

#### Headers

```http
Authorization: Bearer <token>  # Optional for authenticated users
Content-Type: application/json
```

#### Request Body

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `payment_method_id` | string | No | Payment method ID to use |
| `return_url` | string | No | URL to redirect after payment |
| `save_payment_method` | boolean | No | Whether to save the payment method for future use (default: false) |

### Response

```http
HTTP/1.1 200 OK
Content-Type: application/json
```

```json
{
  "id": "pay_1234567890",
  "status": "succeeded",
  "provider_intent_id": "pi_1234567890abcdef",
  "requires_action": false,
  "payment_method_saved": true,
  "updated_at": "2025-01-15T10:35:00Z"
}
```

### Payment Status Values

| Status | Description |
|--------|-------------|
| `pending` | Payment is being processed |
| `requires_confirmation` | Waiting for confirmation |
| `requires_action` | Requires additional customer action (3D Secure, etc.) |
| `processing` | Payment is being processed by provider |
| `succeeded` | Payment completed successfully |
| `failed` | Payment failed |
| `canceled` | Payment was canceled |

### Examples

#### Confirm with Payment Method
```bash
curl -X POST "https://api.example.com/bridge-payment/payments/intents/pay_1234567890/confirm" \
  -H "Authorization: Bearer your_token_here" \
  -H "Content-Type: application/json" \
  -d '{
    "payment_method_id": "pm_1234567890",
    "return_url": "https://yoursite.com/payment/success"
  }'
```

#### Confirm and Save Payment Method
```bash
curl -X POST "https://api.example.com/bridge-payment/payments/intents/pay_1234567890/confirm" \
  -H "Authorization: Bearer your_token_here" \
  -H "Content-Type: application/json" \
  -d '{
    "payment_method_id": "pm_1234567890",
    "return_url": "https://yoursite.com/payment/success",
    "save_payment_method": true
  }'
```

#### Confirm Guest Payment
```bash
curl -X POST "https://api.example.com/bridge-payment/payments/intents/pay_guest_123/confirm" \
  -H "Content-Type: application/json" \
  -d '{
    "payment_method_id": "pm_guest_456",
    "return_url": "https://yoursite.com/guest/success"
  }'
```

#### Confirm Guest Payment and Save Method (for future guest use)
```bash
curl -X POST "https://api.example.com/bridge-payment/payments/intents/pay_guest_123/confirm" \
  -H "Content-Type: application/json" \
  -d '{
    "payment_method_id": "pm_guest_456",
    "return_url": "https://yoursite.com/guest/success",
    "save_payment_method": true
  }'
```

---

## Get Payment by ID

Retrieve a specific payment by its ID.

### Request

```http
GET /bridge-payment/payments/{id}
```

#### Path Parameters

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `id` | string | Yes | Payment ID |

#### Headers

```http
Authorization: Bearer <token>  # Optional for authenticated users
Content-Type: application/json
```

### Response

```http
HTTP/1.1 200 OK
Content-Type: application/json
```

```json
{
  "id": "pay_1234567890",
  "amount_cents": 2000,
  "currency": "USD",
  "status": "succeeded",
  "description": "Premium subscription",
  "provider_id": "stripe",
  "is_guest_payment": false,
  "metadata": {
    "order_id": "order_123",
    "customer_id": "cust_456"
  },
  "created_at": "2025-01-15T10:30:00Z",
  "updated_at": "2025-01-15T10:35:00Z",
  "completed_at": "2025-01-15T10:35:00Z"
}
```

### Examples

#### Get Payment
```bash
curl -X GET "https://api.example.com/bridge-payment/payments/pay_1234567890" \
  -H "Authorization: Bearer your_token_here" \
  -H "Content-Type: application/json"
```

---

## List User Payments

Retrieve a list of payments for the authenticated user.

### Request

```http
GET /bridge-payment/payments
```

#### Query Parameters

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `limit` | number | No | Number of results (default: 20, max: 100) |
| `offset` | number | No | Pagination offset (default: 0) |

#### Headers

```http
Authorization: Bearer <token>  # Required
Content-Type: application/json
```

### Response

```

---

## Cancel Payment Intent

Cancel a payment intent before it's completed.

### Request

```http
POST /bridge-payment/payments/{id}/cancel
```

#### Path Parameters

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `id` | string | Yes | Payment intent ID |

#### Headers

```http
Authorization: Bearer <token>  # Optional for authenticated users
Content-Type: application/json
```

### Response

```http
HTTP/1.1 200 OK
Content-Type: application/json
```

```json
{
  "id": "pay_1234567890",
  "status": "canceled",
  "message": "Payment intent canceled successfully",
  "updated_at": "2025-01-15T10:40:00Z"
}
```

### Examples

#### Cancel Payment Intent
```bash
curl -X POST "https://api.example.com/bridge-payment/payments/pay_1234567890/cancel" \
  -H "Authorization: Bearer your_token_here" \
  -H "Content-Type: application/json"
```

---

## Error Responses

### Common Error Codes

| Status Code | Error | Description |
|-------------|-------|-------------|
| 400 | Bad Request | Invalid request data or payment parameters |
| 401 | Unauthorized | Invalid or missing authentication token |
| 403 | Forbidden | Access denied - not the payment owner |
| 404 | Not Found | Payment not found |
| 409 | Conflict | Payment already processed or in invalid state |
| 422 | Validation Error | Request data failed validation |
| 500 | Internal Server Error | Server error |

### Error Response Format

```json
{
  "error": "Payment failed",
  "message": "The payment could not be processed",
  "timestamp": "2025-01-15T18:00:00Z",
  "details": {
    "provider_error": "Your card was declined",
    "decline_code": "generic_decline"
  }
}
```

### Example Error Responses

#### Payment Failed
```http
HTTP/1.1 400 Bad Request
Content-Type: application/json
```

```json
{
  "error": "Payment failed",
  "message": "Your card was declined",
  "timestamp": "2025-01-15T18:00:00Z",
  "details": {
    "provider_error": "Your card was declined",
    "decline_code": "generic_decline",
    "payment_intent_id": "pi_1234567890abcdef"
  }
}
```

#### Insufficient Funds
```http
HTTP/1.1 400 Bad Request
Content-Type: application/json
```

```json
{
  "error": "Payment failed",
  "message": "Your card has insufficient funds",
  "timestamp": "2025-01-15T18:00:00Z",
  "details": {
    "provider_error": "Your card has insufficient funds",
    "decline_code": "insufficient_funds"
  }
}
```

#### Validation Error
```http
HTTP/1.1 400 Bad Request
Content-Type: application/json
```

```json
{
  "error": "Validation failed",
  "message": "The request data is invalid",
  "timestamp": "2025-01-15T18:00:00Z",
  "cause": [
    {
      "code": "too_small",
      "minimum": 50,
      "type": "number",
      "inclusive": true,
      "exact": false,
      "message": "Amount must be at least 50 cents",
      "path": ["amount_cents"]
    }
  ]
}
```

---

## Workflow Examples

### Complete Payment Flow

#### Step 1: Create Customer and Payment Method
```bash
# Create customer
curl -X POST "https://api.example.com/bridge-payment/customers" \
  -H "Authorization: Bearer your_token_here" \
  -H "Content-Type: application/json" \
  -d '{
    "email": "customer@example.com",
    "name": "John Doe"
  }'

# Create payment method
curl -X POST "https://api.example.com/bridge-payment/payment-methods" \
  -H "Authorization: Bearer your_token_here" \
  -H "Content-Type: application/json" \
  -d '{
    "customer_id": "550e8400-e29b-41d4-a716-446655440000",
    "type": "credit_card",
    "provider_id": "stripe",
    "payment_method_token": "pm_card_visa",
    "billing_details": {
      "name": "John Doe",
      "email": "customer@example.com"
    }
  }'
```

#### Step 2: Create Payment Intent
```bash
curl -X POST "https://api.example.com/bridge-payment/payments/intents" \
  -H "Authorization: Bearer your_token_here" \
  -H "Content-Type: application/json" \
  -d '{
    "amount_cents": 2000,
    "currency": "USD",
    "description": "Premium subscription",
    "provider_id": "stripe",
    "payment_method_id": "pm_1234567890",
    "metadata": {
      "subscription_id": "sub_123",
      "plan": "premium"
    }
  }'
# Response: {"id": "pay_1234567890", "status": "requires_confirmation"}
```

#### Step 3: Confirm Payment
```bash
curl -X POST "https://api.example.com/bridge-payment/payments/intents/pay_1234567890/confirm" \
  -H "Authorization: Bearer your_token_here" \
  -H "Content-Type: application/json" \
  -d '{
    "payment_method_id": "pm_1234567890"
  }'
# Response: {"status": "succeeded"} or {"status": "requires_action"}
```

#### Step 4: Handle Results
```bash
# Check final status
curl -X GET "https://api.example.com/bridge-payment/payments/pay_1234567890" \
  -H "Authorization: Bearer your_token_here" \
  -H "Content-Type: application/json"
```

### Guest Checkout Flow

#### Step 1: Create Guest Payment Intent
```bash
curl -X POST "https://api.example.com/bridge-payment/payments/intents" \
  -H "Content-Type: application/json" \
  -d '{
    "amount_cents": 1500,
    "currency": "USD",
    "description": "Guest purchase",
    "provider_id": "stripe",
    "guest_data": {
      "email": "guest@example.com",
      "name": "Guest User"
    }
  }'
# Response: {"id": "pay_guest_123", "client_secret": "pi_xxx_secret_yyy"}
```

#### Step 2: Confirm with Frontend
```javascript
// Frontend confirmation using Stripe.js
const {error} = await stripe.confirmCardPayment(client_secret, {
  payment_method: {
    card: cardElement,
    billing_details: {
      name: 'Guest User',
      email: 'guest@example.com'
    }
  }
});
```

### 3D Secure Authentication Flow

#### Step 1: Create Payment Intent
```bash
curl -X POST "https://api.example.com/bridge-payment/payments/intents" \
  -H "Authorization: Bearer your_token_here" \
  -H "Content-Type: application/json" \
  -d '{
    "amount_cents": 5000,
    "currency": "EUR",
    "payment_method_id": "pm_card_threeDSecure",
    "provider_id": "stripe"
  }'
```

#### Step 2: Handle requires_action Status
```bash
# If response status is "requires_action", handle on frontend
curl -X POST "https://api.example.com/bridge-payment/payments/intents/pay_123/confirm" \
  -H "Authorization: Bearer your_token_here" \
  -H "Content-Type: application/json"
# Response: {"status": "requires_action", "next_action": {...}}
```

#### Step 3: Complete Authentication
```javascript
// Frontend handling of 3D Secure
const {error} = await stripe.handleCardAction(client_secret);
if (!error) {
  // Payment succeeded after authentication
}
```

---

## Best Practices

### Payment Security
- **Use HTTPS**: All payment requests must be made over HTTPS
- **Client secrets**: Never expose client secrets in frontend code
- **Idempotency**: Use idempotency keys for critical payment operations
- **Validation**: Always validate payment amounts and currencies

### Error Handling
- **Graceful failures**: Handle payment failures gracefully with user-friendly messages
- **Retry logic**: Implement retry logic for transient failures
- **Logging**: Log payment attempts for debugging and compliance
- **User feedback**: Provide clear feedback for different failure types

### Performance
- **Async processing**: Use webhooks for payment status updates
- **Caching**: Cache payment status for frequently accessed payments
- **Pagination**: Use pagination for payment lists
- **Timeouts**: Set appropriate timeouts for payment operations

### Compliance
- **PCI DSS**: Follow PCI DSS guidelines for card data handling
- **Data retention**: Implement appropriate data retention policies
- **Audit trails**: Maintain audit trails for all payment operations
- **Regional compliance**: Follow regional payment regulations

---

## Integration with Stripe

### Frontend Integration

```javascript
// Initialize Stripe
const stripe = Stripe('pk_test_...');

// Create payment intent
const response = await fetch('/bridge-payment/payments/intents', {
  method: 'POST',
  headers: {'Content-Type': 'application/json'},
  body: JSON.stringify({
    amount_cents: 2000,
    currency: 'USD',
    provider_id: 'stripe'
  })
});

const {client_secret} = await response.json();

// Confirm payment
const {error} = await stripe.confirmCardPayment(client_secret, {
  payment_method: {
    card: cardElement,
    billing_details: {
      name: 'Customer Name'
    }
  }
});
```

### Webhook Handling

```javascript
// Handle payment status updates via webhooks
app.post('/bridge-payment/webhooks/stripe', (req, res) => {
  const event = req.body;

  switch (event.type) {
    case 'payment_intent.succeeded':
      // Handle successful payment
      break;
    case 'payment_intent.payment_failed':
      // Handle failed payment
      break;
  }

  res.json({received: true});
});
```

---

## Rate Limits

- **Authenticated users**: 1000 requests per hour
- **Guest users**: 100 requests per hour per IP
- **Payment operations**: 500 requests per hour per user
- **Burst limit**: 10 requests per second

Rate limit headers are included in all responses:
```http
X-RateLimit-Limit: 1000
X-RateLimit-Remaining: 999
X-RateLimit-Reset: 1642694400
```
