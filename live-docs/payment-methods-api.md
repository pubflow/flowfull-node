# Payment Methods API Documentation

The Payment Methods API provides comprehensive payment method management functionality for both authenticated users and guest users with token-based access. This API supports secure tokenization, storage, and retrieval of payment information with advanced filtering and pagination.

## Base URL

```
https://your-domain.com/bridge-payment/payment-methods
```

## Authentication

- **Authenticated Users**: Include `Authorization: Bearer <token>` header
- **Guest Users with Tokens**: Use `?token=<guest_token>` query parameter for payment method access
- **Anonymous Guest Users**: No authentication required for payment method creation with guest data

## Security Models

### Token-Based (RECOMMENDED - SECURE)
- Use payment method tokens from frontend (Stripe Elements, etc.)
- Never handle raw card data on your server
- PCI DSS compliant by design

### Direct Card Data (DEVELOPMENT ONLY)
- Handle raw card data directly
- Requires PCI DSS compliance
- Only use for development/testing

## Quick Reference

| Method | Endpoint | Description | Auth Required |
|--------|----------|-------------|---------------|
| GET | `/payment-methods` | List user payment methods | Yes* |
| GET | `/payment-methods?token=<token>` | List guest payment methods with token | Token Required |
| GET | `/payment-methods/:id` | Get payment method by ID | Yes* |
| GET | `/payment-methods/:id?token=<token>` | Get guest payment method by ID with token | Token Required |
| POST | `/payment-methods` | Create payment method (token-based) | Optional |
| POST | `/payment-methods/direct` | Create payment method (direct - dev only) | Optional |
| PUT | `/payment-methods/:id` | Update payment method (local fields only) | Yes* |
| PUT | `/payment-methods/:id?token=<token>` | Update guest payment method with token | Token Required |
| GET | `/payment-methods/customer/:customerId` | List customer payment methods | Optional |
| DELETE | `/payment-methods/:id` | Delete payment method | Optional |

---

## Billing Address Integration (NEW)

The Payment Methods API now supports optional billing address integration, allowing you to associate payment methods with existing billing addresses for better organization and user experience.

### How Billing Address Integration Works

1. **Optional Association**: Payment methods can optionally be linked to existing billing addresses
2. **Address Reuse**: Users can reuse saved addresses for multiple payment methods
3. **Automatic Merging**: When both `billing_address_id` and `billing_details` are provided, they are intelligently merged
4. **Access Control**: Users can only associate addresses they own (user_id match for authenticated users, guest_email match for guests)

### Benefits

- **Reduced Data Entry**: Users don't need to re-enter address information
- **Consistency**: Ensures address information is consistent across payment methods
- **Organization**: Better organization of payment methods by billing address
- **User Experience**: Streamlined checkout and payment method management

### Usage Patterns

#### Pattern 1: Use Existing Address Only
```json
{
  "billing_address_id": "addr_billing_123",
  "billing_details": {
    "name": "John Doe",
    "email": "john@example.com"
  }
}
```

#### Pattern 2: Create New Address Inline
```json
{
  "billing_details": {
    "name": "John Doe",
    "email": "john@example.com",
    "address": {
      "line1": "123 Main St",
      "city": "New York",
      "postal_code": "10001",
      "country": "US"
    }
  }
}
```

#### Pattern 3: Override Address Details
```json
{
  "billing_address_id": "addr_billing_123",
  "billing_details": {
    "name": "Different Name",
    "email": "different@example.com",
    "phone": "+1-555-999-8888"
  }
}
```

### Response Fields

When a payment method is associated with a billing address, the response includes:

- `billing_address_id`: UUID of the associated billing address
- `guest_name`: Name from guest payment methods (for guest users)
- `metadata`: Custom metadata including optional `nickname` for card aliases

---

## Card Nicknames and Aliases (NEW)

The Payment Methods API supports custom nicknames and aliases for payment methods through the `metadata` field, making it easier for users to identify and manage their saved cards.

### How Card Nicknames Work

1. **Metadata Storage**: Nicknames are stored in the `metadata.nickname` field
2. **User-Friendly Names**: Users can assign meaningful names like "My primary card", "Travel card", "Business expenses"
3. **Optional Feature**: Nicknames are completely optional and don't affect payment processing
4. **Flexible Metadata**: The `metadata` field supports additional custom properties for categorization

### Nickname Examples

#### Common Nickname Patterns
```json
{
  "metadata": {
    "nickname": "My primary card"
  }
}
```

