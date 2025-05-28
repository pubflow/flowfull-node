import { 
  BillingInterval, 
  BillingConfiguration, 
  BillingPeriod, 
  BillingCalculatorOptions,
  CalculationError,
  BILLING_INTERVALS
} from '@/lib/types/billing';

/**
 * BillingCalculator - Handles all billing date calculations
 * Supports flexible intervals with multipliers (e.g., every 2 months, every 3 weeks)
 */
export class BillingCalculator {
  private options: BillingCalculatorOptions;

  constructor(options: BillingCalculatorOptions = {}) {
    this.options = {
      timezone: 'UTC',
      skipWeekends: false,
      skipHolidays: false,
      holidays: [],
      ...options
    };
  }

  /**
   * Calculate the next billing date based on current date and billing configuration
   */
  calculateNextBillingDate(
    currentDate: Date,
    config: BillingConfiguration
  ): Date {
    try {
      const { interval, multiplier } = config;
      
      if (multiplier <= 0) {
        throw new CalculationError(
          'Interval multiplier must be positive',
          '',
          interval,
          multiplier
        );
      }

      let nextDate: Date;

      switch (interval) {
        case 'daily':
          nextDate = this.addDays(currentDate, multiplier);
          break;
          
        case 'weekly':
          nextDate = this.addWeeks(currentDate, multiplier);
          break;
          
        case 'monthly':
          nextDate = this.addMonths(currentDate, multiplier);
          break;
          
        case 'yearly':
          nextDate = this.addYears(currentDate, multiplier);
          break;
          
        default:
          throw new CalculationError(
            `Unsupported billing interval: ${interval}`,
            '',
            interval,
            multiplier
          );
      }

      // Apply business rules (skip weekends, holidays, etc.)
      return this.applyBusinessRules(nextDate);
      
    } catch (error) {
      if (error instanceof CalculationError) {
        throw error;
      }
      throw new CalculationError(
        `Failed to calculate next billing date: ${error instanceof Error ? error.message : 'Unknown error'}`,
        '',
        config.interval,
        config.multiplier
      );
    }
  }

  /**
   * Calculate complete billing period (start, end, next billing)
   */
  calculateBillingPeriod(
    startDate: Date,
    config: BillingConfiguration
  ): BillingPeriod {
    const periodEnd = this.calculateNextBillingDate(startDate, config);
    const nextBilling = this.calculateNextBillingDate(periodEnd, config);

    return {
      start: new Date(startDate),
      end: periodEnd,
      nextBilling
    };
  }

  /**
   * Calculate multiple future billing dates
   */
  calculateFutureBillingDates(
    startDate: Date,
    config: BillingConfiguration,
    count: number
  ): Date[] {
    const dates: Date[] = [];
    let currentDate = new Date(startDate);

    for (let i = 0; i < count; i++) {
      currentDate = this.calculateNextBillingDate(currentDate, config);
      dates.push(new Date(currentDate));
    }

    return dates;
  }

  /**
   * Get human-readable description of billing frequency
   */
  getBillingDescription(config: BillingConfiguration): string {
    const { interval, multiplier } = config;
    
    if (multiplier === 1) {
      return BILLING_INTERVALS[interval].description;
    }

    const intervalName = interval.slice(0, -2); // Remove 'ly' suffix
    return `Every ${multiplier} ${intervalName}${multiplier > 1 ? 's' : ''}`;
  }

  /**
   * Check if a subscription is due for renewal
   */
  isDueForRenewal(
    nextBillingDate: Date,
    gracePeriodHours: number = 24
  ): boolean {
    const now = new Date();
    const gracePeriodMs = gracePeriodHours * 60 * 60 * 1000;
    const dueDate = new Date(nextBillingDate.getTime() + gracePeriodMs);
    
    return now >= dueDate;
  }

  /**
   * Calculate days until next billing
   */
  getDaysUntilNextBilling(nextBillingDate: Date): number {
    const now = new Date();
    const diffMs = nextBillingDate.getTime() - now.getTime();
    return Math.ceil(diffMs / (1000 * 60 * 60 * 24));
  }

  // Private helper methods

  private addDays(date: Date, days: number): Date {
    const result = new Date(date);
    result.setDate(result.getDate() + days);
    return result;
  }

  private addWeeks(date: Date, weeks: number): Date {
    return this.addDays(date, weeks * 7);
  }

