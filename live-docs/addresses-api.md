# Addresses API Reference

The Addresses API allows you to manage billing and shipping addresses for both authenticated users and guest customers. This enables flexible checkout flows and address management across different user types.

## Base URL

```
https://your-api-domain.com/bridge-payment/addresses
```

## Authentication

- **Authenticated Users**: Include `Authorization: Bearer <token>` header
- **Guest Users**: No authentication required, but `guest_email` parameter is required for access control

## Address Types

- `billing` - Billing address only
- `shipping` - Shipping address only
- `both` - Can be used for both billing and shipping

## Endpoints Overview

| Method | Endpoint | Description | Auth Required |
|--------|----------|-------------|---------------|
| GET | `/addresses` | List addresses | Optional |
| GET | `/addresses/:id` | Get address by ID | Optional |
| POST | `/addresses` | Create new address | Optional |
| PUT | `/addresses/:id` | Update address | Optional |
| DELETE | `/addresses/:id` | Delete address | Optional |

---

## List Addresses

Retrieve a list of addresses for the authenticated user or guest.

### Request

```http
GET /bridge-payment/addresses
```

#### Query Parameters

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `address_type` | string | No | Filter by type: `billing`, `shipping`, `both` |
| `guest_email` | string | No* | Required for guest users |
| `limit` | integer | No | Number of results (default: 50, max: 100) |
| `offset` | integer | No | Pagination offset (default: 0) |

*Required when not authenticated

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
  "addresses": [
    {
      "id": "addr_1234567890",
      "user_id": "user_123",
      "organization_id": null,
      "address_type": "billing",
      "is_default": true,
      "name": "John Doe",
      "line1": "123 Main Street",
      "line2": "Apt 4B",
      "city": "New York",
      "state": "NY",
      "postal_code": "10001",
      "country": "US",
      "phone": "+1-555-123-4567",
      "email": "john@example.com",
      "is_guest": false,
      "guest_email": null,
      "guest_name": null,
      "created_at": "2024-01-15T10:30:00Z",
      "updated_at": "2024-01-15T10:30:00Z"
    }
  ],
  "total": 1,
  "limit": 50,
  "offset": 0
}
```

### Examples

#### Authenticated User
```bash
curl -X GET "https://api.example.com/bridge-payment/addresses?address_type=billing" \
  -H "Authorization: Bearer your_token_here" \
  -H "Content-Type: application/json"
```

#### Guest User
```bash
curl -X GET "https://api.example.com/bridge-payment/addresses?guest_email=guest@example.com&address_type=shipping" \
  -H "Content-Type: application/json"
```

---

## Get Address by ID

Retrieve a specific address by its ID.

### Request

```http
GET /bridge-payment/addresses/{id}
```

#### Path Parameters

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `id` | string | Yes | Address ID |

#### Query Parameters

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `guest_email` | string | No* | Required for guest addresses |

*Required when accessing guest addresses without authentication

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
  "id": "addr_1234567890",
  "user_id": null,
  "organization_id": null,
  "address_type": "both",
  "is_default": true,
  "name": "Jane Guest",
  "line1": "456 Oak Avenue",
  "line2": null,
  "city": "Los Angeles",
  "state": "CA",
  "postal_code": "90210",
  "country": "US",
  "phone": "+1-555-987-6543",
  "email": "jane@example.com",
  "is_guest": true,
  "guest_email": "jane@example.com",
  "guest_name": "Jane Guest",
  "created_at": "2024-01-15T14:20:00Z",
  "updated_at": "2024-01-15T14:20:00Z"
}
```

### Examples

#### Authenticated User Address
```bash
curl -X GET "https://api.example.com/bridge-payment/addresses/addr_1234567890" \
  -H "Authorization: Bearer your_token_here" \
  -H "Content-Type: application/json"
```

#### Guest Address
```bash
curl -X GET "https://api.example.com/bridge-payment/addresses/addr_1234567890?guest_email=jane@example.com" \
  -H "Content-Type: application/json"
```

---

## Create Address

Create a new address for an authenticated user or guest.

### Request

```http
POST /bridge-payment/addresses
```

#### Headers

```http
Authorization: Bearer <token>  # Optional for authenticated users
Content-Type: application/json
```

