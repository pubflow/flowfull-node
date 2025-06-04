# Payment System Database Schema

This document outlines the database schema for a modular, multi-provider payment system that supports various business models including SaaS, eCommerce, and digital stores.

## Core Tables

### Tokens (Authentication & Security)

```sql
CREATE TABLE tokens (
    id VARCHAR(255) PRIMARY KEY,
    token VARCHAR(64) UNIQUE NOT NULL, -- Hashed token for security
    type VARCHAR(20) NOT NULL, -- 'email', 'phone', 'username'
    identifier_value VARCHAR(255) NOT NULL, -- The actual identifier value
    token_type VARCHAR(30) NOT NULL, -- 'magic_link', 'password_reset', 'email_verification', 'phone_verification'
    user_id VARCHAR(255) NULL, -- NULL for guest tokens, user ID for registered users

    -- Simple attempt system
    attempts_remaining INTEGER NOT NULL DEFAULT 1, -- How many attempts are left

    -- Basic states and timestamps
    status VARCHAR(20) DEFAULT 'active', -- 'active', 'consumed', 'expired', 'revoked'
    expires_at TIMESTAMP NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    consumed_at TIMESTAMP NULL, -- When the token was successfully consumed

    -- Optional metadata
    metadata JSON NULL,

    -- Foreign key constraint
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

-- Performance indexes
CREATE INDEX idx_token_lookup ON tokens(token, status, expires_at);
CREATE INDEX idx_identifier_lookup ON tokens(type, identifier_value, status);
CREATE INDEX idx_user_tokens ON tokens(user_id, token_type, status);
CREATE INDEX idx_expiration_cleanup ON tokens(expires_at, status);
CREATE INDEX idx_token_type_status ON tokens(token_type, status);
```

**Key Features:**
- **Unified Token Management**: Single table for all token types (magic links, password reset, verification)
- **Security First**: Tokens are stored hashed, never in plain text
- **Built-in Rate Limiting**: Attempt system integrated directly into the token
- **Guest Support**: Works for both authenticated users and guests
- **Scalable Design**: Supports email, phone, and username identifiers
- **Simple Status Management**: Clear token lifecycle with status tracking
- **Performance Optimized**: Strategic indexes for fast lookups and cleanup

**Security Recommendations:**
- Always hash tokens before storing using a secure algorithm (e.g., SHA-256 with salt)
- Set appropriate expiration times (5-15 minutes for magic links, 1 hour for password reset)
- Implement automatic cleanup of expired tokens
- Use HTTPS for all token-related endpoints
- Log token usage for security auditing

**Usage Flow:**
1. **Create Token**: `attempts_remaining = 4` (configurable)
2. **Validate Token**: Each failed attempt decrements `attempts_remaining`
3. **Block Token**: When `attempts_remaining = 0`, token is blocked
4. **Consume Token**: Valid token sets `status = 'consumed'`

**Common Token Types:**
- `magic_link`: Passwordless authentication links
- `password_reset`: Password reset tokens
- `email_verification`: Email address verification
- `phone_verification`: Phone number verification

### Enhanced User Table

```sql
CREATE TABLE users (
    id VARCHAR(255) PRIMARY KEY,
    name VARCHAR(255) NOT NULL,
    last_name VARCHAR(255) NOT NULL,
    email VARCHAR(255) NOT NULL UNIQUE,
    user_type VARCHAR(255) NOT NULL, -- 'individual', 'business', 'admin'
    picture TEXT,
    user_name VARCHAR(255) UNIQUE,
    password_hash TEXT,
    recovery_email VARCHAR(255),
    phone VARCHAR(50),
    is_verified BOOLEAN NOT NULL DEFAULT false,
    is_locked BOOLEAN NOT NULL DEFAULT false,
    two_factor BOOLEAN NOT NULL DEFAULT false, -- Indicates if 2FA is enabled
    passkeys JSON, -- JSON array for multiple passkeys
    metadata JSON, -- JSON array for additional user information
    first_time BOOLEAN NOT NULL DEFAULT true,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
);
```

**Key Features:**
- `is_verified`: Tracks email verification status
- `is_locked`: Account lock status for security
- `two_factor`: Boolean flag indicating if 2FA is enabled
- `passkeys`: JSON array for WebAuthn/passkey support
- `metadata`: JSON array for additional user information and custom data
- `first_time`: Flag for first-time user experience

### Organizations

```sql
CREATE TABLE organizations (
    id VARCHAR(255) PRIMARY KEY,
    name VARCHAR(255) NOT NULL,
    owner_user_id VARCHAR(255) NOT NULL,
    business_email VARCHAR(255),
    business_phone VARCHAR(50),
    tax_id VARCHAR(100),
    address TEXT,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    FOREIGN KEY (owner_user_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE TABLE organization_users (
    id VARCHAR(255) PRIMARY KEY,
    organization_id VARCHAR(255) NOT NULL,
    user_id VARCHAR(255) NOT NULL,
    role VARCHAR(50) NOT NULL DEFAULT 'member', -- 'owner', 'admin', 'billing', 'member'
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    FOREIGN KEY (organization_id) REFERENCES organizations(id) ON DELETE CASCADE,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
    UNIQUE KEY (organization_id, user_id)
);
```

### Addresses

