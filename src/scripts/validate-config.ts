#!/usr/bin/env bun

import { config, validateProviderConfig } from '@/config/environment';
import { PaymentProviderFactory } from '@/lib/providers/factory';
import { checkDatabaseHealth } from '@/lib/database/connection';
import { bridgeValidator } from '@/lib/auth/bridge-validator';

interface ValidationResult {
  category: string;
  status: 'pass' | 'fail' | 'warning';
  message: string;
  details?: any;
}

async function validateEnvironment(): Promise<ValidationResult[]> {
  const results: ValidationResult[] = [];

  // Basic environment validation
  results.push({
    category: 'Environment',
    status: 'pass',
    message: `Environment: ${config.NODE_ENV}`
  });

  // Database configuration
  try {
    const dbHealth = await checkDatabaseHealth();
    results.push({
      category: 'Database',
      status: dbHealth ? 'pass' : 'fail',
      message: dbHealth ? 'Database connection successful' : 'Database connection failed',
      details: {
        url: config.DATABASE_URL.replace(/\/\/.*@/, '//***:***@'),
        ssl: config.DATABASE_SSL,
        pool_min: config.DATABASE_POOL_MIN,
        pool_max: config.DATABASE_POOL_MAX
      }
    });
  } catch (error) {
    results.push({
      category: 'Database',
      status: 'fail',
      message: 'Database validation failed',
      details: error instanceof Error ? error.message : 'Unknown error'
    });
  }

  return results;
}

async function validatePaymentProviders(): Promise<ValidationResult[]> {
  const results: ValidationResult[] = [];

  try {
    // Validate provider configuration
    validateProviderConfig();
    
    const availableProviders = PaymentProviderFactory.getAvailableProviders();
    const enabledProviders = config.ENABLED_PROVIDERS;
    
    results.push({
      category: 'Payment Providers',
      status: availableProviders.length > 0 ? 'pass' : 'fail',
      message: `${availableProviders.length} providers available`,
      details: {
        enabled: enabledProviders,
        available: availableProviders,
        default: config.DEFAULT_PAYMENT_PROVIDER,
        failover: config.PROVIDER_FAILOVER_ENABLED
      }
    });

    // Test each provider
    const healthResults = await PaymentProviderFactory.healthCheckAll();
    
    for (const [providerId, health] of Object.entries(healthResults)) {
      results.push({
        category: `Provider: ${providerId}`,
        status: health.success ? 'pass' : 'fail',
        message: health.success ? 'Provider healthy' : `Provider unhealthy: ${health.error}`,
        details: {
          latency_ms: health.latency,
          error: health.error
        }
      });
    }

  } catch (error) {
    results.push({
      category: 'Payment Providers',
      status: 'fail',
      message: 'Provider validation failed',
      details: error instanceof Error ? error.message : 'Unknown error'
    });
  }

  return results;
}

async function validateFlowlessIntegration(): Promise<ValidationResult[]> {
  const results: ValidationResult[] = [];

  try {
    const flowlessHealth = await bridgeValidator.healthCheck();
    
    results.push({
      category: 'Flowless Integration',
      status: flowlessHealth.success ? 'pass' : 'fail',
      message: flowlessHealth.success ? 'Flowless connection successful' : `Flowless connection failed: ${flowlessHealth.error}`,
      details: {
        api_url: config.FLOWLESS_API_URL,
        latency_ms: flowlessHealth.latency,
        timeout: config.BRIDGE_VALIDATION_TIMEOUT,
        retry_attempts: config.BRIDGE_RETRY_ATTEMPTS,
        cache_ttl: config.SESSION_VALIDATION_CACHE_TTL
      }
    });

    // Validate session cache
    const cacheStats = bridgeValidator.getCacheStats();
    results.push({
      category: 'Session Cache',
      status: 'pass',
      message: 'Session cache configured',
      details: cacheStats
    });

  } catch (error) {
    results.push({
      category: 'Flowless Integration',
      status: 'fail',
      message: 'Flowless validation failed',
      details: error instanceof Error ? error.message : 'Unknown error'
    });
  }

  return results;
}

