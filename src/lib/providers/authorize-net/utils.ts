import {
  PaymentIntentStatus,
  PaymentMethodType,
  BillingDetails
} from '../base/payment-adapter';
import {
  AuthorizeNetTransactionStatus,
  AuthorizeNetTransactionResponse,
  AuthorizeNetBillTo,
  AuthorizeNetCreditCard,
  AuthorizeNetBankAccount,
  AuthorizeNetMessage,
  AuthorizeNetError
} from './types';

// Map Authorize.Net transaction status to PaymentIntentStatus
export function mapAuthorizeNetStatusToPaymentIntent(responseCode: string, transactionType?: string): PaymentIntentStatus {
  switch (responseCode) {
    case AuthorizeNetTransactionStatus.APPROVED:
      // For authorization-only transactions, status should be 'requires_capture'
      if (transactionType === 'authOnlyTransaction') {
        return PaymentIntentStatus.REQUIRES_CONFIRMATION; // Will be updated to custom status
      }
      return PaymentIntentStatus.SUCCEEDED;
    
    case AuthorizeNetTransactionStatus.DECLINED:
      return PaymentIntentStatus.FAILED;
    
    case AuthorizeNetTransactionStatus.ERROR:
      return PaymentIntentStatus.FAILED;
    
    case AuthorizeNetTransactionStatus.HELD_FOR_REVIEW:
      return PaymentIntentStatus.REQUIRES_ACTION;
    
    default:
      return PaymentIntentStatus.PENDING;
  }
}

// Map PaymentMethodType to Authorize.Net payment method
export function mapPaymentMethodTypeToAuthorizeNet(type: PaymentMethodType): 'creditCard' | 'bankAccount' {
  switch (type) {
    case PaymentMethodType.CREDIT_CARD:
    case PaymentMethodType.DEBIT_CARD:
      return 'creditCard';
    
    case PaymentMethodType.BANK_ACCOUNT:
      return 'bankAccount';
    
    default:
      throw new Error(`Unsupported payment method type: ${type}`);
  }
}

// Map Authorize.Net payment method to PaymentMethodType
export function mapAuthorizeNetPaymentMethodToType(payment: any): PaymentMethodType {
  if (payment.creditCard) {
    return PaymentMethodType.CREDIT_CARD;
  } else if (payment.bankAccount) {
    return PaymentMethodType.BANK_ACCOUNT;
  }
  
  throw new Error('Unknown Authorize.Net payment method type');
}

// Map BillingDetails to AuthorizeNetBillTo
export function mapBillingDetailsToAuthorizeNet(billing: BillingDetails): AuthorizeNetBillTo {
  const billTo: AuthorizeNetBillTo = {};

  if (billing.name) {
    const nameParts = billing.name.split(' ');
    billTo.firstName = nameParts[0] || '';
    billTo.lastName = nameParts.slice(1).join(' ') || '';
  }

  if (billing.email) {
    // Authorize.Net doesn't have email in billTo, handle separately
  }

  if (billing.phone) {
    billTo.phoneNumber = billing.phone;
  }

  if (billing.address) {
    billTo.address = billing.address.line1;
    billTo.city = billing.address.city;
    billTo.state = billing.address.state;
    billTo.zip = billing.address.postal_code;
    billTo.country = billing.address.country;
  }

  return billTo;
}

// Map AuthorizeNetBillTo to BillingDetails
export function mapAuthorizeNetToBillingDetails(billTo: AuthorizeNetBillTo): BillingDetails {
  const billing: BillingDetails = {};

  if (billTo.firstName || billTo.lastName) {
    billing.name = `${billTo.firstName || ''} ${billTo.lastName || ''}`.trim();
  }

  if (billTo.phoneNumber) {
    billing.phone = billTo.phoneNumber;
  }

  if (billTo.address || billTo.city || billTo.state || billTo.zip || billTo.country) {
    billing.address = {
      line1: billTo.address || '',
      line2: undefined,
      city: billTo.city || '',
      state: billTo.state,
      postal_code: billTo.zip || '',
      country: billTo.country || 'US'
    };
  }

  return billing;
}

// Format credit card expiration date for Authorize.Net (MMYY)
export function formatExpirationDate(expMonth: number, expYear: number): string {
  const month = expMonth.toString().padStart(2, '0');
  const year = expYear.toString().slice(-2); // Last 2 digits
  return `${month}${year}`;
}

// Parse Authorize.Net expiration date (MMYY) to month/year
export function parseExpirationDate(expirationDate: string): { expMonth: number; expYear: number } {
  if (expirationDate.length !== 4) {
    throw new Error('Invalid expiration date format');
  }

  const expMonth = parseInt(expirationDate.substring(0, 2), 10);
  const expYear = parseInt(`20${expirationDate.substring(2, 4)}`, 10);

  return { expMonth, expYear };
}

// Get card brand from card number
export function getCardBrand(cardNumber: string): string {
  const number = cardNumber.replace(/\D/g, '');
  
  if (/^4/.test(number)) {
    return 'visa';
  } else if (/^5[1-5]/.test(number) || /^2[2-7]/.test(number)) {
    return 'mastercard';
  } else if (/^3[47]/.test(number)) {
    return 'amex';
  } else if (/^6(?:011|5)/.test(number)) {
    return 'discover';
  } else if (/^35/.test(number)) {
    return 'jcb';
  } else if (/^30[0-5]/.test(number) || /^36/.test(number) || /^38/.test(number)) {
    return 'diners';
  }
  
  return 'unknown';
}

// Get last 4 digits of card number
export function getLastFourDigits(cardNumber: string): string {
  const number = cardNumber.replace(/\D/g, '');
  return number.slice(-4);
}

