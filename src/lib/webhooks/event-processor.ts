import { getWebhookRepository } from '@/lib/database/repositories/webhooks';
import { PaymentRepository } from '@/lib/database/repositories/payments';
import { PaymentStatus } from '@/lib/database/types';
import { getDatabase } from '@/lib/database/connection';
import { nanoid } from 'nanoid';
import { receiptService } from '@/lib/email/receipt-service';
import { subscriptionEmailService } from '@/lib/email/subscription-email-service';
import { adminNotificationService } from '@/lib/email/admin-notification-service';
import { getSubscriptionRepository } from '@/lib/database/repositories/subscriptions';
import { getCustomerRepository } from '@/lib/database/repositories/customers';
import { Logger } from '@/lib/utils/logger';

export interface WebhookEventData {
  id: string;
  type: string;
  data: any;
  created: number;
}

export interface ProcessedWebhookResult {
  success: boolean;
  message: string;
  updated_entities?: string[];
}

export class WebhookEventProcessor {
  private static instance: WebhookEventProcessor;

  static getInstance(): WebhookEventProcessor {
    if (!WebhookEventProcessor.instance) {
      WebhookEventProcessor.instance = new WebhookEventProcessor();
    }
    return WebhookEventProcessor.instance;
  }

  async processEvent(webhookId: string, eventData: WebhookEventData): Promise<ProcessedWebhookResult> {
    const webhookRepo = await getWebhookRepository();

    try {
      Logger.webhook.processing.started(eventData.type, eventData.id);

      let result: ProcessedWebhookResult;

      // Route to appropriate handler based on event type
      if (eventData.type.startsWith('payment_intent.')) {
        result = await this.handlePaymentIntentEvent(eventData);
      } else if (eventData.type.startsWith('payment_method.')) {
        result = await this.handlePaymentMethodEvent(eventData);
      } else if (eventData.type.startsWith('customer.subscription.') || eventData.type.includes('subscription')) {
        // Stripe subscription events
        result = await this.handleSubscriptionEvent(eventData);
      } else if (eventData.type.startsWith('charge.refund') || eventData.type.includes('refund')) {
        // Stripe refund events
        result = await this.handleRefundEvent(eventData);
      } else if (eventData.type.startsWith('customer.')) {
        result = await this.handleCustomerEvent(eventData);
      } else if (eventData.type.startsWith('invoice.')) {
        result = await this.handleInvoiceEvent(eventData);
      } else if (eventData.type.startsWith('PAYMENT.')) {
        // PayPal events
        result = await this.handlePayPalEvent(eventData);
      } else if (eventData.type.startsWith('BILLING.')) {
        // PayPal billing events
        result = await this.handlePayPalBillingEvent(eventData);
      } else {
        result = {
          success: true,
          message: `Event type ${eventData.type} not handled (ignored)`
        };
      }

      // Mark webhook as processed
      await webhookRepo.markWebhookAsProcessed(webhookId);

      Logger.debug(`✅ Webhook processed: ${eventData.type} - ${result.message}`);
      return result;

    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      Logger.error(`❌ Webhook processing failed: ${eventData.type} - ${errorMessage}`);

      // Mark webhook as processed (even if failed)
      await webhookRepo.markWebhookAsProcessed(webhookId);

      return {
        success: false,
        message: errorMessage
      };
    }
  }

