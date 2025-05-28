# Subscriptions API Reference

The Subscriptions API allows you to create, manage, and monitor recurring subscriptions for both authenticated users and guest customers. This API integrates with payment providers like Stripe and supports various subscription models including trials, different billing intervals, and guest subscriptions.

## Base URL

```
https://your-api-domain.com/bridge-payment
```

## Authentication

- **Authenticated Users**: Include `Authorization: Bearer <token>` header
- **Guest Users**: No authentication required, provide `guest_data` in request
- **Organizations**: Include organization context in request

## Subscription Flow

1. **Create Customer**: Ensure customer exists (user, organization, or guest)
2. **Create Subscription**: Initialize subscription with product and payment method
3. **Manage Subscription**: Update, cancel, or modify subscription
4. **Handle Webhooks**: Process subscription events from payment provider

## Endpoints Overview

| Method | Endpoint | Description | Auth Required |
|--------|----------|-------------|---------------|
| POST | `/subscriptions` | Create subscription | Optional |
| GET | `/subscriptions/:id` | Get subscription by ID | Optional |
| GET | `/subscriptions` | List subscriptions | Yes |
| PUT | `/subscriptions/:id` | Update subscription | Optional |
| POST | `/subscriptions/:id/cancel` | Cancel subscription | Optional |
| POST | `/subscriptions/:id/reactivate` | Reactivate subscription | Optional |
| GET | `/subscriptions/guest/:email` | Get guest subscriptions | No |

---

## Create Subscription

Create a new subscription for a customer.

### Request

```http
POST /bridge-payment/subscriptions
```

#### Headers

```http
Authorization: Bearer <token>  # Optional for authenticated users
Content-Type: application/json
```

