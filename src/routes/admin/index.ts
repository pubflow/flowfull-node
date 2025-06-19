import { Hono } from 'hono';
import productsRouter from './products';
import syncRouter from './sync';
import subscriptionsRouter from './subscriptions';
import { Logger } from '../../lib/utils/logger';

const app = new Hono();

// Mount sub-routers
app.route('/products', productsRouter);
app.route('/sync', syncRouter);
app.route('/subscriptions', subscriptionsRouter);

// GET /admin - Admin dashboard overview
app.get('/', async (c) => {
  try {
    Logger.debug('📊 Getting admin dashboard overview...');
    
    // You could add statistics here
    const overview = {
      system: {
        name: 'Bridge Payments Admin',
        version: '1.0.0',
        timestamp: new Date().toISOString()
      },
      endpoints: {
        products: {
          description: 'Product management and CRUD operations',
          endpoints: [
            'GET /admin/products - List products',
            'POST /admin/products - Create product',
            'GET /admin/products/:id - Get product',
            'PUT /admin/products/:id - Update product',
            'DELETE /admin/products/:id - Delete product',
            'POST /admin/products/:id/sync - Sync product',
            'GET /admin/products/:id/sync-status - Get sync status'
          ]
        },
        sync: {
          description: 'Bulk synchronization with payment providers',
          endpoints: [
            'POST /admin/sync/all - Sync all products',
            'POST /admin/sync/provider/:id - Sync with specific provider',
            'GET /admin/sync/status - Get sync status',
            'POST /admin/sync/migrate-prices - Migrate prices',
            'POST /admin/sync/products - Sync specific products',
            'GET /admin/sync/health - Health check'
          ]
        },
        subscriptions: {
          description: 'Advanced subscription management',
          endpoints: [
            'GET /admin/subscriptions/analytics - Subscription analytics',
            'POST /admin/subscriptions/bulk-update - Bulk update',
            'POST /admin/subscriptions/migrate-prices - Price migration'
          ]
        }
      },
      features: {
        product_management: {
          enabled: true,
          description: 'Full CRUD operations for products'
        },
        provider_sync: {
          enabled: true,
          supported_providers: ['stripe'],
          description: 'Synchronization with payment providers'
        },
        bulk_operations: {
          enabled: true,
          description: 'Bulk sync and update operations'
        },
        price_migration: {
          enabled: false,
          description: 'Price migration for existing subscriptions (coming soon)'
        },
        analytics: {
          enabled: false,
          description: 'Subscription analytics dashboard (coming soon)'
        }
      }
    };
    
    return c.json({
      success: true,
      data: overview
    });
    
  } catch (error) {
    Logger.error('❌ Failed to get admin overview:', error);
    return c.json({
      success: false,
      error: 'Failed to get admin overview',
      details: error instanceof Error ? error.message : 'Unknown error'
    }, 500);
  }
});

// GET /admin/stats - Quick statistics
app.get('/stats', async (c) => {
  try {
    Logger.debug('📊 Getting admin statistics...');
    
    // This would typically query your database for real stats
    const stats = {
      products: {
        total: 0,
        active: 0,
        recurring: 0,
        by_type: {
          physical: 0,
          digital: 0,
          service: 0,
          subscription: 0
        }
      },
      subscriptions: {
        total: 0,
        active: 0,
        trial: 0,
        canceled: 0
      },
      sync_status: {
        last_sync: null,
        products_synced: 0,
        sync_errors: 0
      },
      providers: {
        stripe: {
          connected: true,
          last_sync: null
        }
      }
    };
    
    return c.json({
      success: true,
      data: stats,
      note: 'Statistics are placeholder - implement database queries for real data'
    });
    
  } catch (error) {
    Logger.error('❌ Failed to get admin stats:', error);
    return c.json({
      success: false,
      error: 'Failed to get admin stats',
      details: error instanceof Error ? error.message : 'Unknown error'
    }, 500);
  }
});

export default app;
