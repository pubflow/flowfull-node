# Payment Methods API Reference

The Payment Methods API allows you to securely manage payment methods (credit cards, bank accounts, etc.) for both authenticated users and guest customers. This API integrates with payment providers like Stripe and supports both token-based (recommended) and direct card data methods.

## Base URL

```
https://your-api-domain.com/bridge-payment/payment-methods
```

## Authentication

- **Authenticated Users**: Include `Authorization: Bearer <token>` header
- **Guest Users**: No authentication required, automatically treated as guest payment methods

## Security Models

### Token-Based (RECOMMENDED - SECURE)
- Use payment method tokens from frontend (Stripe Elements, etc.)
- Never handle raw card data on your server
- PCI DSS compliant by design

### Direct Card Data (DEVELOPMENT ONLY)
- Handle raw card data directly
- Requires PCI DSS compliance
- Only use for development/testing

## Endpoints Overview

| Method | Endpoint | Description | Auth Required |
|--------|----------|-------------|---------------|
| POST | `/payment-methods` | Create payment method (token-based) | Optional |
| POST | `/payment-methods/direct` | Create payment method (direct card data) | Optional |
| GET | `/payment-methods/:id` | Get payment method by ID | Optional |
| GET | `/payment-methods/customer/:customerId` | List customer payment methods | Optional |
| DELETE | `/payment-methods/:id` | Delete payment method | Optional |

---

## Create Payment Method (Token-Based) - RECOMMENDED

Create a payment method using a secure token from your frontend integration (Stripe Elements, etc.).

### Request

```http
POST /bridge-payment/payment-methods
```

#### Headers

```http
Authorization: Bearer <token>  # Optional for authenticated users
Content-Type: application/json
```

#### Request Body

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `customer_id` | string | No | Customer ID (internal UUID or Stripe ID) |
| `type` | string | Yes | Payment method type: `credit_card`, `bank_account`, `paypal` |
| `provider_id` | string | Yes | Payment provider (e.g., "stripe") |
| `payment_method_token` | string | Yes | Secure token from frontend |
| `billing_details` | object | No | Billing information |
| `billing_details.name` | string | Yes | Cardholder name |
| `billing_details.email` | string | Yes | Email address |
| `billing_details.phone` | string | No | Phone number |
| `billing_details.address` | object | No | Billing address |
| `save_for_future` | boolean | No | Save for future use (default: false) |
| `metadata` | object | No | Additional metadata |

### Response

```http
HTTP/1.1 201 Created
Content-Type: application/json
```

```json
{
  "id": "pm_1234567890",
  "provider_payment_method_id": "pm_card_visa",
  "payment_type": "credit_card",
  "card_brand": "visa",
  "last_four": "4242",
  "expiry_month": "12",
  "expiry_year": "2025",
  "is_default": false,
  "is_guest": true,
  "guest_email": "customer@example.com",
  "created_at": "2025-01-15T10:30:00Z"
}
```

### Examples

#### Authenticated User with Customer
```bash
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
      "email": "john@example.com",
      "phone": "+1-555-123-4567"
    },
    "save_for_future": true
  }'
```

#### Guest User
```bash
curl -X POST "https://api.example.com/bridge-payment/payment-methods" \
  -H "Content-Type: application/json" \
  -d '{
    "type": "credit_card",
    "provider_id": "stripe",
    "payment_method_token": "pm_card_mastercard",
    "billing_details": {
      "name": "Guest User",
      "email": "guest@example.com"
    }
  }'
```

---

## Create Payment Method (Direct Card Data) - DEVELOPMENT ONLY

⚠️ **WARNING**: This endpoint handles raw card data and should only be used for development/testing. Production applications should use the token-based endpoint.

### Request

```http
POST /bridge-payment/payment-methods/direct
```

#### Headers

```http
Authorization: Bearer <token>  # Optional for authenticated users
Content-Type: application/json
```

#### Request Body

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `type` | string | Yes | Payment method type |
| `customer_id` | string | No | Customer ID |
| `provider_id` | string | No | Payment provider (default: "stripe") |
| `card` | object | Yes* | Card details (*required for card types) |
| `card.number` | string | Yes | Card number |
| `card.exp_month` | number | Yes | Expiry month (1-12) |
| `card.exp_year` | number | Yes | Expiry year |
| `card.cvc` | string | Yes | Card security code |
| `billing_details` | object | No | Billing information |
| `save_for_future` | boolean | No | Save for future use (default: false) |
| `metadata` | object | No | Additional metadata |

### Response

```http
HTTP/1.1 201 Created
Content-Type: application/json
```

```json
{
  "id": "pm_9876543210",
  "provider_payment_method_id": "pm_1234567890abcdef",
  "payment_type": "credit_card",
  "card_brand": "visa",
  "last_four": "4242",
  "expiry_month": "12",
  "expiry_year": "2025",
  "is_default": false,
  "is_guest": false,
  "guest_email": null,
  "created_at": "2025-01-15T10:30:00Z"
}
```

### Examples