```sql
CREATE TABLE addresses (
    id VARCHAR(255) PRIMARY KEY,
    user_id VARCHAR(255),
    organization_id VARCHAR(255),
    address_type VARCHAR(50) NOT NULL, -- 'billing', 'shipping', 'both'
    is_default BOOLEAN NOT NULL DEFAULT false,
    name VARCHAR(255),
    line1 VARCHAR(255) NOT NULL,
    line2 VARCHAR(255),
    city VARCHAR(255) NOT NULL,
    state VARCHAR(255),
    postal_code VARCHAR(50) NOT NULL,
    country VARCHAR(2) NOT NULL, -- ISO 2-letter country code
    phone VARCHAR(50),
    email VARCHAR(255),
    is_guest BOOLEAN NOT NULL DEFAULT false, -- Indicates if this is a guest address
    guest_email VARCHAR(255), -- Email for guest addresses (for identification)
    guest_name VARCHAR(255), -- Name for guest addresses
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
    FOREIGN KEY (organization_id) REFERENCES organizations(id) ON DELETE CASCADE,
    CHECK (user_id IS NOT NULL OR organization_id IS NOT NULL OR is_guest = true) -- Must belong to either a user, organization, or be a guest
);
```

**Key Features:**
- Supports both billing and shipping addresses
- Can belong to users, organizations, or guests
- ISO country code standardization
- Default address selection
- `is_guest`: Boolean flag to identify guest addresses
- `guest_email`: Email for guest address identification and management
- `guest_name`: Display name for guest addresses
- Modified CHECK constraint to allow guest addresses without user_id or organization_id

## Payment Provider Integration

### Payment Providers

```sql
CREATE TABLE payment_providers (
    id VARCHAR(50) PRIMARY KEY, -- 'stripe', 'paypal', 'authorize_net', etc.
    display_name VARCHAR(255) NOT NULL,
    description VARCHAR(500), -- Description of the payment provider
    picture VARCHAR(255), -- URL to payment provider logo or icon
    is_active BOOLEAN NOT NULL DEFAULT true,
    supports_subscriptions BOOLEAN NOT NULL DEFAULT false,
    supports_saved_methods BOOLEAN NOT NULL DEFAULT false,
    config JSON, -- Provider-specific configuration
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
);
```

**Key Features:**
- `description`: Detailed description of the payment provider
- `picture`: URL for provider logo/icon display
- `config`: JSON field for provider-specific settings (API keys, etc.)
- Feature flags for subscription and saved payment method support

### Provider Customers

```sql
CREATE TABLE provider_customers (
    id VARCHAR(255) PRIMARY KEY,
    user_id VARCHAR(255),
    organization_id VARCHAR(255),
    provider_id VARCHAR(50) NOT NULL,
    provider_customer_id VARCHAR(255) NOT NULL, -- ID from the provider (e.g., Stripe customer ID)
    guest_email VARCHAR(255), -- Email for guest customers
    guest_name VARCHAR(255), -- Name for guest customers
    is_guest BOOLEAN NOT NULL DEFAULT false, -- Indicates if this is a guest customer
    metadata JSON,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
    FOREIGN KEY (organization_id) REFERENCES organizations(id) ON DELETE CASCADE,
    FOREIGN KEY (provider_id) REFERENCES payment_providers(id) ON DELETE CASCADE,
    UNIQUE KEY (provider_id, provider_customer_id),
    CHECK (user_id IS NOT NULL OR organization_id IS NOT NULL OR is_guest = true) -- Must belong to either a user, organization, or be a guest
);
```

**Key Features:**
- `guest_email`: Email address for guest customers who don't have user accounts
- `guest_name`: Display name for guest customers
- `is_guest`: Boolean flag to identify guest customers
- Modified CHECK constraint to allow guest customers without user_id or organization_id

### Payment Methods

```sql
CREATE TABLE payment_methods (
    id VARCHAR(255) PRIMARY KEY,
    user_id VARCHAR(255),
    organization_id VARCHAR(255),
    provider_id VARCHAR(50) NOT NULL,
    provider_payment_method_id VARCHAR(255) NOT NULL, -- ID from the provider
    payment_type VARCHAR(50) NOT NULL, -- 'credit_card', 'bank_account', 'paypal', etc.
    last_four VARCHAR(4), -- Last 4 digits of card or account
    expiry_month VARCHAR(2), -- Expiration month (for cards)
    expiry_year VARCHAR(4), -- Expiration year (for cards)
    card_brand VARCHAR(50), -- 'visa', 'mastercard', etc.
    is_default BOOLEAN NOT NULL DEFAULT false,
    billing_address_id VARCHAR(255),
    is_guest BOOLEAN NOT NULL DEFAULT false, -- Indicates if this is a guest payment method
    guest_email VARCHAR(255), -- Email for guest payment methods (for identification)
    guest_name VARCHAR(255), -- Name for guest payment methods
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
    FOREIGN KEY (organization_id) REFERENCES organizations(id) ON DELETE CASCADE,
    FOREIGN KEY (provider_id) REFERENCES payment_providers(id) ON DELETE CASCADE,
    FOREIGN KEY (billing_address_id) REFERENCES addresses(id) ON DELETE SET NULL,
    CHECK (user_id IS NOT NULL OR organization_id IS NOT NULL OR is_guest = true) -- Must belong to either a user, organization, or be a guest
);
```