#### Request Body

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `address_type` | string | Yes | `billing`, `shipping`, or `both` |
| `name` | string | Yes | Full name for the address |
| `line1` | string | Yes | Address line 1 |
| `line2` | string | No | Address line 2 |
| `city` | string | Yes | City |
| `state` | string | No | State/Province |
| `postal_code` | string | Yes | Postal/ZIP code |
| `country` | string | Yes | 2-letter ISO country code |
| `phone` | string | No | Phone number |
| `email` | string | No | Email address |
| `is_default` | boolean | No | Set as default address (default: false) |
| `guest_email` | string | No* | Required for guest users |
| `guest_name` | string | No | Display name for guest |

*Required when not authenticated

### Response

```http
HTTP/1.1 201 Created
Content-Type: application/json
```

```json
{
  "id": "addr_9876543210",
  "user_id": "user_123",
  "organization_id": null,
  "address_type": "billing",
  "is_default": false,
  "name": "John Doe",
  "line1": "789 Pine Street",
  "line2": "Suite 100",
  "city": "San Francisco",
  "state": "CA",
  "postal_code": "94102",
  "country": "US",
  "phone": "+1-555-456-7890",
  "email": "john@example.com",
  "is_guest": false,
  "guest_email": null,
  "guest_name": null,
  "created_at": "2024-01-15T16:45:00Z",
  "updated_at": "2024-01-15T16:45:00Z"
}
```

### Examples

#### Authenticated User
```bash
curl -X POST "https://api.example.com/bridge-payment/addresses" \
  -H "Authorization: Bearer your_token_here" \
  -H "Content-Type: application/json" \
  -d '{
    "address_type": "billing",
    "name": "John Doe",
    "line1": "789 Pine Street",
    "line2": "Suite 100",
    "city": "San Francisco",
    "state": "CA",
    "postal_code": "94102",
    "country": "US",
    "phone": "+1-555-456-7890",
    "email": "john@example.com",
    "is_default": true
  }'
```

#### Guest User
```bash
curl -X POST "https://api.example.com/bridge-payment/addresses" \
  -H "Content-Type: application/json" \
  -d '{
    "address_type": "shipping",
    "name": "Jane Guest",
    "line1": "321 Elm Street",
    "city": "Chicago",
    "state": "IL",
    "postal_code": "60601",
    "country": "US",
    "guest_email": "jane@example.com",
    "guest_name": "Jane Guest",
    "is_default": true
  }'
```

---

## Update Address

Update an existing address. Only the address owner can update it.

### Request

```http
PUT /bridge-payment/addresses/{id}
```

#### Path Parameters

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `id` | string | Yes | Address ID to update |

#### Query Parameters

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `guest_email` | string | No* | Required for guest addresses |

*Required when updating guest addresses without authentication

#### Headers

```http
Authorization: Bearer <token>  # Optional for authenticated users
Content-Type: application/json
```

#### Request Body

All fields are optional. Only include fields you want to update.

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `address_type` | string | No | `billing`, `shipping`, or `both` |
| `name` | string | No | Full name for the address |
| `line1` | string | No | Address line 1 |
| `line2` | string | No | Address line 2 |
| `city` | string | No | City |
| `state` | string | No | State/Province |
| `postal_code` | string | No | Postal/ZIP code |
| `country` | string | No | 2-letter ISO country code |
| `phone` | string | No | Phone number |
| `email` | string | No | Email address |
| `is_default` | boolean | No | Set as default address |
| `guest_name` | string | No | Display name for guest |

### Response

```http
HTTP/1.1 200 OK
Content-Type: application/json
```

```json
{
  "id": "addr_9876543210",
  "user_id": "user_123",
  "organization_id": null,
  "address_type": "both",
  "is_default": true,
  "name": "John Doe",
  "line1": "789 Pine Street",
  "line2": "Suite 200",
  "city": "San Francisco",
  "state": "CA",
  "postal_code": "94102",
  "country": "US",
  "phone": "+1-555-456-7890",
  "email": "john.doe@example.com",
  "is_guest": false,
  "guest_email": null,
  "guest_name": null,
  "created_at": "2024-01-15T16:45:00Z",
  "updated_at": "2024-01-15T17:30:00Z"
}
```

### Examples