#### Advanced Metadata Usage
```json
{
  "metadata": {
    "nickname": "Business Travel Card",
    "category": "business",
    "department": "sales",
    "notes": "For client meetings and travel expenses",
    "spending_limit": "monthly"
  }
}
```

### Frontend Integration

#### Display Nicknames in UI
```javascript
// Display payment method with nickname
const displayName = paymentMethod.metadata?.nickname ||
  `${paymentMethod.card_brand} •••• ${paymentMethod.last_four}`;

// Example: "My primary card" or "Visa •••• 4242"
```

#### Update Nicknames
```javascript
// Update payment method nickname
await fetch(`/bridge-payment/payment-methods/${paymentMethodId}`, {
  method: 'PUT',
  headers: {
    'Authorization': `Bearer ${sessionId}`,
    'Content-Type': 'application/json'
  },
  body: JSON.stringify({
    metadata: {
      nickname: "Updated card name"
    }
  })
});
```

### Benefits

- **Better UX**: Users can easily identify their cards
- **Organization**: Categorize cards by purpose (business, personal, travel)
- **Personalization**: Users can use names that make sense to them
- **Flexibility**: Support for additional metadata beyond just nicknames

---

## Guest Token Authentication

For guest users who need to access their payment methods after checkout, the API supports token-based authentication. This allows guests to view and manage their payment information without creating a full account.

### How Guest Tokens Work

1. **Token Generation**: Guest tokens are generated by your authentication backend
2. **Token Validation**: The API validates tokens with your backend service
3. **Payment Method Access**: Valid tokens allow access to payment methods associated with the guest's email
4. **Caching**: Validated tokens are cached for performance (configurable timeout)

### Configuration

The guest token system requires these environment variables:

```env
# Backend authentication service URL
FLOWLESS_API_URL=https://your-auth-backend.com

# Token validation timeout (milliseconds)
AUTH_TIMEOUT=25000

# Response format mode
ROW_MODE=false
```

### Backend Integration

Your authentication backend should provide an endpoint:

```http
GET /auth/token/validate?token=<guest_token>
```

**Expected Response:**
```json
{
  "success": true,
  "user": {
    "id": "guest_user_123",
    "email": "guest@example.com",
    "name": "Guest User",
    "isVerified": true
  },
  "tokenType": "token_login",
  "token_id": "tok_abc123",
  "expires_at": "2025-06-05T03:34:29.000Z"
}
```

---

## List User Payment Methods

Retrieve a list of payment methods for authenticated users or guest users with tokens.

### Request

```http
GET /bridge-payment/payment-methods
GET /bridge-payment/payment-methods?token=<guest_token>
```

#### Query Parameters

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `token` | string | No* | Guest access token (*required for guest users) |
| `page` | number | No | Page number (default: 1) |
| `limit` | number | No | Number of results per page (default: 10, max: 50) |
| `payment_type` | string | No | Filter by payment type: `card`, `bank_account`, etc. |
| `card_brand` | string | No | Filter by card brand: `visa`, `mastercard`, `amex`, etc. |
| `search` | string | No | Search in payment method details |
| `orderBy` | string | No | Sort field: `created_at`, `payment_type`, `card_brand`, `last_four` |
| `orderDir` | string | No | Sort direction: `asc` or `desc` (default: `desc`) |

#### Headers

```http
# Option 1: Authorization Bearer (standard)
Authorization: Bearer <sessionId>

# Option 2: Custom session header
X-Session-ID: <sessionId>

# Option 3: Query parameter (alternative)
# Use ?session_id=<sessionId> instead of headers

Content-Type: application/json
```

### Response Format

The API supports two response formats controlled by the `ROW_MODE` environment variable:

#### Standard Format (ROW_MODE=false, default)

```http
HTTP/1.1 200 OK
Content-Type: application/json
```

```json
{
  "success": true,
  "data": [
    {
      "id": "pm_1234567890",
      "provider_payment_method_id": "pm_stripe_abc123",
      "payment_type": "card",
      "card_brand": "visa",
      "last_four": "4242",
      "expiry_month": "12",
      "expiry_year": "2025",
      "is_default": true,
      "is_guest": true,
      "guest_email": "guest@example.com",
      "guest_name": "John Doe",
      "billing_address_id": "addr_billing_123",
      "metadata": {
        "nickname": "My primary card",
        "category": "business"
      },
      "created_at": "2025-01-15T10:30:00Z",
      "updated_at": "2025-01-15T10:35:00Z"
    }
  ],
  "meta": {
    "query": "",
    "page": 1,
    "limit": 10,
    "total": 25,
    "hasMore": true,
    "orderBy": "created_at",
    "orderDir": "desc"
  },
  "user_context": {
    "authenticated": true,
    "user_id": "user_123",
    "user_type": "guest",
    "user_email": "guest@example.com",
    "search_method": "guest_email"
  }
}
```

