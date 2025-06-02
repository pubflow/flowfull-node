import { PaymentIntentStatus } from '../base/payment-adapter';
import { PayPalError } from './types';

/**
 * Map PayPal order status to our unified PaymentIntentStatus
 */
export function mapPayPalStatusToPaymentIntent(paypalStatus: string): PaymentIntentStatus {
  switch (paypalStatus) {
    case 'CREATED':
      return PaymentIntentStatus.REQUIRES_CONFIRMATION;
    case 'SAVED':
      return PaymentIntentStatus.REQUIRES_CONFIRMATION;
    case 'APPROVED':
      return PaymentIntentStatus.REQUIRES_CAPTURE;
    case 'COMPLETED':
      return PaymentIntentStatus.SUCCEEDED;
    case 'CANCELLED':
      return PaymentIntentStatus.CANCELED;
    case 'VOIDED':
      return PaymentIntentStatus.CANCELED;
    case 'PAYER_ACTION_REQUIRED':
      return PaymentIntentStatus.REQUIRES_ACTION;
    default:
      console.warn(`Unknown PayPal status: ${paypalStatus}`);
      return PaymentIntentStatus.PROCESSING;
  }
}

/**
 * Map PayPal capture status to our unified PaymentIntentStatus
 */
export function mapPayPalCaptureStatusToPaymentIntent(captureStatus: string): PaymentIntentStatus {
  switch (captureStatus) {
    case 'COMPLETED':
      return PaymentIntentStatus.SUCCEEDED;
    case 'DECLINED':
      return PaymentIntentStatus.PAYMENT_FAILED;
    case 'PENDING':
      return PaymentIntentStatus.PROCESSING;
    case 'REFUNDED':
      return PaymentIntentStatus.SUCCEEDED; // Still successful, just refunded
    case 'PARTIALLY_REFUNDED':
      return PaymentIntentStatus.SUCCEEDED; // Still successful, partially refunded
    default:
      console.warn(`Unknown PayPal capture status: ${captureStatus}`);
      return PaymentIntentStatus.PROCESSING;
  }
}

/**
 * Map PayPal errors to our unified payment errors
 */
export function mapPayPalErrorToPaymentError(error: any): Error {
  console.error('PayPal Error:', error);

  // Handle PayPal API errors
  if (error.name && error.message) {
    const paypalError = error as PayPalError;
    
    // Map common PayPal error types
    switch (paypalError.name) {
      case 'INVALID_REQUEST':
        return new Error(`Invalid request: ${paypalError.message}`);
      case 'AUTHENTICATION_FAILURE':
        return new Error('PayPal authentication failed');
      case 'NOT_AUTHORIZED':
        return new Error('PayPal authorization failed');
      case 'VALIDATION_ERROR':
        return new Error(`Validation error: ${paypalError.message}`);
      case 'MALFORMED_REQUEST':
        return new Error(`Malformed request: ${paypalError.message}`);
      case 'UNSUPPORTED_MEDIA_TYPE':
        return new Error('Unsupported media type');
      case 'UNPROCESSABLE_ENTITY':
        const details = paypalError.details?.map(d => d.issue).join(', ') || '';
        return new Error(`Unprocessable entity: ${paypalError.message}${details ? ` (${details})` : ''}`);
      case 'INTERNAL_SERVER_ERROR':
        return new Error('PayPal internal server error');
      case 'SERVICE_UNAVAILABLE':
        return new Error('PayPal service unavailable');
      case 'RESOURCE_NOT_FOUND':
        return new Error('PayPal resource not found');
      case 'METHOD_NOT_SUPPORTED':
        return new Error('PayPal method not supported');
      case 'MEDIA_TYPE_NOT_ACCEPTABLE':
        return new Error('PayPal media type not acceptable');
      case 'NOT_ACCEPTABLE':
        return new Error('PayPal request not acceptable');
      case 'UNSUPPORTED_MEDIA_TYPE':
        return new Error('PayPal unsupported media type');
      case 'TOO_MANY_REQUESTS':
        return new Error('PayPal rate limit exceeded');
      case 'UNPROCESSABLE_ENTITY':
        return new Error(`PayPal validation failed: ${paypalError.message}`);
      default:
        return new Error(`PayPal error: ${paypalError.message}`);
    }
  }

  // Handle HTTP errors
  if (error.status) {
    switch (error.status) {
      case 400:
        return new Error('Bad request to PayPal API');
      case 401:
        return new Error('PayPal authentication failed');
      case 403:
        return new Error('PayPal access forbidden');
      case 404:
        return new Error('PayPal resource not found');
      case 422:
        return new Error('PayPal validation failed');
      case 429:
        return new Error('PayPal rate limit exceeded');
      case 500:
        return new Error('PayPal internal server error');
      case 502:
        return new Error('PayPal bad gateway');
      case 503:
        return new Error('PayPal service unavailable');
      case 504:
        return new Error('PayPal gateway timeout');
      default:
        return new Error(`PayPal HTTP error: ${error.status}`);
    }
  }

  // Handle network errors
  if (error.code === 'ECONNREFUSED') {
    return new Error('Cannot connect to PayPal API');
  }
  
  if (error.code === 'ETIMEDOUT') {
    return new Error('PayPal API request timeout');
  }

  // Default error handling
  return new Error(error.message || 'Unknown PayPal error');
}

