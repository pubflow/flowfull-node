# Configuration Guide

## Environment Variables

Bridge-Payments uses environment variables for configuration. All settings are defined in `.env` file.

## Core Configuration

### Server Settings

```env
# Server Configuration
PORT=3001                           # Server port
NODE_ENV=development                # Environment: development, production, test
BASE_URL=http://localhost:3001      # Base URL for the API
HOST=0.0.0.0                       # Host to bind to (0.0.0.0 for all interfaces)
```

### Database Configuration

Choose one database type and configure accordingly:

#### PostgreSQL
```env
DATABASE_URL=postgresql://username:password@localhost:5432/bridge_payments
DATABASE_SSL=false                  # Enable SSL for production
DATABASE_POOL_MIN=2                 # Minimum pool connections
DATABASE_POOL_MAX=10                # Maximum pool connections
```

#### MySQL
```env
DATABASE_URL=mysql://username:password@localhost:3306/bridge_payments
DATABASE_SSL=false
DATABASE_POOL_MIN=2
DATABASE_POOL_MAX=10
```

#### SQLite
```env
DATABASE_URL=sqlite:./data/bridge_payments.db
DATABASE_WAL_MODE=true              # Enable WAL mode for better performance
```

## Flowless Integration

### Authentication Bridge

```env
# Flowless Backend Integration
FLOWLESS_API_URL=https://api.flowless.com          # Your Flowless API URL
BRIDGE_VALIDATION_SECRET=your-super-secret-key     # Shared secret for validation
BRIDGE_VALIDATION_TIMEOUT=5000                     # Request timeout in ms
BRIDGE_RETRY_ATTEMPTS=3                            # Retry failed validations
```

### Session Configuration

```env
# Session Management
SESSION_VALIDATION_CACHE_TTL=300    # Cache validation results (seconds)
SESSION_HEADER_NAME=X-Session-ID    # Header name for session ID
SESSION_COOKIE_NAME=session_id      # Cookie name for session ID
SESSION_REQUIRE_HTTPS=false         # Require HTTPS for sessions (production: true)
```

## Guest Checkout

### Guest Payment Settings

```env
# Guest Checkout Configuration
GUEST_CHECKOUT_ENABLED=true         # Enable guest checkout
GUEST_REQUIRE_EMAIL=true            # Require email for guest checkout
GUEST_REQUIRE_NAME=false            # Require name for guest checkout
GUEST_REQUIRE_PHONE=false           # Require phone for guest checkout
GUEST_SESSION_DURATION=3600         # Guest session duration (seconds)
GUEST_AUTO_CLEANUP=true             # Auto-cleanup guest data
GUEST_CLEANUP_INTERVAL=86400        # Cleanup interval (seconds)
```

### Guest Data Retention

```env
# Guest Data Management
GUEST_DATA_RETENTION_DAYS=30        # Keep guest data for X days
GUEST_ALLOW_CONVERSION=true         # Allow converting guest to registered user
GUEST_MAX_PAYMENTS_PER_EMAIL=5      # Max payments per guest email
```

## Payment Providers

### Default Provider

```env
# Provider Configuration
DEFAULT_PAYMENT_PROVIDER=stripe     # Default provider: stripe, paypal, authorize_net
ENABLED_PROVIDERS=stripe,paypal     # Comma-separated list of enabled providers
PROVIDER_FAILOVER_ENABLED=true      # Enable automatic failover
```

### Stripe Configuration

```env
# Stripe Settings
STRIPE_SECRET_KEY=sk_test_51...                    # Stripe secret key
STRIPE_PUBLISHABLE_KEY=pk_test_51...               # Stripe publishable key
STRIPE_WEBHOOK_SECRET=whsec_...                    # Webhook endpoint secret
STRIPE_API_VERSION=2023-10-16                     # Stripe API version
STRIPE_CONNECT_ENABLED=false                      # Enable Stripe Connect
STRIPE_AUTOMATIC_TAX=false                        # Enable automatic tax calculation
```

### PayPal Configuration

```env
# PayPal Settings
PAYPAL_CLIENT_ID=your_paypal_client_id
PAYPAL_CLIENT_SECRET=your_paypal_client_secret
PAYPAL_ENVIRONMENT=sandbox                         # sandbox or live
PAYPAL_WEBHOOK_ID=your_webhook_id
PAYPAL_BN_CODE=your_bn_code                       # Partner attribution code
```

### Authorize.net Configuration

```env
# Authorize.net Settings
AUTHORIZE_NET_API_LOGIN=your_api_login_id
AUTHORIZE_NET_TRANSACTION_KEY=your_transaction_key
AUTHORIZE_NET_ENVIRONMENT=sandbox                  # sandbox or production
AUTHORIZE_NET_SIGNATURE_KEY=your_signature_key     # For webhook validation
```

## Security Settings

### CORS Configuration

```env
# CORS Settings
CORS_ORIGINS=http://localhost:3000,https://yourdomain.com
CORS_METHODS=GET,POST,PUT,DELETE,OPTIONS
CORS_HEADERS=Content-Type,Authorization,X-Session-ID
CORS_CREDENTIALS=true
CORS_MAX_AGE=86400
```

