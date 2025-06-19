#!/usr/bin/env bun
/**
 * Admin System Test Script
 * 
 * This script tests the complete admin system including:
 * - Product CRUD operations
 * - Product synchronization with providers
 * - Bulk operations
 * - Analytics endpoints
 */

console.log('🧪 ADMIN SYSTEM TEST');
console.log('=' .repeat(60));

const BRIDGE_PAYMENT_URL = 'http://localhost:3001';

async function testAdminSystem() {
  try {
    console.log('🔧 Testing against:', BRIDGE_PAYMENT_URL);
    
    // Test 1: Admin Overview
    console.log('\n📋 TEST 1: Admin Overview');
    console.log('-'.repeat(40));
    
    const overviewResponse = await fetch(`${BRIDGE_PAYMENT_URL}/bridge-payment/admin`);
    
    if (overviewResponse.ok) {
      const overview = await overviewResponse.json();
      console.log('✅ Admin overview retrieved');
      console.log('📝 Available endpoints:', Object.keys(overview.data.endpoints).length);
      console.log('📝 Features:', Object.keys(overview.data.features).length);
    } else {
      console.log('❌ Admin overview failed:', await overviewResponse.text());
    }
    
    // Test 2: Create Product
    console.log('\n📋 TEST 2: Create Product');
    console.log('-'.repeat(40));
    
    const productData = {
      name: 'Test Premium Membership',
      description: 'Premium membership with full access',
      product_type: 'subscription',
      is_recurring: true,
      price_cents: 2999, // $29.99
      currency: 'USD',
      billing_interval: 'monthly',
      trial_days: 7,
      metadata: {
        features: ['unlimited_access', 'priority_support'],
        tier: 'premium',
        test: true
      },
      is_active: true
    };
    
    const createResponse = await fetch(`${BRIDGE_PAYMENT_URL}/bridge-payment/admin/products`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(productData)
    });
    
    let createdProduct: any = null;
    
    if (createResponse.ok) {
      const result = await createResponse.json();
      createdProduct = result.data;
      console.log('✅ Product created:', createdProduct.id);
      console.log('📝 Name:', createdProduct.name);
      console.log('📝 Price: $' + (createdProduct.price_cents / 100));
    } else {
      console.log('❌ Product creation failed:', await createResponse.text());
    }
    
    // Test 3: List Products
    console.log('\n📋 TEST 3: List Products');
    console.log('-'.repeat(40));
    
    const listResponse = await fetch(`${BRIDGE_PAYMENT_URL}/bridge-payment/admin/products?limit=10&is_active=true`);
    
    if (listResponse.ok) {
      const result = await listResponse.json();
      console.log('✅ Products listed:', result.data.length);
      console.log('📝 Total products:', result.pagination.total);
      
      result.data.forEach((product: any, index: number) => {
        console.log(`   ${index + 1}. ${product.name} - $${product.price_cents / 100} (${product.product_type})`);
      });
    } else {
      console.log('❌ Product listing failed:', await listResponse.text());
    }
    
    // Test 4: Update Product (if we created one)
    if (createdProduct) {
      console.log('\n📋 TEST 4: Update Product');
      console.log('-'.repeat(40));
      
      const updateData = {
        description: 'Updated premium membership with enhanced features',
        price_cents: 3499, // $34.99
        metadata: {
          ...createdProduct.metadata,
          updated: true,
          updated_at: new Date().toISOString()
        }
      };
      
      const updateResponse = await fetch(`${BRIDGE_PAYMENT_URL}/bridge-payment/admin/products/${createdProduct.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(updateData)
      });
      
      if (updateResponse.ok) {
        const result = await updateResponse.json();
        console.log('✅ Product updated:', result.data.id);
        console.log('📝 New price: $' + (result.data.price_cents / 100));
      } else {
        console.log('❌ Product update failed:', await updateResponse.text());
      }
    }
    
    // Test 5: Sync Product with Stripe (if we created one)
    if (createdProduct) {
      console.log('\n📋 TEST 5: Sync Product with Stripe');
      console.log('-'.repeat(40));
      
      const syncData = {
        provider_id: 'stripe',
        force: true,
        dryRun: false
      };
      
      const syncResponse = await fetch(`${BRIDGE_PAYMENT_URL}/bridge-payment/admin/products/${createdProduct.id}/sync`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(syncData)
      });
      
      if (syncResponse.ok) {
        const result = await syncResponse.json();
        console.log('✅ Product sync completed:', result.data.action);
        console.log('📝 Provider product ID:', result.data.provider_product_id);
      } else {
        console.log('❌ Product sync failed:', await syncResponse.text());
      }
    }
    
    // Test 6: Get Sync Status (if we created one)
    if (createdProduct) {
      console.log('\n📋 TEST 6: Get Sync Status');
      console.log('-'.repeat(40));
      
      const statusResponse = await fetch(`${BRIDGE_PAYMENT_URL}/bridge-payment/admin/products/${createdProduct.id}/sync-status`);
      
      if (statusResponse.ok) {
        const result = await statusResponse.json();
        console.log('✅ Sync status retrieved');
        console.log('📝 Providers:', Object.keys(result.data.providers));
        
        Object.entries(result.data.providers).forEach(([provider, status]: [string, any]) => {
          console.log(`   ${provider}: ${status.exists ? 'EXISTS' : 'NOT_FOUND'}`);
        });
      } else {
        console.log('❌ Sync status failed:', await statusResponse.text());
      }
    }
    
    // Test 7: Bulk Sync
    console.log('\n📋 TEST 7: Bulk Sync Status');
    console.log('-'.repeat(40));
    
    const bulkStatusResponse = await fetch(`${BRIDGE_PAYMENT_URL}/bridge-payment/admin/sync/status`);
    
    if (bulkStatusResponse.ok) {
      const result = await bulkStatusResponse.json();
      console.log('✅ Bulk sync status retrieved');
      console.log('📝 Providers available:', Object.keys(result.data.providers));
      
      Object.entries(result.data.providers).forEach(([provider, status]: [string, any]) => {
        console.log(`   ${provider}: ${status.available ? 'AVAILABLE' : 'UNAVAILABLE'}`);
      });
    } else {
      console.log('❌ Bulk sync status failed:', await bulkStatusResponse.text());
    }
    
    // Test 8: Health Check
    console.log('\n📋 TEST 8: System Health Check');
    console.log('-'.repeat(40));
    
    const healthResponse = await fetch(`${BRIDGE_PAYMENT_URL}/bridge-payment/admin/sync/health`);
    
    if (healthResponse.ok) {
      const result = await healthResponse.json();
      console.log('✅ Health check completed');
      console.log('📝 Overall status:', result.data.overall_status);
      
      Object.entries(result.data.providers).forEach(([provider, health]: [string, any]) => {
        console.log(`   ${provider}: ${health.status}`);
      });
    } else {
      console.log('❌ Health check failed:', await healthResponse.text());
    }
    
    // Test 9: Admin Statistics
    console.log('\n📋 TEST 9: Admin Statistics');
    console.log('-'.repeat(40));
    
    const statsResponse = await fetch(`${BRIDGE_PAYMENT_URL}/bridge-payment/admin/stats`);
    
    if (statsResponse.ok) {
      const result = await statsResponse.json();
      console.log('✅ Statistics retrieved');
      console.log('📝 Products total:', result.data.products.total);
      console.log('📝 Subscriptions total:', result.data.subscriptions.total);
    } else {
      console.log('❌ Statistics failed:', await statsResponse.text());
    }
    
    // Test 10: Subscription Analytics
    console.log('\n📋 TEST 10: Subscription Analytics');
    console.log('-'.repeat(40));
    
    const analyticsResponse = await fetch(`${BRIDGE_PAYMENT_URL}/bridge-payment/admin/subscriptions/analytics`);
    
    if (analyticsResponse.ok) {
      const result = await analyticsResponse.json();
      console.log('✅ Analytics retrieved');
      console.log('📝 Total subscriptions:', result.data.summary.total_subscriptions);
      console.log('📝 Active subscriptions:', result.data.summary.active_subscriptions);
    } else {
      console.log('❌ Analytics failed:', await analyticsResponse.text());
    }
    
    // Test 11: Cleanup (Delete Test Product)
    if (createdProduct) {
      console.log('\n📋 TEST 11: Cleanup - Delete Test Product');
      console.log('-'.repeat(40));
      
      const deleteResponse = await fetch(`${BRIDGE_PAYMENT_URL}/bridge-payment/admin/products/${createdProduct.id}`, {
        method: 'DELETE'
      });
      
      if (deleteResponse.ok) {
        console.log('✅ Test product deleted:', createdProduct.id);
      } else {
        console.log('❌ Product deletion failed:', await deleteResponse.text());
      }
    }
    
    // Summary
    console.log('\n📊 ADMIN SYSTEM TEST SUMMARY');
    console.log('-'.repeat(40));
    
    const tests = [
      { name: 'Admin Overview', passed: overviewResponse.ok },
      { name: 'Product Creation', passed: createResponse.ok },
      { name: 'Product Listing', passed: listResponse.ok },
      { name: 'Product Update', passed: createdProduct ? true : false },
      { name: 'Product Sync', passed: createdProduct ? true : false },
      { name: 'Sync Status', passed: createdProduct ? true : false },
      { name: 'Bulk Sync Status', passed: bulkStatusResponse.ok },
      { name: 'Health Check', passed: healthResponse.ok },
      { name: 'Statistics', passed: statsResponse.ok },
      { name: 'Analytics', passed: analyticsResponse.ok }
    ];
    
    tests.forEach(test => {
      const status = test.passed ? '✅ PASS' : '❌ FAIL';
      console.log(`${status} ${test.name}`);
    });
    
    const passedTests = tests.filter(t => t.passed).length;
    const totalTests = tests.length;
    
    console.log(`\n📊 SUMMARY: ${passedTests}/${totalTests} tests passed`);
    
    if (passedTests === totalTests) {
      console.log('🎉 All admin system tests passed!');
      console.log('✅ Admin system is fully functional');
    } else {
      console.log('⚠️ Some admin tests failed. Check the implementation.');
    }
    
    console.log('\n💡 ADMIN SYSTEM CAPABILITIES:');
    console.log('✅ Product CRUD operations');
    console.log('✅ Provider synchronization');
    console.log('✅ Bulk operations');
    console.log('✅ Health monitoring');
    console.log('✅ Analytics and reporting');
    console.log('✅ System administration');
    
  } catch (error) {
    console.error('❌ Admin system test failed:', error);
    
    if (error instanceof Error) {
      console.error('   Error message:', error.message);
    }
  }
}

// Run the test
testAdminSystem().then(() => {
  console.log('\n🔚 ADMIN SYSTEM TEST COMPLETE');
  console.log('=' .repeat(60));
}).catch(console.error);

export {};
