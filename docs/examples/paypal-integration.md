# 💙 PayPal Integration Examples

Complete examples for integrating PayPal payments with Bridge-Payments API. Includes React, Vue, and vanilla JavaScript implementations.

## 🚀 Quick Start Examples

### 1. Basic PayPal Payment (React)

```jsx
import React, { useState } from 'react';
import { PayPalScriptProvider, PayPalButtons } from "@paypal/react-paypal-js";

function PayPalCheckout({ amount, onSuccess, onError }) {
  const [loading, setLoading] = useState(false);

  const createOrder = async () => {
    setLoading(true);
    try {
      const response = await fetch('/bridge-payment/payments', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Session-ID': localStorage.getItem('session_id')
        },
        body: JSON.stringify({
          amount: amount * 100, // Convert to cents
          currency: 'USD',
          description: 'Premium Plan Purchase',
          provider: 'paypal'
        })
      });

      if (!response.ok) {
        throw new Error('Failed to create payment');
      }

      const payment = await response.json();
      return payment.provider_intent_id; // PayPal order ID
    } catch (error) {
      onError(error);
      throw error;
    } finally {
      setLoading(false);
    }
  };

  const onApprove = async (data) => {
    setLoading(true);
    try {
      const response = await fetch(`/bridge-payment/payments/${data.orderID}/confirm`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Session-ID': localStorage.getItem('session_id')
        }
      });

      if (!response.ok) {
        throw new Error('Failed to confirm payment');
      }

      const result = await response.json();
      onSuccess(result);
    } catch (error) {
      onError(error);
    } finally {
      setLoading(false);
    }
  };

  return (
    <PayPalScriptProvider 
      options={{ 
        "client-id": process.env.REACT_APP_PAYPAL_CLIENT_ID,
        currency: "USD"
      }}
    >
      <div className="paypal-container">
        {loading && <div className="loading">Processing...</div>}
        <PayPalButtons
          createOrder={createOrder}
          onApprove={onApprove}
          onError={onError}
          style={{
            layout: "vertical",
            color: "blue",
            shape: "rect",
            label: "paypal"
          }}
          disabled={loading}
        />
      </div>
    </PayPalScriptProvider>
  );
}

export default PayPalCheckout;
```

### 2. Guest Checkout with PayPal

```jsx
import React, { useState } from 'react';

function GuestPayPalCheckout({ amount, onSuccess }) {
  const [guestData, setGuestData] = useState({
    email: '',
    name: ''
  });

  const handleGuestPayment = async () => {
    try {
      const response = await fetch('/bridge-payment/payments', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          amount: amount * 100,
          currency: 'USD',
          description: 'Guest Purchase',
          provider: 'paypal',
          guest_data: guestData
        })
      });

      const payment = await response.json();
      
      // Redirect to PayPal
      if (payment.next_action?.type === 'redirect_to_url') {
        window.location.href = payment.next_action.redirect_to_url.url;
      }
    } catch (error) {
      console.error('Payment failed:', error);
    }
  };

  return (
    <div className="guest-checkout">
      <h3>Guest Checkout</h3>
      <input
        type="email"
        placeholder="Email"
        value={guestData.email}
        onChange={(e) => setGuestData({...guestData, email: e.target.value})}
      />
      <input
        type="text"
        placeholder="Full Name"
        value={guestData.name}
        onChange={(e) => setGuestData({...guestData, name: e.target.value})}
      />
      <button onClick={handleGuestPayment}>
        Pay with PayPal
      </button>
    </div>
  );
}
```

### 3. Vanilla JavaScript Implementation

