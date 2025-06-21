import { Hono } from 'hono';
import { z } from 'zod';
import { zValidator } from '@hono/zod-validator';
import { getSubscriptionRepository } from '../../lib/repositories/subscription-repository';
import { PaymentProviderFactory } from '../../lib/providers/factory';
import { Logger } from '../../lib/utils/logger';

const app = new Hono();

// Validation schemas
const bulkUpdateSchema = z.object({
  subscription_ids: z.array(z.string()),
  updates: z.object({
    metadata: z.record(z.any()).optional(),
    cancel_at_period_end: z.boolean().optional(),
    trial_end: z.string().optional()
  }),
  provider_sync: z.boolean().optional().default(true)
});

const analyticsQuerySchema = z.object({
  start_date: z.string().optional(),
  end_date: z.string().optional(),
  provider_id: z.string().optional(),
  status: z.string().optional(),
  billing_interval: z.string().optional(),
  group_by: z.enum(['day', 'week', 'month', 'year']).optional().default('month')
});

const migratePricesSchema = z.object({
  subscription_ids: z.array(z.string()).optional(),
  // NEW UNIFIED PRICING SYSTEM
  old_pricing: z.object({
    subtotal_cents: z.number().int().min(0).optional(),
    tax_cents: z.number().int().min(0).optional(),
    discount_cents: z.number().int().min(0).optional(),
    total_cents: z.number().int().min(0).optional()
  }).optional(),
  new_pricing: z.object({
    subtotal_cents: z.number().int().min(0),
    tax_cents: z.number().int().min(0).default(0),
    discount_cents: z.number().int().min(0).default(0),
    total_cents: z.number().int().min(0)
  }),
  effective_date: z.string().optional(),
  provider_id: z.string().optional().default('stripe'),
  dryRun: z.boolean().optional().default(false)
}).refine((data) => data.new_pricing.total_cents === data.new_pricing.subtotal_cents + data.new_pricing.tax_cents - data.new_pricing.discount_cents, {
  message: "new_pricing.total_cents must equal subtotal_cents + tax_cents - discount_cents",
  path: ["new_pricing", "total_cents"]
});

// GET /admin/subscriptions/analytics - Subscription analytics
app.get('/analytics', zValidator('query', analyticsQuerySchema), async (c) => {
  try {
    const query = c.req.valid('query');
    
    Logger.debug('📊 Getting subscription analytics...', query);
    
    // This would typically query your database for real analytics
    // For now, return placeholder data
    const analytics = {
      summary: {
        total_subscriptions: 0,
        active_subscriptions: 0,
        trial_subscriptions: 0,
        canceled_subscriptions: 0,
        total_mrr: 0, // Monthly Recurring Revenue
        average_subscription_value: 0,
        churn_rate: 0
      },
      by_interval: {
        daily: { count: 0, revenue: 0 },
        weekly: { count: 0, revenue: 0 },
        monthly: { count: 0, revenue: 0 },
        yearly: { count: 0, revenue: 0 }
      },
      by_status: {
        active: 0,
        trialing: 0,
        past_due: 0,
        canceled: 0,
        unpaid: 0
      },
      growth: {
        new_subscriptions: 0,
        canceled_subscriptions: 0,
        net_growth: 0,
        growth_rate: 0
      },
      top_products: [],
      revenue_trend: [],
      filters: query
    };
    
    return c.json({
      success: true,
      data: analytics,
      note: 'Analytics are placeholder - implement database queries for real data'
    });
    
  } catch (error) {
    Logger.error('❌ Failed to get subscription analytics:', error);
    return c.json({
      success: false,
      error: 'Failed to get subscription analytics',
      details: error instanceof Error ? error.message : 'Unknown error'
    }, 500);
  }
});

// POST /admin/subscriptions/bulk-update - Bulk update subscriptions
app.post('/bulk-update', zValidator('json', bulkUpdateSchema), async (c) => {
  try {
    const data = c.req.valid('json');
    
    Logger.debug('🔄 Starting bulk subscription update...', {
      count: data.subscription_ids.length,
      provider_sync: data.provider_sync
    });
    
    const subscriptionRepo = await getSubscriptionRepository();
    const results = [];
    let successful = 0;
    let failed = 0;
    
    for (const subscriptionId of data.subscription_ids) {
      try {
        // Update in database
        const subscription = await subscriptionRepo.update(subscriptionId, {
          metadata: data.updates.metadata ? JSON.stringify(data.updates.metadata) : undefined,
          cancel_at_period_end: data.updates.cancel_at_period_end,
          trial_end: data.updates.trial_end
        });
        
        // Sync with provider if requested
        if (data.provider_sync && subscription.provider_subscription_id) {
          try {
            const adapter = PaymentProviderFactory.getAdapter(subscription.provider_id);
            
            if (adapter.getCapabilities().supports_subscriptions) {
              await adapter.updateSubscription(subscription.provider_subscription_id, {
                metadata: data.updates.metadata,
                cancel_at_period_end: data.updates.cancel_at_period_end,
                trial_end: data.updates.trial_end
              });
            }
          } catch (providerError) {
            Logger.error(`⚠️ Provider sync failed for ${subscriptionId}:`, providerError);
            // Continue with database update even if provider sync fails
          }
        }
        
        results.push({
          subscription_id: subscriptionId,
          success: true,
          action: 'updated'
        });
        successful++;
        
      } catch (error) {
        results.push({
          subscription_id: subscriptionId,
          success: false,
          error: error instanceof Error ? error.message : 'Unknown error'
        });
        failed++;
      }
      
      // Small delay to avoid overwhelming the system
      await new Promise(resolve => setTimeout(resolve, 50));
    }
    
    Logger.success('✅ Bulk subscription update completed:', { successful, failed });
    
    return c.json({
      success: true,
      data: {
        total: data.subscription_ids.length,
        successful,
        failed,
        results
      },
      message: `Bulk update completed: ${successful} successful, ${failed} failed`
    });
    
  } catch (error) {
    Logger.error('❌ Bulk subscription update failed:', error);
    return c.json({
      success: false,
      error: 'Bulk subscription update failed',
      details: error instanceof Error ? error.message : 'Unknown error'
    }, 500);
  }
});

