import { RenewalScheduler } from './cron/renewal-scheduler';
import { SubscriptionRenewalProcessor } from './services/renewal-processor';
import { BillingCalculator } from './services/billing-calculator';
import { RenewalWebhookHandlers } from './webhooks/renewal-handlers';
import { RenewalJobResult } from './types/billing';

/**
 * RenewalSystem - Main entry point for the subscription renewal system
 * Provides a unified interface for managing subscription renewals
 */
export class RenewalSystem {
  private scheduler: RenewalScheduler;
  private processor: SubscriptionRenewalProcessor;
  private calculator: BillingCalculator;
  private webhookHandlers: RenewalWebhookHandlers;
  private isInitialized: boolean = false;

  constructor() {
    this.scheduler = RenewalScheduler.getInstance();
    this.processor = new SubscriptionRenewalProcessor({
      batchSize: parseInt(process.env.RENEWAL_BATCH_SIZE || '50'),
      maxConcurrentRenewals: parseInt(process.env.RENEWAL_MAX_CONCURRENT || '10'),
      retryDelayMinutes: parseInt(process.env.RENEWAL_RETRY_DELAY_MINUTES || '60'),
      maxRetryAttempts: parseInt(process.env.RENEWAL_MAX_RETRY_ATTEMPTS || '3'),
      enableNotifications: process.env.RENEWAL_NOTIFICATIONS_ENABLED === 'true'
    });
    this.calculator = new BillingCalculator();
    this.webhookHandlers = new RenewalWebhookHandlers();
  }

  /**
   * Initialize the renewal system
   */
  async initialize(): Promise<void> {
    if (this.isInitialized) {
      console.log('⚠️ Renewal system is already initialized');
      return;
    }

    try {
      console.log('🚀 Initializing subscription renewal system...');

      // Check if renewals are enabled
      const renewalsEnabled = process.env.RENEWALS_ENABLED !== 'false';
      if (!renewalsEnabled) {
        console.log('⏸️ Renewals are disabled via environment variable');
        return;
      }

      // Start the scheduler
      await this.scheduler.startAllJobs();

      this.isInitialized = true;
      console.log('✅ Subscription renewal system initialized successfully');

    } catch (error) {
      console.error('❌ Failed to initialize renewal system:', error);
      throw error;
    }
  }

  /**
   * Shutdown the renewal system
   */
  async shutdown(): Promise<void> {
    if (!this.isInitialized) {
      console.log('⚠️ Renewal system is not initialized');
      return;
    }

    try {
      console.log('🛑 Shutting down subscription renewal system...');

      // Stop the scheduler
      await this.scheduler.stopAllJobs();

      this.isInitialized = false;
      console.log('✅ Subscription renewal system shut down successfully');

    } catch (error) {
      console.error('❌ Failed to shutdown renewal system:', error);
      throw error;
    }
  }

  /**
   * Get system status
   */
  getStatus(): {
    initialized: boolean;
    scheduler: Record<string, { running: boolean; nextRun?: Date }>;
    nextRuns: Record<string, Date | null>;
  } {
    return {
      initialized: this.isInitialized,
      scheduler: this.scheduler.getJobStatus(),
      nextRuns: this.scheduler.getNextRunTimes()
    };
  }

  /**
   * Manually trigger renewal processing
   */
  async triggerRenewalProcessing(): Promise<RenewalJobResult> {
    console.log('🔄 Manually triggering renewal processing...');
    return await this.scheduler.triggerRenewalProcessing();
  }

  /**
   * Pause renewal processing
   */
  pauseRenewals(): boolean {
    console.log('⏸️ Pausing renewal processing...');
    return this.scheduler.pauseJob('daily-renewals');
  }

  /**
   * Resume renewal processing
   */
  resumeRenewals(): boolean {
    console.log('▶️ Resuming renewal processing...');
    return this.scheduler.resumeJob('daily-renewals');
  }

  /**
   * Pause retry processing
   */
  pauseRetries(): boolean {
    console.log('⏸️ Pausing retry processing...');
    return this.scheduler.pauseJob('retry-processing');
  }

  /**
   * Resume retry processing
   */
  resumeRetries(): boolean {
    console.log('▶️ Resuming retry processing...');
    return this.scheduler.resumeJob('retry-processing');
  }

