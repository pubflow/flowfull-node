import { PaymentAdapter, PaymentAdapterConfig, PaymentAdapterCapabilities } from '../base/payment-adapter';
import {
  CreatePaymentIntentRequest,
  PaymentIntent,
  ConfirmPaymentIntentRequest,
  CreateCustomerRequest,
  Customer,
  RefundRequest,
  RefundResponse,
  PaymentMethodType
} from '../base/payment-adapter';
import { PayPalHttpClient } from './paypal-client';
import { PayPalOrderRequest, PayPalOrder, PayPalPaymentSource } from './types';
import { mapPayPalStatusToPaymentIntent, mapPayPalErrorToPaymentError } from './utils';

export class PayPalAdapter extends PaymentAdapter {
  private client: PayPalHttpClient;

  constructor(config: PaymentAdapterConfig) {
    super(config);
    
    console.log('🔧 Initializing PayPal adapter...');
    console.log('🔑 Client ID:', config.api_key ? `${config.api_key.substring(0, 15)}...` : 'NOT SET');
    console.log('🌍 Environment:', config.environment);

    this.client = new PayPalHttpClient({
      clientId: config.api_key,
      clientSecret: config.secret_key || '',
      environment: config.environment,
      webhookId: config.additional_config?.webhook_id,
      bnCode: config.additional_config?.bn_code
    });
  }

  getCapabilities(): PaymentAdapterCapabilities {
    return {
      supports_payment_intents: true,
      supports_saved_payment_methods: true,
      supports_customers: true,
      supports_refunds: true,
      supports_webhooks: true,
      supports_subscriptions: true,
      supports_3d_secure: true,
      supports_manual_capture: true,
      supported_currencies: [
        'USD', 'EUR', 'GBP', 'CAD', 'AUD', 'JPY', 'CHF', 'NOK', 'SEK', 'DKK',
        'PLN', 'CZK', 'HUF', 'ILS', 'MXN', 'BRL', 'MYR', 'PHP', 'THB', 'TWD',
        'NZD', 'HKD', 'SGD', 'INR', 'RUB', 'CNY'
      ],
      supported_payment_methods: [
        PaymentMethodType.CREDIT_CARD,
        PaymentMethodType.PAYPAL,
        PaymentMethodType.VENMO,
        PaymentMethodType.BANK_ACCOUNT
      ]
    };
  }

  async createPaymentIntent(request: CreatePaymentIntentRequest): Promise<PaymentIntent> {
    console.log('🔄 Creating PayPal payment intent...');
    
    this.validateCurrency(request.currency);
    this.validateAmount(request.amount_cents, request.currency);

    // Build PayPal order request
    const orderRequest: PayPalOrderRequest = {
      intent: request.capture_method === 'manual' ? 'AUTHORIZE' : 'CAPTURE',
      purchase_units: [{
        amount: {
          currency_code: request.currency.toUpperCase(),
          value: (request.amount_cents / 100).toFixed(2)
        },
        description: request.description || 'Payment',
        custom_id: request.metadata?.order_id || undefined,
        invoice_id: request.metadata?.invoice_id || undefined
      }],
      payment_source: this.buildPaymentSource(request),
      application_context: {
        brand_name: request.metadata?.brand_name || 'Your Store',
        landing_page: 'NO_PREFERENCE',
        user_action: 'PAY_NOW',
        return_url: request.return_url || `${process.env.FRONTEND_URL}/payment/success`,
        cancel_url: request.cancel_url || `${process.env.FRONTEND_URL}/payment/cancel`
      }
    };

    try {
      const order = await this.client.createOrder(orderRequest);
      return this.mapPayPalOrderToPaymentIntent(order, request);
    } catch (error) {
      throw mapPayPalErrorToPaymentError(error);
    }
  }

  async getPaymentIntent(id: string): Promise<PaymentIntent> {
    try {
      const order = await this.client.getOrder(id);
      return this.mapPayPalOrderToPaymentIntent(order);
    } catch (error) {
      throw mapPayPalErrorToPaymentError(error);
    }
  }

