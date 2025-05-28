# Code Examples

This directory contains practical examples for integrating with Bridge-Payments API.

## Example Categories

### 1. Basic Payment Flows
- **[Authenticated Payments](./authenticated-payments.md)** - Standard user payments
- **[Guest Checkout](./guest-checkout.md)** - Payments without user accounts
- **[Payment Methods](./payment-methods.md)** - Saving and managing payment methods

### 2. Frontend Integration
- **[React Integration](./frontend/react-example.md)** - React/Next.js examples
- **[Vue Integration](./frontend/vue-example.md)** - Vue.js examples
- **[Vanilla JavaScript](./frontend/vanilla-js-example.md)** - Pure JavaScript examples

### 3. Backend Integration
- **[Node.js Client](./backend/nodejs-client.md)** - Node.js integration
- **[Python Client](./backend/python-client.md)** - Python integration
- **[cURL Examples](./backend/curl-examples.md)** - Command-line examples

### 4. Provider-Specific Examples
- **[Stripe Examples](./providers/stripe-examples.md)** - Stripe-specific flows
- **[PayPal Examples](./providers/paypal-examples.md)** - PayPal integration
- **[Authorize.net Examples](./providers/authorize-net-examples.md)** - Authorize.net flows

### 5. Advanced Use Cases
- **[Subscription Payments](./advanced/subscriptions.md)** - Recurring payments
- **[Multi-Provider Setup](./advanced/multi-provider.md)** - Provider failover
- **[Webhook Handling](./advanced/webhooks.md)** - Processing webhooks

## Quick Start Examples

### Simple Payment (Authenticated User)

```javascript
// Frontend: Create payment
const response = await fetch('/bridge-payment/payments', {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'X-Session-ID': userSessionId
  },
  body: JSON.stringify({
    amount: 2999, // $29.99
    currency: 'USD',
    description: 'Premium Membership',
    provider: 'stripe'
  })
});

const payment = await response.json();

// Use client_secret with Stripe Elements
const { error } = await stripe.confirmCardPayment(payment.client_secret, {
  payment_method: {
    card: cardElement,
    billing_details: {
      name: 'John Doe'
    }
  }
});

if (error) {
  console.error('Payment failed:', error);
} else {
  console.log('Payment succeeded!');
}
```

### Guest Checkout

```javascript
// Frontend: Guest payment
const response = await fetch('/bridge-payment/payments', {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json'
  },
  body: JSON.stringify({
    amount: 2999,
    currency: 'USD',
    description: 'Premium Membership',
    provider: 'stripe',
    guest_data: {
      email: 'guest@example.com',
      name: 'John Doe'
    },
    payment_method: {
      type: 'card',
      card: {
        number: '4242424242424242',
        exp_month: 12,
        exp_year: 2025,
        cvc: '123'
      }
    }
  })
});

const payment = await response.json();
console.log('Guest payment created:', payment);
```

### Save Payment Method

```javascript
// Frontend: Save payment method for future use
const response = await fetch('/bridge-payment/payment-methods', {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'X-Session-ID': userSessionId
  },
  body: JSON.stringify({
    provider: 'stripe',
    payment_method: {
      type: 'card',
      card: {
        number: '4242424242424242',
        exp_month: 12,
        exp_year: 2025,
        cvc: '123'
      }
    },
    billing_details: {
      name: 'John Doe',
      email: 'john@example.com'
    },
    is_default: true
  })
});

const paymentMethod = await response.json();
console.log('Payment method saved:', paymentMethod);
```

### Using Saved Payment Method

```javascript
// Frontend: Pay with saved method
const response = await fetch('/bridge-payment/payments', {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'X-Session-ID': userSessionId
  },
  body: JSON.stringify({
    amount: 2999,
    currency: 'USD',
    description: 'Premium Membership',
    payment_method_id: 'pm_123', // Saved payment method ID
    provider: 'stripe'
  })
});

const payment = await response.json();
```

## Error Handling Examples

### Basic Error Handling

