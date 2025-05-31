# Bridge-Payments API

A comprehensive, production-ready payment processing system built with **Bun + Hono + Kysely** following **native-payments** standards. Supports complete payment workflows including customers, payment methods, addresses, payment intents, and real-time webhooks.

## 🚀 Key Features

### 💳 **Complete Payment Ecosystem**
- **Payment Intents**: Secure payment processing with 3D Secure support
- **Payment Methods**: Token-based and direct card data handling
- **Customer Management**: Authenticated users and guest checkout
- **Address Management**: Billing and shipping addresses with guest support
- **Real-time Webhooks**: Automatic event processing with signature validation

### 🔧 **Technical Excellence**
- **Multi-Provider Support**: Stripe, PayPal, Authorize.net with extensible architecture
- **Multi-Database**: PostgreSQL, MySQL, LibSQL support with Kysely ORM
- **Guest Checkout**: Complete user-less payment flows
- **Type-Safe**: Full TypeScript with Zod validation
- **High Performance**: Built on Bun runtime with Hono framework
- **Security First**: Rate limiting, authentication, PCI compliance ready

### 🌐 **Enterprise Ready**
- **Flowless Integration**: Seamless session validation and user management
- **3D Secure Support**: SCA compliance for European payments
- **Webhook Processing**: Idempotent event handling with retry logic
- **Analytics Ready**: Payment tracking and reporting capabilities
- **Scalable Architecture**: Designed for high-volume payment processing

## 📋 Requirements

- **Bun** >= 1.0.0
- **Database**: PostgreSQL, MySQL, or LibSQL
- **Node.js** >= 18 (for compatibility)

## 🛠️ Installation

```bash
# Clone the repository
git clone <repository-url>
cd bridge-payments

# Install dependencies
bun install

# Copy environment configuration
cp .env.example .env

# Configure your environment variables
# Edit .env with your database and provider credentials
```

## ⚙️ Configuration

### Environment Variables

```bash
# Server Configuration
NODE_ENV=development
PORT=3000
HOST=0.0.0.0

# Database Configuration
DATABASE_URL=postgresql://user:password@localhost:5432/bridge_payments
# or
DATABASE_URL=mysql://user:password@localhost:3306/bridge_payments
# or
DATABASE_URL=file:./bridge_payments.db

# Flowless Integration
FLOWLESS_API_URL=http://localhost:8000
FLOWLESS_API_KEY=your_flowless_api_key

# Payment Providers
STRIPE_SECRET_KEY=sk_test_your_stripe_secret_key
STRIPE_WEBHOOK_SECRET=whsec_your_stripe_webhook_secret

PAYPAL_CLIENT_ID=your_paypal_client_id
PAYPAL_CLIENT_SECRET=your_paypal_client_secret
PAYPAL_WEBHOOK_ID=your_paypal_webhook_id

# Features
GUEST_CHECKOUT_ENABLED=true
ENABLED_PROVIDERS=stripe,paypal

# Performance & Compression
COMPRESSION_ENABLED=true
COMPRESSION_FORCE_DISABLE=false  # Set to true if CompressionStream errors occur

# Security
RATE_LIMIT_REQUESTS=500
RATE_LIMIT_WINDOW=900000
```

## 🚀 Quick Start

### 1. Setup Database

```bash
# Run database migrations
bun run db:migrate

# Initialize payment providers
bun run init-providers

# Verify database setup
bun run check-tables
```

### 2. Start Development Server

```bash
# Start in development mode
bun run dev

# Or start in production mode
bun run start
```

### 3. Test the API

```bash
# Health check
curl http://localhost:3000/health

# API overview
curl http://localhost:3000/

# Create a payment
curl -X POST http://localhost:3000/bridge-payment/payments \
  -H "Content-Type: application/json" \
  -d '{
    "amount_cents": 2000,
    "currency": "USD",
    "provider_id": "stripe"
  }'
```

## 📚 Documentation

