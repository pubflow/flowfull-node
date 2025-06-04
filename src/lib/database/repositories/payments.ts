import { Kysely } from 'kysely';
import { BaseRepository } from './base';
import type { Database, PaymentTable, PaymentInsert, PaymentUpdate } from '../types';
import { PaymentStatus } from '../types';

export class PaymentRepository extends BaseRepository<'payments'> {
  constructor(db: Kysely<Database>) {
    super(db, 'payments');
  }

  // Find payments by user ID
  async findByUserId(userId: string, limit = 20): Promise<PaymentTable[]> {
    return await this.db
      .selectFrom('payments')
      .selectAll()
      .where('user_id', '=', userId)
      .orderBy('created_at', 'desc')
      .limit(limit)
      .execute();
  }

  // Find guest payments by email
  async findGuestPayments(email: string, limit = 20): Promise<PaymentTable[]> {
    return await this.db
      .selectFrom('payments')
      .selectAll()
      .where('guest_email', '=', email)
      .where('is_guest_payment', '=', true)
      .orderBy('created_at', 'desc')
      .limit(limit)
      .execute();
  }

  // Find payment by provider intent ID
  async findByProviderIntentId(providerIntentId: string): Promise<PaymentTable | null> {
    return await this.findOneBy('provider_intent_id', providerIntentId);
  }

  // Find payment by provider payment ID
  async findByProviderPaymentId(providerPaymentId: string): Promise<PaymentTable | null> {
    return await this.findOneBy('provider_payment_id', providerPaymentId);
  }

  // Find payments by status
  async findByStatus(status: PaymentStatus, limit = 100): Promise<PaymentTable[]> {
    return await this.findBy('status', status, limit);
  }

  // Find payments by provider
  async findByProvider(providerId: string, limit = 100): Promise<PaymentTable[]> {
    return await this.findBy('provider_id', providerId, limit);
  }

  // Find payments requiring cleanup (old client secrets)
  async findPaymentsRequiringCleanup(maxAgeHours = 24): Promise<PaymentTable[]> {
    const cutoffDate = new Date(Date.now() - maxAgeHours * 60 * 60 * 1000);

    return await this.db
      .selectFrom('payments')
      .selectAll()
      .where('client_secret', 'is not', null)
      .where('created_at', '<', cutoffDate.toISOString())
      .execute();
  }

  // Clean up expired client secrets
  async cleanupExpiredSecrets(maxAgeHours = 24): Promise<number> {
    const cutoffDate = new Date(Date.now() - maxAgeHours * 60 * 60 * 1000);

    const result = await this.db
      .updateTable('payments')
      .set({
        client_secret: null,
        updated_at: this.getCurrentTimestamp()
      })
      .where('client_secret', 'is not', null)
      .where('created_at', '<', cutoffDate.toISOString())
      .execute();

    return Number(result.numUpdatedRows || 0);
  }

  // Update payment status
  async updateStatus(id: string, status: PaymentStatus, errorMessage?: string): Promise<PaymentTable | null> {
    const updateData: PaymentUpdate = {
      status,
      updated_at: this.getCurrentTimestamp()
    };

    if (errorMessage) {
      updateData.error_message = errorMessage;
    }

    if (status === PaymentStatus.SUCCEEDED || status === PaymentStatus.FAILED) {
      updateData.completed_at = this.getCurrentTimestamp();
      // Clear client secret on completion
      updateData.client_secret = null;
    }

    return await this.update(id, updateData);
  }

  // Set provider payment ID
  async setProviderPaymentId(id: string, providerPaymentId: string): Promise<PaymentTable | null> {
    return await this.update(id, {
      provider_payment_id: providerPaymentId,
      updated_at: this.getCurrentTimestamp()
    });
  }

  // Clear client secret
  async clearClientSecret(id: string): Promise<PaymentTable | null> {
    return await this.update(id, {
      client_secret: null,
      updated_at: this.getCurrentTimestamp()
    });
  }

