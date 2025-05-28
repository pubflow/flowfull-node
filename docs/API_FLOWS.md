# Bridge-Payments API Documentation

## 🚀 Complete HTTP Flows for Payment Processing

### **🔗 Base URL:** `http://localhost:3000/bridge-payment`

---

## 🎯 **Flow 1: Guest Payment (One-time)**

### **Step 1: Create Payment Intent (Guest)**
```bash
curl -X POST http://localhost:3000/bridge-payment/payments/intents \
  -H "Content-Type: application/json" \
  -H "User-Agent: curl/7.68.0" \
  -d '{
    "amount_cents": 2000,
    "currency": "USD",
    "provider_id": "stripe",
    "description": "Guest purchase",
    "guest_data": {
      "email": "guest@example.com",
      "name": "John Doe"
    }
  }'
```

**Response:**
```json
{
  "id": "pay_guest_123",
  "provider_intent_id": "pi_3RTYN3JH4Zr08WDG14fmMSKu",
  "client_secret": "pi_3RTYN3JH4Zr08WDG14fmMSKu_secret_xxxxx",
  "amount_cents": 2000,
  "currency": "USD",
  "status": "requires_confirmation",
  "provider_id": "stripe",
  "is_guest_payment": true,
  "created_at": "2025-05-28T01:01:29.591Z"
}
```

### **Step 2: Confirm Payment Intent (Guest)**
```bash
curl -X POST http://localhost:3000/bridge-payment/payments/intents/pay_guest_123/confirm \
  -H "Content-Type: application/json" \
  -H "User-Agent: curl/7.68.0" \
  -d '{
    "payment_method_id": "pm_card_visa",
    "return_url": "https://mystore.com/success"
  }'
```

**Response:**
```json
{
  "id": "pay_guest_123",
  "status": "succeeded",
  "provider_intent_id": "pi_3RTYN3JH4Zr08WDG14fmMSKu",
  "requires_action": false,
  "updated_at": "2025-05-28T01:05:21.998Z"
}
```

### **Step 3: Get Payment Status (Guest)**
```bash
curl -X GET http://localhost:3000/bridge-payment/payments/pay_guest_123 \
  -H "Content-Type: application/json" \
  -H "User-Agent: curl/7.68.0"
```

**Response:**
```json
{
  "id": "pay_guest_123",
  "amount_cents": 2000,
  "currency": "USD",
  "status": "succeeded",
  "description": "Guest purchase",
  "provider_id": "stripe",
  "is_guest_payment": true,
  "created_at": "2025-05-28T01:01:29.591Z",
  "updated_at": "2025-05-28T01:05:21.998Z",
  "completed_at": "2025-05-28T01:05:21.998Z"
}
```

---

## 👤 **Flow 2: Registered Customer with Saved Payment Methods**

### **Step 1: Create Customer**
```bash
curl -X POST http://localhost:3000/bridge-payment/customers \
  -H "Content-Type: application/json" \
  -H "User-Agent: curl/7.68.0" \
  -H "Authorization: Bearer user_session_token_123" \
  -d '{
    "email": "customer@example.com",
    "name": "Maria Garcia",
    "phone": "+1234567890",
    "provider_id": "stripe",
    "is_guest": false
  }'
```

**Response:**
```json
{
  "id": "cus_registered_456",
  "provider_customer_id": "cus_stripe_789",
  "email": "customer@example.com",
  "name": "Maria Garcia",
  "provider_id": "stripe",
  "is_guest": false,
  "created_at": "2025-05-28T01:10:00.000Z"
}
```

