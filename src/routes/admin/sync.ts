import { Hono } from 'hono';
import { z } from 'zod';
import { zValidator } from '@hono/zod-validator';
import { getProductSyncService } from '../../lib/services/product-sync-service';
import { PaymentProviderFactory } from '../../lib/providers/factory';
import { Logger } from '../../lib/utils/logger';

const app = new Hono();

// Validation schemas
const bulkSyncSchema = z.object({
  provider_id: z.string().optional().default('stripe'),
  force: z.boolean().optional().default(false),
  dryRun: z.boolean().optional().default(false),
  updatePrices: z.boolean().optional().default(false),
  product_ids: z.array(z.string()).optional() // Specific products to sync
});

const migratePricesSchema = z.object({
  provider_id: z.string().optional().default('stripe'),
  product_ids: z.array(z.string()).optional(),
  old_price_cents: z.number().int().min(0).optional(),
  new_price_cents: z.number().int().min(0),
  effective_date: z.string().optional(), // ISO date string
  dryRun: z.boolean().optional().default(false)
});

// POST /admin/sync/all - Sync all products with all providers
app.post('/all', zValidator('json', bulkSyncSchema), async (c) => {
  try {
    const options = c.req.valid('json');
    const syncService = getProductSyncService();
    
    Logger.debug('🔄 Starting bulk sync of all products...', options);
    
    const results = await syncService.syncAllProducts(options);
    
    // Calculate totals across all providers
    const totals = Object.values(results).reduce((acc, result) => ({
      total: acc.total + result.total,
      successful: acc.successful + result.successful,
      failed: acc.failed + result.failed,
      created: acc.created + result.summary.created,
      updated: acc.updated + result.summary.updated,
      skipped: acc.skipped + result.summary.skipped
    }), { total: 0, successful: 0, failed: 0, created: 0, updated: 0, skipped: 0 });
    
    Logger.success('✅ Bulk sync completed:', totals);
    
    return c.json({
      success: true,
      data: {
        results,
        summary: totals
      },
      message: `Bulk sync completed: ${totals.successful} successful, ${totals.failed} failed`
    });
    
  } catch (error) {
    Logger.error('❌ Bulk sync failed:', error);
    return c.json({
      success: false,
      error: 'Bulk sync failed',
      details: error instanceof Error ? error.message : 'Unknown error'
    }, 500);
  }
});

// POST /admin/sync/provider/:providerId - Sync all products with specific provider
app.post('/provider/:providerId', zValidator('json', bulkSyncSchema), async (c) => {
  try {
    const providerId = c.req.param('providerId');
    const options = c.req.valid('json');
    const syncService = getProductSyncService();
    
    Logger.debug(`🔄 Starting bulk sync with ${providerId}...`, options);
    
    // Validate provider exists
    try {
      PaymentProviderFactory.getAdapter(providerId);
    } catch (error) {
      return c.json({
        success: false,
        error: `Provider ${providerId} not found or not configured`
      }, 400);
    }
    
    const result = await syncService.syncAllProductsWithProvider(providerId, options);
    
    Logger.success(`✅ Bulk sync with ${providerId} completed:`, result.summary);
    
    return c.json({
      success: true,
      data: result,
      message: `Sync with ${providerId} completed: ${result.successful} successful, ${result.failed} failed`
    });
    
  } catch (error) {
    Logger.error(`❌ Bulk sync with provider failed:`, error);
    return c.json({
      success: false,
      error: 'Provider sync failed',
      details: error instanceof Error ? error.message : 'Unknown error'
    }, 500);
  }
});

// GET /admin/sync/status - Get overall sync status
app.get('/status', async (c) => {
  try {
    const syncService = getProductSyncService();
    
    Logger.debug('📊 Getting overall sync status...');
    
    // Get list of available providers
    const providers = ['stripe']; // Add more as needed
    const providerStatus: Record<string, any> = {};
    
    for (const providerId of providers) {
      try {
        const adapter = PaymentProviderFactory.getAdapter(providerId);
        const capabilities = adapter.getCapabilities();
        
        providerStatus[providerId] = {
          available: true,
          capabilities,
          last_sync: null // You could store this in database
        };
      } catch (error) {
        providerStatus[providerId] = {
          available: false,
          error: error instanceof Error ? error.message : 'Unknown error'
        };
      }
    }
    
    return c.json({
      success: true,
      data: {
        providers: providerStatus,
        timestamp: new Date().toISOString()
      }
    });
    
  } catch (error) {
    Logger.error('❌ Failed to get sync status:', error);
    return c.json({
      success: false,
      error: 'Failed to get sync status',
      details: error instanceof Error ? error.message : 'Unknown error'
    }, 500);
  }
});

