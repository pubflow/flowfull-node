import { Kysely } from 'kysely';
import { BaseRepository } from './base';
import { Database } from '../types';

// Customer types based on native-payments schema
export interface CustomerTable {
  id: string;
  user_id: string | null;
  organization_id: string | null;
  provider_id: string;
  provider_customer_id: string;
  guest_email: string | null;
  guest_name: string | null;
  is_guest: boolean;
  metadata: string;
  created_at: string;
  updated_at: string;
}

export interface CustomerInsert {
  id: string;
  user_id: string | null;
  organization_id: string | null;
  provider_id: string;
  provider_customer_id: string;
  guest_email: string | null;
  guest_name: string | null;
  is_guest: boolean;
  metadata: string;
  created_at: string;
  updated_at: string;
}

export interface CustomerUpdate {
  user_id?: string | null;
  organization_id?: string | null;
  guest_email?: string | null;
  guest_name?: string | null;
  metadata?: string;
  updated_at: string;
}

export class CustomerRepository extends BaseRepository {
  constructor(db: Kysely<Database>) {
    super(db);
  }

  // Create customer
  async create(data: CustomerInsert): Promise<CustomerTable> {
    console.log('💾 Creating customer in database...');
    
    const result = await this.db
      .insertInto('provider_customers')
      .values(data as any) // Type cast for SQLite compatibility
      .returningAll()
      .executeTakeFirst();

    if (!result) {
      throw new Error('Failed to create customer');
    }

    console.log('✅ Customer created successfully:', result.id);
    return result as CustomerTable;
  }

  // Find customer by ID
  async findById(id: string): Promise<CustomerTable | null> {
    const result = await this.db
      .selectFrom('provider_customers')
      .selectAll()
      .where('id', '=', id)
      .executeTakeFirst();

    return result as CustomerTable | null;
  }

  // Find customer by provider customer ID
  async findByProviderCustomerId(providerId: string, providerCustomerId: string): Promise<CustomerTable | null> {
    const result = await this.db
      .selectFrom('provider_customers')
      .selectAll()
      .where('provider_id', '=', providerId)
      .where('provider_customer_id', '=', providerCustomerId)
      .executeTakeFirst();

    return result as CustomerTable | null;
  }

  // Find customers by user ID
  async findByUserId(userId: string): Promise<CustomerTable[]> {
    const results = await this.db
      .selectFrom('provider_customers')
      .selectAll()
      .where('user_id', '=', userId)
      .execute();

    return results as CustomerTable[];
  }

  // Find guest customers by email
  async findGuestsByEmail(email: string): Promise<CustomerTable[]> {
    const results = await this.db
      .selectFrom('provider_customers')
      .selectAll()
      .where('is_guest', '=', 1) // SQLite boolean as integer
      .where('guest_email', '=', email)
      .execute();

    return results as CustomerTable[];
  }

  // Update customer
  async update(id: string, data: CustomerUpdate): Promise<CustomerTable | null> {
    console.log('💾 Updating customer:', id);
    
    const result = await this.db
      .updateTable('provider_customers')
      .set(data as any) // Type cast for SQLite compatibility
      .where('id', '=', id)
      .returningAll()
      .executeTakeFirst();

    if (result) {
      console.log('✅ Customer updated successfully');
    }

    return result as CustomerTable | null;
  }

  // Convert guest to user (when guest registers)
  async convertGuestToUser(customerId: string, userId: string): Promise<CustomerTable | null> {
    console.log('🔄 Converting guest customer to user:', { customerId, userId });
    
    const result = await this.db
      .updateTable('provider_customers')
      .set({
        user_id: userId,
        is_guest: 0, // SQLite boolean as integer
        guest_email: null,
        guest_name: null,
        updated_at: this.getCurrentTimestamp()
      } as any)
      .where('id', '=', customerId)
      .where('is_guest', '=', 1) // Only convert if it's actually a guest
      .returningAll()
      .executeTakeFirst();

    if (result) {
      console.log('✅ Guest customer converted to user successfully');
    }

    return result as CustomerTable | null;
  }

  // Delete customer
  async delete(id: string): Promise<boolean> {
    console.log('🗑️ Deleting customer:', id);
    
    const result = await this.db
      .deleteFrom('provider_customers')
      .where('id', '=', id)
      .executeTakeFirst();

    const deleted = Number(result.numDeletedRows) > 0;
    if (deleted) {
      console.log('✅ Customer deleted successfully');
    }

    return deleted;
  }

  // List customers with pagination
  async list(options: {
    userId?: string;
    isGuest?: boolean;
    limit?: number;
    offset?: number;
  } = {}): Promise<{
    customers: CustomerTable[];
    total: number;
  }> {
    let query = this.db
      .selectFrom('provider_customers')
      .selectAll();

    // Apply filters
    if (options.userId) {
      query = query.where('user_id', '=', options.userId);
    }

    if (options.isGuest !== undefined) {
      query = query.where('is_guest', '=', options.isGuest ? 1 : 0);
    }

    // Get total count
    const countQuery = query
      .select(({ fn }) => [fn.count<number>('id').as('count')])
      .executeTakeFirst();

    // Apply pagination
    if (options.limit) {
      query = query.limit(options.limit);
    }
    if (options.offset) {
      query = query.offset(options.offset);
    }

    // Execute queries
    const [customers, countResult] = await Promise.all([
      query.execute(),
      countQuery
    ]);

    return {
      customers: customers as CustomerTable[],
      total: countResult?.count || 0
    };
  }

  // Clean up old guest customers (optional maintenance)
  async cleanupOldGuests(daysOld: number = 30): Promise<number> {
    console.log(`🧹 Cleaning up guest customers older than ${daysOld} days...`);
    
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - daysOld);
    
    const result = await this.db
      .deleteFrom('provider_customers')
      .where('is_guest', '=', 1)
      .where('created_at', '<', cutoffDate.toISOString())
      .executeTakeFirst();

    const deletedCount = Number(result.numDeletedRows);
    console.log(`✅ Cleaned up ${deletedCount} old guest customers`);
    
    return deletedCount;
  }
}