#### Development Testing
```bash
curl -X POST "https://api.example.com/bridge-payment/payment-methods/direct" \
  -H "Authorization: Bearer your_token_here" \
  -H "Content-Type: application/json" \
  -d '{
    "type": "credit_card",
    "provider_id": "stripe",
    "card": {
      "number": "4242424242424242",
      "exp_month": 12,
      "exp_year": 2025,
      "cvc": "123"
    },
    "billing_details": {
      "name": "Test User",
      "email": "test@example.com"
    }
  }'
```

---

## Get Payment Method by ID

Retrieve a specific payment method by its ID.

### Request

```http
GET /bridge-payment/payment-methods/{id}
```

#### Path Parameters

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `id` | string | Yes | Payment method ID |

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
  "id": "pm_1234567890",
  "provider_payment_method_id": "pm_card_visa",
  "payment_type": "credit_card",
  "card_brand": "visa",
  "last_four": "4242",
  "expiry_month": "12",
  "expiry_year": "2025",
  "is_default": false,
  "is_guest": true,
  "guest_email": "customer@example.com",
  "created_at": "2025-01-15T10:30:00Z",
  "updated_at": "2025-01-15T10:30:00Z"
}
```

### Examples

#### Get Payment Method
```bash
curl -X GET "https://api.example.com/bridge-payment/payment-methods/pm_1234567890" \
  -H "Authorization: Bearer your_token_here" \
  -H "Content-Type: application/json"
```

---

## List Customer Payment Methods

Retrieve all payment methods for a specific customer.

### Request

```http
GET /bridge-payment/payment-methods/customer/{customerId}
```

#### Path Parameters

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `customerId` | string | Yes | Customer ID |

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
  "payment_methods": [
    {
      "id": "pm_1234567890",
      "provider_payment_method_id": "pm_card_visa",
      "payment_type": "credit_card",
      "card_brand": "visa",
      "last_four": "4242",
      "expiry_month": "12",
      "expiry_year": "2025",
      "is_default": false,
      "is_guest": true,
      "guest_email": "customer@example.com",
      "created_at": "2025-01-15T10:30:00Z"
    }
  ],
  "total": 1
}
```

### Examples

#### List Customer Payment Methods
```bash
curl -X GET "https://api.example.com/bridge-payment/payment-methods/customer/550e8400-e29b-41d4-a716-446655440000" \
  -H "Authorization: Bearer your_token_here" \
  -H "Content-Type: application/json"
```

---

## Delete Payment Method

Delete a payment method from both the payment provider and local database. **Security requirement**: Both payment method ID and customer ID must be provided.

### Request

```http
DELETE /bridge-payment/payment-methods/{id}
```

#### Path Parameters

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `id` | string | Yes | Payment method ID to delete |

#### Query Parameters

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `customer_id` | string | Yes* | Stripe customer ID (e.g., cus_xxx) |

*Can also be provided in request body

#### Headers

```http
Authorization: Bearer <token>  # Optional for authenticated users
Content-Type: application/json
```

#### Request Body (Alternative)

```json
{
  "customer_id": "cus_SOM4d5lcH8WRu3"
}
```

### Response

```http
HTTP/1.1 200 OK
Content-Type: application/json
```

```json
{
  "message": "Payment method deleted successfully"
}
```

### Examples

#### Delete with Query Parameter (Recommended)
```bash
curl -X DELETE "https://api.example.com/bridge-payment/payment-methods/pm_1234567890?customer_id=cus_SOM4d5lcH8WRu3" \
  -H "Authorization: Bearer your_token_here" \
  -H "Content-Type: application/json"
```

#### Delete with Request Body
```bash
curl -X DELETE "https://api.example.com/bridge-payment/payment-methods/pm_1234567890" \
  -H "Authorization: Bearer your_token_here" \
  -H "Content-Type: application/json" \
  -d '{
    "customer_id": "cus_SOM4d5lcH8WRu3"
  }'
```

---

## Error Responses

### Common Error Codes

| Status Code | Error | Description |
|-------------|-------|-------------|
| 400 | Bad Request | Invalid request data or missing customer_id |
| 401 | Unauthorized | Invalid or missing authentication token |
| 403 | Forbidden | Access denied - not the payment method owner |
| 404 | Not Found | Payment method or customer not found |
| 422 | Validation Error | Request data failed validation |
| 500 | Internal Server Error | Server error |

### Error Response Format

```json
{
  "error": "Validation failed",
  "message": "The request data is invalid",
  "timestamp": "2025-01-15T18:00:00Z",
  "details": [
    {
      "field": "payment_method_token",
      "message": "Payment method token is required"
    }
  ]
}
```

### Example Error Responses

#### Missing Customer ID (Security)
```http
HTTP/1.1 400 Bad Request
Content-Type: application/json
```

```json
{
  "error": "Bad Request",
  "message": "Customer ID is required. Provide it via query parameter (?customer_id=cus_xxx) or in request body.",
  "timestamp": "2025-01-15T18:00:00Z"
}
```

