// Database table type definitions for Kysely

export interface PaymentUserTable {
  id: string;
  flowless_user_id: string;
  email: string;
  name: string;
  user_type: string;
  is_guest: boolean;
  created_at: string;
  updated_at: string;
}

export interface PaymentTable {
  id: string;
  order_id: string | null;
  subscription_id: string | null;
  user_id: string | null;
  organization_id: string | null;
  payment_method_id: string | null;
  provider_id: string;
  provider_payment_id: string | null;
  provider_intent_id: string | null;
  client_secret: string | null;
  amount_cents: number;
  currency: string;
  status: string;
  description: string | null;
  error_message: string | null;
  is_guest_payment: boolean;
  guest_data: string | null; // JSON string
  guest_email: string | null;
  metadata: string | null; // JSON string
  created_at: string;
  updated_at: string;
  completed_at: string | null;
}

export interface PaymentMethodTable {
  id: string;
  user_id: string | null;
  organization_id: string | null;
  provider_id: string;
  provider_payment_method_id: string;
  payment_type: string;
  last_four: string | null;
  expiry_month: string | null;
  expiry_year: string | null;
  card_brand: string | null;
  is_default: boolean;
  billing_address_id: string | null;
  created_at: string;
  updated_at: string;
}

export interface PaymentProviderTable {
  id: string;
  display_name: string;
  picture: string | null;
  is_active: boolean;
  supports_subscriptions: boolean;
  supports_saved_methods: boolean;
  config: string | null; // JSON string
  created_at: string;
  updated_at: string;
}

export interface CustomerTable {
  id: string;
  user_id: string | null;
  organization_id: string | null;
  provider_id: string;
  provider_customer_id: string;
  email: string;
  name: string | null;
  phone: string | null;
  default_payment_method_id: string | null;
  metadata: string | null; // JSON string
  created_at: string;
  updated_at: string;
}

export interface BillingAddressTable {
  id: string;
  user_id: string | null;
  organization_id: string | null;
  name: string | null;
  line1: string;
  line2: string | null;
  city: string;
  state: string | null;
  postal_code: string;
  country: string;
  is_default: boolean;
  created_at: string;
  updated_at: string;
}

export interface AddressTable {
  id: string;
  user_id: string | null;
  organization_id: string | null;
  address_type: 'billing' | 'shipping' | 'both';
  is_default: boolean;
  name: string;
  line1: string;
  line2: string | null;
  city: string;
  state: string | null;
  postal_code: string;
  country: string;
  phone: string | null;
  email: string | null;
  is_guest: boolean;
  guest_email: string | null;
  guest_name: string | null;
  created_at: string;
  updated_at: string;
}

export interface PaymentWebhookTable {
  id: string;
  provider_id: string;
  event_type: string; // 'payment.succeeded', 'subscription.created', etc.
  payload: string; // JSON string
  processed: number; // 0 or 1 (SQLite boolean)
  created_at: string;
  processed_at: string | null;
}

export interface PaymentEventTable {
  id: string;
  entity_type: string; // 'payment', 'subscription', 'order', etc.
  entity_id: string;
  event_type: string; // 'created', 'updated', 'failed', etc.
  data: string | null; // JSON string
  created_at: string;
}

export interface RefundTable {
  id: string;
  payment_id: string;
  provider_refund_id: string | null;
  amount_cents: number;
  currency: string;
  reason: string | null;
  status: string;
  metadata: string | null; // JSON string
  created_at: string;
  updated_at: string;
}

// Main database interface
export interface Database {
  payment_users: PaymentUserTable;
  payments: PaymentTable;
  payment_methods: PaymentMethodTable;
  payment_providers: PaymentProviderTable;
  customers: CustomerTable;
  billing_addresses: BillingAddressTable;
  addresses: AddressTable;
  payment_webhooks: PaymentWebhookTable;
  payment_events: PaymentEventTable;
  refunds: RefundTable;
}

// Helper types for inserts and updates
export type PaymentUserInsert = Omit<PaymentUserTable, 'created_at' | 'updated_at'>;
export type PaymentUserUpdate = Partial<Omit<PaymentUserTable, 'id' | 'created_at'>>;

export type PaymentInsert = Omit<PaymentTable, 'created_at' | 'updated_at'>;
export type PaymentUpdate = Partial<Omit<PaymentTable, 'id' | 'created_at'>>;

export type PaymentMethodInsert = Omit<PaymentMethodTable, 'created_at' | 'updated_at'>;
export type PaymentMethodUpdate = Partial<Omit<PaymentMethodTable, 'id' | 'created_at'>>;

export type CustomerInsert = Omit<CustomerTable, 'created_at' | 'updated_at'>;
export type CustomerUpdate = Partial<Omit<CustomerTable, 'id' | 'created_at'>>;

export type BillingAddressInsert = Omit<BillingAddressTable, 'created_at' | 'updated_at'>;
export type BillingAddressUpdate = Partial<Omit<BillingAddressTable, 'id' | 'created_at'>>;

export type AddressInsert = Omit<AddressTable, 'created_at' | 'updated_at'>;
export type AddressUpdate = Partial<Omit<AddressTable, 'id' | 'created_at'>>;

export type PaymentWebhookInsert = Omit<PaymentWebhookTable, 'created_at'>;
export type PaymentWebhookUpdate = Partial<Omit<PaymentWebhookTable, 'id' | 'created_at'>>;

export type PaymentEventInsert = Omit<PaymentEventTable, 'created_at'>;
export type PaymentEventUpdate = Partial<Omit<PaymentEventTable, 'id' | 'created_at'>>;

export type RefundInsert = Omit<RefundTable, 'created_at' | 'updated_at'>;
export type RefundUpdate = Partial<Omit<RefundTable, 'id' | 'created_at'>>;

// Payment status enum
export enum PaymentStatus {
  PENDING = 'pending',
  REQUIRES_CONFIRMATION = 'requires_confirmation',
  REQUIRES_ACTION = 'requires_action',
  PROCESSING = 'processing',
  SUCCEEDED = 'succeeded',
  FAILED = 'failed',
  CANCELED = 'canceled',
  REFUNDED = 'refunded',
  PARTIALLY_REFUNDED = 'partially_refunded'
}

// Payment method types
export enum PaymentMethodType {
  CREDIT_CARD = 'credit_card',
  DEBIT_CARD = 'debit_card',
  BANK_ACCOUNT = 'bank_account',
  PAYPAL = 'paypal',
  APPLE_PAY = 'apple_pay',
  GOOGLE_PAY = 'google_pay'
}

// Provider IDs
export enum ProviderId {
  STRIPE = 'stripe',
  PAYPAL = 'paypal',
  AUTHORIZE_NET = 'authorize_net'
}

// User types
export enum UserType {
  INDIVIDUAL = 'individual',
  BUSINESS = 'business',
  ORGANIZATION = 'organization'
}

// Refund status
export enum RefundStatus {
  PENDING = 'pending',
  SUCCEEDED = 'succeeded',
  FAILED = 'failed',
  CANCELED = 'canceled'
}