**Key Features:**
- Links to addresses table for billing information
- Supports multiple payment types (cards, bank accounts, digital wallets)
- Provider-agnostic design with provider-specific IDs
- `is_guest`: Boolean flag to identify guest payment methods
- `guest_email`: Email for guest payment method identification and management
- Modified CHECK constraint to allow guest payment methods without user_id or organization_id

## Transaction Tables

### Product Categories

```sql
CREATE TABLE product_categories (
    id VARCHAR(255) PRIMARY KEY,
    name VARCHAR(255) NOT NULL,
    description TEXT,
    parent_id VARCHAR(255),
    image VARCHAR(255),
    is_active BOOLEAN NOT NULL DEFAULT true,
    sort_order INTEGER NOT NULL DEFAULT 0,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    FOREIGN KEY (parent_id) REFERENCES product_categories(id) ON DELETE SET NULL
);
```

**Key Features:**
- Hierarchical category structure with parent-child relationships
- Image support for category display
- Sort ordering for custom arrangement

### Products/Plans

```sql
CREATE TABLE products (
    id VARCHAR(255) PRIMARY KEY,
    name VARCHAR(255) NOT NULL,
    description TEXT,
    product_type VARCHAR(50) NOT NULL, -- 'physical', 'digital', 'service', 'subscription'
    is_recurring BOOLEAN NOT NULL DEFAULT false,
    price_cents BIGINT NOT NULL,
    currency VARCHAR(3) NOT NULL DEFAULT 'USD',
    billing_interval VARCHAR(20), -- 'monthly', 'yearly', null for one-time
    trial_days INTEGER DEFAULT 0,
    image VARCHAR(255), -- Main product image URL
    gallery JSON, -- JSON array of additional image URLs
    category_id VARCHAR(255),
    parent_product_id VARCHAR(255), -- For product variations, references the parent product
    variations JSON, -- JSON array of variation options (e.g., size, color)
    metadata JSON,
    is_active BOOLEAN NOT NULL DEFAULT true,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    FOREIGN KEY (category_id) REFERENCES product_categories(id) ON DELETE SET NULL,
    FOREIGN KEY (parent_product_id) REFERENCES products(id) ON DELETE SET NULL
);
```

**Key Features:**
- Product categorization and hierarchical organization
- Image gallery support for multiple product images
- Product variations (size, color, etc.) stored as JSON
- Parent-child relationships for product variants

### Orders (Enhanced with Complete Guest Support)

```sql
CREATE TABLE orders (
    id VARCHAR(255) PRIMARY KEY,
    order_number VARCHAR(255) UNIQUE NOT NULL, -- Human-readable order number
    user_id VARCHAR(255),
    organization_id VARCHAR(255),
    customer_id VARCHAR(255), -- References provider_customers table (supports registered guests)

    -- Anonymous guest support
    is_guest_order BOOLEAN NOT NULL DEFAULT false, -- Track if this was an anonymous guest order
    guest_data JSON, -- JSON object with anonymous guest information (email, name, phone, etc.)
    guest_email VARCHAR(255), -- Extracted guest email for indexing and queries

    status VARCHAR(50) NOT NULL DEFAULT 'pending', -- 'pending', 'paid', 'cancelled', 'refunded'
    subtotal_cents BIGINT NOT NULL,
    tax_cents BIGINT NOT NULL DEFAULT 0,
    discount_cents BIGINT NOT NULL DEFAULT 0,
    total_cents BIGINT NOT NULL,
    currency VARCHAR(3) NOT NULL DEFAULT 'USD',
    billing_address_id VARCHAR(255),
    shipping_address_id VARCHAR(255),
    metadata JSON,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    completed_at TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE SET NULL,
    FOREIGN KEY (organization_id) REFERENCES organizations(id) ON DELETE SET NULL,
    FOREIGN KEY (customer_id) REFERENCES provider_customers(id) ON DELETE SET NULL,
    FOREIGN KEY (billing_address_id) REFERENCES addresses(id) ON DELETE SET NULL,
    FOREIGN KEY (shipping_address_id) REFERENCES addresses(id) ON DELETE SET NULL,
    CHECK (user_id IS NOT NULL OR organization_id IS NOT NULL OR customer_id IS NOT NULL OR is_guest_order = true) -- Must belong to a user, organization, customer, or be an anonymous guest order
);

CREATE TABLE order_items (
    id VARCHAR(255) PRIMARY KEY,
    order_id VARCHAR(255) NOT NULL,
    product_id VARCHAR(255) NOT NULL,
    quantity INT NOT NULL DEFAULT 1,
    unit_price_cents BIGINT NOT NULL,
    total_cents BIGINT NOT NULL,
    metadata JSON,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (order_id) REFERENCES orders(id) ON DELETE CASCADE,
    FOREIGN KEY (product_id) REFERENCES products(id) ON DELETE RESTRICT
);
```

**Key Features:**
- **Complete Guest Support**: Supports both registered guests (`customer_id`) and anonymous guests (`is_guest_order`)
- **Registered Guests**: Uses `customer_id` to reference `provider_customers` for guests who want to save payment methods
- **Anonymous Guests**: Uses `is_guest_order` flag with `guest_data` JSON for completely anonymous checkout
- **Unified Customer Management**: Consistent with subscriptions and invoices design
- **Flexible Ownership**: Can belong to users, organizations, registered guests, or anonymous guests
- **Performance Optimized**: Proper indexing on guest fields for fast queries
- **Backward Compatible**: Existing user and organization orders continue to work

