#!/usr/bin/env bun

import { getDatabase } from '@/lib/database/connection';
import { config } from '@/config/environment';

async function seedPaymentProviders() {
  const db = await getDatabase();

  console.log('🌱 Seeding payment providers following native-payments standards...');

  // Payment providers following native-payments schema standards
  const providers = [
    {
      id: 'stripe',
      display_name: 'Stripe',
      picture: 'https://js.stripe.com/v3/fingerprinted/img/stripe_logo-434ecdc86c.svg',
      is_active: true, // Using boolean for TypeScript compatibility
      supports_subscriptions: true,
      supports_saved_methods: true,
      config: JSON.stringify({
        api_version: '2023-10-16',
        supports_3d_secure: true,
        supported_payment_types: ['credit_card', 'debit_card', 'apple_pay', 'google_pay'],
        supported_currencies: [
          'USD', 'EUR', 'GBP', 'CAD', 'AUD', 'JPY', 'CHF', 'SEK', 'NOK', 'DKK',
          'PLN', 'CZK', 'HUF', 'BGN', 'RON', 'HRK', 'ISK', 'MXN', 'BRL', 'SGD',
          'HKD', 'NZD', 'KRW', 'INR', 'MYR', 'THB', 'PHP', 'TWD', 'IDR', 'VND'
        ],
        integration_type: 'api',
        requires_client_side_sdk: true,
        webhook_events: [
          'payment_intent.succeeded',
          'payment_intent.payment_failed',
          'payment_intent.requires_action',
          'payment_method.attached',
          'customer.created',
          'customer.updated',
          'invoice.payment_succeeded',
          'invoice.payment_failed',
          'customer.subscription.created',
          'customer.subscription.updated',
          'customer.subscription.deleted'
        ],
        features: {
          payment_intents: true,
          setup_intents: true,
          customers: true,
          payment_methods: true,
          subscriptions: true,
          invoices: true,
          refunds: true,
          disputes: true,
          connect: false,
          marketplace: false
        }
      }),
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString()
    },
    {
      id: 'paypal',
      display_name: 'PayPal',
      picture: 'https://www.paypalobjects.com/webstatic/mktg/logo/pp_cc_mark_111x69.jpg',
      is_active: true,
      supports_subscriptions: true,
      supports_saved_methods: false, // PayPal typically doesn't save payment methods in the same way
      config: JSON.stringify({
        api_version: 'v2',
        supports_3d_secure: false,
        supported_payment_types: ['paypal', 'credit_card', 'debit_card'],
        supported_currencies: [
          'USD', 'EUR', 'GBP', 'CAD', 'AUD', 'JPY', 'CHF', 'SEK', 'NOK', 'DKK',
          'PLN', 'CZK', 'HUF', 'BRL', 'SGD', 'HKD', 'NZD', 'MXN', 'ILS', 'TWD',
          'THB', 'PHP', 'MYR', 'RUB'
        ],
        integration_type: 'redirect',
        requires_client_side_sdk: true,
        webhook_events: [
          'PAYMENT.CAPTURE.COMPLETED',
          'PAYMENT.CAPTURE.DENIED',
          'PAYMENT.CAPTURE.PENDING',
          'PAYMENT.CAPTURE.REFUNDED',
          'BILLING.SUBSCRIPTION.CREATED',
          'BILLING.SUBSCRIPTION.UPDATED',
          'BILLING.SUBSCRIPTION.CANCELLED',
          'BILLING.SUBSCRIPTION.SUSPENDED',
          'BILLING.SUBSCRIPTION.PAYMENT.FAILED'
        ],
        features: {
          payment_intents: true,
          setup_intents: false,
          customers: false,
          payment_methods: false,
          subscriptions: true,
          invoices: false,
          refunds: true,
          disputes: true,
          connect: false,
          marketplace: false
        }
      }),
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString()
    }
  ];

  for (const provider of providers) {
    try {
      // Check if provider already exists
      const existing = await db
        .selectFrom('payment_providers')
        .select('id')
        .where('id', '=', provider.id)
        .executeTakeFirst();

      if (existing) {
        // Update existing provider
        await db
          .updateTable('payment_providers')
          .set({
            display_name: provider.display_name,
            picture: provider.picture,
            is_active: provider.is_active,
            supports_subscriptions: provider.supports_subscriptions,
            supports_saved_methods: provider.supports_saved_methods,
            config: provider.config,
            updated_at: provider.updated_at
          })
          .where('id', '=', provider.id)
          .execute();

        console.log(`✅ Updated provider: ${provider.display_name}`);
      } else {
        // Insert new provider
        await db
          .insertInto('payment_providers')
          .values(provider)
          .execute();

        console.log(`✅ Created provider: ${provider.display_name}`);
      }
    } catch (error) {
      console.error(`❌ Failed to seed provider ${provider.display_name}:`, error);
    }
  }
}

