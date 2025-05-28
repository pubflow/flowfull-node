import { Hono } from 'hono';
import { z } from 'zod';
import { HTTPException } from 'hono/http-exception';
import { optionalAuthMiddleware, getUserContext } from '../lib/auth/middleware';
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
  is_default: z.boolean().optional().default(false),
  // Guest fields
  guest_email: z.string().email().optional(),
  guest_name: z.string().optional()
});

const updateAddressSchema = createAddressSchema.partial();

// List addresses
addresses.get('/', optionalAuthMiddleware, async (c) => {
  try {
    const userContext = getUserContext(c);
    const addressRepo = await getAddressRepository();

    // Get query parameters
    const address_type = c.req.query('address_type');
    const guest_email = c.req.query('guest_email');
    const limit = parseInt(c.req.query('limit') || '50');
    const offset = parseInt(c.req.query('offset') || '0');

    let addresses;
    let total;

    if (userContext.isAuthenticated) {
      // For authenticated users
      addresses = await addressRepo.findByUserId(userContext.userId!, {
        address_type,
        limit,
        offset
      });
      total = await addressRepo.countByUserId(userContext.userId!, { address_type });
    } else if (guest_email) {
      // For guest users
      addresses = await addressRepo.findGuestsByEmail(guest_email, {
        address_type,
        limit,
        offset
      });
      total = await addressRepo.countGuestsByEmail(guest_email, { address_type });
    } else {
      throw new HTTPException(400, {
        message: 'Either authentication or guest_email parameter is required'
      });
    }

    return c.json({
      addresses,
      total,
      limit,
      offset
    });

  } catch (error) {
    if (error instanceof HTTPException) {
      throw error;
    }

    console.error('List addresses error:', error);
    throw new HTTPException(500, {
      message: 'Failed to retrieve addresses'
    });
  }
});

// Get address by ID
addresses.get('/:id', optionalAuthMiddleware, async (c) => {
  try {
    const addressId = c.req.param('id');
    const userContext = getUserContext(c);
    const addressRepo = await getAddressRepository();

    const address = await addressRepo.findById(addressId);
    if (!address) {
      throw new HTTPException(404, {
        message: 'Address not found'
      });
    }

    // Check ownership
    if (userContext.isAuthenticated) {
      if (address.user_id !== userContext.userId) {
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

    return c.json(address);

  } catch (error) {
    if (error instanceof HTTPException) {
      throw error;
    }

    console.error('Get address error:', error);
    throw new HTTPException(500, {
      message: 'Failed to retrieve address'
    });
  }
});

// Create address
addresses.post('/', optionalAuthMiddleware, async (c) => {
  try {
    const userContext = getUserContext(c);
    const body = await c.req.json();
    const validatedData = createAddressSchema.parse(body);

    console.log('📍 Creating address...');
    console.log('   User authenticated:', userContext.isAuthenticated);
    console.log('   Address type:', validatedData.address_type);
    console.log('   Is guest:', !userContext.isAuthenticated);

    const addressRepo = await getAddressRepository();

    // Handle default address logic
    if (validatedData.is_default) {
      if (userContext.isAuthenticated) {
        // Unset other default addresses for this user and type
        await addressRepo.unsetDefaultForUser(userContext.userId!, validatedData.address_type);
      } else if (validatedData.guest_email) {
        // Unset other default addresses for this guest email and type
        await addressRepo.unsetDefaultForGuest(validatedData.guest_email, validatedData.address_type);
      }
    }

    // Create address
    const address = await addressRepo.create({
      id: randomUUID(),
      user_id: userContext.isAuthenticated ? userContext.userId! : null,
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
      is_guest: !userContext.isAuthenticated,
      guest_email: !userContext.isAuthenticated ? (validatedData.guest_email || null) : null,
      guest_name: !userContext.isAuthenticated ? (validatedData.guest_name || null) : null
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
addresses.put('/:id', optionalAuthMiddleware, async (c) => {
  try {
    const addressId = c.req.param('id');
    const userContext = getUserContext(c);
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
    if (userContext.isAuthenticated) {
      if (existingAddress.user_id !== userContext.userId) {
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

      if (userContext.isAuthenticated) {
        await addressRepo.unsetDefaultForUser(userContext.userId!, address_type);
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
addresses.delete('/:id', optionalAuthMiddleware, async (c) => {
  try {
    const addressId = c.req.param('id');
    const userContext = getUserContext(c);

    console.log('🗑️ Deleting address:', addressId);

    const addressRepo = await getAddressRepository();
    const address = await addressRepo.findById(addressId);

    if (!address) {
      throw new HTTPException(404, {
        message: 'Address not found'
      });
    }

    // Check ownership
    if (userContext.isAuthenticated) {
      if (address.user_id !== userContext.userId) {
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