### Examples

#### Authenticated User Payment Methods (Multiple Auth Methods)
```bash
# Method 1: Authorization Bearer
curl -X GET "https://api.example.com/bridge-payment/payment-methods?page=1&limit=20&payment_type=card" \
  -H "Authorization: Bearer your_session_id_here" \
  -H "Content-Type: application/json"

# Method 2: X-Session-ID Header
curl -X GET "https://api.example.com/bridge-payment/payment-methods?page=1&limit=20&payment_type=card" \
  -H "X-Session-ID: your_session_id_here" \
  -H "Content-Type: application/json"

# Method 3: Query Parameter
curl -X GET "https://api.example.com/bridge-payment/payment-methods?page=1&limit=20&payment_type=card&session_id=your_session_id_here" \
  -H "Content-Type: application/json"
```

#### Guest User Payment Methods with Token
```bash
curl -X GET "https://api.example.com/bridge-payment/payment-methods?token=guest_token_here&page=1&limit=10" \
  -H "Content-Type: application/json"
```

### Error Responses

#### Authentication Required
```http
HTTP/1.1 401 Unauthorized
Content-Type: application/json
```

```json
{
  "error": "Authentication Required",
  "details": "Authentication required to view payment methods"
}
```

---

## Get Payment Method by ID

Retrieve a specific payment method by its ID with ownership verification.

### Request

```http
GET /bridge-payment/payment-methods/:id
GET /bridge-payment/payment-methods/:id?token=<guest_token>
```

#### Path Parameters

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `id` | string | Yes | Payment method ID |

#### Query Parameters

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `token` | string | No* | Guest access token (*required for guest users) |

### Response

```http
HTTP/1.1 200 OK
Content-Type: application/json
```

```json
{
  "success": true,
  "data": {
    "id": "pm_1234567890",
    "provider_payment_method_id": "pm_stripe_abc123",
    "payment_type": "card",
    "card_brand": "visa",
    "last_four": "4242",
    "expiry_month": "12",
    "expiry_year": "2025",
    "is_default": true,
    "is_guest": true,
    "guest_email": "guest@example.com",
    "created_at": "2025-01-15T10:30:00Z",
    "updated_at": "2025-01-15T10:35:00Z"
  },
  "meta": {
    "page": 1,
    "limit": 1,
    "total": 1
  },
  "user_context": {
    "authenticated": true,
    "user_id": "user_123",
    "user_type": "guest",
    "user_email": "guest@example.com",
    "access_method": "guest_token_access",
    "is_owner": true,
    "is_admin": false
  }
}
```

### Examples

#### Get Payment Method for Authenticated User
```bash
curl -X GET "https://api.example.com/bridge-payment/payment-methods/pm_1234567890" \
  -H "Authorization: Bearer your_session_id_here" \
  -H "Content-Type: application/json"
```

#### Get Payment Method for Guest User with Token
```bash
curl -X GET "https://api.example.com/bridge-payment/payment-methods/pm_1234567890?token=guest_token_here" \
  -H "Content-Type: application/json"
```

---

## Update Payment Method (Local Fields Only)

Update a payment method's local fields without affecting the payment provider. This endpoint allows updating metadata, default status, and billing address associations while maintaining provider sync integrity.

### Request

```http
PUT /bridge-payment/payment-methods/:id
PUT /bridge-payment/payment-methods/:id?token=<guest_token>
```

#### Path Parameters

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `id` | string | Yes | Payment method ID to update |

#### Query Parameters

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `token` | string | No* | Guest access token (*required for guest users) |

#### Headers

```http
# Option 1: Authorization Bearer (standard)
Authorization: Bearer <sessionId>

# Option 2: Custom session header
X-Session-ID: <sessionId>

# Option 3: Query parameter (alternative)
# Use ?session_id=<sessionId> instead of headers

Content-Type: application/json
```

