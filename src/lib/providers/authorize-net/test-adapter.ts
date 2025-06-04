// Test file for Authorize.Net adapter
// This is for development testing only

import { AuthorizeNetAdapter } from './authorize-net-adapter';
import { PaymentAdapterConfig, PaymentMethodType } from '../base/payment-adapter';

// Test configuration (sandbox)
const testConfig: PaymentAdapterConfig = {
  provider_id: 'authorize_net',
  api_key: 'test_api_login_id', // Replace with actual sandbox credentials
  secret_key: 'test_transaction_key', // Replace with actual sandbox credentials
  environment: 'sandbox',
  additional_config: {
    signature_key: 'test_signature_key' // Optional for webhook verification
  }
};

async function testAuthorizeNetAdapter() {
  console.log('🧪 Testing Authorize.Net Adapter...');

  try {
    // Initialize adapter
    const adapter = new AuthorizeNetAdapter(testConfig);
    
    // Test capabilities
    console.log('📋 Capabilities:', adapter.getCapabilities());

    // Test health check
    console.log('🏥 Health check...');
    const healthCheck = await adapter.healthCheck();
    console.log('Health check result:', healthCheck);

    // Test customer creation
    console.log('👤 Creating customer...');
    const customer = await adapter.createCustomer({
      email: 'test@example.com',
      name: 'Test Customer',
      phone: '+1234567890'
    });
    console.log('Created customer:', customer);

    // Test payment method creation
    console.log('💳 Creating payment method...');
    const paymentMethod = await adapter.createPaymentMethod({
      type: PaymentMethodType.CREDIT_CARD,
      customer_id: customer.id,
      card: {
        number: '4111111111111111', // Test card number
        exp_month: 12,
        exp_year: 2025,
        cvc: '123'
      },
      billing_details: {
        name: 'Test Customer',
        email: 'test@example.com',
        address: {
          line1: '123 Test St',
          city: 'Test City',
          state: 'CA',
          postal_code: '12345',
          country: 'US'
        }
      }
    });
    console.log('Created payment method:', paymentMethod);

    // Test payment intent creation (authorization)
    console.log('🔒 Creating payment intent with manual capture...');
    const paymentIntent = await adapter.createPaymentIntent({
      amount_cents: 2999, // $29.99
      currency: 'USD',
      description: 'Test payment',
      customer_id: customer.id,
      payment_method_id: paymentMethod.id,
      capture_method: 'manual',
      confirm: true
    });
    console.log('Created payment intent:', paymentIntent);

    // Test capture (if authorized)
    if (paymentIntent.status === 'requires_confirmation') {
      console.log('💰 Capturing payment...');
      const capturedPayment = await adapter.capturePaymentIntent(paymentIntent.id);
      console.log('Captured payment:', capturedPayment);
    }

    console.log('✅ All tests completed successfully!');

  } catch (error) {
    console.error('❌ Test failed:', error);
  }
}

// Export test function for manual testing
export { testAuthorizeNetAdapter };

// Uncomment to run tests directly
// testAuthorizeNetAdapter();
