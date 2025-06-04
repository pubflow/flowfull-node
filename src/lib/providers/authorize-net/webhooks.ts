import { AuthorizeNetWebhookPayload } from './types';
import { mapWebhookEventType } from './utils';

// Authorize.Net Webhook Event Types
export enum AuthorizeNetWebhookEventType {
  // Payment events
  PAYMENT_AUTHORIZATION_CREATED = 'net.authorize.payment.authorization.created',
  PAYMENT_CAPTURE_CREATED = 'net.authorize.payment.capture.created',
  PAYMENT_VOID_CREATED = 'net.authorize.payment.void.created',
  PAYMENT_REFUND_CREATED = 'net.authorize.payment.refund.created',
  PAYMENT_AUTHCAPTURE_CREATED = 'net.authorize.payment.authcapture.created',
  PAYMENT_SETTLEMENT_CREATED = 'net.authorize.payment.settlement.created',

  // Subscription events (ARB)
  SUBSCRIPTION_CREATED = 'net.authorize.subscription.created',
  SUBSCRIPTION_CANCELLED = 'net.authorize.subscription.cancelled',
  SUBSCRIPTION_SUSPENDED = 'net.authorize.subscription.suspended',
  SUBSCRIPTION_PAYMENT_SUCCESS = 'net.authorize.subscription.paymentSucceeded',
  SUBSCRIPTION_PAYMENT_FAILED = 'net.authorize.subscription.paymentFailed',
  SUBSCRIPTION_EXPIRED = 'net.authorize.subscription.expired',

  // Fraud events (AFDS)
  FRAUD_APPROVED = 'net.authorize.payment.fraud.approved',
  FRAUD_DECLINED = 'net.authorize.payment.fraud.declined',
  FRAUD_HELD = 'net.authorize.payment.fraud.held',

  // Customer events (CIM)
  CUSTOMER_CREATED = 'net.authorize.customer.created',
  CUSTOMER_UPDATED = 'net.authorize.customer.updated',
  CUSTOMER_DELETED = 'net.authorize.customer.deleted',
  PAYMENT_METHOD_CREATED = 'net.authorize.customer.paymentProfile.created',
  PAYMENT_METHOD_UPDATED = 'net.authorize.customer.paymentProfile.updated',
  PAYMENT_METHOD_DELETED = 'net.authorize.customer.paymentProfile.deleted'
}

// Webhook event processor
export class AuthorizeNetWebhookProcessor {
  
  // Process webhook payload and return standardized event
  static processWebhook(payload: AuthorizeNetWebhookPayload) {
    const eventType = mapWebhookEventType(payload.eventType);
    
    switch (payload.eventType) {
      case AuthorizeNetWebhookEventType.PAYMENT_AUTHORIZATION_CREATED:
        return this.processPaymentAuthorization(payload);
      
      case AuthorizeNetWebhookEventType.PAYMENT_CAPTURE_CREATED:
      case AuthorizeNetWebhookEventType.PAYMENT_AUTHCAPTURE_CREATED:
        return this.processPaymentCapture(payload);
      
      case AuthorizeNetWebhookEventType.PAYMENT_VOID_CREATED:
        return this.processPaymentVoid(payload);
      
      case AuthorizeNetWebhookEventType.PAYMENT_REFUND_CREATED:
        return this.processPaymentRefund(payload);
      
      case AuthorizeNetWebhookEventType.PAYMENT_SETTLEMENT_CREATED:
        return this.processPaymentSettlement(payload);
      
      case AuthorizeNetWebhookEventType.SUBSCRIPTION_PAYMENT_SUCCESS:
        return this.processSubscriptionPaymentSuccess(payload);
      
      case AuthorizeNetWebhookEventType.SUBSCRIPTION_PAYMENT_FAILED:
        return this.processSubscriptionPaymentFailed(payload);
      
      case AuthorizeNetWebhookEventType.FRAUD_APPROVED:
      case AuthorizeNetWebhookEventType.FRAUD_DECLINED:
      case AuthorizeNetWebhookEventType.FRAUD_HELD:
        return this.processFraudEvent(payload);
      
      case AuthorizeNetWebhookEventType.CUSTOMER_CREATED:
      case AuthorizeNetWebhookEventType.CUSTOMER_UPDATED:
      case AuthorizeNetWebhookEventType.CUSTOMER_DELETED:
        return this.processCustomerEvent(payload);
      
      case AuthorizeNetWebhookEventType.PAYMENT_METHOD_CREATED:
      case AuthorizeNetWebhookEventType.PAYMENT_METHOD_UPDATED:
      case AuthorizeNetWebhookEventType.PAYMENT_METHOD_DELETED:
        return this.processPaymentMethodEvent(payload);
      
      default:
        return this.processGenericEvent(payload);
    }
  }

