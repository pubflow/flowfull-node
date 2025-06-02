# 💙 Stripe Integration Guide

Complete guide for integrating Stripe payments with Bridge-Payments API. Support for credit cards, digital wallets, and bank transfers with advanced authorization/capture capabilities.

## 🚀 Quick Start

### 1. Basic Stripe Payment

```javascript
// Create a Stripe payment
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
    provider: 'stripe'
  })
});

const payment = await response.json();
// Use payment.client_secret with Stripe Elements
```

### 2. Guest Checkout with Stripe

```javascript
// Guest payment with Stripe
const response = await fetch('/bridge-payment/payments', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    amount: 1999, // $19.99
    currency: 'USD',
    description: 'One-time Purchase',
    provider: 'stripe',
    guest_data: {
      email: 'customer@example.com',
      name: 'John Doe'
    }
  })
});

const payment = await response.json();
// Handle Stripe Elements integration
```

## 💳 Supported Payment Methods

| Payment Method | Description | Availability |
|---------------|-------------|--------------|
| **Credit Cards** | Visa, Mastercard, Amex, Discover | Global |
| **Debit Cards** | Direct debit card processing | Global |
| **Apple Pay** | iOS native payment method | Global |
| **Google Pay** | Android native payment method | Global |
| **Bank Transfers** | ACH direct bank payments | US, Europe |
| **SEPA** | European bank transfers | Europe |

> **Note**: Venmo is **not supported by Stripe**. Venmo is exclusively available through PayPal.

## 🌍 Multi-Currency Support

Stripe supports 135+ currencies with automatic conversion:

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
- **And 130+ more...**

## 🔧 Frontend Integration

### React Example with Stripe Elements

```jsx
import { loadStripe } from '@stripe/stripe-js';
import { Elements, CardElement, useStripe, useElements } from '@stripe/react-stripe-js';

const stripePromise = loadStripe('pk_test_your_publishable_key');

function CheckoutForm({ amount, onSuccess }) {
  const stripe = useStripe();
  const elements = useElements();

  const handleSubmit = async (event) => {
    event.preventDefault();

    if (!stripe || !elements) return;

    // Create payment intent
    const response = await fetch('/bridge-payment/payments', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Session-ID': userSessionId
      },
      body: JSON.stringify({
        amount: amount * 100, // Convert to cents
        currency: 'USD',
        provider: 'stripe'
      })
    });

    const payment = await response.json();

    // Confirm payment with Stripe
    const result = await stripe.confirmCardPayment(payment.client_secret, {
      payment_method: {
        card: elements.getElement(CardElement),
        billing_details: {
          name: 'Customer Name',
        },
      }
    });

    if (result.error) {
      console.error(result.error.message);
    } else {
      onSuccess(result.paymentIntent);
    }
  };

  return (
    <form onSubmit={handleSubmit}>
      <CardElement />
      <button type="submit" disabled={!stripe}>
        Pay ${amount}
      </button>
    </form>
  );
}

function StripeCheckout({ amount, onSuccess }) {
  return (
    <Elements stripe={stripePromise}>
      <CheckoutForm amount={amount} onSuccess={onSuccess} />
    </Elements>
  );
}
```

### Vanilla JavaScript Example

```javascript
// Initialize Stripe
const stripe = Stripe('pk_test_your_publishable_key');
const elements = stripe.elements();
const cardElement = elements.create('card');
cardElement.mount('#card-element');

// Create payment
async function createPayment() {
  const response = await fetch('/bridge-payment/payments', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Session-ID': userSessionId
    },
    body: JSON.stringify({
      amount: 2999, // $29.99
      currency: 'USD',
      provider: 'stripe'
    })
  });

  const payment = await response.json();
  
  // Confirm payment
  const result = await stripe.confirmCardPayment(payment.client_secret, {
    payment_method: {
      card: cardElement,
      billing_details: {
        name: 'Customer Name'
      }
    }
  });

  if (result.error) {
    console.error('Payment failed:', result.error.message);
  } else {
    console.log('Payment successful:', result.paymentIntent);
  }
}
```

## 🔄 Payment Flow

### 1. Create Payment Intent
```http
POST /bridge-payment/payments
{
  "amount": 2999,
  "currency": "USD",
  "provider": "stripe",
  "description": "Premium Plan"
}
```