  /**
   * Handle webhook events
   */
  async handleWebhookEvent(provider: string, eventType: string, eventData: any): Promise<void> {
    console.log(`🔔 Handling webhook event: ${provider}.${eventType}`);

    try {
      switch (provider.toLowerCase()) {
        case 'stripe':
          await this.webhookHandlers.handleStripeRenewalEvent(eventType, eventData);
          break;
          
        case 'paypal':
          await this.webhookHandlers.handlePayPalRenewalEvent(eventType, eventData);
          break;
          
        default:
          console.log(`⚠️ Unsupported webhook provider: ${provider}`);
      }
    } catch (error) {
      console.error(`❌ Failed to handle webhook event ${provider}.${eventType}:`, error);
      throw error;
    }
  }

  /**
   * Calculate next billing date for a subscription
   */
  calculateNextBillingDate(
    currentDate: Date,
    interval: 'daily' | 'weekly' | 'monthly' | 'yearly',
    multiplier: number = 1
  ): Date {
    return this.calculator.calculateNextBillingDate(currentDate, {
      interval,
      multiplier
    });
  }

  /**
   * Get billing description for human-readable display
   */
  getBillingDescription(
    interval: 'daily' | 'weekly' | 'monthly' | 'yearly',
    multiplier: number = 1
  ): string {
    return this.calculator.getBillingDescription({
      interval,
      multiplier
    });
  }

  /**
   * Check if a subscription is due for renewal
   */
  isDueForRenewal(nextBillingDate: Date, gracePeriodHours: number = 24): boolean {
    return this.calculator.isDueForRenewal(nextBillingDate, gracePeriodHours);
  }

  /**
   * Get days until next billing
   */
  getDaysUntilNextBilling(nextBillingDate: Date): number {
    return this.calculator.getDaysUntilNextBilling(nextBillingDate);
  }

  /**
   * Validate billing configuration
   */
  validateBillingConfig(
    interval: 'daily' | 'weekly' | 'monthly' | 'yearly',
    multiplier: number
  ): boolean {
    return this.calculator.validateBillingConfig({
      interval,
      multiplier
    });
  }

  /**
   * Get common billing configurations
   */
  getCommonBillingConfigurations(): Record<string, { interval: string; multiplier: number }> {
    return BillingCalculator.getCommonConfigurations();
  }

  /**
   * Check if the renewal system is healthy
   */
  async healthCheck(): Promise<{
    healthy: boolean;
    checks: Record<string, boolean>;
    errors: string[];
  }> {
    const checks: Record<string, boolean> = {};
    const errors: string[] = [];

    try {
      // Check if system is initialized
      checks.initialized = this.isInitialized;
      if (!this.isInitialized) {
        errors.push('Renewal system is not initialized');
      }

      // Check scheduler status
      const schedulerStatus = this.scheduler.getJobStatus();
      checks.scheduler = this.scheduler.isSchedulerRunning();
      if (!checks.scheduler) {
        errors.push('Scheduler is not running');
      }

      // Check individual jobs
      for (const [jobName, status] of Object.entries(schedulerStatus)) {
        checks[`job_${jobName}`] = status.running;
        if (!status.running) {
          errors.push(`Job ${jobName} is not running`);
        }
      }

      // TODO: Add more health checks
      // - Database connectivity
      // - Payment provider status
      // - System resources
      // - Recent error rates

      const healthy = errors.length === 0;

      return {
        healthy,
        checks,
        errors
      };

    } catch (error) {
      errors.push(`Health check failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
      
      return {
        healthy: false,
        checks,
        errors
      };
    }
  }
}

// Export singleton instance
export const renewalSystem = new RenewalSystem();

// Export individual components for advanced usage
export {
  RenewalScheduler,
  SubscriptionRenewalProcessor,
  BillingCalculator,
  RenewalWebhookHandlers
};

// Export types
export * from './types/billing';

/**
 * Initialize the renewal system (call this in your app startup)
 */
export async function initializeRenewalSystem(): Promise<void> {
  await renewalSystem.initialize();
}

/**
 * Shutdown the renewal system (call this in your app shutdown)
 */
export async function shutdownRenewalSystem(): Promise<void> {
  await renewalSystem.shutdown();
}

/**
 * Get renewal system status
 */
export function getRenewalSystemStatus() {
  return renewalSystem.getStatus();
}

/**
 * Handle webhook events (use this in your webhook endpoints)
 */
export async function handleRenewalWebhook(
  provider: string,
  eventType: string,
  eventData: any
): Promise<void> {
  await renewalSystem.handleWebhookEvent(provider, eventType, eventData);
}
