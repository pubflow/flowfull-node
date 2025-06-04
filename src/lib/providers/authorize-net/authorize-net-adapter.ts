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
import { AuthorizeNetHttpClient } from './authorize-net-client';
import {
  AuthorizeNetConfig,
  AuthorizeNetTransactionType,
  AuthorizeNetTransactionRequest,
  AuthorizeNetTransactionResponse,
  AuthorizeNetCreateCustomerProfileRequest,
  AuthorizeNetCreatePaymentProfileRequest,
  AuthorizeNetCreditCard,
  AuthorizeNetBankAccount
} from './types';
import {
  mapAuthorizeNetStatusToPaymentIntent,
  mapPaymentMethodTypeToAuthorizeNet,
  mapAuthorizeNetPaymentMethodToType,
  mapBillingDetailsToAuthorizeNet,
  mapAuthorizeNetToBillingDetails,
  formatExpirationDate,
  parseExpirationDate,
  getCardBrand,
  getLastFourDigits,
  formatAmount,
  parseAmount,
  mapAuthorizeNetError,
  validateCurrency,
  validateAmount,
  generateCustomerId,
  generatePaymentMethodId,
  generatePaymentIntentId,
  extractAuthorizationData,
  createCaptureData,
  mapWebhookEventType
} from './utils';

export class AuthorizeNetAdapter extends PaymentAdapter {
  private client: AuthorizeNetHttpClient;

  constructor(config: PaymentAdapterConfig) {
    super(config);

    console.log('🔧 Initializing Authorize.Net adapter...');
    console.log('🔑 API Login ID:', config.api_key ? `${config.api_key.substring(0, 15)}...` : 'NOT SET');
    console.log('🌍 Environment:', config.environment);

    const authorizeNetConfig: AuthorizeNetConfig = {
      apiLoginId: config.api_key,
      transactionKey: config.secret_key || '',
      environment: config.environment as 'sandbox' | 'production',
      signatureKey: config.additional_config?.signature_key
    };

    this.client = new AuthorizeNetHttpClient(authorizeNetConfig);
  }

  getCapabilities(): PaymentAdapterCapabilities {
    return {
      supports_payment_intents: true,
      supports_saved_payment_methods: true, // CIM support
      supports_customers: true, // CIM support
      supports_refunds: true,
      supports_webhooks: true,
      supports_subscriptions: false, // ARB not implemented yet
      supports_3d_secure: false, // Cardinal Commerce integration not implemented
      supports_manual_capture: true,
      supports_multiple_captures: false, // Authorize.Net limitation
      supported_currencies: ['USD'], // Primary currency
      supported_payment_methods: [
        PaymentMethodType.CREDIT_CARD,
        PaymentMethodType.DEBIT_CARD,
        PaymentMethodType.BANK_ACCOUNT // eCheck
        // No digital wallets (Apple Pay, Google Pay)
      ]
    };
  }

  async createPaymentIntent(request: CreatePaymentIntentRequest): Promise<PaymentIntent> {
    console.log('🔄 Creating Authorize.Net payment intent...');
    console.log('🔑 Using API Login ID from config:', this.config.api_key ? `${this.config.api_key.substring(0, 20)}...` : 'NOT SET');

    validateCurrency(request.currency);
    validateAmount(request.amount_cents, request.currency);

    // Generate unique payment intent ID
    const paymentIntentId = generatePaymentIntentId();

    // Determine transaction type based on capture method
    const transactionType = request.capture_method === 'manual' 
      ? AuthorizeNetTransactionType.AUTH_ONLY 
      : AuthorizeNetTransactionType.AUTH_CAPTURE;

    console.log(`🔒 Creating payment intent with ${request.capture_method === 'manual' ? 'manual capture (authorization)' : 'automatic capture'}`);

    // Build transaction request
    const transactionRequest: AuthorizeNetTransactionRequest = {
      transactionType,
      amount: formatAmount(request.amount_cents),
      order: {
        invoiceNumber: request.metadata?.invoice_number,
        description: request.description || 'Payment'
      },
      customer: request.customer_id ? {
        id: request.customer_id,
        email: request.metadata?.customer_email
      } : undefined,
      customerIP: request.metadata?.customer_ip
    };

    // Add payment method if provided
    if (request.payment_method_id) {
      // If payment method ID is provided, it should be a CIM profile
      const profileIds = this.parsePaymentMethodId(request.payment_method_id);
      transactionRequest.profile = {
        customerProfileId: profileIds.customerProfileId,
        paymentProfileId: profileIds.paymentProfileId
      };
    }

    // Add billing details if provided
    if (request.billing_details) {
      transactionRequest.billTo = mapBillingDetailsToAuthorizeNet(request.billing_details);
    }

    try {
      let response;
      
      if (request.confirm && request.payment_method_id) {
        // If confirming with existing payment method, process immediately
        response = await this.client.createTransaction(transactionRequest);
      } else {
        // For new payment methods or non-confirmed intents, we need to store the intent
        // and wait for confirmation with payment details
        return this.createPendingPaymentIntent(paymentIntentId, request);
      }

      return this.mapAuthorizeNetResponseToPaymentIntent(response, paymentIntentId, request);
    } catch (error) {
      throw mapAuthorizeNetError(error);
    }
  }

