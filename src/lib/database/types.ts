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
  // Enhanced tracking fields for analytics
  concept: string | null; // Human-readable concept (e.g., "Monthly Subscription", "Product Purchase", "Donation")
  reference_code: string | null; // Machine-readable code for analytics (e.g., "subscription_monthly", "donation_campaign_2024")
  category: string | null; // High-level category (e.g., "subscription", "donation", "purchase", "refund", "fee")
  tags: string | null; // Comma-separated tags for flexible categorization (e.g., "promotion,summer,discount")
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
  is_guest: boolean;
  guest_email: string | null;
  guest_name: string | null;
  metadata: string | null; // JSON string
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
  is_guest: boolean;
  guest_email: string | null;
  guest_name: string | null;
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
  metadata: string | null; // JSON string
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

export interface SubscriptionTable {
  id: string;
  user_id: string | null;
  organization_id: string | null;
  customer_id: string; // References provider_customers table (supports both users and guests)
  product_id: string | null; // Optional for custom donations/flexible subscriptions
  payment_method_id: string | null;
  provider_id: string;
  provider_subscription_id: string | null;
  status: string;
  current_period_start: string;
  current_period_end: string;
  cancel_at_period_end: boolean;
  trial_end: string | null;
  price_cents: number;
  currency: string;
  metadata: string | null;
  // New billing fields for automatic renewals
  billing_interval: string;
  interval_multiplier: number;
  next_billing_date: string | null;
  last_billing_attempt: string | null;
  billing_retry_count: number;
  max_retry_attempts: number;
  billing_status: string;
  created_at: string;
  updated_at: string;
  // Enhanced tracking fields (inspired by payments table)
  description: string | null; // Human-readable description (e.g., "Premium Monthly Plan", "Basic Annual Subscription")
  concept: string | null; // Human-readable concept (e.g., "Monthly Subscription", "Annual Plan", "Trial Subscription")
  reference_code: string | null; // Machine-readable code for analytics (e.g., "subscription_monthly", "plan_premium_annual")
  category: string | null; // High-level category (e.g., "subscription", "trial", "upgrade", "downgrade")
  tags: string | null; // Comma-separated tags for flexible categorization (e.g., "promotion,summer,discount,premium")
}

// Product table interface (imported from products repository)
export interface ProductTable {
  id: string;
  name: string;
  description: string | null;
  product_type: string;
  is_recurring: boolean;
  price_cents: number;
  currency: string;
  billing_interval: string | null;
  trial_days: number;
  image: string | null;
  gallery: string | null;
  category_id: string | null;
  parent_product_id: string | null;
  variations: string | null;
  metadata: string | null;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

// Users table (base users from native-payments schema)
export interface UserTable {
  id: string;
  name: string;
  last_name: string;
  email: string;
  user_type: string;
  picture: string | null;
  user_name: string | null;
  password_hash: string | null;
  recovery_email: string | null;
  phone: string | null;
  is_verified: boolean;
  is_locked: boolean;
  two_factor: string | null; // JSON string
  passkeys: string | null; // JSON string
  first_time: boolean;
  created_at: string;
  updated_at: string;
}

// Main database interface
export interface Database {
  users: UserTable; // Base users table from native-payments
  payment_users: PaymentUserTable;
  payments: PaymentTable;
  payment_methods: PaymentMethodTable;
  payment_providers: PaymentProviderTable;
  provider_customers: CustomerTable;
  billing_addresses: BillingAddressTable;
  addresses: AddressTable;
  products: ProductTable;
  subscriptions: SubscriptionTable;
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

export type SubscriptionInsert = Omit<SubscriptionTable, 'created_at' | 'updated_at'>;
export type SubscriptionUpdate = Partial<Omit<SubscriptionTable, 'id' | 'created_at'>>;

export type ProductInsert = Omit<ProductTable, 'created_at' | 'updated_at'>;
export type ProductUpdate = Partial<Omit<ProductTable, 'id' | 'created_at'>>;

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

// Subscription status
export enum SubscriptionStatus {
  ACTIVE = 'active',
  CANCELED = 'canceled',
  PAST_DUE = 'past_due',
  TRIALING = 'trialing',
  INCOMPLETE = 'incomplete',
  INCOMPLETE_EXPIRED = 'incomplete_expired'
}