async function validateSecurity(): Promise<ValidationResult[]> {
  const results: ValidationResult[] = [];

  // CORS configuration
  results.push({
    category: 'CORS',
    status: config.CORS_ORIGINS.length > 0 ? 'pass' : 'warning',
    message: `CORS configured for ${config.CORS_ORIGINS.length} origins`,
    details: {
      origins: config.CORS_ORIGINS,
      methods: config.CORS_METHODS,
      headers: config.CORS_HEADERS,
      credentials: config.CORS_CREDENTIALS
    }
  });

  // Rate limiting
  results.push({
    category: 'Rate Limiting',
    status: config.RATE_LIMIT_ENABLED ? 'pass' : 'warning',
    message: config.RATE_LIMIT_ENABLED ? 'Rate limiting enabled' : 'Rate limiting disabled',
    details: {
      enabled: config.RATE_LIMIT_ENABLED,
      requests: config.RATE_LIMIT_REQUESTS,
      window_ms: config.RATE_LIMIT_WINDOW,
      store: config.RATE_LIMIT_STORE
    }
  });

  // Guest checkout security
  results.push({
    category: 'Guest Checkout',
    status: config.GUEST_CHECKOUT_ENABLED ? 'pass' : 'pass',
    message: config.GUEST_CHECKOUT_ENABLED ? 'Guest checkout enabled' : 'Guest checkout disabled',
    details: {
      enabled: config.GUEST_CHECKOUT_ENABLED,
      require_email: config.GUEST_REQUIRE_EMAIL,
      require_name: config.GUEST_REQUIRE_NAME,
      require_phone: config.GUEST_REQUIRE_PHONE,
      max_payments_per_email: config.GUEST_MAX_PAYMENTS_PER_EMAIL,
      session_duration: config.GUEST_SESSION_DURATION,
      auto_cleanup: config.GUEST_AUTO_CLEANUP
    }
  });

  // HTTPS requirement
  if (config.NODE_ENV === 'production' && !config.SESSION_REQUIRE_HTTPS) {
    results.push({
      category: 'HTTPS',
      status: 'warning',
      message: 'HTTPS not required for sessions in production',
      details: {
        require_https: config.SESSION_REQUIRE_HTTPS,
        environment: config.NODE_ENV
      }
    });
  } else {
    results.push({
      category: 'HTTPS',
      status: 'pass',
      message: 'HTTPS configuration appropriate for environment',
      details: {
        require_https: config.SESSION_REQUIRE_HTTPS,
        environment: config.NODE_ENV
      }
    });
  }

  return results;
}

async function validateClientSecretManagement(): Promise<ValidationResult[]> {
  const results: ValidationResult[] = [];

  results.push({
    category: 'Client Secret Management',
    status: config.CLIENT_SECRET_AUTO_CLEANUP ? 'pass' : 'warning',
    message: config.CLIENT_SECRET_AUTO_CLEANUP ? 'Auto cleanup enabled' : 'Auto cleanup disabled',
    details: {
      auto_cleanup: config.CLIENT_SECRET_AUTO_CLEANUP,
      cleanup_interval: config.CLIENT_SECRET_CLEANUP_INTERVAL,
      max_age: config.CLIENT_SECRET_MAX_AGE,
      cleanup_on_success: config.CLIENT_SECRET_CLEANUP_ON_SUCCESS,
      cleanup_on_failure: config.CLIENT_SECRET_CLEANUP_ON_FAILURE
    }
  });

  return results;
}

async function validateLogging(): Promise<ValidationResult[]> {
  const results: ValidationResult[] = [];

  results.push({
    category: 'Logging',
    status: 'pass',
    message: `Logging configured: ${config.LOG_LEVEL}`,
    details: {
      level: config.LOG_LEVEL,
      format: config.LOG_FORMAT,
      file_enabled: config.LOG_FILE_ENABLED,
      file_path: config.LOG_FILE_PATH,
      rotation_enabled: config.LOG_ROTATION_ENABLED
    }
  });

  return results;
}

async function runValidation() {
  console.log('🔍 Starting Bridge Payments configuration validation...\n');

  const validationSections = [
    { name: 'Environment', fn: validateEnvironment },
    { name: 'Payment Providers', fn: validatePaymentProviders },
    { name: 'Flowless Integration', fn: validateFlowlessIntegration },
    { name: 'Security', fn: validateSecurity },
    { name: 'Client Secret Management', fn: validateClientSecretManagement },
    { name: 'Logging', fn: validateLogging }
  ];

  let totalResults: ValidationResult[] = [];
  let hasFailures = false;
  let hasWarnings = false;

  for (const section of validationSections) {
    console.log(`📋 Validating ${section.name}...`);
    
    try {
      const results = await section.fn();
      totalResults = totalResults.concat(results);
      
      for (const result of results) {
        const icon = result.status === 'pass' ? '✅' : result.status === 'warning' ? '⚠️' : '❌';
        console.log(`  ${icon} ${result.category}: ${result.message}`);
        
        if (result.status === 'fail') {
          hasFailures = true;
          if (result.details) {
            console.log(`     Details: ${JSON.stringify(result.details, null, 2)}`);
          }
        } else if (result.status === 'warning') {
          hasWarnings = true;
        }
      }
    } catch (error) {
      console.error(`  ❌ ${section.name} validation failed:`, error);
      hasFailures = true;
    }
    
    console.log('');
  }

  // Summary
  const passCount = totalResults.filter(r => r.status === 'pass').length;
  const warningCount = totalResults.filter(r => r.status === 'warning').length;
  const failCount = totalResults.filter(r => r.status === 'fail').length;

  console.log('📊 Validation Summary:');
  console.log(`  ✅ Passed: ${passCount}`);
  console.log(`  ⚠️  Warnings: ${warningCount}`);
  console.log(`  ❌ Failed: ${failCount}`);
  console.log('');

  if (hasFailures) {
    console.log('❌ Configuration validation failed. Please fix the issues above before starting the server.');
    process.exit(1);
  } else if (hasWarnings) {
    console.log('⚠️  Configuration validation completed with warnings. Review the warnings above.');
    process.exit(0);
  } else {
    console.log('✅ Configuration validation passed successfully!');
    process.exit(0);
  }
}

// Run validation if called directly
if (import.meta.main) {
  runValidation().catch(error => {
    console.error('❌ Validation script failed:', error);
    process.exit(1);
  });
}