**Guest Order Types:**

1. **Anonymous Guest Order** (No account, no saved data):
```sql
INSERT INTO orders (
    is_guest_order, guest_data, guest_email, total_cents, currency
) VALUES (
    true,
    '{"email": "anon@example.com", "name": "John Anonymous", "phone": "+1234567890"}',
    'anon@example.com',
    2999,
    'USD'
);
```

2. **Registered Guest Order** (Saved payment methods, no full account):
```sql
INSERT INTO orders (customer_id, total_cents, currency)
VALUES ('cust_guest_456', 2999, 'USD');
```

3. **Authenticated User Order** (Full account):
```sql
INSERT INTO orders (user_id, total_cents, currency)
VALUES ('user_123', 2999, 'USD');
```

### Payments

```sql
CREATE TABLE payments (
    id VARCHAR(255) PRIMARY KEY,
    order_id VARCHAR(255),
    subscription_id VARCHAR(255),
    user_id VARCHAR(255),
    organization_id VARCHAR(255),
    payment_method_id VARCHAR(255),
    provider_id VARCHAR(50) NOT NULL,
    provider_payment_id VARCHAR(255),
    amount_cents BIGINT NOT NULL,
    currency VARCHAR(3) NOT NULL DEFAULT 'USD',
    status VARCHAR(50) NOT NULL, -- 'pending', 'completed', 'failed', 'refunded'
    error_message TEXT,
    -- Enhanced tracking fields
    concept VARCHAR(100), -- Human-readable concept (e.g., "Monthly Subscription", "Product Purchase", "Donation")
    reference_code VARCHAR(100), -- Machine-readable code for analytics (e.g., "subscription_monthly", "donation_campaign_2024")
    category VARCHAR(50), -- High-level category (e.g., "subscription", "donation", "purchase", "refund", "fee")
    tags VARCHAR(500), -- Comma-separated tags for flexible categorization (e.g., "promotion,summer,discount")
    metadata JSON,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    completed_at TIMESTAMP,
    FOREIGN KEY (order_id) REFERENCES orders(id) ON DELETE SET NULL,
    FOREIGN KEY (subscription_id) REFERENCES subscriptions(id) ON DELETE SET NULL,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE SET NULL,
    FOREIGN KEY (organization_id) REFERENCES organizations(id) ON DELETE SET NULL,
    FOREIGN KEY (payment_method_id) REFERENCES payment_methods(id) ON DELETE SET NULL,
    FOREIGN KEY (provider_id) REFERENCES payment_providers(id) ON DELETE CASCADE,
    CHECK (order_id IS NOT NULL OR subscription_id IS NOT NULL) -- Must be associated with either an order or subscription
);
```

**Enhanced Tracking Features:**
- `concept`: Human-readable description for easy identification
- `reference_code`: Unique machine-readable code for analytics and queries
- `category`: High-level categorization for reporting
- `tags`: Flexible comma-separated tags for multi-dimensional analysis

**Usage Examples:**
```sql
-- Analyze all promotional payments
SELECT * FROM payments WHERE reference_code LIKE '%promo%';

-- Get enterprise annual payments
SELECT * FROM payments WHERE tags LIKE '%enterprise%' AND tags LIKE '%annual%';

-- Revenue by category
SELECT category, SUM(amount_cents) as total_revenue
FROM payments
WHERE status = 'succeeded'
GROUP BY category;

-- Find specific campaign payments
SELECT * FROM payments WHERE reference_code = 'donation_campaign_2024';
```

### Subscriptions (Enhanced with Guest Support, Flexible Products & Automatic Billing)

```sql
CREATE TABLE subscriptions (
    id VARCHAR(255) PRIMARY KEY,
    user_id VARCHAR(255),
    organization_id VARCHAR(255),
    customer_id VARCHAR(255) NOT NULL, -- References provider_customers table (supports both users and guests)
    product_id VARCHAR(255), -- Optional for custom donations/flexible subscriptions
    payment_method_id VARCHAR(255),
    provider_id VARCHAR(50) NOT NULL,
    provider_subscription_id VARCHAR(255),
    status VARCHAR(50) NOT NULL, -- 'active', 'cancelled', 'past_due', 'trialing', 'incomplete', 'incomplete_expired'
    current_period_start TIMESTAMP NOT NULL,
    current_period_end TIMESTAMP NOT NULL,
    cancel_at_period_end BOOLEAN NOT NULL DEFAULT false,
    trial_end TIMESTAMP,
    price_cents BIGINT NOT NULL,
    currency VARCHAR(3) NOT NULL DEFAULT 'USD',
    -- Billing automation fields
    billing_interval VARCHAR(20) NOT NULL DEFAULT 'monthly', -- 'daily', 'weekly', 'monthly', 'yearly'
    interval_multiplier INTEGER DEFAULT 1, -- Optional: 2 for every 2 months, 3 for every 3 weeks, etc.
    next_billing_date TIMESTAMP, -- When the next billing should occur
    last_billing_attempt TIMESTAMP, -- Last time we attempted to bill this subscription
    billing_retry_count INTEGER NOT NULL DEFAULT 0, -- Number of failed billing attempts
    max_retry_attempts INTEGER NOT NULL DEFAULT 3, -- Maximum retry attempts before suspension
    billing_status VARCHAR(20) NOT NULL DEFAULT 'active', -- 'active', 'past_due', 'suspended', 'cancelled'
    metadata JSON,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
    FOREIGN KEY (organization_id) REFERENCES organizations(id) ON DELETE CASCADE,
    FOREIGN KEY (customer_id) REFERENCES provider_customers(id) ON DELETE CASCADE,
    FOREIGN KEY (product_id) REFERENCES products(id) ON DELETE SET NULL,
    FOREIGN KEY (payment_method_id) REFERENCES payment_methods(id) ON DELETE SET NULL,
    FOREIGN KEY (provider_id) REFERENCES payment_providers(id) ON DELETE CASCADE,
    CHECK (user_id IS NOT NULL OR organization_id IS NOT NULL OR customer_id IS NOT NULL), -- Must belong to a user, organization, or have a customer
    CHECK (billing_interval IN ('daily', 'weekly', 'monthly', 'yearly')),
    CHECK (interval_multiplier IS NULL OR (interval_multiplier > 0 AND interval_multiplier <= 12)),
    CHECK (billing_status IN ('active', 'past_due', 'suspended', 'cancelled'))
);
```

