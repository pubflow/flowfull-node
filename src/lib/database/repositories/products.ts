import { Kysely } from 'kysely';
import { BaseRepository } from './base';
import { Database, ProductTable, ProductInsert, ProductUpdate } from '../types';

export class ProductRepository extends BaseRepository<'products'> {
  constructor(db: Kysely<Database>) {
    super(db, 'products');
  }

  // Find product by ID
  async findById(id: string): Promise<ProductTable | null> {
    const result = await this.db
      .selectFrom('products')
      .selectAll()
      .where('id', '=', id)
      .executeTakeFirst();

    return result as ProductTable | null;
  }

  // Find active products
  async findActive(): Promise<ProductTable[]> {
    const results = await this.db
      .selectFrom('products')
      .selectAll()
      .where('is_active', '=', true)
      .orderBy('created_at', 'desc')
      .execute();

    return results as ProductTable[];
  }

  // Find subscription products
  async findSubscriptionProducts(): Promise<ProductTable[]> {
    const results = await this.db
      .selectFrom('products')
      .selectAll()
      .where('is_recurring', '=', true)
      .where('is_active', '=', true)
      .orderBy('created_at', 'desc')
      .execute();

    return results as ProductTable[];
  }

  // Find products by type
  async findByType(productType: string): Promise<ProductTable[]> {
    const results = await this.db
      .selectFrom('products')
      .selectAll()
      .where('product_type', '=', productType)
      .where('is_active', '=', true)
      .orderBy('created_at', 'desc')
      .execute();

    return results as ProductTable[];
  }

  // Create product (using base repository method)
  async createProduct(data: ProductInsert): Promise<ProductTable> {
    const productData = {
      ...data,
      id: this.generateId(),
      created_at: this.getCurrentTimestamp(),
      updated_at: this.getCurrentTimestamp()
    };

    const result = await this.db
      .insertInto('products')
      .values(productData as any)
      .returningAll()
      .executeTakeFirst();

    if (!result) {
      throw new Error('Failed to create product');
    }

    return result as ProductTable;
  }

  // Update product
  async update(id: string, data: ProductUpdate): Promise<ProductTable | null> {
    const updateData = {
      ...data,
      updated_at: this.getCurrentTimestamp()
    };

    const result = await this.db
      .updateTable('products')
      .set(updateData as any)
      .where('id', '=', id)
      .returningAll()
      .executeTakeFirst();

    return result as ProductTable | null;
  }

  // List products with pagination
  async list(options: {
    productType?: string;
    isRecurring?: boolean;
    isActive?: boolean;
    limit?: number;
    offset?: number;
  } = {}): Promise<{
    products: ProductTable[];
    total: number;
  }> {
    let query = this.db
      .selectFrom('products')
      .selectAll();

    // Apply filters
    if (options.productType) {
      query = query.where('product_type', '=', options.productType);
    }

    if (options.isRecurring !== undefined) {
      query = query.where('is_recurring', '=', options.isRecurring);
    }

    if (options.isActive !== undefined) {
      query = query.where('is_active', '=', options.isActive);
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
    const [products, countResult] = await Promise.all([
      query.execute(),
      countQuery
    ]);

    return {
      products: products as ProductTable[],
      total: countResult?.count || 0
    };
  }
}
