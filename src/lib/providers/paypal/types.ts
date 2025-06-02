// PayPal API Types

export interface PayPalAccessTokenResponse {
  scope: string;
  access_token: string;
  token_type: string;
  app_id: string;
  expires_in: number;
  nonce: string;
}

export interface PayPalAmount {
  currency_code: string;
  value: string;
}

export interface PayPalPurchaseUnit {
  reference_id?: string;
  amount: PayPalAmount;
  payee?: {
    email_address?: string;
    merchant_id?: string;
  };
  payment_instruction?: {
    platform_fees?: Array<{
      amount: PayPalAmount;
      payee?: {
        email_address?: string;
        merchant_id?: string;
      };
    }>;
    disbursement_mode?: 'INSTANT' | 'DELAYED';
  };
  description?: string;
  custom_id?: string;
  invoice_id?: string;
  soft_descriptor?: string;
  items?: PayPalItem[];
  shipping?: PayPalShipping;
  payments?: {
    captures?: PayPalCapture[];
    authorizations?: PayPalAuthorization[];
    refunds?: PayPalRefund[];
  };
}

export interface PayPalItem {
  name: string;
  unit_amount: PayPalAmount;
  tax?: PayPalAmount;
  quantity: string;
  description?: string;
  sku?: string;
  category?: 'DIGITAL_GOODS' | 'PHYSICAL_GOODS' | 'DONATION';
}

export interface PayPalShipping {
  method?: string;
  address?: PayPalAddress;
}

export interface PayPalAddress {
  address_line_1?: string;
  address_line_2?: string;
  admin_area_2?: string; // City
  admin_area_1?: string; // State
  postal_code?: string;
  country_code: string;
}

export interface PayPalApplicationContext {
  brand_name?: string;
  locale?: string;
  landing_page?: 'LOGIN' | 'BILLING' | 'NO_PREFERENCE';
  shipping_preference?: 'GET_FROM_FILE' | 'NO_SHIPPING' | 'SET_PROVIDED_ADDRESS';
  user_action?: 'CONTINUE' | 'PAY_NOW';
  payment_method?: {
    payer_selected?: string;
    payee_preferred?: 'UNRESTRICTED' | 'IMMEDIATE_PAYMENT_REQUIRED';
  };
  return_url?: string;
  cancel_url?: string;
}

export interface PayPalPaymentSource {
  card?: {
    name?: string;
    number?: string;
    security_code?: string;
    expiry?: string;
    billing_address?: PayPalAddress;
    experience_context?: {
      brand_name?: string;
      locale?: string;
      shipping_preference?: 'GET_FROM_FILE' | 'NO_SHIPPING' | 'SET_PROVIDED_ADDRESS';
      return_url?: string;
      cancel_url?: string;
    };
  };
  paypal?: {
    experience_context?: {
      payment_method_preference?: 'UNRESTRICTED' | 'IMMEDIATE_PAYMENT_REQUIRED';
      brand_name?: string;
      locale?: string;
      landing_page?: 'LOGIN' | 'BILLING' | 'NO_PREFERENCE';
      shipping_preference?: 'GET_FROM_FILE' | 'NO_SHIPPING' | 'SET_PROVIDED_ADDRESS';
      user_action?: 'CONTINUE' | 'PAY_NOW';
      return_url?: string;
      cancel_url?: string;
    };
    email_address?: string;
    account_id?: string;
  };
  venmo?: {
    experience_context?: {
      brand_name?: string;
      shipping_preference?: 'GET_FROM_FILE' | 'NO_SHIPPING' | 'SET_PROVIDED_ADDRESS';
    };
    email_address?: string;
    account_id?: string;
  };
  apple_pay?: {
    id?: string;
    token?: string;
  };
  google_pay?: {
    id?: string;
    token?: string;
  };
}

export interface PayPalOrderRequest {
  intent: 'CAPTURE' | 'AUTHORIZE';
  purchase_units: PayPalPurchaseUnit[];
  payer?: {
    name?: {
      given_name?: string;
      surname?: string;
    };
    email_address?: string;
    payer_id?: string;
    phone?: {
      phone_type?: 'FAX' | 'HOME' | 'MOBILE' | 'OTHER' | 'PAGER';
      phone_number?: {
        national_number: string;
      };
    };
    birth_date?: string;
    tax_info?: {
      tax_id?: string;
      tax_id_type?: 'BR_CPF' | 'BR_CNPJ';
    };
    address?: PayPalAddress;
  };
  application_context?: PayPalApplicationContext;
  payment_source?: PayPalPaymentSource;
}

export interface PayPalLink {
  href: string;
  rel: string;
  method?: 'GET' | 'POST' | 'PUT' | 'DELETE' | 'HEAD' | 'CONNECT' | 'OPTIONS' | 'PATCH';
}

export interface PayPalOrder {
  id: string;
  intent: 'CAPTURE' | 'AUTHORIZE';
  status: 'CREATED' | 'SAVED' | 'APPROVED' | 'VOIDED' | 'COMPLETED' | 'PAYER_ACTION_REQUIRED' | 'CANCELLED';
  purchase_units: PayPalPurchaseUnit[];
  payer?: {
    name?: {
      given_name?: string;
      surname?: string;
    };
    email_address?: string;
    payer_id?: string;
    address?: PayPalAddress;
  };
  create_time?: string;
  update_time?: string;
  links?: PayPalLink[];
  payment_source?: PayPalPaymentSource;
}

