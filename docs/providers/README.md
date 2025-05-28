# Payment Providers

Bridge-Payments supports multiple payment providers through a unified adapter system. Each provider has its own capabilities and integration requirements.

## Supported Providers

| Provider | Status | Payment Types | Subscriptions | Saved Methods | Guest Checkout |
|----------|--------|---------------|---------------|---------------|----------------|
| **Stripe** | ✅ Active | Cards, Wallets, Bank | ✅ Yes | ✅ Yes | ✅ Yes |
| **PayPal** | ✅ Active | PayPal, Cards | ✅ Yes | ❌ No | ✅ Yes |
| **Authorize.net** | ✅ Active | Cards, ACH | ❌ No | ✅ Yes | ✅ Yes |

## Provider Architecture

### Adapter Pattern

Each provider implements a common interface:

```typescript
interface PaymentAdapter {
  // Core payment operations
  createPayment(data: CreatePaymentData): Promise<PaymentResult>;
  confirmPayment(intentId: string, data: ConfirmData): Promise<PaymentResult>;
  getPaymentStatus(paymentId: string): Promise<PaymentStatus>;
  
  // Optional operations (based on provider capabilities)
  createCustomer?(data: CustomerData): Promise<Customer>;
  savePaymentMethod?(data: PaymentMethodData): Promise<PaymentMethod>;
  createSubscription?(data: SubscriptionData): Promise<Subscription>;
  processRefund?(paymentId: string, amount?: number): Promise<Refund>;
  
  // Provider information
  getCapabilities(): ProviderCapabilities;
  getIntegrationInstructions(): IntegrationInstructions;
}
```

### Provider Capabilities

Each provider declares its capabilities:

```typescript
interface ProviderCapabilities {
  supports_saved_payment_methods: boolean;
  supports_tokenization: boolean;
  supports_guest_checkout: boolean;
  supported_payment_types: PaymentType[];
  supports_subscriptions: boolean;
  supports_refunds: boolean;
  supports_partial_refunds: boolean;
  supports_webhooks: boolean;
  supports_3d_secure: boolean;
  integration_type: 'redirect' | 'iframe' | 'api' | 'hybrid';
  requires_client_side_sdk: boolean;
}
```

## Configuration

### Environment Variables

```env
# Default provider
DEFAULT_PAYMENT_PROVIDER=stripe

# Enabled providers (comma-separated)
ENABLED_PROVIDERS=stripe,paypal,authorize_net

# Provider failover
PROVIDER_FAILOVER_ENABLED=true
PROVIDER_FAILOVER_ORDER=stripe,paypal,authorize_net
```

### Provider-Specific Configuration

Each provider requires its own configuration. See individual provider documentation:

- **[Stripe Setup](./stripe.md)** - Complete Stripe integration guide
- **[PayPal Setup](./paypal.md)** - PayPal configuration and setup
- **[Authorize.net Setup](./authorize-net.md)** - Authorize.net integration

## Provider Selection

### Automatic Selection

By default, the system uses the configured default provider:

```typescript
// Uses DEFAULT_PAYMENT_PROVIDER
POST /bridge-payment/payments
{
  "amount": 1000,
  "currency": "USD"
}
```

### Manual Selection

Specify provider in the request:

```typescript
POST /bridge-payment/payments
{
  "amount": 1000,
  "currency": "USD",
  "provider": "paypal"
}
```

### Failover Logic

When failover is enabled, the system automatically tries alternative providers:

```typescript
// If Stripe fails, try PayPal, then Authorize.net
const providers = ['stripe', 'paypal', 'authorize_net'];

for (const provider of providers) {
  try {
    const result = await processPayment(provider, paymentData);
    return result;
  } catch (error) {
    console.warn(`Provider ${provider} failed:`, error);
    continue;
  }
}

throw new Error('All payment providers failed');
```

## Provider Factory

### Dynamic Provider Creation

```typescript
// src/lib/providers/factory.ts
export class ProviderFactory {
  private static adapters: Map<string, PaymentAdapter> = new Map();
  
  static getAdapter(provider: string): PaymentAdapter {
    if (!this.adapters.has(provider)) {
      this.adapters.set(provider, this.createAdapter(provider));
    }
    return this.adapters.get(provider)!;
  }
  
  private static createAdapter(provider: string): PaymentAdapter {
    switch (provider) {
      case 'stripe':
        return new StripeAdapter({
          secretKey: process.env.STRIPE_SECRET_KEY!,
          webhookSecret: process.env.STRIPE_WEBHOOK_SECRET!
        });
        
      case 'paypal':
        return new PayPalAdapter({
          clientId: process.env.PAYPAL_CLIENT_ID!,
          clientSecret: process.env.PAYPAL_CLIENT_SECRET!,
          environment: process.env.PAYPAL_ENVIRONMENT!
        });
        
      case 'authorize_net':
        return new AuthorizeNetAdapter({
          apiLogin: process.env.AUTHORIZE_NET_API_LOGIN!,
          transactionKey: process.env.AUTHORIZE_NET_TRANSACTION_KEY!,
          environment: process.env.AUTHORIZE_NET_ENVIRONMENT!
        });
        
      default:
        throw new Error(`Unsupported payment provider: ${provider}`);
    }
  }
  
  static getAvailableProviders(): string[] {
    const enabled = process.env.ENABLED_PROVIDERS?.split(',') || [];
    return enabled.filter(provider => this.isProviderConfigured(provider));
  }
  
  private static isProviderConfigured(provider: string): boolean {
    switch (provider) {
      case 'stripe':
        return !!(process.env.STRIPE_SECRET_KEY);
      case 'paypal':
        return !!(process.env.PAYPAL_CLIENT_ID && process.env.PAYPAL_CLIENT_SECRET);
      case 'authorize_net':
        return !!(process.env.AUTHORIZE_NET_API_LOGIN && process.env.AUTHORIZE_NET_TRANSACTION_KEY);
      default:
        return false;
    }
  }
}
```

