# 💙 PayPal Integration Guide

Complete guide for integrating PayPal payments with Bridge-Payments API. Support for PayPal accounts, Venmo, and credit cards through PayPal's secure platform.

## 🚀 Quick Start

### 1. Basic PayPal Payment

```javascript
// Create a PayPal payment
const response = await fetch('/bridge-payment/payments', {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'X-Session-ID': userSessionId
  },
  body: JSON.stringify({
    amount: 2999, // $29.99
    currency: 'USD',
    description: 'Premium Plan',
    provider: 'paypal'
  })
});

const payment = await response.json();
// Redirect user to payment.next_action.redirect_to_url.url
```

### 2. Guest Checkout with PayPal

```javascript
// Guest payment with PayPal
const response = await fetch('/bridge-payment/payments', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    amount: 1999, // $19.99
    currency: 'USD',
    description: 'One-time Purchase',
    provider: 'paypal',
    guest_data: {
      email: 'customer@example.com',
      name: 'John Doe'
    }
  })
});

const payment = await response.json();
// Handle PayPal redirect flow
```

## 💳 Supported Payment Methods

| Payment Method | Description | Availability |
|---------------|-------------|--------------|
| **PayPal Account** | Pay with PayPal balance or linked bank/card | Global |
| **Venmo** | Mobile payment app (PayPal exclusive) | US only |
| **Credit Cards** | Visa, Mastercard, Amex, Discover via PayPal | Global |
| **PayPal Credit** | Buy now, pay later option | US, UK, Germany |
| **Bank Transfers** | Direct bank account payments | Select countries |

> **Note**: Venmo is **exclusively available through PayPal**. Stripe does not support Venmo payments.

## 🌍 Multi-Currency Support

PayPal supports 100+ currencies with automatic conversion:

### Primary Currencies
- **USD** - US Dollar
- **EUR** - Euro
- **GBP** - British Pound
- **CAD** - Canadian Dollar
- **AUD** - Australian Dollar
- **JPY** - Japanese Yen

### Regional Currencies
- **MXN** - Mexican Peso
- **BRL** - Brazilian Real
- **INR** - Indian Rupee
- **SGD** - Singapore Dollar
- **HKD** - Hong Kong Dollar
- **And 90+ more...**

## 🔧 Frontend Integration

### React Example with PayPal SDK

```jsx
import { PayPalScriptProvider, PayPalButtons } from "@paypal/react-paypal-js";

function PayPalCheckout({ amount, onSuccess }) {
  const createOrder = async () => {
    const response = await fetch('/bridge-payment/payments', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Session-ID': userSessionId
      },
      body: JSON.stringify({
        amount: amount * 100, // Convert to cents
        currency: 'USD',
        provider: 'paypal'
      })
    });
    
    const payment = await response.json();
    return payment.provider_intent_id; // PayPal order ID
  };

  const onApprove = async (data) => {
    const response = await fetch(`/bridge-payment/payments/${data.orderID}/confirm`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Session-ID': userSessionId
      }
    });
    
    const result = await response.json();
    onSuccess(result);
  };

  return (
    <PayPalScriptProvider options={{ "client-id": "your-paypal-client-id" }}>
      <PayPalButtons
        createOrder={createOrder}
        onApprove={onApprove}
        style={{ layout: "vertical" }}
      />
    </PayPalScriptProvider>
  );
}
```

### Vanilla JavaScript Example

```javascript
// Initialize PayPal SDK
paypal.Buttons({
  createOrder: async function() {
    const response = await fetch('/bridge-payment/payments', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Session-ID': userSessionId
      },
      body: JSON.stringify({
        amount: 2999, // $29.99
        currency: 'USD',
        provider: 'paypal'
      })
    });
    
    const payment = await response.json();
    return payment.provider_intent_id;
  },
  
  onApprove: async function(data) {
    const response = await fetch(`/bridge-payment/payments/${data.orderID}/confirm`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Session-ID': userSessionId
      }
    });
    
    const result = await response.json();
    console.log('Payment successful:', result);
  }
}).render('#paypal-button-container');
```

## 🔄 Payment Flow

### 1. Create Payment Intent
```http
POST /bridge-payment/payments
{
  "amount": 2999,
  "currency": "USD",
  "provider": "paypal",
  "description": "Premium Plan"
}
```

**Response:**
```json
{
  "id": "paypal_order_123",
  "status": "requires_confirmation",
  "client_secret": "paypal_order_123",
  "next_action": {
    "type": "redirect_to_url",
    "redirect_to_url": {
      "url": "https://www.paypal.com/checkoutnow?token=EC-123",
      "return_url": "https://yoursite.com/payment/success"
    }
  }
}
```