### **Step 2: Create Payment Method**
```bash
curl -X POST http://localhost:3000/bridge-payment/payment-methods \
  -H "Content-Type: application/json" \
  -H "User-Agent: curl/7.68.0" \
  -H "Authorization: Bearer user_session_token_123" \
  -d '{
    "customer_id": "cus_registered_456",
    "type": "credit_card",
    "provider_id": "stripe",
    "card": {
      "number": "4242424242424242",
      "exp_month": 12,
      "exp_year": 2025,
      "cvc": "123"
    },
    "billing_details": {
      "name": "Maria Garcia",
      "email": "customer@example.com"
    },
    "save_for_future": true
  }'
```

**Response:**
```json
{
  "id": "pm_saved_789",
  "provider_payment_method_id": "pm_stripe_abc123",
  "payment_type": "credit_card",
  "card_brand": "visa",
  "last_four": "4242",
  "expiry_month": "12",
  "expiry_year": "2025",
  "is_default": false,
  "is_guest": false,
  "guest_email": null,
  "created_at": "2025-05-28T01:15:00.000Z"
}
```

### **Step 3: Create Payment Intent with Saved Payment Method**
```bash
curl -X POST http://localhost:3000/bridge-payment/payments/intents \
  -H "Content-Type: application/json" \
  -H "User-Agent: curl/7.68.0" \
  -H "Authorization: Bearer user_session_token_123" \
  -d '{
    "amount_cents": 5000,
    "currency": "USD",
    "provider_id": "stripe",
    "payment_method_id": "pm_stripe_abc123",
    "confirm": true,
    "description": "Purchase with saved card"
  }'
```

**Response:**
```json
{
  "id": "pay_customer_456",
  "provider_intent_id": "pi_customer_xyz789",
  "client_secret": null,
  "amount_cents": 5000,
  "currency": "USD",
  "status": "succeeded",
  "provider_id": "stripe",
  "is_guest_payment": false,
  "created_at": "2025-05-28T01:20:00.000Z"
}
```

### **Step 4: List Customer Payment Methods**
```bash
curl -X GET http://localhost:3000/bridge-payment/payment-methods/customer/cus_registered_456 \
  -H "Content-Type: application/json" \
  -H "User-Agent: curl/7.68.0" \
  -H "Authorization: Bearer user_session_token_123"
```

**Response:**
```json
{
  "payment_methods": [
    {
      "id": "pm_saved_789",
      "provider_payment_method_id": "pm_stripe_abc123",
      "payment_type": "credit_card",
      "card_brand": "visa",
      "last_four": "4242",
      "expiry_month": "12",
      "expiry_year": "2025",
      "is_default": false,
      "is_guest": false,
      "guest_email": null,
      "created_at": "2025-05-28T01:15:00.000Z"
    }
  ],
  "total": 1
}
```

### **Step 5: List Customer Payments**
```bash
curl -X GET http://localhost:3000/bridge-payment/payments \
  -H "Content-Type: application/json" \
  -H "User-Agent: curl/7.68.0" \
  -H "Authorization: Bearer user_session_token_123"
```

**Response:**
```json
{
  "payments": [
    {
      "id": "pay_customer_456",
      "amount_cents": 5000,
      "currency": "USD",
      "status": "succeeded",
      "description": "Purchase with saved card",
      "provider_id": "stripe",
      "created_at": "2025-05-28T01:20:00.000Z",
      "completed_at": "2025-05-28T01:20:00.000Z"
    }
  ],
  "limit": 20,
  "offset": 0,
  "total": 1
}
```

---

## 🔄 **Flow 3: Guest with Saved Payment Method (Hybrid)**

### **Step 1: Create Guest Customer**
```bash
curl -X POST http://localhost:3000/bridge-payment/customers \
  -H "Content-Type: application/json" \
  -H "User-Agent: curl/7.68.0" \
  -d '{
    "email": "guest-save@example.com",
    "name": "Pedro Lopez",
    "provider_id": "stripe",
    "is_guest": true
  }'
```

**Response:**
```json
{
  "id": "cus_guest_789",
  "provider_customer_id": "cus_stripe_guest_456",
  "email": "guest-save@example.com",
  "name": "Pedro Lopez",
  "provider_id": "stripe",
  "is_guest": true,
  "created_at": "2025-05-28T01:25:00.000Z"
}
```

