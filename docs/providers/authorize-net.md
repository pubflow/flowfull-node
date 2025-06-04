# 🏦 Authorize.Net Integration Guide

Complete guide for integrating Authorize.Net payments with Bridge-Payments API. Support for credit cards, debit cards, and ACH/eCheck with advanced authorization/capture capabilities.

## 🚀 Quick Start

### 1. Basic Authorize.Net Payment

```javascript
// Create an Authorize.Net payment
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
    provider: 'authorize_net'
  })
});

const payment = await response.json();
console.log('Payment created:', payment);
```

### 2. Authorization with Manual Capture

```javascript
// Create authorization (hold funds)
const authResponse = await fetch('/bridge-payment/payments', {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'X-Session-ID': userSessionId
  },
  body: JSON.stringify({
    amount: 2999,
    currency: 'USD',
    description: 'Order #12345',
    provider: 'authorize_net',
    capture_method: 'manual' // Authorization only
  })
});

const authorization = await authResponse.json();

// Later, capture the funds
const captureResponse = await fetch(`/bridge-payment/payments/${authorization.id}/capture`, {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'X-Session-ID': userSessionId
  }
  // Note: Authorize.Net only supports full capture, not partial
});

const captured = await captureResponse.json();
console.log('Payment captured:', captured);
```

## 🔧 Configuration

### Environment Variables

```env
# Authorize.Net Configuration
AUTHORIZE_NET_API_LOGIN=your_api_login_id
AUTHORIZE_NET_TRANSACTION_KEY=your_transaction_key
AUTHORIZE_NET_ENVIRONMENT=sandbox  # or 'production'
AUTHORIZE_NET_SIGNATURE_KEY=your_signature_key  # For webhooks

# Enable Authorize.Net
ENABLED_PROVIDERS=stripe,paypal,authorize_net
```

### Sandbox vs Production

**Sandbox (Testing):**
- API Login ID: Use your sandbox credentials
- Transaction Key: Use your sandbox transaction key
- Environment: `sandbox`
- Test URL: `https://apitest.authorize.net/xml/v1/request.api`

**Production:**
- API Login ID: Use your live credentials
- Transaction Key: Use your live transaction key
- Environment: `production`
- Live URL: `https://api.authorize.net/xml/v1/request.api`

## 💳 Payment Methods

### Supported Payment Types

| Payment Method | Authorize.Net Support | Bridge-Payments API |
|---------------|----------------------|-------------------|
| **Credit Cards** | ✅ Visa, MC, Amex, Discover | `credit_card` |
| **Debit Cards** | ✅ All major networks | `debit_card` |
| **ACH/eCheck** | ✅ Checking, Savings, Business | `bank_account` |
| **Digital Wallets** | ❌ Not supported | N/A |

### Credit Card Payment

```javascript
const payment = await fetch('/bridge-payment/payments', {
  method: 'POST',
  body: JSON.stringify({
    amount: 1999,
    currency: 'USD',
    provider: 'authorize_net',
    payment_method: {
      type: 'credit_card',
      card: {
        number: '4111111111111111',
        exp_month: 12,
        exp_year: 2025,
        cvc: '123'
      },
      billing_details: {
        name: 'John Doe',
        email: 'john@example.com',
        address: {
          line1: '123 Main St',
          city: 'Anytown',
          state: 'CA',
          postal_code: '12345',
          country: 'US'
        }
      }
    }
  })
});
```

### ACH/eCheck Payment

```javascript
const payment = await fetch('/bridge-payment/payments', {
  method: 'POST',
  body: JSON.stringify({
    amount: 5000,
    currency: 'USD',
    provider: 'authorize_net',
    payment_method: {
      type: 'bank_account',
      bank_account: {
        account_type: 'checking',
        routing_number: '121000248',
        account_number: '123456789',
        account_holder_name: 'John Doe',
        bank_name: 'Test Bank'
      }
    }
  })
});
```

## 👤 Customer Management

### Create Customer Profile

```javascript
const customer = await fetch('/bridge-payment/customers', {
  method: 'POST',
  body: JSON.stringify({
    email: 'customer@example.com',
    name: 'Jane Smith',
    provider: 'authorize_net'
  })
});
```

### Save Payment Method

```javascript
const paymentMethod = await fetch('/bridge-payment/payment-methods', {
  method: 'POST',
  body: JSON.stringify({
    provider: 'authorize_net',
    customer_id: 'cust_12345',
    type: 'credit_card',
    card: {
      number: '4111111111111111',
      exp_month: 12,
      exp_year: 2025,
      cvc: '123'
    }
  })
});
```

### Use Saved Payment Method

```javascript
const payment = await fetch('/bridge-payment/payments', {
  method: 'POST',
  body: JSON.stringify({
    amount: 2999,
    currency: 'USD',
    provider: 'authorize_net',
    customer_id: 'cust_12345',
    payment_method_id: 'pm_authorize_net_67890'
  })
});
```

## 🔄 Authorization & Capture

### Authorization Flow

1. **Create Authorization** - Hold funds on customer's card
2. **Capture Authorization** - Actually charge the held funds
3. **Void Authorization** - Release held funds without charging