  private async handlePaymentIntentEvent(eventData: WebhookEventData): Promise<ProcessedWebhookResult> {
    const db = await getDatabase();
    const paymentRepo = new PaymentRepository(db);
    const paymentIntent = eventData.data.object;

    // Find payment by provider intent ID
    const payment = await paymentRepo.findByProviderIntentId(paymentIntent.id);
    if (!payment) {
      return {
        success: true,
        message: `Payment not found for intent ${paymentIntent.id} (external payment)`
      };
    }

    let newStatus: PaymentStatus;
    let errorMessage: string | undefined;

    switch (eventData.type) {
      case 'payment_intent.succeeded':
        newStatus = PaymentStatus.SUCCEEDED;
        break;
      case 'payment_intent.payment_failed':
        newStatus = PaymentStatus.FAILED;
        errorMessage = paymentIntent.last_payment_error?.message || 'Payment failed';
        break;
      case 'payment_intent.canceled':
        newStatus = PaymentStatus.CANCELED;
        break;
      case 'payment_intent.requires_action':
        newStatus = PaymentStatus.REQUIRES_ACTION;
        break;
      default:
        return {
          success: true,
          message: `Payment intent event ${eventData.type} not handled`
        };
    }

    // Update payment status
    await paymentRepo.updateStatus(payment.id, newStatus, errorMessage);

    // Send receipt email for successful payments
    if (newStatus === PaymentStatus.SUCCEEDED) {
      try {
        // Get updated payment data for email
        const updatedPayment = await paymentRepo.findById(payment.id);
        if (updatedPayment) {
          // Convert payment object to TransactionData format
          const transactionData = this.convertPaymentToTransactionData(updatedPayment);
          await receiptService.sendTransactionReceipt(transactionData);

          // Send admin notification for successful transaction
          try {
            await this.sendAdminNotification(updatedPayment);
          } catch (adminEmailError) {
            console.error(`[WebhookProcessor] Failed to send admin notification for payment ${payment.id}:`, adminEmailError);
            // Don't fail the webhook processing if admin email fails
          }
        }
      } catch (emailError) {
        console.error(`[WebhookProcessor] Failed to send receipt for payment ${payment.id}:`, emailError);
        // Don't fail the webhook processing if email fails
      }
    }

    return {
      success: true,
      message: `Payment ${payment.id} updated to ${newStatus}`,
      updated_entities: [`payment:${payment.id}`]
    };
  }

  private async handlePaymentMethodEvent(eventData: WebhookEventData): Promise<ProcessedWebhookResult> {
    // Handle payment method events (attach/detach)
    const paymentMethod = eventData.data.object;

    switch (eventData.type) {
      case 'payment_method.attached':
        console.log(`Payment method ${paymentMethod.id} attached to customer ${paymentMethod.customer}`);
        break;
      case 'payment_method.detached':
        console.log(`Payment method ${paymentMethod.id} detached from customer ${paymentMethod.customer}`);
        break;
    }

    return {
      success: true,
      message: `Payment method event ${eventData.type} processed`
    };
  }

  private async handleCustomerEvent(eventData: WebhookEventData): Promise<ProcessedWebhookResult> {
    // Handle customer events (created/updated/deleted)
    const customer = eventData.data.object;

    switch (eventData.type) {
      case 'customer.created':
        console.log(`Customer ${customer.id} created`);
        break;
      case 'customer.updated':
        console.log(`Customer ${customer.id} updated`);
        break;
      case 'customer.deleted':
        console.log(`Customer ${customer.id} deleted`);
        break;
    }

    return {
      success: true,
      message: `Customer event ${eventData.type} processed`
    };
  }

