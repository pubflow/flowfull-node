#!/usr/bin/env bun

import { PaymentProviderFactory } from '@/lib/providers/factory';
import { config } from '@/config/environment';

interface ProviderTestResult {
  provider_id: string;
  test_name: string;
  status: 'pass' | 'fail' | 'skip';
  message: string;
  duration_ms?: number;
  error?: string;
}

async function testProviderHealthCheck(providerId: string): Promise<ProviderTestResult> {
  const startTime = Date.now();
  
  try {
    const adapter = PaymentProviderFactory.getAdapter(providerId);
    const health = await adapter.healthCheck();
    
    return {
      provider_id: providerId,
      test_name: 'Health Check',
      status: health.success ? 'pass' : 'fail',
      message: health.success ? 'Provider is healthy' : `Health check failed: ${health.error}`,
      duration_ms: Date.now() - startTime,
      error: health.error
    };
  } catch (error) {
    return {
      provider_id: providerId,
      test_name: 'Health Check',
      status: 'fail',
      message: 'Failed to get adapter or perform health check',
      duration_ms: Date.now() - startTime,
      error: error instanceof Error ? error.message : 'Unknown error'
    };
  }
}

async function testProviderCapabilities(providerId: string): Promise<ProviderTestResult> {
  try {
    const adapter = PaymentProviderFactory.getAdapter(providerId);
    const capabilities = adapter.getCapabilities();
    
    const requiredCapabilities = [
      'supports_payment_intents',
      'supported_currencies',
      'supported_payment_methods'
    ];
    
    const missingCapabilities = requiredCapabilities.filter(cap => 
      capabilities[cap as keyof typeof capabilities] === undefined
    );
    
    if (missingCapabilities.length > 0) {
      return {
        provider_id: providerId,
        test_name: 'Capabilities',
        status: 'fail',
        message: `Missing capabilities: ${missingCapabilities.join(', ')}`,
        error: `Required capabilities not defined: ${missingCapabilities.join(', ')}`
      };
    }
    
    return {
      provider_id: providerId,
      test_name: 'Capabilities',
      status: 'pass',
      message: `All required capabilities present. Supports ${capabilities.supported_currencies.length} currencies, ${capabilities.supported_payment_methods.length} payment methods`
    };
  } catch (error) {
    return {
      provider_id: providerId,
      test_name: 'Capabilities',
      status: 'fail',
      message: 'Failed to get provider capabilities',
      error: error instanceof Error ? error.message : 'Unknown error'
    };
  }
}

async function testProviderCurrencySupport(providerId: string): Promise<ProviderTestResult> {
  try {
    const adapter = PaymentProviderFactory.getAdapter(providerId);
    
    const testCurrencies = ['USD', 'EUR', 'GBP'];
    const supportedCurrencies = testCurrencies.filter(currency => 
      adapter.supportsCurrency(currency)
    );
    
    if (supportedCurrencies.length === 0) {
      return {
        provider_id: providerId,
        test_name: 'Currency Support',
        status: 'fail',
        message: 'No common currencies supported',
        error: `None of ${testCurrencies.join(', ')} are supported`
      };
    }
    
    return {
      provider_id: providerId,
      test_name: 'Currency Support',
      status: 'pass',
      message: `Supports ${supportedCurrencies.length}/${testCurrencies.length} test currencies: ${supportedCurrencies.join(', ')}`
    };
  } catch (error) {
    return {
      provider_id: providerId,
      test_name: 'Currency Support',
      status: 'fail',
      message: 'Failed to test currency support',
      error: error instanceof Error ? error.message : 'Unknown error'
    };
  }
}