async function seedDevelopmentData() {
  if (config.NODE_ENV !== 'development' || !config.DEV_SEED_DATA) {
    console.log('⏭️  Skipping development data seeding (not in development mode or disabled)');
    return;
  }

  const db = await getDatabase();

  console.log('🌱 Seeding development data...');

  // Create test payment user
  const testUser = {
    id: 'test_user_123',
    flowless_user_id: 'flowless_user_123',
    email: 'test@example.com',
    name: 'Test User',
    user_type: 'individual',
    is_guest: false,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString()
  };

  try {
    const existingUser = await db
      .selectFrom('payment_users')
      .select('id')
      .where('id', '=', testUser.id)
      .executeTakeFirst();

    if (!existingUser) {
      await db
        .insertInto('payment_users')
        .values(testUser)
        .execute();

      console.log('✅ Created test user');
    } else {
      console.log('⏭️  Test user already exists');
    }
  } catch (error) {
    console.error('❌ Failed to create test user:', error);
  }

  // Create test guest user
  const testGuestUser = {
    id: 'guest_user_123',
    flowless_user_id: 'guest_123',
    email: 'guest@example.com',
    name: 'Guest User',
    user_type: 'individual',
    is_guest: true,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString()
  };

  try {
    const existingGuestUser = await db
      .selectFrom('payment_users')
      .select('id')
      .where('id', '=', testGuestUser.id)
      .executeTakeFirst();

    if (!existingGuestUser) {
      await db
        .insertInto('payment_users')
        .values(testGuestUser)
        .execute();

      console.log('✅ Created test guest user');
    } else {
      console.log('⏭️  Test guest user already exists');
    }
  } catch (error) {
    console.error('❌ Failed to create test guest user:', error);
  }

  // Create test payments
  const testPayments = [
    {
      id: 'payment_test_1',
      user_id: 'test_user_123',
      provider_id: 'stripe',
      provider_intent_id: 'pi_test_123',
      amount_cents: 2999,
      currency: 'USD',
      status: 'succeeded',
      description: 'Test Payment - Premium Plan',
      is_guest_payment: false,
      metadata: JSON.stringify({ test: true, plan: 'premium' }),
      created_at: new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString(), // 1 day ago
      updated_at: new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString(),
      completed_at: new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString()
    },
    {
      id: 'payment_guest_1',
      user_id: null,
      provider_id: 'stripe',
      provider_intent_id: 'pi_guest_123',
      amount_cents: 1999,
      currency: 'USD',
      status: 'succeeded',
      description: 'Guest Payment - Basic Plan',
      is_guest_payment: true,
      guest_email: 'guest@example.com',
      guest_data: JSON.stringify({
        email: 'guest@example.com',
        name: 'Guest User',
        phone: '+1234567890'
      }),
      metadata: JSON.stringify({ test: true, plan: 'basic' }),
      created_at: new Date(Date.now() - 12 * 60 * 60 * 1000).toISOString(), // 12 hours ago
      updated_at: new Date(Date.now() - 12 * 60 * 60 * 1000).toISOString(),
      completed_at: new Date(Date.now() - 12 * 60 * 60 * 1000).toISOString()
    },
    {
      id: 'payment_pending_1',
      user_id: 'test_user_123',
      provider_id: 'stripe',
      provider_intent_id: 'pi_pending_123',
      client_secret: 'pi_pending_123_secret_abc',
      amount_cents: 4999,
      currency: 'USD',
      status: 'pending',
      description: 'Pending Payment - Enterprise Plan',
      is_guest_payment: false,
      metadata: JSON.stringify({ test: true, plan: 'enterprise' }),
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString()
    }
  ];

  for (const payment of testPayments) {
    try {
      const existingPayment = await db
        .selectFrom('payments')
        .select('id')
        .where('id', '=', payment.id)
        .executeTakeFirst();

      if (!existingPayment) {
        await db
          .insertInto('payments')
          .values(payment)
          .execute();

        console.log(`✅ Created test payment: ${payment.id}`);
      } else {
        console.log(`⏭️  Test payment already exists: ${payment.id}`);
      }
    } catch (error) {
      console.error(`❌ Failed to create test payment ${payment.id}:`, error);
    }
  }
}

async function main() {
  console.log('🌱 Starting database seeding...');

  try {
    await seedPaymentProviders();
    await seedDevelopmentData();

    console.log('✅ Database seeding completed successfully');
  } catch (error) {
    console.error('❌ Database seeding failed:', error);
    process.exit(1);
  }

  process.exit(0);
}

// Run if called directly
if (import.meta.main) {
  main().catch(error => {
    console.error('❌ Seeding script failed:', error);
    process.exit(1);
  });
}