  private async handleSubscriptionEvent(eventData: WebhookEventData): Promise<ProcessedWebhookResult> {
    const db = await getDatabase();
    const subscriptionRepo = await getSubscriptionRepository();
    const customerRepo = await getCustomerRepository();
    const subscription = eventData.data.object;

    // Find subscription by provider subscription ID
    const localSubscription = await subscriptionRepo.findByProviderSubscriptionId(subscription.id);
    if (!localSubscription) {
      return {
        success: true,
        message: `Subscription not found for provider ID ${subscription.id} (external subscription)`
      };
    }

    // Get customer email for notifications
    let customerEmail: string | null = null;
    try {
      if (localSubscription.is_guest_subscription) {
        // For guest subscriptions, use guest_email
        customerEmail = localSubscription.guest_email;
      } else {
        // For user subscriptions, get customer email
        const customer = await customerRepo.findById(localSubscription.customer_id);
        if (customer) {
          if (customer.is_guest && customer.guest_email) {
            customerEmail = customer.guest_email;
          } else if (customer.guest_data) {
            const guestData = JSON.parse(customer.guest_data);
            customerEmail = guestData.email;
          }
          // TODO: For authenticated users, get email from users table
        }
      }
    } catch (error) {
      Logger.error(`[WebhookProcessor] Failed to get customer email for subscription ${localSubscription.id}:`, error);
    }

    let emailSent = false;
    let updateResult: any = null;

    switch (eventData.type) {
      case 'customer.subscription.created':
        Logger.info(`Subscription ${localSubscription.id} created via webhook`);
        if (customerEmail) {
          try {
            await subscriptionEmailService.sendSubscriptionSuccessEmail(localSubscription, customerEmail);
            emailSent = true;
          } catch (emailError) {
            Logger.error(`[WebhookProcessor] Failed to send subscription created email:`, emailError);
          }
        }
        break;

      case 'customer.subscription.updated':
        // Update local subscription status
        try {
          updateResult = await subscriptionRepo.updateStatus(localSubscription.id, subscription.status);
          Logger.info(`Subscription ${localSubscription.id} status updated to ${subscription.status}`);
        } catch (error) {
          Logger.error(`[WebhookProcessor] Failed to update subscription status:`, error);
        }
        break;

      case 'customer.subscription.deleted':
      case 'customer.subscription.cancelled':
        // Update local subscription as cancelled
        try {
          updateResult = await subscriptionRepo.updateStatus(localSubscription.id, 'cancelled');
          Logger.info(`Subscription ${localSubscription.id} cancelled via webhook`);

          if (customerEmail) {
            try {
              await subscriptionEmailService.sendSubscriptionCancelledEmail(
                localSubscription,
                customerEmail,
                'Subscription cancelled via payment provider'
              );
              emailSent = true;
            } catch (emailError) {
              Logger.error(`[WebhookProcessor] Failed to send subscription cancelled email:`, emailError);
            }
          }
        } catch (error) {
          Logger.error(`[WebhookProcessor] Failed to update subscription to cancelled:`, error);
        }
        break;

      case 'invoice.payment_failed':
        // Handle subscription payment failure
        if (subscription.id === localSubscription.provider_subscription_id && customerEmail) {
          try {
            await subscriptionEmailService.sendSubscriptionFailedEmail(
              localSubscription,
              customerEmail,
              eventData.data.object.last_payment_error?.message || 'Payment failed'
            );
            emailSent = true;
          } catch (emailError) {
            Logger.error(`[WebhookProcessor] Failed to send subscription failed email:`, emailError);
          }
        }
        break;

      case 'invoice.payment_succeeded':
        // Handle successful subscription renewal
        if (subscription.id === localSubscription.provider_subscription_id && customerEmail) {
          try {
            await subscriptionEmailService.sendSubscriptionSuccessEmail(localSubscription, customerEmail);
            emailSent = true;
          } catch (emailError) {
            Logger.error(`[WebhookProcessor] Failed to send subscription renewal email:`, emailError);
          }
        }
        break;

      case 'charge.dispute.created':
      case 'invoice.payment_action_required':
        // Handle subscription payment disputes or actions required
        Logger.info(`Subscription ${localSubscription.id} requires attention: ${eventData.type}`);
        break;

      case 'customer.subscription.trial_will_end':
        // Handle trial ending notification
        Logger.info(`Subscription ${localSubscription.id} trial ending soon`);
        // TODO: Implement trial ending email notification
        break;
    }

    const message = `Subscription event ${eventData.type} processed for ${localSubscription.id}${emailSent ? ' (email sent)' : ''}`;
    const updatedEntities = [`subscription:${localSubscription.id}`];

    return {
      success: true,
      message,
      updated_entities: updatedEntities
    };
  }