/**
 * Validate currency support for PayPal
 */
export function validatePayPalCurrency(currency: string): boolean {
  const supportedCurrencies = [
    'AUD', 'BRL', 'CAD', 'CNY', 'CZK', 'DKK', 'EUR', 'HKD', 'HUF', 'ILS',
    'JPY', 'MYR', 'MXN', 'TWD', 'NZD', 'NOK', 'PHP', 'PLN', 'GBP', 'RUB',
    'SGD', 'SEK', 'CHF', 'THB', 'USD', 'INR'
  ];
  
  return supportedCurrencies.includes(currency.toUpperCase());
}

/**
 * Validate amount for PayPal (minimum amounts vary by currency)
 */
export function validatePayPalAmount(amountCents: number, currency: string): boolean {
  const minimumAmounts: Record<string, number> = {
    'USD': 100, // $1.00
    'EUR': 100, // €1.00
    'GBP': 100, // £1.00
    'CAD': 100, // C$1.00
    'AUD': 100, // A$1.00
    'JPY': 100, // ¥100
    'CHF': 100, // CHF 1.00
    'NOK': 300, // 3.00 NOK
    'SEK': 300, // 3.00 SEK
    'DKK': 250, // 2.50 DKK
    'PLN': 200, // 2.00 PLN
    'CZK': 1000, // 10.00 CZK
    'HUF': 10000, // 100.00 HUF
    'ILS': 100, // 1.00 ILS
    'MXN': 1000, // 10.00 MXN
    'BRL': 200, // 2.00 BRL
    'MYR': 200, // 2.00 MYR
    'PHP': 3500, // 35.00 PHP
    'THB': 2000, // 20.00 THB
    'TWD': 2000, // 20.00 TWD
    'NZD': 100, // NZ$1.00
    'HKD': 400, // HK$4.00
    'SGD': 100, // S$1.00
    'INR': 3500, // ₹35.00
    'RUB': 3000, // ₽30.00
    'CNY': 300 // ¥3.00
  };

  const minimum = minimumAmounts[currency.toUpperCase()] || 100;
  return amountCents >= minimum;
}

/**
 * Format amount for PayPal API (always 2 decimal places)
 */
export function formatPayPalAmount(amountCents: number): string {
  return (amountCents / 100).toFixed(2);
}

/**
 * Parse PayPal amount to cents
 */
export function parsePayPalAmountToCents(amount: string): number {
  return Math.round(parseFloat(amount) * 100);
}

/**
 * Generate PayPal-compatible request ID
 */
export function generatePayPalRequestId(): string {
  const timestamp = Date.now();
  const random = Math.random().toString(36).substr(2, 9);
  return `${timestamp}-${random}`;
}

/**
 * Validate PayPal webhook signature headers
 */
export function validatePayPalWebhookHeaders(headers: Record<string, string>): boolean {
  const requiredHeaders = [
    'paypal-auth-algo',
    'paypal-cert-id',
    'paypal-transmission-id',
    'paypal-transmission-sig',
    'paypal-transmission-time'
  ];

  return requiredHeaders.every(header => 
    headers[header] || headers[header.toUpperCase()] || headers[header.toLowerCase()]
  );
}

/**
 * Extract PayPal webhook headers (case-insensitive)
 */
export function extractPayPalWebhookHeaders(headers: Record<string, string>): Record<string, string> {
  const paypalHeaders: Record<string, string> = {};
  
  Object.entries(headers).forEach(([key, value]) => {
    const lowerKey = key.toLowerCase();
    if (lowerKey.startsWith('paypal-')) {
      paypalHeaders[lowerKey] = value;
    }
  });

  return paypalHeaders;
}

/**
 * Get PayPal environment URL
 */
export function getPayPalBaseUrl(environment: 'sandbox' | 'production'): string {
  return environment === 'production' 
    ? 'https://api-m.paypal.com'
    : 'https://api-m.sandbox.paypal.com';
}

/**
 * Check if PayPal order is capturable
 */
export function isPayPalOrderCapturable(status: string): boolean {
  return status === 'APPROVED';
}

/**
 * Check if PayPal order is authorizable
 */
export function isPayPalOrderAuthorizable(status: string): boolean {
  return status === 'APPROVED';
}

/**
 * Get PayPal payment method from payment source
 */
export function getPaymentMethodFromPayPalSource(paymentSource: any): string {
  if (paymentSource?.card) return 'credit_card';
  if (paymentSource?.paypal) return 'paypal';
  if (paymentSource?.venmo) return 'venmo';
  if (paymentSource?.apple_pay) return 'apple_pay';
  if (paymentSource?.google_pay) return 'google_pay';
  return 'unknown';
}

/**
 * Build PayPal error context for debugging
 */
export function buildPayPalErrorContext(error: any): Record<string, any> {
  const context: Record<string, any> = {
    timestamp: new Date().toISOString(),
    error_type: 'paypal_error'
  };

  if (error.name) context.paypal_error_name = error.name;
  if (error.message) context.paypal_error_message = error.message;
  if (error.debug_id) context.paypal_debug_id = error.debug_id;
  if (error.details) context.paypal_error_details = error.details;
  if (error.status) context.http_status = error.status;

  return context;
}