### **Step 2: Create Payment Method for Guest**
```bash
curl -X POST http://localhost:3000/bridge-payment/payment-methods \
  -H "Content-Type: application/json" \
  -H "User-Agent: curl/7.68.0" \
  -d '{
    "customer_id": "cus_guest_789",
    "type": "credit_card",
    "provider_id": "stripe",
    "card": {
      "number": "4000056655665556",
      "exp_month": 8,
      "exp_year": 2026,
      "cvc": "456"
    },
    "billing_details": {
      "name": "Pedro Lopez",
      "email": "guest-save@example.com"
    },
    "save_for_future": true
  }'
```

**Response:**
```json
{
  "id": "pm_guest_456",
  "provider_payment_method_id": "pm_stripe_guest_def456",
  "payment_type": "credit_card",
  "card_brand": "visa",
  "last_four": "5556",
  "expiry_month": "08",
  "expiry_year": "2026",
  "is_default": false,
  "is_guest": true,
  "guest_email": "guest-save@example.com",
  "created_at": "2025-05-28T01:30:00.000Z"
}
```

### **Step 3: Pay with Saved Payment Method (Guest)**
```bash
curl -X POST http://localhost:3000/bridge-payment/payments/intents \
  -H "Content-Type: application/json" \
  -H "User-Agent: curl/7.68.0" \
  -d '{
    "amount_cents": 3500,
    "currency": "USD",
    "provider_id": "stripe",
    "payment_method_id": "pm_stripe_guest_def456",
    "confirm": true,
    "description": "Guest payment with saved card",
    "guest_data": {
      "email": "guest-save@example.com",
      "name": "Pedro Lopez"
    }
  }'
```

**Response:**
```json
{
  "id": "pay_guest_saved_789",
  "provider_intent_id": "pi_guest_saved_abc123",
  "client_secret": null,
  "amount_cents": 3500,
  "currency": "USD",
  "status": "succeeded",
  "provider_id": "stripe",
  "is_guest_payment": true,
  "created_at": "2025-05-28T01:35:00.000Z"
}
```

---

## ❌ **Flow 4: Cancel Payment Intent**

### **Cancel Pending Payment**
```bash
curl -X POST http://localhost:3000/bridge-payment/payments/pay_guest_123/cancel \
  -H "Content-Type: application/json" \
  -H "User-Agent: curl/7.68.0"
```

**Response:**
```json
{
  "id": "pay_guest_123",
  "status": "canceled",
  "updated_at": "2025-05-28T01:40:00.000Z"
}
```

---

## 🔧 **Flow 5: Payment Method Management**

### **Delete Payment Method**
```bash
curl -X DELETE http://localhost:3000/bridge-payment/payment-methods/pm_saved_789 \
  -H "Content-Type: application/json" \
  -H "User-Agent: curl/7.68.0" \
  -H "Authorization: Bearer user_session_token_123"
```

**Response:**
```json
{
  "message": "Payment method deleted successfully"
}
```

### **Update Customer**
```bash
curl -X PUT http://localhost:3000/bridge-payment/customers/cus_registered_456 \
  -H "Content-Type: application/json" \
  -H "User-Agent: curl/7.68.0" \
  -H "Authorization: Bearer user_session_token_123" \
  -d '{
    "name": "Maria Garcia Rodriguez",
    "phone": "+1234567891"
  }'
```

**Response:**
```json
{
  "id": "cus_registered_456",
  "provider_customer_id": "cus_stripe_789",
  "email": "customer@example.com",
  "name": "Maria Garcia Rodriguez",
  "phone": "+1234567891",
  "provider_id": "stripe",
  "is_guest": false,
  "updated_at": "2025-05-28T01:45:00.000Z"
}
```

---

## 🏥 **Flow 6: Health Check and Status**

