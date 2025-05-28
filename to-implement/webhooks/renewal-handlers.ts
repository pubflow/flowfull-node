import { 
  RenewalWebhookEvent, 
  SubscriptionBilling, 
  BillingStatus 
} from '../types/billing';
import { BillingCalculator } from '../services/billing-calculator';

/**
 * RenewalWebhookHandlers - Handle webhook events related to subscription renewals
 * Processes payment confirmations, failures, and updates subscription status
 */
export class RenewalWebhookHandlers {
  private billingCalculator: BillingCalculator;

  constructor() {
    this.billingCalculator = new BillingCalculator();
  }

  /**
   * Handle Stripe subscription renewal events
   */
  async handleStripeRenewalEvent(eventType: string, eventData: any): Promise<void> {
    console.log(`🔔 Processing Stripe renewal event: ${eventType}`);

    switch (eventType) {
      case 'invoice.payment_succeeded':
        await this.handleRenewalPaymentSucceeded(eventData, 'stripe');
        break;
        
      case 'invoice.payment_failed':
        await this.handleRenewalPaymentFailed(eventData, 'stripe');
        break;
        
      case 'customer.subscription.updated':
        await this.handleSubscriptionUpdated(eventData, 'stripe');
        break;
        
      case 'customer.subscription.deleted':
        await this.handleSubscriptionCancelled(eventData, 'stripe');
        break;
        
      default:
        console.log(`ℹ️ Unhandled Stripe renewal event: ${eventType}`);
    }
  }

  /**
   * Handle PayPal subscription renewal events
   */
  async handlePayPalRenewalEvent(eventType: string, eventData: any): Promise<void> {
    console.log(`🔔 Processing PayPal renewal event: ${eventType}`);

    switch (eventType) {
      case 'BILLING.SUBSCRIPTION.PAYMENT.COMPLETED':
        await this.handleRenewalPaymentSucceeded(eventData, 'paypal');
        break;
        
      case 'BILLING.SUBSCRIPTION.PAYMENT.FAILED':
        await this.handleRenewalPaymentFailed(eventData, 'paypal');
        break;
        
      case 'BILLING.SUBSCRIPTION.CANCELLED':
        await this.handleSubscriptionCancelled(eventData, 'paypal');
        break;
        
      case 'BILLING.SUBSCRIPTION.SUSPENDED':
        await this.handleSubscriptionSuspended(eventData, 'paypal');
        break;
        
      default:
        console.log(`ℹ️ Unhandled PayPal renewal event: ${eventType}`);
    }
  }

  /**
   * Handle successful renewal payment
   */
  private async handleRenewalPaymentSucceeded(
    eventData: any, 
    provider: string
  ): Promise<void> {
    try {
      const subscriptionId = this.extractSubscriptionId(eventData, provider);
      const paymentAmount = this.extractPaymentAmount(eventData, provider);
      
      if (!subscriptionId) {
        console.log('⚠️ No subscription ID found in renewal payment event');
        return;
      }

      console.log(`✅ Renewal payment succeeded for subscription ${subscriptionId}`);

      // Get subscription details
      const subscription = await this.getSubscription(subscriptionId);
      if (!subscription) {
        console.error(`❌ Subscription ${subscriptionId} not found`);
        return;
      }

      // Calculate new billing period
      const newPeriod = this.billingCalculator.calculateBillingPeriod(
        subscription.currentPeriodEnd,
        {
          interval: subscription.billingInterval,
          multiplier: subscription.intervalMultiplier
        }
      );

      // Update subscription with successful renewal
      await this.updateSubscriptionAfterSuccessfulRenewal(subscriptionId, {
        currentPeriodStart: newPeriod.start,
        currentPeriodEnd: newPeriod.end,
        nextBillingDate: newPeriod.nextBilling,
        billingRetryCount: 0,
        billingStatus: 'active',
        lastBillingAttempt: new Date()
      });

      // Create renewal event
      const renewalEvent: RenewalWebhookEvent = {
        type: 'subscription.renewal.succeeded',
        subscriptionId,
        customerId: subscription.customerId,
        paymentId: this.extractPaymentId(eventData, provider),
        amount: paymentAmount,
        currency: subscription.currency,
        attemptNumber: subscription.billingRetryCount + 1,
        timestamp: new Date(),
        data: {
          previousPeriodEnd: subscription.currentPeriodEnd,
          newPeriodStart: newPeriod.start,
          newPeriodEnd: newPeriod.end,
          nextBillingDate: newPeriod.nextBilling
        }
      };

      await this.logRenewalEvent(renewalEvent);
      await this.sendRenewalNotification(renewalEvent);

      console.log(`✅ Subscription ${subscriptionId} renewal processed successfully`);

    } catch (error) {
      console.error('❌ Failed to handle renewal payment success:', error);
    }
  }

