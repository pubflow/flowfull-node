import { Kysely, sql } from 'kysely';

export async function up(db: Kysely<any>): Promise<void> {
  console.log('Running migration: 001_initial_schema');

  // Create payment_users table
  await db.schema
    .createTable('payment_users')
    .addColumn('id', 'varchar(255)', (col) => col.primaryKey())
    .addColumn('flowless_user_id', 'varchar(255)', (col) => col.notNull().unique())
    .addColumn('email', 'varchar(255)', (col) => col.notNull())
    .addColumn('name', 'varchar(255)', (col) => col.notNull())
    .addColumn('user_type', 'varchar(50)', (col) => col.notNull().defaultTo('individual'))
    .addColumn('is_guest', 'boolean', (col) => col.notNull().defaultTo(false))
    .addColumn('created_at', 'timestamp', (col) => col.notNull().defaultTo(sql`CURRENT_TIMESTAMP`))
    .addColumn('updated_at', 'timestamp', (col) => col.notNull().defaultTo(sql`CURRENT_TIMESTAMP`))
    .execute();

  // Create payment_providers table
  await db.schema
    .createTable('payment_providers')
    .addColumn('id', 'varchar(50)', (col) => col.primaryKey())
    .addColumn('display_name', 'varchar(255)', (col) => col.notNull())
    .addColumn('picture', 'varchar(255)')
    .addColumn('is_active', 'boolean', (col) => col.notNull().defaultTo(true))
    .addColumn('supports_subscriptions', 'boolean', (col) => col.notNull().defaultTo(false))
    .addColumn('supports_saved_methods', 'boolean', (col) => col.notNull().defaultTo(false))
    .addColumn('config', 'text')
    .addColumn('created_at', 'timestamp', (col) => col.notNull().defaultTo(sql`CURRENT_TIMESTAMP`))
    .addColumn('updated_at', 'timestamp', (col) => col.notNull().defaultTo(sql`CURRENT_TIMESTAMP`))
    .execute();

  // Create payments table
  await db.schema
    .createTable('payments')
    .addColumn('id', 'varchar(255)', (col) => col.primaryKey())
    .addColumn('order_id', 'varchar(255)')
    .addColumn('subscription_id', 'varchar(255)')
    .addColumn('user_id', 'varchar(255)')
    .addColumn('organization_id', 'varchar(255)')
    .addColumn('payment_method_id', 'varchar(255)')
    .addColumn('provider_id', 'varchar(50)', (col) => col.notNull())
    .addColumn('provider_payment_id', 'varchar(255)')
    .addColumn('provider_intent_id', 'varchar(255)')
    .addColumn('client_secret', 'varchar(255)')
    .addColumn('amount_cents', 'bigint', (col) => col.notNull())
    .addColumn('currency', 'varchar(3)', (col) => col.notNull().defaultTo('USD'))
    .addColumn('status', 'varchar(50)', (col) => col.notNull())
    .addColumn('description', 'text')
    .addColumn('error_message', 'text')
    .addColumn('is_guest_payment', 'boolean', (col) => col.notNull().defaultTo(false))
    .addColumn('guest_data', 'text')
    .addColumn('guest_email', 'varchar(255)')
    .addColumn('metadata', 'text')
    .addColumn('created_at', 'timestamp', (col) => col.notNull().defaultTo(sql`CURRENT_TIMESTAMP`))
    .addColumn('updated_at', 'timestamp', (col) => col.notNull().defaultTo(sql`CURRENT_TIMESTAMP`))
    .addColumn('completed_at', 'timestamp')
    .execute();

  // Create payment_methods table
  await db.schema
    .createTable('payment_methods')
    .addColumn('id', 'varchar(255)', (col) => col.primaryKey())
    .addColumn('user_id', 'varchar(255)')
    .addColumn('organization_id', 'varchar(255)')
    .addColumn('provider_id', 'varchar(50)', (col) => col.notNull())
    .addColumn('provider_payment_method_id', 'varchar(255)', (col) => col.notNull())
    .addColumn('payment_type', 'varchar(50)', (col) => col.notNull())
    .addColumn('last_four', 'varchar(4)')
    .addColumn('expiry_month', 'varchar(2)')
    .addColumn('expiry_year', 'varchar(4)')
    .addColumn('card_brand', 'varchar(50)')
    .addColumn('is_default', 'boolean', (col) => col.notNull().defaultTo(false))
    .addColumn('billing_address_id', 'varchar(255)')
    .addColumn('created_at', 'timestamp', (col) => col.notNull().defaultTo(sql`CURRENT_TIMESTAMP`))
    .addColumn('updated_at', 'timestamp', (col) => col.notNull().defaultTo(sql`CURRENT_TIMESTAMP`))
    .execute();

  // Create customers table
  await db.schema
    .createTable('customers')
    .addColumn('id', 'varchar(255)', (col) => col.primaryKey())
    .addColumn('user_id', 'varchar(255)')
    .addColumn('organization_id', 'varchar(255)')
    .addColumn('provider_id', 'varchar(50)', (col) => col.notNull())
    .addColumn('provider_customer_id', 'varchar(255)', (col) => col.notNull())
    .addColumn('email', 'varchar(255)', (col) => col.notNull())
    .addColumn('name', 'varchar(255)')
    .addColumn('phone', 'varchar(50)')
    .addColumn('default_payment_method_id', 'varchar(255)')
    .addColumn('metadata', 'text')
    .addColumn('created_at', 'timestamp', (col) => col.notNull().defaultTo(sql`CURRENT_TIMESTAMP`))
    .addColumn('updated_at', 'timestamp', (col) => col.notNull().defaultTo(sql`CURRENT_TIMESTAMP`))
    .execute();

  // Create billing_addresses table
  await db.schema
    .createTable('billing_addresses')
    .addColumn('id', 'varchar(255)', (col) => col.primaryKey())
    .addColumn('user_id', 'varchar(255)')
    .addColumn('organization_id', 'varchar(255)')
    .addColumn('name', 'varchar(255)')
    .addColumn('line1', 'varchar(255)', (col) => col.notNull())
    .addColumn('line2', 'varchar(255)')
    .addColumn('city', 'varchar(255)', (col) => col.notNull())
    .addColumn('state', 'varchar(255)')
    .addColumn('postal_code', 'varchar(20)', (col) => col.notNull())
    .addColumn('country', 'varchar(2)', (col) => col.notNull())
    .addColumn('is_default', 'boolean', (col) => col.notNull().defaultTo(false))
    .addColumn('created_at', 'timestamp', (col) => col.notNull().defaultTo(sql`CURRENT_TIMESTAMP`))
    .addColumn('updated_at', 'timestamp', (col) => col.notNull().defaultTo(sql`CURRENT_TIMESTAMP`))
    .execute();

  // Create payment_webhooks table (following native-payments schema)
  await db.schema
    .createTable('payment_webhooks')
    .addColumn('id', 'varchar(255)', (col) => col.primaryKey())
    .addColumn('provider_id', 'varchar(50)', (col) => col.notNull())
    .addColumn('event_type', 'varchar(255)', (col) => col.notNull()) // 'payment.succeeded', 'subscription.created', etc.
    .addColumn('payload', 'text', (col) => col.notNull()) // JSON string
    .addColumn('processed', 'integer', (col) => col.notNull().defaultTo(0)) // 0 or 1 (SQLite boolean)
    .addColumn('created_at', 'timestamp', (col) => col.notNull().defaultTo(sql`CURRENT_TIMESTAMP`))
    .addColumn('processed_at', 'timestamp')
    .execute();

  // Create payment_events table (following native-payments schema)
  await db.schema
    .createTable('payment_events')
    .addColumn('id', 'varchar(255)', (col) => col.primaryKey())
    .addColumn('entity_type', 'varchar(50)', (col) => col.notNull()) // 'payment', 'subscription', 'order', etc.
    .addColumn('entity_id', 'varchar(255)', (col) => col.notNull())
    .addColumn('event_type', 'varchar(50)', (col) => col.notNull()) // 'created', 'updated', 'failed', etc.
    .addColumn('data', 'text') // JSON string
    .addColumn('created_at', 'timestamp', (col) => col.notNull().defaultTo(sql`CURRENT_TIMESTAMP`))
    .execute();

  // Create refunds table
  await db.schema
    .createTable('refunds')
    .addColumn('id', 'varchar(255)', (col) => col.primaryKey())
    .addColumn('payment_id', 'varchar(255)', (col) => col.notNull())
    .addColumn('provider_refund_id', 'varchar(255)')
    .addColumn('amount_cents', 'bigint', (col) => col.notNull())
    .addColumn('currency', 'varchar(3)', (col) => col.notNull())
    .addColumn('reason', 'varchar(255)')
    .addColumn('status', 'varchar(50)', (col) => col.notNull())
    .addColumn('metadata', 'text')
    .addColumn('created_at', 'timestamp', (col) => col.notNull().defaultTo(sql`CURRENT_TIMESTAMP`))
    .addColumn('updated_at', 'timestamp', (col) => col.notNull().defaultTo(sql`CURRENT_TIMESTAMP`))
    .execute();

  console.log('✅ Initial schema created successfully');
}

export async function down(db: Kysely<any>): Promise<void> {
  console.log('Rolling back migration: 001_initial_schema');

  // Drop tables in reverse order to handle dependencies
  await db.schema.dropTable('refunds').ifExists().execute();
  await db.schema.dropTable('payment_events').ifExists().execute();
  await db.schema.dropTable('payment_webhooks').ifExists().execute();
  await db.schema.dropTable('billing_addresses').ifExists().execute();
  await db.schema.dropTable('customers').ifExists().execute();
  await db.schema.dropTable('payment_methods').ifExists().execute();
  await db.schema.dropTable('payments').ifExists().execute();
  await db.schema.dropTable('payment_providers').ifExists().execute();
  await db.schema.dropTable('payment_users').ifExists().execute();

  console.log('✅ Initial schema rolled back successfully');
}