  async getPaymentIntent(id: string): Promise<PaymentIntent> {
    console.log('📋 Getting Authorize.Net payment intent:', id);

    try {
      // Extract transaction ID from payment intent ID
      const transactionId = this.extractTransactionId(id);
      
      if (!transactionId) {
        // If no transaction ID, this might be a pending intent
        return this.getPendingPaymentIntent(id);
      }

      const response = await this.client.getTransactionDetails(transactionId);
      
      if (response.messages?.resultCode !== 'Ok') {
        throw new Error(`Failed to get transaction details: ${response.messages?.message?.[0]?.description}`);
      }

      return this.mapTransactionDetailsToPaymentIntent(response.transaction, id);
    } catch (error) {
      throw mapAuthorizeNetError(error);
    }
  }

  async updatePaymentIntent(id: string, updates: Partial<CreatePaymentIntentRequest>): Promise<PaymentIntent> {
    console.log('🔄 Updating Authorize.Net payment intent...');
    console.log('📝 Updates:', updates);

    // Get existing payment intent
    const existingIntent = await this.getPaymentIntent(id);

    // Create updated request
    const updatedRequest: CreatePaymentIntentRequest = {
      amount_cents: updates.amount_cents || existingIntent.amount_cents,
      currency: updates.currency || existingIntent.currency,
      description: updates.description || existingIntent.metadata?.description,
      customer_id: updates.customer_id || existingIntent.customer_id,
      payment_method_id: updates.payment_method_id || existingIntent.payment_method_id,
      metadata: { ...existingIntent.metadata, ...updates.metadata },
      capture_method: updates.capture_method || existingIntent.metadata?.capture_method || 'automatic',
      return_url: updates.return_url,
      cancel_url: updates.cancel_url,
      confirm: updates.confirm
    };

    // For Authorize.Net, we typically need to create a new transaction
    // since most transaction details cannot be updated after creation
    return this.createPaymentIntent(updatedRequest);
  }

  async confirmPaymentIntent(request: ConfirmPaymentIntentRequest): Promise<PaymentIntent> {
    console.log('✅ Confirming Authorize.Net payment intent...');

    try {
      // Get the pending payment intent
      const pendingIntent = await this.getPendingPaymentIntent(request.payment_intent_id);
      
      // Build transaction request from pending intent and confirmation request
      const transactionRequest: AuthorizeNetTransactionRequest = {
        transactionType: pendingIntent.metadata?.capture_method === 'manual' 
          ? AuthorizeNetTransactionType.AUTH_ONLY 
          : AuthorizeNetTransactionType.AUTH_CAPTURE,
        amount: formatAmount(pendingIntent.amount_cents),
        order: {
          description: pendingIntent.metadata?.description || 'Payment'
        },
        customer: pendingIntent.customer_id ? {
          id: pendingIntent.customer_id
        } : undefined
      };

      // Add payment method from confirmation request
      if (request.payment_method_id) {
        const profileIds = this.parsePaymentMethodId(request.payment_method_id);
        transactionRequest.profile = {
          customerProfileId: profileIds.customerProfileId,
          paymentProfileId: profileIds.paymentProfileId
        };
      }

      const response = await this.client.createTransaction(transactionRequest);
      return this.mapAuthorizeNetResponseToPaymentIntent(response, request.payment_intent_id, pendingIntent);
    } catch (error) {
      throw mapAuthorizeNetError(error);
    }
  }