**Key Features:**
- **Guest Support**: `customer_id` field enables subscriptions for guests without user accounts
- **Flexible Products**: `product_id` is optional for custom donations and flexible subscriptions
- **Multipurpose Design**: Supports both predefined products and custom pricing
- **Unified Customer Management**: Links to `provider_customers` table for both users and guests
- **Enhanced Status**: Additional status values for incomplete payments
- **Flexible Ownership**: Can belong to users, organizations, or guests
- **Provider Agnostic**: Works with any payment provider
- **Clean Design**: No duplicate guest fields - guest info comes from `provider_customers`
- **Automatic Billing**: Built-in support for automatic subscription renewals with flexible intervals
- **Retry Logic**: Configurable retry attempts for failed billing with status tracking
- **Flexible Intervals**: Support for custom billing frequencies using interval multipliers

#### Billing Automation Features

**Billing Intervals with Multipliers:**
- `billing_interval`: Base interval ('daily', 'weekly', 'monthly', 'yearly')
- `interval_multiplier`: Optional multiplier for custom frequencies (1-12)

**Common Billing Configurations:**
- **Weekly**: `billing_interval = 'weekly'`, `interval_multiplier = 1`
- **Biweekly**: `billing_interval = 'weekly'`, `interval_multiplier = 2`
- **Monthly**: `billing_interval = 'monthly'`, `interval_multiplier = 1`
- **Quarterly**: `billing_interval = 'monthly'`, `interval_multiplier = 3`
- **Bimonthly**: `billing_interval = 'monthly'`, `interval_multiplier = 2`
- **Semiannually**: `billing_interval = 'monthly'`, `interval_multiplier = 6`
- **Yearly**: `billing_interval = 'yearly'`, `interval_multiplier = 1`

**Billing Status Management:**
- `active`: Normal billing cycle
- `past_due`: Payment failed, retry scheduled
- `suspended`: Max retries reached, billing stopped
- `cancelled`: Subscription cancelled by user/admin

**Retry Logic:**
- `billing_retry_count`: Tracks failed attempts
- `max_retry_attempts`: Configurable retry limit (default: 3)
- `last_billing_attempt`: Timestamp of last billing attempt

#### Subscription Use Cases

**1. Traditional Product Subscriptions** (with `product_id`)
```sql
-- Monthly premium plan subscription
INSERT INTO subscriptions (
    customer_id, product_id, price_cents, currency,
    billing_interval, interval_multiplier, next_billing_date
) VALUES (
    'cust_123', 'prod_premium_monthly', 2999, 'USD',
    'monthly', 1, '2024-02-15 00:00:00'
);
```

**2. Custom Donation Subscriptions** (without `product_id`)
```sql
-- Monthly donation of $25
INSERT INTO subscriptions (
    customer_id, product_id, price_cents, currency,
    billing_interval, interval_multiplier, next_billing_date, metadata
) VALUES (
    'cust_456', NULL, 2500, 'USD',
    'monthly', 1, '2024-02-15 00:00:00',
    '{"type": "monthly_donation", "cause": "animal_shelter"}'
);
```

**3. Flexible Service Subscriptions** (without `product_id`)
```sql
-- Custom consulting service - $150 every 2 weeks
INSERT INTO subscriptions (
    customer_id, product_id, price_cents, currency,
    billing_interval, interval_multiplier, next_billing_date, metadata
) VALUES (
    'cust_789', NULL, 15000, 'USD',
    'weekly', 2, '2024-02-15 00:00:00',
    '{"type": "consulting", "hours_included": 2, "service": "web_development"}'
);
```

**4. Guest Donation Subscriptions**
```sql
-- Guest quarterly donation ($30 every 3 months)
INSERT INTO subscriptions (
    customer_id, product_id, price_cents, currency,
    billing_interval, interval_multiplier, next_billing_date, metadata
) VALUES (
    'cust_guest_012', NULL, 3000, 'USD',
    'monthly', 3, '2024-05-15 00:00:00',
    '{"type": "guest_donation", "anonymous": true, "frequency": "quarterly"}'
);
```