### Rate Limiting

```env
# Rate Limiting
RATE_LIMIT_ENABLED=true
RATE_LIMIT_REQUESTS=100              # Requests per window
RATE_LIMIT_WINDOW=900000             # Window duration in ms (15 minutes)
RATE_LIMIT_SKIP_SUCCESSFUL=false     # Skip counting successful requests
RATE_LIMIT_STORE=memory              # memory, redis
```

### Request Validation

```env
# Request Security
MAX_REQUEST_SIZE=1048576             # Max request size in bytes (1MB)
REQUEST_TIMEOUT=30000                # Request timeout in ms
VALIDATE_CONTENT_TYPE=true           # Validate Content-Type header
REQUIRE_USER_AGENT=false             # Require User-Agent header
```

## Client Secret Management

### Auto-Cleanup Configuration

```env
# Client Secret Management
CLIENT_SECRET_AUTO_CLEANUP=true      # Enable automatic cleanup
CLIENT_SECRET_CLEANUP_INTERVAL=3600  # Cleanup interval (seconds)
CLIENT_SECRET_MAX_AGE=86400          # Max age before cleanup (seconds)
CLIENT_SECRET_CLEANUP_ON_SUCCESS=true # Cleanup immediately on payment success
CLIENT_SECRET_CLEANUP_ON_FAILURE=false # Keep secrets on failure for retry
```

## Logging & Monitoring

### Logging Configuration

```env
# Logging Settings
LOG_LEVEL=info                       # error, warn, info, debug
LOG_FORMAT=json                      # json, text
LOG_FILE_ENABLED=true                # Enable file logging
LOG_FILE_PATH=./logs/bridge-payments.log
LOG_ROTATION_ENABLED=true            # Enable log rotation
LOG_MAX_SIZE=10485760               # Max log file size (10MB)
LOG_MAX_FILES=5                     # Max number of log files
```

### Monitoring

```env
# Monitoring & Metrics
METRICS_ENABLED=true                 # Enable metrics collection
METRICS_PORT=9090                    # Metrics server port
HEALTH_CHECK_ENABLED=true            # Enable health check endpoint
HEALTH_CHECK_PATH=/health            # Health check endpoint path
```

## Development Settings

### Development Mode

```env
# Development Configuration
DEV_MODE=true                        # Enable development features
DEV_CORS_RELAXED=true               # Relaxed CORS for development
DEV_LOG_REQUESTS=true               # Log all requests in development
DEV_MOCK_PROVIDERS=false            # Use mock providers for testing
DEV_SEED_DATA=true                  # Seed development data
```

### Testing Configuration

```env
# Testing Settings
TEST_DATABASE_URL=sqlite::memory:    # In-memory database for tests
TEST_MOCK_FLOWLESS=true             # Mock Flowless responses in tests
TEST_MOCK_PROVIDERS=true            # Mock payment providers in tests
TEST_TIMEOUT=10000                  # Test timeout in ms
```

## Production Settings

### Production Security

```env
# Production Security
NODE_ENV=production
SESSION_REQUIRE_HTTPS=true
CORS_ORIGINS=https://yourdomain.com
RATE_LIMIT_REQUESTS=50              # Stricter rate limiting
CLIENT_SECRET_MAX_AGE=3600          # Shorter secret lifetime
LOG_LEVEL=warn                      # Less verbose logging
```

### Performance Optimization

```env
# Performance Settings
DATABASE_POOL_MAX=20                # Larger connection pool
DATABASE_POOL_MIN=5
CACHE_ENABLED=true                  # Enable caching
CACHE_TTL=300                       # Cache TTL in seconds
COMPRESSION_ENABLED=true            # Enable response compression
```

## Configuration Validation

The system validates all configuration on startup. Invalid configurations will prevent the server from starting.

### Required Variables

These variables are required and must be set:

- `DATABASE_URL`
- `FLOWLESS_API_URL`
- `BRIDGE_VALIDATION_SECRET`
- At least one payment provider configuration

### Optional Variables

All other variables have sensible defaults and are optional.

## Environment-Specific Configs

### Development (.env.development)

```env
NODE_ENV=development
LOG_LEVEL=debug
DEV_MODE=true
GUEST_CHECKOUT_ENABLED=true
RATE_LIMIT_REQUESTS=1000
```

### Production (.env.production)

```env
NODE_ENV=production
LOG_LEVEL=warn
SESSION_REQUIRE_HTTPS=true
RATE_LIMIT_REQUESTS=50
CLIENT_SECRET_MAX_AGE=3600
```

### Testing (.env.test)

```env
NODE_ENV=test
DATABASE_URL=sqlite::memory:
TEST_MOCK_FLOWLESS=true
TEST_MOCK_PROVIDERS=true
LOG_LEVEL=error
```

## Next Steps

After configuration:

1. **[Database Setup](./database.md)** - Initialize database schema
2. **[Authentication Setup](./authentication.md)** - Configure Flowless integration
3. **[Provider Setup](./providers/)** - Configure payment providers
4. **[API Testing](./examples/)** - Test your configuration