### **Health Check**
```bash
curl -X GET http://localhost:3000/health \
  -H "User-Agent: curl/7.68.0"
```

**Response:**
```json
{
  "status": "healthy",
  "timestamp": "2025-05-28T01:50:00.000Z",
  "database": "connected",
  "providers": {
    "stripe": "healthy"
  }
}
```

### **API Info**
```bash
curl -X GET http://localhost:3000/ \
  -H "User-Agent: curl/7.68.0"
```

**Response:**
```json
{
  "name": "Bridge Payments API",
  "version": "1.0.0",
  "environment": "production",
  "timestamp": "2025-05-28T01:50:00.000Z",
  "endpoints": {
    "health": "/health",
    "payments": "/bridge-payment/payments",
    "customers": "/bridge-payment/customers",
    "payment_methods": "/bridge-payment/payment-methods",
    "webhooks": "/bridge-payment/webhooks"
  }
}
```

---

## 🗄️ **Database Schema (Native-Payments Compatible)**

### **Provider Customers Table**
```sql
CREATE TABLE provider_customers (
    id VARCHAR(255) PRIMARY KEY,
    user_id VARCHAR(255),                    -- Links to users table (null for guests)
    organization_id VARCHAR(255),            -- Links to organizations table (null for individuals)
    provider_id VARCHAR(50) NOT NULL,        -- 'stripe', 'paypal', etc.
    provider_customer_id VARCHAR(255) NOT NULL, -- ID from the provider (e.g., Stripe customer ID)
    guest_email VARCHAR(255),                -- Email for guest customers
    guest_name VARCHAR(255),                 -- Name for guest customers
    is_guest BOOLEAN NOT NULL DEFAULT false, -- Indicates if this is a guest customer
    metadata JSON,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
    FOREIGN KEY (organization_id) REFERENCES organizations(id) ON DELETE CASCADE,
    FOREIGN KEY (provider_id) REFERENCES payment_providers(id) ON DELETE CASCADE,
    UNIQUE KEY (provider_id, provider_customer_id),
    CHECK (user_id IS NOT NULL OR organization_id IS NOT NULL OR is_guest = true)
);
```

### **Payment Methods Table**
```sql
CREATE TABLE payment_methods (
    id VARCHAR(255) PRIMARY KEY,
    user_id VARCHAR(255),                    -- Links to users table (null for guests)
    organization_id VARCHAR(255),            -- Links to organizations table (null for individuals)
    provider_id VARCHAR(50) NOT NULL,        -- 'stripe', 'paypal', etc.
    provider_payment_method_id VARCHAR(255) NOT NULL, -- ID from the provider
    payment_type VARCHAR(50) NOT NULL,       -- 'credit_card', 'bank_account', 'paypal', etc.
    last_four VARCHAR(4),                    -- Last 4 digits of card or account
    expiry_month VARCHAR(2),                 -- Expiration month (for cards)
    expiry_year VARCHAR(4),                  -- Expiration year (for cards)
    card_brand VARCHAR(50),                  -- 'visa', 'mastercard', etc.
    is_default BOOLEAN NOT NULL DEFAULT false,
    billing_address_id VARCHAR(255),         -- Links to addresses table
    is_guest BOOLEAN NOT NULL DEFAULT false, -- Indicates if this is a guest payment method
    guest_email VARCHAR(255),                -- Email for guest payment methods
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
    FOREIGN KEY (organization_id) REFERENCES organizations(id) ON DELETE CASCADE,
    FOREIGN KEY (provider_id) REFERENCES payment_providers(id) ON DELETE CASCADE,
    FOREIGN KEY (billing_address_id) REFERENCES addresses(id) ON DELETE SET NULL,
    CHECK (user_id IS NOT NULL OR organization_id IS NOT NULL OR is_guest = true)
);
```