```html
<!DOCTYPE html>
<html>
<head>
    <title>PayPal Integration</title>
    <script src="https://www.paypal.com/sdk/js?client-id=YOUR_PAYPAL_CLIENT_ID&currency=USD"></script>
</head>
<body>
    <div id="paypal-button-container"></div>
    
    <script>
        paypal.Buttons({
            createOrder: async function() {
                const response = await fetch('/bridge-payment/payments', {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                        'X-Session-ID': sessionStorage.getItem('session_id')
                    },
                    body: JSON.stringify({
                        amount: 2999, // $29.99
                        currency: 'USD',
                        description: 'Product Purchase',
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
                        'X-Session-ID': sessionStorage.getItem('session_id')
                    }
                });
                
                const result = await response.json();
                
                if (result.status === 'succeeded') {
                    alert('Payment successful!');
                    // Redirect to success page
                    window.location.href = '/success';
                } else {
                    alert('Payment failed');
                }
            },
            
            onError: function(err) {
                console.error('PayPal error:', err);
                alert('Payment failed. Please try again.');
            }
        }).render('#paypal-button-container');
    </script>
</body>
</html>
```

### 4. Vue.js Implementation

```vue
<template>
  <div class="paypal-checkout">
    <div v-if="loading" class="loading">
      Processing payment...
    </div>
    <div ref="paypalContainer" id="paypal-button-container"></div>
  </div>
</template>

<script>
export default {
  name: 'PayPalCheckout',
  props: {
    amount: {
      type: Number,
      required: true
    }
  },
  data() {
    return {
      loading: false
    };
  },
  mounted() {
    this.loadPayPalScript();
  },
  methods: {
    async loadPayPalScript() {
      if (window.paypal) {
        this.renderPayPalButtons();
        return;
      }

      const script = document.createElement('script');
      script.src = `https://www.paypal.com/sdk/js?client-id=${process.env.VUE_APP_PAYPAL_CLIENT_ID}&currency=USD`;
      script.onload = () => this.renderPayPalButtons();
      document.head.appendChild(script);
    },

    renderPayPalButtons() {
      window.paypal.Buttons({
        createOrder: this.createOrder,
        onApprove: this.onApprove,
        onError: this.onError
      }).render(this.$refs.paypalContainer);
    },

    async createOrder() {
      this.loading = true;
      try {
        const response = await this.$http.post('/bridge-payment/payments', {
          amount: this.amount * 100,
          currency: 'USD',
          provider: 'paypal'
        });
        
        return response.data.provider_intent_id;
      } catch (error) {
        this.onError(error);
        throw error;
      } finally {
        this.loading = false;
      }
    },

    async onApprove(data) {
      this.loading = true;
      try {
        const response = await this.$http.post(`/bridge-payment/payments/${data.orderID}/confirm`);
        
        this.$emit('success', response.data);
      } catch (error) {
        this.onError(error);
      } finally {
        this.loading = false;
      }
    },

    onError(error) {
      console.error('PayPal error:', error);
      this.$emit('error', error);
    }
  }
};
</script>
```

## 🔄 Advanced Examples

### 5. Subscription with PayPal

```javascript
// Create a subscription payment
async function createPayPalSubscription(planId, customerId) {
  const response = await fetch('/bridge-payment/subscriptions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Session-ID': sessionId
    },
    body: JSON.stringify({
      customer_id: customerId,
      plan_id: planId,
      provider: 'paypal',
      payment_method_type: 'paypal'
    })
  });

  const subscription = await response.json();
  
  // Handle PayPal subscription approval
  if (subscription.next_action?.type === 'redirect_to_url') {
    window.location.href = subscription.next_action.redirect_to_url.url;
  }
  
  return subscription;
}
```

### 6. Multi-Currency Support

```javascript
// Dynamic currency selection
function PayPalMultiCurrency({ amount, currency, onSuccess }) {
  const supportedCurrencies = ['USD', 'EUR', 'GBP', 'CAD', 'AUD', 'JPY'];
  
  const createOrder = async () => {
    const response = await fetch('/bridge-payment/payments', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Session-ID': sessionId
      },
      body: JSON.stringify({
        amount: amount * 100,
        currency: currency,
        provider: 'paypal'
      })
    });
    
    const payment = await response.json();
    return payment.provider_intent_id;
  };

  return (
    <PayPalScriptProvider 
      options={{ 
        "client-id": paypalClientId,
        currency: currency
      }}
    >
      <PayPalButtons
        createOrder={createOrder}
        onApprove={onApprove}
        style={{
          layout: "vertical",
          color: "blue"
        }}
      />
    </PayPalScriptProvider>
  );
}
```

### 7. Error Handling and Retry Logic

```javascript
class PayPalPaymentHandler {
  constructor(maxRetries = 3) {
    this.maxRetries = maxRetries;
    this.retryCount = 0;
  }

