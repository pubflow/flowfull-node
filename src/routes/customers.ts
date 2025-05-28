import { Hono } from 'hono';
import { HTTPException } from 'hono/http-exception';
import { z } from 'zod';
import { randomUUID } from 'crypto';
import {
  authMiddleware,
  optionalAuthMiddleware,
  getUserContext
} from '@/lib/auth/middleware';
import { getPaymentAdapter } from '@/lib/providers/factory';
import { getCustomerRepository } from '@/lib/database/repositories';

const customers = new Hono();

// Validation schemas
const createCustomerSchema = z.object({
  email: z.string().email(),
  name: z.string().min(1),
  phone: z.string().optional(),
  provider_id: z.string().default('stripe'),
  is_guest: z.boolean().default(false),
  metadata: z.record(z.string()).optional()
});

const updateCustomerSchema = z.object({
  email: z.string().email().optional(),
  name: z.string().min(1).optional(),
  phone: z.string().optional(),
  metadata: z.record(z.string()).optional()
});

// Create customer
customers.post('/', optionalAuthMiddleware, async (c) => {
  try {
    const body = await c.req.json();
    const validatedData = createCustomerSchema.parse(body);
    const userContext = getUserContext(c);

    console.log('👤 Creating customer...');
    console.log('📧 Customer data:', {
      email: validatedData.email,
      name: validatedData.name,
      is_guest: validatedData.is_guest
    });

    // Fix: If not guest and no user authenticated, this should be a guest
    const isActuallyGuest = validatedData.is_guest || !userContext.isAuthenticated;

    // Validate if customer already exists with same provider_id, is_guest, and email
    const customerRepo = await getCustomerRepository();

    console.log('🔍 Checking for existing customer:', {
      provider_id: validatedData.provider_id,
      is_guest: isActuallyGuest,
      email: validatedData.email
    });

    // Check for existing customer
    let existingCustomer = null;

    if (isActuallyGuest) {
      // For guests, check by guest_email and provider_id
      const guestCustomers = await customerRepo.findGuestsByEmail(validatedData.email);
      existingCustomer = guestCustomers.find(c => c.provider_id === validatedData.provider_id);
    } else {
      // For registered users, check by user_id and provider_id
      if (userContext.userId) {
        const userCustomers = await customerRepo.findByUserId(userContext.userId);
        existingCustomer = userCustomers.find(c => c.provider_id === validatedData.provider_id);
      }
    }

    if (existingCustomer) {
      console.log('❌ Customer already exists:', existingCustomer.id);
      throw new HTTPException(409, {
        message: 'Account already exists',
        cause: {
          existing_customer_id: existingCustomer.id,
          provider_id: validatedData.provider_id,
          is_guest: isActuallyGuest,
          email: validatedData.email
        }
      });
    }

    console.log('✅ No existing customer found, proceeding with creation');

    // Get payment adapter
    const adapter = getPaymentAdapter(validatedData.provider_id);

    // Create customer with provider
    const providerCustomer = await adapter.createCustomer({
      email: validatedData.email,
      name: validatedData.name,
      phone: validatedData.phone,
      metadata: validatedData.metadata || {}
    });

    const customer = await customerRepo.create({
      id: randomUUID(),
      user_id: userContext.isAuthenticated ? userContext.userId! : null,
      organization_id: null, // No organization support for now
      provider_id: validatedData.provider_id,
      provider_customer_id: providerCustomer.id,
      guest_email: isActuallyGuest ? validatedData.email : null,
      guest_name: isActuallyGuest ? validatedData.name : null,
      is_guest: isActuallyGuest,
      metadata: JSON.stringify(validatedData.metadata || {}),
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString()
    });

    console.log('✅ Customer created:', customer.id);

    return c.json({
      id: customer.id,
      provider_customer_id: customer.provider_customer_id,
      email: customer.is_guest ? customer.guest_email : validatedData.email,
      name: customer.is_guest ? customer.guest_name : validatedData.name,
      provider_id: customer.provider_id,
      is_guest: customer.is_guest,
      created_at: customer.created_at
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

    console.error('Create customer error:', error);
    throw new HTTPException(500, {
      message: 'Failed to create customer'
    });
  }
});

// Get customer by ID
customers.get('/:id', optionalAuthMiddleware, async (c) => {
  try {
    const customerId = c.req.param('id');
    const userContext = getUserContext(c);

    const customerRepo = await getCustomerRepository();
    const customer = await customerRepo.findById(customerId);

    if (!customer) {
      throw new HTTPException(404, {
        message: 'Customer not found'
      });
    }

    // Check authorization
    if (!userContext.isGuest && customer.user_id !== userContext.userId) {
      throw new HTTPException(403, {
        message: 'Access denied'
      });
    }

    return c.json({
      id: customer.id,
      provider_customer_id: customer.provider_customer_id,
      email: customer.is_guest ? customer.guest_email : null,
      name: customer.is_guest ? customer.guest_name : null,
      provider_id: customer.provider_id,
      is_guest: customer.is_guest,
      created_at: customer.created_at,
      updated_at: customer.updated_at
    });

  } catch (error) {
    if (error instanceof HTTPException) {
      throw error;
    }

    console.error('Get customer error:', error);
    throw new HTTPException(500, {
      message: 'Failed to retrieve customer'
    });
  }
});

// Update customer
customers.put('/:id', optionalAuthMiddleware, async (c) => {
  try {
    const customerId = c.req.param('id');
    const body = await c.req.json();
    const validatedData = updateCustomerSchema.parse(body);
    const userContext = getUserContext(c);

    const customerRepo = await getCustomerRepository();
    const customer = await customerRepo.findById(customerId);

    if (!customer) {
      throw new HTTPException(404, {
        message: 'Customer not found'
      });
    }

    // Check authorization
    if (!userContext.isGuest && customer.user_id !== userContext.userId) {
      throw new HTTPException(403, {
        message: 'Access denied'
      });
    }

    // Update with provider
    const adapter = getPaymentAdapter(customer.provider_id);
    await adapter.updateCustomer(customer.provider_customer_id, validatedData);

    // Update in database
    const updatedCustomer = await customerRepo.update(customerId, {
      guest_email: customer.is_guest ? (validatedData.email || customer.guest_email) : customer.guest_email,
      guest_name: customer.is_guest ? (validatedData.name || customer.guest_name) : customer.guest_name,
      metadata: JSON.stringify(validatedData.metadata || JSON.parse(customer.metadata || '{}')),
      updated_at: new Date().toISOString()
    });

    return c.json({
      id: updatedCustomer!.id,
      provider_customer_id: updatedCustomer!.provider_customer_id,
      email: updatedCustomer!.is_guest ? updatedCustomer!.guest_email : null,
      name: updatedCustomer!.is_guest ? updatedCustomer!.guest_name : null,
      provider_id: updatedCustomer!.provider_id,
      is_guest: updatedCustomer!.is_guest,
      updated_at: updatedCustomer!.updated_at
    });

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

    console.error('Update customer error:', error);
    throw new HTTPException(500, {
      message: 'Failed to update customer'
    });
  }
});

// Delete customer
customers.delete('/:id', optionalAuthMiddleware, async (c) => {
  try {
    const customerId = c.req.param('id');
    const userContext = getUserContext(c);

    const customerRepo = await getCustomerRepository();
    const customer = await customerRepo.findById(customerId);

    if (!customer) {
      throw new HTTPException(404, {
        message: 'Customer not found'
      });
    }

    // Check authorization
    if (!userContext.isGuest && customer.user_id !== userContext.userId) {
      throw new HTTPException(403, {
        message: 'Access denied'
      });
    }

    // Delete from provider
    const adapter = getPaymentAdapter(customer.provider_id);
    await adapter.deleteCustomer(customer.provider_customer_id);

    // Delete from database
    await customerRepo.delete(customerId);

    return c.json({ message: 'Customer deleted successfully' });

  } catch (error) {
    if (error instanceof HTTPException) {
      throw error;
    }

    console.error('Delete customer error:', error);
    throw new HTTPException(500, {
      message: 'Failed to delete customer'
    });
  }
});

// List customers (for debugging)
customers.get('/', optionalAuthMiddleware, async (c) => {
  try {
    const userContext = getUserContext(c);
    const customerRepo = await getCustomerRepository();

    // For guests, show all guest customers
    // For authenticated users, show their customers
    const options: any = {};

    if (userContext.isAuthenticated && userContext.userId) {
      options.userId = userContext.userId;
    } else {
      options.isGuest = true;
      options.limit = 10; // Limit for guests
    }

    const result = await customerRepo.list(options);

    return c.json({
      customers: result.customers.map(customer => ({
        id: customer.id, // Internal UUID
        provider_customer_id: customer.provider_customer_id, // Stripe ID
        email: customer.is_guest ? customer.guest_email : null,
        name: customer.is_guest ? customer.guest_name : null,
        provider_id: customer.provider_id,
        is_guest: customer.is_guest,
        created_at: customer.created_at
      })),
      total: result.total
    });

  } catch (error) {
    console.error('List customers error:', error);
    throw new HTTPException(500, {
      message: 'Failed to list customers'
    });
  }
});

export default customers;
