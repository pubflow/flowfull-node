#!/usr/bin/env bun
/**
 * Webhook Diagnostics Script
 * 
 * This script helps diagnose webhook configuration issues in the bridge-payments system.
 * It checks environment variables, provider configurations, and webhook endpoints.
 */

import { config } from '../src/config/environment';
import { PaymentProviderFactory } from '../src/lib/providers/factory';

console.log('🔍 WEBHOOK DIAGNOSTICS REPORT');
console.log('=' .repeat(50));

// 1. Environment Variables Check
console.log('\n📋 ENVIRONMENT VARIABLES:');
console.log('-'.repeat(30));

const envVars = [
  'NODE_ENV',
  'STRIPE_SECRET_KEY',
  'STRIPE_PUBLISHABLE_KEY', 
  'STRIPE_WEBHOOK_SECRET',
  'STRIPE_API_VERSION',
  'PAYPAL_CLIENT_ID',
  'PAYPAL_CLIENT_SECRET',
  'PAYPAL_WEBHOOK_ID',
  'ENABLED_PROVIDERS',
  'DEFAULT_PAYMENT_PROVIDER'
];

envVars.forEach(varName => {
  const value = process.env[varName];
  if (value) {
    if (varName.includes('SECRET') || varName.includes('KEY')) {
      console.log(`✅ ${varName}: ${value.substring(0, 10)}...`);
    } else {
      console.log(`✅ ${varName}: ${value}`);
    }
  } else {
    console.log(`❌ ${varName}: NOT SET`);
  }
});

// 2. Provider Configuration Check
console.log('\n🔧 PROVIDER CONFIGURATIONS:');
console.log('-'.repeat(30));

try {
  PaymentProviderFactory.initialize();
  
  const availableProviders = PaymentProviderFactory.getAvailableProviders();
  console.log(`Available providers: ${availableProviders.join(', ')}`);
  
  for (const providerId of config.ENABLED_PROVIDERS) {
    console.log(`\n📦 ${providerId.toUpperCase()}:`);
    
    try {
      const adapter = PaymentProviderFactory.getAdapter(providerId);
      console.log(`  ✅ Adapter created successfully`);
      
      // Check webhook secret specifically
      if (providerId === 'stripe') {
        const stripeConfig = (adapter as any).config;
        if (stripeConfig.webhook_secret) {
          console.log(`  ✅ Webhook secret configured: ${stripeConfig.webhook_secret.substring(0, 10)}...`);
        } else {
          console.log(`  ❌ Webhook secret NOT configured`);
        }
      }
      
      const capabilities = adapter.getCapabilities();
      console.log(`  📋 Supports webhooks: ${capabilities.supports_webhooks ? '✅' : '❌'}`);
      
    } catch (error) {
      console.log(`  ❌ Failed to create adapter: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }
  
} catch (error) {
  console.log(`❌ Provider factory initialization failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
}

// 3. Webhook Endpoint Test
console.log('\n🌐 WEBHOOK ENDPOINT CONFIGURATION:');
console.log('-'.repeat(30));

const baseUrl = config.BASE_URL;
console.log(`Base URL: ${baseUrl}`);

const webhookEndpoints = [
  '/bridge-payment/webhooks/stripe',
  '/bridge-payment/webhooks/paypal',
  '/bridge-payment/webhooks/stats',
  '/bridge-payment/webhooks/process'
];

webhookEndpoints.forEach(endpoint => {
  console.log(`📍 ${baseUrl}${endpoint}`);
});

// 4. Test Webhook Signature Validation
console.log('\n🔐 WEBHOOK SIGNATURE VALIDATION TEST:');
console.log('-'.repeat(30));

async function testWebhookValidation() {
  try {
    // Test with Stripe if available
    if (config.ENABLED_PROVIDERS.includes('stripe') && config.STRIPE_WEBHOOK_SECRET) {
      console.log('Testing Stripe webhook validation...');
      
      const adapter = PaymentProviderFactory.getAdapter('stripe');
      
      // Create a test payload (this will fail signature validation, but we can test the flow)
      const testPayload = JSON.stringify({
        id: 'evt_test_webhook',
        object: 'event',
        type: 'payment_intent.succeeded',
        data: {
          object: {
            id: 'pi_test_123',
            status: 'succeeded'
          }
        }
      });
      
      const testSignature = 't=1234567890,v1=test_signature';
      
      try {
        await adapter.verifyWebhook(testPayload, testSignature);
        console.log('  ⚠️  Unexpected: Test signature validation passed (should fail)');
      } catch (error) {
        if (error instanceof Error && error.message.includes('signature')) {
          console.log('  ✅ Signature validation working (correctly rejected test signature)');
        } else {
          console.log(`  ❌ Unexpected error: ${error.message}`);
        }
      }
    } else {
      console.log('  ⚠️  Stripe not configured, skipping validation test');
    }
    
  } catch (error) {
    console.log(`  ❌ Test failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }
}

await testWebhookValidation();

// 5. Recommendations
console.log('\n💡 RECOMMENDATIONS:');
console.log('-'.repeat(30));

const recommendations = [];

if (!config.STRIPE_WEBHOOK_SECRET) {
  recommendations.push('Set STRIPE_WEBHOOK_SECRET environment variable from Stripe Dashboard');
}

if (!config.ENABLED_PROVIDERS.includes('stripe') && config.STRIPE_SECRET_KEY) {
  recommendations.push('Add "stripe" to ENABLED_PROVIDERS if you want to use Stripe');
}

if (config.NODE_ENV === 'production' && config.BASE_URL.includes('localhost')) {
  recommendations.push('Update BASE_URL for production environment');
}

if (recommendations.length === 0) {
  console.log('✅ Configuration looks good!');
} else {
  recommendations.forEach((rec, index) => {
    console.log(`${index + 1}. ${rec}`);
  });
}

console.log('\n🔚 DIAGNOSTICS COMPLETE');
console.log('=' .repeat(50));
