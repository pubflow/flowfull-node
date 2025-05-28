import { Kysely, sql } from 'kysely';
import { detectDatabaseType } from '@/config/environment';

export async function up(db: Kysely<any>): Promise<void> {
  console.log('Running migration: 002_indexes_and_triggers');

  // Create indexes for better performance
  console.log('Creating indexes...');

  // Payment users indexes
  await db.schema
    .createIndex('idx_payment_users_flowless_user_id')
    .on('payment_users')
    .column('flowless_user_id')
    .execute();

  await db.schema
    .createIndex('idx_payment_users_email')
    .on('payment_users')
    .column('email')
    .execute();

  // Payments indexes
  await db.schema
    .createIndex('idx_payments_user_id')
    .on('payments')
    .column('user_id')
    .execute();

  await db.schema
    .createIndex('idx_payments_status')
    .on('payments')
    .column('status')
    .execute();

  await db.schema
    .createIndex('idx_payments_provider_intent_id')
    .on('payments')
    .column('provider_intent_id')
    .execute();

  await db.schema
    .createIndex('idx_payments_guest_email')
    .on('payments')
    .column('guest_email')
    .execute();

  await db.schema
    .createIndex('idx_payments_is_guest_payment')
    .on('payments')
    .column('is_guest_payment')
    .execute();

  await db.schema
    .createIndex('idx_payments_created_at')
    .on('payments')
    .column('created_at')
    .execute();

  // Composite indexes for common queries
  await db.schema
    .createIndex('idx_payments_user_status')
    .on('payments')
    .columns(['user_id', 'status'])
    .execute();

  await db.schema
    .createIndex('idx_payments_guest_status')
    .on('payments')
    .columns(['is_guest_payment', 'status'])
    .execute();

  // Payment methods indexes
  await db.schema
    .createIndex('idx_payment_methods_user_id')
    .on('payment_methods')
    .column('user_id')
    .execute();

  await db.schema
    .createIndex('idx_payment_methods_provider_id')
    .on('payment_methods')
    .column('provider_id')
    .execute();

  await db.schema
    .createIndex('idx_payment_methods_is_default')
    .on('payment_methods')
    .column('is_default')
    .execute();

  // Customers indexes
  await db.schema
    .createIndex('idx_customers_user_id')
    .on('customers')
    .column('user_id')
    .execute();

  await db.schema
    .createIndex('idx_customers_provider_customer_id')
    .on('customers')
    .column('provider_customer_id')
    .execute();

  await db.schema
    .createIndex('idx_customers_email')
    .on('customers')
    .column('email')
    .execute();

  // Webhook events indexes
  await db.schema
    .createIndex('idx_webhook_events_provider_event_id')
    .on('webhook_events')
    .column('provider_event_id')
    .execute();

  await db.schema
    .createIndex('idx_webhook_events_processed')
    .on('webhook_events')
    .column('processed')
    .execute();

  await db.schema
    .createIndex('idx_webhook_events_created_at')
    .on('webhook_events')
    .column('created_at')
    .execute();

  // Refunds indexes
  await db.schema
    .createIndex('idx_refunds_payment_id')
    .on('refunds')
    .column('payment_id')
    .execute();

  await db.schema
    .createIndex('idx_refunds_status')
    .on('refunds')
    .column('status')
    .execute();

  console.log('✅ Indexes created successfully');

  // Create triggers for automatic client_secret cleanup (database-specific)
  const dbType = detectDatabaseType(process.env.DATABASE_URL!);

  console.log('Creating triggers for client secret cleanup...');

  if (dbType === 'postgresql' || dbType === 'neon') {
    // PostgreSQL trigger for client_secret cleanup
    await sql`
      CREATE OR REPLACE FUNCTION cleanup_client_secret()
      RETURNS TRIGGER AS $$
      BEGIN
        -- Cleanup client_secret when payment is completed or failed
        IF NEW.status IN ('succeeded', 'failed', 'canceled') AND OLD.client_secret IS NOT NULL THEN
          NEW.client_secret = NULL;
        END IF;
        RETURN NEW;
      END;
      $$ LANGUAGE plpgsql;
    `.execute(db);

    await sql`
      CREATE TRIGGER payment_cleanup_trigger
        BEFORE UPDATE ON payments
        FOR EACH ROW
        EXECUTE FUNCTION cleanup_client_secret();
    `.execute(db);

  } else if (dbType === 'mysql' || dbType === 'planetscale') {
    // MySQL trigger for client_secret cleanup
    await sql`
      CREATE TRIGGER payment_cleanup_trigger
        BEFORE UPDATE ON payments
        FOR EACH ROW
      BEGIN
        IF NEW.status IN ('succeeded', 'failed', 'canceled') AND OLD.client_secret IS NOT NULL THEN
          SET NEW.client_secret = NULL;
        END IF;
      END;
    `.execute(db);

  } else if (dbType === 'libsql') {
    // LibSQL trigger for client_secret cleanup (SQLite-compatible)
    await sql`
      CREATE TRIGGER payment_cleanup_trigger
        BEFORE UPDATE ON payments
        FOR EACH ROW
        WHEN NEW.status IN ('succeeded', 'failed', 'canceled') AND OLD.client_secret IS NOT NULL
      BEGIN
        UPDATE payments SET client_secret = NULL WHERE id = NEW.id;
      END;
    `.execute(db);
  } else if (dbType === 'd1') {
    // D1 trigger for client_secret cleanup (SQLite-compatible)
    await sql`
      CREATE TRIGGER payment_cleanup_trigger
        BEFORE UPDATE ON payments
        FOR EACH ROW
        WHEN NEW.status IN ('succeeded', 'failed', 'canceled') AND OLD.client_secret IS NOT NULL
      BEGIN
        UPDATE payments SET client_secret = NULL WHERE id = NEW.id;
      END;
    `.execute(db);
  }

  console.log('✅ Triggers created successfully');
}

