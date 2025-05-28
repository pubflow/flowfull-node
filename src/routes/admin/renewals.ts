import { Hono } from 'hono';
import { HTTPException } from 'hono/http-exception';
import { renewalSystem, getRenewalSystemStatus } from '@/lib/renewal-system';
import { getSubscriptionRepository } from '@/lib/database/repositories';

const adminRenewals = new Hono();

/**
 * Get renewal system status
 */
adminRenewals.get('/status', async (c) => {
  try {
    const status = getRenewalSystemStatus();
    const healthCheck = await renewalSystem.healthCheck();

    return c.json({
      ...status,
      health: healthCheck,
      environment: {
        renewals_enabled: process.env.RENEWALS_ENABLED !== 'false',
        batch_size: process.env.RENEWAL_BATCH_SIZE || '50',
        max_concurrent: process.env.RENEWAL_MAX_CONCURRENT || '10',
        retry_delay_minutes: process.env.RENEWAL_RETRY_DELAY_MINUTES || '60',
        max_retry_attempts: process.env.RENEWAL_MAX_RETRY_ATTEMPTS || '3',
        notifications_enabled: process.env.RENEWAL_NOTIFICATIONS_ENABLED === 'true',
        timezone: process.env.RENEWAL_TIMEZONE || 'UTC'
      }
    });

  } catch (error) {
    console.error('❌ Failed to get renewal system status:', error);

    throw new HTTPException(500, {
      message: 'Failed to get renewal system status',
      cause: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

/**
 * Manually trigger renewal processing
 */
adminRenewals.post('/trigger', async (c) => {
  try {
    console.log('🔄 Admin triggered renewal processing...');
    
    const result = await renewalSystem.triggerRenewalProcessing();
    
    return c.json({
      message: 'Renewal processing triggered successfully',
      result: {
        processed: result.processedCount,
        successful: result.successCount,
        failed: result.failureCount,
        retries: result.retryCount,
        duration: `${result.duration}ms`,
        timestamp: result.timestamp,
        errors: result.errors
      }
    });

  } catch (error) {
    console.error('❌ Failed to trigger renewal processing:', error);

    throw new HTTPException(500, {
      message: 'Failed to trigger renewal processing',
      cause: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

/**
 * Pause renewal processing
 */
adminRenewals.post('/pause', async (c) => {
  try {
    const success = renewalSystem.pauseRenewals();
    
    return c.json({
      message: success ? 'Renewal processing paused' : 'Failed to pause renewal processing',
      success
    });

  } catch (error) {
    console.error('❌ Failed to pause renewals:', error);

    throw new HTTPException(500, {
      message: 'Failed to pause renewals',
      cause: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

/**
 * Resume renewal processing
 */
adminRenewals.post('/resume', async (c) => {
  try {
    const success = renewalSystem.resumeRenewals();
    
    return c.json({
      message: success ? 'Renewal processing resumed' : 'Failed to resume renewal processing',
      success
    });

  } catch (error) {
    console.error('❌ Failed to resume renewals:', error);

    throw new HTTPException(500, {
      message: 'Failed to resume renewals',
      cause: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

/**
 * Pause retry processing
 */
adminRenewals.post('/pause-retries', async (c) => {
  try {
    const success = renewalSystem.pauseRetries();
    
    return c.json({
      message: success ? 'Retry processing paused' : 'Failed to pause retry processing',
      success
    });

  } catch (error) {
    console.error('❌ Failed to pause retries:', error);

    throw new HTTPException(500, {
      message: 'Failed to pause retries',
      cause: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

/**
 * Resume retry processing
 */
adminRenewals.post('/resume-retries', async (c) => {
  try {
    const success = renewalSystem.resumeRetries();
    
    return c.json({
      message: success ? 'Retry processing resumed' : 'Failed to resume retry processing',
      success
    });

  } catch (error) {
    console.error('❌ Failed to resume retries:', error);

    throw new HTTPException(500, {
      message: 'Failed to resume retries',
      cause: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

/**
 * Get subscriptions due for renewal
 */
adminRenewals.get('/due', async (c) => {
  try {
    const limit = Math.min(parseInt(c.req.query('limit') || '50'), 100);
    
    const subscriptionRepo = await getSubscriptionRepository();
    const dueSubscriptions = await subscriptionRepo.findDueForRenewal(limit);
    
    const subscriptionsWithDetails = dueSubscriptions.map(sub => ({
      id: sub.id,
      customer_id: sub.customer_id,
      product_id: sub.product_id,
      status: sub.status,
      billing_status: sub.billing_status,
      price_cents: sub.price_cents,
      currency: sub.currency,
      billing_interval: sub.billing_interval,
      interval_multiplier: sub.interval_multiplier,
      next_billing_date: sub.next_billing_date,
      last_billing_attempt: sub.last_billing_attempt,
      billing_retry_count: sub.billing_retry_count,
      max_retry_attempts: sub.max_retry_attempts,
      current_period_end: sub.current_period_end,
      days_overdue: renewalSystem.getDaysUntilNextBilling(new Date(sub.next_billing_date || '')) * -1
    }));

    return c.json({
      subscriptions: subscriptionsWithDetails,
      total: subscriptionsWithDetails.length,
      limit
    });

  } catch (error) {
    console.error('❌ Failed to get due subscriptions:', error);

    throw new HTTPException(500, {
      message: 'Failed to get due subscriptions',
      cause: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

/**
 * Get subscriptions in retry queue
 */
adminRenewals.get('/retries', async (c) => {
  try {
    const limit = Math.min(parseInt(c.req.query('limit') || '50'), 100);
    
    const subscriptionRepo = await getSubscriptionRepository();
    const retrySubscriptions = await subscriptionRepo.findReadyForRetry(limit);
    
    const subscriptionsWithDetails = retrySubscriptions.map(sub => ({
      id: sub.id,
      customer_id: sub.customer_id,
      product_id: sub.product_id,
      status: sub.status,
      billing_status: sub.billing_status,
      price_cents: sub.price_cents,
      currency: sub.currency,
      billing_retry_count: sub.billing_retry_count,
      max_retry_attempts: sub.max_retry_attempts,
      last_billing_attempt: sub.last_billing_attempt,
      next_billing_date: sub.next_billing_date,
      hours_since_last_attempt: sub.last_billing_attempt 
        ? Math.floor((Date.now() - new Date(sub.last_billing_attempt).getTime()) / (1000 * 60 * 60))
        : null
    }));

    return c.json({
      subscriptions: subscriptionsWithDetails,
      total: subscriptionsWithDetails.length,
      limit
    });

  } catch (error) {
    console.error('❌ Failed to get retry subscriptions:', error);

    throw new HTTPException(500, {
      message: 'Failed to get retry subscriptions',
      cause: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

/**
 * Get billing configurations
 */
adminRenewals.get('/billing-configs', async (c) => {
  try {
    const commonConfigs = renewalSystem.getCommonBillingConfigurations();
    
    const configsWithDescriptions = Object.entries(commonConfigs).map(([name, config]) => ({
      name,
      interval: config.interval,
      multiplier: config.multiplier,
      description: renewalSystem.getBillingDescription(config.interval as any, config.multiplier)
    }));

    return c.json({
      configurations: configsWithDescriptions
    });

  } catch (error) {
    console.error('❌ Failed to get billing configurations:', error);

    throw new HTTPException(500, {
      message: 'Failed to get billing configurations',
      cause: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

/**
 * Health check endpoint
 */
adminRenewals.get('/health', async (c) => {
  try {
    const healthCheck = await renewalSystem.healthCheck();
    
    return c.json(healthCheck, healthCheck.healthy ? 200 : 503);

  } catch (error) {
    console.error('❌ Health check failed:', error);

    return c.json({
      healthy: false,
      checks: {},
      errors: [error instanceof Error ? error.message : 'Unknown error']
    }, 503);
  }
});

export default adminRenewals;