  async cancelPaymentIntent(id: string): Promise<PaymentIntent> {
    console.log('❌ Canceling Authorize.Net payment intent...');

    try {
      const existingIntent = await this.getPaymentIntent(id);
      
      // Extract transaction ID
      const transactionId = this.extractTransactionId(id);
      
      if (transactionId && existingIntent.status === PaymentIntentStatus.REQUIRES_CONFIRMATION) {
        // If transaction exists and is authorized, void it
        await this.client.voidTransaction(transactionId);
      }

      // Update status to canceled
      return {
        ...existingIntent,
        status: PaymentIntentStatus.CANCELED
      };
    } catch (error) {
      throw mapAuthorizeNetError(error);
    }
  }

  async capturePaymentIntent(id: string, amount_cents?: number): Promise<PaymentIntent> {
    console.log('💰 Capturing Authorize.Net payment intent:', id);

    try {
      const existingIntent = await this.getPaymentIntent(id);

      // Extract transaction ID from authorization
      const authData = existingIntent.metadata?.authorization ?
        JSON.parse(existingIntent.metadata.authorization) : null;

      if (!authData?.authorize_net_specific?.transaction_id) {
        throw new Error('No authorization found for capture');
      }

      const transactionId = authData.authorize_net_specific.transaction_id;
      const captureAmount = amount_cents || existingIntent.amount_cents;

      if (amount_cents && amount_cents !== existingIntent.amount_cents) {
        throw new Error('Authorize.Net does not support partial captures. Amount must match the authorized amount.');
      }

      console.log(`💰 Full capture of ${captureAmount} cents`);

      // Create prior auth capture transaction
      const transactionRequest: AuthorizeNetTransactionRequest = {
        transactionType: AuthorizeNetTransactionType.PRIOR_AUTH_CAPTURE,
        amount: formatAmount(captureAmount),
        refTransId: transactionId
      };

      const response = await this.client.createTransaction(transactionRequest);

      // Update metadata with capture information
      const captureData = createCaptureData(response.transactionResponse!, captureAmount);
      const updatedMetadata = {
        ...existingIntent.metadata,
        captures: JSON.stringify([captureData]),
        captured_amount_cents: captureAmount,
        remaining_amount_cents: 0,
        capture_status: 'fully_captured'
      };

      return {
        ...existingIntent,
        status: PaymentIntentStatus.SUCCEEDED,
        metadata: updatedMetadata,
        provider_data: {
          ...existingIntent.provider_data,
          capture_response: response
        }
      };
    } catch (error) {
      throw mapAuthorizeNetError(error);
    }
  }

  // Customer Management (CIM)
  async createCustomer(request: CreateCustomerRequest): Promise<Customer> {
    console.log('👤 Creating Authorize.Net customer...');

    const customerProfile: AuthorizeNetCreateCustomerProfileRequest = {
      profile: {
        merchantCustomerId: generateCustomerId(),
        description: request.name || 'Customer',
        email: request.email
      },
      validationMode: 'none'
    };

    try {
      const response = await this.client.createCustomerProfile(customerProfile);

      if (response.messages.resultCode !== 'Ok') {
        throw new Error(`Failed to create customer: ${response.messages.message[0]?.description}`);
      }

      return {
        id: response.customerProfileId!,
        email: request.email,
        name: request.name,
        phone: request.phone,
        provider_data: {
          customer_profile_id: response.customerProfileId,
          merchant_customer_id: customerProfile.profile.merchantCustomerId,
          created_at: new Date().toISOString(),
          metadata: request.metadata || {}
        }
      };
    } catch (error) {
      throw mapAuthorizeNetError(error);
    }
  }

  async getCustomer(id: string): Promise<Customer> {
    console.log('📋 Getting Authorize.Net customer:', id);

    try {
      const response = await this.client.getCustomerProfile(id);

      if (response.messages?.resultCode !== 'Ok') {
        throw new Error(`Failed to get customer: ${response.messages?.message?.[0]?.description}`);
      }

      const profile = response.profile;
      return {
        id: profile.customerProfileId,
        email: profile.email || '',
        name: profile.description || '',
        phone: undefined, // Not stored in customer profile
        default_payment_method: profile.paymentProfiles?.[0]?.customerPaymentProfileId,
        provider_data: profile
      };
    } catch (error) {
      throw mapAuthorizeNetError(error);
    }
  }