  /**
   * Handle failed renewal payment
   */
  private async handleRenewalPaymentFailed(
    eventData: any, 
    provider: string
  ): Promise<void> {
    try {
      const subscriptionId = this.extractSubscriptionId(eventData, provider);
      const errorMessage = this.extractErrorMessage(eventData, provider);
      
      if (!subscriptionId) {
        console.log('⚠️ No subscription ID found in failed payment event');
        return;
      }

      console.log(`❌ Renewal payment failed for subscription ${subscriptionId}: ${errorMessage}`);

      // Get subscription details
      const subscription = await this.getSubscription(subscriptionId);
      if (!subscription) {
        console.error(`❌ Subscription ${subscriptionId} not found`);
        return;
      }

      const newRetryCount = subscription.billingRetryCount + 1;
      const shouldRetry = newRetryCount < subscription.maxRetryAttempts;
      
      let newStatus: BillingStatus = 'past_due';
      if (!shouldRetry) {
        newStatus = 'suspended';
      }

      // Update subscription with failure info
      await this.updateSubscriptionAfterFailedRenewal(subscriptionId, {
        billingRetryCount: newRetryCount,
        billingStatus: newStatus,
        lastBillingAttempt: new Date()
      });

      // Create renewal event
      const renewalEvent: RenewalWebhookEvent = {
        type: shouldRetry ? 'subscription.renewal.retry' : 'subscription.renewal.failed',
        subscriptionId,
        customerId: subscription.customerId,
        amount: subscription.priceCents,
        currency: subscription.currency,
        attemptNumber: newRetryCount,
        timestamp: new Date(),
        data: {
          previousPeriodEnd: subscription.currentPeriodEnd,
          errorMessage
        }
      };

      await this.logRenewalEvent(renewalEvent);
      await this.sendRenewalNotification(renewalEvent);

      if (!shouldRetry) {
        console.log(`🚫 Subscription ${subscriptionId} suspended after ${newRetryCount} failed attempts`);
      } else {
        console.log(`⏰ Subscription ${subscriptionId} scheduled for retry (${newRetryCount}/${subscription.maxRetryAttempts})`);
      }

    } catch (error) {
      console.error('❌ Failed to handle renewal payment failure:', error);
    }
  }

  /**
   * Handle subscription updated event
   */
  private async handleSubscriptionUpdated(
    eventData: any, 
    provider: string
  ): Promise<void> {
    try {
      const subscriptionId = this.extractSubscriptionId(eventData, provider);
      
      if (!subscriptionId) {
        console.log('⚠️ No subscription ID found in update event');
        return;
      }

      console.log(`📝 Subscription ${subscriptionId} updated in ${provider}`);

      // TODO: Sync subscription changes from provider
      // - Price changes
      // - Billing interval changes
      // - Status changes
      // - Payment method changes

    } catch (error) {
      console.error('❌ Failed to handle subscription update:', error);
    }
  }

  /**
   * Handle subscription cancelled event
   */
  private async handleSubscriptionCancelled(
    eventData: any, 
    provider: string
  ): Promise<void> {
    try {
      const subscriptionId = this.extractSubscriptionId(eventData, provider);
      
      if (!subscriptionId) {
        console.log('⚠️ No subscription ID found in cancellation event');
        return;
      }

      console.log(`🚫 Subscription ${subscriptionId} cancelled in ${provider}`);

      // Update subscription status
      await this.updateSubscriptionAfterCancellation(subscriptionId, {
        billingStatus: 'cancelled',
        lastBillingAttempt: new Date()
      });

    } catch (error) {
      console.error('❌ Failed to handle subscription cancellation:', error);
    }
  }