```javascript
async function createPayment(paymentData) {
  try {
    const response = await fetch('/bridge-payment/payments', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Session-ID': userSessionId
      },
      body: JSON.stringify(paymentData)
    });

    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.error.message);
    }

    return await response.json();
  } catch (error) {
    console.error('Payment creation failed:', error);
    throw error;
  }
}
```

### Provider-Specific Error Handling

```javascript
async function handlePaymentError(error) {
  if (error.error?.code === 'PAYMENT_FAILED') {
    const details = error.error.details;
    
    switch (details.provider) {
      case 'stripe':
        if (details.provider_error === 'card_declined') {
          return 'Your card was declined. Please try a different payment method.';
        }
        break;
        
      case 'paypal':
        if (details.provider_error === 'INSTRUMENT_DECLINED') {
          return 'PayPal payment was declined. Please check your PayPal account.';
        }
        break;
    }
  }
  
  return 'Payment failed. Please try again.';
}
```

## Testing Examples

### Test Payment with Stripe

```javascript
// Use Stripe test card numbers
const testPayment = {
  amount: 1000, // $10.00
  currency: 'USD',
  payment_method: {
    type: 'card',
    card: {
      number: '4242424242424242', // Visa test card
      exp_month: 12,
      exp_year: 2025,
      cvc: '123'
    }
  }
};

// Test declined payment
const declinedPayment = {
  amount: 1000,
  currency: 'USD',
  payment_method: {
    type: 'card',
    card: {
      number: '4000000000000002', // Declined test card
      exp_month: 12,
      exp_year: 2025,
      cvc: '123'
    }
  }
};
```

### Test Guest Checkout

```javascript
const guestTestPayment = {
  amount: 1000,
  currency: 'USD',
  guest_data: {
    email: 'test@example.com',
    name: 'Test User'
  },
  payment_method: {
    type: 'card',
    card: {
      number: '4242424242424242',
      exp_month: 12,
      exp_year: 2025,
      cvc: '123'
    }
  }
};
```

## Integration Patterns

### React Hook for Payments

```javascript
// usePayments.js
import { useState, useCallback } from 'react';

export function usePayments() {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  const createPayment = useCallback(async (paymentData) => {
    setLoading(true);
    setError(null);

    try {
      const response = await fetch('/bridge-payment/payments', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Session-ID': getSessionId()
        },
        body: JSON.stringify(paymentData)
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error.message);
      }

      return await response.json();
    } catch (err) {
      setError(err.message);
      throw err;
    } finally {
      setLoading(false);
    }
  }, []);

  return { createPayment, loading, error };
}
```

### Vue Composable for Payments

```javascript
// usePayments.js
import { ref } from 'vue';

export function usePayments() {
  const loading = ref(false);
  const error = ref(null);

  const createPayment = async (paymentData) => {
    loading.value = true;
    error.value = null;

    try {
      const response = await fetch('/bridge-payment/payments', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Session-ID': getSessionId()
        },
        body: JSON.stringify(paymentData)
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error.message);
      }

      return await response.json();
    } catch (err) {
      error.value = err.message;
      throw err;
    } finally {
      loading.value = false;
    }
  };

  return { createPayment, loading, error };
}
```

## Environment-Specific Examples

### Development Environment

```javascript
// Development configuration
const config = {
  apiUrl: 'http://localhost:3001/bridge-payment',
  stripePublishableKey: 'pk_test_...',
  paypalClientId: 'sandbox_client_id'
};
```

### Production Environment

```javascript
// Production configuration
const config = {
  apiUrl: 'https://api.yourdomain.com/bridge-payment',
  stripePublishableKey: 'pk_live_...',
  paypalClientId: 'live_client_id'
};
```

## Next Steps

Explore the detailed examples in each category:

1. **Start with [Authenticated Payments](./authenticated-payments.md)** for basic integration
2. **Review [Guest Checkout](./guest-checkout.md)** for guest payment flows
3. **Check [Frontend Examples](./frontend/)** for your specific framework
4. **Implement [Webhook Handling](./advanced/webhooks.md)** for payment updates
5. **Test with [Provider Examples](./providers/)** for specific provider features
