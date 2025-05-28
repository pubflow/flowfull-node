import { 
  SubscriptionBilling, 
  RenewalResult, 
  RenewalAttempt,
  RenewalProcessorOptions,
  BillingError,
  PaymentError,
  RenewalJobResult
} from '../types/billing';
import { BillingCalculator } from './billing-calculator';

/**
 * SubscriptionRenewalProcessor - Handles automatic subscription renewals
 * Processes renewals in batches, handles retries, and manages billing lifecycle
 */
export class SubscriptionRenewalProcessor {
  private billingCalculator: BillingCalculator;
  private options: RenewalProcessorOptions;

  constructor(options: RenewalProcessorOptions) {
    this.options = {
      batchSize: 50,
      maxConcurrentRenewals: 10,
      retryDelayMinutes: 60,
      maxRetryAttempts: 3,
      enableNotifications: true,
      ...options
    };
    
    this.billingCalculator = new BillingCalculator();
  }

  /**
   * Main renewal processing method - called by cron job
   */
  async processRenewals(): Promise<RenewalJobResult> {
    const startTime = Date.now();
    const result: RenewalJobResult = {
      processedCount: 0,
      successCount: 0,
      failureCount: 0,
      retryCount: 0,
      errors: [],
      duration: 0,
      timestamp: new Date()
    };

    try {
      console.log('🔄 Starting subscription renewal processing...');

      // Get subscriptions due for renewal
      const dueSubscriptions = await this.getDueSubscriptions();
      console.log(`📋 Found ${dueSubscriptions.length} subscriptions due for renewal`);

      if (dueSubscriptions.length === 0) {
        console.log('✅ No subscriptions due for renewal');
        result.duration = Date.now() - startTime;
        return result;
      }

      // Process in batches
      const batches = this.createBatches(dueSubscriptions, this.options.batchSize);
      
      for (const batch of batches) {
        const batchResults = await this.processBatch(batch);
        
        result.processedCount += batchResults.length;
        result.successCount += batchResults.filter(r => r.success).length;
        result.failureCount += batchResults.filter(r => !r.success && !r.shouldRetry).length;
        result.retryCount += batchResults.filter(r => !r.success && r.shouldRetry).length;
        
        // Collect errors
        batchResults.forEach(r => {
          if (!r.success && r.errorMessage) {
            result.errors.push({
              subscriptionId: batch.find(s => s.id === r.subscriptionId)?.id || 'unknown',
              error: r.errorMessage
            });
          }
        });
      }

      // Process retry queue
      await this.processRetryQueue();

      console.log(`✅ Renewal processing completed: ${result.successCount}/${result.processedCount} successful`);

    } catch (error) {
      console.error('❌ Renewal processing failed:', error);
      result.errors.push({
        subscriptionId: 'system',
        error: error instanceof Error ? error.message : 'Unknown system error'
      });
    }

    result.duration = Date.now() - startTime;
    return result;
  }

  /**
   * Process a single subscription renewal
   */
  async processSubscriptionRenewal(subscription: SubscriptionBilling): Promise<RenewalResult> {
    try {
      console.log(`🔄 Processing renewal for subscription ${subscription.id}`);

      // Validate subscription state
      if (!this.canRenewSubscription(subscription)) {
        return {
          success: false,
          errorMessage: 'Subscription cannot be renewed in current state',
          shouldRetry: false
        };
      }

      // Create renewal payment
      const paymentResult = await this.createRenewalPayment(subscription);
      
      if (!paymentResult.success) {
        return await this.handleFailedRenewal(subscription, paymentResult.error);
      }

      // Calculate new billing period
      const newPeriod = this.billingCalculator.calculateBillingPeriod(
        subscription.currentPeriodEnd,
        {
          interval: subscription.billingInterval,
          multiplier: subscription.intervalMultiplier
        }
      );

      // Update subscription with new period
      await this.updateSubscriptionAfterRenewal(subscription.id, {
        currentPeriodStart: newPeriod.start,
        currentPeriodEnd: newPeriod.end,
        nextBillingDate: newPeriod.nextBilling,
        billingRetryCount: 0,
        billingStatus: 'active',
        lastBillingAttempt: new Date()
      });

      // Log successful renewal
      await this.logRenewalAttempt({
        subscriptionId: subscription.id,
        attemptNumber: subscription.billingRetryCount + 1,
        attemptedAt: new Date(),
        paymentId: paymentResult.paymentId,
        success: true
      });

      console.log(`✅ Subscription ${subscription.id} renewed successfully`);

      return {
        success: true,
        paymentId: paymentResult.paymentId,
        newPeriodStart: newPeriod.start,
        newPeriodEnd: newPeriod.end,
        nextBillingDate: newPeriod.nextBilling,
        shouldRetry: false
      };

    } catch (error) {
      console.error(`❌ Renewal failed for subscription ${subscription.id}:`, error);
      
      return {
        success: false,
        errorMessage: error instanceof Error ? error.message : 'Unknown error',
        shouldRetry: error instanceof PaymentError ? error.retryable : false
      };
    }
  }

