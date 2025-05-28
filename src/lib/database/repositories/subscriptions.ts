import { Kysely } from 'kysely';
import { BaseRepository } from './base';
import { Database, SubscriptionTable, SubscriptionInsert, SubscriptionUpdate, SubscriptionStatus } from '../types';

export class SubscriptionRepository extends BaseRepository<'subscriptions'> {
  constructor(db: Kysely<Database>) {
    super(db, 'subscriptions');
  }

  // Find subscriptions by user ID
  async findByUserId(userId: string): Promise<SubscriptionTable[]> {
    const results = await this.db
      .selectFrom('subscriptions')
      .selectAll()
      .where('user_id', '=', userId)
      .orderBy('created_at', 'desc')
      .execute();

    return results as SubscriptionTable[];
  }

  // Find subscriptions by organization ID
  async findByOrganizationId(organizationId: string): Promise<SubscriptionTable[]> {
    const results = await this.db
      .selectFrom('subscriptions')
      .selectAll()
      .where('organization_id', '=', organizationId)
      .orderBy('created_at', 'desc')
      .execute();

    return results as SubscriptionTable[];
  }

  // Find subscriptions by customer ID (supports both users and guests)
  async findByCustomerId(customerId: string): Promise<SubscriptionTable[]> {
    const results = await this.db
      .selectFrom('subscriptions')
      .selectAll()
      .where('customer_id', '=', customerId)
      .orderBy('created_at', 'desc')
      .execute();

    return results as SubscriptionTable[];
  }

  // Find guest subscriptions by email
  async findGuestsByEmail(email: string): Promise<SubscriptionTable[]> {
    const results = await this.db
      .selectFrom('subscriptions')
      .innerJoin('provider_customers', 'subscriptions.customer_id', 'provider_customers.id')
      .selectAll('subscriptions')
      .where('provider_customers.is_guest', '=', true)
      .where('provider_customers.guest_email', '=', email)
      .orderBy('subscriptions.created_at', 'desc')
      .execute();

    return results as SubscriptionTable[];
  }

  // Find subscription by provider subscription ID
  async findByProviderSubscriptionId(providerSubscriptionId: string, providerId: string): Promise<SubscriptionTable | null> {
    const result = await this.db
      .selectFrom('subscriptions')
      .selectAll()
      .where('provider_subscription_id', '=', providerSubscriptionId)
      .where('provider_id', '=', providerId)
      .executeTakeFirst();

    return result as SubscriptionTable | null;
  }

  // Update subscription status
  async updateStatus(id: string, status: SubscriptionStatus, metadata?: any): Promise<SubscriptionTable | null> {
    console.log('📝 Updating subscription status:', { id, status });

    const updateData: any = {
      status,
      updated_at: this.getCurrentTimestamp()
    };

    if (metadata) {
      updateData.metadata = JSON.stringify(metadata);
    }

    const result = await this.db
      .updateTable('subscriptions')
      .set(updateData)
      .where('id', '=', id)
      .returningAll()
      .executeTakeFirst();

    if (result) {
      console.log('✅ Subscription status updated successfully');
    }

    return result as SubscriptionTable | null;
  }

  // Cancel subscription at period end
  async cancelAtPeriodEnd(id: string, cancel: boolean = true): Promise<SubscriptionTable | null> {
    console.log('📝 Setting cancel_at_period_end:', { id, cancel });

    const result = await this.db
      .updateTable('subscriptions')
      .set({
        cancel_at_period_end: cancel,
        updated_at: this.getCurrentTimestamp()
      } as any)
      .where('id', '=', id)
      .returningAll()
      .executeTakeFirst();

    if (result) {
      console.log('✅ Subscription cancel_at_period_end updated successfully');
    }

    return result as SubscriptionTable | null;
  }

  // Update subscription period
  async updatePeriod(
    id: string,
    currentPeriodStart: string,
    currentPeriodEnd: string
  ): Promise<SubscriptionTable | null> {
    console.log('📝 Updating subscription period:', { id, currentPeriodStart, currentPeriodEnd });

    const result = await this.db
      .updateTable('subscriptions')
      .set({
        current_period_start: currentPeriodStart,
        current_period_end: currentPeriodEnd,
        updated_at: this.getCurrentTimestamp()
      } as any)
      .where('id', '=', id)
      .returningAll()
      .executeTakeFirst();

    if (result) {
      console.log('✅ Subscription period updated successfully');
    }

    return result as SubscriptionTable | null;
  }

  // Get active subscriptions
  async getActiveSubscriptions(): Promise<SubscriptionTable[]> {
    const results = await this.db
      .selectFrom('subscriptions')
      .selectAll()
      .where('status', '=', SubscriptionStatus.ACTIVE)
      .orderBy('created_at', 'desc')
      .execute();

    return results as SubscriptionTable[];
  }