  // Get payment statistics
  async getStats(startDate?: Date, endDate?: Date) {
    let query = this.db
      .selectFrom('payments')
      .select([
        this.db.fn.count('id').as('total_payments'),
        this.db.fn.sum('amount_cents').as('total_amount'),
        this.db.fn.avg('amount_cents').as('average_amount')
      ]);

    if (startDate) {
      query = query.where('created_at', '>=', startDate.toISOString());
    }
    if (endDate) {
      query = query.where('created_at', '<=', endDate.toISOString());
    }

    const result = await query.executeTakeFirst();

    return {
      total_payments: Number(result?.total_payments || 0),
      total_amount: Number(result?.total_amount || 0),
      average_amount: Number(result?.average_amount || 0)
    };
  }

  // Get payment statistics by status
  async getStatsByStatus(startDate?: Date, endDate?: Date) {
    let query = this.db
      .selectFrom('payments')
      .select([
        'status',
        this.db.fn.count('id').as('count'),
        this.db.fn.sum('amount_cents').as('total_amount')
      ])
      .groupBy('status');

    if (startDate) {
      query = query.where('created_at', '>=', startDate.toISOString());
    }
    if (endDate) {
      query = query.where('created_at', '<=', endDate.toISOString());
    }

    const results = await query.execute();

    return results.map(result => ({
      status: result.status,
      count: Number(result.count),
      total_amount: Number(result.total_amount || 0)
    }));
  }

  // Get payment statistics by provider
  async getStatsByProvider(startDate?: Date, endDate?: Date) {
    let query = this.db
      .selectFrom('payments')
      .select([
        'provider_id',
        this.db.fn.count('id').as('count'),
        this.db.fn.sum('amount_cents').as('total_amount')
      ])
      .groupBy('provider_id');

    if (startDate) {
      query = query.where('created_at', '>=', startDate.toISOString());
    }
    if (endDate) {
      query = query.where('created_at', '<=', endDate.toISOString());
    }

    const results = await query.execute();

    return results.map(result => ({
      provider_id: result.provider_id,
      count: Number(result.count),
      total_amount: Number(result.total_amount || 0)
    }));
  }

  // Find failed payments for retry
  async findFailedPayments(limit = 50): Promise<PaymentTable[]> {
    return await this.db
      .selectFrom('payments')
      .selectAll()
      .where('status', '=', PaymentStatus.FAILED)
      .where('created_at', '>', new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString()) // Last 24 hours
      .orderBy('created_at', 'desc')
      .limit(limit)
      .execute();
  }

  // Find pending payments older than specified minutes
  async findStuckPayments(olderThanMinutes = 30): Promise<PaymentTable[]> {
    const cutoffDate = new Date(Date.now() - olderThanMinutes * 60 * 1000);

    return await this.db
      .selectFrom('payments')
      .selectAll()
      .where('status', 'in', [PaymentStatus.PENDING, PaymentStatus.PROCESSING])
      .where('created_at', '<', cutoffDate.toISOString())
      .orderBy('created_at', 'asc')
      .execute();
  }

  // Create payment with guest data
  async createGuestPayment(paymentData: Omit<PaymentInsert, 'id' | 'created_at' | 'updated_at'> & {
    guest_data: any;
    guest_email: string;
  }): Promise<PaymentTable> {
    const data = {
      ...paymentData,
      guest_data: JSON.stringify(paymentData.guest_data),
      guest_email: paymentData.guest_email,
      id: this.generateId(),
      created_at: this.getCurrentTimestamp(),
      updated_at: this.getCurrentTimestamp(),
      is_guest_payment: 1 // SQLite boolean as integer - MUST BE LAST to override
    };

    console.log('💾 Creating guest payment with data:', {
      ...data,
      guest_data: '***HIDDEN***',
      client_secret: data.client_secret ? '***HIDDEN***' : null
    });

    const result = await this.db
      .insertInto('payments')
      .values(data as any) // Force type cast for SQLite boolean handling
      .returningAll()
      .executeTakeFirst();

    if (!result) {
      throw new Error('Failed to create guest payment');
    }

    return result;
  }