#### Customer Not Found
```http
HTTP/1.1 404 Not Found
Content-Type: application/json
```

```json
{
  "error": "Not Found",
  "message": "Customer not found. Provided ID: cus_invalid123. Use the internal customer ID (UUID), not the provider customer ID.",
  "timestamp": "2025-01-15T18:00:00Z"
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
      "code": "invalid_enum_value",
      "expected": ["credit_card", "bank_account", "paypal"],
      "received": "invalid_type",
      "path": ["type"],
      "message": "Invalid payment method type"
    }
  ]
}
```

---

## Workflow Examples

### Complete Payment Method Flow

#### Step 1: Create Customer
```bash
curl -X POST "https://api.example.com/bridge-payment/customers" \
  -H "Authorization: Bearer your_token_here" \
  -H "Content-Type: application/json" \
  -d '{
    "email": "customer@example.com",
    "name": "John Doe"
  }'
# Response: {"id": "550e8400-e29b-41d4-a716-446655440000", "provider_customer_id": "cus_SOM4d5lcH8WRu3"}
```

#### Step 2: Create Payment Method
```bash
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
# Response: {"id": "pm_1234567890", "provider_payment_method_id": "pm_card_visa"}
```

#### Step 3: Use in Payment
```bash
curl -X POST "https://api.example.com/bridge-payment/payments/intents" \
  -H "Authorization: Bearer your_token_here" \
  -H "Content-Type: application/json" \
  -d '{
    "amount_cents": 2000,
    "currency": "USD",
    "payment_method_id": "pm_1234567890",
    "provider_id": "stripe"
  }'
```

#### Step 4: Delete Payment Method (if needed)
```bash
curl -X DELETE "https://api.example.com/bridge-payment/payment-methods/pm_1234567890?customer_id=cus_SOM4d5lcH8WRu3" \
  -H "Authorization: Bearer your_token_here" \
  -H "Content-Type: application/json"
```

### Guest Checkout Flow

#### Step 1: Create Guest Payment Method
```bash
curl -X POST "https://api.example.com/bridge-payment/payment-methods" \
  -H "Content-Type: application/json" \
  -d '{
    "type": "credit_card",
    "provider_id": "stripe",
    "payment_method_token": "pm_card_visa",
    "billing_details": {
      "name": "Guest User",
      "email": "guest@example.com"
    }
  }'
```

#### Step 2: Use in Guest Payment
```bash
curl -X POST "https://api.example.com/bridge-payment/payments/intents" \
  -H "Content-Type: application/json" \
  -d '{
    "amount_cents": 1500,
    "currency": "USD",
    "payment_method_id": "pm_guest_123",
    "provider_id": "stripe",
    "guest_data": {
      "email": "guest@example.com",
      "name": "Guest User"
    }
  }'
```

---

## Best Practices

### Security
- **Always use tokens**: Prefer token-based creation over direct card data
- **Customer ID requirement**: Always provide customer_id for deletion (security measure)
- **PCI compliance**: Use token-based approach to avoid PCI DSS requirements
- **Access control**: Users can only access their own payment methods

### Payment Method Management
- **Attach to customers**: Always attach payment methods to customers for better organization
- **Handle duplicates**: Check for existing payment methods before creating new ones
- **Cleanup**: Implement cleanup policies for unused payment methods

### Integration
- **Frontend tokens**: Use Stripe Elements or similar to generate secure tokens
- **Provider sync**: Payment methods are synchronized with payment providers
- **Fallback handling**: Handle provider failures gracefully

### Performance
- **Caching**: Cache frequently used payment methods
- **Batch operations**: Use bulk operations for multiple payment method updates
- **Indexing**: Leverage database indexes for customer and provider lookups

---

## Integration with Stripe

### Frontend Token Generation

```javascript
// Using Stripe Elements to create secure tokens
const {token, error} = await stripe.createToken(card, {
  name: 'John Doe',
  address_line1: '123 Main St',
  address_city: 'New York',
  address_state: 'NY',
  address_zip: '10001',
  address_country: 'US'
});

// Use token.id as payment_method_token
const response = await fetch('/bridge-payment/payment-methods', {
  method: 'POST',
  headers: {'Content-Type': 'application/json'},
  body: JSON.stringify({
    type: 'credit_card',
    provider_id: 'stripe',
    payment_method_token: token.id,
    billing_details: {
      name: 'John Doe',
      email: 'john@example.com'
    }
  })
});
```

### Legacy Sources vs Modern Payment Methods

- **Legacy Sources**: Cards and bank accounts using older Stripe API
- **Modern Payment Methods**: New Stripe API supporting more payment types
- **Deletion**: Legacy sources can be deleted immediately, modern payment methods are detached

---

## Rate Limits

- **Authenticated users**: 1000 requests per hour
- **Guest users**: 100 requests per hour per IP
- **Burst limit**: 10 requests per second

Rate limit headers are included in all responses:
```http
X-RateLimit-Limit: 1000
X-RateLimit-Remaining: 999
X-RateLimit-Reset: 1642694400
```