**5. Advanced Billing Examples**
```sql
-- Biweekly subscription (every 2 weeks)
INSERT INTO subscriptions (
    customer_id, price_cents, currency,
    billing_interval, interval_multiplier, next_billing_date
) VALUES (
    'cust_biweekly', 1999, 'USD',
    'weekly', 2, '2024-02-15 00:00:00'
);

-- Semiannual subscription (every 6 months)
INSERT INTO subscriptions (
    customer_id, price_cents, currency,
    billing_interval, interval_multiplier, next_billing_date
) VALUES (
    'cust_semiannual', 29999, 'USD',
    'monthly', 6, '2024-08-15 00:00:00'
);

-- Custom frequency: Every 5 weeks
INSERT INTO subscriptions (
    customer_id, price_cents, currency,
    billing_interval, interval_multiplier, next_billing_date, metadata
) VALUES (
    'cust_custom', 4999, 'USD',
    'weekly', 5, '2024-03-21 00:00:00',
    '{"type": "custom_frequency", "description": "Every 5 weeks special plan"}'
);
```

### Invoices (Enhanced with Guest Support)

```sql
CREATE TABLE invoices (
    id VARCHAR(255) PRIMARY KEY,
    invoice_number VARCHAR(255) UNIQUE NOT NULL,
    order_id VARCHAR(255),
    subscription_id VARCHAR(255),
    user_id VARCHAR(255),
    organization_id VARCHAR(255),
    customer_id VARCHAR(255), -- References provider_customers table (supports both users and guests)
    status VARCHAR(50) NOT NULL, -- 'draft', 'open', 'paid', 'void', 'uncollectible'
    amount_cents BIGINT NOT NULL,
    tax_cents BIGINT NOT NULL DEFAULT 0,
    discount_cents BIGINT NOT NULL DEFAULT 0,
    total_cents BIGINT NOT NULL,
    currency VARCHAR(3) NOT NULL DEFAULT 'USD',
    issue_date TIMESTAMP NOT NULL,
    due_date TIMESTAMP NOT NULL,
    paid_date TIMESTAMP,
    billing_address_id VARCHAR(255),
    provider_id VARCHAR(50),
    provider_invoice_id VARCHAR(255),
    invoice_url VARCHAR(500), -- Optional friendly URL to access the invoice
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    FOREIGN KEY (order_id) REFERENCES orders(id) ON DELETE SET NULL,
    FOREIGN KEY (subscription_id) REFERENCES subscriptions(id) ON DELETE SET NULL,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE SET NULL,
    FOREIGN KEY (organization_id) REFERENCES organizations(id) ON DELETE SET NULL,
    FOREIGN KEY (customer_id) REFERENCES provider_customers(id) ON DELETE SET NULL,
    FOREIGN KEY (billing_address_id) REFERENCES addresses(id) ON DELETE SET NULL,
    FOREIGN KEY (provider_id) REFERENCES payment_providers(id) ON DELETE SET NULL,
    CHECK (user_id IS NOT NULL OR organization_id IS NOT NULL OR customer_id IS NOT NULL) -- Must belong to a user, organization, or have a customer
);
```

**Key Features:**
- **Guest Support**: `customer_id` field enables invoices for guests without user accounts
- **Unified Customer Management**: Links to `provider_customers` table for both users and guests
- **Flexible Ownership**: Can belong to users, organizations, or guests
- **Provider Integration**: Supports provider-generated invoices with external URLs
- **Complete Audit Trail**: Tracks all invoice states and payment dates
- **Multi-Currency Support**: Handles invoices in different currencies

### Webhooks and Events

```sql
CREATE TABLE payment_webhooks (
    id VARCHAR(255) PRIMARY KEY,
    provider_id VARCHAR(50) NOT NULL,
    event_type VARCHAR(100) NOT NULL, -- 'payment.succeeded', 'subscription.created', etc.
    payload JSON NOT NULL,
    processed BOOLEAN NOT NULL DEFAULT false,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    processed_at TIMESTAMP,
    FOREIGN KEY (provider_id) REFERENCES payment_providers(id) ON DELETE CASCADE
);

CREATE TABLE payment_events (
    id VARCHAR(255) PRIMARY KEY,
    entity_type VARCHAR(50) NOT NULL, -- 'payment', 'subscription', 'order', etc.
    entity_id VARCHAR(255) NOT NULL,
    event_type VARCHAR(100) NOT NULL, -- 'created', 'updated', 'failed', etc.
    data JSON,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);
```

## Membership System

### Membership Types

```sql
CREATE TABLE membership_types (
    id VARCHAR(255) PRIMARY KEY,
    name VARCHAR(255) NOT NULL,
    description TEXT,
    duration_type VARCHAR(50) NOT NULL, -- 'recurring', 'fixed', 'lifetime'
    duration_days INTEGER, -- NULL for 'lifetime' memberships
    price_cents BIGINT NOT NULL,
    currency VARCHAR(3) NOT NULL DEFAULT 'USD',
    features JSON, -- JSON array of features included in this membership
    is_active BOOLEAN NOT NULL DEFAULT true,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
);
```

