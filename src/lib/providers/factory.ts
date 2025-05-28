import { PaymentAdapter, PaymentAdapterConfig } from './base/payment-adapter';
import { StripeAdapter } from './stripe/stripe-adapter';
import { config } from '@/config/environment';

// Provider registry
const providerRegistry = new Map<string, typeof PaymentAdapter>();

// Register providers
providerRegistry.set('stripe', StripeAdapter as any);

// TODO: Add other providers
// providerRegistry.set('paypal', PayPalAdapter as any);
// providerRegistry.set('authorize_net', AuthorizeNetAdapter as any);

export interface ProviderConfig {
  stripe?: {
    secret_key: string;
    publishable_key: string;
    webhook_secret?: string;
    api_version?: string;
    connect_enabled?: boolean;
    automatic_tax?: boolean;
  };
  paypal?: {
    client_id: string;
    client_secret: string;
    environment: 'sandbox' | 'live';
    webhook_id?: string;
    bn_code?: string;
  };
  authorize_net?: {
    api_login: string;
    transaction_key: string;
    environment: 'sandbox' | 'production';
    signature_key?: string;
  };
}

export class PaymentProviderFactory {
  private static adapters = new Map<string, PaymentAdapter>();
  private static configs: ProviderConfig = {};

  // Initialize provider configurations from environment
  static initialize() {
    console.log('🔧 Initializing payment providers...');
    console.log('🔑 Stripe secret key:', config.STRIPE_SECRET_KEY ? `${config.STRIPE_SECRET_KEY.substring(0, 15)}...` : 'NOT SET');

    this.configs = {
      stripe: config.STRIPE_SECRET_KEY ? {
        secret_key: config.STRIPE_SECRET_KEY,
        publishable_key: config.STRIPE_PUBLISHABLE_KEY || '',
        webhook_secret: config.STRIPE_WEBHOOK_SECRET,
        api_version: config.STRIPE_API_VERSION,
        connect_enabled: config.STRIPE_CONNECT_ENABLED,
        automatic_tax: config.STRIPE_AUTOMATIC_TAX
      } : undefined,

      paypal: config.PAYPAL_CLIENT_ID ? {
        client_id: config.PAYPAL_CLIENT_ID,
        client_secret: config.PAYPAL_CLIENT_SECRET || '',
        environment: config.PAYPAL_ENVIRONMENT,
        webhook_id: config.PAYPAL_WEBHOOK_ID,
        bn_code: config.PAYPAL_BN_CODE
      } : undefined,

      authorize_net: config.AUTHORIZE_NET_API_LOGIN ? {
        api_login: config.AUTHORIZE_NET_API_LOGIN,
        transaction_key: config.AUTHORIZE_NET_TRANSACTION_KEY || '',
        environment: config.AUTHORIZE_NET_ENVIRONMENT,
        signature_key: config.AUTHORIZE_NET_SIGNATURE_KEY
      } : undefined
    };
  }

  // Get payment adapter for a specific provider
  static getAdapter(providerId: string): PaymentAdapter {
    // Check if adapter is already cached
    if (this.adapters.has(providerId)) {
      return this.adapters.get(providerId)!;
    }

    // Check if provider is registered
    const ProviderClass = providerRegistry.get(providerId);
    if (!ProviderClass) {
      throw new Error(`Payment provider '${providerId}' is not registered`);
    }

    // Check if provider is enabled
    if (!config.ENABLED_PROVIDERS.includes(providerId)) {
      throw new Error(`Payment provider '${providerId}' is not enabled`);
    }

    // Get provider configuration
    const providerConfig = this.getProviderConfig(providerId);
    if (!providerConfig) {
      throw new Error(`Payment provider '${providerId}' is not configured`);
    }

    // Create adapter instance
    const adapter = new ProviderClass(providerConfig);

    // Cache the adapter
    this.adapters.set(providerId, adapter);

    return adapter;
  }

  // Get default payment adapter
  static getDefaultAdapter(): PaymentAdapter {
    return this.getAdapter(config.DEFAULT_PAYMENT_PROVIDER);
  }

  // Get all enabled adapters
  static getAllAdapters(): PaymentAdapter[] {
    return config.ENABLED_PROVIDERS.map(providerId => this.getAdapter(providerId));
  }

  // Get adapter with failover support
  static async getAdapterWithFailover(preferredProviderId?: string): Promise<PaymentAdapter> {
    if (!config.PROVIDER_FAILOVER_ENABLED) {
      const providerId = preferredProviderId || config.DEFAULT_PAYMENT_PROVIDER;
      return this.getAdapter(providerId);
    }

    // Try preferred provider first
    if (preferredProviderId) {
      try {
        const adapter = this.getAdapter(preferredProviderId);
        const healthCheck = await adapter.healthCheck();

        if (healthCheck.success) {
          return adapter;
        } else {
          console.warn(`Provider ${preferredProviderId} health check failed:`, healthCheck.error);
        }
      } catch (error) {
        console.warn(`Failed to get adapter for ${preferredProviderId}:`, error);
      }
    }

    // Try all enabled providers in order
    for (const providerId of config.ENABLED_PROVIDERS) {
      if (providerId === preferredProviderId) {
        continue; // Already tried
      }

      try {
        const adapter = this.getAdapter(providerId);
        const healthCheck = await adapter.healthCheck();

        if (healthCheck.success) {
          console.log(`Using failover provider: ${providerId}`);
          return adapter;
        } else {
          console.warn(`Provider ${providerId} health check failed:`, healthCheck.error);
        }
      } catch (error) {
        console.warn(`Failed to get adapter for ${providerId}:`, error);
      }
    }

    throw new Error('No healthy payment providers available');
  }

