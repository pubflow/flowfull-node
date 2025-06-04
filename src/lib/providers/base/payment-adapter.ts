// Base payment adapter interface for all payment providers

export interface PaymentIntent {
  id: string;
  client_secret?: string;
  amount_cents: number;
  currency: string;
  status: PaymentIntentStatus;
  payment_method_id?: string;
  customer_id?: string;
  metadata?: Record<string, any>;
  provider_data?: any;
}

export interface PaymentMethod {
  id: string;
  type: PaymentMethodType;
  card?: {
    brand: string;
    last_four: string;
    exp_month: number;
    exp_year: number;
  };
  billing_details?: BillingDetails;
  provider_data?: any;
}

export interface Customer {
  id: string;
  email: string;
  name?: string;
  phone?: string;
  default_payment_method?: string;
  provider_data?: any;
}

export interface BillingDetails {
  name?: string;
  email?: string;
  phone?: string;
  address?: {
    line1: string;
    line2?: string;
    city: string;
    state?: string;
    postal_code: string;
    country: string;
  };
}

export interface WebhookEvent {
  id: string;
  type: string;
  data: any;
  created: number;
}

export enum PaymentIntentStatus {
  PENDING = 'pending',
  REQUIRES_CONFIRMATION = 'requires_confirmation',
  REQUIRES_ACTION = 'requires_action',
  PROCESSING = 'processing',
  SUCCEEDED = 'succeeded',
  FAILED = 'failed',
  CANCELED = 'canceled'
}

export enum PaymentMethodType {
  CREDIT_CARD = 'credit_card',
  DEBIT_CARD = 'debit_card',
  BANK_ACCOUNT = 'bank_account',
  PAYPAL = 'paypal',
  VENMO = 'venmo',
  APPLE_PAY = 'apple_pay',
  GOOGLE_PAY = 'google_pay'
}

export interface CreatePaymentIntentRequest {
  amount_cents: number;
  currency: string;
  customer_id?: string;
  payment_method_id?: string;
  payment_method_type?: PaymentMethodType;
  description?: string;
  metadata?: Record<string, any>;
  confirm?: boolean;
  capture_method?: 'automatic' | 'manual';
  return_url?: string;
  cancel_url?: string;
  billing_details?: BillingDetails;
}

export interface ConfirmPaymentIntentRequest {
  payment_intent_id: string;
  payment_method_id?: string;
  return_url?: string;
  save_payment_method?: boolean;
  customer_id?: string; // For saving payment method
}

export interface CreateCustomerRequest {
  email: string;
  name?: string;
  phone?: string;
  metadata?: Record<string, any>;
}

export interface CreatePaymentMethodRequest {
  type: PaymentMethodType;
  customer_id?: string;
  card?: {
    number: string;
    exp_month: number;
    exp_year: number;
    cvc: string;
  };
  bank_account?: {
    account_type: 'checking' | 'savings' | 'businessChecking';
    routing_number: string;
    account_number: string;
    account_holder_name: string;
    bank_name?: string;
  };
  billing_details?: BillingDetails;
}

export interface RefundRequest {
  payment_intent_id: string;
  amount_cents?: number; // If not provided, refund full amount
  currency?: string;
  reason?: string;
  metadata?: Record<string, any>;
}

export interface RefundResponse {
  id: string;
  payment_intent_id: string;
  amount_cents: number;
  currency: string;
  status: string;
  reason?: string;
  created_at: string;
  provider_data?: any;
}

export interface PaymentAdapterConfig {
  provider_id: string;
  api_key: string;
  secret_key?: string;
  environment: 'sandbox' | 'production';
  webhook_secret?: string;
  additional_config?: Record<string, any>;
}

export interface PaymentAdapterCapabilities {
  supports_payment_intents: boolean;
  supports_saved_payment_methods: boolean;
  supports_customers: boolean;
  supports_refunds: boolean;
  supports_webhooks: boolean;
  supports_subscriptions: boolean;
  supports_3d_secure: boolean;
  supports_manual_capture: boolean;
  supported_currencies: string[];
  supported_payment_methods: PaymentMethodType[];
}

export abstract class PaymentAdapter {
  protected config: PaymentAdapterConfig;
  protected capabilities: PaymentAdapterCapabilities;

  constructor(config: PaymentAdapterConfig) {
    this.config = config;
    this.capabilities = this.getCapabilities();
  }

  // Abstract methods that must be implemented by each provider
  abstract createPaymentIntent(request: CreatePaymentIntentRequest): Promise<PaymentIntent>;
  abstract getPaymentIntent(id: string): Promise<PaymentIntent>;
  abstract updatePaymentIntent(id: string, updates: Partial<CreatePaymentIntentRequest>): Promise<PaymentIntent>;
  abstract confirmPaymentIntent(request: ConfirmPaymentIntentRequest): Promise<PaymentIntent>;
  abstract cancelPaymentIntent(id: string): Promise<PaymentIntent>;
  abstract getCapabilities(): PaymentAdapterCapabilities;