  async updateCustomer(id: string, updates: Partial<CreateCustomerRequest>): Promise<Customer> {
    console.log('📝 Updating Authorize.Net customer:', id);

    try {
      // Get existing customer
      const existingCustomer = await this.getCustomer(id);

      // Build updated profile
      const updatedProfile = {
        customerProfileId: id,
        merchantCustomerId: existingCustomer.provider_data?.merchantCustomerId,
        description: updates.name || existingCustomer.name,
        email: updates.email || existingCustomer.email
      };

      const response = await this.client.updateCustomerProfile(id, updatedProfile);

      if (response.messages?.resultCode !== 'Ok') {
        throw new Error(`Failed to update customer: ${response.messages?.message?.[0]?.description}`);
      }

      return {
        ...existingCustomer,
        email: updates.email || existingCustomer.email,
        name: updates.name || existingCustomer.name,
        phone: updates.phone || existingCustomer.phone
      };
    } catch (error) {
      throw mapAuthorizeNetError(error);
    }
  }

  async deleteCustomer(id: string): Promise<void> {
    console.log('🗑️ Deleting Authorize.Net customer:', id);

    try {
      const response = await this.client.deleteCustomerProfile(id);

      if (response.messages?.resultCode !== 'Ok') {
        throw new Error(`Failed to delete customer: ${response.messages?.message?.[0]?.description}`);
      }
    } catch (error) {
      throw mapAuthorizeNetError(error);
    }
  }

  // Payment Method Management (CIM)
  async createPaymentMethod(request: CreatePaymentMethodRequest): Promise<PaymentMethod> {
    console.log('💳 Creating Authorize.Net payment method...');

    if (!request.customer_id) {
      throw new Error('Customer ID is required for Authorize.Net payment methods');
    }

    const paymentMethodId = generatePaymentMethodId();

    // Build payment profile
    const paymentProfile: AuthorizeNetCreatePaymentProfileRequest = {
      customerProfileId: request.customer_id,
      paymentProfile: {
        customerType: 'individual',
        payment: {}
      },
      validationMode: 'testMode' // Validate the payment method
    };

    // Add payment details based on type
    if (request.type === PaymentMethodType.CREDIT_CARD || request.type === PaymentMethodType.DEBIT_CARD) {
      if (!request.card) {
        throw new Error('Card details are required for credit/debit card payment methods');
      }

      const creditCard: AuthorizeNetCreditCard = {
        cardNumber: request.card.number,
        expirationDate: formatExpirationDate(request.card.exp_month, request.card.exp_year),
        cardCode: request.card.cvc
      };

      paymentProfile.paymentProfile.payment.creditCard = creditCard;
    } else if (request.type === PaymentMethodType.BANK_ACCOUNT) {
      if (!request.bank_account) {
        throw new Error('Bank account details are required for bank account payment methods');
      }

      const bankAccount: AuthorizeNetBankAccount = {
        accountType: request.bank_account.account_type as 'checking' | 'savings' | 'businessChecking',
        routingNumber: request.bank_account.routing_number,
        accountNumber: request.bank_account.account_number,
        nameOnAccount: request.bank_account.account_holder_name,
        bankName: request.bank_account.bank_name,
        echeckType: 'WEB' // Default for web transactions
      };

      paymentProfile.paymentProfile.payment.bankAccount = bankAccount;
    } else {
      throw new Error(`Unsupported payment method type: ${request.type}`);
    }

    // Add billing details
    if (request.billing_details) {
      paymentProfile.paymentProfile.billTo = mapBillingDetailsToAuthorizeNet(request.billing_details);
    }

    try {
      const response = await this.client.createPaymentProfile(paymentProfile);

      if (response.messages.resultCode !== 'Ok') {
        throw new Error(`Failed to create payment method: ${response.messages.message[0]?.description}`);
      }

      return this.mapAuthorizeNetPaymentProfileToPaymentMethod(
        response.customerPaymentProfileId!,
        request.customer_id,
        paymentProfile.paymentProfile,
        request.type
      );
    } catch (error) {
      throw mapAuthorizeNetError(error);
    }
  }