  /**
   * Create a payment for subscription renewal
   */
  private async createRenewalPayment(subscription: SubscriptionBilling): Promise<{
    success: boolean;
    paymentId?: string;
    error?: Error;
  }> {
    try {
      // This would integrate with your payment system
      // For now, we'll simulate the payment creation
      
      const paymentData = {
        customerId: subscription.customerId,
        paymentMethodId: subscription.paymentMethodId,
        amount: subscription.priceCents,
        currency: subscription.currency,
        description: `Subscription renewal for ${subscription.id}`,
        metadata: {
          subscriptionId: subscription.id,
          billingPeriodStart: subscription.currentPeriodEnd.toISOString(),
          renewalAttempt: subscription.billingRetryCount + 1
        }
      };

      // TODO: Replace with actual payment adapter call
      // const payment = await paymentAdapter.createPayment(paymentData);
      
      // Simulate payment processing
      const mockPaymentId = `pay_renewal_${Date.now()}`;
      
      console.log(`💳 Created renewal payment ${mockPaymentId} for subscription ${subscription.id}`);
      
      return {
        success: true,
        paymentId: mockPaymentId
      };

    } catch (error) {
      console.error(`❌ Failed to create renewal payment for subscription ${subscription.id}:`, error);
      
      return {
        success: false,
        error: error instanceof Error ? error : new Error('Unknown payment error')
      };
    }
  }

  /**
   * Handle failed renewal attempt
   */
  private async handleFailedRenewal(
    subscription: SubscriptionBilling, 
    error?: Error
  ): Promise<RenewalResult> {
    const newRetryCount = subscription.billingRetryCount + 1;
    const shouldRetry = newRetryCount < subscription.maxRetryAttempts;
    
    let retryAt: Date | undefined;
    let billingStatus = subscription.billingStatus;

    if (shouldRetry) {
      // Calculate next retry time
      retryAt = new Date(Date.now() + this.options.retryDelayMinutes * 60 * 1000);
      billingStatus = 'past_due';
      
      console.log(`⏰ Scheduling retry ${newRetryCount}/${subscription.maxRetryAttempts} for subscription ${subscription.id} at ${retryAt}`);
    } else {
      // Max retries reached
      billingStatus = 'suspended';
      console.log(`🚫 Max retries reached for subscription ${subscription.id}, suspending`);
    }

    // Update subscription with retry info
    await this.updateSubscriptionAfterRenewal(subscription.id, {
      billingRetryCount: newRetryCount,
      billingStatus,
      lastBillingAttempt: new Date()
    });

    // Log failed attempt
    await this.logRenewalAttempt({
      subscriptionId: subscription.id,
      attemptNumber: newRetryCount,
      attemptedAt: new Date(),
      success: false,
      errorMessage: error?.message,
      nextRetryAt: retryAt
    });

    return {
      success: false,
      errorMessage: error?.message || 'Renewal failed',
      shouldRetry,
      retryAt
    };
  }

  /**
   * Get subscriptions due for renewal
   */
  private async getDueSubscriptions(): Promise<SubscriptionBilling[]> {
    // TODO: Replace with actual database query
    // This would query subscriptions where:
    // - next_billing_date <= NOW()
    // - billing_status = 'active'
    // - status IN ('active', 'trialing')
    
    console.log('📋 Querying subscriptions due for renewal...');
    
    // Mock data for now
    return [];
  }

  /**
   * Process retry queue for failed renewals
   */
  private async processRetryQueue(): Promise<void> {
    // TODO: Query subscriptions where:
    // - billing_status = 'past_due'
    // - billing_retry_count < max_retry_attempts
    // - last_billing_attempt + retry_delay <= NOW()
    
    console.log('🔄 Processing retry queue...');
  }

  /**
   * Process a batch of subscriptions concurrently
   */
  private async processBatch(subscriptions: SubscriptionBilling[]): Promise<RenewalResult[]> {
    const semaphore = new Semaphore(this.options.maxConcurrentRenewals);
    
    const promises = subscriptions.map(async (subscription) => {
      await semaphore.acquire();
      try {
        return await this.processSubscriptionRenewal(subscription);
      } finally {
        semaphore.release();
      }
    });

    return Promise.all(promises);
  }

  /**
   * Create batches from array
   */
  private createBatches<T>(array: T[], batchSize: number): T[][] {
    const batches: T[][] = [];
    for (let i = 0; i < array.length; i += batchSize) {
      batches.push(array.slice(i, i + batchSize));
    }
    return batches;
  }

  /**
   * Check if subscription can be renewed
   */
  private canRenewSubscription(subscription: SubscriptionBilling): boolean {
    // Check subscription status
    if (!['active', 'past_due'].includes(subscription.billingStatus)) {
      return false;
    }

    // Check if payment method exists
    if (!subscription.paymentMethodId) {
      return false;
    }

    // Check retry limits
    if (subscription.billingRetryCount >= subscription.maxRetryAttempts) {
      return false;
    }

    return true;
  }

  /**
   * Update subscription after renewal attempt
   */
  private async updateSubscriptionAfterRenewal(
    subscriptionId: string, 
    updates: Partial<SubscriptionBilling>
  ): Promise<void> {
    // TODO: Implement database update
    console.log(`📝 Updating subscription ${subscriptionId}:`, updates);
  }

  /**
   * Log renewal attempt for audit trail
   */
  private async logRenewalAttempt(attempt: RenewalAttempt): Promise<void> {
    // TODO: Implement audit logging
    console.log(`📝 Logging renewal attempt:`, attempt);
  }
}

/**
 * Simple semaphore for controlling concurrency
 */
class Semaphore {
  private permits: number;
  private waitQueue: Array<() => void> = [];

  constructor(permits: number) {
    this.permits = permits;
  }

  async acquire(): Promise<void> {
    if (this.permits > 0) {
      this.permits--;
      return;
    }

    return new Promise<void>((resolve) => {
      this.waitQueue.push(resolve);
    });
  }

  release(): void {
    this.permits++;
    if (this.waitQueue.length > 0) {
      const resolve = this.waitQueue.shift()!;
      this.permits--;
      resolve();
    }
  }
}