// POST /admin/sync/migrate-prices - Migrate prices for products
app.post('/migrate-prices', zValidator('json', migratePricesSchema), async (c) => {
  try {
    const options = c.req.valid('json');
    
    Logger.debug('🔄 Starting price migration...', options);
    
    if (options.dryRun) {
      Logger.debug('🧪 Dry run mode - no actual changes will be made');
    }
    
    // This is a complex operation that would need careful implementation
    // For now, return a placeholder response
    
    return c.json({
      success: true,
      data: {
        message: 'Price migration feature is under development',
        options: options,
        note: 'This would migrate prices for existing subscriptions'
      }
    });
    
  } catch (error) {
    Logger.error('❌ Price migration failed:', error);
    return c.json({
      success: false,
      error: 'Price migration failed',
      details: error instanceof Error ? error.message : 'Unknown error'
    }, 500);
  }
});

// POST /admin/sync/products - Sync specific products
app.post('/products', zValidator('json', bulkSyncSchema), async (c) => {
  try {
    const options = c.req.valid('json');
    const syncService = getProductSyncService();
    
    if (!options.product_ids || options.product_ids.length === 0) {
      return c.json({
        success: false,
        error: 'product_ids array is required'
      }, 400);
    }
    
    Logger.debug('🔄 Syncing specific products...', { 
      count: options.product_ids.length, 
      provider: options.provider_id 
    });
    
    const results = [];
    let successful = 0;
    let failed = 0;
    
    for (const productId of options.product_ids) {
      try {
        const result = await syncService.syncProductWithProvider(
          productId, 
          options.provider_id, 
          options
        );
        
        results.push(result);
        
        if (result.success) {
          successful++;
        } else {
          failed++;
        }
        
        // Small delay to avoid rate limiting
        await new Promise(resolve => setTimeout(resolve, 100));
        
      } catch (error) {
        results.push({
          success: false,
          product_id: productId,
          provider_id: options.provider_id,
          action: 'failed' as const,
          error: error instanceof Error ? error.message : 'Unknown error'
        });
        failed++;
      }
    }
    
    const summary = {
      created: results.filter(r => r.action === 'created').length,
      updated: results.filter(r => r.action === 'updated').length,
      skipped: results.filter(r => r.action === 'skipped').length,
      failed: results.filter(r => r.action === 'failed').length
    };
    
    Logger.success('✅ Specific products sync completed:', summary);
    
    return c.json({
      success: true,
      data: {
        total: options.product_ids.length,
        successful,
        failed,
        results,
        summary
      },
      message: `Sync completed: ${successful} successful, ${failed} failed`
    });
    
  } catch (error) {
    Logger.error('❌ Specific products sync failed:', error);
    return c.json({
      success: false,
      error: 'Products sync failed',
      details: error instanceof Error ? error.message : 'Unknown error'
    }, 500);
  }
});

// GET /admin/sync/health - Health check for sync system
app.get('/health', async (c) => {
  try {
    const providers = ['stripe'];
    const health: Record<string, any> = {};
    
    for (const providerId of providers) {
      try {
        const adapter = PaymentProviderFactory.getAdapter(providerId);
        
        // Basic health check - try to get capabilities
        const capabilities = adapter.getCapabilities();
        
        health[providerId] = {
          status: 'healthy',
          capabilities,
          timestamp: new Date().toISOString()
        };
        
      } catch (error) {
        health[providerId] = {
          status: 'unhealthy',
          error: error instanceof Error ? error.message : 'Unknown error',
          timestamp: new Date().toISOString()
        };
      }
    }
    
    const overallHealthy = Object.values(health).every(h => h.status === 'healthy');
    
    return c.json({
      success: true,
      data: {
        overall_status: overallHealthy ? 'healthy' : 'degraded',
        providers: health,
        timestamp: new Date().toISOString()
      }
    });
    
  } catch (error) {
    Logger.error('❌ Health check failed:', error);
    return c.json({
      success: false,
      error: 'Health check failed',
      details: error instanceof Error ? error.message : 'Unknown error'
    }, 500);
  }
});

export default app;
