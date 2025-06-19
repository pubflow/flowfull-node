import { PaymentProviderFactory } from '../providers/factory';
import { Product, getProductRepository } from '../repositories/product-repository';
import { Logger } from '../utils/logger';

export interface SyncResult {
  success: boolean;
  product_id: string;
  provider_id: string;
  provider_product_id?: string;
  error?: string;
  action: 'created' | 'updated' | 'skipped' | 'failed';
  details?: any;
}

export interface BulkSyncResult {
  total: number;
  successful: number;
  failed: number;
  results: SyncResult[];
  summary: {
    created: number;
    updated: number;
    skipped: number;
    failed: number;
  };
}

export interface SyncOptions {
  force?: boolean; // Force sync even if product exists
  dryRun?: boolean; // Don't actually sync, just report what would happen
  updatePrices?: boolean; // Update existing prices in provider
}

export class ProductSyncService {
  private productRepo: any;

  constructor() {
    this.initializeRepo();
  }

  private async initializeRepo() {
    this.productRepo = await getProductRepository();
  }

  /**
   * Sync a single product with a specific provider
   */
  async syncProductWithProvider(
    productId: string, 
    providerId: string, 
    options: SyncOptions = {}
  ): Promise<SyncResult> {
    try {
      Logger.debug(`🔄 Syncing product ${productId} with ${providerId}...`);

      if (!this.productRepo) {
        await this.initializeRepo();
      }

      // Get product from database
      const product = await this.productRepo.findById(productId);
      if (!product) {
        return {
          success: false,
          product_id: productId,
          provider_id: providerId,
          action: 'failed',
          error: 'Product not found in database'
        };
      }

      // Get provider adapter
      const adapter = PaymentProviderFactory.getAdapter(providerId);
      if (!adapter) {
        return {
          success: false,
          product_id: productId,
          provider_id: providerId,
          action: 'failed',
          error: `Provider ${providerId} not found`
        };
      }

      // Check if this is a dry run
      if (options.dryRun) {
        return {
          success: true,
          product_id: productId,
          provider_id: providerId,
          action: 'skipped',
          details: { dryRun: true, product: product }
        };
      }

      // For Stripe, handle product creation/update
      if (providerId === 'stripe') {
        return await this.syncWithStripe(product, adapter, options);
      }

      // For other providers, implement similar logic
      return {
        success: false,
        product_id: productId,
        provider_id: providerId,
        action: 'failed',
        error: `Sync not implemented for provider ${providerId}`
      };

    } catch (error) {
      Logger.error(`❌ Failed to sync product ${productId} with ${providerId}:`, error);
      return {
        success: false,
        product_id: productId,
        provider_id: providerId,
        action: 'failed',
        error: error instanceof Error ? error.message : 'Unknown error'
      };
    }
  }

  /**
   * Sync product with Stripe specifically
   */
  private async syncWithStripe(product: Product, adapter: any, options: SyncOptions): Promise<SyncResult> {
    try {
      const stripe = (adapter as any).stripe;
      
      // Check if product exists in Stripe
      let stripeProduct;
      let action: 'created' | 'updated' | 'skipped' = 'created';

      try {
        stripeProduct = await stripe.products.retrieve(product.id);
        action = 'updated';
        Logger.debug(`✅ Found existing Stripe product: ${product.id}`);
      } catch (retrieveError) {
        // Product doesn't exist, will create it
        Logger.debug(`🆕 Product not found in Stripe, will create: ${product.id}`);
      }

      const productData = {
        name: product.name,
        description: product.description || undefined,
        metadata: {
          bridge_product_id: product.id,
          product_type: product.product_type,
          is_recurring: product.is_recurring.toString(),
          currency: product.currency,
          ...(product.metadata ? JSON.parse(product.metadata) : {})
        },
        active: product.is_active === 1
      };

      if (stripeProduct) {
        // Update existing product
        if (!options.force && !options.updatePrices) {
          return {
            success: true,
            product_id: product.id,
            provider_id: 'stripe',
            provider_product_id: stripeProduct.id,
            action: 'skipped',
            details: { reason: 'Product exists and force=false' }
          };
        }

        stripeProduct = await stripe.products.update(product.id, productData);
        Logger.success(`✅ Updated Stripe product: ${product.id}`);
      } else {
        // Create new product
        stripeProduct = await stripe.products.create({
          id: product.id, // Use same ID as in database
          ...productData
        });
        Logger.success(`✅ Created Stripe product: ${product.id}`);
      }

      // Handle pricing for recurring products
      if (product.is_recurring && product.billing_interval) {
        await this.syncProductPricing(product, stripe, options);
      }

      return {
        success: true,
        product_id: product.id,
        provider_id: 'stripe',
        provider_product_id: stripeProduct.id,
        action: action,
        details: { stripeProduct }
      };

    } catch (error) {
      Logger.error(`❌ Failed to sync with Stripe:`, error);
      throw error;
    }
  }