### 🔥 **Live API Documentation**
- [**Customers API**](live-docs/customers-api.md) - Customer management for users and guests
- [**Payment Methods API**](live-docs/payment-methods-api.md) - Secure payment method handling
- [**Payments API**](live-docs/payments-api.md) - Payment intents and processing
- [**Addresses API**](live-docs/addresses-api.md) - Billing and shipping address management
- [**Webhooks API**](live-docs/webhooks-api.md) - Real-time event processing

### 📖 **Core Documentation**
- [Database Schema](docs/database-schema.md) - Complete database structure and relationships
- [Configuration Guide](docs/configuration.md) - Environment and provider setup
- [Architecture Overview](docs/architecture.md) - System design and components

### 🔧 **Integration Guides**
- [Provider Setup](docs/provider-setup.md) - Configure Stripe, PayPal, Authorize.net
- [Flowless Integration](docs/flowless-integration.md) - Session validation setup
- [Guest Checkout Guide](docs/guest-checkout.md) - Complete user-less payment flows
- [3D Secure Implementation](docs/3d-secure.md) - SCA compliance and authentication
- [Webhook Integration](docs/webhook-integration.md) - Event handling best practices

### 🎯 **Use Case Guides**
- [E-commerce Integration](docs/ecommerce-guide.md) - Complete online store setup
- [SaaS Subscriptions](docs/saas-guide.md) - Recurring payment implementation
- [Marketplace Payments](docs/marketplace-guide.md) - Multi-vendor payment flows
- [Mobile App Integration](docs/mobile-guide.md) - React Native and mobile apps

## 🔗 API Endpoints

### 🏠 **Core Endpoints**
- `GET /health` - Health check and system status
- `GET /` - API overview and available endpoints

### 👥 **Customer Management**
- `POST /bridge-payment/customers` - Create customer (authenticated/guest)
- `GET /bridge-payment/customers/{id}` - Get customer details
- `PUT /bridge-payment/customers/{id}` - Update customer information
- `DELETE /bridge-payment/customers/{id}` - Delete customer
- `GET /bridge-payment/customers` - List user customers

### 💳 **Payment Methods**
- `POST /bridge-payment/payment-methods` - Create payment method (token-based)
- `POST /bridge-payment/payment-methods/direct` - Create payment method (direct card data)
- `GET /bridge-payment/payment-methods/{id}` - Get payment method details
- `GET /bridge-payment/payment-methods/customer/{customerId}` - List customer payment methods
- `DELETE /bridge-payment/payment-methods/{id}` - Delete payment method (requires customer_id)

### 💰 **Payment Processing (Payment Intents)**
- `POST /bridge-payment/payments/intents` - Create payment intent
- `POST /bridge-payment/payments/intents/{id}/confirm` - Confirm payment intent
- `GET /bridge-payment/payments/{id}` - Get payment details
- `GET /bridge-payment/payments` - List user payments
- `POST /bridge-payment/payments/{id}/cancel` - Cancel payment intent

### 📍 **Address Management**
- `POST /bridge-payment/addresses` - Create address (authenticated/guest)
- `GET /bridge-payment/addresses/{id}` - Get address details
- `PUT /bridge-payment/addresses/{id}` - Update address
- `DELETE /bridge-payment/addresses/{id}` - Delete address
- `GET /bridge-payment/addresses` - List user addresses
- `GET /bridge-payment/addresses/customer/{customerId}` - List customer addresses

### 🔔 **Webhooks & Events**
- `POST /bridge-payment/webhooks/stripe` - Stripe webhook endpoint
- `POST /bridge-payment/webhooks/paypal` - PayPal webhook endpoint
- `POST /bridge-payment/webhooks/{providerId}` - Generic provider webhooks
- `GET /bridge-payment/webhooks/stats` - Webhook statistics
- `GET /bridge-payment/webhooks/provider/{providerId}` - Provider webhook history
- `POST /bridge-payment/webhooks/process` - Process unprocessed webhooks
- `DELETE /bridge-payment/webhooks/cleanup` - Cleanup old webhook data

