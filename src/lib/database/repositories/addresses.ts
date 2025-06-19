import { Kysely } from 'kysely';
import { Database } from '../types';
import { getDatabase } from '../connection';

export interface Address {
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

export interface CreateAddressData {
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
}

export interface UpdateAddressData {
  address_type?: 'billing' | 'shipping' | 'both';
  is_default?: boolean;
  name?: string;
  line1?: string;
  line2?: string | null;
  city?: string;
  state?: string | null;
  postal_code?: string;
  country?: string;
  phone?: string | null;
  email?: string | null;
  guest_name?: string | null;
}

export interface AddressFilters {
  address_type?: string;
  limit?: number;
  offset?: number;
}

export class AddressRepository {
  constructor(private db: Kysely<Database>) {}

  async findById(id: string): Promise<Address | null> {
    const result = await this.db
      .selectFrom('addresses')
      .selectAll()
      .where('id', '=', id)
      .executeTakeFirst();

    return result ? this.mapToAddress(result) : null;
  }

  async findByUserId(userId: string, filters: AddressFilters = {}): Promise<Address[]> {
    let query = this.db
      .selectFrom('addresses')
      .selectAll()
      .where('user_id', '=', userId)
      .where('is_guest', '=', false);

    if (filters.address_type) {
      query = query.where('address_type', '=', filters.address_type as any);
    }

    if (filters.limit) {
      query = query.limit(filters.limit);
    }

    if (filters.offset) {
      query = query.offset(filters.offset);
    }

    query = query.orderBy('is_default', 'desc').orderBy('created_at', 'desc');

    const results = await query.execute();
    return results.map(this.mapToAddress);
  }

  async findGuestsByEmail(guestEmail: string, filters: AddressFilters = {}): Promise<Address[]> {
    let query = this.db
      .selectFrom('addresses')
      .selectAll()
      .where('guest_email', '=', guestEmail)
      .where('is_guest', '=', true);

    if (filters.address_type) {
      query = query.where('address_type', '=', filters.address_type as any);
    }

    if (filters.limit) {
      query = query.limit(filters.limit);
    }

    if (filters.offset) {
      query = query.offset(filters.offset);
    }

    query = query.orderBy('is_default', 'desc').orderBy('created_at', 'desc');

    const results = await query.execute();
    return results.map(this.mapToAddress);
  }

  async countByUserId(userId: string, filters: Omit<AddressFilters, 'limit' | 'offset'> = {}): Promise<number> {
    let query = this.db
      .selectFrom('addresses')
      .select(({ fn }) => [fn.count<number>('id').as('count')])
      .where('user_id', '=', userId)
      .where('is_guest', '=', false);

    if (filters.address_type) {
      query = query.where('address_type', '=', filters.address_type as any);
    }

    const result = await query.executeTakeFirst();
    return result?.count || 0;
  }

  async countGuestsByEmail(guestEmail: string, filters: Omit<AddressFilters, 'limit' | 'offset'> = {}): Promise<number> {
    let query = this.db
      .selectFrom('addresses')
      .select(({ fn }) => [fn.count<number>('id').as('count')])
      .where('guest_email', '=', guestEmail)
      .where('is_guest', '=', true);

    if (filters.address_type) {
      query = query.where('address_type', '=', filters.address_type as any);
    }

    const result = await query.executeTakeFirst();
    return result?.count || 0;
  }

  async create(data: CreateAddressData): Promise<Address> {
    const now = new Date().toISOString();
    
    await this.db
      .insertInto('addresses')
      .values({
        ...data,
        created_at: now,
        updated_at: now
      })
      .execute();

    const created = await this.findById(data.id);
    if (!created) {
      throw new Error('Failed to create address');
    }

    return created;
  }

  async update(id: string, data: UpdateAddressData): Promise<Address> {
    const now = new Date().toISOString();
    
    await this.db
      .updateTable('addresses')
      .set({
        ...data,
        updated_at: now
      })
      .where('id', '=', id)
      .execute();

    const updated = await this.findById(id);
    if (!updated) {
      throw new Error('Address not found after update');
    }

    return updated;
  }

  async delete(id: string): Promise<void> {
    await this.db
      .deleteFrom('addresses')
      .where('id', '=', id)
      .execute();
  }

  async unsetDefaultForUser(userId: string, addressType: string): Promise<void> {
    await this.db
      .updateTable('addresses')
      .set({ is_default: false })
      .where('user_id', '=', userId)
      .where('address_type', '=', addressType as any)
      .where('is_guest', '=', false)
      .execute();
  }

  async unsetDefaultForGuest(guestEmail: string, addressType: string): Promise<void> {
    await this.db
      .updateTable('addresses')
      .set({ is_default: false })
      .where('guest_email', '=', guestEmail)
      .where('address_type', '=', addressType as any)
      .where('is_guest', '=', true)
      .execute();
  }

  private mapToAddress(row: any): Address {
    return {
      id: row.id,
      user_id: row.user_id,
      organization_id: row.organization_id,
      address_type: row.address_type,
      is_default: Boolean(row.is_default),
      name: row.name,
      line1: row.line1,
      line2: row.line2,
      city: row.city,
      state: row.state,
      postal_code: row.postal_code,
      country: row.country,
      phone: row.phone,
      email: row.email,
      is_guest: Boolean(row.is_guest),
      guest_email: row.guest_email,
      guest_name: row.guest_name,
      created_at: row.created_at,
      updated_at: row.updated_at
    };
  }
}

// Export convenience function
export async function getAddressRepository(): Promise<AddressRepository> {
  const db = await getDatabase();
  return new AddressRepository(db);
}