### 2. User Completes Payment on PayPal

User is redirected to PayPal to complete payment with their preferred method.

### 3. Confirm Payment
```http
POST /bridge-payment/payments/paypal_order_123/confirm
```

**Response:**
```json
{
  "id": "paypal_order_123",
  "status": "succeeded",
  "amount": 2999,
  "provider_payment_id": "CAPTURE123",
  "completed_at": "2024-01-15T10:05:00Z"
}
```

## 🔔 Webhook Events

PayPal sends webhooks for payment status updates:

### Authorization/Capture Events
- `PAYMENT.AUTHORIZATION.CREATED` - Authorization completed
- `PAYMENT.AUTHORIZATION.VOIDED` - Authorization canceled
- `PAYMENT.CAPTURE.COMPLETED` - Payment captured successfully
- `PAYMENT.CAPTURE.DENIED` - Capture failed
- `PAYMENT.CAPTURE.PENDING` - Capture pending review
- `CHECKOUT.ORDER.APPROVED` - Order approved (authorization ready)

### Common Events
- `PAYMENT.CAPTURE.COMPLETED` - Payment successful
- `PAYMENT.CAPTURE.DENIED` - Payment failed
- `PAYMENT.CAPTURE.REFUNDED` - Payment refunded
- `CHECKOUT.ORDER.APPROVED` - Order approved by customer
- `CHECKOUT.ORDER.COMPLETED` - Order completed (captured)

### Webhook Handling
```javascript
// Your webhook endpoint receives PayPal events
app.post('/bridge-payment/webhooks/paypal', (req, res) => {
  // Bridge-Payments automatically processes PayPal webhooks
  // Your app will receive updates via your own webhook system

  // Example: Handle authorization events
  if (req.body.event_type === 'PAYMENT.AUTHORIZATION.CREATED') {
    console.log('Payment authorized, ready for capture');
  }

  if (req.body.event_type === 'PAYMENT.CAPTURE.COMPLETED') {
    console.log('Payment captured successfully');
  }
});
```

## 💸 Refunds

### Full Refund
```http
POST /bridge-payment/payments/paypal_order_123/refund
{
  "reason": "Customer requested refund"
}
```

### Partial Refund
```http
POST /bridge-payment/payments/paypal_order_123/refund
{
  "amount": 1000,
  "reason": "Partial refund for shipping"
}
```

## 🔒 Authorization vs Capture

PayPal supports two payment flows: **immediate capture** (default) and **manual capture** (authorization first).

### When to Use Each Flow

| Flow | Use Case | Example |
|------|----------|---------|
| **Immediate Capture** | Digital products, services | Software subscriptions, digital downloads |
| **Manual Capture** | Physical products, reservations | E-commerce shipping, hotel bookings |

### Immediate Capture (Default)

```javascript
// Funds are captured immediately when payment is confirmed
const payment = await fetch('/bridge-payment/payments', {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'X-Session-ID': userSessionId
  },
  body: JSON.stringify({
    amount: 2999, // $29.99
    currency: 'USD',
    provider: 'paypal'
    // capture_method not specified = automatic capture
  })
});

// User is redirected to PayPal and completes payment
// Payment is immediately captured and funds are available
console.log(result.status); // "succeeded"
```

### Manual Capture (Authorization)

```javascript
// Step 1: Create payment intent with manual capture
const payment = await fetch('/bridge-payment/payments', {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'X-Session-ID': userSessionId
  },
  body: JSON.stringify({
    amount: 2999, // $29.99
    currency: 'USD',
    provider: 'paypal',
    capture_method: 'manual', // ← This creates authorization
    description: 'Hotel reservation'
  })
});

// Step 2: User completes authorization on PayPal
// Redirect user to payment.next_action.redirect_to_url.url
window.location.href = payment.next_action.redirect_to_url.url;

// Step 3: After user returns, confirm authorization
const authorized = await fetch(`/bridge-payment/payments/${payment.id}/confirm`, {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'X-Session-ID': userSessionId
  }
});

console.log(authorized.status); // "authorized"
console.log(authorized.authorized_amount_cents); // 2999
console.log(authorized.captured_amount_cents); // 0
console.log(authorized.remaining_amount_cents); // 2999

// Step 4: Capture funds when ready (e.g., when shipping)
const captured = await fetch(`/bridge-payment/payments/${payment.id}/capture`, {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'X-Session-ID': userSessionId
  }
});

console.log(captured.status); // "succeeded"
console.log(captured.captured_amount_cents); // 2999
console.log(captured.remaining_amount_cents); // 0
```