#### Request Body

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `customer_id` | string | Yes | Customer ID from provider_customers table |
| `product_id` | string | No | Product/plan ID to subscribe to (optional for custom subscriptions) |
| `payment_method_id` | string | Yes | Payment method ID for billing |
| `provider_id` | string | No | Payment provider (default: "stripe") |
| `organization_id` | string | No | Organization ID (overrides user's organization) |
| `trial_days` | number | No | Trial period in days (default: 0) |
| `price_cents` | number | No* | Price in cents (*required for custom subscriptions) |
| `currency` | string | No* | Currency code (*required for custom subscriptions) |
| `billing_interval` | string | No* | Billing frequency (*required for custom subscriptions) |
| `custom_price_cents` | number | No | Override product price (for product-based subscriptions) |
| `custom_trial_days` | number | No | Override product trial days (for product-based subscriptions) |
| `metadata` | object | No | Additional metadata |
| `guest_data` | object | No* | Guest customer data (*required for guests) |
| `guest_data.email` | string | Yes | Guest email address |
| `guest_data.name` | string | Yes | Guest full name |

### Response

```http
HTTP/1.1 201 Created
Content-Type: application/json
```

```json
{
  "id": "sub_1234567890",
  "customer_id": "cust_abcdef123456",
  "product_id": "prod_premium_plan",
  "payment_method_id": "pm_1234567890",
  "provider_id": "stripe",
  "provider_subscription_id": "sub_stripe_xyz789",
  "status": "active",
  "current_period_start": "2025-01-15T10:30:00Z",
  "current_period_end": "2025-02-15T10:30:00Z",
  "cancel_at_period_end": false,
  "trial_end": null,
  "price_cents": 2999,
  "currency": "USD",
  "created_at": "2025-01-15T10:30:00Z"
}
```

### Examples

#### Authenticated User Subscription
```bash
curl -X POST "https://api.example.com/bridge-payment/subscriptions" \
  -H "Authorization: Bearer your_token_here" \
  -H "Content-Type: application/json" \
  -d '{
    "customer_id": "cust_user_123456",
    "product_id": "prod_premium_monthly",
    "payment_method_id": "pm_card_visa_1234",
    "provider_id": "stripe",
    "trial_days": 7,
    "metadata": {
      "plan": "premium",
      "source": "website"
    }
  }'
```

#### Guest Subscription
```bash
curl -X POST "https://api.example.com/bridge-payment/subscriptions" \
  -H "Content-Type: application/json" \
  -d '{
    "customer_id": "cust_guest_789012",
    "product_id": "prod_basic_monthly",
    "payment_method_id": "pm_guest_card_5678",
    "provider_id": "stripe",
    "trial_days": 14,
    "guest_data": {
      "email": "guest@example.com",
      "name": "Guest User"
    },
    "metadata": {
      "plan": "basic",
      "source": "landing_page"
    }
  }'
```

#### Organization Subscription
```bash
curl -X POST "https://api.example.com/bridge-payment/subscriptions" \
  -H "Authorization: Bearer org_token_here" \
  -H "Content-Type: application/json" \
  -d '{
    "customer_id": "cust_org_345678",
    "product_id": "prod_team_yearly",
    "payment_method_id": "pm_company_card_9012",
    "provider_id": "stripe",
    "organization_id": "org_456789",
    "metadata": {
      "plan": "team",
      "seats": 10,
      "billing_contact": "billing@company.com"
    }
  }'
```

#### Organization Custom Subscription (No Product)
```bash
curl -X POST "https://api.example.com/bridge-payment/subscriptions" \
  -H "Authorization: Bearer org_token_here" \
  -H "Content-Type: application/json" \
  -d '{
    "customer_id": "cust_org_345678",
    "payment_method_id": "pm_company_card_9012",
    "provider_id": "stripe",
    "organization_id": "org_456789",
    "price_cents": 9999,
    "currency": "USD",
    "billing_interval": "monthly",
    "trial_days": 14,
    "metadata": {
      "type": "custom_enterprise_plan",
      "seats": 50,
      "features": ["advanced_analytics", "priority_support"]
    }
  }'
```

---

## Get Subscription by ID

Retrieve a specific subscription by its ID.

### Request

```http
GET /bridge-payment/subscriptions/{id}
```

#### Path Parameters

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `id` | string | Yes | Subscription ID |

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
  "id": "sub_1234567890",
  "user_id": "user_123456",
  "organization_id": null,
  "customer_id": "cust_abcdef123456",
  "product_id": "prod_premium_plan",
  "payment_method_id": "pm_1234567890",
  "provider_id": "stripe",
  "provider_subscription_id": "sub_stripe_xyz789",
  "status": "active",
  "current_period_start": "2025-01-15T10:30:00Z",
  "current_period_end": "2025-02-15T10:30:00Z",
  "cancel_at_period_end": false,
  "trial_end": null,
  "price_cents": 2999,
  "currency": "USD",
  "metadata": {
    "plan": "premium",
    "source": "website"
  },
  "created_at": "2025-01-15T10:30:00Z",
  "updated_at": "2025-01-15T10:30:00Z"
}
```

### Examples

#### Get Subscription
```bash
curl -X GET "https://api.example.com/bridge-payment/subscriptions/sub_1234567890" \
  -H "Authorization: Bearer your_token_here" \
  -H "Content-Type: application/json"
```

---

## List Subscriptions

Retrieve a list of subscriptions for the authenticated user or organization.

### Request

```http
GET /bridge-payment/subscriptions
```

#### Query Parameters

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `status` | string | No | Filter by status (active, canceled, past_due, trialing) |
| `limit` | number | No | Number of results (default: 20, max: 100) |
| `offset` | number | No | Pagination offset (default: 0) |

#### Headers

```http
Authorization: Bearer <token>  # Required
Content-Type: application/json
```

### Response

```http
HTTP/1.1 200 OK
Content-Type: application/json
```

```json
{
  "subscriptions": [
    {
      "id": "sub_1234567890",
      "customer_id": "cust_abcdef123456",
      "product_id": "prod_premium_plan",
      "status": "active",
      "price_cents": 2999,
      "currency": "USD",
      "current_period_start": "2025-01-15T10:30:00Z",
      "current_period_end": "2025-02-15T10:30:00Z",
      "created_at": "2025-01-15T10:30:00Z"
    }
  ],
  "total": 1,
  "limit": 20,
  "offset": 0
}
```

### Examples

#### List Active Subscriptions
```bash
curl -X GET "https://api.example.com/bridge-payment/subscriptions?status=active&limit=10" \
  -H "Authorization: Bearer your_token_here" \
  -H "Content-Type: application/json"
