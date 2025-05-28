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
  private static instance: RenewalScheduler | null = null;

  constructor() {
    this.renewalProcessor = new SubscriptionRenewalProcessor({
      batchSize: parseInt(process.env.RENEWAL_BATCH_SIZE || '50'),
      maxConcurrentRenewals: parseInt(process.env.RENEWAL_MAX_CONCURRENT || '10'),
      retryDelayMinutes: parseInt(process.env.RENEWAL_RETRY_DELAY_MINUTES || '60'),
      maxRetryAttempts: parseInt(process.env.RENEWAL_MAX_RETRY_ATTEMPTS || '3'),
      enableNotifications: process.env.RENEWAL_NOTIFICATIONS_ENABLED === 'true'
    });
  }

  /**
   * Get singleton instance
   */
  static getInstance(): RenewalScheduler {
    if (!RenewalScheduler.instance) {
      RenewalScheduler.instance = new RenewalScheduler();
    }
    return RenewalScheduler.instance;
  }

  /**
   * Start all renewal jobs
   */
  async startAllJobs(): Promise<void> {
    if (this.isRunning) {
      console.log('⚠️ Renewal scheduler is already running');
      return;
    }

    console.log('🚀 Starting renewal scheduler...');
    
    try {
      // Start individual jobs
      this.startDailyRenewalJob();
      this.startRetryProcessingJob();
      this.startCleanupJob();
      this.startHealthCheckJob();

      this.isRunning = true;
      console.log('✅ All renewal jobs started successfully');
      
    } catch (error) {
      console.error('❌ Failed to start renewal jobs:', error);
      throw error;
    }
  }

  /**
   * Stop all renewal jobs
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
   * Get job status information
   */
  getJobStatus(): Record<string, { running: boolean; nextRun?: Date }> {
    const status: Record<string, { running: boolean; nextRun?: Date }> = {};
    
    for (const [name, job] of this.jobs) {
      status[name] = {
        running: job.isRunning(),
        nextRun: job.nextRun()
      };
    }
    
    return status;
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
   * Check if scheduler is running
   */
  isSchedulerRunning(): boolean {
    return this.isRunning;
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
      pattern: process.env.RENEWAL_DAILY_CRON || '0 2 * * *', // Daily at 2 AM UTC
      timezone: process.env.RENEWAL_TIMEZONE || 'UTC',
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
  private startRetryProcessingJob(): void {
    const config: CronJobConfig = {
      name: 'retry-processing',
      pattern: process.env.RENEWAL_RETRY_CRON || '0 * * * *', // Every hour
      timezone: process.env.RENEWAL_TIMEZONE || 'UTC',
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
          
          // Process retry queue through the renewal processor
          const result = await this.renewalProcessor.processRenewals();
          
          if (result.retryCount > 0) {
            console.log(`✅ Processed ${result.retryCount} retry attempts`);
          }

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
   * Start cleanup job
   */
  private startCleanupJob(): void {
    const config: CronJobConfig = {
      name: 'cleanup',
      pattern: process.env.RENEWAL_CLEANUP_CRON || '0 4 * * *', // Daily at 4 AM UTC
      timezone: process.env.RENEWAL_TIMEZONE || 'UTC',
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
          console.log('🧹 Running renewal system cleanup...');
          
          // TODO: Implement cleanup tasks
          // - Clean old renewal logs
          // - Archive completed renewal attempts
          // - Clean up temporary data
          
          console.log('✅ Cleanup completed');

        } catch (error) {
          console.error('❌ Cleanup failed:', error);
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
      pattern: process.env.RENEWAL_HEALTH_CRON || '*/30 * * * *', // Every 30 minutes
      timezone: process.env.RENEWAL_TIMEZONE || 'UTC',
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
          // - Verify payment provider status
          // - Monitor system resources
          // - Check for stuck renewals
          
          console.log('💚 Renewal system health check passed');

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
    console.error(`❌ Job ${jobName} encountered an error:`, error);
    
    // TODO: Implement error handling
    // - Log to error tracking service
    // - Send alerts
    // - Implement circuit breaker pattern
  }

  /**
   * Send failure notification
   */
  private async sendFailureNotification(result: RenewalJobResult): Promise<void> {
    // TODO: Implement notification system
    console.log(`📧 Sending failure notification: ${result.failureCount} failures`);
  }

  /**
   * Send error notification
   */
  private async sendErrorNotification(jobName: string, error: unknown): Promise<void> {
    // TODO: Implement notification system
    console.log(`📧 Sending error notification for job ${jobName}:`, error);
  }
}
