import { Kysely } from 'kysely';
import { BaseRepository } from './base';
import { Database, PaymentMethodTable, PaymentMethodInsert, PaymentMethodUpdate } from '../types';
import { getDatabase } from '../connection';

export class PaymentMethodRepository extends BaseRepository<'payment_methods'> {
  constructor(db: Kysely<Database>) {
    super(db, 'payment_methods');
  }

  // Override create method to use base repository functionality
  // The base repository handles timestamps automatically

  // Find payment method by ID
  async findById(id: string): Promise<PaymentMethodTable | null> {
    const result = await this.db
      .selectFrom('payment_methods')
      .selectAll()
      .where('id', '=', id)
      .executeTakeFirst();

    return result as PaymentMethodTable | null;
  }

  // Find payment method by provider payment method ID
  async findByProviderPaymentMethodId(providerId: string, providerPaymentMethodId: string): Promise<PaymentMethodTable | null> {
    const result = await this.db
      .selectFrom('payment_methods')
      .selectAll()
      .where('provider_id', '=', providerId)
      .where('provider_payment_method_id', '=', providerPaymentMethodId)
      .executeTakeFirst();

    return result as PaymentMethodTable | null;
  }

  // Find payment methods by user ID
  async findByUserId(userId: string): Promise<PaymentMethodTable[]> {
    const results = await this.db
      .selectFrom('payment_methods')
      .selectAll()
      .where('user_id', '=', userId)
      .orderBy('created_at', 'desc')
      .execute();

    return results as PaymentMethodTable[];
  }

  // Find payment methods by customer ID (for customer-specific payment methods)
  async findByCustomerId(customerId: string): Promise<PaymentMethodTable[]> {
    // This would require a join with provider_customers table
    // For now, we'll implement a simpler version
    const results = await this.db
      .selectFrom('payment_methods')
      .selectAll()
      .orderBy('created_at', 'desc')
      .execute();

    return results as PaymentMethodTable[];
  }

  // Find guest payment methods by email
  async findGuestsByEmail(email: string): Promise<PaymentMethodTable[]> {
    const results = await this.db
      .selectFrom('payment_methods')
      .selectAll()
      .where('is_guest', '=', true)
      .where('guest_email', '=', email)
      .orderBy('created_at', 'desc')
      .execute();

    return results as PaymentMethodTable[];
  }

  // Get default payment method for user
  async getDefaultForUser(userId: string): Promise<PaymentMethodTable | null> {
    const result = await this.db
      .selectFrom('payment_methods')
      .selectAll()
      .where('user_id', '=', userId)
      .where('is_default', '=', true)
      .executeTakeFirst();

    return result as PaymentMethodTable | null;
  }

  // Set payment method as default (and unset others)
  async setAsDefault(id: string, userId: string): Promise<PaymentMethodTable | null> {
    console.log('💾 Setting payment method as default:', id);

    // Start transaction to ensure consistency
    return await this.db.transaction().execute(async (trx) => {
      // First, unset all other default payment methods for this user
      await trx
        .updateTable('payment_methods')
        .set({
          is_default: false,
          updated_at: this.getCurrentTimestamp()
        } as any)
        .where('user_id', '=', userId)
        .where('is_default', '=', true)
        .execute();

      // Then set this one as default
      const result = await trx
        .updateTable('payment_methods')
        .set({
          is_default: true,
          updated_at: this.getCurrentTimestamp()
        } as any)
        .where('id', '=', id)
        .where('user_id', '=', userId)
        .returningAll()
        .executeTakeFirst();

      if (result) {
        console.log('✅ Payment method set as default successfully');
      }

      return result as PaymentMethodTable | null;
    });
  }

  // Update payment method
  async update(id: string, data: PaymentMethodUpdate): Promise<PaymentMethodTable | null> {
    console.log('💾 Updating payment method:', id);

    const result = await this.db
      .updateTable('payment_methods')
      .set(data as any) // Type cast for SQLite compatibility
      .where('id', '=', id)
      .returningAll()
      .executeTakeFirst();

    if (result) {
      console.log('✅ Payment method updated successfully');
    }

    return result as PaymentMethodTable | null;
  }

