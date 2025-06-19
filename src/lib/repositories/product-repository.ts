import { Database } from 'bun:sqlite';
import { getDatabase } from '../database/connection';

export interface Product {
  id: string;
  name: string;
  description?: string;
  product_type: 'physical' | 'digital' | 'service' | 'subscription';
  is_recurring: number; // 0 or 1 (boolean)
  price_cents: number;
  currency: string;
  billing_interval?: 'daily' | 'weekly' | 'monthly' | 'yearly';
  trial_days?: number;
  image?: string;
  gallery?: string; // JSON array
  category_id?: string;
  parent_product_id?: string;
  variations?: string; // JSON array
  metadata?: string; // JSON string
  is_active: number; // 0 or 1 (boolean)
  created_at: string;
  updated_at: string;
}

export interface CreateProductRequest {
  id?: string;
  name: string;
  description?: string;
  product_type: 'physical' | 'digital' | 'service' | 'subscription';
  is_recurring?: boolean;
  price_cents: number;
  currency?: string;
  billing_interval?: 'daily' | 'weekly' | 'monthly' | 'yearly';
  trial_days?: number;
  image?: string;
  gallery?: string[];
  category_id?: string;
  parent_product_id?: string;
  variations?: any[];
  metadata?: Record<string, any>;
  is_active?: boolean;
}

export interface UpdateProductRequest {
  name?: string;
  description?: string;
  product_type?: 'physical' | 'digital' | 'service' | 'subscription';
  is_recurring?: boolean;
  price_cents?: number;
  currency?: string;
  billing_interval?: 'daily' | 'weekly' | 'monthly' | 'yearly';
  trial_days?: number;
  image?: string;
  gallery?: string[];
  category_id?: string;
  parent_product_id?: string;
  variations?: any[];
  metadata?: Record<string, any>;
  is_active?: boolean;
}

export interface ProductListOptions {
  limit?: number;
  offset?: number;
  category_id?: string;
  product_type?: string;
  is_recurring?: boolean;
  is_active?: boolean;
  search?: string;
  orderBy?: 'name' | 'price_cents' | 'created_at' | 'updated_at';
  orderDir?: 'asc' | 'desc';
}

export class ProductRepository {
  private db: Database;

  constructor(db: Database) {
    this.db = db;
  }