### **Key Features for Guest Support:**
- ✅ **Guest Customers**: `is_guest = true` with `guest_email` and `guest_name`
- ✅ **Guest Payment Methods**: `is_guest = true` with `guest_email` for identification
- ✅ **Flexible CHECK Constraints**: Allow guests without requiring `user_id` or `organization_id`
- ✅ **Provider Agnostic**: Works with Stripe, PayPal, and other providers
- ✅ **Native-Payments Compatible**: Follows the exact schema specifications

---

## 🎯 **Use Cases Summary**

| Case | Authentication | Customer | Payment Method | Usage |
|------|---------------|----------|----------------|-------|
| **Guest One-time** | ❌ No | ❌ No | ❌ No | Single payment without saving data |
| **Registered Customer** | ✅ Yes | ✅ Yes | ✅ Yes | Recurring payments with saved cards |
| **Guest with Save** | ❌ No | ✅ Yes (guest) | ✅ Yes | Guest who wants to save their card |
| **Guest→User Conversion** | 🔄 After | 🔄 Convert | 🔄 Convert | Guest who registers after payment |

### **Conversion Process:**
1. **Preview**: `GET /bridge-payment/guest/preview-guest/:email` - See what data can be converted
2. **Convert**: `POST /bridge-payment/guest/convert-guest` - Convert all or specific guest data
3. **Selective**: Convert only specific customers/payment methods by providing IDs

---

## 🔐 **Authentication Headers**

### **For Registered Users:**
```bash
-H "Authorization: Bearer user_session_token_123"
```

### **For Guests:**
No authentication header required. Use `guest_data` in request body.

---

## 📋 **Common Payment Statuses**

| Status | Description |
|--------|-------------|
| `requires_confirmation` | Payment intent created, awaiting confirmation |
| `requires_action` | Additional action required (3D Secure, etc.) |
| `processing` | Payment is being processed |
| `succeeded` | Payment completed successfully |
| `canceled` | Payment was canceled |
| `failed` | Payment failed |

---

## 🚨 **Error Responses**

### **Validation Error (400)**
```json
{
  "error": "Validation failed",
  "status": 400,
  "timestamp": "2025-05-28T01:50:00.000Z",
  "details": [
    {
      "field": "amount_cents",
      "message": "Amount must be greater than 0"
    }
  ]
}
```

### **Authentication Error (401)**
```json
{
  "error": "Authentication required",
  "status": 401,
  "timestamp": "2025-05-28T01:50:00.000Z"
}
```

### **Not Found Error (404)**
```json
{
  "error": "Payment not found",
  "status": 404,
  "timestamp": "2025-05-28T01:50:00.000Z"
}
```

### **Server Error (500)**
```json
{
  "error": "Failed to create payment intent",
  "status": 500,
  "timestamp": "2025-05-28T01:50:00.000Z"
}
```

---

## 🌐 **Frontend Integration Examples**

### **JavaScript/React Example**
```javascript
// Create payment intent for guest
const createGuestPayment = async () => {
  const response = await fetch('/bridge-payment/payments/intents', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      amount_cents: 2000,
      currency: 'USD',
      provider_id: 'stripe',
      description: 'Online purchase',
      guest_data: {
        email: 'customer@example.com',
        name: 'John Doe'
      }
    })
  });

  const { client_secret, id } = await response.json();

  // Use with Stripe Elements
  const { error } = await stripe.confirmCardPayment(client_secret, {
    payment_method: {
      card: cardElement,
      billing_details: { name: 'John Doe' }
    }
  });

  if (!error) {
    console.log('Payment succeeded!');
  }
};

// Create payment with saved method for registered user
const createUserPayment = async (paymentMethodId) => {
  const response = await fetch('/bridge-payment/payments/intents', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${userToken}`
    },
    body: JSON.stringify({
      amount_cents: 5000,
      currency: 'USD',
      provider_id: 'stripe',
      payment_method_id: paymentMethodId,
      confirm: true,
      description: 'Purchase with saved card'
    })
  });

  const payment = await response.json();
  console.log('Payment status:', payment.status);
};
```

---

## 🔄 **Flow 7: Guest to User Conversion**

### **Step 1: Preview Guest Data**
```bash
curl -X GET http://localhost:3000/bridge-payment/guest/preview-guest/guest@example.com \
  -H "Content-Type: application/json" \
  -H "User-Agent: curl/7.68.0" \
  -H "Authorization: Bearer user_session_token_123"