### Partial Capture

```javascript
// Authorize $50, but only capture $30
const payment = await fetch('/bridge-payment/payments', {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'X-Session-ID': userSessionId
  },
  body: JSON.stringify({
    amount: 5000, // $50.00 authorized
    currency: 'USD',
    provider: 'paypal',
    capture_method: 'manual'
  })
});

// User completes authorization on PayPal
// After user returns and authorization is confirmed

// Capture only $30 (e.g., actual service cost)
const partialCapture = await fetch(`/bridge-payment/payments/${payment.id}/capture`, {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'X-Session-ID': userSessionId
  },
  body: JSON.stringify({
    amount_cents: 3000 // Only capture $30 of the $50 authorized
  })
});

console.log(partialCapture.authorized_amount_cents); // 5000
console.log(partialCapture.captured_amount_cents); // 3000
console.log(partialCapture.remaining_amount_cents); // 2000
console.log(partialCapture.capture_status); // "partially_captured"

// The remaining $20 is automatically released back to customer
```

### Authorization Expiration

```javascript
// PayPal authorizations expire after 3 days (shorter than Stripe's 7 days)
const payment = await createAuthorization(2999);

// Check authorization status
const status = await fetch(`/bridge-payment/payments/${payment.id}`);
console.log(status.authorization_expires_at); // "2024-01-18T10:00:00Z"

// If not captured within 3 days, authorization expires
// Funds are automatically released back to customer
// Status becomes "authorization_expired"
```

### Real-World Examples

#### E-commerce with Shipping
```javascript
// 1. Customer places order - authorize payment
const order = await fetch('/bridge-payment/payments', {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'X-Session-ID': userSessionId
  },
  body: JSON.stringify({
    amount: 5999, // $59.99
    currency: 'USD',
    provider: 'paypal',
    capture_method: 'manual',
    description: 'Order #12345'
  })
});

// 2. Customer completes authorization on PayPal
window.location.href = order.next_action.redirect_to_url.url;

// 3. When item ships - capture payment
await fetch(`/bridge-payment/payments/${order.id}/capture`, {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'X-Session-ID': userSessionId
  }
});
```

#### Marketplace with Variable Fees
```javascript
// 1. Authorize maximum possible amount (item + fees)
const marketplace = await fetch('/bridge-payment/payments', {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'X-Session-ID': userSessionId
  },
  body: JSON.stringify({
    amount: 12000, // $120 (item $100 + max fees $20)
    currency: 'USD',
    provider: 'paypal',
    capture_method: 'manual',
    description: 'Marketplace purchase'
  })
});

// 2. User authorizes on PayPal
window.location.href = marketplace.next_action.redirect_to_url.url;

// 3. Calculate actual fees and capture exact amount
const actualTotal = itemPrice + calculatedFees; // $115 actual
await fetch(`/bridge-payment/payments/${marketplace.id}/capture`, {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'X-Session-ID': userSessionId
  },
  body: JSON.stringify({
    amount_cents: actualTotal // Only charge actual amount
  })
});

// Remaining $5 is automatically released
```

#### Service with Usage-Based Billing
```javascript
// 1. Authorize for estimated usage
const service = await fetch('/bridge-payment/payments', {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'X-Session-ID': userSessionId
  },
  body: JSON.stringify({
    amount: 10000, // $100 estimated usage
    currency: 'USD',
    provider: 'paypal',
    capture_method: 'manual',
    description: 'Cloud service usage'
  })
});

// 2. User authorizes on PayPal
window.location.href = service.next_action.redirect_to_url.url;

// 3. At end of billing period, capture actual usage
const actualUsage = calculateUsage(); // $73 actual
await fetch(`/bridge-payment/payments/${service.id}/capture`, {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'X-Session-ID': userSessionId
  },
  body: JSON.stringify({
    amount_cents: actualUsage
  })
});

// Remaining $27 is automatically released
```

### Key Differences from Stripe

| Aspect | Stripe | PayPal |
|--------|--------|--------|
| **Authorization Period** | 7 days | 3 days |
| **Multiple Captures** | ✅ Yes | ❌ Limited |
| **User Experience** | Elements (embedded) | Redirect flow |
| **Payment Methods** | Cards, wallets | PayPal, Venmo, cards |

## 🔐 Security Features

