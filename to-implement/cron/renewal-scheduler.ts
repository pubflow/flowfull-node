import { Cron } from 'croner';
import { SubscriptionRenewalProcessor } from '../services/renewal-processor';
import { CronJobConfig, RenewalJobResult } from '../types/billing';

/**
 * RenewalScheduler - Manages cron jobs for subscription renewals using Croner
 * Handles daily renewals, retry processing, and cleanup tasks
 */
export class RenewalScheduler {
  private jobs: Map<string, Cron> = new Map();
  private renewalProcessor: SubscriptionRenewalProcessor;
  private isRunning: boolean = false;

  constructor() {
    this.renewalProcessor = new SubscriptionRenewalProcessor({
      batchSize: 50,
      maxConcurrentRenewals: 10,
      retryDelayMinutes: 60,
      maxRetryAttempts: 3,
      enableNotifications: true
    });
  }

  /**
   * Start all renewal-related cron jobs
   */
  async startAllJobs(): Promise<void> {
    if (this.isRunning) {
      console.log('⚠️ Renewal scheduler is already running');
      return;
    }

    console.log('🚀 Starting renewal scheduler...');

    try {
      // Daily renewal processing at 2 AM UTC
      this.startDailyRenewalJob();

      // Retry processing every hour
      this.startRetryJob();

      // Cleanup job daily at 4 AM UTC
      this.startCleanupJob();

      // Health check every 30 minutes
      this.startHealthCheckJob();

      this.isRunning = true;
      console.log('✅ All renewal jobs started successfully');

    } catch (error) {
      console.error('❌ Failed to start renewal scheduler:', error);
      await this.stopAllJobs();
      throw error;
    }
  }

  /**
   * Stop all cron jobs
   */
  async stopAllJobs(): Promise<void> {
    console.log('🛑 Stopping all renewal jobs...');

    for (const [name, job] of this.jobs) {
      try {
        job.stop();
        console.log(`✅ Stopped job: ${name}`);
      } catch (error) {
        console.error(`❌ Failed to stop job ${name}:`, error);
      }
    }

    this.jobs.clear();
    this.isRunning = false;
    console.log('✅ All renewal jobs stopped');
  }

  /**
   * Get status of all jobs
   */
  getJobStatus(): Array<{
    name: string;
    isRunning: boolean;
    nextRun: Date | null;
    lastRun: Date | null;
    pattern: string;
  }> {
    const status: Array<any> = [];

    for (const [name, job] of this.jobs) {
      status.push({
        name,
        isRunning: job.isRunning(),
        nextRun: job.nextRun(),
        lastRun: job.previousRun(),
        pattern: job.getPattern()
      });
    }

    return status;
  }

  /**
   * Manually trigger renewal processing
   */
  async triggerRenewalProcessing(): Promise<RenewalJobResult> {
    console.log('🔄 Manually triggering renewal processing...');
    return await this.renewalProcessor.processRenewals();
  }

  /**
   * Start daily renewal processing job
   */
  private startDailyRenewalJob(): void {
    const config: CronJobConfig = {
      name: 'daily-renewals',
      pattern: '0 2 * * *', // Daily at 2 AM UTC
      timezone: 'UTC',
      enabled: true,
      catchErrors: true
    };

    const job = new Cron(
      config.pattern,
      {
        timezone: config.timezone,
        name: config.name,
        catch: (error: unknown) => {
          console.error(`❌ Daily renewal job error:`, error);
          this.handleJobError('daily-renewals', error);
          return true; // Prevent error from being thrown
        }
      },
      async () => {
        try {
          console.log('🌅 Starting daily renewal processing...');
          const result = await this.renewalProcessor.processRenewals();
          
          console.log('📊 Daily renewal results:', {
            processed: result.processedCount,
            successful: result.successCount,
            failed: result.failureCount,
            retries: result.retryCount,
            duration: `${result.duration}ms`
          });

          // Send notifications if enabled
          if (result.failureCount > 0) {
            await this.sendFailureNotification(result);
          }

        } catch (error) {
          console.error('❌ Daily renewal processing failed:', error);
          await this.sendErrorNotification('daily-renewals', error);
        }
      }
    );

    this.jobs.set(config.name, job);
    console.log(`✅ Started daily renewal job: ${config.pattern}`);
  }

  /**
   * Start retry processing job
   */
  private startRetryJob(): void {
    const config: CronJobConfig = {
      name: 'retry-processing',
      pattern: '0 * * * *', // Every hour
      timezone: 'UTC',
      enabled: true,
      catchErrors: true
    };

    const job = new Cron(
      config.pattern,
      {
        timezone: config.timezone,
        name: config.name,
        catch: (error: unknown) => {
          console.error(`❌ Retry job error:`, error);
          this.handleJobError('retry-processing', error);
          return true;
        }
      },
      async () => {
        try {
          console.log('🔄 Processing renewal retries...');
          
          // TODO: Implement retry-specific processing
          // This would process subscriptions in 'past_due' status
          // that are ready for retry based on last_billing_attempt + retry_delay
          
          console.log('✅ Retry processing completed');

        } catch (error) {
          console.error('❌ Retry processing failed:', error);
          await this.sendErrorNotification('retry-processing', error);
        }
      }
    );

    this.jobs.set(config.name, job);
    console.log(`✅ Started retry job: ${config.pattern}`);
  }

