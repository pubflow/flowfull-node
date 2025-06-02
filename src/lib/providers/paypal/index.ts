// PayPal Provider Module
export { PayPalAdapter } from './paypal-adapter';
export { PayPalHttpClient } from './paypal-client';
export * from './types';
export * from './utils';

// Re-export commonly used types for convenience
export type {
  PayPalOrder,
  PayPalOrderRequest,
  PayPalPaymentSource,
  PayPalWebhookEvent,
  PayPalError
} from './types';

// Re-export utility functions
export {
  mapPayPalStatusToPaymentIntent,
  mapPayPalErrorToPaymentError,
  validatePayPalCurrency,
  validatePayPalAmount,
  formatPayPalAmount
} from './utils';