  private async handleRefundEvent(eventData: WebhookEventData): Promise<ProcessedWebhookResult> {
    const subscriptionRepo = await getSubscriptionRepository();
    const customerRepo = await getCustomerRepository();
    const refund = eventData.data.object;

    // Try to find related subscription by charge ID or payment intent
    let relatedSubscription = null;
    let customerEmail: string | null = null;

    try {
      // For subscription refunds, we need to find the subscription
      // This is a simplified approach - in production you might need more sophisticated matching
      if (refund.charge && refund.charge.invoice) {
        // Find subscription by invoice
        const subscriptions = await subscriptionRepo.findByProviderInvoiceId(refund.charge.invoice);
        if (subscriptions.length > 0) {
          relatedSubscription = subscriptions[0];
        }
      }

      if (relatedSubscription) {
        // Get customer email for notifications
        if (relatedSubscription.is_guest_subscription) {
          customerEmail = relatedSubscription.guest_email;
        } else {
          const customer = await customerRepo.findById(relatedSubscription.customer_id);
          if (customer) {
            if (customer.is_guest && customer.guest_email) {
              customerEmail = customer.guest_email;
            } else if (customer.guest_data) {
              const guestData = JSON.parse(customer.guest_data);
              customerEmail = guestData.email;
            }
          }
        }
      }
    } catch (error) {
      Logger.error(`[WebhookProcessor] Failed to find related subscription for refund ${refund.id}:`, error);
    }

    let emailSent = false;

    switch (eventData.type) {
      case 'charge.refund.created':
        Logger.info(`Refund ${refund.id} created for amount ${refund.amount}`);

        if (relatedSubscription && customerEmail) {
          try {
            await subscriptionEmailService.sendSubscriptionRefundedEmail(
              relatedSubscription,
              customerEmail,
              refund.amount, // Amount in cents
              refund.id,
              refund.reason || 'Refund processed'
            );
            emailSent = true;
          } catch (emailError) {
            Logger.error(`[WebhookProcessor] Failed to send refund email:`, emailError);
          }
        }
        break;

      case 'charge.refund.updated':
        Logger.info(`Refund ${refund.id} updated with status ${refund.status}`);
        break;
    }

    const message = `Refund event ${eventData.type} processed for ${refund.id}${emailSent ? ' (email sent)' : ''}`;
    const updatedEntities = relatedSubscription ? [`subscription:${relatedSubscription.id}`] : [];

    return {
      success: true,
      message,
      updated_entities: updatedEntities
    };
  }

  private async handleInvoiceEvent(eventData: WebhookEventData): Promise<ProcessedWebhookResult> {
    // Handle invoice events
    const invoice = eventData.data.object;

    switch (eventData.type) {
      case 'invoice.payment_succeeded':
        console.log(`Invoice ${invoice.id} payment succeeded`);
        break;
      case 'invoice.payment_failed':
        console.log(`Invoice ${invoice.id} payment failed`);
        break;
    }

    return {
      success: true,
      message: `Invoice event ${eventData.type} processed`
    };
  }

  private async handlePayPalEvent(eventData: WebhookEventData): Promise<ProcessedWebhookResult> {
    const db = await getDatabase();
    const paymentRepo = new PaymentRepository(db);
    const resource = eventData.data.resource;

    // PayPal events have different structure
    switch (eventData.type) {
      case 'PAYMENT.CAPTURE.COMPLETED':
        // Find payment by PayPal payment ID
        const payment = await paymentRepo.findByProviderPaymentId(resource.id);
        if (payment) {
          await paymentRepo.updateStatus(payment.id, PaymentStatus.SUCCEEDED);

          // Send receipt email for successful PayPal payment
          try {
            const updatedPayment = await paymentRepo.findById(payment.id);
            if (updatedPayment) {
              // Convert payment object to TransactionData format
              const transactionData = this.convertPaymentToTransactionData(updatedPayment);
              await receiptService.sendTransactionReceipt(transactionData);

              // Send admin notification for successful PayPal transaction
              try {
                await this.sendAdminNotification(updatedPayment);
              } catch (adminEmailError) {
                console.error(`[WebhookProcessor] Failed to send admin notification for PayPal payment ${payment.id}:`, adminEmailError);
                // Don't fail the webhook processing if admin email fails
              }
            }
          } catch (emailError) {
            console.error(`[WebhookProcessor] Failed to send PayPal receipt for payment ${payment.id}:`, emailError);
          }

          return {
            success: true,
            message: `PayPal payment ${payment.id} completed`,
            updated_entities: [`payment:${payment.id}`]
          };
        }
        break;
      case 'PAYMENT.CAPTURE.DENIED':
      case 'PAYMENT.CAPTURE.FAILED':
        const failedPayment = await paymentRepo.findByProviderPaymentId(resource.id);
        if (failedPayment) {
          await paymentRepo.updateStatus(failedPayment.id, PaymentStatus.FAILED, 'PayPal payment failed');
          return {
            success: true,
            message: `PayPal payment ${failedPayment.id} failed`,
            updated_entities: [`payment:${failedPayment.id}`]
          };
        }
        break;
    }

    return {
      success: true,
      message: `PayPal event ${eventData.type} processed`
    };
  }