  // Unset default payment methods for a user
  async unsetDefaultForUser(userId: string): Promise<void> {
    console.log('🔄 Unsetting default payment methods for user:', userId);

    await this.db
      .updateTable('payment_methods')
      .set({
        is_default: false,
        updated_at: this.getCurrentTimestamp()
      } as any)
      .where('user_id', '=', userId)
      .where('is_default', '=', true)
      .execute();

    console.log('✅ Default payment methods unset for user');
  }

  // Unset default payment methods for a guest email
  async unsetDefaultForGuest(guestEmail: string): Promise<void> {
    console.log('🔄 Unsetting default payment methods for guest:', guestEmail);

    await this.db
      .updateTable('payment_methods')
      .set({
        is_default: false,
        updated_at: this.getCurrentTimestamp()
      } as any)
      .where('is_guest', '=', true)
      .where('guest_email', '=', guestEmail)
      .where('is_default', '=', true)
      .execute();

    console.log('✅ Default payment methods unset for guest');
  }

  // Convert guest payment methods to user (when guest registers)
  async convertGuestToUser(guestEmail: string, userId: string): Promise<PaymentMethodTable[]> {
    console.log('🔄 Converting guest payment methods to user:', { guestEmail, userId });

    const results = await this.db
      .updateTable('payment_methods')
      .set({
        user_id: userId,
        is_guest: false,
        guest_email: null,
        guest_name: null,
        updated_at: this.getCurrentTimestamp()
      } as any)
      .where('is_guest', '=', true)
      .where('guest_email', '=', guestEmail)
      .returningAll()
      .execute();

    console.log(`✅ Converted ${results.length} guest payment methods to user`);
    return results as PaymentMethodTable[];
  }

  // Delete payment method
  async delete(id: string): Promise<boolean> {
    console.log('🗑️ Deleting payment method:', id);

    const result = await this.db
      .deleteFrom('payment_methods')
      .where('id', '=', id)
      .executeTakeFirst();

    const deleted = Number(result.numDeletedRows) > 0;
    if (deleted) {
      console.log('✅ Payment method deleted successfully');
    }

    return deleted;
  }

  // List payment methods with pagination
  async list(options: {
    userId?: string;
    isGuest?: boolean;
    guestEmail?: string;
    paymentType?: string;
    limit?: number;
    offset?: number;
  } = {}): Promise<{
    paymentMethods: PaymentMethodTable[];
    total: number;
  }> {
    let query = this.db
      .selectFrom('payment_methods')
      .selectAll();

    // Apply filters
    if (options.userId) {
      query = query.where('user_id', '=', options.userId);
    }

    if (options.isGuest !== undefined) {
      query = query.where('is_guest', '=', options.isGuest);
    }

    if (options.guestEmail) {
      query = query.where('guest_email', '=', options.guestEmail);
    }

    if (options.paymentType) {
      query = query.where('payment_type', '=', options.paymentType);
    }

    // Get total count
    const countQuery = query
      .select(({ fn }) => [fn.count<number>('id').as('count')])
      .executeTakeFirst();

    // Apply pagination and ordering
    query = query.orderBy('created_at', 'desc');

    if (options.limit) {
      query = query.limit(options.limit);
    }
    if (options.offset) {
      query = query.offset(options.offset);
    }

    // Execute queries
    const [paymentMethods, countResult] = await Promise.all([
      query.execute(),
      countQuery
    ]);

    return {
      paymentMethods: paymentMethods as PaymentMethodTable[],
      total: countResult?.count || 0
    };
  }

  // Clean up old guest payment methods (optional maintenance)
  async cleanupOldGuests(daysOld: number = 30): Promise<number> {
    console.log(`🧹 Cleaning up guest payment methods older than ${daysOld} days...`);

    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - daysOld);

    const result = await this.db
      .deleteFrom('payment_methods')
      .where('is_guest', '=', true)
      .where('created_at', '<', cutoffDate.toISOString())
      .executeTakeFirst();

    const deletedCount = Number(result.numDeletedRows);
    console.log(`✅ Cleaned up ${deletedCount} old guest payment methods`);

    return deletedCount;
  }
}

// Export convenience function
export async function getPaymentMethodRepository(): Promise<PaymentMethodRepository> {
  const db = await getDatabase();
  return new PaymentMethodRepository(db);
}
