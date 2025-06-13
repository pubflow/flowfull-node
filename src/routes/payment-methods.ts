import { Hono } from 'hono';
import { HTTPException } from 'hono/http-exception';
import { z } from 'zod';
import { randomUUID } from 'crypto';
import { optionalAuth } from '../lib/auth/auth-middleware.js';
import { formatResponse, formatError, validateOrderParams, validatePaginationParams } from '../lib/utils/response-formatter.js';
import { getPaymentAdapter } from '../lib/providers/factory.js';
import { getPaymentMethodRepository, getCustomerRepository, getAddressRepository } from '../lib/database/repositories/index.js';
import { PaymentMethodType } from '../lib/providers/base/payment-adapter.js';

const paymentMethods = new Hono();

// Helper function to resolve billing details from address_id or billing_details
async function resolveBillingDetails(
  billing_address_id: string | undefined,
  billing_details: any | undefined,
  user: any
): Promise<{ billing_details: any; billing_address_id: string | null }> {
  let resolvedBillingDetails = billing_details;
  let resolvedBillingAddressId = billing_address_id || null;

  // If billing_address_id is provided, fetch address and merge with billing_details
  if (billing_address_id) {
    try {
      const addressRepo = await getAddressRepository();
      const address = await addressRepo.findById(billing_address_id);

      if (!address) {
        throw new HTTPException(404, {
          message: `Billing address not found: ${billing_address_id}`
        });
      }

      // Verify user has access to this address
      if (user && !user.userType?.includes('guest')) {
        if (address.user_id !== user.id) {
          throw new HTTPException(403, {
            message: 'Access denied to billing address'
          });
        }
      } else if (user?.userType === 'guest') {
        if (!address.is_guest || address.guest_email !== user.email) {
          throw new HTTPException(403, {
            message: 'Access denied to billing address'
          });
        }
      }

      // Convert address to billing_details format
      const addressBillingDetails = {
        name: address.name,
        email: address.email || user?.email,
        phone: address.phone,
        address: {
          line1: address.line1,
          line2: address.line2 || undefined,
          city: address.city,
          state: address.state || undefined,
          postal_code: address.postal_code,
          country: address.country
        }
      };

      // Merge with provided billing_details (billing_details takes precedence)
      resolvedBillingDetails = {
        ...addressBillingDetails,
        ...billing_details
      };

      console.log('✅ Billing address resolved:', {
        address_id: billing_address_id,
        address_name: address.name,
        merged_details: !!billing_details
      });

    } catch (error) {
      if (error instanceof HTTPException) {
        throw error;
      }
      console.error('❌ Error resolving billing address:', error);
      throw new HTTPException(500, {
        message: 'Failed to resolve billing address'
      });
    }
  }

  return {
    billing_details: resolvedBillingDetails,
    billing_address_id: resolvedBillingAddressId
  };
}

