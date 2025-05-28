// Types and Interfaces for Billing System

export type BillingInterval = 'daily' | 'weekly' | 'monthly' | 'yearly';

export type BillingStatus = 'active' | 'past_due' | 'suspended' | 'cancelled';

export interface BillingConfiguration {
  interval: BillingInterval;
  multiplier: number; // 1 = every interval, 2 = every 2 intervals, etc.
}

export interface BillingPeriod {
  start: Date;
  end: Date;
  nextBilling: Date;
}

export interface SubscriptionBilling {
  id: string;
  customerId: string;
  billingInterval: BillingInterval;
  intervalMultiplier: number;
  currentPeriodStart: Date;
  currentPeriodEnd: Date;
  nextBillingDate: Date;
  lastBillingAttempt?: Date;
  billingRetryCount: number;
  maxRetryAttempts: number;
  billingStatus: BillingStatus;
  priceCents: number;
  currency: string;
  paymentMethodId: string;
  providerId: string;
}

export interface RenewalAttempt {
  subscriptionId: string;
  attemptNumber: number;
  attemptedAt: Date;
  paymentId?: string;
  success: boolean;
  errorMessage?: string;
  nextRetryAt?: Date;
}

export interface RenewalResult {
  success: boolean;
  paymentId?: string;
  newPeriodStart?: Date;
  newPeriodEnd?: Date;
  nextBillingDate?: Date;
  errorMessage?: string;
  shouldRetry: boolean;
  retryAt?: Date;
}

export interface BillingCalculatorOptions {
  timezone?: string;
  skipWeekends?: boolean;
  skipHolidays?: boolean;
  holidays?: Date[];
}

export interface RenewalProcessorOptions {
  batchSize: number;
  maxConcurrentRenewals: number;
  retryDelayMinutes: number;
  maxRetryAttempts: number;
  enableNotifications: boolean;
}

export interface CronJobConfig {
  name: string;
  pattern: string;
  timezone?: string;
  enabled: boolean;
  maxRuns?: number;
  catchErrors: boolean;
}

export interface RenewalJobResult {
  processedCount: number;
  successCount: number;
  failureCount: number;
  retryCount: number;
  errors: Array<{
    subscriptionId: string;
    error: string;
  }>;
  duration: number;
  timestamp: Date;
}

// Webhook event types for renewals
export interface RenewalWebhookEvent {
  type: 'subscription.renewal.succeeded' | 'subscription.renewal.failed' | 'subscription.renewal.retry';
  subscriptionId: string;
  customerId: string;
  paymentId?: string;
  amount: number;
  currency: string;
  attemptNumber: number;
  timestamp: Date;
  data: {
    previousPeriodEnd: Date;
    newPeriodStart?: Date;
    newPeriodEnd?: Date;
    nextBillingDate?: Date;
    errorMessage?: string;
  };
}

// Database update interfaces
export interface SubscriptionBillingUpdate {
  billingInterval?: BillingInterval;
  intervalMultiplier?: number;
  nextBillingDate?: Date;
  lastBillingAttempt?: Date;
  billingRetryCount?: number;
  billingStatus?: BillingStatus;
  currentPeriodStart?: Date;
  currentPeriodEnd?: Date;
}

export interface BillingMetrics {
  totalSubscriptions: number;
  activeSubscriptions: number;
  pastDueSubscriptions: number;
  upcomingRenewals: number; // Next 7 days
  failedRenewalsToday: number;
  retryQueueSize: number;
  averageRenewalSuccessRate: number;
  totalRevenueToday: number;
  currency: string;
}

// Interval calculation helpers
export interface IntervalCalculation {
  days: number;
  description: string;
  cronPattern?: string; // For scheduling
}

export const BILLING_INTERVALS: Record<BillingInterval, IntervalCalculation> = {
  daily: {
    days: 1,
    description: 'Every day',
    cronPattern: '0 0 * * *' // Daily at midnight
  },
  weekly: {
    days: 7,
    description: 'Every week',
    cronPattern: '0 0 * * 0' // Weekly on Sunday
  },
  monthly: {
    days: 30, // Approximate, actual calculation uses Date methods
    description: 'Every month',
    cronPattern: '0 0 1 * *' // Monthly on 1st
  },
  yearly: {
    days: 365, // Approximate, actual calculation uses Date methods
    description: 'Every year',
    cronPattern: '0 0 1 1 *' // Yearly on Jan 1st
  }
};

// Common billing configurations
export const COMMON_BILLING_CONFIGS: Record<string, BillingConfiguration> = {
  // Standard intervals
  daily: { interval: 'daily', multiplier: 1 },
  weekly: { interval: 'weekly', multiplier: 1 },
  monthly: { interval: 'monthly', multiplier: 1 },
  yearly: { interval: 'yearly', multiplier: 1 },
  
  // Common variations
  biweekly: { interval: 'weekly', multiplier: 2 },
  bimonthly: { interval: 'monthly', multiplier: 2 },
  quarterly: { interval: 'monthly', multiplier: 3 },
  semiannually: { interval: 'monthly', multiplier: 6 },
  
  // Special cases
  every3weeks: { interval: 'weekly', multiplier: 3 },
  every4months: { interval: 'monthly', multiplier: 4 },
  every6months: { interval: 'monthly', multiplier: 6 }
};

// Error types
export class BillingError extends Error {
  constructor(
    message: string,
    public subscriptionId: string,
    public errorCode: string,
    public retryable: boolean = true
  ) {
    super(message);
    this.name = 'BillingError';
  }
}

export class PaymentError extends BillingError {
  constructor(
    message: string,
    subscriptionId: string,
    public paymentMethodId: string,
    retryable: boolean = true
  ) {
    super(message, subscriptionId, 'PAYMENT_FAILED', retryable);
    this.name = 'PaymentError';
  }
}

export class CalculationError extends BillingError {
  constructor(
    message: string,
    subscriptionId: string,
    public interval: BillingInterval,
    public multiplier: number
  ) {
    super(message, subscriptionId, 'CALCULATION_ERROR', false);
    this.name = 'CalculationError';
  }
}