#### Request Body

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `is_default` | boolean | No | Set as default payment method |
| `billing_address_id` | string | No | UUID of billing address to associate |
| `metadata` | object | No | Custom metadata key-value pairs |

**Note**: Only local fields can be updated. Provider-specific fields like `expiry_month`, `expiry_year`, or `card_brand` require provider synchronization (see Provider Sync documentation).

### Response

```http
HTTP/1.1 200 OK
Content-Type: application/json
```

```json
{
  "success": true,
  "data": {
    "id": "pm_1234567890",
    "provider_payment_method_id": "pm_stripe_abc123",
    "payment_type": "card",
    "card_brand": "visa",
    "last_four": "4242",
    "expiry_month": "12",
    "expiry_year": "2025",
    "is_default": true,
    "is_guest": true,
    "guest_email": "guest@example.com",
    "created_at": "2025-01-15T10:30:00Z",
    "updated_at": "2025-01-15T11:45:00Z"
  },
  "meta": {
    "page": 1,
    "limit": 1,
    "total": 1
  },
  "user_context": {
    "authenticated": true,
    "user_id": "user_123",
    "user_type": "guest",
    "user_email": "guest@example.com",
    "access_method": "guest_token_access",
    "is_owner": true,
    "is_admin": false,
    "updated_fields": ["is_default", "metadata"]
  }
}
```

### Examples

#### Set as Default Payment Method
```bash
curl -X PUT "https://api.example.com/bridge-payment/payment-methods/pm_1234567890" \
  -H "Authorization: Bearer your_token_here" \
  -H "Content-Type: application/json" \
  -d '{
    "is_default": true
  }'
```

#### Associate Billing Address
```bash
curl -X PUT "https://api.example.com/bridge-payment/payment-methods/pm_1234567890" \
  -H "Authorization: Bearer your_token_here" \
  -H "Content-Type: application/json" \
  -d '{
    "billing_address_id": "addr_billing_123"
  }'
```

#### Update Metadata
```bash
curl -X PUT "https://api.example.com/bridge-payment/payment-methods/pm_1234567890" \
  -H "Authorization: Bearer your_token_here" \
  -H "Content-Type: application/json" \
  -d '{
    "metadata": {
      "nickname": "My primary card",
      "category": "business",
      "notes": "Company credit card"
    }
  }'
```

#### Guest User Update with Token
```bash
curl -X PUT "https://api.example.com/bridge-payment/payment-methods/pm_guest_123?token=guest_token_here" \
  -H "Content-Type: application/json" \
  -d '{
    "is_default": true,
    "metadata": {
      "nickname": "Guest checkout card"
    }
  }'
```

#### Multiple Fields Update
```bash
curl -X PUT "https://api.example.com/bridge-payment/payment-methods/pm_1234567890" \
  -H "Authorization: Bearer your_token_here" \
  -H "Content-Type: application/json" \
  -d '{
    "is_default": true,
    "billing_address_id": "addr_billing_456",
    "metadata": {
      "nickname": "Updated primary card",
      "last_updated_by": "user_interface"
    }
  }'
```

### Access Control

- **Authenticated Users**: Can only update their own payment methods (user_id match)
- **Guest Users with Tokens**: Can only update payment methods where guest_email matches their token email
- **Admin Users**: Can update any payment method
- **Anonymous Users**: Cannot update payment methods

### Default Payment Method Logic

- **Single Default**: Only one payment method can be default per user/guest
- **Auto-unset**: Setting `is_default: true` automatically unsets other default payment methods
- **User Scope**: Default logic applies per user_id for authenticated users
- **Guest Scope**: Default logic applies per guest_email for guest users

### Error Responses

#### Validation Error
```http
HTTP/1.1 400 Bad Request
Content-Type: application/json
```

```json
{
  "error": "Validation Error",
  "details": "Invalid request data",
  "validation_errors": [
    {
      "field": "billing_address_id",
      "message": "Invalid UUID format"
    }
  ]
}
```

#### Access Denied
```http
HTTP/1.1 403 Forbidden
Content-Type: application/json
```

```json
{
  "error": "Access Denied",
  "details": "Insufficient privileges to update this payment method"
}
```

#### Payment Method Not Found
```http
HTTP/1.1 404 Not Found
Content-Type: application/json
```

