import { Kysely, Insertable, Updateable, Selectable } from 'kysely';
import { nanoid } from 'nanoid';
import type { Database } from '../types';

export abstract class BaseRepository<T extends keyof Database> {
  protected db: Kysely<Database>;
  protected tableName: T;

  constructor(db: Kysely<Database>, tableName: T) {
    this.db = db;
    this.tableName = tableName;
  }

  // Generate a new ID
  protected generateId(): string {
    return nanoid();
  }

  // Get current timestamp
  protected getCurrentTimestamp(): string {
    return new Date().toISOString();
  }

  // Find by ID
  async findById(id: string): Promise<Selectable<Database[T]> | null> {
    const result = await this.db
      .selectFrom(this.tableName)
      .selectAll()
      .where('id' as any, '=', id)
      .executeTakeFirst();

    return result || null;
  }

  // Find all with optional limit and offset
  async findAll(limit = 100, offset = 0): Promise<Selectable<Database[T]>[]> {
    return await this.db
      .selectFrom(this.tableName)
      .selectAll()
      .limit(limit)
      .offset(offset)
      .execute();
  }

  // Count total records
  async count(): Promise<number> {
    const result = await this.db
      .selectFrom(this.tableName)
      .select(this.db.fn.count('id').as('count'))
      .executeTakeFirst();

    return Number(result?.count || 0);
  }

  // Create a new record
  async create(data: Insertable<Database[T]>): Promise<Selectable<Database[T]>> {
    const now = this.getCurrentTimestamp();
    const recordData = {
      ...data,
      id: this.generateId(),
      created_at: now,
      updated_at: now
    } as any;

    const result = await this.db
      .insertInto(this.tableName)
      .values(recordData)
      .returningAll()
      .executeTakeFirst();

    if (!result) {
      throw new Error(`Failed to create record in ${this.tableName}`);
    }

    return result;
  }

  // Update a record by ID
  async update(id: string, data: Updateable<Database[T]>): Promise<Selectable<Database[T]> | null> {
    const updateData = {
      ...data,
      updated_at: this.getCurrentTimestamp()
    } as any;

    const result = await this.db
      .updateTable(this.tableName)
      .set(updateData)
      .where('id' as any, '=', id)
      .returningAll()
      .executeTakeFirst();

    return result || null;
  }

  // Delete a record by ID
  async delete(id: string): Promise<boolean> {
    const result = await this.db
      .deleteFrom(this.tableName)
      .where('id' as any, '=', id)
      .execute();

    return Number(result.numDeletedRows || 0) > 0;
  }

  // Check if record exists
  async exists(id: string): Promise<boolean> {
    const result = await this.db
      .selectFrom(this.tableName)
      .select('id' as any)
      .where('id' as any, '=', id)
      .executeTakeFirst();

    return !!result;
  }

  // Find records with pagination
  async paginate(page = 1, pageSize = 20): Promise<{
    data: Selectable<Database[T]>[];
    total: number;
    page: number;
    pageSize: number;
    totalPages: number;
  }> {
    const offset = (page - 1) * pageSize;
    
    const [data, total] = await Promise.all([
      this.findAll(pageSize, offset),
      this.count()
    ]);

    return {
      data,
      total,
      page,
      pageSize,
      totalPages: Math.ceil(total / pageSize)
    };
  }

  // Batch create records
  async createMany(records: Insertable<Database[T]>[]): Promise<Selectable<Database[T]>[]> {
    if (records.length === 0) {
      return [];
    }

    const now = this.getCurrentTimestamp();
    const recordsData = records.map(record => ({
      ...record,
      id: this.generateId(),
      created_at: now,
      updated_at: now
    })) as any[];

    const results = await this.db
      .insertInto(this.tableName)
      .values(recordsData)
      .returningAll()
      .execute();

    return results;
  }

  // Batch update records
  async updateMany(updates: Array<{ id: string; data: Updateable<Database[T]> }>): Promise<number> {
    if (updates.length === 0) {
      return 0;
    }

    let updatedCount = 0;
    const now = this.getCurrentTimestamp();

    // Execute updates in parallel
    await Promise.all(
      updates.map(async ({ id, data }) => {
        const updateData = {
          ...data,
          updated_at: now
        } as any;

        const result = await this.db
          .updateTable(this.tableName)
          .set(updateData)
          .where('id' as any, '=', id)
          .execute();

        if (Number(result.numUpdatedRows || 0) > 0) {
          updatedCount++;
        }
      })
    );

    return updatedCount;
  }

  // Batch delete records
  async deleteMany(ids: string[]): Promise<number> {
    if (ids.length === 0) {
      return 0;
    }

    const result = await this.db
      .deleteFrom(this.tableName)
      .where('id' as any, 'in', ids)
      .execute();

    return Number(result.numDeletedRows || 0);
  }

  // Find records by field
  async findBy<K extends keyof Database[T]>(
    field: K,
    value: Database[T][K],
    limit = 100
  ): Promise<Selectable<Database[T]>[]> {
    return await this.db
      .selectFrom(this.tableName)
      .selectAll()
      .where(field as any, '=', value)
      .limit(limit)
      .execute();
  }

  // Find one record by field
  async findOneBy<K extends keyof Database[T]>(
    field: K,
    value: Database[T][K]
  ): Promise<Selectable<Database[T]> | null> {
    const result = await this.db
      .selectFrom(this.tableName)
      .selectAll()
      .where(field as any, '=', value)
      .executeTakeFirst();

    return result || null;
  }

  // Search records with multiple conditions
  async search(conditions: Partial<Database[T]>, limit = 100): Promise<Selectable<Database[T]>[]> {
    let query = this.db.selectFrom(this.tableName).selectAll();

    // Add where conditions
    Object.entries(conditions).forEach(([key, value]) => {
      if (value !== undefined && value !== null) {
        query = query.where(key as any, '=', value);
      }
    });

    return await query.limit(limit).execute();
  }

  // Get records created within a date range
  async findByDateRange(
    startDate: Date,
    endDate: Date,
    limit = 100
  ): Promise<Selectable<Database[T]>[]> {
    return await this.db
      .selectFrom(this.tableName)
      .selectAll()
      .where('created_at' as any, '>=', startDate.toISOString())
      .where('created_at' as any, '<=', endDate.toISOString())
      .orderBy('created_at' as any, 'desc')
      .limit(limit)
      .execute();
  }

  // Get recent records
  async findRecent(limit = 20): Promise<Selectable<Database[T]>[]> {
    return await this.db
      .selectFrom(this.tableName)
      .selectAll()
      .orderBy('created_at' as any, 'desc')
      .limit(limit)
      .execute();
  }
}
