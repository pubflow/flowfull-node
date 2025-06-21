import { Hono } from 'hono';
import { z } from 'zod';
import { zValidator } from '@hono/zod-validator';
import { getProductRepository, CreateProductRequest, UpdateProductRequest } from '../../lib/repositories/product-repository';
import { getProductSyncService } from '../../lib/services/product-sync-service';
import { Logger } from '../../lib/utils/logger';
import { processIntelligentPricing, type PricingInput } from '../../lib/utils/pricing-calculator';

const app = new Hono();

// Validation schemas (PRODUCTS: Intelligent pricing - supports flexible input)
const createProductSchema = z.object({
  id: z.string().optional(),
  name: z.string().min(1, 'Name is required'),
  description: z.string().optional(),
  product_type: z.enum(['physical', 'digital', 'service', 'subscription']),
  is_recurring: z.boolean().optional().default(false),

  // INTELLIGENT PRODUCT PRICING (flexible input)
  subtotal_cents: z.number().int().min(0).optional(),
  total_cents: z.number().int().min(0).optional(), // Alternative input method

  currency: z.string().length(3).optional().default('USD'),
  billing_interval: z.enum(['daily', 'weekly', 'monthly', 'yearly']).optional(),
  trial_days: z.number().int().min(0).optional().default(0),
  image: z.string().url().optional(),
  gallery: z.array(z.string().url()).optional(),
  category_id: z.string().optional(),
  parent_product_id: z.string().optional(),
  variations: z.array(z.any()).optional(),
  metadata: z.record(z.any()).optional(),
  is_active: z.boolean().optional().default(true)
}).refine((data) => {
  // At least one pricing field must be provided
  const hasPricing = data.subtotal_cents !== undefined || data.total_cents !== undefined;

  if (!hasPricing) {
    throw new Error("Either subtotal_cents or total_cents must be provided");
  }

  return true;
}, {
  message: "Either subtotal_cents or total_cents must be provided",
  path: ["pricing"]
});

const updateProductSchema = createProductSchema.partial();

const listProductsSchema = z.object({
  limit: z.string().transform(Number).optional(),
  offset: z.string().transform(Number).optional(),
  category_id: z.string().optional(),
  product_type: z.enum(['physical', 'digital', 'service', 'subscription']).optional(),
  is_recurring: z.string().transform(val => val === 'true').optional(),
  is_active: z.string().transform(val => val === 'true').optional(),
  search: z.string().optional(),
  orderBy: z.enum(['name', 'subtotal_cents', 'created_at', 'updated_at']).optional(),
  orderDir: z.enum(['asc', 'desc']).optional()
});

const syncOptionsSchema = z.object({
  force: z.boolean().optional().default(false),
  dryRun: z.boolean().optional().default(false),
  updatePrices: z.boolean().optional().default(false),
  provider_id: z.string().optional().default('stripe')
});

// GET /admin/products - List products with filtering and pagination
app.get('/', zValidator('query', listProductsSchema), async (c) => {
  try {
    const options = c.req.valid('query');
    const productRepo = await getProductRepository();
    
    Logger.debug('📋 Listing products with options:', options);
    
    const result = await productRepo.list(options);
    
    return c.json({
      success: true,
      data: result.products,
      pagination: {
        total: result.total,
        limit: options.limit || 20,
        offset: options.offset || 0,
        pages: Math.ceil(result.total / (options.limit || 20))
      }
    });
    
  } catch (error) {
    Logger.error('❌ Failed to list products:', error);
    return c.json({
      success: false,
      error: 'Failed to list products',
      details: error instanceof Error ? error.message : 'Unknown error'
    }, 500);
  }
});

// POST /admin/products - Create new product
app.post('/', zValidator('json', createProductSchema), async (c) => {
  try {
    const data = c.req.valid('json');
    const productRepo = await getProductRepository();

    Logger.debug('🆕 Creating product:', { name: data.name, type: data.product_type });

    // 🧠 INTELLIGENT PRICING for products
    Logger.debug('🧠 Processing product pricing...');
    const pricingInput: PricingInput = {
      subtotal_cents: data.subtotal_cents,
      total_cents: data.total_cents
      // Products don't use tax_cents or discount_cents - those are calculated at purchase time
    };

    const pricingResult = processIntelligentPricing(pricingInput);
    Logger.debug('✅ Product pricing result:', {
      scenario: pricingResult.scenario,
      calculated_fields: pricingResult.calculated_fields,
      final_subtotal: pricingResult.pricing.subtotal_cents
    });

    // Products only store subtotal_cents (base price)
    const productData = {
      ...data,
      subtotal_cents: pricingResult.pricing.subtotal_cents
    };

    // Remove total_cents from product data (not stored in products table)
    delete (productData as any).total_cents;

    const product = await productRepo.create(productData as CreateProductRequest);

    Logger.success('✅ Product created:', product.id);

    return c.json({
      success: true,
      data: {
        ...product,
        pricing_info: {
          scenario: pricingResult.scenario,
          calculated_fields: pricingResult.calculated_fields,
          note: 'Products store only subtotal_cents. Tax calculated dynamically at purchase time.'
        }
      },
      message: 'Product created successfully'
    }, 201);

  } catch (error) {
    Logger.error('❌ Failed to create product:', error);
    return c.json({
      success: false,
      error: 'Failed to create product',
      details: error instanceof Error ? error.message : 'Unknown error'
    }, 500);
  }
});

