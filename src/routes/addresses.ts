import { Hono } from 'hono';
import { z } from 'zod';
import { HTTPException } from 'hono/http-exception';
import { optionalAuth } from '../lib/auth/auth-middleware.js';
import { formatResponse, formatError, validateOrderParams, validatePaginationParams } from '../lib/utils/response-formatter.js';
import { getAddressRepository } from '../lib/database/repositories';
import { randomUUID } from 'crypto';

const addresses = new Hono();

// Validation schemas
const createAddressSchema = z.object({
  address_type: z.enum(['billing', 'shipping', 'both']),
  name: z.string().min(1, 'Name is required'),
  line1: z.string().min(1, 'Address line 1 is required'),
  line2: z.string().optional(),
  city: z.string().min(1, 'City is required'),
  state: z.string().optional(),
  postal_code: z.string().min(1, 'Postal code is required'),
  country: z.string().length(2, 'Country must be a 2-letter ISO code'),
  phone: z.string().optional(),
  email: z.string().email().optional(),
  alias: z.string().optional(), // User-friendly name for the address
  is_default: z.boolean().optional().default(false),
  // Guest fields
  guest_email: z.string().email().optional(),
  guest_name: z.string().optional()
});

const updateAddressSchema = createAddressSchema.partial();

// List addresses with guest token support
addresses.get('/', optionalAuth(), async (c) => {
  try {
    const user = c.get('user');
    const token = c.req.query('token'); // Get token from query parameter

    // Parse and validate query parameters
    const { page, limit } = validatePaginationParams(
      c.req.query('page'),
      c.req.query('limit'),
      50 // Max 50 for users
    );

    const address_type = c.req.query('address_type');
    const search = c.req.query('search');

    const { orderBy, orderDir } = validateOrderParams(
      c.req.query('orderBy'),
      c.req.query('orderDir'),
      ['created_at', 'name', 'city', 'country', 'alias']
    );

    console.log(`🏠 Addresses list requested by: ${user ? `${user.id} (${user.userType})` : 'anonymous'} ${token ? `with token: ${token.substring(0, 8)}...` : ''}`);

    const addressRepo = await getAddressRepository();

    if (user) {
      // Authenticated user - different logic for guest vs regular users
      let userAddresses: any[] = [];
      let total = 0;

      if (user.userType === 'guest' && user.email) {
        // Guest user with token - search by guest_email
        console.log(`🔍 Guest user authenticated, searching addresses by email: ${user.email}`);

        userAddresses = await addressRepo.findGuestsByEmail(user.email, {
          address_type,
          search,
          limit,
          offset: (page - 1) * limit
        });
        total = await addressRepo.countGuestsByEmail(user.email, { address_type, search });

        console.log(`✅ Found ${userAddresses.length} guest addresses for email: ${user.email} (total: ${total})`);
      } else {
        // Regular authenticated user - search by user_id
        console.log(`🔍 Regular user authenticated, searching addresses by user_id: ${user.id}`);

        userAddresses = await addressRepo.findByUserId(user.id, {
          address_type,
          search,
          limit,
          offset: (page - 1) * limit
        });
        total = await addressRepo.countByUserId(user.id, { address_type, search });

        console.log(`✅ Found ${userAddresses.length} user addresses for user_id: ${user.id} (total: ${total})`);
      }

      // Format addresses data
      const formattedAddresses = userAddresses.map(addr => ({
        id: addr.id,
        address_type: addr.address_type,
        name: addr.name,
        line1: addr.line1,
        line2: addr.line2,
        city: addr.city,
        state: addr.state,
        postal_code: addr.postal_code,
        country: addr.country,
        phone: addr.phone,
        email: addr.email,
        alias: addr.alias, // ✅ Include alias field
        is_default: addr.is_default,
        is_guest: addr.is_guest,
        created_at: addr.created_at,
        updated_at: addr.updated_at,
        ...(user.userType === 'guest' && {
          guest_email: addr.guest_email,
          guest_name: addr.guest_name
        })
      }));

      // Use new standard response format
      return c.json(formatResponse(
        formattedAddresses,
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
        // We'll use the payment repository to find the email from token
        const { getPaymentRepository } = await import('../lib/database/repositories/index.js');
        const paymentRepo = await getPaymentRepository();
        const guestEmail = await paymentRepo.findGuestEmailByToken(token);

        if (guestEmail) {
          console.log(`✅ Found guest email for token: ${guestEmail}`);

          // Search addresses by guest email
          const guestAddresses = await addressRepo.findGuestsByEmail(guestEmail, {
            address_type,
            search,
            limit,
            offset: (page - 1) * limit
          });
          const total = await addressRepo.countGuestsByEmail(guestEmail, { address_type, search });

          console.log(`✅ Found ${guestAddresses.length} addresses for guest email: ${guestEmail} (total: ${total})`);

          const formattedAddresses = guestAddresses.map(addr => ({
            id: addr.id,
            address_type: addr.address_type,
            name: addr.name,
            line1: addr.line1,
            line2: addr.line2,
            city: addr.city,
            state: addr.state,
            postal_code: addr.postal_code,
            country: addr.country,
            phone: addr.phone,
            email: addr.email,
            alias: addr.alias, // ✅ Include alias field
            is_default: addr.is_default,
            is_guest: addr.is_guest,
            guest_email: addr.guest_email,
            guest_name: addr.guest_name,
            created_at: addr.created_at,
            updated_at: addr.updated_at
          }));

          return c.json(formatResponse(
            formattedAddresses,
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
              message: 'Showing addresses for guest user (fallback mode)'
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
        "Token validation failed and no associated addresses found"
      ), 401);
    } else {
      // Anonymous user - no token provided
      return c.json(formatError(
        "Authentication Required",
        "Authentication required to view addresses"
      ), 401);
    }

  } catch (error) {
    console.error('Get addresses error:', error);
    return c.json(formatError(
      "Internal Server Error",
      "Failed to retrieve addresses"
    ), 500);
  }
});

// Get address by ID with guest token support
addresses.get('/:id', optionalAuth(), async (c) => {
  try {
    const addressId = c.req.param('id');
    const user = c.get('user');
    const token = c.req.query('token'); // Get token from query parameter

    console.log(`🔍 Address details requested: ${addressId} by ${user ? `${user.id} (${user.userType})` : 'anonymous'} ${token ? `with token: ${token.substring(0, 8)}...` : ''}`);

    const addressRepo = await getAddressRepository();
    const address = await addressRepo.findById(addressId);

    if (!address) {
      return c.json(formatError(
        "Not Found",
        `Resource with ID ${addressId} not found`
      ), 404);
    }

    // Check access permissions
    if (user) {
      // Authenticated user - check ownership
      let hasAccess = false;
      let accessMethod = '';

      if (user.userType === 'admin') {
        // Admin can see all addresses
        hasAccess = true;
        accessMethod = 'admin_access';
      } else if (user.userType === 'guest' && user.email && address.is_guest && address.guest_email === user.email) {
        // Guest user with token - check guest email match
        hasAccess = true;
        accessMethod = 'guest_token_access';
        console.log(`✅ Guest token access granted: address.guest_email="${address.guest_email}" matches user.email="${user.email}"`);
      } else if (address.user_id === user.id) {
        // Regular user - check user_id match
        hasAccess = true;
        accessMethod = 'user_id_access';
      }

      if (!hasAccess) {
        console.warn(`🚨 Unauthorized address access attempt: user=${user.id} (${user.userType}) address=${addressId} owner=${address.user_id} guest_email=${address.guest_email}`);
        return c.json(formatError(
          "Access Denied",
          "Insufficient privileges for this address"
        ), 403);
      }

      // Return address details
      const addressData = {
        id: address.id,
        address_type: address.address_type,
        name: address.name,
        line1: address.line1,
        line2: address.line2,
        city: address.city,
        state: address.state,
        postal_code: address.postal_code,
        country: address.country,
        phone: address.phone,
        email: address.email,
        alias: address.alias, // ✅ Include alias field
        is_default: address.is_default,
        is_guest: address.is_guest,
        created_at: address.created_at,
        updated_at: address.updated_at,
        // Include guest data for guest users
        ...(user.userType === 'guest' && {
          guest_email: address.guest_email,
          guest_name: address.guest_name
        }),
        // Include sensitive data only for admin
        ...(user.userType === 'admin' && {
          user_id: address.user_id,
          organization_id: address.organization_id
        })
      };

      // Use new standard response format
      return c.json(formatResponse(
        addressData,
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
          is_owner: address.user_id === user.id || (user.userType === 'guest' && address.guest_email === user.email),
          is_admin: user.userType === 'admin'
        }
      ));

    } else if (token && typeof token === 'string') {
      // Token provided but authentication failed - try fallback search
      console.log(`🔍 Token authentication failed for address details, attempting fallback search for token: ${token.substring(0, 8)}...`);

      // For address details, we need to be more strict about token validation
      // Only allow access if the address is a guest address
      if (!address.is_guest || !address.guest_email) {
        console.warn(`⚠️ Token provided for non-guest address: ${addressId}`);
        return c.json(formatError(
          "Authentication Failed",
          "Invalid token for this address"
        ), 401);
      }

      try {
        // Try to find guest email associated with this token
        const { getPaymentRepository } = await import('../lib/database/repositories/index.js');
        const paymentRepo = await getPaymentRepository();
        const guestEmail = await paymentRepo.findGuestEmailByToken(token);

        if (guestEmail && guestEmail === address.guest_email) {
          console.log(`✅ Fallback token access granted: token maps to email "${guestEmail}" which matches address guest_email`);

          // Return limited address details for fallback access
          const addressData = {
            id: address.id,
            address_type: address.address_type,
            name: address.name,
            line1: address.line1,
            line2: address.line2,
            city: address.city,
            state: address.state,
            postal_code: address.postal_code,
            country: address.country,
            phone: address.phone,
            email: address.email,
            alias: address.alias, // ✅ Include alias field
            is_default: address.is_default,
            is_guest: address.is_guest,
            guest_email: address.guest_email,
            guest_name: address.guest_name,
            created_at: address.created_at,
            updated_at: address.updated_at
          };

          return c.json(formatResponse(
            addressData,
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
              message: 'Showing address details for guest user (fallback mode)'
            }
          ));
        } else {
          console.warn(`⚠️ Token does not match address guest email: token_email="${guestEmail}" address_email="${address.guest_email}"`);
        }
      } catch (fallbackError) {
        console.error('Fallback token search error:', fallbackError);
      }

      // If fallback fails, return error
      return c.json(formatError(
        "Authentication Failed",
        "Token validation failed for this address"
      ), 401);
    } else {
      // Anonymous user - no token provided
      return c.json(formatError(
        "Authentication Required",
        "Authentication required to view address details"
      ), 401);
    }

  } catch (error) {
    if (error instanceof HTTPException) {
      throw error;
    }
    console.error('Get address details error:', error);
    return c.json(formatError(
      "Internal Server Error",
      "Failed to retrieve address details"
    ), 500);
  }
});

// Create address
addresses.post('/', optionalAuth(), async (c) => {
  try {
    const user = c.get('user');
    const body = await c.req.json();
    const validatedData = createAddressSchema.parse(body);

    console.log('📍 Creating address...');
    console.log('   User authenticated:', !!user);
    console.log('   Address type:', validatedData.address_type);
    console.log('   Is guest:', !user);

    const addressRepo = await getAddressRepository();

    // Handle default address logic
    if (validatedData.is_default) {
      if (user) {
        // Unset other default addresses for this user and type
        await addressRepo.unsetDefaultForUser(user.id, validatedData.address_type);
      } else if (validatedData.guest_email) {
        // Unset other default addresses for this guest email and type
        await addressRepo.unsetDefaultForGuest(validatedData.guest_email, validatedData.address_type);
      }
    }

    // Create address
    const address = await addressRepo.create({
      id: randomUUID(),
      user_id: user ? user.id : null,
      organization_id: null, // No organization support for now
      address_type: validatedData.address_type,
      is_default: validatedData.is_default || false,
      name: validatedData.name,
      line1: validatedData.line1,
      line2: validatedData.line2 || null,
      city: validatedData.city,
      state: validatedData.state || null,
      postal_code: validatedData.postal_code,
      country: validatedData.country,
      phone: validatedData.phone || null,
      email: validatedData.email || null,
      is_guest: !user,
      guest_email: !user ? (validatedData.guest_email || null) : null,
      guest_name: !user ? (validatedData.guest_name || null) : null
    });

    console.log('✅ Address created successfully:', address.id);

    return c.json(address, 201);

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

    console.error('Create address error:', error);
    throw new HTTPException(500, {
      message: 'Failed to create address'
    });
  }
});

// Update address
addresses.put('/:id', optionalAuth(), async (c) => {
  try {
    const addressId = c.req.param('id');
    const user = c.get('user');
    const body = await c.req.json();
    const validatedData = updateAddressSchema.parse(body);

    console.log('📝 Updating address:', addressId);

    const addressRepo = await getAddressRepository();
    const existingAddress = await addressRepo.findById(addressId);

    if (!existingAddress) {
      throw new HTTPException(404, {
        message: 'Address not found'
      });
    }

    // Check ownership
    if (user) {
      if (existingAddress.user_id !== user.id) {
        throw new HTTPException(403, {
          message: 'Access denied'
        });
      }
    } else {
      // For guests, require guest_email parameter to verify ownership
      const guest_email = c.req.query('guest_email');
      if (!guest_email || existingAddress.guest_email !== guest_email) {
        throw new HTTPException(403, {
          message: 'Access denied. Guest email verification required.'
        });
      }
    }

    // Handle default address logic
    if (validatedData.is_default) {
      const address_type = validatedData.address_type || existingAddress.address_type;

      if (user) {
        await addressRepo.unsetDefaultForUser(user.id, address_type);
      } else if (existingAddress.guest_email) {
        await addressRepo.unsetDefaultForGuest(existingAddress.guest_email, address_type);
      }
    }

    // Update address
    const updatedAddress = await addressRepo.update(addressId, validatedData);

    console.log('✅ Address updated successfully');

    return c.json(updatedAddress);

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

    console.error('Update address error:', error);
    throw new HTTPException(500, {
      message: 'Failed to update address'
    });
  }
});

// Delete address
addresses.delete('/:id', optionalAuth(), async (c) => {
  try {
    const addressId = c.req.param('id');
    const user = c.get('user');

    console.log('🗑️ Deleting address:', addressId);

    const addressRepo = await getAddressRepository();
    const address = await addressRepo.findById(addressId);

    if (!address) {
      throw new HTTPException(404, {
        message: 'Address not found'
      });
    }

    // Check ownership
    if (user) {
      if (address.user_id !== user.id) {
        throw new HTTPException(403, {
          message: 'Access denied'
        });
      }
    } else {
      // For guests, require guest_email parameter to verify ownership
      const guest_email = c.req.query('guest_email');
      if (!guest_email || address.guest_email !== guest_email) {
        throw new HTTPException(403, {
          message: 'Access denied. Guest email verification required.'
        });
      }
    }

    // Delete address
    await addressRepo.delete(addressId);

    console.log('✅ Address deleted successfully');

    return c.json({ message: 'Address deleted successfully' });

  } catch (error) {
    if (error instanceof HTTPException) {
      throw error;
    }

    console.error('Delete address error:', error);
    throw new HTTPException(500, {
      message: 'Failed to delete address'
    });
  }
});

export default addresses;
