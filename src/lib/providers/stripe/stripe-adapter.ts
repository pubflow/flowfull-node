import Stripe from 'stripe';
import {
  PaymentAdapter,
  PaymentAdapterConfig,
  PaymentAdapterCapabilities,
  PaymentIntent,
  PaymentMethod,
  Customer,
  CreatePaymentIntentRequest,
  ConfirmPaymentIntentRequest,
  CreateCustomerRequest,
  CreatePaymentMethodRequest,
  RefundRequest,
  RefundResponse,
  WebhookEvent,
  PaymentIntentStatus,
  PaymentMethodType,
  BillingDetails
} from '../base/payment-adapter';

export class StripeAdapter extends PaymentAdapter {
  private stripe: Stripe;

  constructor(config: PaymentAdapterConfig) {
    super(config);

    console.log('🔧 Initializing Stripe adapter...');
    console.log('🔑 API Key:', config.api_key ? `${config.api_key.substring(0, 15)}...` : 'NOT SET');
    console.log('🌍 Environment:', config.environment);

    this.stripe = new Stripe(config.api_key, {
      apiVersion: '2025-04-30.basil',
      typescript: true
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
      supported_currencies: [
        // Major global currencies
        'USD', 'EUR', 'GBP', 'CAD', 'AUD', 'JPY', 'CHF', 'SEK', 'NOK', 'DKK',
        'PLN', 'CZK', 'HUF', 'BGN', 'RON', 'HRK', 'ISK', 'SGD', 'HKD', 'NZD',
        'KRW', 'INR', 'MYR', 'THB', 'PHP', 'TWD', 'IDR', 'VND',

        // Latin American currencies (including DOP!)
        'ARS', // Argentina - Peso Argentino
        'BOB', // Bolivia - Boliviano
        'BRL', // Brazil - Real Brasileiro
        'CLP', // Chile - Peso Chileno
        'COP', // Colombia - Peso Colombiano
        'CRC', // Costa Rica - Colón Costarricense
        'DOP', // Dominican Republic - Peso Dominicano ✅
        'GTQ', // Guatemala - Quetzal
        'HNL', // Honduras - Lempira
        'MXN', // Mexico - Peso Mexicano
        'NIO', // Nicaragua - Córdoba
        'PAB', // Panama - Balboa
        'PEN', // Peru - Sol Peruano
        'PYG', // Paraguay - Guaraní
        'UYU', // Uruguay - Peso Uruguayo

        // Caribbean currencies
        'BBD', // Barbados - Dollar
        'BMD', // Bermuda - Dollar
        'BSD', // Bahamas - Dollar
        'BZD', // Belize - Dollar
        'JMD', // Jamaica - Dollar
        'KYD', // Cayman Islands - Dollar
        'TTD', // Trinidad and Tobago - Dollar
        'XCD'  // Eastern Caribbean - Dollar
      ],
      supported_payment_methods: [
        PaymentMethodType.CREDIT_CARD,
        PaymentMethodType.DEBIT_CARD,
        PaymentMethodType.APPLE_PAY,
        PaymentMethodType.GOOGLE_PAY
      ]
    };
  }

  async createPaymentIntent(request: CreatePaymentIntentRequest): Promise<PaymentIntent> {
    console.log('🔄 Creating Stripe payment intent...');
    console.log('🔑 Using API key from config:', this.config.api_key ? `${this.config.api_key.substring(0, 20)}...` : 'NOT SET');

    this.validateCurrency(request.currency);
    this.validateAmount(request.amount_cents, request.currency);

    const params: Stripe.PaymentIntentCreateParams = {
      amount: request.amount_cents,
      currency: request.currency.toLowerCase(),
      description: request.description,
      metadata: request.metadata || {},
      automatic_payment_methods: {
        enabled: true
      }
    };

    if (request.customer_id) {
      params.customer = request.customer_id;
    }

    if (request.payment_method_id) {
      params.payment_method = request.payment_method_id;
    }

    if (request.confirm) {
      params.confirm = true;
      if (request.return_url) {
        params.return_url = request.return_url;
      }
    }

    try {
      const paymentIntent = await this.stripe.paymentIntents.create(params);
      return this.mapStripePaymentIntent(paymentIntent);
    } catch (error) {
      throw this.handleStripeError(error);
    }
  }

  async getPaymentIntent(id: string): Promise<PaymentIntent> {
    try {
      const paymentIntent = await this.stripe.paymentIntents.retrieve(id);
      return this.mapStripePaymentIntent(paymentIntent);
    } catch (error) {
      throw this.handleStripeError(error);
    }
  }

  async confirmPaymentIntent(request: ConfirmPaymentIntentRequest): Promise<PaymentIntent> {
    const params: Stripe.PaymentIntentConfirmParams = {};

    if (request.payment_method_id) {
      params.payment_method = request.payment_method_id;
    }

    if (request.return_url) {
      params.return_url = request.return_url;
    }

    // If save_payment_method is true, set setup_future_usage
    if (request.save_payment_method) {
      params.setup_future_usage = 'off_session';
      console.log('🔐 Setting up payment method for future use (setup_future_usage: off_session)');
    }

    try {
      const paymentIntent = await this.stripe.paymentIntents.confirm(
        request.payment_intent_id,
        params
      );
      return this.mapStripePaymentIntent(paymentIntent);
    } catch (error) {
      throw this.handleStripeError(error);
    }
  }

  async cancelPaymentIntent(id: string): Promise<PaymentIntent> {
    try {
      const paymentIntent = await this.stripe.paymentIntents.cancel(id);
      return this.mapStripePaymentIntent(paymentIntent);
    } catch (error) {
      throw this.handleStripeError(error);
    }
  }

  async createCustomer(request: CreateCustomerRequest): Promise<Customer> {
    const params: Stripe.CustomerCreateParams = {
      email: request.email,
      name: request.name,
      phone: request.phone,
      metadata: request.metadata || {}
    };

    try {
      const customer = await this.stripe.customers.create(params);
      return this.mapStripeCustomer(customer);
    } catch (error) {
      throw this.handleStripeError(error);
    }
  }

  async getCustomer(id: string): Promise<Customer> {
    try {
      const customer = await this.stripe.customers.retrieve(id);
      if (customer.deleted) {
        throw new Error('Customer has been deleted');
      }
      return this.mapStripeCustomer(customer as Stripe.Customer);
    } catch (error) {
      throw this.handleStripeError(error);
    }
  }

  async updateCustomer(id: string, updates: Partial<CreateCustomerRequest>): Promise<Customer> {
    const params: Stripe.CustomerUpdateParams = {};

    if (updates.email) params.email = updates.email;
    if (updates.name) params.name = updates.name;
    if (updates.phone) params.phone = updates.phone;
    if (updates.metadata) params.metadata = updates.metadata;

    try {
      const customer = await this.stripe.customers.update(id, params);
      return this.mapStripeCustomer(customer);
    } catch (error) {
      throw this.handleStripeError(error);
    }
  }

  async deleteCustomer(id: string): Promise<void> {
    try {
      await this.stripe.customers.del(id);
    } catch (error) {
      throw this.handleStripeError(error);
    }
  }

  async createPaymentMethod(request: CreatePaymentMethodRequest): Promise<PaymentMethod> {
    const params: Stripe.PaymentMethodCreateParams = {
      type: this.mapPaymentMethodType(request.type)
    };

    if (request.card) {
      params.card = {
        number: request.card.number,
        exp_month: request.card.exp_month,
        exp_year: request.card.exp_year,
        cvc: request.card.cvc
      };
    }

    if (request.billing_details) {
      params.billing_details = this.mapBillingDetails(request.billing_details);
    }

    try {
      const paymentMethod = await this.stripe.paymentMethods.create(params);
      return this.mapStripePaymentMethod(paymentMethod);
    } catch (error) {
      throw this.handleStripeError(error);
    }
  }

  async getPaymentMethod(id: string): Promise<PaymentMethod> {
    try {
      const paymentMethod = await this.stripe.paymentMethods.retrieve(id);
      return this.mapStripePaymentMethod(paymentMethod);
    } catch (error) {
      throw this.handleStripeError(error);
    }
  }

  async attachPaymentMethodToCustomer(payment_method_id: string, customer_id: string): Promise<PaymentMethod> {
    try {
      const paymentMethod = await this.stripe.paymentMethods.attach(payment_method_id, {
        customer: customer_id
      });
      return this.mapStripePaymentMethod(paymentMethod);
    } catch (error) {
      throw this.handleStripeError(error);
    }
  }

  async detachPaymentMethodFromCustomer(payment_method_id: string): Promise<PaymentMethod> {
    try {
      const paymentMethod = await this.stripe.paymentMethods.detach(payment_method_id);
      return this.mapStripePaymentMethod(paymentMethod);
    } catch (error) {
      throw this.handleStripeError(error);
    }
  }

  async deletePaymentMethod(payment_method_id: string, customer_id?: string): Promise<void> {
    try {
      // First, get the payment method to determine its type
      const paymentMethod = await this.stripe.paymentMethods.retrieve(payment_method_id);
      console.log(`🔍 Payment method type: ${paymentMethod.type}`);

      // For cards and bank accounts, try to use legacy Sources API for immediate deletion
      if ((paymentMethod.type === 'card' || paymentMethod.type === 'us_bank_account') && customer_id) {
        try {
          console.log('🗑️ Attempting legacy Sources API deletion...');
          console.log(`   Customer: ${customer_id}`);
          console.log(`   Payment Method: ${payment_method_id}`);

          // Try to delete using legacy Sources API
          await this.stripe.customers.deleteSource(customer_id, payment_method_id);
          console.log('✅ Payment method deleted using legacy Sources API');
          return;
        } catch (legacyError: any) {
          console.log('⚠️ Legacy Sources API failed:', legacyError.message);
          console.log('🔄 Falling back to modern Payment Methods API...');
        }
      }

      // Fallback to modern Payment Methods API (detach only)
      try {
        await this.stripe.paymentMethods.detach(payment_method_id);
        console.log('✅ Payment method detached from customer (modern API)');
      } catch (detachError: any) {
        if (!detachError.message?.includes('not attached to a customer')) {
          console.log('⚠️ Error detaching payment method:', detachError.message);
        } else {
          console.log('ℹ️ Payment method was not attached to customer');
        }
      }

      console.log('ℹ️ Payment method processed. If using modern API, Stripe will clean it up automatically.');
    } catch (error) {
      throw this.handleStripeError(error);
    }
  }

  async listCustomerPaymentMethods(customer_id: string): Promise<PaymentMethod[]> {
    try {
      const paymentMethods = await this.stripe.paymentMethods.list({
        customer: customer_id,
        type: 'card'
      });
      return paymentMethods.data.map(pm => this.mapStripePaymentMethod(pm));
    } catch (error) {
      throw this.handleStripeError(error);
    }
  }

  async refundPayment(request: RefundRequest): Promise<RefundResponse> {
    const params: Stripe.RefundCreateParams = {
      payment_intent: request.payment_intent_id,
      reason: request.reason as Stripe.RefundCreateParams.Reason,
      metadata: request.metadata || {}
    };

    if (request.amount_cents) {
      params.amount = request.amount_cents;
    }

    try {
      const refund = await this.stripe.refunds.create(params);
      return this.mapStripeRefund(refund);
    } catch (error) {
      throw this.handleStripeError(error);
    }
  }

  async getRefund(id: string): Promise<RefundResponse> {
    try {
      const refund = await this.stripe.refunds.retrieve(id);
      return this.mapStripeRefund(refund);
    } catch (error) {
      throw this.handleStripeError(error);
    }
  }

  async verifyWebhook(payload: string, signature: string): Promise<WebhookEvent> {
    if (!this.config.webhook_secret) {
      throw new Error('Webhook secret not configured');
    }

    try {
      const event = this.stripe.webhooks.constructEvent(
        payload,
        signature,
        this.config.webhook_secret
      );

      return {
        id: event.id,
        type: event.type,
        data: event.data,
        created: event.created
      };
    } catch (error) {
      throw this.handleStripeError(error);
    }
  }

  // Mapping functions
  private mapStripePaymentIntent(pi: Stripe.PaymentIntent): PaymentIntent {
    return {
      id: pi.id,
      client_secret: pi.client_secret || undefined,
      amount_cents: pi.amount,
      currency: pi.currency.toUpperCase(),
      status: this.mapPaymentIntentStatus(pi.status),
      payment_method_id: pi.payment_method as string || undefined,
      customer_id: pi.customer as string || undefined,
      metadata: pi.metadata,
      provider_data: pi
    };
  }

  private mapStripeCustomer(customer: Stripe.Customer): Customer {
    return {
      id: customer.id,
      email: customer.email || '',
      name: customer.name || undefined,
      phone: customer.phone || undefined,
      default_payment_method: customer.invoice_settings?.default_payment_method as string || undefined,
      provider_data: customer
    };
  }

  private mapStripePaymentMethod(pm: Stripe.PaymentMethod): PaymentMethod {
    const paymentMethod: PaymentMethod = {
      id: pm.id,
      type: this.mapStripePaymentMethodType(pm.type),
      provider_data: pm
    };

    if (pm.card) {
      paymentMethod.card = {
        brand: pm.card.brand,
        last_four: pm.card.last4,
        exp_month: pm.card.exp_month,
        exp_year: pm.card.exp_year
      };
    }

    if (pm.billing_details) {
      paymentMethod.billing_details = this.mapStripeBillingDetails(pm.billing_details);
    }

    return paymentMethod;
  }

  private mapStripeRefund(refund: Stripe.Refund): RefundResponse {
    return {
      id: refund.id,
      amount_cents: refund.amount,
      currency: refund.currency.toUpperCase(),
      status: refund.status as any,
      reason: refund.reason || undefined,
      provider_data: refund
    };
  }

  private mapPaymentIntentStatus(status: Stripe.PaymentIntent.Status): PaymentIntentStatus {
    const statusMap: Record<Stripe.PaymentIntent.Status, PaymentIntentStatus> = {
      'requires_payment_method': PaymentIntentStatus.PENDING,
      'requires_confirmation': PaymentIntentStatus.REQUIRES_CONFIRMATION,
      'requires_action': PaymentIntentStatus.REQUIRES_ACTION,
      'processing': PaymentIntentStatus.PROCESSING,
      'requires_capture': PaymentIntentStatus.PROCESSING,
      'canceled': PaymentIntentStatus.CANCELED,
      'succeeded': PaymentIntentStatus.SUCCEEDED
    };

    return statusMap[status] || PaymentIntentStatus.FAILED;
  }

  private mapPaymentMethodType(type: PaymentMethodType): Stripe.PaymentMethodCreateParams.Type {
    const typeMap: Record<PaymentMethodType, Stripe.PaymentMethodCreateParams.Type> = {
      [PaymentMethodType.CREDIT_CARD]: 'card',
      [PaymentMethodType.DEBIT_CARD]: 'card',
      [PaymentMethodType.BANK_ACCOUNT]: 'us_bank_account',
      [PaymentMethodType.PAYPAL]: 'paypal',
      [PaymentMethodType.APPLE_PAY]: 'card',
      [PaymentMethodType.GOOGLE_PAY]: 'card'
    };

    return typeMap[type] || 'card';
  }

  private mapStripePaymentMethodType(type: string): PaymentMethodType {
    const typeMap: Record<string, PaymentMethodType> = {
      'card': PaymentMethodType.CREDIT_CARD,
      'us_bank_account': PaymentMethodType.BANK_ACCOUNT,
      'paypal': PaymentMethodType.PAYPAL
    };

    return typeMap[type] || PaymentMethodType.CREDIT_CARD;
  }

  private mapBillingDetails(details: BillingDetails): Stripe.PaymentMethodCreateParams.BillingDetails {
    const mapped: Stripe.PaymentMethodCreateParams.BillingDetails = {};

    if (details.name) mapped.name = details.name;
    if (details.email) mapped.email = details.email;
    if (details.phone) mapped.phone = details.phone;

    if (details.address) {
      mapped.address = {
        line1: details.address.line1,
        line2: details.address.line2 || undefined,
        city: details.address.city,
        state: details.address.state || undefined,
        postal_code: details.address.postal_code,
        country: details.address.country
      };
    }

    return mapped;
  }

  private mapStripeBillingDetails(details: Stripe.PaymentMethod.BillingDetails): BillingDetails {
    const mapped: BillingDetails = {};

    if (details.name) mapped.name = details.name;
    if (details.email) mapped.email = details.email;
    if (details.phone) mapped.phone = details.phone;

    if (details.address) {
      mapped.address = {
        line1: details.address.line1 || '',
        line2: details.address.line2 || undefined,
        city: details.address.city || '',
        state: details.address.state || undefined,
        postal_code: details.address.postal_code || '',
        country: details.address.country || ''
      };
    }

    return mapped;
  }

  private handleStripeError(error: any): Error {
    if (error.type === 'StripeCardError') {
      return new Error(`Card error: ${error.message}`);
    } else if (error.type === 'StripeInvalidRequestError') {
      return new Error(`Invalid request: ${error.message}`);
    } else if (error.type === 'StripeAPIError') {
      return new Error(`Stripe API error: ${error.message}`);
    } else if (error.type === 'StripeConnectionError') {
      return new Error(`Connection error: ${error.message}`);
    } else if (error.type === 'StripeAuthenticationError') {
      return new Error(`Authentication error: ${error.message}`);
    } else if (error.type === 'StripeRateLimitError') {
      return new Error(`Rate limit error: ${error.message}`);
    }

    return error instanceof Error ? error : new Error('Unknown Stripe error');
  }
}
