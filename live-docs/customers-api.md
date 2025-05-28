# Customers API Reference

The Customers API allows you to manage customer records for both authenticated users and guest customers. This enables flexible customer management across different user types and integrates seamlessly with payment providers like Stripe.

## Base URL

```
https://your-api-domain.com/bridge-payment/customers
```

## Authentication

- **Authenticated Users**: Include `Authorization: Bearer <token>` header
- **Guest Users**: No authentication required, automatically treated as guest customers

## Customer Types

- **Authenticated Customers**: Linked to registered user accounts
- **Guest Customers**: One-time customers without user accounts

## Endpoints Overview

| Method | Endpoint | Description | Auth Required |
|--------|----------|-------------|---------------|
| POST | `/customers` | Create new customer | Optional |
| GET | `/customers/:id` | Get customer by ID | Optional |
| PUT | `/customers/:id` | Update customer | Optional |
| DELETE | `/customers/:id` | Delete customer | Optional |
| GET | `/customers` | List customers | Optional |

---

## Create Customer

Create a new customer record with the payment provider (Stripe) and in the local database.

### Request

```http
POST /bridge-payment/customers
```

#### Headers

```http
Authorization: Bearer <token>  # Optional for authenticated users
Content-Type: application/json
```

#### Request Body

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `email` | string | Yes | Customer email address |
| `name` | string | Yes | Customer full name |
| `phone` | string | No | Customer phone number |
| `provider_id` | string | No | Payment provider (default: "stripe") |
| `is_guest` | boolean | No | Force guest mode (default: false) |
| `metadata` | object | No | Additional metadata |

### Response

```http
HTTP/1.1 201 Created
Content-Type: application/json
```

```json
{
  "id": "550e8400-e29b-41d4-a716-446655440000",
  "provider_customer_id": "cus_SOM4d5lcH8WRu3",
  "email": "customer@example.com",
  "name": "Maria Garcia",
  "provider_id": "stripe",
  "is_guest": true,
  "created_at": "2025-01-15T10:30:00Z"
}
```

### Examples

#### Authenticated User Customer
```bash
curl -X POST "https://api.example.com/bridge-payment/customers" \
  -H "Authorization: Bearer your_token_here" \
  -H "Content-Type: application/json" \
  -d '{
    "email": "john@example.com",
    "name": "John Doe",
    "phone": "+1-555-123-4567",
    "metadata": {
      "source": "web_app",
      "plan": "premium"
    }
  }'
```

#### Guest Customer
```bash
curl -X POST "https://api.example.com/bridge-payment/customers" \
  -H "Content-Type: application/json" \
  -d '{
    "email": "guest@example.com",
    "name": "Guest User",
    "phone": "+1-555-987-6543",
    "is_guest": true
  }'
```

---

## Get Customer by ID

Retrieve a specific customer by their ID.

### Request

```http
GET /bridge-payment/customers/{id}
```

#### Path Parameters

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `id` | string | Yes | Customer ID (internal UUID) |

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
  "id": "550e8400-e29b-41d4-a716-446655440000",
  "provider_customer_id": "cus_SOM4d5lcH8WRu3",
  "email": "customer@example.com",
  "name": "Maria Garcia",
  "provider_id": "stripe",
  "is_guest": true,
  "created_at": "2025-01-15T10:30:00Z",
  "updated_at": "2025-01-15T10:30:00Z"
}
```

### Examples

#### Get Customer
```bash
curl -X GET "https://api.example.com/bridge-payment/customers/550e8400-e29b-41d4-a716-446655440000" \
  -H "Authorization: Bearer your_token_here" \
  -H "Content-Type: application/json"
```

---

## Update Customer

Update an existing customer's information.

### Request

```http
PUT /bridge-payment/customers/{id}
```

#### Path Parameters

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `id` | string | Yes | Customer ID to update |

#### Headers

```http
Authorization: Bearer <token>  # Optional for authenticated users
Content-Type: application/json
```

#### Request Body

All fields are optional. Only include fields you want to update.

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `email` | string | No | Customer email address |
| `name` | string | No | Customer full name |
| `phone` | string | No | Customer phone number |
| `metadata` | object | No | Additional metadata |

### Response

```http
HTTP/1.1 200 OK
Content-Type: application/json
```

```json
{
  "id": "550e8400-e29b-41d4-a716-446655440000",
  "provider_customer_id": "cus_SOM4d5lcH8WRu3",
  "email": "updated@example.com",
  "name": "Updated Name",
  "provider_id": "stripe",
  "is_guest": true,
  "updated_at": "2025-01-15T11:45:00Z"
}
```

### Examples

#### Update Customer
```bash
curl -X PUT "https://api.example.com/bridge-payment/customers/550e8400-e29b-41d4-a716-446655440000" \
  -H "Authorization: Bearer your_token_here" \
  -H "Content-Type: application/json" \
  -d '{
    "email": "updated@example.com",
    "name": "Updated Name",
    "phone": "+1-555-999-8888"
  }'
```

---

## Delete Customer

Delete a customer from both the payment provider and local database.

### Request

```http
DELETE /bridge-payment/customers/{id}
```

#### Path Parameters

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `id` | string | Yes | Customer ID to delete |

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
  "message": "Customer deleted successfully"
}
```

### Examples

#### Delete Customer
```bash
curl -X DELETE "https://api.example.com/bridge-payment/customers/550e8400-e29b-41d4-a716-446655440000" \
  -H "Authorization: Bearer your_token_here" \
  -H "Content-Type: application/json"
```