export interface PayPalCapture {
  id: string;
  status: 'COMPLETED' | 'DECLINED' | 'PARTIALLY_REFUNDED' | 'PENDING' | 'REFUNDED';
  amount: PayPalAmount;
  final_capture?: boolean;
  seller_protection?: {
    status: 'ELIGIBLE' | 'PARTIALLY_ELIGIBLE' | 'NOT_ELIGIBLE';
    dispute_categories?: string[];
  };
  seller_receivable_breakdown?: {
    gross_amount: PayPalAmount;
    paypal_fee?: PayPalAmount;
    net_amount?: PayPalAmount;
    receivable_amount?: PayPalAmount;
    exchange_rate?: {
      source_currency: string;
      target_currency: string;
      value: string;
    };
  };
  invoice_id?: string;
  custom_id?: string;
  create_time?: string;
  update_time?: string;
  links?: PayPalLink[];
}

export interface PayPalAuthorization {
  id: string;
  status: 'CREATED' | 'CAPTURED' | 'DENIED' | 'EXPIRED' | 'PARTIALLY_CAPTURED' | 'VOIDED' | 'PENDING';
  amount: PayPalAmount;
  invoice_id?: string;
  custom_id?: string;
  seller_protection?: {
    status: 'ELIGIBLE' | 'PARTIALLY_ELIGIBLE' | 'NOT_ELIGIBLE';
    dispute_categories?: string[];
  };
  expiration_time?: string;
  create_time?: string;
  update_time?: string;
  links?: PayPalLink[];
}

export interface PayPalRefund {
  id: string;
  status: 'CANCELLED' | 'PENDING' | 'COMPLETED';
  amount: PayPalAmount;
  invoice_id?: string;
  custom_id?: string;
  acquirer_reference_number?: string;
  seller_payable_breakdown?: {
    gross_amount: PayPalAmount;
    paypal_fee?: PayPalAmount;
    net_amount?: PayPalAmount;
    total_refunded_amount?: PayPalAmount;
  };
  create_time?: string;
  update_time?: string;
  links?: PayPalLink[];
}

export interface PayPalCaptureResponse {
  id: string;
  status: string;
  purchase_units: PayPalPurchaseUnit[];
  payer: {
    name?: {
      given_name?: string;
      surname?: string;
    };
    email_address?: string;
    payer_id?: string;
  };
  links?: PayPalLink[];
}

// Webhook Event Types
export interface PayPalWebhookEvent {
  id: string;
  event_version: string;
  create_time: string;
  resource_type: string;
  event_type: string;
  summary?: string;
  resource: any;
  links?: PayPalLink[];
}

// Common PayPal webhook event types
export enum PayPalWebhookEventType {
  // Payment events
  PAYMENT_CAPTURE_COMPLETED = 'PAYMENT.CAPTURE.COMPLETED',
  PAYMENT_CAPTURE_DENIED = 'PAYMENT.CAPTURE.DENIED',
  PAYMENT_CAPTURE_PENDING = 'PAYMENT.CAPTURE.PENDING',
  PAYMENT_CAPTURE_REFUNDED = 'PAYMENT.CAPTURE.REFUNDED',
  PAYMENT_CAPTURE_REVERSED = 'PAYMENT.CAPTURE.REVERSED',
  
  // Authorization events
  PAYMENT_AUTHORIZATION_CREATED = 'PAYMENT.AUTHORIZATION.CREATED',
  PAYMENT_AUTHORIZATION_VOIDED = 'PAYMENT.AUTHORIZATION.VOIDED',
  
  // Order events
  CHECKOUT_ORDER_APPROVED = 'CHECKOUT.ORDER.APPROVED',
  CHECKOUT_ORDER_COMPLETED = 'CHECKOUT.ORDER.COMPLETED',
  
  // Refund events
  PAYMENT_REFUND_COMPLETED = 'PAYMENT.REFUND.COMPLETED',
  PAYMENT_REFUND_FAILED = 'PAYMENT.REFUND.FAILED',
  
  // Dispute events
  CUSTOMER_DISPUTE_CREATED = 'CUSTOMER.DISPUTE.CREATED',
  CUSTOMER_DISPUTE_RESOLVED = 'CUSTOMER.DISPUTE.RESOLVED',
  
  // Subscription events (for future use)
  BILLING_SUBSCRIPTION_CREATED = 'BILLING.SUBSCRIPTION.CREATED',
  BILLING_SUBSCRIPTION_ACTIVATED = 'BILLING.SUBSCRIPTION.ACTIVATED',
  BILLING_SUBSCRIPTION_CANCELLED = 'BILLING.SUBSCRIPTION.CANCELLED',
  BILLING_SUBSCRIPTION_SUSPENDED = 'BILLING.SUBSCRIPTION.SUSPENDED',
  BILLING_SUBSCRIPTION_PAYMENT_COMPLETED = 'BILLING.SUBSCRIPTION.PAYMENT.COMPLETED',
  BILLING_SUBSCRIPTION_PAYMENT_FAILED = 'BILLING.SUBSCRIPTION.PAYMENT.FAILED'
}

// Error types
export interface PayPalError {
  name: string;
  message: string;
  debug_id?: string;
  details?: Array<{
    field?: string;
    value?: string;
    location?: string;
    issue: string;
    description?: string;
  }>;
  links?: PayPalLink[];
}
