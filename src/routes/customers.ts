import { Hono } from 'hono';
import { HTTPException } from 'hono/http-exception';
import { z } from 'zod';
import { randomUUID } from 'crypto';
import { optionalAuth } from '../lib/auth/auth-middleware.js';
import { getPaymentAdapter } from '../lib/providers/factory.js';
import { getCustomerRepository } from '../lib/database/repositories/index.js';
import { formatResponse, formatError, validateOrderParams, validatePaginationParams } from '../lib/utils/response-formatter.js';

const customers = new Hono();

// Validation schemas
const createCustomerSchema = z.object({
  email: z.string().email('Email debe ser válido'),
  name: z.string()
    .min(1, 'Nombre es requerido')
    .refine(val => val.trim().length > 0, 'Nombre no puede estar vacío'),
  phone: z.string().optional().nullable(), // ✅ Acepta string, undefined, o null
  provider_id: z.string().default('stripe'),
  is_guest: z.boolean().default(false),
  metadata: z.record(z.string()).optional()
});

const updateCustomerSchema = z.object({
  email: z.string().email().optional(),
  name: z.string().min(1).optional(),
  phone: z.string().optional().nullable(), // ✅ Acepta string, undefined, o null
  metadata: z.record(z.string()).optional()
});

// Create customer
customers.post('/', optionalAuth(), async (c) => {
  try {
    const body = await c.req.json();
    const user = c.get('user'); // Get user directly from optionalAuth middleware

    console.log('📥 Raw request body:', JSON.stringify(body, null, 2));
    console.log('🔍 Body validation check:', {
      hasEmail: !!body.email,
      emailValue: body.email,
      hasName: !!body.name,
      nameValue: body.name,
      nameLength: body.name?.length,
      nameType: typeof body.name
    });

    const validatedData = createCustomerSchema.parse(body);

    console.log('👤 Creating customer...');
    console.log('📧 Customer data:', {
      email: validatedData.email,
      name: validatedData.name,
      phone: validatedData.phone,
      phoneType: typeof validatedData.phone,
      phoneIsNull: validatedData.phone === null,
      phoneIsUndefined: validatedData.phone === undefined,
      is_guest: validatedData.is_guest
    });

    // Determine if this is actually a guest based on user authentication
    const isAuthenticated = !!user;
    const isActuallyGuest = !isAuthenticated || validatedData.is_guest;

    console.log('🔍 Authentication check:', {
      user_authenticated: isAuthenticated,
      user_id: user?.id,
      user_type: user?.userType,
      validatedData_is_guest: validatedData.is_guest,
      isActuallyGuest
    });

    // Validate if customer already exists with same provider_id, is_guest, and email
    const customerRepo = await getCustomerRepository();

    console.log('🔍 Checking for existing customer:', {
      provider_id: validatedData.provider_id,
      is_guest: isActuallyGuest,
      email: validatedData.email,
      user_id: user?.id,
      user_type: user?.userType
    });

    // Check for existing customer
    let existingCustomer = null;

    if (isActuallyGuest) {
      // For guests, check by guest_email and provider_id
      const guestCustomers = await customerRepo.findGuestsByEmail(validatedData.email);
      existingCustomer = guestCustomers.find(c => c.provider_id === validatedData.provider_id);
    } else {
      // For registered users, check by user_id and provider_id
      if (!user?.id) {
        console.error('❌ No userId available for authenticated user');
        throw new HTTPException(401, {
          message: 'User authentication failed - no user ID available'
        });
      }

      const userId = user.id;
      console.log('🔍 Looking for existing customer with userId:', userId);

      const userCustomers = await customerRepo.findByUserId(userId);
      existingCustomer = userCustomers.find(c => c.provider_id === validatedData.provider_id);

      console.log('📋 Found user customers:', userCustomers.length);
      console.log('🎯 Matching customer:', existingCustomer?.id);
    }

    if (existingCustomer) {
      console.log('✅ Customer already exists, returning existing:', existingCustomer.id);

      // Format existing customer data
      const customerData = {
        id: existingCustomer.id,
        user_id: existingCustomer.user_id,
        organization_id: existingCustomer.organization_id,
        provider_id: existingCustomer.provider_id,
        provider_customer_id: existingCustomer.provider_customer_id,
        guest_email: existingCustomer.guest_email,
        guest_name: existingCustomer.guest_name,
        is_guest: existingCustomer.is_guest,
        metadata: existingCustomer.metadata,
        created_at: existingCustomer.created_at,
        updated_at: existingCustomer.updated_at,
        existed: true // ✅ Flag to indicate this customer already existed
      };

      // Return existing customer with standard format
      return c.json(formatResponse(
        customerData,
        {
          page: 1,
          limit: 1,
          total: 1
        },
        {
          authenticated: !isActuallyGuest,
          user_id: !isActuallyGuest ? user?.id : undefined,
          user_type: isActuallyGuest ? 'guest' : 'authenticated',
          user_email: validatedData.email,
          search_method: isActuallyGuest ? 'guest_email' : 'user_id'
        }
      ), 200);
    }

    console.log('✅ No existing customer found, proceeding with creation');

    // Get payment adapter
    const adapter = getPaymentAdapter(validatedData.provider_id);

    // Create customer with provider
    const providerCustomer = await adapter.createCustomer({
      email: validatedData.email,
      name: validatedData.name,
      phone: validatedData.phone || undefined, // ✅ Asegurar que null se convierte a undefined
      metadata: validatedData.metadata || {}
    });

    // Validar que tenemos userId para usuarios autenticados
    if (!isActuallyGuest && !user?.id) {
      console.error('❌ No userId available for authenticated user');
      throw new HTTPException(401, {
        message: 'User authentication failed - no user ID available'
      });
    }

    const userId = isActuallyGuest ? null : user?.id;

    console.log('👤 Creating customer with:', {
      userId,
      isActuallyGuest,
      user_id: user?.id,
      user_authenticated: isAuthenticated
    });

    const customer = await customerRepo.create({
      id: randomUUID(),
      user_id: userId,
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

    // Format new customer data
    const customerData = {
      id: customer.id,
      user_id: customer.user_id,
      organization_id: customer.organization_id,
      provider_id: customer.provider_id,
      provider_customer_id: customer.provider_customer_id,
      guest_email: customer.guest_email,
      guest_name: customer.guest_name,
      is_guest: customer.is_guest,
      metadata: customer.metadata,
      created_at: customer.created_at,
      updated_at: customer.updated_at,
      existed: false // ✅ Flag to indicate this is a new customer
    };

    // Return new customer with standard format
    return c.json(formatResponse(
      customerData,
      {
        page: 1,
        limit: 1,
        total: 1
      },
      {
        authenticated: !isActuallyGuest,
        user_id: !isActuallyGuest ? userId : undefined,
        user_type: isActuallyGuest ? 'guest' : 'authenticated',
        user_email: validatedData.email,
        search_method: isActuallyGuest ? 'guest_email' : 'user_id'
      }
    ), 201);

  } catch (error) {
    if (error instanceof z.ZodError) {
      console.error('❌ Zod validation failed:', {
        errors: error.errors,
        receivedData: error.errors.map(e => ({
          path: e.path,
          message: e.message,
          received: e.received
        }))
      });

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
customers.get('/:id', optionalAuth(), async (c) => {
  try {
    const customerId = c.req.param('id');
    const user = c.get('user');

    const customerRepo = await getCustomerRepository();
    const customer = await customerRepo.findById(customerId);

    if (!customer) {
      throw new HTTPException(404, {
        message: 'Customer not found'
      });
    }

    // Check authorization
    if (user && customer.user_id !== user.id) {
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
customers.put('/:id', optionalAuth(), async (c) => {
  try {
    const customerId = c.req.param('id');
    const body = await c.req.json();
    const validatedData = updateCustomerSchema.parse(body);
    const user = c.get('user');

    const customerRepo = await getCustomerRepository();
    const customer = await customerRepo.findById(customerId);

    if (!customer) {
      throw new HTTPException(404, {
        message: 'Customer not found'
      });
    }

    // Check authorization
    if (user && customer.user_id !== user.id) {
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
customers.delete('/:id', optionalAuth(), async (c) => {
  try {
    const customerId = c.req.param('id');
    const user = c.get('user');

    const customerRepo = await getCustomerRepository();
    const customer = await customerRepo.findById(customerId);

    if (!customer) {
      throw new HTTPException(404, {
        message: 'Customer not found'
      });
    }

    // Check authorization
    if (user && customer.user_id !== user.id) {
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
customers.get('/', optionalAuth(), async (c) => {
  try {
    const user = c.get('user');
    const customerRepo = await getCustomerRepository();

    const isAuthenticated = !!user;

    console.log('🔍 GET /customers - Authentication check:', {
      user_authenticated: isAuthenticated,
      user_id: user?.id,
      user_type: user?.userType
    });

    // For guests, show all guest customers
    // For authenticated users, show their customers
    const options: any = {};

    if (isAuthenticated) {
      if (!user?.id) {
        console.error('❌ No userId available for authenticated request');
        throw new HTTPException(401, {
          message: 'User authentication failed - no user ID available'
        });
      }

      const userId = user.id;
      options.userId = userId;
      console.log('🔍 GET /customers - Using userId:', userId);
    } else {
      options.isGuest = true;
      options.limit = 10; // Limit for guests
      console.log('🔍 GET /customers - Using guest mode');
    }

    console.log('🔍 GET /customers - Query options:', options);

    // DEBUGGING: Verificar qué hay en la base de datos
    console.log('🔍 DEBUG: Checking all customers in database...');
    const allCustomers = await customerRepo.list({});
    console.log('📋 DEBUG: All customers in DB:', allCustomers.customers.map(c => ({
      id: c.id,
      user_id: c.user_id,
      provider_id: c.provider_id,
      is_guest: c.is_guest,
      guest_email: c.guest_email,
      provider_customer_id: c.provider_customer_id
    })));

    const result = await customerRepo.list(options);

    // Format customers data
    const formattedCustomers = result.customers.map(customer => ({
      id: customer.id,
      user_id: customer.user_id,
      organization_id: customer.organization_id,
      provider_id: customer.provider_id,
      provider_customer_id: customer.provider_customer_id,
      guest_email: customer.guest_email,
      guest_name: customer.guest_name,
      is_guest: customer.is_guest,
      metadata: customer.metadata,
      created_at: customer.created_at,
      updated_at: customer.updated_at
    }));

    // Use standard response format like addresses
    return c.json(formatResponse(
      formattedCustomers,
      {
        query: '',
        page: 1,
        limit: options.limit || 100,
        total: result.total,
        orderBy: 'created_at',
        orderDir: 'desc'
      },
      {
        authenticated: isAuthenticated,
        user_id: isAuthenticated ? user?.id : undefined,
        user_type: isAuthenticated ? user?.userType : 'guest',
        user_email: user?.email,
        search_method: isAuthenticated ? 'user_id' : 'guest'
      }
    ), 200);

  } catch (error) {
    console.error('List customers error:', error);
    throw new HTTPException(500, {
      message: 'Failed to list customers'
    });
  }
});

export default customers;