## 🔧 Development Commands

```bash
# Development
bun run dev              # Start development server
bun run build            # Build for production
bun run start            # Start production server

# Database
bun run db:migrate       # Run database migrations
bun run db:rollback      # Rollback last migration
bun run check-tables     # Verify database tables

# Utilities
bun run init-providers   # Initialize payment providers
bun run validate-config  # Validate configuration
bun run test            # Run tests (if available)
```

## 🔒 Security Features

- **Rate Limiting**: 500 requests per 15 minutes
- **Webhook Signature Validation**: Stripe and PayPal signatures
- **Session Validation**: Flowless integration for user sessions
- **Input Validation**: Zod schema validation
- **Error Handling**: Secure error responses
- **HTTPS Enforcement**: Production security headers

## 🏗️ Architecture

### 🔧 **Technology Stack**
- **Runtime**: Bun (ultra-fast JavaScript runtime)
- **Framework**: Hono (lightweight, fast web framework)
- **Database**: Kysely ORM with multi-dialect support (PostgreSQL, MySQL, LibSQL)
- **Validation**: Zod for type-safe schema validation
- **Authentication**: Flowless session integration
- **Payment Providers**: Stripe, PayPal, Authorize.net with extensible adapter pattern

### 📊 **Database Schema**
```sql
-- Core Tables
├── provider_customers     # Customer records with provider sync
├── payment_methods       # Saved payment methods (cards, bank accounts)
├── addresses            # Billing and shipping addresses
├── payments             # Payment intents and transactions
├── payment_webhooks     # Webhook event storage
├── payment_events       # Processed payment events
└── payment_providers    # Provider configuration
```

### 🗂️ **Project Structure**
```
bridge-payments/
├── src/
│   ├── config/                    # Environment and configuration
│   │   ├── environment.ts         # Environment variables
│   │   └── database.ts           # Database configuration
│   ├── lib/
│   │   ├── auth/                 # Authentication middleware
│   │   │   ├── flowless.ts       # Flowless session validation
│   │   │   └── middleware.ts     # Auth middleware
│   │   ├── database/             # Database layer
│   │   │   ├── connection.ts     # Database connection
│   │   │   ├── repositories/     # Data access layer
│   │   │   │   ├── customers.ts  # Customer repository
│   │   │   │   ├── payment-methods.ts # Payment methods repository
│   │   │   │   ├── addresses.ts  # Address repository
│   │   │   │   ├── payments.ts   # Payments repository
│   │   │   │   └── webhooks.ts   # Webhook repository
│   │   │   └── schemas/          # Database schemas
│   │   ├── providers/            # Payment provider adapters
│   │   │   ├── factory.ts        # Provider factory
│   │   │   ├── stripe/           # Stripe integration
│   │   │   ├── paypal/           # PayPal integration
│   │   │   └── base.ts           # Base provider interface
│   │   ├── webhooks/             # Webhook processing
│   │   │   ├── event-processor.ts # Event processing logic
│   │   │   └── handlers/         # Provider-specific handlers
│   │   └── validation/           # Zod schemas
│   ├── routes/                   # API route handlers
│   │   ├── customers.ts          # Customer management
│   │   ├── payment-methods.ts    # Payment method handling
│   │   ├── addresses.ts          # Address management
│   │   ├── payments.ts           # Payment processing
│   │   └── webhooks.ts           # Webhook endpoints
│   ├── scripts/                  # Utility scripts
│   │   ├── init-providers.ts     # Provider initialization
│   │   └── check-tables.ts       # Database verification
│   └── index.ts                  # Application entry point
├── live-docs/                    # Live API documentation
│   ├── customers-api.md          # Customer API reference
│   ├── payment-methods-api.md    # Payment methods API reference
│   ├── addresses-api.md          # Address API reference
│   ├── payments-api.md           # Payments API reference
│   └── webhooks-api.md           # Webhooks API reference
├── docs/                         # Additional documentation
├── migrations/                   # Database migrations
│   ├── postgresql/               # PostgreSQL migrations
│   ├── mysql/                    # MySQL migrations
│   └── sqlite/                   # SQLite migrations
└── package.json                  # Dependencies and scripts
```