```json
{
  "error": "Not Found",
  "details": "Payment method with ID pm_invalid123 not found"
}
```

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
| `billing_address_id` | string | No | **NEW**: UUID of existing billing address to associate |
| `billing_details` | object | No | Billing information (merged with address if `billing_address_id` provided) |
| `billing_details.name` | string | Yes | Cardholder name |
| `billing_details.email` | string | Yes | Email address |
| `billing_details.phone` | string | No | Phone number |
| `billing_details.address` | object | No | Billing address (optional if using `billing_address_id`) |
| `save_for_future` | boolean | No | Save for future use (default: false) |
| `metadata` | object | No | Additional metadata (supports `nickname` for card aliases) |

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
  "guest_name": "John Doe",
  "billing_address_id": "addr_billing_123",
  "metadata": {
    "nickname": "My primary business card",
    "category": "business"
  },
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

#### With Existing Billing Address (NEW)
```bash
curl -X POST "https://api.example.com/bridge-payment/payment-methods" \
  -H "Authorization: Bearer your_session_id_here" \
  -H "Content-Type: application/json" \
  -d '{
    "customer_id": "550e8400-e29b-41d4-a716-446655440000",
    "type": "credit_card",
    "provider_id": "stripe",
    "payment_method_token": "pm_card_visa",
    "billing_address_id": "addr_billing_123",
    "billing_details": {
      "name": "John Doe",
      "email": "john@example.com"
    },
    "metadata": {
      "nickname": "My primary business card"
    },
    "save_for_future": true
  }'
```

#### With Card Nickname/Alias (NEW)
```bash
curl -X POST "https://api.example.com/bridge-payment/payment-methods" \
  -H "Authorization: Bearer your_session_id_here" \
  -H "Content-Type: application/json" \
  -d '{
    "type": "credit_card",
    "provider_id": "stripe",
    "payment_method_token": "pm_card_amex",
    "billing_details": {
      "name": "John Doe",
      "email": "john@example.com",
      "phone": "+1-555-123-4567"
    },
    "metadata": {
      "nickname": "Travel Card",
      "category": "personal",
      "notes": "For business travel expenses"
    },
    "save_for_future": true
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

Delete a payment method from both the payment provider and local database with simplified ownership validation.

### Request

```http
DELETE /bridge-payment/payment-methods/:id
DELETE /bridge-payment/payment-methods/:id?token=<guest_token>
```

#### Path Parameters

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `id` | string | Yes | Payment method ID to delete |

#### Query Parameters

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `token` | string | No* | Guest access token (*required for guest users) |

#### Headers

```http
# Option 1: Authorization Bearer (standard)
Authorization: Bearer <sessionId>

# Option 2: Custom session header
X-Session-ID: <sessionId>

# Option 3: Query parameter (alternative)
# Use ?session_id=<sessionId> instead of headers

Content-Type: application/json
```

### Response

```http
HTTP/1.1 200 OK
Content-Type: application/json
```

```json
{
  "message": "Payment method deleted successfully",
  "id": "pm_1234567890"
}
```

### Examples

#### Delete Authenticated User Payment Method
```bash
curl -X DELETE "https://api.example.com/bridge-payment/payment-methods/pm_1234567890" \
  -H "Authorization: Bearer your_token_here" \
  -H "Content-Type: application/json"
```

#### Delete Guest Payment Method with Token
```bash
curl -X DELETE "https://api.example.com/bridge-payment/payment-methods/pm_guest_123?token=guest_token_here" \
  -H "Content-Type: application/json"