  async updatePaymentIntent(id: string, updates: Partial<CreatePaymentIntentRequest>): Promise<PaymentIntent> {
    // PayPal doesn't support updating orders directly
    // We need to create a new order with updated information
    console.log('⚠️ PayPal does not support order updates. Creating new order...');
    
    const existingOrder = await this.client.getOrder(id);
    
    // Build updated request based on existing order and updates
    const updatedRequest: CreatePaymentIntentRequest = {
      amount_cents: updates.amount_cents || parseInt(existingOrder.purchase_units[0].amount.value) * 100,
      currency: updates.currency || existingOrder.purchase_units[0].amount.currency_code,
      description: updates.description || existingOrder.purchase_units[0].description,
      customer_id: updates.customer_id,
      payment_method_id: updates.payment_method_id,
      metadata: { ...existingOrder.purchase_units[0].custom_id ? { order_id: existingOrder.purchase_units[0].custom_id } : {}, ...updates.metadata },
      return_url: updates.return_url,
      cancel_url: updates.cancel_url,
      confirm: updates.confirm
    };

    return this.createPaymentIntent(updatedRequest);
  }

  async confirmPaymentIntent(request: ConfirmPaymentIntentRequest): Promise<PaymentIntent> {
    console.log('✅ Confirming PayPal payment intent...');
    
    try {
      const capturedOrder = await this.client.captureOrder(request.payment_intent_id);
      return this.mapPayPalOrderToPaymentIntent(capturedOrder);
    } catch (error) {
      throw mapPayPalErrorToPaymentError(error);
    }
  }

  async cancelPaymentIntent(id: string): Promise<PaymentIntent> {
    console.log('❌ Canceling PayPal payment intent...');

    try {
      // PayPal doesn't have explicit cancel, but we can get the order status
      const order = await this.client.getOrder(id);

      // If order is still pending, it's effectively cancelled by not capturing
      if (order.status === 'CREATED' || order.status === 'APPROVED') {
        order.status = 'CANCELLED';
      }

      return this.mapPayPalOrderToPaymentIntent(order);
    } catch (error) {
      throw mapPayPalErrorToPaymentError(error);
    }
  }

  async capturePaymentIntent(id: string, amount_cents?: number): Promise<PaymentIntent> {
    console.log('💰 Capturing PayPal payment intent:', id);

    try {
      // For PayPal, capture is done via the existing confirmPaymentIntent logic
      // But we can also support direct capture for authorized orders
      const capturedOrder = await this.client.captureOrder(id);

      // Update metadata to track capture information
      const captureId = `cap_${Date.now()}_${Math.random().toString(36).substring(2, 11)}`;
      const captureData = {
        authorization: {
          amount_cents: parseInt(capturedOrder.purchase_units[0].amount.value) * 100,
          captured_at: new Date().toISOString(),
          capture_method: 'manual',
          provider_auth_id: id
        },
        captures: [
          {
            id: captureId,
            amount_cents: amount_cents || parseInt(capturedOrder.purchase_units[0].amount.value) * 100,
            captured_at: new Date().toISOString(),
            provider_capture_id: capturedOrder.purchase_units[0].payments?.captures?.[0]?.id || id
          }
        ]
      };

      // Return the payment intent with capture metadata
      const paymentIntent = this.mapPayPalOrderToPaymentIntent(capturedOrder);
      paymentIntent.metadata = {
        ...paymentIntent.metadata,
        ...captureData,
        // Add computed fields
        authorized_amount_cents: parseInt(capturedOrder.purchase_units[0].amount.value) * 100,
        captured_amount_cents: amount_cents || parseInt(capturedOrder.purchase_units[0].amount.value) * 100,
        remaining_amount_cents: 0,
        capture_method: 'manual',
        capture_status: 'fully_captured'
      };

      return paymentIntent;
    } catch (error) {
      throw mapPayPalErrorToPaymentError(error);
    }
  }