// List payment methods with guest token support
paymentMethods.get('/', optionalAuth(), async (c) => {
  try {
    const user = c.get('user');
    const token = c.req.query('token'); // Get token from query parameter

    // Parse and validate query parameters
    const { page, limit } = validatePaginationParams(
      c.req.query('page'),
      c.req.query('limit'),
      50 // Max 50 for users
    );

    const payment_type = c.req.query('payment_type');
    const card_brand = c.req.query('card_brand');
    const search = c.req.query('search');

    const { orderBy, orderDir } = validateOrderParams(
      c.req.query('orderBy'),
      c.req.query('orderDir'),
      ['created_at', 'payment_type', 'card_brand', 'last_four']
    );

    console.log(`💳 Payment methods list requested by: ${user ? `${user.id} (${user.userType})` : 'anonymous'} ${token ? `with token: ${token.substring(0, 8)}...` : ''}`);

    const paymentMethodRepo = await getPaymentMethodRepository();

    if (user) {
      // Authenticated user - different logic for guest vs regular users
      let userPaymentMethods: any[] = [];
      let total = 0;

      if (user.userType === 'guest' && user.email) {
        // Guest user with token - search by guest_email
        console.log(`🔍 Guest user authenticated, searching payment methods by email: ${user.email}`);

        // For now, we'll use a simple approach - you might want to add specific methods to the repository
        const allPaymentMethods = await paymentMethodRepo.findAll();
        userPaymentMethods = allPaymentMethods.filter(pm =>
          pm.is_guest && pm.guest_email === user.email &&
          (!payment_type || pm.payment_type === payment_type) &&
          (!card_brand || pm.card_brand === card_brand)
        );

        // Apply pagination
        total = userPaymentMethods.length;
        const startIndex = (page - 1) * limit;
        userPaymentMethods = userPaymentMethods.slice(startIndex, startIndex + limit);

        console.log(`✅ Found ${userPaymentMethods.length} guest payment methods for email: ${user.email} (total: ${total})`);
      } else {
        // Regular authenticated user - search by user_id
        console.log(`🔍 Regular user authenticated, searching payment methods by user_id: ${user.id}`);

        const allPaymentMethods = await paymentMethodRepo.findByUserId(user.id);
        userPaymentMethods = allPaymentMethods.filter(pm =>
          (!payment_type || pm.payment_type === payment_type) &&
          (!card_brand || pm.card_brand === card_brand)
        );

        // Apply pagination
        total = userPaymentMethods.length;
        const startIndex = (page - 1) * limit;
        userPaymentMethods = userPaymentMethods.slice(startIndex, startIndex + limit);

        console.log(`✅ Found ${userPaymentMethods.length} user payment methods for user_id: ${user.id} (total: ${total})`);
      }

      // Format payment methods data
      const formattedPaymentMethods = userPaymentMethods.map(pm => ({
        id: pm.id,
        provider_payment_method_id: pm.provider_payment_method_id,
        payment_type: pm.payment_type,
        card_brand: pm.card_brand,
        last_four: pm.last_four,
        expiry_month: pm.expiry_month,
        expiry_year: pm.expiry_year,
        is_default: pm.is_default,
        is_guest: pm.is_guest,
        billing_address_id: pm.billing_address_id, // ✅ Include billing address ID
        created_at: pm.created_at,
        updated_at: pm.updated_at,
        ...(user.userType === 'guest' && {
          guest_email: pm.guest_email
        })
      }));

      // Use new standard response format
      return c.json(formatResponse(
        formattedPaymentMethods,
        {
          query: search,
          page,
          limit,
          total,
          orderBy,
          orderDir
        },
        {
          authenticated: true,
          user_id: user.id,
          user_type: user.userType,
          user_email: user.email,
          search_method: user.userType === 'guest' ? 'guest_email' : 'user_id'
        }
      ));

    } else if (token && typeof token === 'string') {
      // Token provided but authentication failed - try fallback search by guest_email
      console.log(`🔍 Token authentication failed, attempting fallback search for token: ${token.substring(0, 8)}...`);

      try {
        // Try to find guest email associated with this token
        const { getPaymentRepository } = await import('../lib/database/repositories/index.js');
        const paymentRepo = await getPaymentRepository();
        const guestEmail = await paymentRepo.findGuestEmailByToken(token);

        if (guestEmail) {
          console.log(`✅ Found guest email for token: ${guestEmail}`);

          // Search payment methods by guest email
          const allPaymentMethods = await paymentMethodRepo.findAll();
          let guestPaymentMethods = allPaymentMethods.filter(pm =>
            pm.is_guest && pm.guest_email === guestEmail &&
            (!payment_type || pm.payment_type === payment_type) &&
            (!card_brand || pm.card_brand === card_brand)
          );

          // Apply pagination
          const total = guestPaymentMethods.length;
          const startIndex = (page - 1) * limit;
          guestPaymentMethods = guestPaymentMethods.slice(startIndex, startIndex + limit);

          console.log(`✅ Found ${guestPaymentMethods.length} payment methods for guest email: ${guestEmail} (total: ${total})`);

          const formattedPaymentMethods = guestPaymentMethods.map(pm => ({
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
            billing_address_id: pm.billing_address_id, // ✅ Include billing address ID
            created_at: pm.created_at,
            updated_at: pm.updated_at
          }));

          return c.json(formatResponse(
            formattedPaymentMethods,
            {
              query: search,
              page,
              limit,
              total,
              orderBy,
              orderDir
            },
            {
              authenticated: false,
              guest_access: true,
              guest_email: guestEmail,
              token_provided: true,
              access_method: 'fallback_token_search',
              message: 'Showing payment methods for guest user (fallback mode)'
            }
          ));
        } else {
          console.warn(`⚠️ No guest email found for token: ${token.substring(0, 8)}...`);
        }
      } catch (fallbackError) {
        console.error('Fallback search error:', fallbackError);
      }

      // If fallback fails, return error
      return c.json(formatError(
        "Authentication Failed",
        "Token validation failed and no associated payment methods found"
      ), 401);
    } else {
      // Anonymous user - no token provided
      return c.json(formatError(
        "Authentication Required",
        "Authentication required to view payment methods"
      ), 401);
    }

  } catch (error) {
    console.error('Get payment methods error:', error);
    return c.json(formatError(
      "Internal Server Error",
      "Failed to retrieve payment methods"
    ), 500);
  }
});