  /**
   * Sync product pricing with Stripe
   */
  private async syncProductPricing(product: Product, stripe: any, options: SyncOptions) {
    try {
      if (!product.billing_interval) {
        Logger.debug('⚠️ No billing interval, skipping price sync');
        return;
      }

      const priceData = {
        product: product.id,
        unit_amount: product.price_cents,
        currency: product.currency.toLowerCase(),
        recurring: {
          interval: product.billing_interval as any,
          interval_count: 1
        },
        metadata: {
          bridge_product_id: product.id,
          sync_timestamp: new Date().toISOString()
        }
      };

      // Create new price (Stripe doesn't allow updating prices)
      const price = await stripe.prices.create(priceData);
      Logger.success(`✅ Created Stripe price: ${price.id} for product ${product.id}`);

      // Optionally, you could store the price ID in your database
      // for future reference

    } catch (error) {
      Logger.error(`❌ Failed to sync pricing:`, error);
      throw error;
    }
  }

  /**
   * Sync all products with a specific provider
   */
  async syncAllProductsWithProvider(
    providerId: string, 
    options: SyncOptions = {}
  ): Promise<BulkSyncResult> {
    try {
      Logger.debug(`🔄 Starting bulk sync with ${providerId}...`);

      if (!this.productRepo) {
        await this.initializeRepo();
      }

      // Get all active products
      const { products } = await this.productRepo.list({ 
        is_active: true, 
        limit: 1000 // Adjust as needed
      });

      const results: SyncResult[] = [];
      let successful = 0;
      let failed = 0;

      for (const product of products) {
        const result = await this.syncProductWithProvider(product.id, providerId, options);
        results.push(result);

        if (result.success) {
          successful++;
        } else {
          failed++;
        }

        // Add small delay to avoid rate limiting
        await new Promise(resolve => setTimeout(resolve, 100));
      }

      const summary = {
        created: results.filter(r => r.action === 'created').length,
        updated: results.filter(r => r.action === 'updated').length,
        skipped: results.filter(r => r.action === 'skipped').length,
        failed: results.filter(r => r.action === 'failed').length
      };

      Logger.success(`✅ Bulk sync completed: ${successful} successful, ${failed} failed`);

      return {
        total: products.length,
        successful,
        failed,
        results,
        summary
      };

    } catch (error) {
      Logger.error(`❌ Bulk sync failed:`, error);
      throw error;
    }
  }

  /**
   * Sync all products with all providers
   */
  async syncAllProducts(options: SyncOptions = {}): Promise<Record<string, BulkSyncResult>> {
    const providers = ['stripe']; // Add more providers as needed
    const results: Record<string, BulkSyncResult> = {};

    for (const providerId of providers) {
      try {
        results[providerId] = await this.syncAllProductsWithProvider(providerId, options);
      } catch (error) {
        Logger.error(`❌ Failed to sync with ${providerId}:`, error);
        results[providerId] = {
          total: 0,
          successful: 0,
          failed: 1,
          results: [{
            success: false,
            product_id: 'bulk',
            provider_id: providerId,
            action: 'failed',
            error: error instanceof Error ? error.message : 'Unknown error'
          }],
          summary: { created: 0, updated: 0, skipped: 0, failed: 1 }
        };
      }
    }

    return results;
  }

  /**
   * Get sync status for a product across all providers
   */
  async getProductSyncStatus(productId: string): Promise<Record<string, any>> {
    const providers = ['stripe'];
    const status: Record<string, any> = {};

    for (const providerId of providers) {
      try {
        const adapter = PaymentProviderFactory.getAdapter(providerId);
        
        if (providerId === 'stripe') {
          const stripe = (adapter as any).stripe;
          try {
            const product = await stripe.products.retrieve(productId);
            status[providerId] = {
              exists: true,
              product: product,
              last_updated: product.updated || product.created
            };
          } catch (error) {
            status[providerId] = {
              exists: false,
              error: 'Product not found in Stripe'
            };
          }
        }
      } catch (error) {
        status[providerId] = {
          exists: false,
          error: error instanceof Error ? error.message : 'Unknown error'
        };
      }
    }

    return status;
  }
}

// Singleton instance
let productSyncService: ProductSyncService | null = null;

export function getProductSyncService(): ProductSyncService {
  if (!productSyncService) {
    productSyncService = new ProductSyncService();
  }
  return productSyncService;
}