  private buildPaymentSource(request: CreatePaymentIntentRequest): PayPalPaymentSource {
    // Default to PayPal payment source
    const paymentSource: PayPalPaymentSource = {
      paypal: {
        experience_context: {
          payment_method_preference: 'IMMEDIATE_PAYMENT_REQUIRED',
          brand_name: request.metadata?.brand_name || 'Your Store',
          locale: 'en-US',
          landing_page: 'LOGIN',
          shipping_preference: 'NO_SHIPPING',
          user_action: 'PAY_NOW'
        }
      }
    };

    // If specific payment method is requested
    if (request.payment_method_type) {
      switch (request.payment_method_type) {
        case PaymentMethodType.VENMO:
          return {
            venmo: {
              experience_context: {
                brand_name: request.metadata?.brand_name || 'Your Store',
                shipping_preference: 'NO_SHIPPING'
              }
            }
          };
        case PaymentMethodType.CREDIT_CARD:
          return {
            card: {
              experience_context: {
                brand_name: request.metadata?.brand_name || 'Your Store',
                shipping_preference: 'NO_SHIPPING'
              }
            }
          };
        default:
          return paymentSource;
      }
    }

    return paymentSource;
  }

  private mapPayPalOrderToPaymentIntent(order: PayPalOrder, originalRequest?: CreatePaymentIntentRequest): PaymentIntent {
    const amount_cents = parseInt(order.purchase_units[0].amount.value) * 100;
    const currency = order.purchase_units[0].amount.currency_code;
    
    // Get approval URL for frontend
    const approvalLink = order.links?.find(link => link.rel === 'approve');
    
    return {
      id: order.id,
      status: mapPayPalStatusToPaymentIntent(order.status),
      amount_cents,
      currency,
      client_secret: order.id, // PayPal uses order ID as the "secret"
      customer_id: originalRequest?.customer_id,
      payment_method_id: originalRequest?.payment_method_id,
      metadata: originalRequest?.metadata || {},
      provider_data: {
        provider_intent_id: order.id,
        provider_payment_id: order.purchase_units[0].payments?.captures?.[0]?.id || null,
        description: order.purchase_units[0].description || null,
        created_at: order.create_time || new Date().toISOString(),
        updated_at: order.update_time || new Date().toISOString(),
        next_action: approvalLink ? {
          type: 'redirect_to_url',
          redirect_to_url: {
            url: approvalLink.href,
            return_url: originalRequest?.return_url || `${process.env.FRONTEND_URL}/payment/success`
          }
        } : null,
        error_message: null
      }
    };
  }

  async createCustomer(request: CreateCustomerRequest): Promise<Customer> {
    console.log('👤 Creating PayPal customer...');

    // PayPal doesn't have a direct customer creation API like Stripe
    // We'll create a customer record in our system and link it to PayPal when needed
    const customerId = `paypal_cust_${Date.now()}_${Math.random().toString(36).substring(2, 11)}`;

    return {
      id: customerId,
      email: request.email,
      name: request.name,
      phone: request.phone,
      provider_data: {
        provider_customer_id: customerId,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
        metadata: request.metadata || {}
      }
    };
  }

  async refundPayment(request: RefundRequest): Promise<RefundResponse> {
    console.log('💸 Processing PayPal refund...');

    try {
      // Get the original payment to find the capture ID
      const order = await this.client.getOrder(request.payment_intent_id);
      const capture = order.purchase_units[0]?.payments?.captures?.[0];

      if (!capture) {
        throw new Error('No capture found for this payment');
      }

      const refundAmount = request.amount_cents ? {
        currency_code: request.currency || order.purchase_units[0].amount.currency_code,
        value: (request.amount_cents / 100).toFixed(2)
      } : undefined;

      const refundResponse = await this.client.refundCapture(capture.id, refundAmount);

      return {
        id: refundResponse.id,
        amount_cents: request.amount_cents || parseInt(order.purchase_units[0].amount.value) * 100,
        currency: refundResponse.amount.currency_code,
        status: refundResponse.status.toLowerCase(),
        reason: request.reason,
        provider_data: {
          provider_refund_id: refundResponse.id,
          created_at: refundResponse.create_time || new Date().toISOString(),
          updated_at: refundResponse.update_time || new Date().toISOString(),
          metadata: request.metadata || {}
        }
      };
    } catch (error) {
      throw mapPayPalErrorToPaymentError(error);
    }
  }

  async healthCheck(): Promise<{ success: boolean; latency?: number; error?: string }> {
    const startTime = Date.now();

    try {
      // Simple API call to check connectivity
      await this.client.generateAccessToken();

      return {
        success: true,
        latency: Date.now() - startTime
      };
    } catch (error) {
      return {
        success: false,
        latency: Date.now() - startTime,
        error: error instanceof Error ? error.message : 'Unknown error'
      };
    }
  }
}