```

---

## Cancel Subscription

Cancel a subscription at the end of the current billing period.

### Request

```http
POST /bridge-payment/subscriptions/{id}/cancel
```

#### Path Parameters

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `id` | string | Yes | Subscription ID |

#### Headers

```http
Authorization: Bearer <token>  # Optional for authenticated users
Content-Type: application/json
```

#### Request Body

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `cancel_at_period_end` | boolean | No | Cancel at period end (default: true) |
| `reason` | string | No | Cancellation reason |

### Response

```http
HTTP/1.1 200 OK
Content-Type: application/json
```

```json
{
  "id": "sub_1234567890",
  "status": "active",
  "cancel_at_period_end": true,
  "current_period_end": "2025-02-15T10:30:00Z",
  "message": "Subscription will be canceled at the end of the current period",
  "updated_at": "2025-01-20T15:45:00Z"
}
```

### Examples

#### Cancel at Period End
```bash
curl -X POST "https://api.example.com/bridge-payment/subscriptions/sub_1234567890/cancel" \
  -H "Authorization: Bearer your_token_here" \
  -H "Content-Type: application/json" \
  -d '{
    "cancel_at_period_end": true,
    "reason": "Customer requested cancellation"
  }'
```

#### Cancel Immediately
```bash
curl -X POST "https://api.example.com/bridge-payment/subscriptions/sub_1234567890/cancel" \
  -H "Authorization: Bearer your_token_here" \
  -H "Content-Type: application/json" \
  -d '{
    "cancel_at_period_end": false,
    "reason": "Immediate cancellation requested"
  }'
```

---

## Get Guest Subscriptions

Retrieve subscriptions for a guest customer by email address.

### Request

```http
GET /bridge-payment/subscriptions/guest/{email}
```

#### Path Parameters

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `email` | string | Yes | Guest email address |

#### Headers

```http
Content-Type: application/json
```

### Response

```http
HTTP/1.1 200 OK
Content-Type: application/json
```

```json
{
  "subscriptions": [
    {
      "id": "sub_guest_789012",
      "customer_id": "cust_guest_345678",
      "product_id": "prod_basic_monthly",
      "status": "trialing",
      "price_cents": 999,
      "currency": "USD",
      "trial_end": "2025-01-29T10:30:00Z",
      "current_period_start": "2025-01-15T10:30:00Z",
      "current_period_end": "2025-02-15T10:30:00Z",
      "guest_info": {
        "email": "guest@example.com",
        "name": "Guest User"
      },
      "created_at": "2025-01-15T10:30:00Z"
    }
  ],
  "total": 1
}
```

### Examples

#### Get Guest Subscriptions
```bash
curl -X GET "https://api.example.com/bridge-payment/subscriptions/guest/guest@example.com" \
  -H "Content-Type: application/json"