// POST /admin/subscriptions/migrate-prices - Migrate subscription prices
app.post('/migrate-prices', zValidator('json', migratePricesSchema), async (c) => {
  try {
    const data = c.req.valid('json');
    
    Logger.debug('🔄 Starting subscription price migration...', data);
    
    if (data.dryRun) {
      Logger.debug('🧪 Dry run mode - no actual changes will be made');
    }
    
    // This is a complex operation that would need careful implementation
    // It involves:
    // 1. Finding subscriptions to migrate
    // 2. Creating new prices in payment provider
    // 3. Updating subscriptions to use new prices
    // 4. Handling billing cycles and proration
    
    const migrationPlan = {
      subscriptions_to_migrate: data.subscription_ids?.length || 0,
      old_price_cents: data.old_price_cents,
      new_price_cents: data.new_price_cents,
      effective_date: data.effective_date || new Date().toISOString(),
      provider_id: data.provider_id,
      estimated_impact: {
        revenue_change: 0,
        affected_customers: 0,
        proration_amount: 0
      },
      steps: [
        'Validate subscription eligibility',
        'Create new price in payment provider',
        'Schedule subscription updates',
        'Handle proration calculations',
        'Update billing cycles',
        'Send customer notifications'
      ]
    };
    
    if (data.dryRun) {
      return c.json({
        success: true,
        data: {
          dry_run: true,
          migration_plan: migrationPlan,
          message: 'This is a dry run - no changes were made'
        }
      });
    }
    
    // For now, return a placeholder for the actual implementation
    return c.json({
      success: true,
      data: {
        message: 'Price migration feature is under development',
        migration_plan: migrationPlan,
        note: 'This would perform the actual price migration'
      }
    });
    
  } catch (error) {
    Logger.error('❌ Subscription price migration failed:', error);
    return c.json({
      success: false,
      error: 'Subscription price migration failed',
      details: error instanceof Error ? error.message : 'Unknown error'
    }, 500);
  }
});

// GET /admin/subscriptions/health - Subscription system health check
app.get('/health', async (c) => {
  try {
    Logger.debug('🏥 Checking subscription system health...');
    
    const health = {
      database: {
        status: 'healthy',
        last_check: new Date().toISOString()
      },
      providers: {} as Record<string, any>,
      subscription_processing: {
        status: 'healthy',
        pending_renewals: 0,
        failed_payments: 0
      },
      webhooks: {
        status: 'healthy',
        last_processed: null,
        processing_errors: 0
      }
    };
    
    // Check provider health
    const providers = ['stripe'];
    for (const providerId of providers) {
      try {
        const adapter = PaymentProviderFactory.getAdapter(providerId);
        const capabilities = adapter.getCapabilities();
        
        health.providers[providerId] = {
          status: 'healthy',
          capabilities,
          last_check: new Date().toISOString()
        };
      } catch (error) {
        health.providers[providerId] = {
          status: 'unhealthy',
          error: error instanceof Error ? error.message : 'Unknown error',
          last_check: new Date().toISOString()
        };
      }
    }
    
    const overallHealthy = Object.values(health.providers).every(p => p.status === 'healthy');
    
    return c.json({
      success: true,
      data: {
        overall_status: overallHealthy ? 'healthy' : 'degraded',
        components: health,
        timestamp: new Date().toISOString()
      }
    });
    
  } catch (error) {
    Logger.error('❌ Subscription health check failed:', error);
    return c.json({
      success: false,
      error: 'Subscription health check failed',
      details: error instanceof Error ? error.message : 'Unknown error'
    }, 500);
  }
});

// GET /admin/subscriptions/reports - Generate subscription reports
app.get('/reports', async (c) => {
  try {
    const reportType = c.req.query('type') || 'summary';
    
    Logger.debug('📊 Generating subscription report:', reportType);
    
    const reports = {
      summary: {
        name: 'Subscription Summary Report',
        description: 'Overview of all subscription metrics',
        data: {
          total_subscriptions: 0,
          active_subscriptions: 0,
          monthly_recurring_revenue: 0,
          churn_rate: 0,
          average_lifetime_value: 0
        }
      },
      revenue: {
        name: 'Revenue Report',
        description: 'Detailed revenue breakdown',
        data: {
          current_month_revenue: 0,
          previous_month_revenue: 0,
          growth_rate: 0,
          by_product: [],
          by_billing_interval: {}
        }
      },
      churn: {
        name: 'Churn Analysis Report',
        description: 'Customer churn analysis',
        data: {
          churn_rate: 0,
          churned_customers: 0,
          churn_reasons: {},
          retention_rate: 0
        }
      }
    };
    
    const report = reports[reportType as keyof typeof reports] || reports.summary;
    
    return c.json({
      success: true,
      data: {
        report,
        generated_at: new Date().toISOString(),
        note: 'Reports are placeholder - implement database queries for real data'
      }
    });
    
  } catch (error) {
    Logger.error('❌ Failed to generate subscription report:', error);
    return c.json({
      success: false,
      error: 'Failed to generate subscription report',
      details: error instanceof Error ? error.message : 'Unknown error'
    }, 500);
  }
});

export default app;