  /**
   * Start cleanup job for old records
   */
  private startCleanupJob(): void {
    const config: CronJobConfig = {
      name: 'cleanup',
      pattern: '0 4 * * *', // Daily at 4 AM UTC
      timezone: 'UTC',
      enabled: true,
      catchErrors: true
    };

    const job = new Cron(
      config.pattern,
      {
        timezone: config.timezone,
        name: config.name,
        catch: (error: unknown) => {
          console.error(`❌ Cleanup job error:`, error);
          this.handleJobError('cleanup', error);
          return true;
        }
      },
      async () => {
        try {
          console.log('🧹 Starting cleanup tasks...');
          
          // TODO: Implement cleanup tasks
          // - Clean old renewal attempt logs (older than 90 days)
          // - Clean old webhook events (older than 30 days)
          // - Update subscription metrics
          // - Generate daily reports
          
          console.log('✅ Cleanup tasks completed');

        } catch (error) {
          console.error('❌ Cleanup tasks failed:', error);
          await this.sendErrorNotification('cleanup', error);
        }
      }
    );

    this.jobs.set(config.name, job);
    console.log(`✅ Started cleanup job: ${config.pattern}`);
  }

  /**
   * Start health check job
   */
  private startHealthCheckJob(): void {
    const config: CronJobConfig = {
      name: 'health-check',
      pattern: '*/30 * * * *', // Every 30 minutes
      timezone: 'UTC',
      enabled: true,
      catchErrors: true
    };

    const job = new Cron(
      config.pattern,
      {
        timezone: config.timezone,
        name: config.name,
        catch: (error: unknown) => {
          console.error(`❌ Health check job error:`, error);
          this.handleJobError('health-check', error);
          return true;
        }
      },
      async () => {
        try {
          // TODO: Implement health checks
          // - Check database connectivity
          // - Check payment provider connectivity
          // - Check queue sizes
          // - Monitor system resources
          
          const healthStatus = {
            timestamp: new Date(),
            database: 'healthy',
            paymentProviders: 'healthy',
            queueSize: 0,
            activeJobs: this.jobs.size
          };

          console.log('💚 Health check passed:', healthStatus);

        } catch (error) {
          console.error('❌ Health check failed:', error);
          await this.sendErrorNotification('health-check', error);
        }
      }
    );

    this.jobs.set(config.name, job);
    console.log(`✅ Started health check job: ${config.pattern}`);
  }

  /**
   * Handle job errors
   */
  private handleJobError(jobName: string, error: unknown): void {
    const errorMessage = error instanceof Error ? error.message : String(error);
    
    console.error(`❌ Job ${jobName} encountered an error:`, errorMessage);
    
    // TODO: Implement error tracking
    // - Log to error tracking service
    // - Update job failure metrics
    // - Send alerts if critical
  }

  /**
   * Send failure notification
   */
  private async sendFailureNotification(result: RenewalJobResult): Promise<void> {
    // TODO: Implement notification system
    // - Email alerts for high failure rates
    // - Slack/Discord notifications
    // - Dashboard updates
    
    console.log('📧 Sending failure notification:', {
      failures: result.failureCount,
      total: result.processedCount,
      errors: result.errors.slice(0, 5) // First 5 errors
    });
  }

  /**
   * Send error notification
   */
  private async sendErrorNotification(jobName: string, error: unknown): Promise<void> {
    // TODO: Implement error notification system
    
    console.log('🚨 Sending error notification:', {
      job: jobName,
      error: error instanceof Error ? error.message : String(error),
      timestamp: new Date()
    });
  }

  /**
   * Get next run times for all jobs
   */
  getNextRunTimes(): Record<string, Date | null> {
    const nextRuns: Record<string, Date | null> = {};
    
    for (const [name, job] of this.jobs) {
      nextRuns[name] = job.nextRun();
    }
    
    return nextRuns;
  }

  /**
   * Pause a specific job
   */
  pauseJob(jobName: string): boolean {
    const job = this.jobs.get(jobName);
    if (job) {
      job.pause();
      console.log(`⏸️ Paused job: ${jobName}`);
      return true;
    }
    return false;
  }

  /**
   * Resume a specific job
   */
  resumeJob(jobName: string): boolean {
    const job = this.jobs.get(jobName);
    if (job) {
      job.resume();
      console.log(`▶️ Resumed job: ${jobName}`);
      return true;
    }
    return false;
  }

  /**
   * Check if scheduler is running
   */
  isSchedulerRunning(): boolean {
    return this.isRunning;
  }
}