export async function down(db: Kysely<any>): Promise<void> {
  console.log('Rolling back migration: 002_indexes_and_triggers');

  // Drop triggers first
  const dbType = detectDatabaseType(process.env.DATABASE_URL!);

  try {
    if (dbType === 'postgresql' || dbType === 'neon') {
      await sql`DROP TRIGGER IF EXISTS payment_cleanup_trigger ON payments;`.execute(db);
      await sql`DROP FUNCTION IF EXISTS cleanup_client_secret();`.execute(db);
    } else if (dbType === 'mysql' || dbType === 'planetscale') {
      await sql`DROP TRIGGER IF EXISTS payment_cleanup_trigger;`.execute(db);
    } else if (dbType === 'libsql' || dbType === 'd1') {
      await sql`DROP TRIGGER IF EXISTS payment_cleanup_trigger;`.execute(db);
    }
  } catch (error) {
    console.warn('Warning: Could not drop triggers:', error);
  }

  // Drop indexes
  const indexes = [
    'idx_refunds_status',
    'idx_refunds_payment_id',
    'idx_webhook_events_created_at',
    'idx_webhook_events_processed',
    'idx_webhook_events_provider_event_id',
    'idx_customers_email',
    'idx_customers_provider_customer_id',
    'idx_customers_user_id',
    'idx_payment_methods_is_default',
    'idx_payment_methods_provider_id',
    'idx_payment_methods_user_id',
    'idx_payments_guest_status',
    'idx_payments_user_status',
    'idx_payments_created_at',
    'idx_payments_is_guest_payment',
    'idx_payments_guest_email',
    'idx_payments_provider_intent_id',
    'idx_payments_status',
    'idx_payments_user_id',
    'idx_payment_users_email',
    'idx_payment_users_flowless_user_id'
  ];

  for (const indexName of indexes) {
    try {
      await db.schema.dropIndex(indexName).ifExists().execute();
    } catch (error) {
      console.warn(`Warning: Could not drop index ${indexName}:`, error);
    }
  }

  console.log('✅ Indexes and triggers rolled back successfully');
}