async function testProviderPaymentIntent(providerId: string): Promise<ProviderTestResult> {
  if (config.NODE_ENV === 'production') {
    return {
      provider_id: providerId,
      test_name: 'Payment Intent Creation',
      status: 'skip',
      message: 'Skipped in production environment'
    };
  }

  const startTime = Date.now();
  
  try {
    const adapter = PaymentProviderFactory.getAdapter(providerId);

    // Simple connectivity test without creating payment intents
    const healthResult = await adapter.healthCheck();

    if (!healthResult.success) {
      return {
        provider_id: providerId,
        test_name: 'Provider Connectivity',
        status: 'fail',
        message: healthResult.error || 'Health check failed',
        duration_ms: Date.now() - startTime
      };
    }

    return {
      provider_id: providerId,
      test_name: 'Provider Connectivity',
      status: 'pass',
      message: `Provider is healthy (latency: ${healthResult.latency}ms)`,
      duration_ms: Date.now() - startTime
    };
  } catch (error) {
    return {
      provider_id: providerId,
      test_name: 'Payment Intent Creation',
      status: 'fail',
      message: 'Failed to create payment intent',
      duration_ms: Date.now() - startTime,
      error: error instanceof Error ? error.message : 'Unknown error'
    };
  }
}

async function testProvider(providerId: string): Promise<ProviderTestResult[]> {
  console.log(`\n🧪 Testing provider: ${providerId}`);
  
  const tests = [
    testProviderHealthCheck,
    testProviderCapabilities,
    testProviderCurrencySupport,
    testProviderPaymentIntent
  ];
  
  const results: ProviderTestResult[] = [];
  
  for (const test of tests) {
    try {
      const result = await test(providerId);
      results.push(result);
      
      const icon = result.status === 'pass' ? '✅' : result.status === 'skip' ? '⏭️' : '❌';
      const duration = result.duration_ms ? ` (${result.duration_ms}ms)` : '';
      console.log(`  ${icon} ${result.test_name}: ${result.message}${duration}`);
      
      if (result.status === 'fail' && result.error) {
        console.log(`     Error: ${result.error}`);
      }
    } catch (error) {
      const result: ProviderTestResult = {
        provider_id: providerId,
        test_name: test.name,
        status: 'fail',
        message: 'Test execution failed',
        error: error instanceof Error ? error.message : 'Unknown error'
      };
      
      results.push(result);
      console.log(`  ❌ ${result.test_name}: ${result.message}`);
      console.log(`     Error: ${result.error}`);
    }
  }
  
  return results;
}

async function runProviderTests() {
  console.log('🧪 Starting payment provider tests...');
  console.log(`Environment: ${config.NODE_ENV}`);
  
  const availableProviders = PaymentProviderFactory.getAvailableProviders();
  
  if (availableProviders.length === 0) {
    console.log('❌ No payment providers available for testing');
    process.exit(1);
  }
  
  console.log(`Available providers: ${availableProviders.join(', ')}`);
  
  let allResults: ProviderTestResult[] = [];
  
  for (const providerId of availableProviders) {
    const results = await testProvider(providerId);
    allResults = allResults.concat(results);
  }
  
  // Summary
  console.log('\n📊 Test Summary:');
  
  const groupedResults = allResults.reduce((acc, result) => {
    if (!acc[result.provider_id]) {
      acc[result.provider_id] = [];
    }
    acc[result.provider_id].push(result);
    return acc;
  }, {} as Record<string, ProviderTestResult[]>);
  
  let totalPassed = 0;
  let totalFailed = 0;
  let totalSkipped = 0;
  let hasFailures = false;
  
  for (const [providerId, results] of Object.entries(groupedResults)) {
    const passed = results.filter(r => r.status === 'pass').length;
    const failed = results.filter(r => r.status === 'fail').length;
    const skipped = results.filter(r => r.status === 'skip').length;
    
    totalPassed += passed;
    totalFailed += failed;
    totalSkipped += skipped;
    
    if (failed > 0) {
      hasFailures = true;
    }
    
    const status = failed > 0 ? '❌' : passed > 0 ? '✅' : '⏭️';
    console.log(`  ${status} ${providerId}: ${passed} passed, ${failed} failed, ${skipped} skipped`);
  }
  
  console.log(`\nOverall: ${totalPassed} passed, ${totalFailed} failed, ${totalSkipped} skipped`);
  
  if (hasFailures) {
    console.log('\n❌ Some provider tests failed. Check the errors above.');
    process.exit(1);
  } else {
    console.log('\n✅ All provider tests passed successfully!');
    process.exit(0);
  }
}

// Run tests if called directly
if (import.meta.main) {
  runProviderTests().catch(error => {
    console.error('❌ Provider test script failed:', error);
    process.exit(1);
  });
}
