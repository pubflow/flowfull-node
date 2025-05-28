import { Hono } from 'hono';
import { HTTPException } from 'hono/http-exception';
import { z } from 'zod';
import { randomUUID } from 'crypto';
import {
  optionalAuthMiddleware,
  getUserContext
} from '@/lib/auth/middleware';
import { getPaymentAdapter } from '@/lib/providers/factory';
import { getPaymentMethodRepository, getCustomerRepository } from '@/lib/database/repositories';
import { PaymentMethodType } from '@/lib/providers/base/payment-adapter';

const paymentMethods = new Hono();

// Validation schemas
const createPaymentMethodWithTokenSchema = z.object({
  customer_id: z.string().optional(),
  type: z.enum(['credit_card', 'bank_account', 'paypal']),
  provider_id: z.string(),
  payment_method_token: z.string(), // Required for token-based creation
  billing_details: z.object({
    name: z.string(),
    email: z.string().email(),
    phone: z.string().optional(),
    address: z.object({
      line1: z.string(),
      line2: z.string().optional(),
      city: z.string(),
      state: z.string().optional(),
      postal_code: z.string(),
      country: z.string()
    }).optional()
  }).optional(),
  save_for_future: z.boolean().default(false),
  metadata: z.record(z.string()).optional()
});

const createPaymentMethodSchema = z.object({
  type: z.enum(['credit_card', 'debit_card', 'bank_account', 'paypal', 'apple_pay', 'google_pay']),
  customer_id: z.string().optional(),
  provider_id: z.string().default('stripe'),
  card: z.object({
    number: z.string(),
    exp_month: z.number().min(1).max(12),
    exp_year: z.number().min(2024),
    cvc: z.string()
  }).optional(),
  billing_details: z.object({
    name: z.string().optional(),
    email: z.string().email().optional(),
    phone: z.string().optional(),
    address: z.object({
      line1: z.string(),
      line2: z.string().optional(),
      city: z.string(),
      state: z.string().optional(),
      postal_code: z.string(),
      country: z.string()
    }).optional()
  }).optional(),
  save_for_future: z.boolean().default(false),
  metadata: z.record(z.string()).optional()
});

// Create payment method with token (RECOMMENDED - SECURE)
paymentMethods.post('/', optionalAuthMiddleware, async (c) => {
  try {
    const body = await c.req.json();
    const validatedData = createPaymentMethodWithTokenSchema.parse(body);
    const userContext = getUserContext(c);

    console.log('💳 Creating payment method with token...');
    console.log('🔧 Payment method type:', validatedData.type);
    console.log('🎫 Token:', validatedData.payment_method_token);

    // Validate customer if provided
    if (validatedData.customer_id) {
      const customerRepo = await getCustomerRepository();

      // Try to find by internal ID first
      let customer = await customerRepo.findById(validatedData.customer_id);

      // If not found, try to find by provider_customer_id (for convenience)
      if (!customer) {
        console.log('🔍 Customer not found by ID, trying provider_customer_id...');
        customer = await customerRepo.findByProviderCustomerId(
          validatedData.provider_id,
          validatedData.customer_id
        );
      }

      if (!customer) {
        throw new HTTPException(404, {
          message: `Customer not found. Provided ID: ${validatedData.customer_id}. Use the internal customer ID (UUID), not the provider customer ID.`
        });
      }

      console.log('✅ Customer found:', {
        internal_id: customer.id,
        provider_customer_id: customer.provider_customer_id
      });

      // Check authorization for customer
      if (!userContext.isGuest && customer.user_id !== userContext.userId) {
        throw new HTTPException(403, {
          message: 'Access denied to customer'
        });
      }
    }

    // Create payment method with provider using token
    const adapter = getPaymentAdapter(validatedData.provider_id);

    // Get payment method info from token
    const providerPaymentMethod = await adapter.getPaymentMethod(
      validatedData.payment_method_token
    );

    // If customer_id is provided, attach the payment method to the customer in Stripe
    let attachedPaymentMethod = providerPaymentMethod;
    if (validatedData.customer_id) {
      const customerRepo = await getCustomerRepository();

      // Get the customer to find the provider_customer_id
      let customer = await customerRepo.findById(validatedData.customer_id);
      if (!customer) {
        customer = await customerRepo.findByProviderCustomerId(
          validatedData.provider_id,
          validatedData.customer_id
        );
      }

      if (customer && customer.provider_customer_id) {
        console.log('🔗 Attaching payment method to customer in Stripe...');
        console.log(`   Payment Method: ${validatedData.payment_method_token}`);
        console.log(`   Customer: ${customer.provider_customer_id}`);

        attachedPaymentMethod = await adapter.attachPaymentMethodToCustomer(
          validatedData.payment_method_token,
          customer.provider_customer_id
        );
        console.log('✅ Payment method attached to customer in Stripe');
      }
    }

    // Save payment method to database using native-payments schema
    const paymentMethodRepo = await getPaymentMethodRepository();
    const paymentMethod = await paymentMethodRepo.create({
      id: randomUUID(),
      user_id: userContext.isAuthenticated ? userContext.userId! : null,
      organization_id: null, // No organization support for now
      provider_id: validatedData.provider_id,
      provider_payment_method_id: validatedData.payment_method_token,
      payment_type: validatedData.type,
      last_four: attachedPaymentMethod.card?.last_four || null,
      expiry_month: attachedPaymentMethod.card?.exp_month?.toString().padStart(2, '0') || null,
      expiry_year: attachedPaymentMethod.card?.exp_year?.toString() || null,
      card_brand: attachedPaymentMethod.card?.brand || null,
      is_default: false,
      billing_address_id: null, // No address support for now
      is_guest: !userContext.isAuthenticated,
      guest_email: !userContext.isAuthenticated ? (validatedData.billing_details?.email || null) : null,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString()
    });

    console.log('✅ Payment method created with token:', paymentMethod.id);

    return c.json({
      id: paymentMethod.id,
      provider_payment_method_id: paymentMethod.provider_payment_method_id,
      payment_type: paymentMethod.payment_type,
      card_brand: paymentMethod.card_brand,
      last_four: paymentMethod.last_four,
      expiry_month: paymentMethod.expiry_month,
      expiry_year: paymentMethod.expiry_year,
      is_default: paymentMethod.is_default,
      is_guest: paymentMethod.is_guest,
      guest_email: paymentMethod.guest_email,
      created_at: paymentMethod.created_at
    }, 201);

  } catch (error) {
    if (error instanceof z.ZodError) {
      throw new HTTPException(400, {
        message: 'Validation failed',
        cause: error.errors
      });
    }

    if (error instanceof HTTPException) {
      throw error;
    }

    console.error('Create payment method with token error:', error);
    throw new HTTPException(500, {
      message: 'Failed to create payment method'
    });
  }
});