  // Search payments with filters
  async searchPayments(filters: {
    userId?: string;
    status?: PaymentStatus;
    providerId?: string;
    isGuest?: boolean;
    startDate?: Date;
    endDate?: Date;
    minAmount?: number;
    maxAmount?: number;
  }, limit = 50): Promise<PaymentTable[]> {
    let query = this.db.selectFrom('payments').selectAll();

    if (filters.userId) {
      query = query.where('user_id', '=', filters.userId);
    }
    if (filters.status) {
      query = query.where('status', '=', filters.status);
    }
    if (filters.providerId) {
      query = query.where('provider_id', '=', filters.providerId);
    }
    if (filters.isGuest !== undefined) {
      query = query.where('is_guest_payment', '=', filters.isGuest);
    }
    if (filters.startDate) {
      query = query.where('created_at', '>=', filters.startDate.toISOString());
    }
    if (filters.endDate) {
      query = query.where('created_at', '<=', filters.endDate.toISOString());
    }
    if (filters.minAmount) {
      query = query.where('amount_cents', '>=', filters.minAmount);
    }
    if (filters.maxAmount) {
      query = query.where('amount_cents', '<=', filters.maxAmount);
    }

    return await query
      .orderBy('created_at', 'desc')
      .limit(limit)
      .execute();
  }

  // Find recent payments (for debugging)
  async findRecent(limit = 10): Promise<PaymentTable[]> {
    return await this.db
      .selectFrom('payments')
      .selectAll()
      .orderBy('created_at', 'desc')
      .limit(limit)
      .execute();
  }

  // Find payments with filters and pagination
  async findWithFilters(
    filters: {
      user_id?: string;
      status?: string;
      provider_id?: string;
      search?: string;
    },
    pagination: {
      page: number;
      limit: number;
    }
  ): Promise<{ payments: PaymentTable[]; total: number }> {
    let query = this.db.selectFrom('payments').selectAll();

    // Apply filters
    if (filters.user_id) {
      query = query.where('user_id', '=', filters.user_id);
    }
    if (filters.status) {
      query = query.where('status', '=', filters.status);
    }
    if (filters.provider_id) {
      query = query.where('provider_id', '=', filters.provider_id);
    }
    if (filters.search) {
      // Search in payment ID, guest email, or description
      query = query.where((eb) =>
        eb.or([
          eb('id', 'like', `%${filters.search}%`),
          eb('guest_email', 'like', `%${filters.search}%`),
          eb('description', 'like', `%${filters.search}%`)
        ])
      );
    }

    // Get total count
    const totalQuery = query.select((eb) => eb.fn.count('id').as('count'));
    const totalResult = await totalQuery.executeTakeFirst();
    const total = Number(totalResult?.count || 0);

    // Apply pagination
    const offset = (pagination.page - 1) * pagination.limit;
    const payments = await query
      .orderBy('created_at', 'desc')
      .limit(pagination.limit)
      .offset(offset)
      .execute();

    return { payments, total };
  }

  // Count payments by status
  async countByStatus(status?: string): Promise<number> {
    let query = this.db.selectFrom('payments').select((eb) => eb.fn.count('id').as('count'));

    if (status) {
      query = query.where('status', '=', status);
    }

    const result = await query.executeTakeFirst();
    return Number(result?.count || 0);
  }

  // Get total revenue
  async getTotalRevenue(): Promise<number> {
    const result = await this.db
      .selectFrom('payments')
      .select((eb) => eb.fn.sum('amount_cents').as('total'))
      .where('status', '=', 'completed')
      .executeTakeFirst();

    return Number(result?.total || 0);
  }

  // Get provider statistics
  async getProviderStats(): Promise<Array<{ provider_id: string; count: number; total_amount: number }>> {
    const results = await this.db
      .selectFrom('payments')
      .select([
        'provider_id',
        (eb) => eb.fn.count('id').as('count'),
        (eb) => eb.fn.sum('amount_cents').as('total_amount')
      ])
      .groupBy('provider_id')
      .execute();

    return results.map(r => ({
      provider_id: r.provider_id,
      count: Number(r.count),
      total_amount: Number(r.total_amount || 0)
    }));
  }

  // Health check
  async healthCheck(): Promise<boolean> {
    try {
      await this.db.selectFrom('payments').select('id').limit(1).execute();
      return true;
    } catch {
      return false;
    }
  }
}
