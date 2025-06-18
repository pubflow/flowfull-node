#!/usr/bin/env bun
/**
 * Test Guest Metadata Script
 * 
 * This script tests that guest information is properly saved to Stripe metadata
 * during the payment process and sync operation.
 */

import { config } from '../src/config/environment';
import { PaymentProviderFactory } from '../src/lib/providers/factory';

console.log('🧪 GUEST METADATA TEST');
console.log('=' .repeat(50));

async function testGuestMetadata() {
  try {
    // Initialize providers
    PaymentProviderFactory.initialize();
    
    // Get Stripe adapter
    const adapter = PaymentProviderFactory.getAdapter('stripe');
    
    console.log('\n📋 TEST 1: Create Payment Intent with Guest Data');
    console.log('-'.repeat(30));
    
    // Test guest data
    const guestData = {
      name: 'Juan Pérez',
      email: 'juan.perez@example.com',
      phone: '+1234567890'
    };
    
    // Create payment intent with guest metadata
    const paymentIntent = await adapter.createPaymentIntent({
      amount_cents: 5000, // $50.00
      currency: 'USD',
      description: 'Test donation with guest metadata',
      metadata: {
        source: 'guest-metadata-test',
        guest_email: guestData.email,
        guest_name: guestData.name,
        guest_phone: guestData.phone,
        is_guest_payment: 'true'
      }
    });
    
    console.log('✅ Payment Intent created:', paymentIntent.id);
    console.log('📝 Metadata included:', {
      guest_email: paymentIntent.metadata?.guest_email,
      guest_name: paymentIntent.metadata?.guest_name,
      guest_phone: paymentIntent.metadata?.guest_phone,
      is_guest_payment: paymentIntent.metadata?.is_guest_payment
    });
    
    console.log('\n📋 TEST 2: Update Payment Intent Metadata');
    console.log('-'.repeat(30));
    
    // Update metadata (simulating sync operation)
    const updatedPaymentIntent = await adapter.updatePaymentIntent(paymentIntent.id, {
      metadata: {
        ...paymentIntent.metadata,
        guest_email: guestData.email,
        guest_name: guestData.name,
        guest_phone: guestData.phone,
        is_guest_payment: 'true',
        updated_by_sync: 'true',
        sync_timestamp: new Date().toISOString()
      }
    });
    
    console.log('✅ Payment Intent updated:', updatedPaymentIntent.id);
    console.log('📝 Updated metadata:', {
      guest_email: updatedPaymentIntent.metadata?.guest_email,
      guest_name: updatedPaymentIntent.metadata?.guest_name,
      guest_phone: updatedPaymentIntent.metadata?.guest_phone,
      is_guest_payment: updatedPaymentIntent.metadata?.is_guest_payment,
      updated_by_sync: updatedPaymentIntent.metadata?.updated_by_sync,
      sync_timestamp: updatedPaymentIntent.metadata?.sync_timestamp
    });
    
    console.log('\n📋 TEST 3: Retrieve Payment Intent from Stripe');
    console.log('-'.repeat(30));
    
    // Retrieve payment intent to verify metadata persistence
    const retrievedPaymentIntent = await adapter.getPaymentIntent(paymentIntent.id);
    
    console.log('✅ Payment Intent retrieved:', retrievedPaymentIntent.id);
    console.log('📝 Persisted metadata:', {
      guest_email: retrievedPaymentIntent.metadata?.guest_email,
      guest_name: retrievedPaymentIntent.metadata?.guest_name,
      guest_phone: retrievedPaymentIntent.metadata?.guest_phone,
      is_guest_payment: retrievedPaymentIntent.metadata?.is_guest_payment,
      updated_by_sync: retrievedPaymentIntent.metadata?.updated_by_sync
    });
    
    console.log('\n📋 TEST 4: Verify Metadata in Stripe Dashboard');
    console.log('-'.repeat(30));
    
    console.log('🔗 Check Stripe Dashboard:');
    console.log(`   Payment Intent: ${paymentIntent.id}`);
    console.log(`   Dashboard URL: https://dashboard.stripe.com/test/payments/${paymentIntent.id}`);
    console.log('   Expected metadata:');
    console.log(`     - guest_email: ${guestData.email}`);
    console.log(`     - guest_name: ${guestData.name}`);
    console.log(`     - guest_phone: ${guestData.phone}`);
    console.log(`     - is_guest_payment: true`);
    console.log(`     - updated_by_sync: true`);
    
    console.log('\n📋 TEST RESULTS');
    console.log('-'.repeat(30));
    
    const tests = [
      {
        name: 'Payment Intent Creation',
        passed: !!paymentIntent.id,
        details: paymentIntent.id ? 'Created successfully' : 'Failed to create'
      },
      {
        name: 'Guest Email Metadata',
        passed: retrievedPaymentIntent.metadata?.guest_email === guestData.email,
        details: `Expected: ${guestData.email}, Got: ${retrievedPaymentIntent.metadata?.guest_email}`
      },
      {
        name: 'Guest Name Metadata',
        passed: retrievedPaymentIntent.metadata?.guest_name === guestData.name,
        details: `Expected: ${guestData.name}, Got: ${retrievedPaymentIntent.metadata?.guest_name}`
      },
      {
        name: 'Guest Phone Metadata',
        passed: retrievedPaymentIntent.metadata?.guest_phone === guestData.phone,
        details: `Expected: ${guestData.phone}, Got: ${retrievedPaymentIntent.metadata?.guest_phone}`
      },
      {
        name: 'Guest Payment Flag',
        passed: retrievedPaymentIntent.metadata?.is_guest_payment === 'true',
        details: `Expected: true, Got: ${retrievedPaymentIntent.metadata?.is_guest_payment}`
      },
      {
        name: 'Sync Update Flag',
        passed: retrievedPaymentIntent.metadata?.updated_by_sync === 'true',
        details: `Expected: true, Got: ${retrievedPaymentIntent.metadata?.updated_by_sync}`
      }
    ];
    
    tests.forEach(test => {
      const status = test.passed ? '✅ PASS' : '❌ FAIL';
      console.log(`${status} ${test.name}: ${test.details}`);
    });
    
    const passedTests = tests.filter(t => t.passed).length;
    const totalTests = tests.length;
    
    console.log(`\n📊 SUMMARY: ${passedTests}/${totalTests} tests passed`);
    
    if (passedTests === totalTests) {
      console.log('🎉 All tests passed! Guest metadata is working correctly.');
    } else {
      console.log('⚠️ Some tests failed. Check the implementation.');
    }
    
    // Clean up - cancel the test payment intent
    try {
      await adapter.cancelPaymentIntent(paymentIntent.id);
      console.log('🧹 Test payment intent cancelled successfully');
    } catch (cancelError) {
      console.log('⚠️ Could not cancel test payment intent:', cancelError);
    }
    
  } catch (error) {
    console.error('❌ Test failed:', error);
    
    if (error instanceof Error) {
      console.error('   Error message:', error.message);
      console.error('   Stack trace:', error.stack);
    }
  }
}

// Run the test
await testGuestMetadata();

console.log('\n🔚 TEST COMPLETE');
console.log('=' .repeat(50));