  // Optional method for authorization/capture support
  async capturePaymentIntent(id: string, amount_cents?: number): Promise<PaymentIntent> {
    throw new Error(`${this.config.provider_id} does not support manual capture`);
  }

  // Optional methods with default implementations
  async createCustomer(request: CreateCustomerRequest): Promise<Customer> {
    throw new Error(`${this.config.provider_id} does not support customer creation`);
  }

  async getCustomer(id: string): Promise<Customer> {
    throw new Error(`${this.config.provider_id} does not support customer retrieval`);
  }

  async updateCustomer(id: string, updates: Partial<CreateCustomerRequest>): Promise<Customer> {
    throw new Error(`${this.config.provider_id} does not support customer updates`);
  }

  async deleteCustomer(id: string): Promise<void> {
    throw new Error(`${this.config.provider_id} does not support customer deletion`);
  }

  async createPaymentMethod(request: CreatePaymentMethodRequest): Promise<PaymentMethod> {
    throw new Error(`${this.config.provider_id} does not support payment method creation`);
  }

  async getPaymentMethod(id: string): Promise<PaymentMethod> {
    throw new Error(`${this.config.provider_id} does not support payment method retrieval`);
  }

  async attachPaymentMethodToCustomer(payment_method_id: string, customer_id: string): Promise<PaymentMethod> {
    throw new Error(`${this.config.provider_id} does not support attaching payment methods to customers`);
  }

  async detachPaymentMethodFromCustomer(payment_method_id: string): Promise<PaymentMethod> {
    throw new Error(`${this.config.provider_id} does not support detaching payment methods from customers`);
  }

  async deletePaymentMethod(payment_method_id: string, customer_id?: string): Promise<void> {
    throw new Error(`${this.config.provider_id} does not support deleting payment methods`);
  }

  async listCustomerPaymentMethods(customer_id: string): Promise<PaymentMethod[]> {
    throw new Error(`${this.config.provider_id} does not support listing customer payment methods`);
  }

  async refundPayment(request: RefundRequest): Promise<RefundResponse> {
    throw new Error(`${this.config.provider_id} does not support refunds`);
  }

  async getRefund(id: string): Promise<RefundResponse> {
    throw new Error(`${this.config.provider_id} does not support refund retrieval`);
  }

  async verifyWebhook(payload: string, signature: string): Promise<WebhookEvent> {
    throw new Error(`${this.config.provider_id} does not support webhook verification`);
  }

  // Utility methods
  getProviderId(): string {
    return this.config.provider_id;
  }

  supportsFeature(feature: keyof PaymentAdapterCapabilities): boolean {
    return this.capabilities[feature] as boolean;
  }

  supportsCurrency(currency: string): boolean {
    return this.capabilities.supported_currencies.includes(currency.toUpperCase());
  }

  supportsPaymentMethod(type: PaymentMethodType): boolean {
    return this.capabilities.supported_payment_methods.includes(type);
  }

  // Health check
  async healthCheck(): Promise<{ success: boolean; latency?: number; error?: string }> {
    const startTime = Date.now();

    try {
      // Try to create a minimal payment intent to test connectivity
      await this.createPaymentIntent({
        amount_cents: 100,
        currency: 'USD',
        description: 'Health check'
      });

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

  // Normalize amount to cents
  protected normalizeToCents(amount: number, currency: string): number {
    // Some currencies don't use decimal places (e.g., JPY, KRW)
    const zeroDecimalCurrencies = ['JPY', 'KRW', 'VND', 'CLP'];

    if (zeroDecimalCurrencies.includes(currency.toUpperCase())) {
      return Math.round(amount);
    }

    return Math.round(amount * 100);
  }

  // Normalize amount from cents
  protected normalizeFromCents(amountCents: number, currency: string): number {
    const zeroDecimalCurrencies = ['JPY', 'KRW', 'VND', 'CLP'];

    if (zeroDecimalCurrencies.includes(currency.toUpperCase())) {
      return amountCents;
    }

    return amountCents / 100;
  }

  // Validate currency
  protected validateCurrency(currency: string): void {
    if (!this.supportsCurrency(currency)) {
      throw new Error(`Currency ${currency} is not supported by ${this.config.provider_id}`);
    }
  }

  // Validate amount
  protected validateAmount(amountCents: number, currency: string): void {
    if (amountCents <= 0) {
      throw new Error('Amount must be greater than zero');
    }

    // Provider-specific minimum amounts
    const minimums: Record<string, number> = {
      'USD': 50, // $0.50
      'EUR': 50, // €0.50
      'GBP': 30, // £0.30
      'JPY': 50, // ¥50
    };

    const minimum = minimums[currency.toUpperCase()] || 50;

    if (amountCents < minimum) {
      throw new Error(`Minimum amount for ${currency} is ${minimum} cents`);
    }
  }
}