#### Update Authenticated User Address
```bash
curl -X PUT "https://api.example.com/bridge-payment/addresses/addr_9876543210" \
  -H "Authorization: Bearer your_token_here" \
  -H "Content-Type: application/json" \
  -d '{
    "line2": "Suite 200",
    "email": "john.doe@example.com",
    "is_default": true
  }'
```

#### Update Guest Address
```bash
curl -X PUT "https://api.example.com/bridge-payment/addresses/addr_1234567890?guest_email=jane@example.com" \
  -H "Content-Type: application/json" \
  -d '{
    "phone": "+1-555-999-8888",
    "address_type": "both"
  }'
```

---

## Delete Address

Delete an existing address. Only the address owner can delete it.

### Request

```http
DELETE /bridge-payment/addresses/{id}
```

#### Path Parameters

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `id` | string | Yes | Address ID to delete |

#### Query Parameters

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `guest_email` | string | No* | Required for guest addresses |

*Required when deleting guest addresses without authentication

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
  "message": "Address deleted successfully"
}
```

### Examples

#### Delete Authenticated User Address
```bash
curl -X DELETE "https://api.example.com/bridge-payment/addresses/addr_9876543210" \
  -H "Authorization: Bearer your_token_here" \
  -H "Content-Type: application/json"
```

#### Delete Guest Address
```bash
curl -X DELETE "https://api.example.com/bridge-payment/addresses/addr_1234567890?guest_email=jane@example.com" \
  -H "Content-Type: application/json"
```

---

## Error Responses

### Common Error Codes

| Status Code | Error | Description |
|-------------|-------|-------------|
| 400 | Bad Request | Invalid request data or missing required fields |
| 401 | Unauthorized | Invalid or missing authentication token |
| 403 | Forbidden | Access denied - not the address owner |
| 404 | Not Found | Address not found |
| 422 | Validation Error | Request data failed validation |
| 500 | Internal Server Error | Server error |

### Error Response Format

```json
{
  "error": "Validation failed",
  "message": "The request data is invalid",
  "timestamp": "2024-01-15T18:00:00Z",
  "details": [
    {
      "field": "country",
      "message": "Country must be a 2-letter ISO code"
    }
  ]
}
```

### Example Error Responses

#### Missing Guest Email
```http
HTTP/1.1 400 Bad Request
Content-Type: application/json
```

```json
{
  "error": "Bad Request",
  "message": "Either authentication or guest_email parameter is required",
  "timestamp": "2024-01-15T18:00:00Z"
}
```

#### Access Denied
```http
HTTP/1.1 403 Forbidden
Content-Type: application/json
```

```json
{
  "error": "Forbidden",
  "message": "Access denied. Guest email verification required.",
  "timestamp": "2024-01-15T18:00:00Z"
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
  "timestamp": "2024-01-15T18:00:00Z",
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
      "received": "undefined",
      "path": ["country"],
      "message": "Country must be a 2-letter ISO code"
    }
  ]
}
```

---

## Workflow Examples

### Authenticated User Flow

#### 1. Create Billing Address
```bash
# Create a billing address for authenticated user
curl -X POST "https://api.example.com/bridge-payment/addresses" \
  -H "Authorization: Bearer your_token_here" \
  -H "Content-Type: application/json" \
  -d '{
    "address_type": "billing",
    "name": "John Doe",
    "line1": "123 Main Street",
    "city": "New York",
    "state": "NY",
    "postal_code": "10001",
    "country": "US",
    "is_default": true
  }'
```

#### 2. Create Shipping Address
```bash
# Create a separate shipping address
curl -X POST "https://api.example.com/bridge-payment/addresses" \
  -H "Authorization: Bearer your_token_here" \
  -H "Content-Type: application/json" \
  -d '{
    "address_type": "shipping",
    "name": "John Doe",
    "line1": "456 Work Plaza",
    "city": "San Francisco",
    "state": "CA",
    "postal_code": "94102",
    "country": "US",
    "is_default": true
  }'
```

#### 3. List All Addresses
```bash
# Get all addresses for the user
curl -X GET "https://api.example.com/bridge-payment/addresses" \
  -H "Authorization: Bearer your_token_here" \
  -H "Content-Type: application/json"