  private addMonths(date: Date, months: number): Date {
    const result = new Date(date);
    const newMonth = result.getMonth() + months;
    
    // Handle year overflow
    const yearsToAdd = Math.floor(newMonth / 12);
    const finalMonth = newMonth % 12;
    
    result.setFullYear(result.getFullYear() + yearsToAdd);
    result.setMonth(finalMonth);
    
    // Handle day overflow (e.g., Jan 31 + 1 month should be Feb 28/29)
    const originalDay = date.getDate();
    const lastDayOfMonth = new Date(result.getFullYear(), result.getMonth() + 1, 0).getDate();
    
    if (originalDay > lastDayOfMonth) {
      result.setDate(lastDayOfMonth);
    } else {
      result.setDate(originalDay);
    }
    
    return result;
  }

  private addYears(date: Date, years: number): Date {
    const result = new Date(date);
    result.setFullYear(result.getFullYear() + years);
    
    // Handle leap year edge case (Feb 29 + 1 year)
    if (date.getMonth() === 1 && date.getDate() === 29) {
      const isLeapYear = this.isLeapYear(result.getFullYear());
      if (!isLeapYear) {
        result.setDate(28);
      }
    }
    
    return result;
  }

  private isLeapYear(year: number): boolean {
    return (year % 4 === 0 && year % 100 !== 0) || (year % 400 === 0);
  }

  private applyBusinessRules(date: Date): Date {
    let adjustedDate = new Date(date);

    // Skip weekends if enabled
    if (this.options.skipWeekends) {
      adjustedDate = this.skipWeekends(adjustedDate);
    }

    // Skip holidays if enabled
    if (this.options.skipHolidays && this.options.holidays) {
      adjustedDate = this.skipHolidays(adjustedDate);
    }

    return adjustedDate;
  }

  private skipWeekends(date: Date): Date {
    const dayOfWeek = date.getDay();
    
    // If Saturday (6), move to Monday
    if (dayOfWeek === 6) {
      return this.addDays(date, 2);
    }
    
    // If Sunday (0), move to Monday
    if (dayOfWeek === 0) {
      return this.addDays(date, 1);
    }
    
    return date;
  }

  private skipHolidays(date: Date): Date {
    const holidays = this.options.holidays || [];
    let adjustedDate = new Date(date);
    
    // Keep moving forward until we find a non-holiday
    while (this.isHoliday(adjustedDate, holidays)) {
      adjustedDate = this.addDays(adjustedDate, 1);
      
      // Apply weekend skipping again if needed
      if (this.options.skipWeekends) {
        adjustedDate = this.skipWeekends(adjustedDate);
      }
    }
    
    return adjustedDate;
  }

  private isHoliday(date: Date, holidays: Date[]): boolean {
    const dateString = date.toISOString().split('T')[0];
    return holidays.some(holiday => 
      holiday.toISOString().split('T')[0] === dateString
    );
  }

  /**
   * Validate billing configuration
   */
  validateBillingConfig(config: BillingConfiguration): boolean {
    const { interval, multiplier } = config;
    
    // Check if interval is supported
    if (!Object.keys(BILLING_INTERVALS).includes(interval)) {
      return false;
    }
    
    // Check multiplier bounds
    if (multiplier < 1 || multiplier > 12) {
      return false;
    }
    
    // Additional business rules
    if (interval === 'daily' && multiplier > 30) {
      return false; // Max 30 days for daily interval
    }
    
    if (interval === 'weekly' && multiplier > 52) {
      return false; // Max 52 weeks for weekly interval
    }
    
    return true;
  }

  /**
   * Get suggested billing configurations for common use cases
   */
  static getCommonConfigurations(): Record<string, BillingConfiguration> {
    return {
      // Standard
      'weekly': { interval: 'weekly', multiplier: 1 },
      'monthly': { interval: 'monthly', multiplier: 1 },
      'yearly': { interval: 'yearly', multiplier: 1 },
      
      // Popular variations
      'biweekly': { interval: 'weekly', multiplier: 2 },
      'bimonthly': { interval: 'monthly', multiplier: 2 },
      'quarterly': { interval: 'monthly', multiplier: 3 },
      'semiannually': { interval: 'monthly', multiplier: 6 },
      
      // Special cases
      'every-3-weeks': { interval: 'weekly', multiplier: 3 },
      'every-4-months': { interval: 'monthly', multiplier: 4 },
      'twice-monthly': { interval: 'weekly', multiplier: 2 }, // Approximately
    };
  }
}