  /**
   * Handle subscription suspended event
   */
  private async handleSubscriptionSuspended(
    eventData: any, 
    provider: string
  ): Promise<void> {
    try {
      const subscriptionId = this.extractSubscriptionId(eventData, provider);
      
      if (!subscriptionId) {
        console.log('⚠️ No subscription ID found in suspension event');
        return;
      }

      console.log(`⏸️ Subscription ${subscriptionId} suspended in ${provider}`);

      // Update subscription status
      await this.updateSubscriptionAfterSuspension(subscriptionId, {
        billingStatus: 'suspended',
        lastBillingAttempt: new Date()
      });

    } catch (error) {
      console.error('❌ Failed to handle subscription suspension:', error);
    }
  }

  // Helper methods for extracting data from different providers

  private extractSubscriptionId(eventData: any, provider: string): string | null {
    switch (provider) {
      case 'stripe':
        return eventData.data?.object?.subscription || 
               eventData.data?.object?.lines?.data?.[0]?.subscription ||
               null;
               
      case 'paypal':
        return eventData.resource?.billing_agreement_id || 
               eventData.resource?.id ||
               null;
               
      default:
        return null;
    }
  }

  private extractPaymentAmount(eventData: any, provider: string): number {
    switch (provider) {
      case 'stripe':
        return eventData.data?.object?.amount_paid || 0;
        
      case 'paypal':
        return Math.round((eventData.resource?.amount?.value || 0) * 100); // Convert to cents
        
      default:
        return 0;
    }
  }

  private extractPaymentId(eventData: any, provider: string): string | undefined {
    switch (provider) {
      case 'stripe':
        return eventData.data?.object?.payment_intent || eventData.data?.object?.id;
        
      case 'paypal':
        return eventData.resource?.id;
        
      default:
        return undefined;
    }
  }

  private extractErrorMessage(eventData: any, provider: string): string {
    switch (provider) {
      case 'stripe':
        return eventData.data?.object?.last_payment_error?.message || 'Payment failed';
        
      case 'paypal':
        return eventData.resource?.reason || 'Payment failed';
        
      default:
        return 'Payment failed';
    }
  }

  // Database operations (to be implemented)

  private async getSubscription(subscriptionId: string): Promise<SubscriptionBilling | null> {
    // TODO: Implement database query
    console.log(`📋 Getting subscription ${subscriptionId}`);
    return null;
  }

  private async updateSubscriptionAfterSuccessfulRenewal(
    subscriptionId: string, 
    updates: Partial<SubscriptionBilling>
  ): Promise<void> {
    // TODO: Implement database update
    console.log(`📝 Updating subscription ${subscriptionId} after successful renewal:`, updates);
  }

  private async updateSubscriptionAfterFailedRenewal(
    subscriptionId: string, 
    updates: Partial<SubscriptionBilling>
  ): Promise<void> {
    // TODO: Implement database update
    console.log(`📝 Updating subscription ${subscriptionId} after failed renewal:`, updates);
  }

  private async updateSubscriptionAfterCancellation(
    subscriptionId: string, 
    updates: Partial<SubscriptionBilling>
  ): Promise<void> {
    // TODO: Implement database update
    console.log(`📝 Updating subscription ${subscriptionId} after cancellation:`, updates);
  }

  private async updateSubscriptionAfterSuspension(
    subscriptionId: string, 
    updates: Partial<SubscriptionBilling>
  ): Promise<void> {
    // TODO: Implement database update
    console.log(`📝 Updating subscription ${subscriptionId} after suspension:`, updates);
  }

  private async logRenewalEvent(event: RenewalWebhookEvent): Promise<void> {
    // TODO: Implement event logging
    console.log(`📝 Logging renewal event:`, event);
  }

  private async sendRenewalNotification(event: RenewalWebhookEvent): Promise<void> {
    // TODO: Implement notification system
    console.log(`📧 Sending renewal notification:`, event.type);
  }
}
