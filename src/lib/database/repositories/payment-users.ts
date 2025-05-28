import { Kysely } from 'kysely';
import { BaseRepository } from './base';
import type { Database, PaymentUserTable, PaymentUserInsert, PaymentUserUpdate } from '../types';

export class PaymentUserRepository extends BaseRepository<'payment_users'> {
  constructor(db: Kysely<Database>) {
    super(db, 'payment_users');
  }

  // Find user by Flowless user ID
  async findByFlowlessUserId(flowlessUserId: string): Promise<PaymentUserTable | null> {
    return await this.findOneBy('flowless_user_id', flowlessUserId);
  }

  // Find user by email
  async findByEmail(email: string): Promise<PaymentUserTable | null> {
    return await this.findOneBy('email', email);
  }

  // Find users by type
  async findByUserType(userType: string, limit = 100): Promise<PaymentUserTable[]> {
    return await this.findBy('user_type', userType, limit);
  }

  // Find guest users
  async findGuestUsers(limit = 100): Promise<PaymentUserTable[]> {
    return await this.findBy('is_guest', true, limit);
  }

  // Find regular (non-guest) users
  async findRegularUsers(limit = 100): Promise<PaymentUserTable[]> {
    return await this.findBy('is_guest', false, limit);
  }

  // Create or update user from Flowless data
  async upsertFromFlowless(flowlessUser: {
    id: string;
    email: string;
    name: string;
    userType?: string;
  }): Promise<PaymentUserTable> {
    // Check if user already exists
    const existingUser = await this.findByFlowlessUserId(flowlessUser.id);
    
    if (existingUser) {
      // Update existing user
      const updatedUser = await this.update(existingUser.id, {
        email: flowlessUser.email,
        name: flowlessUser.name,
        user_type: flowlessUser.userType || 'individual',
        updated_at: this.getCurrentTimestamp()
      });
      
      if (!updatedUser) {
        throw new Error('Failed to update payment user');
      }
      
      return updatedUser;
    } else {
      // Create new user
      const userData: PaymentUserInsert = {
        id: this.generateId(),
        flowless_user_id: flowlessUser.id,
        email: flowlessUser.email,
        name: flowlessUser.name,
        user_type: flowlessUser.userType || 'individual',
        is_guest: false,
        created_at: this.getCurrentTimestamp(),
        updated_at: this.getCurrentTimestamp()
      };
      
      const result = await this.db
        .insertInto('payment_users')
        .values(userData)
        .returningAll()
        .executeTakeFirst();
      
      if (!result) {
        throw new Error('Failed to create payment user');
      }
      
      return result;
    }
  }

  // Create guest user
  async createGuestUser(guestData: {
    email: string;
    name: string;
  }): Promise<PaymentUserTable> {
    const userData: PaymentUserInsert = {
      id: this.generateId(),
      flowless_user_id: `guest_${this.generateId()}`,
      email: guestData.email,
      name: guestData.name,
      user_type: 'individual',
      is_guest: true,
      created_at: this.getCurrentTimestamp(),
      updated_at: this.getCurrentTimestamp()
    };
    
    const result = await this.db
      .insertInto('payment_users')
      .values(userData)
      .returningAll()
      .executeTakeFirst();
    
    if (!result) {
      throw new Error('Failed to create guest user');
    }
    
    return result;
  }

  // Convert guest user to regular user
  async convertGuestToRegular(
    guestUserId: string, 
    flowlessUserId: string
  ): Promise<PaymentUserTable | null> {
    const guestUser = await this.findById(guestUserId);
    
    if (!guestUser || !guestUser.is_guest) {
      throw new Error('User is not a guest user');
    }
    
    // Check if Flowless user already exists
    const existingUser = await this.findByFlowlessUserId(flowlessUserId);
    if (existingUser) {
      throw new Error('Flowless user already has a payment user');
    }
    
    return await this.update(guestUserId, {
      flowless_user_id: flowlessUserId,
      is_guest: false,
      updated_at: this.getCurrentTimestamp()
    });
  }

  // Update user profile
  async updateProfile(
    userId: string, 
    profileData: {
      email?: string;
      name?: string;
      userType?: string;
    }
  ): Promise<PaymentUserTable | null> {
    const updateData: PaymentUserUpdate = {
      updated_at: this.getCurrentTimestamp()
    };
    
    if (profileData.email) {
      updateData.email = profileData.email;
    }
    if (profileData.name) {
      updateData.name = profileData.name;
    }
    if (profileData.userType) {
      updateData.user_type = profileData.userType;
    }
    
    return await this.update(userId, updateData);
  }

  // Search users by name or email
  async searchUsers(query: string, limit = 50): Promise<PaymentUserTable[]> {
    const searchTerm = `%${query.toLowerCase()}%`;
    
    return await this.db
      .selectFrom('payment_users')
      .selectAll()
      .where((eb) => eb.or([
        eb('name', 'ilike', searchTerm),
        eb('email', 'ilike', searchTerm)
      ]))
      .orderBy('name', 'asc')
      .limit(limit)
      .execute();
  }