---

## List Customers

Retrieve a list of customers. For authenticated users, returns their customers. For guests, returns recent guest customers (limited).

### Request

```http
GET /bridge-payment/customers
```

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
  "customers": [
    {
      "id": "550e8400-e29b-41d4-a716-446655440000",
      "provider_customer_id": "cus_SOM4d5lcH8WRu3",
      "email": "customer@example.com",
      "name": "Maria Garcia",
      "provider_id": "stripe",
      "is_guest": true,
      "created_at": "2025-01-15T10:30:00Z"
    }
  ],
  "total": 1
}
```

### Examples

#### List Authenticated User Customers
```bash
curl -X GET "https://api.example.com/bridge-payment/customers" \
  -H "Authorization: Bearer your_token_here" \
  -H "Content-Type: application/json"
```

#### List Guest Customers (Limited)
```bash
curl -X GET "https://api.example.com/bridge-payment/customers" \
  -H "Content-Type: application/json"
```

---

## Error Responses

### Common Error Codes

| Status Code | Error | Description |
|-------------|-------|-------------|
| 400 | Bad Request | Invalid request data or missing required fields |
| 401 | Unauthorized | Invalid or missing authentication token |
| 403 | Forbidden | Access denied - not the customer owner |
| 404 | Not Found | Customer not found |
| 409 | Conflict | Customer already exists |
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
      "field": "email",
      "message": "Invalid email format"
    }
  ]
}
```

### Example Error Responses

#### Customer Already Exists
```http
HTTP/1.1 409 Conflict
Content-Type: application/json
```

```json
{
  "error": "Conflict",
  "message": "Account already exists",
  "timestamp": "2025-01-15T18:00:00Z",
  "cause": {
    "existing_customer_id": "550e8400-e29b-41d4-a716-446655440000",
    "provider_id": "stripe",
    "is_guest": true,
    "email": "customer@example.com"
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
      "code": "invalid_string",
      "expected": "string",
      "received": "undefined",
      "path": ["name"],
      "message": "Name is required"
    },
    {
      "code": "invalid_string",
      "expected": "string",
      "received": "invalid",
      "path": ["email"],
      "message": "Invalid email format"
    }
  ]
}
```

---

## Workflow Examples

### E-commerce Customer Creation Flow

#### Step 1: Check if Customer Exists
```bash
# Try to create customer - will return 409 if exists
curl -X POST "https://api.example.com/bridge-payment/customers" \
  -H "Content-Type: application/json" \
  -d '{
    "email": "customer@example.com",
    "name": "John Doe"
  }'
```

#### Step 2: Handle Existing Customer
```bash
# If customer exists, use the existing customer ID from error response
# existing_customer_id: "550e8400-e29b-41d4-a716-446655440000"
```

#### Step 3: Proceed with Payment Flow
```bash
# Use customer ID for payment methods and payments
curl -X POST "https://api.example.com/bridge-payment/payment-methods" \
  -d '{
    "customer_id": "550e8400-e29b-41d4-a716-446655440000",
    "type": "credit_card",
    "payment_method_token": "pm_card_visa"
  }'
```

### Guest to Registered User Conversion

#### Step 1: Create Guest Customer
```bash
curl -X POST "https://api.example.com/bridge-payment/customers" \
  -H "Content-Type: application/json" \
  -d '{
    "email": "guest@example.com",
    "name": "Guest User",
    "is_guest": true
  }'
```

#### Step 2: User Registers
```bash
# After user registers, create authenticated customer
curl -X POST "https://api.example.com/bridge-payment/customers" \
  -H "Authorization: Bearer new_user_token" \
  -H "Content-Type: application/json" \
  -d '{
    "email": "guest@example.com",
    "name": "Now Registered User"
  }'
```

#### Step 3: Migrate Guest Data
```bash
# Use guest conversion API to migrate payment methods and data
curl -X POST "https://api.example.com/bridge-payment/guest/convert" \
  -H "Authorization: Bearer new_user_token" \
  -H "Content-Type: application/json" \
  -d '{
    "guest_email": "guest@example.com"
  }'
```

---

## Best Practices

### Customer Management
- **Unique identification**: Use email + provider_id + is_guest combination for uniqueness
- **Handle duplicates**: Always handle 409 Conflict responses when creating customers
- **Guest conversion**: Plan for guest-to-registered user conversion flows

### Security
- **Access control**: Users can only access their own customer records
- **Guest limitations**: Guest customer listing is limited for privacy
- **Provider sync**: Customer data is synchronized with payment providers

### Data Integrity
- **Provider sync**: All customer operations sync with Stripe
- **Metadata usage**: Use metadata for application-specific data
- **Cleanup**: Consider implementing cleanup policies for old guest customers

### Performance
- **Caching**: Cache frequently accessed customer data
- **Batch operations**: Use bulk operations for multiple customer updates
- **Indexing**: Leverage database indexes for email and provider lookups

---

## Integration with Payment Providers

### Stripe Integration

The customer data is automatically synchronized with Stripe:

```javascript
// Customer creation in Stripe
const stripeCustomer = await stripe.customers.create({
  email: customer.email,
  name: customer.name,
  phone: customer.phone,
  metadata: customer.metadata
});
```

### Provider Customer ID Mapping

- **Internal ID**: UUID used in our system (`550e8400-e29b-41d4-a716-446655440000`)
- **Provider ID**: Stripe customer ID (`cus_SOM4d5lcH8WRu3`)
- **Dual support**: APIs accept both IDs for convenience

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