```javascript
// Step 1: Authorize (hold funds)
const auth = await fetch('/bridge-payment/payments', {
  method: 'POST',
  body: JSON.stringify({
    amount: 2999,
    currency: 'USD',
    provider: 'authorize_net',
    capture_method: 'manual'
  })
});

// Step 2: Capture (charge funds)
const capture = await fetch(`/bridge-payment/payments/${auth.id}/capture`, {
  method: 'POST'
  // Note: amount_cents not supported for partial capture
});

// Alternative: Void (cancel authorization)
const void = await fetch(`/bridge-payment/payments/${auth.id}/cancel`, {
  method: 'POST'
});
```

### ⚠️ Authorize.Net Limitations

- **Single Capture Only**: Unlike Stripe, Authorize.Net only supports one full capture per authorization
- **No Partial Captures**: You cannot capture less than the authorized amount
- **30-Day Expiry**: Authorizations expire after 30 days

## 💰 Refunds

### Full Refund

```javascript
const refund = await fetch('/bridge-payment/refunds', {
  method: 'POST',
  body: JSON.stringify({
    payment_intent_id: 'pi_authorize_net_12345',
    reason: 'requested_by_customer'
  })
});
```

### Partial Refund

```javascript
const refund = await fetch('/bridge-payment/refunds', {
  method: 'POST',
  body: JSON.stringify({
    payment_intent_id: 'pi_authorize_net_12345',
    amount_cents: 1000, // Refund $10.00 of original amount
    reason: 'partial_refund'
  })
});
```

## 🔔 Webhooks

### Supported Events

| Event Type | Description |
|------------|-------------|
| `payment.authorized` | Payment authorized (funds held) |
| `payment.succeeded` | Payment captured successfully |
| `payment.canceled` | Payment voided |
| `payment.refunded` | Payment refunded |
| `payment.settled` | Payment settled by Authorize.Net |
| `customer.created` | Customer profile created |
| `payment_method.attached` | Payment method saved |

### Webhook Setup

1. **Configure Webhook URL** in Authorize.Net merchant interface
2. **Set Signature Key** in environment variables
3. **Handle Events** in your application

```javascript
// Webhook endpoint
app.post('/webhooks/authorize_net', async (req, res) => {
  const signature = req.headers['x-anet-signature'];
  const payload = req.body;

  try {
    const event = await authorizeNetAdapter.verifyWebhook(
      JSON.stringify(payload),
      signature
    );

    switch (event.type) {
      case 'payment.succeeded':
        console.log('Payment succeeded:', event.data);
        break;
      case 'payment.refunded':
        console.log('Payment refunded:', event.data);
        break;
    }

    res.status(200).send('OK');
  } catch (error) {
    console.error('Webhook verification failed:', error);
    res.status(400).send('Invalid signature');
  }
});
```

## 🛡️ Security & Compliance

### PCI Compliance
- **Level 1 PCI DSS** certified
- **Tokenization** for stored payment methods
- **No raw card data** stored in your system

### Fraud Prevention
- **Address Verification Service (AVS)**
- **CVV verification**
- **Advanced Fraud Detection Suite (AFDS)** available

## 🌍 Currency Support

Authorize.Net primarily supports **USD** transactions. Limited international currency support available.

```javascript
// Supported
const payment = { currency: 'USD', provider: 'authorize_net' };

// Limited support - check with Authorize.Net
const intlPayment = { currency: 'CAD', provider: 'authorize_net' };
```

## 🔧 Error Handling

### Common Error Codes

| Code | Description | Solution |
|------|-------------|----------|
| `E00001` | An error occurred during processing | Check API credentials |
| `E00003` | Invalid request format | Validate request data |
| `E00007` | User authentication failed | Check API Login ID and Transaction Key |
| `E00027` | Transaction not found | Verify transaction ID |

### Error Response Format

```javascript
{
  "error": {
    "type": "authorize_net_error",
    "code": "E00007",
    "message": "User authentication failed due to invalid authentication values.",
    "provider": "authorize_net"
  }
}
```

## 📊 Testing

### Test Card Numbers

| Card Type | Number | CVV | Expiry |
|-----------|--------|-----|--------|
| **Visa** | 4111111111111111 | 123 | 12/25 |
| **Mastercard** | 5424000000000015 | 123 | 12/25 |
| **American Express** | 370000000000002 | 1234 | 12/25 |
| **Discover** | 6011000000000012 | 123 | 12/25 |

### Test Bank Account

```javascript
{
  "account_type": "checking",
  "routing_number": "121000248",
  "account_number": "123456789",
  "account_holder_name": "Test Account"
}
```

## 🚀 Best Practices

1. **Always use HTTPS** in production
2. **Validate webhook signatures** for security
3. **Handle authorization expiry** (30 days)
4. **Use customer profiles** for recurring payments
5. **Implement proper error handling**
6. **Test thoroughly** in sandbox environment

## 📚 Additional Resources

- [Authorize.Net Developer Documentation](https://developer.authorize.net/)
- [API Reference](https://developer.authorize.net/api/reference/)
- [Sandbox Testing Guide](https://developer.authorize.net/hello_world/testing_guide/)
- [Webhook Documentation](https://developer.authorize.net/api/reference/features/webhooks.html)