  private async handlePayPalBillingEvent(eventData: WebhookEventData): Promise<ProcessedWebhookResult> {
    // Handle PayPal billing/subscription events
    const subscriptionRepo = await getSubscriptionRepository();
    const customerRepo = await getCustomerRepository();
    const resource = eventData.data.resource;

    // Find subscription by provider subscription ID
    const localSubscription = await subscriptionRepo.findByProviderSubscriptionId(resource.id);
    if (!localSubscription) {
      return {
        success: true,
        message: `PayPal subscription not found for provider ID ${resource.id} (external subscription)`
      };
    }

    // Get customer email for notifications
    let customerEmail: string | null = null;
    try {
      if (localSubscription.is_guest_subscription) {
        customerEmail = localSubscription.guest_email;
      } else {
        const customer = await customerRepo.findById(localSubscription.customer_id);
        if (customer) {
          if (customer.is_guest && customer.guest_email) {
            customerEmail = customer.guest_email;
          } else if (customer.guest_data) {
            const guestData = JSON.parse(customer.guest_data);
            customerEmail = guestData.email;
          }
        }
      }
    } catch (error) {
      Logger.error(`[WebhookProcessor] Failed to get customer email for PayPal subscription ${localSubscription.id}:`, error);
    }

    let emailSent = false;

    switch (eventData.type) {
      case 'BILLING.SUBSCRIPTION.CREATED':
        Logger.info(`PayPal subscription ${localSubscription.id} created`);
        if (customerEmail) {
          try {
            await subscriptionEmailService.sendSubscriptionSuccessEmail(localSubscription, customerEmail);
            emailSent = true;
          } catch (emailError) {
            Logger.error(`[WebhookProcessor] Failed to send PayPal subscription created email:`, emailError);
          }
        }
        break;

      case 'BILLING.SUBSCRIPTION.CANCELLED':
        try {
          await subscriptionRepo.updateStatus(localSubscription.id, 'cancelled');
          Logger.info(`PayPal subscription ${localSubscription.id} cancelled`);

          if (customerEmail) {
            try {
              await subscriptionEmailService.sendSubscriptionCancelledEmail(
                localSubscription,
                customerEmail,
                'Subscription cancelled via PayPal'
              );
              emailSent = true;
            } catch (emailError) {
              Logger.error(`[WebhookProcessor] Failed to send PayPal subscription cancelled email:`, emailError);
            }
          }
        } catch (error) {
          Logger.error(`[WebhookProcessor] Failed to update PayPal subscription to cancelled:`, error);
        }
        break;

      case 'BILLING.SUBSCRIPTION.PAYMENT.FAILED':
        Logger.info(`PayPal subscription ${localSubscription.id} payment failed`);
        if (customerEmail) {
          try {
            await subscriptionEmailService.sendSubscriptionFailedEmail(
              localSubscription,
              customerEmail,
              'PayPal subscription payment failed'
            );
            emailSent = true;
          } catch (emailError) {
            Logger.error(`[WebhookProcessor] Failed to send PayPal subscription failed email:`, emailError);
          }
        }
        break;

      case 'BILLING.SUBSCRIPTION.PAYMENT.COMPLETED':
        Logger.info(`PayPal subscription ${localSubscription.id} payment completed`);
        if (customerEmail) {
          try {
            await subscriptionEmailService.sendSubscriptionSuccessEmail(localSubscription, customerEmail);
            emailSent = true;
          } catch (emailError) {
            Logger.error(`[WebhookProcessor] Failed to send PayPal subscription success email:`, emailError);
          }
        }
        break;
    }

    const message = `PayPal billing event ${eventData.type} processed for ${localSubscription.id}${emailSent ? ' (email sent)' : ''}`;

    return {
      success: true,
      message,
      updated_entities: [`subscription:${localSubscription.id}`]
    };
  }