  async getPaymentMethod(id: string): Promise<PaymentMethod> {
    console.log('📋 Getting Authorize.Net payment method:', id);

    try {
      const profileIds = this.parsePaymentMethodId(id);
      const response = await this.client.getPaymentProfile(
        profileIds.customerProfileId,
        profileIds.paymentProfileId
      );

      if (response.messages?.resultCode !== 'Ok') {
        throw new Error(`Failed to get payment method: ${response.messages?.message?.[0]?.description}`);
      }

      return this.mapAuthorizeNetPaymentProfileToPaymentMethod(
        profileIds.paymentProfileId,
        profileIds.customerProfileId,
        response.paymentProfile
      );
    } catch (error) {
      throw mapAuthorizeNetError(error);
    }
  }

  async attachPaymentMethodToCustomer(payment_method_id: string, customer_id: string): Promise<PaymentMethod> {
    // For Authorize.Net, payment methods are always attached to customers via CIM
    // This method is essentially a no-op since payment methods are created with customer association
    return this.getPaymentMethod(payment_method_id);
  }

  async detachPaymentMethodFromCustomer(payment_method_id: string): Promise<PaymentMethod> {
    // For Authorize.Net, detaching means deleting the payment profile
    // We'll return the payment method before deletion
    const paymentMethod = await this.getPaymentMethod(payment_method_id);
    await this.deletePaymentMethod(payment_method_id);
    return paymentMethod;
  }

  async deletePaymentMethod(payment_method_id: string, customer_id?: string): Promise<void> {
    console.log('🗑️ Deleting Authorize.Net payment method:', payment_method_id);

    try {
      const profileIds = this.parsePaymentMethodId(payment_method_id);
      const response = await this.client.deletePaymentProfile(
        profileIds.customerProfileId,
        profileIds.paymentProfileId
      );

      if (response.messages?.resultCode !== 'Ok') {
        throw new Error(`Failed to delete payment method: ${response.messages?.message?.[0]?.description}`);
      }
    } catch (error) {
      throw mapAuthorizeNetError(error);
    }
  }

  async listCustomerPaymentMethods(customer_id: string): Promise<PaymentMethod[]> {
    console.log('📋 Listing Authorize.Net customer payment methods:', customer_id);

    try {
      const response = await this.client.getCustomerProfile(customer_id);

      if (response.messages?.resultCode !== 'Ok') {
        throw new Error(`Failed to get customer payment methods: ${response.messages?.message?.[0]?.description}`);
      }

      const paymentProfiles = response.profile?.paymentProfiles || [];

      return paymentProfiles.map(profile =>
        this.mapAuthorizeNetPaymentProfileToPaymentMethod(
          profile.customerPaymentProfileId,
          customer_id,
          profile
        )
      );
    } catch (error) {
      throw mapAuthorizeNetError(error);
    }
  }

  // Refund Management
  async refundPayment(request: RefundRequest): Promise<RefundResponse> {
    console.log('💰 Creating Authorize.Net refund...');

    try {
      // Get the original payment to extract transaction details
      const originalPayment = await this.getPaymentIntent(request.payment_intent_id);

      // Extract transaction ID from captures or provider data
      let transactionId: string | undefined;

      if (originalPayment.metadata?.captures) {
        const captures = JSON.parse(originalPayment.metadata.captures);
        transactionId = captures[0]?.provider_capture_id;
      }

      if (!transactionId && originalPayment.provider_data?.transactionResponse?.transId) {
        transactionId = originalPayment.provider_data.transactionResponse.transId;
      }

      if (!transactionId) {
        throw new Error('No transaction ID found for refund');
      }

      const refundAmount = request.amount_cents || originalPayment.amount_cents;

      // For Authorize.Net, we need the last 4 digits of the card for refunds
      let payment: any = undefined;
      if (originalPayment.provider_data?.payment) {
        payment = originalPayment.provider_data.payment;
      }

      const response = await this.client.refundTransaction(
        transactionId,
        formatAmount(refundAmount),
        payment
      );

      if (response.messages?.resultCode !== 'Ok') {
        throw new Error(`Failed to create refund: ${response.messages?.message?.[0]?.description}`);
      }

      const refundId = `re_authnet_${Date.now()}_${Math.random().toString(36).substring(2, 11)}`;

      return {
        id: refundId,
        payment_intent_id: request.payment_intent_id,
        amount_cents: refundAmount,
        currency: originalPayment.currency,
        status: 'succeeded', // Authorize.Net refunds are typically immediate
        reason: request.reason,
        created_at: new Date().toISOString(),
        provider_data: {
          transaction_id: response.transactionResponse?.transId,
          refund_transaction_id: response.transactionResponse?.transId,
          auth_code: response.transactionResponse?.authCode,
          response_code: response.transactionResponse?.responseCode
        }
      };
    } catch (error) {
      throw mapAuthorizeNetError(error);
    }
  }