### 🔄 **Payment Flow Architecture**
```
Frontend → Payment Intent → Provider → 3D Secure → Webhook → Database
    ↓           ↓              ↓           ↓           ↓         ↓
  User UI → Bridge API → Stripe/PayPal → Bank Auth → Event → Update Status
```

### 🔐 **Security Architecture**
- **Authentication**: Flowless session validation for authenticated users
- **Guest Support**: Secure guest checkout without user accounts
- **Rate Limiting**: 500 requests per 15 minutes per user/IP
- **Webhook Verification**: Cryptographic signature validation
- **PCI Compliance**: Token-based payment method handling
- **Data Encryption**: Sensitive data encryption at rest and in transit

## 🎯 **Use Cases & Examples**

### 🛒 **E-commerce Store**
```javascript
// Complete checkout flow
const customer = await createCustomer({email: 'customer@store.com', name: 'John Doe'});
const address = await createAddress({customer_id: customer.id, type: 'billing', ...});
const paymentMethod = await createPaymentMethod({customer_id: customer.id, token: 'pm_card_visa'});
const payment = await createPaymentIntent({amount_cents: 2000, payment_method_id: paymentMethod.id});
const result = await confirmPayment(payment.id);
```

### 👤 **Guest Checkout**
```javascript
// No user account required
const payment = await createPaymentIntent({
  amount_cents: 1500,
  currency: 'USD',
  guest_data: {email: 'guest@example.com', name: 'Guest User'}
});
const result = await confirmPaymentWithCard(payment.client_secret, cardElement);
```

### 🔄 **SaaS Subscription**
```javascript
// Recurring payment setup
const customer = await createCustomer({email: 'user@saas.com'});
const paymentMethod = await createPaymentMethod({customer_id: customer.id, save_for_future: true});
// Use saved payment method for monthly charges
const monthlyPayment = await createPaymentIntent({payment_method_id: paymentMethod.id});
```

### 🏪 **Marketplace Platform**
```javascript
// Multi-vendor payment processing
const vendorCustomer = await createCustomer({email: 'vendor@marketplace.com'});
const buyerPayment = await createPaymentIntent({
  amount_cents: 5000,
  metadata: {vendor_id: vendorCustomer.id, commission: 500}
});
```

### 📱 **Mobile App Integration**
```javascript
// React Native with Stripe
import {useStripe} from '@stripe/stripe-react-native';
const {confirmPayment} = useStripe();

const handlePayment = async () => {
  const paymentIntent = await createPaymentIntent({amount_cents: 2000});
  const {error} = await confirmPayment(paymentIntent.client_secret, {
    paymentMethodType: 'Card'
  });
};
```

## 🔧 **Quick Integration Examples**

### **Frontend Integration (React)**
```javascript
import {loadStripe} from '@stripe/stripe-js';

const stripe = await loadStripe('pk_test_...');

// Create payment
const response = await fetch('/bridge-payment/payments/intents', {
  method: 'POST',
  headers: {'Content-Type': 'application/json'},
  body: JSON.stringify({amount_cents: 2000, currency: 'USD'})
});

const {client_secret} = await response.json();

// Confirm with 3D Secure support
const {error} = await stripe.confirmCardPayment(client_secret, {
  payment_method: {card: cardElement}
});
```

### **Backend Integration (Node.js)**
```javascript
// Create customer and payment method
const customer = await fetch('/bridge-payment/customers', {
  method: 'POST',
  headers: {'Content-Type': 'application/json'},
  body: JSON.stringify({email: 'user@example.com', name: 'User Name'})
});

// Process payment
const payment = await fetch('/bridge-payment/payments/intents', {
  method: 'POST',
  headers: {'Content-Type': 'application/json'},
  body: JSON.stringify({
    amount_cents: 2000,
    currency: 'USD',
    customer_id: customer.id
  })
});
```