// Format amount for Authorize.Net (string with 2 decimal places)
export function formatAmount(amountCents: number): string {
  return (amountCents / 100).toFixed(2);
}

// Parse amount from Authorize.Net (string) to cents
export function parseAmount(amount: string): number {
  return Math.round(parseFloat(amount) * 100);
}

// Map Authorize.Net error to standard error
export function mapAuthorizeNetError(error: any): Error {
  if (error.messages && error.messages.message) {
    const messages = Array.isArray(error.messages.message) 
      ? error.messages.message 
      : [error.messages.message];
    
    const errorMessage = messages
      .map((msg: AuthorizeNetMessage) => `${msg.code}: ${msg.description}`)
      .join('; ');
    
    return new Error(`Authorize.Net Error: ${errorMessage}`);
  }

  if (error.transactionResponse && error.transactionResponse.errors) {
    const errors = Array.isArray(error.transactionResponse.errors)
      ? error.transactionResponse.errors
      : [error.transactionResponse.errors];
    
    const errorMessage = errors
      .map((err: AuthorizeNetError) => `${err.errorCode}: ${err.errorText}`)
      .join('; ');
    
    return new Error(`Authorize.Net Transaction Error: ${errorMessage}`);
  }

  if (typeof error === 'string') {
    return new Error(`Authorize.Net Error: ${error}`);
  }

  if (error instanceof Error) {
    return error;
  }

  return new Error('Unknown Authorize.Net error');
}

// Validate currency support
export function validateCurrency(currency: string): void {
  const supportedCurrencies = ['USD']; // Authorize.Net primarily supports USD
  
  if (!supportedCurrencies.includes(currency.toUpperCase())) {
    throw new Error(`Currency ${currency} is not supported by Authorize.Net. Supported currencies: ${supportedCurrencies.join(', ')}`);
  }
}

// Validate amount
export function validateAmount(amountCents: number, currency: string): void {
  if (amountCents < 1) {
    throw new Error('Amount must be at least 1 cent');
  }

  // Authorize.Net has a maximum transaction amount
  const maxAmount = 99999999; // $999,999.99 in cents
  if (amountCents > maxAmount) {
    throw new Error(`Amount exceeds maximum allowed: $${maxAmount / 100}`);
  }
}

// Generate unique customer ID for Authorize.Net
export function generateCustomerId(): string {
  return `cust_${Date.now()}_${Math.random().toString(36).substring(2, 11)}`;
}

// Generate unique payment method ID
export function generatePaymentMethodId(): string {
  return `pm_authnet_${Date.now()}_${Math.random().toString(36).substring(2, 11)}`;
}

// Generate unique payment intent ID
export function generatePaymentIntentId(): string {
  return `pi_authnet_${Date.now()}_${Math.random().toString(36).substring(2, 11)}`;
}

// Extract authorization data from transaction response
export function extractAuthorizationData(response: AuthorizeNetTransactionResponse, amount: number) {
  return {
    amount_cents: amount,
    expires_at: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(), // 30 days
    capture_method: 'manual',
    provider_auth_id: response.transId || '',
    authorize_net_specific: {
      transaction_id: response.transId || '',
      auth_code: response.authCode || '',
      avs_result: response.avsResultCode || '',
      cvv_result: response.cvvResultCode || '',
      cavv_result: response.cavvResultCode || '',
      network_trans_id: response.networkTransId || '',
      account_number: response.accountNumber || '',
      account_type: response.accountType || ''
    }
  };
}

// Create capture data
export function createCaptureData(response: AuthorizeNetTransactionResponse, amount: number) {
  const captureId = `cap_${Date.now()}_${Math.random().toString(36).substring(2, 11)}`;
  
  return {
    id: captureId,
    amount_cents: amount,
    captured_at: new Date().toISOString(),
    provider_capture_id: response.transId || '',
    settlement_state: 'pending' // Will be updated via webhooks
  };
}

// Map webhook event type to Bridge-Payments event type
export function mapWebhookEventType(authorizeNetEventType: string): string {
  const eventMapping: Record<string, string> = {
    'net.authorize.payment.authorization.created': 'payment.authorized',
    'net.authorize.payment.capture.created': 'payment.succeeded',
    'net.authorize.payment.void.created': 'payment.canceled',
    'net.authorize.payment.refund.created': 'payment.refunded',
    'net.authorize.payment.authcapture.created': 'payment.succeeded',
    'net.authorize.payment.settlement.created': 'payment.settled',
    'net.authorize.customer.created': 'customer.created',
    'net.authorize.customer.updated': 'customer.updated',
    'net.authorize.customer.deleted': 'customer.deleted',
    'net.authorize.customer.paymentProfile.created': 'payment_method.attached',
    'net.authorize.customer.paymentProfile.updated': 'payment_method.updated',
    'net.authorize.customer.paymentProfile.deleted': 'payment_method.detached'
  };

  return eventMapping[authorizeNetEventType] || 'unknown';
}

// Check if transaction supports capture
export function supportsCapture(transactionType: string): boolean {
  return transactionType === 'authOnlyTransaction';
}

// Check if transaction supports void
export function supportsVoid(transactionType: string, status: string): boolean {
  return status === AuthorizeNetTransactionStatus.APPROVED && 
         (transactionType === 'authOnlyTransaction' || transactionType === 'authCaptureTransaction');
}

// Check if transaction supports refund
export function supportsRefund(transactionType: string, status: string): boolean {
  return status === AuthorizeNetTransactionStatus.APPROVED && 
         (transactionType === 'authCaptureTransaction' || transactionType === 'priorAuthCaptureTransaction');
}
