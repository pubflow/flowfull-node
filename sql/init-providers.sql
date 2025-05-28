-- Payment Providers Initialization
-- Following native-payments standards and schema
-- Based on: native-payments/sqlite/schema.sql and native-payments/docs/api-routes.md

-- Clear existing providers (optional - remove if you want to keep existing data)
-- DELETE FROM payment_providers WHERE id IN ('stripe', 'paypal');

-- Insert Stripe provider
INSERT OR REPLACE INTO payment_providers (
    id,
    display_name,
    picture,
    is_active,
    supports_subscriptions,
    supports_saved_methods,
    config,
    created_at,
    updated_at
) VALUES (
    'stripe',
    'Stripe',
    'https://js.stripe.com/v3/fingerprinted/img/stripe_logo-434ecdc86c.svg',
    1,
    1,
    1,
    json('{
        "api_version": "2023-10-16",
        "supports_3d_secure": true,
        "integration_type": "api",
        "requires_client_side_sdk": true,
        "supported_payment_types": [
            "credit_card",
            "debit_card",
            "apple_pay",
            "google_pay"
        ],
        "supported_currencies": [
            "USD", "EUR", "GBP", "CAD", "AUD", "JPY", "CHF", "SEK", "NOK", "DKK",
            "PLN", "CZK", "HUF", "BGN", "RON", "HRK", "ISK", "MXN", "BRL", "SGD",
            "HKD", "NZD", "KRW", "INR", "MYR", "THB", "PHP", "TWD", "IDR", "VND"
        ],
        "webhook_events": [
            "payment_intent.succeeded",
            "payment_intent.payment_failed",
            "payment_intent.requires_action",
            "payment_intent.canceled",
            "payment_method.attached",
            "payment_method.detached",
            "customer.created",
            "customer.updated",
            "customer.deleted",
            "invoice.payment_succeeded",
            "invoice.payment_failed",
            "customer.subscription.created",
            "customer.subscription.updated",
            "customer.subscription.deleted",
            "customer.subscription.trial_will_end"
        ],
        "features": {
            "payment_intents": true,
            "setup_intents": true,
            "customers": true,
            "payment_methods": true,
            "subscriptions": true,
            "invoices": true,
            "refunds": true,
            "disputes": true,
            "connect": false,
            "marketplace": false
        },
        "bridge_settings": {
            "auto_confirm": false,
            "save_payment_method": "ask",
            "statement_descriptor": "BRIDGE-PAY",
            "receipt_email": true
        }
    }'),
    datetime('now'),
    datetime('now')
);

-- Insert PayPal provider
INSERT OR REPLACE INTO payment_providers (
    id,
    display_name,
    picture,
    is_active,
    supports_subscriptions,
    supports_saved_methods,
    config,
    created_at,
    updated_at
) VALUES (
    'paypal',
    'PayPal',
    'https://www.paypalobjects.com/webstatic/mktg/logo/pp_cc_mark_111x69.jpg',
    1,
    1,
    0,
    json('{
        "api_version": "v2",
        "supports_3d_secure": false,
        "integration_type": "redirect",
        "requires_client_side_sdk": true,
        "supported_payment_types": [
            "paypal",
            "credit_card",
            "debit_card"
        ],
        "supported_currencies": [
            "USD", "EUR", "GBP", "CAD", "AUD", "JPY", "CHF", "SEK", "NOK", "DKK",
            "PLN", "CZK", "HUF", "BRL", "SGD", "HKD", "NZD", "MXN", "ILS", "TWD",
            "THB", "PHP", "MYR", "RUB"
        ],
        "webhook_events": [
            "PAYMENT.CAPTURE.COMPLETED",
            "PAYMENT.CAPTURE.DENIED",
            "PAYMENT.CAPTURE.PENDING",
            "PAYMENT.CAPTURE.REFUNDED",
            "PAYMENT.CAPTURE.REVERSED",
            "BILLING.SUBSCRIPTION.CREATED",
            "BILLING.SUBSCRIPTION.UPDATED",
            "BILLING.SUBSCRIPTION.CANCELLED",
            "BILLING.SUBSCRIPTION.SUSPENDED",
            "BILLING.SUBSCRIPTION.PAYMENT.FAILED",
            "BILLING.SUBSCRIPTION.ACTIVATED"
        ],
        "features": {
            "payment_intents": true,
            "setup_intents": false,
            "customers": false,
            "payment_methods": false,
            "subscriptions": true,
            "invoices": false,
            "refunds": true,
            "disputes": true,
            "connect": false,
            "marketplace": false
        },
        "bridge_settings": {
            "auto_confirm": true,
            "save_payment_method": "never",
            "return_url_required": true,
            "cancel_url_required": true
        }
    }'),
    datetime('now'),
    datetime('now')
);

-- Verify the insertion
SELECT 
    id,
    display_name,
    is_active,
    supports_subscriptions,
    supports_saved_methods,
    created_at
FROM payment_providers 
WHERE id IN ('stripe', 'paypal')
ORDER BY id;