// Validation schemas
const createPaymentMethodWithTokenSchema = z.object({
  customer_id: z.string().optional(),
  type: z.enum(['credit_card', 'bank_account', 'paypal']),
  provider_id: z.string(),
  payment_method_token: z.string(), // Required for token-based creation
  billing_address_id: z.string().optional(), // Optional: Use existing address
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
  billing_address_id: z.string().optional(), // Optional: Use existing address
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
paymentMethods.post('/', optionalAuth(), async (c) => {
  try {
    const body = await c.req.json();
    const validatedData = createPaymentMethodWithTokenSchema.parse(body);
    const user = c.get('user');

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
        provider_customer_id: customer.provider_customer_id,
        customer_user_id: customer.user_id,
        current_user_id: user?.id,
        user_type: user?.userType
      });

      // Check authorization for customer
      if (user && user.userType !== 'guest' && customer.user_id !== user.id) {
        console.error('🚨 Customer authorization failed:', {
          customer_user_id: customer.user_id,
          current_user_id: user.id,
          user_type: user.userType,
          customer_id: validatedData.customer_id
        });
        throw new HTTPException(403, {
          message: `Access denied to customer. Customer belongs to user ${customer.user_id}, but current user is ${user.id}`
        });
      }

      console.log('✅ Customer authorization passed');
    }

    // Resolve billing details from address_id or billing_details
    const { billing_details: resolvedBillingDetails, billing_address_id: resolvedBillingAddressId } =
      await resolveBillingDetails(
        validatedData.billing_address_id,
        validatedData.billing_details,
        user
      );

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
      user_id: user ? user.id : null,
      organization_id: null, // No organization support for now
      provider_id: validatedData.provider_id,
      provider_payment_method_id: validatedData.payment_method_token,
      payment_type: validatedData.type,
      last_four: attachedPaymentMethod.card?.last_four || null,
      expiry_month: attachedPaymentMethod.card?.exp_month?.toString().padStart(2, '0') || null,
      expiry_year: attachedPaymentMethod.card?.exp_year?.toString() || null,
      card_brand: attachedPaymentMethod.card?.brand || null,
      is_default: false,
      billing_address_id: resolvedBillingAddressId, // ✅ Use resolved billing address ID
      is_guest: !user,
      guest_email: !user ? (resolvedBillingDetails?.email || null) : null,
      guest_name: !user ? (resolvedBillingDetails?.name || null) : null,
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
      guest_name: paymentMethod.guest_name,
      billing_address_id: paymentMethod.billing_address_id, // ✅ Include billing address ID
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
paymentMethods.post('/direct', optionalAuth(), async (c) => {
  try {
    const body = await c.req.json();
    const validatedData = createPaymentMethodSchema.parse(body);
    const user = c.get('user');

    console.log('💳 Creating payment method...');
    console.log('🔧 Payment method type:', validatedData.type);

    // Resolve billing details from address_id or billing_details
    const { billing_details: resolvedBillingDetails, billing_address_id: resolvedBillingAddressId } =
      await resolveBillingDetails(
        validatedData.billing_address_id,
        validatedData.billing_details,
        user
      );

    // Get payment adapter
    const adapter = getPaymentAdapter(validatedData.provider_id);

    // Create payment method with provider using resolved billing details
    const providerPaymentMethod = await adapter.createPaymentMethod({
      type: validatedData.type as PaymentMethodType,
      card: validatedData.card,
      billing_details: resolvedBillingDetails
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
      user_id: user ? user.id : null,
      organization_id: null, // No organization support for now
      provider_id: validatedData.provider_id,
      provider_payment_method_id: providerPaymentMethod.id,
      payment_type: validatedData.type, // Using payment_type instead of type
      last_four: providerPaymentMethod.card?.last_four || null,
      expiry_month: providerPaymentMethod.card?.exp_month?.toString().padStart(2, '0') || null,
      expiry_year: providerPaymentMethod.card?.exp_year?.toString() || null,
      card_brand: providerPaymentMethod.card?.brand || null,
      is_default: false,
      billing_address_id: resolvedBillingAddressId, // ✅ Use resolved billing address ID
      is_guest: !user,
      guest_email: !user ? (resolvedBillingDetails?.email || null) : null,
      guest_name: !user ? (resolvedBillingDetails?.name || null) : null,
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
      guest_name: paymentMethod.guest_name,
      billing_address_id: paymentMethod.billing_address_id, // ✅ Include billing address ID
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

// Get payment method by ID with guest token support
paymentMethods.get('/:id', optionalAuth(), async (c) => {
  try {
    const paymentMethodId = c.req.param('id');
    const user = c.get('user');
    const token = c.req.query('token'); // Get token from query parameter

    console.log(`🔍 Payment method details requested: ${paymentMethodId} by ${user ? `${user.id} (${user.userType})` : 'anonymous'} ${token ? `with token: ${token.substring(0, 8)}...` : ''}`);

    const paymentMethodRepo = await getPaymentMethodRepository();
    const paymentMethod = await paymentMethodRepo.findById(paymentMethodId);

    if (!paymentMethod) {
      return c.json(formatError(
        "Not Found",
        `Resource with ID ${paymentMethodId} not found`
      ), 404);
    }

    // Check access permissions
    if (user) {
      // Authenticated user - check ownership
      let hasAccess = false;
      let accessMethod = '';

      if (user.userType === 'admin') {
        // Admin can see all payment methods
        hasAccess = true;
        accessMethod = 'admin_access';
      } else if (user.userType === 'guest' && user.email && paymentMethod.is_guest && paymentMethod.guest_email === user.email) {
        // Guest user with token - check guest email match
        hasAccess = true;
        accessMethod = 'guest_token_access';
        console.log(`✅ Guest token access granted: paymentMethod.guest_email="${paymentMethod.guest_email}" matches user.email="${user.email}"`);
      } else if (paymentMethod.user_id === user.id) {
        // Regular user - check user_id match
        hasAccess = true;
        accessMethod = 'user_id_access';
      }

      if (!hasAccess) {
        console.warn(`🚨 Unauthorized payment method access attempt: user=${user.id} (${user.userType}) paymentMethod=${paymentMethodId} owner=${paymentMethod.user_id} guest_email=${paymentMethod.guest_email}`);
        return c.json(formatError(
          "Access Denied",
          "Insufficient privileges for this payment method"
        ), 403);
      }

      // Return payment method details
      const paymentMethodData = {
        id: paymentMethod.id,
        provider_payment_method_id: paymentMethod.provider_payment_method_id,
        payment_type: paymentMethod.payment_type,
        card_brand: paymentMethod.card_brand,
        last_four: paymentMethod.last_four,
        expiry_month: paymentMethod.expiry_month,
        expiry_year: paymentMethod.expiry_year,
        is_default: paymentMethod.is_default,
        is_guest: paymentMethod.is_guest,
        created_at: paymentMethod.created_at,
        updated_at: paymentMethod.updated_at,
        // Include guest data for guest users
        ...(user.userType === 'guest' && {
          guest_email: paymentMethod.guest_email
        }),
        // Include sensitive data only for admin
        ...(user.userType === 'admin' && {
          user_id: paymentMethod.user_id,
          organization_id: paymentMethod.organization_id,
          billing_address_id: paymentMethod.billing_address_id
        })
      };

      // Use new standard response format
      return c.json(formatResponse(
        paymentMethodData,
        {
          page: 1,
          limit: 1,
          total: 1
        },
        {
          authenticated: true,
          user_id: user.id,
          user_type: user.userType,
          user_email: user.email,
          access_method: accessMethod,
          is_owner: paymentMethod.user_id === user.id || (user.userType === 'guest' && paymentMethod.guest_email === user.email),
          is_admin: user.userType === 'admin'
        }
      ));

    } else if (token && typeof token === 'string') {
      // Token provided but authentication failed - try fallback search
      console.log(`🔍 Token authentication failed for payment method details, attempting fallback search for token: ${token.substring(0, 8)}...`);

      // For payment method details, we need to be more strict about token validation
      // Only allow access if the payment method is a guest payment method
      if (!paymentMethod.is_guest || !paymentMethod.guest_email) {
        console.warn(`⚠️ Token provided for non-guest payment method: ${paymentMethodId}`);
        return c.json(formatError(
          "Authentication Failed",
          "Invalid token for this payment method"
        ), 401);
      }

      try {
        // Try to find guest email associated with this token
        const { getPaymentRepository } = await import('../lib/database/repositories/index.js');
        const paymentRepo = await getPaymentRepository();
        const guestEmail = await paymentRepo.findGuestEmailByToken(token);

        if (guestEmail && guestEmail === paymentMethod.guest_email) {
          console.log(`✅ Fallback token access granted: token maps to email "${guestEmail}" which matches payment method guest_email`);

          // Return limited payment method details for fallback access
          const paymentMethodData = {
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
          };

          return c.json(formatResponse(
            paymentMethodData,
            {
              page: 1,
              limit: 1,
              total: 1
            },
            {
              authenticated: false,
              guest_access: true,
              guest_email: guestEmail,
              token_provided: true,
              access_method: 'fallback_token_search',
              message: 'Showing payment method details for guest user (fallback mode)'
            }
          ));
        } else {
          console.warn(`⚠️ Token does not match payment method guest email: token_email="${guestEmail}" paymentMethod_email="${paymentMethod.guest_email}"`);
        }
      } catch (fallbackError) {
        console.error('Fallback token search error:', fallbackError);
      }

      // If fallback fails, return error
      return c.json(formatError(
        "Authentication Failed",
        "Token validation failed for this payment method"
      ), 401);
    } else {
      // Anonymous user - no token provided
      return c.json(formatError(
        "Authentication Required",
        "Authentication required to view payment method details"
      ), 401);
    }

  } catch (error) {
    if (error instanceof HTTPException) {
      throw error;
    }
    console.error('Get payment method details error:', error);
    return c.json(formatError(
      "Internal Server Error",
      "Failed to retrieve payment method details"
    ), 500);
  }
});

// List payment methods for customer
paymentMethods.get('/customer/:customerId', optionalAuth(), async (c) => {
  try {
    const customerId = c.req.param('customerId');
    const user = c.get('user');

    const paymentMethodRepo = await getPaymentMethodRepository();
    const paymentMethods = await paymentMethodRepo.findByCustomerId(customerId);

    // Filter by user authorization
    const authorizedPaymentMethods = paymentMethods.filter(pm => {
      if (!user || user.userType === 'guest') return pm.is_guest;
      return pm.user_id === user.id;
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

// Validation schema for update (local fields only)
const updatePaymentMethodSchema = z.object({
  is_default: z.boolean().optional(),
  billing_address_id: z.string().uuid().optional().nullable(),
  metadata: z.record(z.string()).optional()
});

// Update payment method (local fields only - non-invasive to provider)
paymentMethods.put('/:id', optionalAuth(), async (c) => {
  try {
    const paymentMethodId = c.req.param('id');
    const user = c.get('user');
    const token = c.req.query('token'); // Get token from query parameter
    const body = await c.req.json();
    const validatedData = updatePaymentMethodSchema.parse(body);

    console.log(`🔧 Payment method update requested: ${paymentMethodId} by ${user ? `${user.id} (${user.userType})` : 'anonymous'} ${token ? `with token: ${token.substring(0, 8)}...` : ''}`);

    // If billing_address_id is being updated, resolve billing details
    let resolvedBillingAddressId = validatedData.billing_address_id;

    if (validatedData.billing_address_id !== undefined && validatedData.billing_address_id !== null) {
      const result = await resolveBillingDetails(
        validatedData.billing_address_id,
        undefined, // No additional billing_details in update
        user
      );
      resolvedBillingAddressId = result.billing_address_id;
      console.log('✅ Billing address resolved for update:', {
        original_id: validatedData.billing_address_id,
        resolved_id: resolvedBillingAddressId
      });
    }

    const paymentMethodRepo = await getPaymentMethodRepository();
    const paymentMethod = await paymentMethodRepo.findById(paymentMethodId);

    if (!paymentMethod) {
      return c.json(formatError(
        "Not Found",
        `Payment method with ID ${paymentMethodId} not found`
      ), 404);
    }

    // Check access permissions (same as DELETE)
    if (user) {
      // Authenticated user - check ownership
      let hasAccess = false;
      let accessMethod = '';

      if (user.userType === 'admin') {
        // Admin can update any payment method
        hasAccess = true;
        accessMethod = 'admin_access';
      } else if (user.userType === 'guest' && user.email && paymentMethod.is_guest && paymentMethod.guest_email === user.email) {
        // Guest user with token - check guest email match
        hasAccess = true;
        accessMethod = 'guest_token_access';
        console.log(`✅ Guest token update access granted: paymentMethod.guest_email="${paymentMethod.guest_email}" matches user.email="${user.email}"`);
      } else if (paymentMethod.user_id === user.id) {
        // Regular user - check user_id match
        hasAccess = true;
        accessMethod = 'user_id_access';
      }

      if (!hasAccess) {
        console.warn(`🚨 Unauthorized payment method update attempt: user=${user.id} (${user.userType}) paymentMethod=${paymentMethodId} owner=${paymentMethod.user_id} guest_email=${paymentMethod.guest_email}`);
        return c.json(formatError(
          "Access Denied",
          "Insufficient privileges to update this payment method"
        ), 403);
      }

      console.log(`✅ Payment method update authorized via ${accessMethod}`);

    } else if (token && typeof token === 'string') {
      // Token provided but authentication failed - try fallback search
      console.log(`🔍 Token authentication failed for payment method update, attempting fallback search for token: ${token.substring(0, 8)}...`);

      // For payment method updates, we need to be strict about token validation
      // Only allow updates if the payment method is a guest payment method
      if (!paymentMethod.is_guest || !paymentMethod.guest_email) {
        console.warn(`⚠️ Token provided for non-guest payment method update: ${paymentMethodId}`);
        return c.json(formatError(
          "Authentication Failed",
          "Invalid token for this payment method"
        ), 401);
      }

      try {
        // Try to find guest email associated with this token
        const { getPaymentRepository } = await import('../lib/database/repositories/index.js');
        const paymentRepo = await getPaymentRepository();
        const guestEmail = await paymentRepo.findGuestEmailByToken(token);

        if (guestEmail && guestEmail === paymentMethod.guest_email) {
          console.log(`✅ Fallback token update access granted: token maps to email "${guestEmail}" which matches payment method guest_email`);
        } else {
          console.warn(`⚠️ Token does not match payment method guest email for update: token_email="${guestEmail}" paymentMethod_email="${paymentMethod.guest_email}"`);
          return c.json(formatError(
            "Authentication Failed",
            "Token validation failed for this payment method"
          ), 401);
        }
      } catch (fallbackError) {
        console.error('Fallback token search error for update:', fallbackError);
        return c.json(formatError(
          "Authentication Failed",
          "Token validation failed for this payment method"
        ), 401);
      }
    } else {
      // Anonymous user - no token provided
      return c.json(formatError(
        "Authentication Required",
        "Authentication required to update payment method"
      ), 401);
    }

    // Handle default payment method logic
    if (validatedData.is_default === true) {
      console.log('🔄 Setting payment method as default, unsetting others...');

      if (paymentMethod.is_guest && paymentMethod.guest_email) {
        // Unset other default payment methods for this guest email
        await paymentMethodRepo.unsetDefaultForGuest(paymentMethod.guest_email);
      } else if (paymentMethod.user_id) {
        // Unset other default payment methods for this user
        await paymentMethodRepo.unsetDefaultForUser(paymentMethod.user_id);
      }
    }

    // Update payment method (local fields only)
    const updateData = {
      ...validatedData,
      billing_address_id: resolvedBillingAddressId, // Use resolved billing address ID
      updated_at: new Date().toISOString()
    };

    const updatedPaymentMethod = await paymentMethodRepo.update(paymentMethodId, updateData);

    console.log('✅ Payment method updated successfully (local fields only)');
    console.log(`   Updated fields: ${Object.keys(validatedData).join(', ')}`);

    // Return updated payment method with appropriate fields based on user type
    const responseData = {
      id: updatedPaymentMethod.id,
      provider_payment_method_id: updatedPaymentMethod.provider_payment_method_id,
      payment_type: updatedPaymentMethod.payment_type,
      card_brand: updatedPaymentMethod.card_brand,
      last_four: updatedPaymentMethod.last_four,
      expiry_month: updatedPaymentMethod.expiry_month,
      expiry_year: updatedPaymentMethod.expiry_year,
      is_default: updatedPaymentMethod.is_default,
      is_guest: updatedPaymentMethod.is_guest,
      created_at: updatedPaymentMethod.created_at,
      updated_at: updatedPaymentMethod.updated_at,
      // Include guest data for guest users
      ...(user?.userType === 'guest' && {
        guest_email: updatedPaymentMethod.guest_email
      }),
      // Include sensitive data only for admin
      ...(user?.userType === 'admin' && {
        user_id: updatedPaymentMethod.user_id,
        organization_id: updatedPaymentMethod.organization_id,
        billing_address_id: updatedPaymentMethod.billing_address_id
      })
    };

    return c.json(formatResponse(
      responseData,
      {
        page: 1,
        limit: 1,
        total: 1
      },
      {
        authenticated: !!user,
        user_id: user?.id,
        user_type: user?.userType,
        user_email: user?.email,
        access_method: user ? (user.userType === 'admin' ? 'admin_access' :
                              user.userType === 'guest' ? 'guest_token_access' : 'user_id_access') : 'fallback_token_search',
        is_owner: paymentMethod.user_id === user?.id || (user?.userType === 'guest' && paymentMethod.guest_email === user.email),
        is_admin: user?.userType === 'admin',
        updated_fields: Object.keys(validatedData)
      }
    ));

  } catch (error) {
    if (error instanceof z.ZodError) {
      return c.json(formatError(
        "Validation Error",
        "Invalid request data",
        error.errors
      ), 400);
    }

    if (error instanceof HTTPException) {
      throw error;
    }

    console.error('Update payment method error:', error);
    return c.json(formatError(
      "Internal Server Error",
      "Failed to update payment method"
    ), 500);
  }
});

// Delete payment method with simplified ownership validation
paymentMethods.delete('/:id', optionalAuth(), async (c) => {
  try {
    const paymentMethodId = c.req.param('id');
    const user = c.get('user');
    const token = c.req.query('token'); // Get token from query parameter

    console.log(`🗑️ Payment method deletion requested: ${paymentMethodId} by ${user ? `${user.id} (${user.userType})` : 'anonymous'} ${token ? `with token: ${token.substring(0, 8)}...` : ''}`);

    const paymentMethodRepo = await getPaymentMethodRepository();
    const paymentMethod = await paymentMethodRepo.findById(paymentMethodId);

    if (!paymentMethod) {
      return c.json(formatError(
        "Not Found",
        `Payment method with ID ${paymentMethodId} not found`
      ), 404);
    }

    // Check access permissions (similar to addresses)
    if (user) {
      // Authenticated user - check ownership
      let hasAccess = false;
      let accessMethod = '';

      if (user.userType === 'admin') {
        // Admin can delete any payment method
        hasAccess = true;
        accessMethod = 'admin_access';
      } else if (user.userType === 'guest' && user.email && paymentMethod.is_guest && paymentMethod.guest_email === user.email) {
        // Guest user with token - check guest email match
        hasAccess = true;
        accessMethod = 'guest_token_access';
        console.log(`✅ Guest token deletion access granted: paymentMethod.guest_email="${paymentMethod.guest_email}" matches user.email="${user.email}"`);
      } else if (paymentMethod.user_id === user.id) {
        // Regular user - check user_id match
        hasAccess = true;
        accessMethod = 'user_id_access';
      }

      if (!hasAccess) {
        console.warn(`🚨 Unauthorized payment method deletion attempt: user=${user.id} (${user.userType}) paymentMethod=${paymentMethodId} owner=${paymentMethod.user_id} guest_email=${paymentMethod.guest_email}`);
        return c.json(formatError(
          "Access Denied",
          "Insufficient privileges to delete this payment method"
        ), 403);
      }

      console.log(`✅ Payment method deletion authorized via ${accessMethod}`);

    } else if (token && typeof token === 'string') {
      // Token provided but authentication failed - try fallback search
      console.log(`🔍 Token authentication failed for payment method deletion, attempting fallback search for token: ${token.substring(0, 8)}...`);

      // For payment method deletion, we need to be strict about token validation
      // Only allow deletion if the payment method is a guest payment method
      if (!paymentMethod.is_guest || !paymentMethod.guest_email) {
        console.warn(`⚠️ Token provided for non-guest payment method deletion: ${paymentMethodId}`);
        return c.json(formatError(
          "Authentication Failed",
          "Invalid token for this payment method"
        ), 401);
      }

      try {
        // Try to find guest email associated with this token
        const { getPaymentRepository } = await import('../lib/database/repositories/index.js');
        const paymentRepo = await getPaymentRepository();
        const guestEmail = await paymentRepo.findGuestEmailByToken(token);

        if (guestEmail && guestEmail === paymentMethod.guest_email) {
          console.log(`✅ Fallback token deletion access granted: token maps to email "${guestEmail}" which matches payment method guest_email`);
        } else {
          console.warn(`⚠️ Token does not match payment method guest email for deletion: token_email="${guestEmail}" paymentMethod_email="${paymentMethod.guest_email}"`);
          return c.json(formatError(
            "Authentication Failed",
            "Token validation failed for this payment method"
          ), 401);
        }
      } catch (fallbackError) {
        console.error('Fallback token search error for deletion:', fallbackError);
        return c.json(formatError(
          "Authentication Failed",
          "Token validation failed for this payment method"
        ), 401);
      }
    } else {
      // Anonymous user - no token provided
      return c.json(formatError(
        "Authentication Required",
        "Authentication required to delete payment method"
      ), 401);
    }

    // Delete from provider (Stripe) if possible
    try {
      const adapter = getPaymentAdapter(paymentMethod.provider_id);

      console.log('🗑️ Attempting to delete payment method from provider...');
      console.log(`   Payment Method: ${paymentMethod.provider_payment_method_id}`);
      console.log(`   Provider: ${paymentMethod.provider_id}`);

      // Try to delete from provider (best effort)
      await adapter.deletePaymentMethod(
        paymentMethod.provider_payment_method_id,
        undefined // No customer_id required for simplified deletion
      );
      console.log('✅ Payment method deleted from provider');
    } catch (providerError: any) {
      console.log('⚠️ Error deleting from provider (continuing with DB deletion):', providerError.message);
      // Continue with DB deletion even if provider deletion fails
    }

    // Delete from database
    await paymentMethodRepo.delete(paymentMethodId);

    console.log('✅ Payment method deleted successfully from database');

    return c.json({
      message: 'Payment method deleted successfully',
      id: paymentMethodId
    });

  } catch (error) {
    if (error instanceof HTTPException) {
      throw error;
    }

    console.error('Delete payment method error:', error);
    return c.json(formatError(
      "Internal Server Error",
      "Failed to delete payment method"
    ), 500);
  }
});

export default paymentMethods;