// GET /admin/products/:id - Get specific product
app.get('/:id', async (c) => {
  try {
    const id = c.req.param('id');
    const productRepo = await getProductRepository();
    
    const product = await productRepo.findById(id);
    
    if (!product) {
      return c.json({
        success: false,
        error: 'Product not found'
      }, 404);
    }
    
    return c.json({
      success: true,
      data: product
    });
    
  } catch (error) {
    Logger.error('❌ Failed to get product:', error);
    return c.json({
      success: false,
      error: 'Failed to get product',
      details: error instanceof Error ? error.message : 'Unknown error'
    }, 500);
  }
});

// PUT /admin/products/:id - Update product
app.put('/:id', zValidator('json', updateProductSchema), async (c) => {
  try {
    const id = c.req.param('id');
    const data = c.req.valid('json');
    const productRepo = await getProductRepository();

    Logger.debug('🔄 Updating product:', id);

    let productData = { ...data };
    let pricingInfo = null;

    // 🧠 INTELLIGENT PRICING for products (if pricing fields are being updated)
    if (data.subtotal_cents !== undefined || data.total_cents !== undefined) {
      Logger.debug('🧠 Processing product pricing update...');
      const pricingInput: PricingInput = {
        subtotal_cents: data.subtotal_cents,
        total_cents: data.total_cents
        // Products don't use tax_cents or discount_cents
      };

      const pricingResult = processIntelligentPricing(pricingInput);
      Logger.debug('✅ Product pricing update result:', {
        scenario: pricingResult.scenario,
        calculated_fields: pricingResult.calculated_fields,
        final_subtotal: pricingResult.pricing.subtotal_cents
      });

      // Products only store subtotal_cents (base price)
      productData = {
        ...data,
        subtotal_cents: pricingResult.pricing.subtotal_cents
      };

      // Remove total_cents from product data (not stored in products table)
      delete (productData as any).total_cents;

      pricingInfo = {
        scenario: pricingResult.scenario,
        calculated_fields: pricingResult.calculated_fields,
        note: 'Products store only subtotal_cents. Tax calculated dynamically at purchase time.'
      };
    }

    const product = await productRepo.update(id, productData as UpdateProductRequest);

    Logger.success('✅ Product updated:', product.id);

    return c.json({
      success: true,
      data: {
        ...product,
        ...(pricingInfo && { pricing_info: pricingInfo })
      },
      message: 'Product updated successfully'
    });

  } catch (error) {
    Logger.error('❌ Failed to update product:', error);

    if (error instanceof Error && error.message === 'Product not found') {
      return c.json({
        success: false,
        error: 'Product not found'
      }, 404);
    }

    return c.json({
      success: false,
      error: 'Failed to update product',
      details: error instanceof Error ? error.message : 'Unknown error'
    }, 500);
  }
});

// DELETE /admin/products/:id - Delete product
app.delete('/:id', async (c) => {
  try {
    const id = c.req.param('id');
    const productRepo = await getProductRepository();
    
    Logger.debug('🗑️ Deleting product:', id);
    
    const deleted = await productRepo.delete(id);
    
    if (!deleted) {
      return c.json({
        success: false,
        error: 'Product not found'
      }, 404);
    }
    
    Logger.success('✅ Product deleted:', id);
    
    return c.json({
      success: true,
      message: 'Product deleted successfully'
    });
    
  } catch (error) {
    Logger.error('❌ Failed to delete product:', error);
    return c.json({
      success: false,
      error: 'Failed to delete product',
      details: error instanceof Error ? error.message : 'Unknown error'
    }, 500);
  }
});

// POST /admin/products/:id/sync - Sync specific product with providers
app.post('/:id/sync', zValidator('json', syncOptionsSchema), async (c) => {
  try {
    const id = c.req.param('id');
    const options = c.req.valid('json');
    const syncService = getProductSyncService();
    
    Logger.debug('🔄 Syncing product with provider:', { id, provider: options.provider_id });
    
    const result = await syncService.syncProductWithProvider(id, options.provider_id, options);
    
    if (result.success) {
      Logger.success('✅ Product sync completed:', result);
      return c.json({
        success: true,
        data: result,
        message: `Product synced successfully with ${options.provider_id}`
      });
    } else {
      Logger.error('❌ Product sync failed:', result);
      return c.json({
        success: false,
        error: 'Product sync failed',
        details: result
      }, 400);
    }
    
  } catch (error) {
    Logger.error('❌ Failed to sync product:', error);
    return c.json({
      success: false,
      error: 'Failed to sync product',
      details: error instanceof Error ? error.message : 'Unknown error'
    }, 500);
  }
});

// GET /admin/products/:id/sync-status - Get sync status across providers
app.get('/:id/sync-status', async (c) => {
  try {
    const id = c.req.param('id');
    const syncService = getProductSyncService();
    
    Logger.debug('📊 Getting sync status for product:', id);
    
    const status = await syncService.getProductSyncStatus(id);
    
    return c.json({
      success: true,
      data: {
        product_id: id,
        providers: status
      }
    });
    
  } catch (error) {
    Logger.error('❌ Failed to get sync status:', error);
    return c.json({
      success: false,
      error: 'Failed to get sync status',
      details: error instanceof Error ? error.message : 'Unknown error'
    }, 500);
  }
});

export default app;