// Create payment method with direct card data (DEVELOPMENT ONLY)
paymentMethods.post('/direct', optionalAuthMiddleware, async (c) => {
  try {
    const body = await c.req.json();
    const validatedData = createPaymentMethodSchema.parse(body);
    const userContext = getUserContext(c);

    console.log('💳 Creating payment method...');
    console.log('🔧 Payment method type:', validatedData.type);

    // Get payment adapter
    const adapter = getPaymentAdapter(validatedData.provider_id);

    // Create payment method with provider
    const providerPaymentMethod = await adapter.createPaymentMethod({
      type: validatedData.type as PaymentMethodType,
      card: validatedData.card,
      billing_details: validatedData.billing_details
    });

    // Attach to customer if provided
    if (validatedData.customer_id) {
      const customerRepo = await getCustomerRepository();
      const customer = await customerRepo.findById(validatedData.customer_id);

      if (customer) {
        await adapter.attachPaymentMethodToCustomer(
          providerPaymentMethod.id,
          customer.provider_customer_id
        );
      }
    }

    // Save payment method to database using native-payments schema
    const paymentMethodRepo = await getPaymentMethodRepository();
    const paymentMethod = await paymentMethodRepo.create({
      id: randomUUID(),
      user_id: userContext.isAuthenticated ? userContext.userId! : null,
      organization_id: null, // No organization support for now
      provider_id: validatedData.provider_id,
      provider_payment_method_id: providerPaymentMethod.id,
      payment_type: validatedData.type, // Using payment_type instead of type
      last_four: providerPaymentMethod.card?.last_four || null,
      expiry_month: providerPaymentMethod.card?.exp_month?.toString().padStart(2, '0') || null,
      expiry_year: providerPaymentMethod.card?.exp_year?.toString() || null,
      card_brand: providerPaymentMethod.card?.brand || null,
      is_default: false,
      billing_address_id: null, // No address support for now
      is_guest: !userContext.isAuthenticated,
      guest_email: !userContext.isAuthenticated ? (validatedData.billing_details?.email || null) : null,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString()
    });

    console.log('✅ Payment method created:', paymentMethod.id);

    return c.json({
      id: paymentMethod.id,
      provider_payment_method_id: paymentMethod.provider_payment_method_id,
      payment_type: paymentMethod.payment_type,
      card_brand: paymentMethod.card_brand,
      last_four: paymentMethod.last_four,
      expiry_month: paymentMethod.expiry_month,
      expiry_year: paymentMethod.expiry_year,
      is_default: paymentMethod.is_default,
      is_guest: paymentMethod.is_guest,
      guest_email: paymentMethod.guest_email,
      created_at: paymentMethod.created_at
    }, 201);

  } catch (error) {
    if (error instanceof z.ZodError) {
      throw new HTTPException(400, {
        message: 'Validation failed',
        cause: error.errors
      });
    }

    if (error instanceof HTTPException) {
      throw error;
    }

    console.error('Create payment method error:', error);
    throw new HTTPException(500, {
      message: 'Failed to create payment method'
    });
  }
});