  async processPayment(paymentData) {
    try {
      const payment = await this.createPayment(paymentData);
      this.retryCount = 0; // Reset on success
      return payment;
    } catch (error) {
      return this.handleError(error, paymentData);
    }
  }

  async createPayment(paymentData) {
    const response = await fetch('/bridge-payment/payments', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Session-ID': sessionId
      },
      body: JSON.stringify({
        ...paymentData,
        provider: 'paypal'
      })
    });

    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.message || 'Payment failed');
    }

    return response.json();
  }

  async handleError(error, paymentData) {
    console.error('PayPal payment error:', error);

    // Check if error is retryable
    if (this.isRetryableError(error) && this.retryCount < this.maxRetries) {
      this.retryCount++;
      console.log(`Retrying payment (attempt ${this.retryCount}/${this.maxRetries})`);
      
      // Wait before retry
      await new Promise(resolve => setTimeout(resolve, 1000 * this.retryCount));
      
      return this.processPayment(paymentData);
    }

    // If not retryable or max retries reached, throw error
    throw error;
  }

  isRetryableError(error) {
    const retryableErrors = [
      'network error',
      'timeout',
      'service unavailable',
      'internal server error'
    ];
    
    return retryableErrors.some(retryableError => 
      error.message.toLowerCase().includes(retryableError)
    );
  }
}

// Usage
const paymentHandler = new PayPalPaymentHandler();

try {
  const payment = await paymentHandler.processPayment({
    amount: 2999,
    currency: 'USD',
    description: 'Premium Plan'
  });
  console.log('Payment successful:', payment);
} catch (error) {
  console.error('Payment failed after retries:', error);
}
```

## 🔔 Webhook Handling

### 8. Frontend Webhook Listener

```javascript
// Listen for payment status updates via WebSocket or Server-Sent Events
class PaymentStatusListener {
  constructor(paymentId) {
    this.paymentId = paymentId;
    this.eventSource = null;
  }

  startListening(onStatusUpdate) {
    // Using Server-Sent Events for real-time updates
    this.eventSource = new EventSource(`/bridge-payment/payments/${this.paymentId}/events`);
    
    this.eventSource.onmessage = (event) => {
      const data = JSON.parse(event.data);
      onStatusUpdate(data);
    };

    this.eventSource.onerror = (error) => {
      console.error('Payment status listener error:', error);
    };
  }

  stopListening() {
    if (this.eventSource) {
      this.eventSource.close();
      this.eventSource = null;
    }
  }
}

// Usage
const statusListener = new PaymentStatusListener(paymentId);
statusListener.startListening((status) => {
  if (status.status === 'succeeded') {
    // Payment completed successfully
    showSuccessMessage();
    redirectToSuccessPage();
  } else if (status.status === 'failed') {
    // Payment failed
    showErrorMessage(status.error_message);
  }
});
```

## 🧪 Testing Examples

### 9. PayPal Sandbox Testing

```javascript
// Test with PayPal sandbox accounts
const testPayPalPayment = async () => {
  const testData = {
    amount: 1000, // $10.00
    currency: 'USD',
    description: 'Test Payment',
    provider: 'paypal',
    // Use test guest data
    guest_data: {
      email: 'test@example.com',
      name: 'Test User'
    }
  };

  try {
    const payment = await fetch('/bridge-payment/payments', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(testData)
    }).then(r => r.json());

    console.log('Test payment created:', payment);
    
    // In sandbox, you can use test PayPal accounts:
    // Buyer: sb-buyer@personal.example.com / password123
    // Seller: sb-seller@business.example.com / password123
    
  } catch (error) {
    console.error('Test payment failed:', error);
  }
};
```

---

**Next Steps:**
- [PayPal Configuration](../providers/paypal.md) - Complete setup guide
- [Webhook Implementation](../webhooks.md) - Handle real-time updates
- [API Reference](../api-reference.md) - Complete API documentation