  // Get provider configuration
  private static getProviderConfig(providerId: string): PaymentAdapterConfig | null {
    const environment = config.NODE_ENV === 'production' ? 'production' : 'sandbox';

    switch (providerId) {
      case 'stripe':
        const stripeConfig = this.configs.stripe;
        if (!stripeConfig) return null;

        return {
          provider_id: 'stripe',
          api_key: stripeConfig.secret_key,
          environment: environment as 'sandbox' | 'production',
          webhook_secret: stripeConfig.webhook_secret,
          additional_config: {
            publishable_key: stripeConfig.publishable_key,
            api_version: stripeConfig.api_version,
            connect_enabled: stripeConfig.connect_enabled,
            automatic_tax: stripeConfig.automatic_tax
          }
        };

      case 'paypal':
        const paypalConfig = this.configs.paypal;
        if (!paypalConfig) return null;

        return {
          provider_id: 'paypal',
          api_key: paypalConfig.client_id,
          secret_key: paypalConfig.client_secret,
          environment: paypalConfig.environment as 'sandbox' | 'production',
          additional_config: {
            webhook_id: paypalConfig.webhook_id,
            bn_code: paypalConfig.bn_code
          }
        };

      case 'authorize_net':
        const authorizeConfig = this.configs.authorize_net;
        if (!authorizeConfig) return null;

        return {
          provider_id: 'authorize_net',
          api_key: authorizeConfig.api_login,
          secret_key: authorizeConfig.transaction_key,
          environment: authorizeConfig.environment as 'sandbox' | 'production',
          additional_config: {
            signature_key: authorizeConfig.signature_key
          }
        };

      default:
        return null;
    }
  }

  // Register a new provider
  static registerProvider(providerId: string, providerClass: typeof PaymentAdapter) {
    providerRegistry.set(providerId, providerClass);
  }

  // Check if provider is available
  static isProviderAvailable(providerId: string): boolean {
    return providerRegistry.has(providerId) &&
           config.ENABLED_PROVIDERS.includes(providerId) &&
           !!this.getProviderConfig(providerId);
  }

  // Get available providers
  static getAvailableProviders(): string[] {
    return Array.from(providerRegistry.keys()).filter(providerId =>
      this.isProviderAvailable(providerId)
    );
  }

  // Get provider capabilities
  static getProviderCapabilities(providerId: string) {
    try {
      const adapter = this.getAdapter(providerId);
      return adapter.getCapabilities();
    } catch (error) {
      return null;
    }
  }

  // Health check all providers
  static async healthCheckAll(): Promise<Record<string, { success: boolean; latency?: number; error?: string }>> {
    const results: Record<string, { success: boolean; latency?: number; error?: string }> = {};

    const availableProviders = this.getAvailableProviders();

    await Promise.all(
      availableProviders.map(async (providerId) => {
        try {
          const adapter = this.getAdapter(providerId);
          results[providerId] = await adapter.healthCheck();
        } catch (error) {
          results[providerId] = {
            success: false,
            error: error instanceof Error ? error.message : 'Unknown error'
          };
        }
      })
    );

    return results;
  }

  // Clear adapter cache
  static clearCache() {
    this.adapters.clear();
  }

  // Get adapter statistics
  static getStats() {
    return {
      registered_providers: Array.from(providerRegistry.keys()),
      enabled_providers: config.ENABLED_PROVIDERS,
      available_providers: this.getAvailableProviders(),
      default_provider: config.DEFAULT_PAYMENT_PROVIDER,
      failover_enabled: config.PROVIDER_FAILOVER_ENABLED,
      cached_adapters: Array.from(this.adapters.keys())
    };
  }
}

// Initialize factory on module load
PaymentProviderFactory.initialize();

// Export convenience functions
export function getPaymentAdapter(providerId: string): PaymentAdapter {
  return PaymentProviderFactory.getAdapter(providerId);
}

export function getDefaultPaymentAdapter(): PaymentAdapter {
  return PaymentProviderFactory.getDefaultAdapter();
}

export async function getPaymentAdapterWithFailover(preferredProviderId?: string): Promise<PaymentAdapter> {
  return PaymentProviderFactory.getAdapterWithFailover(preferredProviderId);
}

export function isProviderAvailable(providerId: string): boolean {
  return PaymentProviderFactory.isProviderAvailable(providerId);
}

export function getAvailableProviders(): string[] {
  return PaymentProviderFactory.getAvailableProviders();
}