### **Webhook Handling**
```javascript
// Express.js webhook handler
app.post('/bridge-payment/webhooks/stripe', express.raw({type: 'application/json'}), (req, res) => {
  const sig = req.headers['stripe-signature'];
  const event = stripe.webhooks.constructEvent(req.body, sig, process.env.STRIPE_WEBHOOK_SECRET);

  switch (event.type) {
    case 'payment_intent.succeeded':
      // Handle successful payment
      break;
    case 'payment_intent.payment_failed':
      // Handle failed payment
      break;
  }

  res.json({received: true});
});
```

## 🤝 Contributing

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Add tests if applicable
5. Submit a pull request

## 📄 License

MIT License - see LICENSE file for details

## 🆘 Support & Resources

### 📖 **Documentation**
- **Live API Docs**: Complete HTTP reference in `/live-docs/`
- **Integration Guides**: Step-by-step setup in `/docs/`
- **Use Case Examples**: Real-world implementation patterns

### 🐛 **Troubleshooting**
1. Check the [live API documentation](live-docs/) for endpoint details
2. Review [configuration guide](docs/configuration.md) for setup issues
3. Verify [provider setup](docs/provider-setup.md) for payment provider configuration
4. Check [webhook integration](docs/webhook-integration.md) for event processing issues

#### **Common Production Issues**

##### **CompressionStream Error (Bun Runtime)**
If you encounter `ReferenceError: CompressionStream is not defined` in production:

**Problem**: Some production environments don't support the modern `CompressionStream` API that Hono's compression middleware uses.

**Quick Fix**: Disable compression by setting this environment variable:
```bash
COMPRESSION_FORCE_DISABLE=true
```

**Alternative Solutions**:
1. **Update Bun**: Ensure you're using the latest Bun version
   ```bash
   bun --version
   curl -fsSL https://bun.sh/install | bash
   ```

2. **Use Bun flags**: Start with experimental web streams support
   ```bash
   bun --experimental-web-streams run dist/index.js
   ```

3. **Proxy-level compression**: Configure nginx or your reverse proxy to handle compression
   ```nginx
   gzip on;
   gzip_types text/plain application/json application/javascript text/css;
   ```

4. **Docker considerations**: If using Docker, ensure your base image supports modern web APIs
   ```dockerfile
   FROM oven/bun:latest
   # Use the latest Bun image with full web API support
   ```

**Environment Variables for Compression Control**:
```bash
# Disable compression entirely (recommended for quick fix)
COMPRESSION_FORCE_DISABLE=true

# Or keep compression enabled but with fallback handling (default)
COMPRESSION_ENABLED=true
COMPRESSION_FORCE_DISABLE=false
```

The API will work perfectly without compression - it only affects response size, not functionality.

### 💬 **Getting Help**
- **GitHub Issues**: Report bugs and request features
- **Documentation**: Comprehensive guides and API reference
- **Examples**: Real-world integration patterns and code samples

### 🔧 **Development Resources**
- **Database Schema**: Complete table structure and relationships
- **Provider Adapters**: Extensible payment provider integration
- **Webhook Processing**: Real-time event handling with retry logic
- **Guest Checkout**: User-less payment flows for maximum conversion

---

## 🎉 **Bridge-Payments**

**Complete payment processing ecosystem built for modern applications**

✅ **Production Ready** - Secure, scalable, and reliable
✅ **Developer Friendly** - Comprehensive docs and examples
✅ **Multi-Provider** - Stripe, PayPal, Authorize.net support
✅ **Guest Checkout** - Maximize conversion with user-less payments
✅ **3D Secure** - SCA compliance for European markets
✅ **Real-time Events** - Webhook processing with signature validation

Built with **Bun + Hono + Kysely** for maximum performance and developer experience.