  async getRefund(id: string): Promise<RefundResponse> {
    console.log('📋 Getting Authorize.Net refund:', id);

    try {
      // Extract transaction ID from refund ID
      const transactionId = this.extractTransactionId(id);

      if (!transactionId) {
        throw new Error('Invalid refund ID format');
      }

      const response = await this.client.getTransactionDetails(transactionId);

      if (response.messages?.resultCode !== 'Ok') {
        throw new Error(`Failed to get refund details: ${response.messages?.message?.[0]?.description}`);
      }

      const transaction = response.transaction;

      return {
        id,
        payment_intent_id: transaction.refTransId || '', // Original transaction ID
        amount_cents: parseAmount(transaction.settleAmount || transaction.authAmount || '0'),
        currency: 'USD', // Authorize.Net primarily uses USD
        status: 'succeeded',
        reason: 'requested_by_customer',
        created_at: transaction.submitTimeUTC || new Date().toISOString(),
        provider_data: transaction
      };
    } catch (error) {
      throw mapAuthorizeNetError(error);
    }
  }

  // Webhook Management
  async verifyWebhook(payload: string, signature: string): Promise<WebhookEvent> {
    console.log('🔍 Verifying Authorize.Net webhook...');

    try {
      // Verify signature
      const headers = { 'x-anet-signature': signature };
      const isValid = this.client.verifyWebhookSignature(headers, payload);

      if (!isValid) {
        throw new Error('Invalid webhook signature');
      }

      // Parse webhook payload
      const webhookData = this.client.parseWebhookPayload(payload);

      // Map to standard webhook event
      const event: WebhookEvent = {
        id: webhookData.notificationId,
        type: mapWebhookEventType(webhookData.eventType),
        data: webhookData.payload,
        created: new Date(webhookData.eventDate).getTime() / 1000
      };

      console.log('✅ Webhook verified successfully:', event.type);
      return event;
    } catch (error) {
      throw mapAuthorizeNetError(error);
    }
  }

  // Health Check
  async healthCheck(): Promise<{ success: boolean; latency?: number; error?: string }> {
    console.log('🏥 Performing Authorize.Net health check...');
    return this.client.healthCheck();
  }

  // Private Helper Methods
  private createPendingPaymentIntent(id: string, request: CreatePaymentIntentRequest): PaymentIntent {
    return {
      id,
      amount_cents: request.amount_cents,
      currency: request.currency,
      status: PaymentIntentStatus.REQUIRES_CONFIRMATION,
      customer_id: request.customer_id,
      payment_method_id: request.payment_method_id,
      metadata: {
        ...request.metadata,
        description: request.description,
        capture_method: request.capture_method || 'automatic',
        created_at: new Date().toISOString()
      },
      provider_data: {
        pending: true,
        original_request: request
      }
    };
  }

  private async getPendingPaymentIntent(id: string): Promise<PaymentIntent> {
    // In a real implementation, this would retrieve from a cache or database
    // For now, we'll throw an error as this is a simplified implementation
    throw new Error('Pending payment intent not found. This requires database integration.');
  }