  // Get subscriptions expiring soon
  async getExpiringSubscriptions(daysAhead: number = 7): Promise<SubscriptionTable[]> {
    const futureDate = new Date();
    futureDate.setDate(futureDate.getDate() + daysAhead);

    const results = await this.db
      .selectFrom('subscriptions')
      .selectAll()
      .where('status', '=', SubscriptionStatus.ACTIVE)
      .where('current_period_end', '<=', futureDate.toISOString())
      .orderBy('current_period_end', 'asc')
      .execute();

    return results as SubscriptionTable[];
  }

  // Convert guest subscriptions to user (when guest registers)
  async convertGuestToUser(guestEmail: string, userId: string): Promise<SubscriptionTable[]> {
    console.log('🔄 Converting guest subscriptions to user:', { guestEmail, userId });

    // First, get the guest customer
    const guestCustomer = await this.db
      .selectFrom('provider_customers')
      .selectAll()
      .where('is_guest', '=', true)
      .where('guest_email', '=', guestEmail)
      .executeTakeFirst();

    if (!guestCustomer) {
      console.log('ℹ️ No guest customer found for email:', guestEmail);
      return [];
    }

    // Update subscriptions to point to the user
    const results = await this.db
      .updateTable('subscriptions')
      .set({
        user_id: userId,
        updated_at: this.getCurrentTimestamp()
      } as any)
      .where('customer_id', '=', guestCustomer.id)
      .returningAll()
      .execute();

    console.log(`✅ Converted ${results.length} guest subscriptions to user`);
    return results as SubscriptionTable[];
  }

  // Find subscriptions due for renewal
  async findDueForRenewal(limit: number = 100): Promise<SubscriptionTable[]> {
    const result = await this.db
      .selectFrom('subscriptions')
      .selectAll()
      .where('next_billing_date', '<=', new Date().toISOString())
      .where('billing_status', '=', 'active')
      .where('status', 'in', ['active', 'trialing'])
      .limit(limit)
      .execute();

    return result as SubscriptionTable[];
  }

  // Find subscriptions ready for retry
  async findReadyForRetry(limit: number = 50): Promise<SubscriptionTable[]> {
    const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000).toISOString();

    const result = await this.db
      .selectFrom('subscriptions')
      .selectAll()
      .where('billing_status', '=', 'past_due')
      .where((eb) => eb('billing_retry_count', '<', eb.ref('max_retry_attempts')))
      .where('last_billing_attempt', '<=', oneHourAgo)
      .limit(limit)
      .execute();

    return result as SubscriptionTable[];
  }

  // Update billing fields
  async updateBillingFields(
    id: string,
    updates: {
      billing_interval?: string;
      interval_multiplier?: number;
      next_billing_date?: string;
      last_billing_attempt?: string;
      billing_retry_count?: number;
      billing_status?: string;
      current_period_start?: string;
      current_period_end?: string;
    }
  ): Promise<SubscriptionTable | null> {
    const result = await this.db
      .updateTable('subscriptions')
      .set({
        ...updates,
        updated_at: this.getCurrentTimestamp()
      } as any)
      .where('id', '=', id)
      .returningAll()
      .executeTakeFirst();

    return result as SubscriptionTable | null;
  }

  // List subscriptions with pagination and filters
  async list(options: {
    userId?: string;
    organizationId?: string;
    customerId?: string;
    status?: SubscriptionStatus;
    isGuest?: boolean;
    guestEmail?: string;
    limit?: number;
    offset?: number;
  } = {}): Promise<{
    subscriptions: SubscriptionTable[];
    total: number;
  }> {
    let query = this.db
      .selectFrom('subscriptions')
      .selectAll('subscriptions');

    // Apply filters
    if (options.userId) {
      query = query.where('subscriptions.user_id', '=', options.userId);
    }

    if (options.organizationId) {
      query = query.where('subscriptions.organization_id', '=', options.organizationId);
    }

    if (options.customerId) {
      query = query.where('subscriptions.customer_id', '=', options.customerId);
    }

    if (options.status) {
      query = query.where('subscriptions.status', '=', options.status);
    }

    if (options.isGuest !== undefined || options.guestEmail) {
      query = query.innerJoin('provider_customers', 'subscriptions.customer_id', 'provider_customers.id');

      if (options.isGuest !== undefined) {
        query = query.where('provider_customers.is_guest', '=', options.isGuest);
      }

      if (options.guestEmail) {
        query = query.where('provider_customers.guest_email', '=', options.guestEmail);
      }
    }

    // Get total count
    const countQuery = query
      .select(({ fn }) => [fn.count<number>('subscriptions.id').as('count')])
      .executeTakeFirst();

    // Apply pagination and ordering
    query = query.orderBy('subscriptions.created_at', 'desc');

    if (options.limit) {
      query = query.limit(options.limit);
    }
    if (options.offset) {
      query = query.offset(options.offset);
    }

    // Execute queries
    const [subscriptions, countResult] = await Promise.all([
      query.execute(),
      countQuery
    ]);

    return {
      subscriptions: subscriptions as SubscriptionTable[],
      total: countResult?.count || 0
    };
  }
}