```

### Access Control

- **Authenticated Users**: Can only delete their own payment methods (user_id match)
- **Guest Users with Tokens**: Can only delete payment methods where guest_email matches their token email
- **Admin Users**: Can delete any payment method
- **Anonymous Users**: Cannot delete payment methods

### Provider Integration

- **Best Effort Deletion**: Attempts to delete from payment provider (Stripe, etc.)
- **Graceful Fallback**: Continues with database deletion even if provider deletion fails
- **No Customer ID Required**: Simplified compared to previous version

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

#### Authentication Required
```http
HTTP/1.1 401 Unauthorized
Content-Type: application/json
```

```json
{
  "error": "Authentication Required",
  "details": "Authentication required to delete payment method"
}
```

#### Access Denied
```http
HTTP/1.1 403 Forbidden
Content-Type: application/json
```

```json
{
  "error": "Access Denied",
  "details": "Insufficient privileges to delete this payment method"
}
```

#### Payment Method Not Found
```http
HTTP/1.1 404 Not Found
Content-Type: application/json
```

```json
{
  "error": "Not Found",
  "details": "Payment method with ID pm_invalid123 not found"
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

#### Step 4: Update Payment Method (if needed)
```bash
curl -X PUT "https://api.example.com/bridge-payment/payment-methods/pm_1234567890" \
  -H "Authorization: Bearer your_token_here" \
  -H "Content-Type: application/json" \
  -d '{
    "is_default": true,
    "metadata": {
      "nickname": "Primary business card"
    }
  }'
```

#### Step 5: Delete Payment Method (if needed)
```bash
curl -X DELETE "https://api.example.com/bridge-payment/payment-methods/pm_1234567890" \
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
- **Ownership validation**: Users can only delete their own payment methods
- **Guest token support**: Secure guest access with token validation
- **PCI compliance**: Use token-based approach to avoid PCI DSS requirements
- **Access control**: Strict ownership validation for all operations

### Payment Method Management
- **Attach to customers**: Always attach payment methods to customers for better organization
- **Handle duplicates**: Check for existing payment methods before creating new ones
- **Cleanup**: Implement cleanup policies for unused payment methods
- **Billing Address Integration**: Use `billing_address_id` to associate payment methods with saved addresses
- **Card Nicknames**: Encourage users to add nicknames for better payment method identification
- **Metadata Usage**: Leverage metadata for categorization and custom business logic

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

---

*Last updated: June 4, 2025*

## Changelog

### Version 2.0.0 - June 4, 2025

#### 🆕 New Features
- **Guest Token Authentication**: Support for token-based guest payment method access with multiple auth methods (Bearer, X-Session-ID, query parameter)
- **Billing Address Integration**: Optional association of payment methods with existing billing addresses via `billing_address_id`
- **Card Nicknames/Aliases**: Support for custom payment method nicknames through `metadata.nickname` field
- **Enhanced Response Format**: Standardized API responses with configurable ROW_MODE
- **Advanced Filtering**: Added search, payment type, and card brand filtering capabilities
- **Performance Optimization**: Database indexes and query optimization
- **Improved Pagination**: Cursor-based pagination with hasMore indicator
- **Payment Method Updates**: PUT endpoint for updating local fields (is_default, billing_address_id, metadata)
- **Simplified DELETE**: Removed complex customer_id requirement, added guest token support
- **Guest Name Support**: Added `guest_name` field for better guest user identification

#### 🔧 Improvements
- **Configurable Timeouts**: AUTH_TIMEOUT environment variable for slow backends
- **Better Error Handling**: Consistent error response format
- **Enhanced Caching**: Token validation caching with configurable expiration
- **Query Performance**: Optimized payment method lookups with proper indexes

#### 📚 Documentation
- **Complete API Reference**: Updated with all new endpoints and parameters
- **Integration Examples**: Frontend integration patterns and best practices
- **Configuration Guide**: Environment variables and performance tuning
- **Security Guidelines**: Token management and guest user security

#### 🛠️ Technical Changes
- **Response Format**: New standardized format with meta and user_context
- **Database Indexes**: Optimized indexes for payment method queries
- **Error Responses**: Consistent error format across all endpoints
- **Environment Variables**: New configuration options for timeouts and formats
- **Repository Methods**: Added unsetDefaultForUser and unsetDefaultForGuest methods
- **Ownership Validation**: Consistent validation logic across GET, PUT, and DELETE operations

### Version 2.2.0 - June 16, 2025

#### 🆕 New Features
- **Payment Continuation Support**: Added support for continuing incomplete payments that require additional authentication (3D Secure) or confirmation
- **Enhanced Guest Information**: Automatic extraction of guest names from guest_data JSON for better display
- **Improved Nickname Display**: Enhanced frontend patterns for displaying payment method nicknames and aliases
- **Payment Status Management**: Support for `pending`, `requires_confirmation`, and `requires_action` payment statuses

#### 🔧 Improvements
- **Frontend Integration**: Better integration patterns for payment continuation flows
- **Guest Data Extraction**: Automatic guest_name extraction from guest_data JSON field
- **Nickname Priority**: Enhanced nickname/alias display with fallback patterns
- **Payment Flow**: Streamlined payment continuation with proper redirection handling

#### 📚 Documentation Updates
- **Payment Continuation Guide**: Complete guide for implementing payment continuation flows
- **Frontend Examples**: Enhanced JavaScript examples for payment method display
- **Status Handling**: Documentation for handling different payment statuses
- **Guest Information**: Updated examples for guest name extraction and display