  // Get user statistics
  async getUserStats() {
    const [totalUsers, guestUsers, regularUsers, usersByType] = await Promise.all([
      this.count(),
      this.db
        .selectFrom('payment_users')
        .select(this.db.fn.count('id').as('count'))
        .where('is_guest', '=', true)
        .executeTakeFirst(),
      this.db
        .selectFrom('payment_users')
        .select(this.db.fn.count('id').as('count'))
        .where('is_guest', '=', false)
        .executeTakeFirst(),
      this.db
        .selectFrom('payment_users')
        .select([
          'user_type',
          this.db.fn.count('id').as('count')
        ])
        .groupBy('user_type')
        .execute()
    ]);

    return {
      total_users: totalUsers,
      guest_users: Number(guestUsers?.count || 0),
      regular_users: Number(regularUsers?.count || 0),
      users_by_type: usersByType.map(row => ({
        user_type: row.user_type,
        count: Number(row.count)
      }))
    };
  }

  // Find users with payments
  async findUsersWithPayments(limit = 100): Promise<PaymentUserTable[]> {
    return await this.db
      .selectFrom('payment_users')
      .selectAll()
      .where('id', 'in', (eb) =>
        eb.selectFrom('payments')
          .select('user_id')
          .where('user_id', 'is not', null)
          .distinct()
      )
      .orderBy('created_at', 'desc')
      .limit(limit)
      .execute();
  }

  // Find users without payments
  async findUsersWithoutPayments(limit = 100): Promise<PaymentUserTable[]> {
    return await this.db
      .selectFrom('payment_users')
      .selectAll()
      .where('id', 'not in', (eb) =>
        eb.selectFrom('payments')
          .select('user_id')
          .where('user_id', 'is not', null)
          .distinct()
      )
      .orderBy('created_at', 'desc')
      .limit(limit)
      .execute();
  }

  // Get user with payment summary
  async getUserWithPaymentSummary(userId: string): Promise<{
    user: PaymentUserTable;
    payment_summary: {
      total_payments: number;
      total_amount: number;
      successful_payments: number;
      failed_payments: number;
      last_payment_date: string | null;
    };
  } | null> {
    const user = await this.findById(userId);
    if (!user) {
      return null;
    }

    const paymentSummary = await this.db
      .selectFrom('payments')
      .select([
        this.db.fn.count('id').as('total_payments'),
        this.db.fn.sum('amount_cents').as('total_amount'),
        this.db.fn.count('id').filterWhere('status', '=', 'succeeded').as('successful_payments'),
        this.db.fn.count('id').filterWhere('status', '=', 'failed').as('failed_payments'),
        this.db.fn.max('created_at').as('last_payment_date')
      ])
      .where('user_id', '=', userId)
      .executeTakeFirst();

    return {
      user,
      payment_summary: {
        total_payments: Number(paymentSummary?.total_payments || 0),
        total_amount: Number(paymentSummary?.total_amount || 0),
        successful_payments: Number(paymentSummary?.successful_payments || 0),
        failed_payments: Number(paymentSummary?.failed_payments || 0),
        last_payment_date: paymentSummary?.last_payment_date || null
      }
    };
  }

  // Clean up old guest users (without payments)
  async cleanupOldGuestUsers(olderThanDays = 30): Promise<number> {
    const cutoffDate = new Date(Date.now() - olderThanDays * 24 * 60 * 60 * 1000);
    
    // Find guest users older than cutoff date without payments
    const oldGuestUsers = await this.db
      .selectFrom('payment_users')
      .select('id')
      .where('is_guest', '=', true)
      .where('created_at', '<', cutoffDate.toISOString())
      .where('id', 'not in', (eb) =>
        eb.selectFrom('payments')
          .select('user_id')
          .where('user_id', 'is not', null)
          .distinct()
      )
      .execute();

    if (oldGuestUsers.length === 0) {
      return 0;
    }

    const userIds = oldGuestUsers.map(user => user.id);
    return await this.deleteMany(userIds);
  }

  // Find duplicate users by email
  async findDuplicateUsers(): Promise<Array<{ email: string; count: number; user_ids: string[] }>> {
    const duplicates = await this.db
      .selectFrom('payment_users')
      .select([
        'email',
        this.db.fn.count('id').as('count')
      ])
      .groupBy('email')
      .having(this.db.fn.count('id'), '>', 1)
      .execute();

    const result = [];
    for (const duplicate of duplicates) {
      const users = await this.findBy('email', duplicate.email);
      result.push({
        email: duplicate.email,
        count: Number(duplicate.count),
        user_ids: users.map(user => user.id)
      });
    }

    return result;
  }
}