**Response:**
```json
{
  "id": "pi_stripe_123",
  "status": "requires_confirmation",
  "client_secret": "pi_123_secret_abc",
  "amount": 2999,
  "currency": "USD"
}
```

### 2. User Completes Payment with Stripe Elements

User enters card details and confirms payment using Stripe's secure form.

### 3. Payment Confirmed
```javascript
// Stripe automatically confirms the payment
// No additional API call needed to Bridge-Payments
```

**Final Status:**
```json
{
  "id": "pi_stripe_123",
  "status": "succeeded",
  "amount": 2999,
  "completed_at": "2024-01-15T10:05:00Z"
}
```

## 🔒 Authorization vs Capture

Stripe supports two payment flows: **immediate capture** (default) and **manual capture** (authorization first).

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
    provider: 'stripe'
    // capture_method not specified = automatic capture
  })
});

// After user confirms payment with Stripe Elements
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
    provider: 'stripe',
    capture_method: 'manual', // ← This creates authorization
    description: 'Hotel reservation'
  })
});

// Step 2: User confirms payment (authorization only)
const result = await stripe.confirmCardPayment(payment.client_secret, {
  payment_method: { card: cardElement }
});

console.log(result.paymentIntent.status); // "requires_capture"

// Get updated payment status
const authorized = await fetch(`/bridge-payment/payments/${payment.id}`);
console.log(authorized.status); // "authorized"
console.log(authorized.authorized_amount_cents); // 2999
console.log(authorized.captured_amount_cents); // 0
console.log(authorized.remaining_amount_cents); // 2999

// Step 3: Capture funds when ready (e.g., when shipping)
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
    provider: 'stripe',
    capture_method: 'manual'
  })
});

// User confirms authorization with Stripe Elements
const result = await stripe.confirmCardPayment(payment.client_secret, {
  payment_method: { card: cardElement }
});

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

### Multiple Partial Captures

```javascript
// Stripe allows multiple captures up to the authorized amount
const payment = await createAuthorization(10000); // $100 authorized

// First capture: $40
await fetch(`/bridge-payment/payments/${payment.id}/capture`, {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'X-Session-ID': userSessionId
  },
  body: JSON.stringify({ amount_cents: 4000 })
});

// Second capture: $30
await fetch(`/bridge-payment/payments/${payment.id}/capture`, {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'X-Session-ID': userSessionId
  },
  body: JSON.stringify({ amount_cents: 3000 })
});

// Check status after multiple captures
const status = await fetch(`/bridge-payment/payments/${payment.id}`);
console.log(status.authorized_amount_cents); // 10000
console.log(status.captured_amount_cents); // 7000 (4000 + 3000)
console.log(status.remaining_amount_cents); // 3000
console.log(status.capture_status); // "partially_captured"

// The remaining $30 can still be captured or will be released after 7 days
```

### Authorization Expiration

```javascript
// Stripe authorizations expire after 7 days
const payment = await createAuthorization(2999);

// Check authorization status
const status = await fetch(`/bridge-payment/payments/${payment.id}`);
console.log(status.authorization_expires_at); // "2024-01-22T10:00:00Z"

// If not captured within 7 days, authorization expires
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
    provider: 'stripe',
    capture_method: 'manual',
    description: 'Order #12345'
  })
});

// 2. Customer confirms payment with Stripe Elements - funds are authorized
const result = await stripe.confirmCardPayment(order.client_secret, {
  payment_method: { card: cardElement }
});

// 3. When item ships - capture payment
await fetch(`/bridge-payment/payments/${order.id}/capture`, {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'X-Session-ID': userSessionId
  }
});
```

#### Hotel Reservation
```javascript
// 1. Guest makes reservation - authorize for estimated total
const reservation = await fetch('/bridge-payment/payments', {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'X-Session-ID': userSessionId
  },
  body: JSON.stringify({
    amount: 25000, // $250 estimated (room + incidentals)
    currency: 'USD',
    provider: 'stripe',
    capture_method: 'manual',
    description: 'Hotel reservation'
  })
});

// 2. Guest confirms with Stripe Elements
await stripe.confirmCardPayment(reservation.client_secret, {
  payment_method: { card: cardElement }
});

// 3. At check-out - capture actual amount
const actualAmount = calculateFinalBill(); // $180 actual
await fetch(`/bridge-payment/payments/${reservation.id}/capture`, {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'X-Session-ID': userSessionId
  },
  body: JSON.stringify({
    amount_cents: actualAmount // Only charge actual amount
  })
});

// Remaining $70 is automatically released
```