// Get payment method by ID
paymentMethods.get('/:id', optionalAuthMiddleware, async (c) => {
  try {
    const paymentMethodId = c.req.param('id');
    const userContext = getUserContext(c);

    const paymentMethodRepo = await getPaymentMethodRepository();
    const paymentMethod = await paymentMethodRepo.findById(paymentMethodId);

    if (!paymentMethod) {
      throw new HTTPException(404, {
        message: 'Payment method not found'
      });
    }

    // Check authorization
    if (!userContext.isGuest && paymentMethod.user_id !== userContext.userId) {
      throw new HTTPException(403, {
        message: 'Access denied'
      });
    }

    return c.json({
      id: paymentMethod.id,
      provider_payment_method_id: paymentMethod.provider_payment_method_id,
      payment_type: paymentMethod.payment_type,
      card_brand: paymentMethod.card_brand,
      last_four: paymentMethod.last_four,
      expiry_month: paymentMethod.expiry_month,
      expiry_year: paymentMethod.expiry_year,
      is_default: paymentMethod.is_default,
      is_guest: paymentMethod.is_guest,
      guest_email: paymentMethod.guest_email,
      created_at: paymentMethod.created_at,
      updated_at: paymentMethod.updated_at
    });

  } catch (error) {
    if (error instanceof HTTPException) {
      throw error;
    }

    console.error('Get payment method error:', error);
    throw new HTTPException(500, {
      message: 'Failed to retrieve payment method'
    });
  }
});

// List payment methods for customer
paymentMethods.get('/customer/:customerId', optionalAuthMiddleware, async (c) => {
  try {
    const customerId = c.req.param('customerId');
    const userContext = getUserContext(c);

    const paymentMethodRepo = await getPaymentMethodRepository();
    const paymentMethods = await paymentMethodRepo.findByCustomerId(customerId);

    // Filter by user authorization
    const authorizedPaymentMethods = paymentMethods.filter(pm => {
      if (userContext.isGuest) return pm.is_guest;
      return pm.user_id === userContext.userId;
    });

    const response = authorizedPaymentMethods.map(pm => ({
      id: pm.id,
      provider_payment_method_id: pm.provider_payment_method_id,
      payment_type: pm.payment_type,
      card_brand: pm.card_brand,
      last_four: pm.last_four,
      expiry_month: pm.expiry_month,
      expiry_year: pm.expiry_year,
      is_default: pm.is_default,
      is_guest: pm.is_guest,
      guest_email: pm.guest_email,
      created_at: pm.created_at
    }));

    return c.json({
      payment_methods: response,
      total: response.length
    });

  } catch (error) {
    console.error('List payment methods error:', error);
    throw new HTTPException(500, {
      message: 'Failed to retrieve payment methods'
    });
  }
});

// Validation schema for delete
const deletePaymentMethodSchema = z.object({
  customer_id: z.string().min(1, 'Customer ID is required') // Stripe customer ID (e.g., cus_xxx) - REQUIRED for security
});

// Delete payment method
paymentMethods.delete('/:id', optionalAuthMiddleware, async (c) => {
  try {
    const paymentMethodId = c.req.param('id');
    const userContext = getUserContext(c);

    // Get customer_id from query params or body (REQUIRED for security)
    let stripeCustomerId = c.req.query('customer_id');
    if (!stripeCustomerId) {
      try {
        const body = await c.req.json();
        const validatedData = deletePaymentMethodSchema.parse(body);
        stripeCustomerId = validatedData.customer_id;
      } catch (error) {
        throw new HTTPException(400, {
          message: 'Customer ID is required. Provide it via query parameter (?customer_id=cus_xxx) or in request body.',
          cause: error instanceof z.ZodError ? error.errors : undefined
        });
      }
    }

    const paymentMethodRepo = await getPaymentMethodRepository();
    const paymentMethod = await paymentMethodRepo.findById(paymentMethodId);

    if (!paymentMethod) {
      throw new HTTPException(404, {
        message: 'Payment method not found'
      });
    }

    // Check authorization
    if (!userContext.isGuest && paymentMethod.user_id !== userContext.userId) {
      throw new HTTPException(403, {
        message: 'Access denied'
      });
    }

    // Delete from provider (Stripe)
    const adapter = getPaymentAdapter(paymentMethod.provider_id);

    // Use the required customer_id (no fallback for security)
    const customerProviderCustomerId = stripeCustomerId;

    console.log('🗑️ Deleting payment method from Stripe...');
    console.log(`   Payment Method: ${paymentMethod.provider_payment_method_id}`);
    console.log(`   Customer ID: ${customerProviderCustomerId}`);
    console.log(`   🔒 Security: Both payment method ID and customer ID required`);

    try {
      await adapter.deletePaymentMethod(
        paymentMethod.provider_payment_method_id,
        customerProviderCustomerId || undefined
      );
      console.log('✅ Payment method deleted from Stripe');
    } catch (stripeError: any) {
      console.log('⚠️ Error deleting from Stripe:', stripeError.message);
      // Continue with DB deletion even if Stripe deletion fails
    }

    // Delete from database
    await paymentMethodRepo.delete(paymentMethodId);

    return c.json({ message: 'Payment method deleted successfully' });

  } catch (error) {
    if (error instanceof HTTPException) {
      throw error;
    }

    console.error('Delete payment method error:', error);
    throw new HTTPException(500, {
      message: 'Failed to delete payment method'
    });
  }
});

export default paymentMethods;