**Key Features:**
- `duration_type`: Supports recurring, fixed-term, and lifetime memberships
- `features`: JSON array defining what features are included
- Flexible pricing in cents for precise control

### User Memberships

```sql
CREATE TABLE user_memberships (
    id VARCHAR(255) PRIMARY KEY,
    user_id VARCHAR(255) NOT NULL,
    membership_type_id VARCHAR(255) NOT NULL,
    subscription_id VARCHAR(255), -- For recurring memberships
    order_id VARCHAR(255), -- For one-time purchases
    status VARCHAR(50) NOT NULL, -- 'active', 'expired', 'cancelled', 'pending'
    start_date TIMESTAMP NOT NULL,
    end_date TIMESTAMP, -- NULL for lifetime memberships
    auto_renew BOOLEAN NOT NULL DEFAULT false,
    addons JSON, -- JSON array of purchased addons with their expiration dates
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
    FOREIGN KEY (membership_type_id) REFERENCES membership_types(id) ON DELETE RESTRICT,
    FOREIGN KEY (subscription_id) REFERENCES subscriptions(id) ON DELETE SET NULL,
    FOREIGN KEY (order_id) REFERENCES orders(id) ON DELETE SET NULL
);
```

**Key Features:**
- Links to both subscriptions (recurring) and orders (one-time)
- `addons`: JSON array for purchased add-on features
- Flexible date handling for lifetime memberships
- Status tracking throughout membership lifecycle

## Database Relationships

### Entity Relationship Overview

1. **Users & Organizations**: Many-to-many relationship through `organization_users`
2. **Provider Customers**: Unified customer management for users, organizations, and guests
3. **Addresses**: Belong to users, organizations, or guests (via `is_guest` flag)
4. **Payment Methods**: Linked to users/organizations/guests and addresses
5. **Subscriptions**: Connected to customers via `customer_id` (supports guests seamlessly)
6. **Orders**: Reference billing and shipping addresses
7. **Memberships**: Tied to users and can be linked to subscriptions or orders
8. **Products**: Organized in categories with support for variations

### Key Design Principles

1. **Multi-tenancy**: Support for individual users, organizations, and guests
2. **Guest-Friendly**: Complete guest checkout and subscription support without requiring accounts
3. **Provider Agnostic**: Works with multiple payment providers (Stripe, PayPal, Authorize.net)
4. **Unified Customer Management**: Single `provider_customers` table handles all customer types
5. **Flexible Pricing**: Supports various business models (SaaS, eCommerce, memberships)
6. **Audit Trail**: Comprehensive event and webhook logging
7. **Data Integrity**: Proper foreign key constraints and optimized CHECK constraints
8. **Performance Optimized**: Efficient indexes and normalized design

## Performance Considerations

### Recommended Indexes

```sql
-- User and organization lookups
CREATE INDEX idx_users_email ON users(email);
CREATE INDEX idx_users_user_name ON users(user_name);

-- Address lookups
CREATE INDEX idx_addresses_user_id ON addresses(user_id);
CREATE INDEX idx_addresses_organization_id ON addresses(organization_id);
CREATE INDEX idx_addresses_type ON addresses(address_type);

-- Payment method lookups
CREATE INDEX idx_payment_methods_user_id ON payment_methods(user_id);
CREATE INDEX idx_payment_methods_organization_id ON payment_methods(organization_id);
CREATE INDEX idx_payment_methods_provider_id ON payment_methods(provider_id);

-- Order and payment tracking
CREATE INDEX idx_orders_status ON orders(status);
CREATE INDEX idx_orders_user_id ON orders(user_id);
CREATE INDEX idx_payments_status ON payments(status);
CREATE INDEX idx_payments_order_id ON payments(order_id);

-- Enhanced payment tracking indexes
CREATE INDEX idx_payments_reference_code ON payments(reference_code);
CREATE INDEX idx_payments_category ON payments(category);
CREATE INDEX idx_payments_concept ON payments(concept);

-- Subscription management
CREATE INDEX idx_subscriptions_status ON subscriptions(status);
CREATE INDEX idx_subscriptions_user_id ON subscriptions(user_id);
CREATE INDEX idx_subscriptions_organization_id ON subscriptions(organization_id);
CREATE INDEX idx_subscriptions_customer_id ON subscriptions(customer_id);
CREATE INDEX idx_subscriptions_provider_id ON subscriptions(provider_id);

-- Billing automation indexes
CREATE INDEX idx_subscriptions_next_billing ON subscriptions(next_billing_date, billing_status);
CREATE INDEX idx_subscriptions_billing_status ON subscriptions(billing_status);
CREATE INDEX idx_subscriptions_retry_billing ON subscriptions(last_billing_attempt, billing_retry_count);

-- Membership lookups
CREATE INDEX idx_user_memberships_user_id ON user_memberships(user_id);
CREATE INDEX idx_user_memberships_status ON user_memberships(status);
CREATE INDEX idx_membership_types_is_active ON membership_types(is_active);

-- Webhook processing
CREATE INDEX idx_payment_webhooks_processed ON payment_webhooks(processed);
CREATE INDEX idx_payment_events_entity_type_entity_id ON payment_events(entity_type, entity_id);

-- Analytics (Optional)
CREATE INDEX idx_analytics_snapshots_date_type ON analytics_snapshots(snapshot_date, metric_type);
CREATE INDEX idx_analytics_snapshots_currency ON analytics_snapshots(currency);
CREATE INDEX idx_analytics_events_user_id ON analytics_events(user_id);
CREATE INDEX idx_analytics_events_type ON analytics_events(event_type);
CREATE INDEX idx_user_cohorts_month ON user_cohorts(cohort_month);
```