```

### Guest User Flow

#### 1. Create Guest Address
```bash
# Create address for guest checkout
curl -X POST "https://api.example.com/bridge-payment/addresses" \
  -H "Content-Type: application/json" \
  -d '{
    "address_type": "both",
    "name": "Jane Guest",
    "line1": "789 Guest Street",
    "city": "Chicago",
    "state": "IL",
    "postal_code": "60601",
    "country": "US",
    "guest_email": "jane@example.com",
    "guest_name": "Jane Guest",
    "is_default": true
  }'
```

#### 2. Retrieve Guest Addresses
```bash
# Get addresses for guest user
curl -X GET "https://api.example.com/bridge-payment/addresses?guest_email=jane@example.com" \
  -H "Content-Type: application/json"
```

#### 3. Update Guest Address
```bash
# Update guest address
curl -X PUT "https://api.example.com/bridge-payment/addresses/addr_123?guest_email=jane@example.com" \
  -H "Content-Type: application/json" \
  -d '{
    "phone": "+1-555-123-4567"
  }'
```

### E-commerce Checkout Flow

#### Step 1: Check Existing Addresses
```bash
# For authenticated users
curl -X GET "https://api.example.com/bridge-payment/addresses?address_type=billing" \
  -H "Authorization: Bearer user_token"

# For guests - skip this step
```

#### Step 2: Create/Select Billing Address
```bash
# If no default billing address exists, create one
curl -X POST "https://api.example.com/bridge-payment/addresses" \
  -H "Authorization: Bearer user_token" \
  -d '{
    "address_type": "billing",
    "name": "Customer Name",
    "line1": "123 Billing St",
    "city": "City",
    "postal_code": "12345",
    "country": "US",
    "is_default": true
  }'
```

#### Step 3: Create/Select Shipping Address
```bash
# Create shipping address (can be same as billing)
curl -X POST "https://api.example.com/bridge-payment/addresses" \
  -H "Authorization: Bearer user_token" \
  -d '{
    "address_type": "shipping",
    "name": "Customer Name",
    "line1": "456 Shipping Ave",
    "city": "City",
    "postal_code": "12345",
    "country": "US",
    "is_default": true
  }'
```

---

## Best Practices

### Security
- **Always validate ownership**: The API automatically ensures users can only access their own addresses
- **Use HTTPS**: All API calls should be made over HTTPS in production
- **Guest email verification**: For guest addresses, always include the `guest_email` parameter for access control

### Default Address Management
- **One default per type**: Only one address can be default for each `address_type` per user/guest
- **Automatic management**: Setting `is_default: true` automatically unsets other default addresses of the same type
- **Recommended flow**: Always set the first address as default

### Address Types
- **`billing`**: Use for payment processing and invoicing
- **`shipping`**: Use for order delivery
- **`both`**: Use when the same address serves both purposes (common for personal orders)

### Guest Checkout
- **Email as identifier**: Use `guest_email` to group and access guest addresses
- **Temporary storage**: Consider implementing cleanup policies for old guest addresses
- **Conversion ready**: Guest addresses can be easily converted to user addresses when guests register

### Performance
- **Pagination**: Use `limit` and `offset` for large address lists
- **Filtering**: Use `address_type` parameter to filter results
- **Caching**: Consider caching default addresses for frequent access

### Data Validation
- **Country codes**: Always use 2-letter ISO country codes (e.g., "US", "CA", "GB")
- **Required fields**: Ensure `name`, `line1`, `city`, `postal_code`, and `country` are always provided
- **Phone format**: Use international format with country code (e.g., "+1-555-123-4567")

---

## Integration with Stripe

The addresses created through this API can be seamlessly integrated with Stripe for payment processing:

### Billing Address for Payments
```javascript
// Use address data in Stripe payment intent
const billingAddress = {
  name: address.name,
  address: {
    line1: address.line1,
    line2: address.line2,
    city: address.city,
    state: address.state,
    postal_code: address.postal_code,
    country: address.country
  }
};
```

### Customer Creation with Address
```javascript
// Create Stripe customer with default billing address
const customer = await stripe.customers.create({
  email: user.email,
  name: address.name,
  address: {
    line1: address.line1,
    line2: address.line2,
    city: address.city,
    state: address.state,
    postal_code: address.postal_code,
    country: address.country
  }
});
```

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