## Provider Information API

### Get Provider Capabilities

```typescript
GET /bridge-payment/providers

Response:
{
  "providers": [
    {
      "id": "stripe",
      "name": "Stripe",
      "capabilities": {
        "supports_saved_payment_methods": true,
        "supports_guest_checkout": true,
        "supported_payment_types": ["credit_card", "apple_pay", "google_pay"],
        "integration_type": "api",
        "requires_client_side_sdk": true
      },
      "endpoints": {
        "create_payment": "/bridge-payment/stripe/payments",
        "payment_methods": "/bridge-payment/stripe/payment-methods",
        "webhooks": "/bridge-payment/webhooks/stripe"
      }
    }
  ],
  "default_provider": "stripe"
}
```

### Get Provider-Specific Information

```typescript
GET /bridge-payment/providers/stripe/capabilities

Response:
{
  "provider": "stripe",
  "capabilities": {
    "supports_saved_payment_methods": true,
    "supports_tokenization": true,
    "supports_guest_checkout": true,
    "supported_payment_types": ["credit_card", "bank_account", "apple_pay", "google_pay"],
    "supports_subscriptions": true,
    "supports_refunds": true,
    "supports_partial_refunds": true,
    "supports_webhooks": true,
    "supports_3d_secure": true,
    "integration_type": "api",
    "requires_client_side_sdk": true
  },
  "integration": {
    "client_sdk_url": "https://js.stripe.com/v3/",
    "flow_description": "Use Stripe Elements for secure card input, then confirm payment with client secret",
    "documentation_url": "https://stripe.com/docs"
  }
}
```

## Error Handling

### Provider-Specific Errors

Each provider may return different error formats. The adapter normalizes these:

```typescript
// Stripe error
{
  "error": {
    "code": "PAYMENT_FAILED",
    "message": "Your card was declined",
    "details": {
      "provider": "stripe",
      "provider_error": "card_declined",
      "decline_code": "insufficient_funds"
    }
  }
}

// PayPal error
{
  "error": {
    "code": "PAYMENT_FAILED",
    "message": "Payment could not be processed",
    "details": {
      "provider": "paypal",
      "provider_error": "INSTRUMENT_DECLINED",
      "debug_id": "paypal_debug_123"
    }
  }
}
```

### Failover Error Handling

When failover is enabled, errors from failed providers are logged but not returned to the client unless all providers fail:

```typescript
{
  "error": {
    "code": "ALL_PROVIDERS_FAILED",
    "message": "Payment could not be processed by any provider",
    "details": {
      "attempted_providers": ["stripe", "paypal", "authorize_net"],
      "last_error": {
        "provider": "authorize_net",
        "error": "gateway_timeout"
      }
    }
  }
}
```

## Testing Providers

### Test Mode Configuration

Each provider supports test/sandbox mode:

```env
# Stripe test mode
STRIPE_SECRET_KEY=sk_test_...
STRIPE_PUBLISHABLE_KEY=pk_test_...

# PayPal sandbox
PAYPAL_ENVIRONMENT=sandbox

# Authorize.net sandbox
AUTHORIZE_NET_ENVIRONMENT=sandbox
```

### Test Cards and Accounts

Each provider documentation includes test credentials:

- **[Stripe Test Cards](./stripe.md#test-cards)**
- **[PayPal Test Accounts](./paypal.md#test-accounts)**
- **[Authorize.net Test Data](./authorize-net.md#test-data)**

## Adding New Providers

### Implementation Steps

1. **Create Adapter**: Implement the `PaymentAdapter` interface
2. **Define Capabilities**: Specify what the provider supports
3. **Add to Factory**: Register in `ProviderFactory`
4. **Environment Config**: Add required environment variables
5. **Documentation**: Create provider-specific docs
6. **Tests**: Add comprehensive test coverage

### Example: Adding Square

```typescript
// src/lib/providers/square/square-adapter.ts
export class SquareAdapter implements PaymentAdapter {
  private client: SquareApi;
  
  constructor(config: SquareConfig) {
    this.client = new SquareApi({
      accessToken: config.accessToken,
      environment: config.environment
    });
  }
  
  getCapabilities(): ProviderCapabilities {
    return {
      supports_saved_payment_methods: true,
      supports_tokenization: true,
      supports_guest_checkout: true,
      supported_payment_types: ['credit_card'],
      supports_subscriptions: false,
      supports_refunds: true,
      supports_partial_refunds: true,
      supports_webhooks: true,
      supports_3d_secure: false,
      integration_type: 'api',
      requires_client_side_sdk: true
    };
  }
  
  async createPayment(data: CreatePaymentData): Promise<PaymentResult> {
    // Square-specific implementation
  }
  
  // ... other required methods
}
```

## Next Steps

- **[Stripe Setup](./stripe.md)** - Complete Stripe integration
- **[PayPal Setup](./paypal.md)** - PayPal configuration
- **[Authorize.net Setup](./authorize-net.md)** - Authorize.net setup
- **[Webhooks](../webhooks.md)** - Webhook implementation
- **[Testing](../testing.md)** - Provider testing guide