```

**Response:**
```json
{
  "guest_email": "guest@example.com",
  "preview": {
    "customers": [
      {
        "id": "cus_guest_789",
        "provider_customer_id": "cus_stripe_guest_456",
        "provider_id": "stripe",
        "guest_name": "Pedro Lopez",
        "created_at": "2025-05-28T01:25:00.000Z"
      }
    ],
    "payment_methods": [
      {
        "id": "pm_guest_456",
        "provider_payment_method_id": "pm_stripe_guest_def456",
        "payment_type": "credit_card",
        "card_brand": "visa",
        "last_four": "5556",
        "created_at": "2025-05-28T01:30:00.000Z"
      }
    ]
  },
  "summary": {
    "total_customers": 1,
    "total_payment_methods": 1,
    "can_convert": true
  }
}
```

### **Step 2: Convert Guest Data to User**
```bash
curl -X POST http://localhost:3000/bridge-payment/guest/convert-guest \
  -H "Content-Type: application/json" \
  -H "User-Agent: curl/7.68.0" \
  -H "Authorization: Bearer user_session_token_123" \
  -d '{
    "guest_email": "guest@example.com"
  }'
```

**Response:**
```json
{
  "message": "Guest data converted successfully",
  "converted": {
    "customers": [
      {
        "id": "cus_guest_789",
        "provider_customer_id": "cus_stripe_guest_456",
        "provider_id": "stripe",
        "converted_at": "2025-05-28T02:00:00.000Z"
      }
    ],
    "payment_methods": [
      {
        "id": "pm_guest_456",
        "provider_payment_method_id": "pm_stripe_guest_def456",
        "payment_type": "credit_card",
        "last_four": "5556",
        "converted_at": "2025-05-28T02:00:00.000Z"
      }
    ]
  },
  "summary": {
    "total_customers_converted": 1,
    "total_payment_methods_converted": 1
  }
}
```

### **Step 3: Selective Conversion (Optional)**
```bash
# Convert only specific customers and payment methods
curl -X POST http://localhost:3000/bridge-payment/guest/convert-guest \
  -H "Content-Type: application/json" \
  -H "User-Agent: curl/7.68.0" \
  -H "Authorization: Bearer user_session_token_123" \
  -d '{
    "guest_email": "guest@example.com",
    "customer_ids": ["cus_guest_789"],
    "payment_method_ids": ["pm_guest_456"]
  }'
```

---

## 🔄 **Webhook Integration**

### **Webhook Endpoint**
```bash
POST http://localhost:3000/bridge-payment/webhooks/stripe
```

### **Webhook Events Handled**
- `payment_intent.succeeded`
- `payment_intent.payment_failed`
- `payment_method.attached`
- `customer.created`
- `customer.updated`

### **Webhook Payload Example**
```json
{
  "id": "evt_webhook_123",
  "object": "event",
  "type": "payment_intent.succeeded",
  "data": {
    "object": {
      "id": "pi_3RTYN3JH4Zr08WDG14fmMSKu",
      "amount": 2000,
      "currency": "usd",
      "status": "succeeded"
    }
  }
}
```

---

## 📞 **Support and Contact**

For technical support or questions about the Bridge-Payments API:

- **Documentation**: `/docs/API_FLOWS.md`
- **Health Check**: `GET /health`
- **API Status**: `GET /`

---

*Last updated: 2025-05-28*