```

---

## Subscription Status Values

| Status | Description |
|--------|-------------|
| `active` | Subscription is active and billing normally |
| `trialing` | Subscription is in trial period |
| `past_due` | Payment failed, subscription is past due |
| `canceled` | Subscription has been canceled |
| `incomplete` | Initial payment failed or requires action |
| `incomplete_expired` | Initial payment failed and expired |

---

## Error Responses

### Common Error Codes

| Status Code | Error | Description |
|-------------|-------|-------------|
| 400 | Bad Request | Invalid request data or subscription parameters |
| 401 | Unauthorized | Invalid or missing authentication token |
| 403 | Forbidden | Access denied - not the subscription owner |
| 404 | Not Found | Subscription not found |
| 409 | Conflict | Subscription already exists or in invalid state |
| 422 | Validation Error | Request data failed validation |
| 500 | Internal Server Error | Server error |

### Error Response Format

```json
{
  "error": "Subscription creation failed",
  "message": "Customer already has an active subscription for this product",
  "timestamp": "2025-01-15T18:00:00Z",
  "details": {
    "customer_id": "cust_123456",
    "product_id": "prod_premium_plan",
    "existing_subscription_id": "sub_existing_789"
  }
}
```

### Example Error Responses

#### Subscription Already Exists
```http
HTTP/1.1 409 Conflict
Content-Type: application/json
```

```json
{
  "error": "Subscription conflict",
  "message": "Customer already has an active subscription for this product",
  "timestamp": "2025-01-15T18:00:00Z",
  "details": {
    "customer_id": "cust_123456",
    "product_id": "prod_premium_plan",
    "existing_subscription_id": "sub_existing_789"
  }
}
```

#### Payment Method Required
```http
HTTP/1.1 400 Bad Request
Content-Type: application/json
```

```json
{
  "error": "Payment method required",
  "message": "A valid payment method is required to create a subscription",
  "timestamp": "2025-01-15T18:00:00Z",
  "details": {
    "payment_method_id": null,
    "customer_id": "cust_123456"
  }
}
```

---

## Organization Support

The Subscriptions API fully supports organizations, allowing you to create and manage subscriptions for organizational customers.

### Organization Features

- ✅ **Organization ID Support**: Pass `organization_id` in request body
- ✅ **Automatic Detection**: Uses user's organization if not specified
- ✅ **Access Control**: Users can access subscriptions from their organization
- ✅ **Product-based**: Full support for organizational product subscriptions
- ✅ **Custom Subscriptions**: Support for custom enterprise pricing
- ✅ **Guest Support**: Organizations can create guest subscriptions

### Organization vs User Subscriptions

| Feature | User Subscription | Organization Subscription |
|---------|------------------|---------------------------|
| **Authentication** | User token required | User token with org access |
| **Access Control** | User ID verification | User ID OR Organization ID |
| **Billing** | Personal billing | Organizational billing |
| **Management** | User manages own | Org members can manage |
| **Custom Pricing** | Standard pricing | Enterprise pricing available |

### Organization Examples

#### 1. Organization Product Subscription
```bash
curl -X POST "https://api.example.com/bridge-payment/subscriptions" \
  -H "Authorization: Bearer org_user_token" \
  -H "Content-Type: application/json" \
  -d '{
    "customer_id": "cust_org_company_abc",
    "product_id": "prod_enterprise_plan",
    "payment_method_id": "pm_company_card",
    "organization_id": "org_company_abc_123",
    "metadata": {
      "department": "IT",
      "cost_center": "CC-2024-001",
      "seats": 100
    }
  }'
```

#### 2. Organization Custom Subscription (Enterprise Pricing)
```bash
curl -X POST "https://api.example.com/bridge-payment/subscriptions" \
  -H "Authorization: Bearer org_admin_token" \
  -H "Content-Type: application/json" \
  -d '{
    "customer_id": "cust_enterprise_xyz",
    "payment_method_id": "pm_enterprise_card",
    "organization_id": "org_enterprise_xyz_456",
    "price_cents": 49999,
    "currency": "USD",
    "billing_interval": "yearly",
    "trial_days": 30,
    "metadata": {
      "contract_id": "ENT-2024-XYZ-001",
      "seats": 500,
      "features": ["sso", "advanced_analytics", "priority_support"],
      "discount_percent": 20
    }
  }'
```

#### 3. Organization Guest Subscription
```bash
curl -X POST "https://api.example.com/bridge-payment/subscriptions" \
  -H "Content-Type: application/json" \
  -d '{
    "customer_id": "cust_guest_contractor",
    "payment_method_id": "pm_contractor_card",
    "organization_id": "org_company_abc_123",
    "product_id": "prod_contractor_access",
    "guest_data": {
      "email": "contractor@external.com",
      "name": "External Contractor"
    },
    "metadata": {
      "access_level": "contractor",
      "project": "PROJECT-2024-Q1"
    }
  }'
```

### Organization Access Control

The API automatically handles access control for organizations:

1. **User Access**: Users can access subscriptions where `user_id` matches
2. **Organization Access**: Users can access subscriptions where `organization_id` matches their organization
3. **Combined Access**: A user can access both personal and organizational subscriptions
4. **Guest Access**: Guests can only access their own subscriptions via email verification

### Organization Billing Scenarios

#### Scenario 1: Department Subscriptions
```json
{
  "organization_id": "org_company_123",
  "metadata": {
    "department": "Engineering",
    "cost_center": "ENG-2024-001",
    "manager": "john.doe@company.com"
  }
}
```

#### Scenario 2: Project-based Subscriptions
```json
{
  "organization_id": "org_agency_456",
  "metadata": {
    "project_id": "CLIENT-PROJECT-789",
    "client": "External Client Corp",
    "billable": true
  }
}
```

#### Scenario 3: Multi-tenant SaaS
```json
{
  "organization_id": "org_tenant_789",
  "metadata": {
    "tenant_id": "tenant_789",
    "plan_tier": "enterprise",
    "white_label": true
  }
}
```

---

## Workflow Examples

### Complete Subscription Flow for Authenticated User

#### Step 1: Create Customer (if not exists)
```bash
curl -X POST "https://api.example.com/bridge-payment/customers" \
  -H "Authorization: Bearer your_token_here" \
  -H "Content-Type: application/json" \
  -d '{
    "email": "user@example.com",
    "name": "John Doe",
    "provider_id": "stripe"
  }'
