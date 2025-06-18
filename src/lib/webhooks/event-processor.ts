import { getWebhookRepository } from '@/lib/database/repositories/webhooks';
import { PaymentRepository } from '@/lib/database/repositories/payments';
import { PaymentStatus } from '@/lib/database/types';
import { getDatabase } from '@/lib/database/connection';
import { nanoid } from 'nanoid';
import { receiptService } from '@/lib/email/receipt-service';
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
          await receiptService.sendTransactionReceipt(updatedPayment);
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
              await receiptService.sendTransactionReceipt(updatedPayment);
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
    const resource = eventData.data.resource;

    switch (eventData.type) {
      case 'BILLING.SUBSCRIPTION.CREATED':
        console.log(`PayPal subscription ${resource.id} created`);
        break;
      case 'BILLING.SUBSCRIPTION.CANCELLED':
        console.log(`PayPal subscription ${resource.id} cancelled`);
        break;
      case 'BILLING.SUBSCRIPTION.PAYMENT.FAILED':
        console.log(`PayPal subscription ${resource.id} payment failed`);
        break;
    }

    return {
      success: true,
      message: `PayPal billing event ${eventData.type} processed`
    };
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