- **OAuth 2.0** - Secure API authentication
- **Webhook Signature Verification** - Validates webhook authenticity
- **PCI Compliance** - No sensitive data stored
- **Fraud Protection** - PayPal's built-in fraud detection
- **3D Secure** - Additional security for card payments

## ⚙️ Configuration

### Environment Variables
```env
# PayPal Configuration
PAYPAL_CLIENT_ID=your_paypal_client_id
PAYPAL_CLIENT_SECRET=your_paypal_client_secret
PAYPAL_ENVIRONMENT=sandbox  # or 'live' for production
PAYPAL_WEBHOOK_ID=your_webhook_id
PAYPAL_BN_CODE=your_partner_attribution_code
```

### Enable PayPal Provider
```env
ENABLED_PROVIDERS=stripe,paypal
DEFAULT_PAYMENT_PROVIDER=stripe
```

## 🌟 Best Practices

### 1. Choose Appropriate Capture Method
```javascript
// Digital products - immediate capture
const digitalProduct = {
  capture_method: 'automatic' // or omit for default
};

// Physical products - manual capture
const physicalProduct = {
  capture_method: 'manual'
};
```

### 2. Handle Authorization Expiration
```javascript
// PayPal authorizations expire in 3 days (shorter than Stripe)
const payment = await getPayment(paymentId);
const expiresAt = new Date(payment.authorization_expires_at);
const now = new Date();

if (expiresAt < now) {
  console.warn('Authorization expired, create new payment');
  // Create new payment intent
}
```

### 3. Handle Redirects Gracefully
```javascript
// Always handle the redirect flow properly
if (payment.next_action?.type === 'redirect_to_url') {
  window.location.href = payment.next_action.redirect_to_url.url;
}
```

### 4. Implement Proper Error Handling
```javascript
try {
  const payment = await createPayPalPayment();
  // Handle success
} catch (error) {
  if (error.message.includes('PayPal')) {
    // Handle PayPal-specific errors
    showPayPalError(error.message);
  }
}
```

### 5. Use Webhooks for Status Updates
```javascript
// Don't rely only on frontend callbacks
// Always verify payment status via webhooks
app.post('/webhook/payment-completed', (req, res) => {
  const { payment_id, status } = req.body;
  if (status === 'succeeded') {
    // Fulfill order
    fulfillOrder(payment_id);
  }
});
```

### 6. Validate Capture Amounts
```javascript
// Ensure capture amount doesn't exceed authorized amount
const maxCapturable = payment.remaining_amount_cents;
if (captureAmount > maxCapturable) {
  throw new Error(`Cannot capture ${captureAmount}, max: ${maxCapturable}`);
}
```

## 🚨 Common Issues

### Issue: Authorization Expired Before Capture
**Solution:** Monitor expiration and create new payment if needed
```javascript
if (payment.status === 'authorization_expired') {
  // Create new payment intent
  const newPayment = await createPayment(originalAmount);
  // Redirect user to new authorization
  window.location.href = newPayment.next_action.redirect_to_url.url;
}
```

### Issue: Partial Capture Exceeds Authorized Amount
**Solution:** Validate capture amount before attempting
```javascript
const maxCapturable = payment.remaining_amount_cents;
if (captureAmount > maxCapturable) {
  throw new Error(`Cannot capture ${captureAmount}, max: ${maxCapturable}`);
}
```

### Issue: PayPal Redirect Not Working
**Solution:** Ensure return_url and cancel_url are properly configured
```javascript
{
  "return_url": "https://yoursite.com/payment/success",
  "cancel_url": "https://yoursite.com/payment/cancel"
}
```

### Issue: Currency Not Supported
**Solution:** Check PayPal's supported currencies for your region
```javascript
// Validate currency before creating payment
const supportedCurrencies = ['USD', 'EUR', 'GBP', 'CAD', 'AUD'];
if (!supportedCurrencies.includes(currency)) {
  throw new Error(`Currency ${currency} not supported`);
}
```

### Issue: Webhook Signature Verification Failed
**Solution:** Ensure webhook ID is correctly configured
```env
PAYPAL_WEBHOOK_ID=your_actual_webhook_id_from_paypal_dashboard
```

## 📞 Support

- **PayPal Developer Docs**: https://developer.paypal.com/
- **Bridge-Payments Issues**: Contact your development team
- **PayPal Sandbox**: https://developer.paypal.com/developer/accounts/

---

**Next Steps:**
- [API Reference](../api-reference.md) - Complete API documentation
- [Webhook Setup](../webhooks.md) - Configure real-time updates
- [Testing Guide](../examples/) - Test your PayPal integration