  private mapAuthorizeNetResponseToPaymentIntent(
    response: any,
    paymentIntentId: string,
    originalRequest?: any
  ): PaymentIntent {
    const transactionResponse = response.transactionResponse;

    if (!transactionResponse) {
      throw new Error('No transaction response received');
    }

    const status = mapAuthorizeNetStatusToPaymentIntent(
      transactionResponse.responseCode,
      originalRequest?.transactionType
    );

    // Extract authorization data if this was an auth-only transaction
    const authData = originalRequest?.transactionType === AuthorizeNetTransactionType.AUTH_ONLY
      ? extractAuthorizationData(transactionResponse, originalRequest?.amount_cents || 0)
      : null;

    // Extract capture data if this was an auth-capture transaction
    const captureData = originalRequest?.transactionType === AuthorizeNetTransactionType.AUTH_CAPTURE
      ? createCaptureData(transactionResponse, originalRequest?.amount_cents || 0)
      : null;

    const metadata: Record<string, any> = {
      ...originalRequest?.metadata,
      transaction_id: transactionResponse.transId,
      auth_code: transactionResponse.authCode,
      avs_result: transactionResponse.avsResultCode,
      cvv_result: transactionResponse.cvvResultCode
    };

    if (authData) {
      metadata.authorization = JSON.stringify(authData);
      metadata.authorized_amount_cents = authData.amount_cents;
      metadata.captured_amount_cents = 0;
      metadata.remaining_amount_cents = authData.amount_cents;
      metadata.capture_method = 'manual';
      metadata.capture_status = 'not_captured';
    }

    if (captureData) {
      metadata.captures = JSON.stringify([captureData]);
      metadata.captured_amount_cents = captureData.amount_cents;
      metadata.remaining_amount_cents = 0;
      metadata.capture_status = 'fully_captured';
    }

    return {
      id: paymentIntentId,
      amount_cents: originalRequest?.amount_cents || parseAmount(transactionResponse.authAmount || '0'),
      currency: 'USD',
      status,
      customer_id: originalRequest?.customer_id,
      payment_method_id: originalRequest?.payment_method_id,
      metadata,
      provider_data: {
        transaction_response: transactionResponse,
        messages: response.messages,
        authorization_data: authData,
        capture_data: captureData
      }
    };
  }

  private mapTransactionDetailsToPaymentIntent(transaction: any, paymentIntentId: string): PaymentIntent {
    const status = mapAuthorizeNetStatusToPaymentIntent(transaction.responseCode);

    return {
      id: paymentIntentId,
      amount_cents: parseAmount(transaction.authAmount || transaction.settleAmount || '0'),
      currency: 'USD',
      status,
      metadata: {
        transaction_id: transaction.transId,
        auth_code: transaction.authCode,
        avs_result: transaction.AVSResponse,
        cvv_result: transaction.cardCodeResponse,
        submit_time: transaction.submitTimeUTC,
        settle_time: transaction.settleTimeUTC
      },
      provider_data: transaction
    };
  }

  private mapAuthorizeNetPaymentProfileToPaymentMethod(
    paymentProfileId: string,
    customerProfileId: string,
    profile: any,
    type?: PaymentMethodType
  ): PaymentMethod {
    const paymentMethodId = `${customerProfileId}:${paymentProfileId}`;

    let paymentMethodType = type;
    let card: any = undefined;

    if (profile.payment?.creditCard) {
      paymentMethodType = PaymentMethodType.CREDIT_CARD;
      const creditCard = profile.payment.creditCard;
      const { expMonth, expYear } = parseExpirationDate(creditCard.expirationDate || '0000');

      card = {
        brand: getCardBrand(creditCard.cardNumber || ''),
        last_four: getLastFourDigits(creditCard.cardNumber || ''),
        exp_month: expMonth,
        exp_year: expYear
      };
    } else if (profile.payment?.bankAccount) {
      paymentMethodType = PaymentMethodType.BANK_ACCOUNT;
    }

    return {
      id: paymentMethodId,
      type: paymentMethodType || PaymentMethodType.CREDIT_CARD,
      card,
      billing_details: profile.billTo ? mapAuthorizeNetToBillingDetails(profile.billTo) : undefined,
      provider_data: {
        customer_profile_id: customerProfileId,
        payment_profile_id: paymentProfileId,
        profile
      }
    };
  }

  private parsePaymentMethodId(paymentMethodId: string): { customerProfileId: string; paymentProfileId: string } {
    const parts = paymentMethodId.split(':');
    if (parts.length !== 2) {
      throw new Error('Invalid payment method ID format');
    }

    return {
      customerProfileId: parts[0],
      paymentProfileId: parts[1]
    };
  }

  private extractTransactionId(id: string): string | null {
    // Extract transaction ID from various ID formats
    if (id.includes('_')) {
      const parts = id.split('_');
      return parts[parts.length - 1];
    }

    return id;
  }
}