#### Service with Variable Pricing
```javascript
// 1. Authorize maximum possible amount
const service = await createAuthorization(10000); // $100 max

// 2. As service is used, capture incrementally
await capturePartial(service.id, 2500); // $25 for first hour
await capturePartial(service.id, 2500); // $25 for second hour
await capturePartial(service.id, 1500); // $15 for partial third hour

// Total captured: $65, Remaining: $35 automatically released
```

## 🔔 Webhook Events

Stripe sends webhooks for payment status updates:

### Authorization/Capture Events
- `payment_intent.amount_capturable_updated` - Authorization amount changed
- `payment_intent.succeeded` - Payment captured successfully
- `payment_intent.canceled` - Authorization canceled
- `charge.captured` - Specific capture completed

### Common Events
- `payment_intent.succeeded` - Payment completed successfully
- `payment_intent.payment_failed` - Payment failed
- `payment_intent.canceled` - Payment was canceled
- `payment_method.attached` - Payment method saved to customer

### Webhook Handling
```javascript
// Your webhook endpoint receives Stripe events
app.post('/bridge-payment/webhooks/stripe', (req, res) => {
  // Bridge-Payments automatically processes Stripe webhooks
  // Your app will receive updates via your own webhook system
});
```

## 💸 Refunds

### Full Refund
```http
POST /bridge-payment/payments/pi_stripe_123/refund
{
  "reason": "Customer requested refund"
}
```

### Partial Refund
```http
POST /bridge-payment/payments/pi_stripe_123/refund
{
  "amount": 1000,
  "reason": "Partial refund for shipping"
}
```

## 🔐 Security Features

- **PCI DSS Level 1** - Highest level of security compliance
- **3D Secure 2.0** - Strong customer authentication
- **Radar Fraud Detection** - Machine learning fraud prevention
- **Webhook Signature Verification** - Validates webhook authenticity
- **Encryption** - All data encrypted in transit and at rest

## ⚙️ Configuration

### Environment Variables
```env
# Stripe Configuration
STRIPE_PUBLISHABLE_KEY=pk_test_your_publishable_key
STRIPE_SECRET_KEY=sk_test_your_secret_key
STRIPE_WEBHOOK_SECRET=whsec_your_webhook_secret
STRIPE_ENVIRONMENT=test  # or 'live' for production
```

### Enable Stripe Provider
```env
ENABLED_PROVIDERS=stripe,paypal
DEFAULT_PAYMENT_PROVIDER=stripe
```

## 🌟 Best Practices

### 1. Use Appropriate Capture Method
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
// Monitor authorization expiration
const payment = await getPayment(paymentId);
const expiresAt = new Date(payment.authorization_expires_at);
const now = new Date();

if (expiresAt < now) {
  console.warn('Authorization expired, create new payment');
}
```

### 3. Implement Proper Error Handling
```javascript
try {
  const payment = await createStripePayment();
  // Handle success
} catch (error) {
  if (error.message.includes('card_declined')) {
    // Handle declined card
    showCardDeclinedError();
  } else if (error.message.includes('insufficient_funds')) {
    // Handle insufficient funds
    showInsufficientFundsError();
  }
}
```

## 🚨 Common Issues

### Issue: Authorization Expired
**Solution:** Create a new payment intent
```javascript
if (payment.status === 'authorization_expired') {
  // Create new payment intent
  const newPayment = await createPayment(originalAmount);
}
```

### Issue: Partial Capture Exceeds Authorized Amount
**Solution:** Validate capture amount
```javascript
const maxCapturable = payment.remaining_amount_cents;
if (captureAmount > maxCapturable) {
  throw new Error(`Cannot capture ${captureAmount}, max: ${maxCapturable}`);
}
```

### Issue: Multiple Captures Not Working
**Solution:** Ensure Stripe account supports multiple captures
```javascript
// Some Stripe accounts may not support multiple partial captures
// Check with Stripe support if needed
```

## 📞 Support

- **Stripe Documentation**: https://stripe.com/docs
- **Bridge-Payments Issues**: Contact your development team
- **Stripe Dashboard**: https://dashboard.stripe.com/

---

**Next Steps:**
- [API Reference](../api-reference.md) - Complete API documentation
- [Webhook Setup](../webhooks.md) - Configure real-time updates
- [Testing Guide](../examples/) - Test your Stripe integration