  // Process payment authorization event
  private static processPaymentAuthorization(payload: AuthorizeNetWebhookPayload) {
    return {
      type: 'payment.authorized',
      data: {
        payment_intent_id: `pi_authnet_${payload.payload.transId}`,
        transaction_id: payload.payload.transId,
        amount_cents: Math.round(parseFloat(payload.payload.authAmount) * 100),
        currency: 'USD',
        auth_code: payload.payload.authCode,
        avs_result: payload.payload.avsResultCode,
        cvv_result: payload.payload.cvvResultCode,
        customer_profile_id: payload.payload.customerProfileId,
        payment_profile_id: payload.payload.customerPaymentProfileId,
        expires_at: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(), // 30 days
        metadata: {
          webhook_id: payload.notificationId,
          event_date: payload.eventDate,
          test_request: payload.payload.testRequest === 'true'
        }
      }
    };
  }

  // Process payment capture event
  private static processPaymentCapture(payload: AuthorizeNetWebhookPayload) {
    return {
      type: 'payment.succeeded',
      data: {
        payment_intent_id: `pi_authnet_${payload.payload.transId}`,
        transaction_id: payload.payload.transId,
        amount_cents: Math.round(parseFloat(payload.payload.settleAmount || payload.payload.authAmount) * 100),
        currency: 'USD',
        auth_code: payload.payload.authCode,
        settlement_state: payload.payload.batch?.settlementState || 'pending',
        settlement_time: payload.payload.batch?.settlementTimeUTC,
        customer_profile_id: payload.payload.customerProfileId,
        payment_profile_id: payload.payload.customerPaymentProfileId,
        metadata: {
          webhook_id: payload.notificationId,
          event_date: payload.eventDate,
          batch_id: payload.payload.batch?.batchId,
          test_request: payload.payload.testRequest === 'true'
        }
      }
    };
  }

  // Process payment void event
  private static processPaymentVoid(payload: AuthorizeNetWebhookPayload) {
    return {
      type: 'payment.canceled',
      data: {
        payment_intent_id: `pi_authnet_${payload.payload.transId}`,
        transaction_id: payload.payload.transId,
        original_transaction_id: payload.payload.refTransID,
        amount_cents: Math.round(parseFloat(payload.payload.authAmount) * 100),
        currency: 'USD',
        reason: 'void_requested',
        metadata: {
          webhook_id: payload.notificationId,
          event_date: payload.eventDate,
          test_request: payload.payload.testRequest === 'true'
        }
      }
    };
  }

  // Process payment refund event
  private static processPaymentRefund(payload: AuthorizeNetWebhookPayload) {
    return {
      type: 'payment.refunded',
      data: {
        payment_intent_id: `pi_authnet_${payload.payload.refTransID}`, // Original transaction
        refund_id: `re_authnet_${payload.payload.transId}`,
        transaction_id: payload.payload.transId,
        original_transaction_id: payload.payload.refTransID,
        amount_cents: Math.round(parseFloat(payload.payload.settleAmount || payload.payload.authAmount) * 100),
        currency: 'USD',
        reason: 'requested_by_customer',
        metadata: {
          webhook_id: payload.notificationId,
          event_date: payload.eventDate,
          test_request: payload.payload.testRequest === 'true'
        }
      }
    };
  }

  // Process payment settlement event
  private static processPaymentSettlement(payload: AuthorizeNetWebhookPayload) {
    return {
      type: 'payment.settled',
      data: {
        payment_intent_id: `pi_authnet_${payload.payload.transId}`,
        transaction_id: payload.payload.transId,
        amount_cents: Math.round(parseFloat(payload.payload.settleAmount) * 100),
        currency: 'USD',
        settlement_state: payload.payload.batch?.settlementState || 'settled',
        settlement_time: payload.payload.batch?.settlementTimeUTC,
        batch_id: payload.payload.batch?.batchId,
        metadata: {
          webhook_id: payload.notificationId,
          event_date: payload.eventDate,
          test_request: payload.payload.testRequest === 'true'
        }
      }
    };
  }