  async create(data: CreateProductRequest): Promise<Product> {
    const id = data.id || `prod_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    
    const stmt = this.db.prepare(`
      INSERT INTO products (
        id, name, description, product_type, is_recurring, price_cents, currency,
        billing_interval, trial_days, image, gallery, category_id, parent_product_id,
        variations, metadata, is_active, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'), datetime('now'))
    `);

    stmt.run(
      id,
      data.name,
      data.description || null,
      data.product_type,
      data.is_recurring ? 1 : 0,
      data.price_cents,
      data.currency || 'USD',
      data.billing_interval || null,
      data.trial_days || 0,
      data.image || null,
      data.gallery ? JSON.stringify(data.gallery) : null,
      data.category_id || null,
      data.parent_product_id || null,
      data.variations ? JSON.stringify(data.variations) : null,
      data.metadata ? JSON.stringify(data.metadata) : null,
      data.is_active !== false ? 1 : 0
    );

    const product = await this.findById(id);
    if (!product) {
      throw new Error('Failed to create product');
    }

    return product;
  }

  async findById(id: string): Promise<Product | null> {
    const stmt = this.db.prepare('SELECT * FROM products WHERE id = ?');
    const result = stmt.get(id) as Product | undefined;
    return result || null;
  }

  async update(id: string, data: UpdateProductRequest): Promise<Product> {
    const existing = await this.findById(id);
    if (!existing) {
      throw new Error('Product not found');
    }

    const updates: string[] = [];
    const values: any[] = [];

    if (data.name !== undefined) {
      updates.push('name = ?');
      values.push(data.name);
    }
    if (data.description !== undefined) {
      updates.push('description = ?');
      values.push(data.description);
    }
    if (data.product_type !== undefined) {
      updates.push('product_type = ?');
      values.push(data.product_type);
    }
    if (data.is_recurring !== undefined) {
      updates.push('is_recurring = ?');
      values.push(data.is_recurring ? 1 : 0);
    }
    if (data.price_cents !== undefined) {
      updates.push('price_cents = ?');
      values.push(data.price_cents);
    }
    if (data.currency !== undefined) {
      updates.push('currency = ?');
      values.push(data.currency);
    }
    if (data.billing_interval !== undefined) {
      updates.push('billing_interval = ?');
      values.push(data.billing_interval);
    }
    if (data.trial_days !== undefined) {
      updates.push('trial_days = ?');
      values.push(data.trial_days);
    }
    if (data.image !== undefined) {
      updates.push('image = ?');
      values.push(data.image);
    }
    if (data.gallery !== undefined) {
      updates.push('gallery = ?');
      values.push(data.gallery ? JSON.stringify(data.gallery) : null);
    }
    if (data.category_id !== undefined) {
      updates.push('category_id = ?');
      values.push(data.category_id);
    }
    if (data.parent_product_id !== undefined) {
      updates.push('parent_product_id = ?');
      values.push(data.parent_product_id);
    }
    if (data.variations !== undefined) {
      updates.push('variations = ?');
      values.push(data.variations ? JSON.stringify(data.variations) : null);
    }
    if (data.metadata !== undefined) {
      updates.push('metadata = ?');
      values.push(data.metadata ? JSON.stringify(data.metadata) : null);
    }
    if (data.is_active !== undefined) {
      updates.push('is_active = ?');
      values.push(data.is_active ? 1 : 0);
    }

    if (updates.length === 0) {
      return existing;
    }

    updates.push('updated_at = datetime(\'now\')');
    values.push(id);

    const stmt = this.db.prepare(`
      UPDATE products SET ${updates.join(', ')} WHERE id = ?
    `);

    stmt.run(...values);

    const updated = await this.findById(id);
    if (!updated) {
      throw new Error('Failed to update product');
    }

    return updated;
  }

  async delete(id: string): Promise<boolean> {
    const stmt = this.db.prepare('DELETE FROM products WHERE id = ?');
    const result = stmt.run(id);
    return result.changes > 0;
  }

  async list(options: ProductListOptions = {}): Promise<{ products: Product[]; total: number }> {
    const {
      limit = 20,
      offset = 0,
      category_id,
      product_type,
      is_recurring,
      is_active,
      search,
      orderBy = 'created_at',
      orderDir = 'desc'
    } = options;

    let whereClause = 'WHERE 1=1';
    const params: any[] = [];

    if (category_id) {
      whereClause += ' AND category_id = ?';
      params.push(category_id);
    }

    if (product_type) {
      whereClause += ' AND product_type = ?';
      params.push(product_type);
    }

    if (is_recurring !== undefined) {
      whereClause += ' AND is_recurring = ?';
      params.push(is_recurring ? 1 : 0);
    }

    if (is_active !== undefined) {
      whereClause += ' AND is_active = ?';
      params.push(is_active ? 1 : 0);
    }

    if (search) {
      whereClause += ' AND (name LIKE ? OR description LIKE ?)';
      params.push(`%${search}%`, `%${search}%`);
    }

    // Get total count
    const countStmt = this.db.prepare(`SELECT COUNT(*) as count FROM products ${whereClause}`);
    const countResult = countStmt.get(...params) as { count: number };
    const total = countResult.count;

    // Get products
    const orderClause = `ORDER BY ${orderBy} ${orderDir.toUpperCase()}`;
    const limitClause = `LIMIT ? OFFSET ?`;
    
    const stmt = this.db.prepare(`
      SELECT * FROM products ${whereClause} ${orderClause} ${limitClause}
    `);
    
    const products = stmt.all(...params, limit, offset) as Product[];

    return { products, total };
  }

  async findByType(productType: string): Promise<Product[]> {
    const stmt = this.db.prepare('SELECT * FROM products WHERE product_type = ? AND is_active = 1');
    return stmt.all(productType) as Product[];
  }

  async findRecurring(): Promise<Product[]> {
    const stmt = this.db.prepare('SELECT * FROM products WHERE is_recurring = 1 AND is_active = 1');
    return stmt.all() as Product[];
  }
}

// Factory function
export async function getProductRepository(): Promise<ProductRepository> {
  const db = await getDatabase();
  return new ProductRepository(db);
}