## Analytics Tables (Optional Feature)

The Analytics System is an optional feature that adds advanced reporting and insights capabilities. These tables can be added to enable comprehensive analytics.

### Analytics Snapshots

```sql
CREATE TABLE analytics_snapshots (
    id VARCHAR(255) PRIMARY KEY,
    snapshot_date DATE NOT NULL,
    metric_type VARCHAR(50) NOT NULL, -- 'daily_revenue', 'active_subscriptions', etc.
    metric_value DECIMAL(20, 2) NOT NULL,
    currency VARCHAR(3),
    breakdown JSON, -- Detailed breakdown of the metric
    calculation_method VARCHAR(50) DEFAULT 'scheduled', -- 'scheduled', 'on_demand', 'manual'
    calculation_duration_ms INTEGER, -- How long the calculation took
    data_freshness VARCHAR(50) DEFAULT 'historical', -- 'historical', 'recent', 'real_time'
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    UNIQUE KEY unique_snapshot (snapshot_date, metric_type, currency)
);
```

**Key Features:**
- Smart caching system for analytics data
- Tracks calculation method and performance
- JSON breakdown for detailed insights
- Automatic deduplication by date, type, and currency

### Analytics Events (Optional)

```sql
CREATE TABLE analytics_events (
    id VARCHAR(255) PRIMARY KEY,
    user_id VARCHAR(255),
    session_id VARCHAR(255),
    event_type VARCHAR(50) NOT NULL, -- 'payment_completed', 'subscription_created', etc.
    event_category VARCHAR(50), -- 'revenue', 'conversion', 'engagement'
    entity_type VARCHAR(50), -- 'order', 'subscription', 'membership'
    entity_id VARCHAR(255),
    properties JSON, -- Event-specific data
    revenue_cents BIGINT DEFAULT 0,
    currency VARCHAR(3),
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE SET NULL
);
```

**Key Features:**
- Detailed event tracking for advanced analytics
- Revenue attribution per event
- Flexible properties for custom data
- Session tracking for user journey analysis

### User Cohorts (Optional)

```sql
CREATE TABLE user_cohorts (
    id VARCHAR(255) PRIMARY KEY,
    user_id VARCHAR(255) NOT NULL,
    cohort_month DATE NOT NULL, -- Month when user first made a purchase
    cohort_type VARCHAR(50) NOT NULL, -- 'first_purchase', 'first_subscription'
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
    UNIQUE KEY unique_user_cohort (user_id, cohort_type)
);
```

**Key Features:**
- Cohort analysis for customer retention
- Multiple cohort types for different analyses
- Automatic customer segmentation

## Guest Support Architecture

### Overview

The payment system provides comprehensive guest support, allowing users to make purchases and subscribe to services without creating accounts. This is achieved through a unified customer management approach.

### Guest Customer Flow

1. **Guest Checkout**: Guest provides email and basic info
2. **Customer Creation**: Record created in `provider_customers` with `is_guest = true`
3. **Payment Processing**: Normal payment flow using guest customer
4. **Subscription Support**: Guests can subscribe to recurring services
5. **Guest Conversion**: When guest registers, all data is seamlessly transferred

### Key Tables for Guest Support

#### Provider Customers (Unified Customer Management)
```sql
-- Handles both authenticated users and guests
SELECT * FROM provider_customers WHERE is_guest = true;
```

#### Guest Subscriptions
```sql
-- Get all guest subscriptions with customer info
SELECT
  s.*,
  c.guest_email,
  c.guest_name
FROM subscriptions s
JOIN provider_customers c ON s.customer_id = c.id
WHERE c.is_guest = true;
```

#### Guest Payment Methods
```sql
-- Get saved payment methods for guests
SELECT
  pm.*,
  c.guest_email
FROM payment_methods pm
JOIN provider_customers c ON pm.guest_email = c.guest_email
WHERE pm.is_guest = true;
```

### Guest to User Conversion

When a guest creates an account:

1. **Update Customer Record**: Convert `is_guest = false`, add `user_id`
2. **Update Subscriptions**: Link to `user_id`
3. **Update Payment Methods**: Convert guest payment methods
4. **Maintain History**: All transaction history is preserved

```sql
-- Example conversion process
UPDATE provider_customers
SET is_guest = false, user_id = 'new_user_123', guest_email = NULL
WHERE guest_email = 'guest@example.com' AND is_guest = true;

UPDATE subscriptions
SET user_id = 'new_user_123'
WHERE customer_id IN (
  SELECT id FROM provider_customers WHERE user_id = 'new_user_123'
);
```

### Benefits of This Architecture

1. **Seamless Experience**: Guests can use all features without accounts
2. **Easy Conversion**: Simple process to convert guests to users
3. **Data Integrity**: No data loss during conversion
4. **Performance**: Efficient queries with proper indexing
5. **Flexibility**: Supports any business model requiring guest checkout