  // Process subscription payment success event
  private static processSubscriptionPaymentSuccess(payload: AuthorizeNetWebhookPayload) {
    return {
      type: 'subscription.payment_succeeded',
      data: {
        subscription_id: payload.payload.subscription?.id.toString(),
        payment_number: payload.payload.subscription?.payNum,
        transaction_id: payload.payload.transId,
        amount_cents: Math.round(parseFloat(payload.payload.authAmount) * 100),
        currency: 'USD',
        customer_profile_id: payload.payload.customerProfileId,
        payment_profile_id: payload.payload.customerPaymentProfileId,
        metadata: {
          webhook_id: payload.notificationId,
          event_date: payload.eventDate,
          test_request: payload.payload.testRequest === 'true'
        }
      }
    };
  }

  // Process subscription payment failed event
  private static processSubscriptionPaymentFailed(payload: AuthorizeNetWebhookPayload) {
    return {
      type: 'subscription.payment_failed',
      data: {
        subscription_id: payload.payload.subscription?.id.toString(),
        payment_number: payload.payload.subscription?.payNum,
        transaction_id: payload.payload.transId,
        amount_cents: Math.round(parseFloat(payload.payload.requestedAmount) * 100),
        currency: 'USD',
        failure_reason: `Response Code: ${payload.payload.responseCode}`,
        customer_profile_id: payload.payload.customerProfileId,
        payment_profile_id: payload.payload.customerPaymentProfileId,
        metadata: {
          webhook_id: payload.notificationId,
          event_date: payload.eventDate,
          test_request: payload.payload.testRequest === 'true'
        }
      }
    };
  }

  // Process fraud detection event
  private static processFraudEvent(payload: AuthorizeNetWebhookPayload) {
    const fraudAction = payload.eventType.includes('approved') ? 'approved' :
                       payload.eventType.includes('declined') ? 'declined' : 'held';

    return {
      type: 'payment.fraud_detected',
      data: {
        payment_intent_id: `pi_authnet_${payload.payload.transId}`,
        transaction_id: payload.payload.transId,
        fraud_action: fraudAction,
        amount_cents: Math.round(parseFloat(payload.payload.authAmount) * 100),
        currency: 'USD',
        customer_ip: payload.payload.customerIP,
        metadata: {
          webhook_id: payload.notificationId,
          event_date: payload.eventDate,
          test_request: payload.payload.testRequest === 'true'
        }
      }
    };
  }

  // Process customer event
  private static processCustomerEvent(payload: AuthorizeNetWebhookPayload) {
    const action = payload.eventType.includes('created') ? 'created' :
                   payload.eventType.includes('updated') ? 'updated' : 'deleted';

    return {
      type: `customer.${action}`,
      data: {
        customer_id: payload.payload.customerProfileId,
        profile: payload.payload.profile,
        metadata: {
          webhook_id: payload.notificationId,
          event_date: payload.eventDate
        }
      }
    };
  }

  // Process payment method event
  private static processPaymentMethodEvent(payload: AuthorizeNetWebhookPayload) {
    const action = payload.eventType.includes('created') ? 'attached' :
                   payload.eventType.includes('updated') ? 'updated' : 'detached';

    return {
      type: `payment_method.${action}`,
      data: {
        payment_method_id: `${payload.payload.customerProfileId}:${payload.payload.customerPaymentProfileId}`,
        customer_id: payload.payload.customerProfileId,
        payment_profile_id: payload.payload.customerPaymentProfileId,
        metadata: {
          webhook_id: payload.notificationId,
          event_date: payload.eventDate
        }
      }
    };
  }

  // Process generic/unknown event
  private static processGenericEvent(payload: AuthorizeNetWebhookPayload) {
    return {
      type: 'unknown',
      data: {
        event_type: payload.eventType,
        payload: payload.payload,
        metadata: {
          webhook_id: payload.notificationId,
          event_date: payload.eventDate
        }
      }
    };
  }

  // Validate webhook payload structure
  static validateWebhookPayload(payload: any): payload is AuthorizeNetWebhookPayload {
    return (
      payload &&
      typeof payload.notificationId === 'string' &&
      typeof payload.eventType === 'string' &&
      typeof payload.eventDate === 'string' &&
      typeof payload.webhookId === 'string' &&
      payload.payload &&
      typeof payload.payload === 'object'
    );
  }

  // Get supported webhook event types
  static getSupportedEventTypes(): string[] {
    return Object.values(AuthorizeNetWebhookEventType);
  }
}