  /**
   * Convert payment object to TransactionData format
   */
  private convertPaymentToTransactionData(payment: any): any {
    return {
      id: payment.id,
      amount_cents: payment.amount_cents,
      currency: payment.currency,
      status: payment.status,
      description: payment.description || undefined,
      concept: payment.concept || undefined,
      reference_code: payment.reference_code || undefined,
      provider_id: payment.provider_id,
      provider_payment_id: payment.provider_payment_id || undefined,
      provider_intent_id: payment.provider_intent_id || undefined,
      customer_email: payment.customer_email || undefined,
      customer_name: payment.customer_name || undefined,
      guest_email: payment.guest_email || undefined,
      guest_name: payment.guest_name || undefined,
      created_at: payment.created_at,
      updated_at: payment.updated_at || undefined,
      metadata: payment.metadata ? JSON.parse(payment.metadata) : undefined
    };
  }

  /**
   * Send admin notification for successful transaction
   */
  private async sendAdminNotification(payment: any): Promise<void> {
    try {
      // Build admin notification data from payment
      const adminNotificationData = {
        transaction_id: payment.id,
        amount_cents: payment.amount_cents,
        currency: payment.currency,
        status: payment.status,
        provider_id: payment.provider_id,
        provider_payment_id: payment.provider_payment_id || undefined,
        reference_code: payment.reference_code || undefined,
        concept: payment.concept || payment.description || undefined,
        description: payment.description || undefined,
        customer_email: payment.customer_email || undefined,
        customer_name: payment.customer_name || undefined,
        customer_phone: payment.customer_phone || undefined,
        user_type: payment.is_guest_payment ? 'guest' as const : 'registered' as const,
        payment_method_type: payment.payment_method_type || undefined,
        payment_method_last_four: payment.payment_method_last_four || undefined,
        payment_method_brand: payment.payment_method_brand || undefined,
        metadata: payment.metadata ? JSON.parse(payment.metadata) : undefined,
        created_at: payment.created_at,
        ip_address: payment.ip_address || undefined,
        user_agent: payment.user_agent || undefined
      };

      await adminNotificationService.sendTransactionNotification(adminNotificationData);
      Logger.info(`[WebhookProcessor] Admin notification sent for transaction ${payment.id}`);
    } catch (error) {
      Logger.error(`[WebhookProcessor] Failed to send admin notification for transaction ${payment.id}:`, error);
      throw error; // Re-throw to be caught by caller
    }
  }

  async processUnprocessedEvents(): Promise<void> {
    const webhookRepo = await getWebhookRepository();
    const unprocessedEvents = await webhookRepo.findUnprocessedWebhooks(10);

    if (unprocessedEvents.length === 0) {
      return;
    }

    console.log(`🔄 Processing ${unprocessedEvents.length} unprocessed webhook events...`);

    for (const webhook of unprocessedEvents) {
      try {
        const eventData: WebhookEventData = JSON.parse(webhook.payload);
        await this.processEvent(webhook.id, eventData);
      } catch (error) {
        console.error(`❌ Failed to process webhook ${webhook.id}:`, error);
        // Mark as processed even if failed to avoid infinite retry
        await webhookRepo.markWebhookAsProcessed(webhook.id);
      }
    }
  }
}

// Export singleton instance
export const webhookProcessor = WebhookEventProcessor.getInstance();