```

#### Step 2: Add Payment Method
```bash
curl -X POST "https://api.example.com/bridge-payment/payment-methods" \
  -H "Authorization: Bearer your_token_here" \
  -H "Content-Type: application/json" \
  -d '{
    "customer_id": "cust_user_123456",
    "type": "credit_card",
    "provider_id": "stripe",
    "payment_method_token": "pm_card_visa"
  }'
```

#### Step 3: Create Subscription
```bash
curl -X POST "https://api.example.com/bridge-payment/subscriptions" \
  -H "Authorization: Bearer your_token_here" \
  -H "Content-Type: application/json" \
  -d '{
    "customer_id": "cust_user_123456",
    "product_id": "prod_premium_monthly",
    "payment_method_id": "pm_card_visa_1234",
    "provider_id": "stripe",
    "trial_days": 7
  }'
```

### Complete Guest Subscription Flow

#### Step 1: Create Guest Customer
```bash
curl -X POST "https://api.example.com/bridge-payment/customers" \
  -H "Content-Type: application/json" \
  -d '{
    "email": "guest@example.com",
    "name": "Guest User",
    "provider_id": "stripe",
    "is_guest": true
  }'
```

#### Step 2: Add Guest Payment Method
```bash
curl -X POST "https://api.example.com/bridge-payment/payment-methods/direct" \
  -H "Content-Type: application/json" \
  -d '{
    "customer_id": "cust_guest_789012",
    "card_number": "4242424242424242",
    "exp_month": "12",
    "exp_year": "2025",
    "cvc": "123",
    "provider_id": "stripe",
    "guest_data": {
      "email": "guest@example.com",
      "name": "Guest User"
    }
  }'
```

#### Step 3: Create Guest Subscription
```bash
curl -X POST "https://api.example.com/bridge-payment/subscriptions" \
  -H "Content-Type: application/json" \
  -d '{
    "customer_id": "cust_guest_789012",
    "product_id": "prod_basic_monthly",
    "payment_method_id": "pm_guest_card_5678",
    "provider_id": "stripe",
    "trial_days": 14,
    "guest_data": {
      "email": "guest@example.com",
      "name": "Guest User"
    }
  }'
```

### Guest to User Conversion

When a guest creates an account, their subscriptions can be transferred:

#### Step 1: Create User Account
```bash
curl -X POST "https://api.example.com/auth/register" \
  -H "Content-Type: application/json" \
  -d '{
    "email": "guest@example.com",
    "password": "secure_password",
    "name": "John Doe"
  }'
```

#### Step 2: Convert Guest Subscriptions
```bash
curl -X POST "https://api.example.com/bridge-payment/subscriptions/convert-guest" \
  -H "Authorization: Bearer new_user_token" \
  -H "Content-Type: application/json" \
  -d '{
    "guest_email": "guest@example.com"
  }'
```

---

## Best Practices

### 1. Trial Management
- Always specify trial period for new subscriptions
- Monitor trial end dates and send reminders
- Handle trial-to-paid conversions gracefully

### 2. Guest Subscriptions
- Collect minimal required information for guests
- Provide easy conversion path to full accounts
- Maintain guest subscription history after conversion

### 3. Error Handling
- Always check subscription status before operations
- Handle payment failures gracefully
- Implement retry logic for temporary failures

### 4. Webhook Integration
- Set up webhooks for subscription events
- Handle all subscription status changes
- Implement idempotency for webhook processing

### 5. Customer Communication
- Send confirmation emails for new subscriptions
- Notify customers of upcoming renewals
- Provide clear cancellation processes
