import { Hono } from 'hono';
import { HTTPException } from 'hono/http-exception';
import { z } from 'zod';
import {
  authMiddleware,
  getUserContext
} from '@/lib/auth/middleware';
import { 
  getCustomerRepository, 
  getPaymentMethodRepository 
} from '@/lib/database/repositories';

const guestConversion = new Hono();

// Validation schema for guest conversion
const convertGuestSchema = z.object({
  guest_email: z.string().email(),
  customer_ids: z.array(z.string()).optional(), // Specific customers to convert
  payment_method_ids: z.array(z.string()).optional() // Specific payment methods to convert
});

// Convert guest data to authenticated user
guestConversion.post('/convert-guest', authMiddleware, async (c) => {
  try {
    const body = await c.req.json();
    const validatedData = convertGuestSchema.parse(body);
    const userContext = getUserContext(c);

    if (!userContext.isAuthenticated || !userContext.userId) {
      throw new HTTPException(401, {
        message: 'User must be authenticated to convert guest data'
      });
    }

    console.log('🔄 Converting guest data to user:', {
      guestEmail: validatedData.guest_email,
      userId: userContext.userId
    });

    const customerRepo = await getCustomerRepository();
    const paymentMethodRepo = await getPaymentMethodRepository();

    // Find guest customers by email
    const guestCustomers = await customerRepo.findGuestsByEmail(validatedData.guest_email);
    console.log(`📧 Found ${guestCustomers.length} guest customers for email: ${validatedData.guest_email}`);

    // Find guest payment methods by email
    const guestPaymentMethods = await paymentMethodRepo.findGuestsByEmail(validatedData.guest_email);
    console.log(`💳 Found ${guestPaymentMethods.length} guest payment methods for email: ${validatedData.guest_email}`);

    // Filter customers to convert (if specific IDs provided)
    const customersToConvert = validatedData.customer_ids 
      ? guestCustomers.filter(c => validatedData.customer_ids!.includes(c.id))
      : guestCustomers;

    // Filter payment methods to convert (if specific IDs provided)
    const paymentMethodsToConvert = validatedData.payment_method_ids
      ? guestPaymentMethods.filter(pm => validatedData.payment_method_ids!.includes(pm.id))
      : guestPaymentMethods;

    console.log(`🔄 Converting ${customersToConvert.length} customers and ${paymentMethodsToConvert.length} payment methods`);

    // Convert customers
    const convertedCustomers = [];
    for (const customer of customersToConvert) {
      const converted = await customerRepo.convertGuestToUser(customer.id, userContext.userId);
      if (converted) {
        convertedCustomers.push(converted);
      }
    }

    // Convert payment methods
    const convertedPaymentMethods = await paymentMethodRepo.convertGuestToUser(
      validatedData.guest_email, 
      userContext.userId
    );

    console.log('✅ Guest conversion completed:', {
      convertedCustomers: convertedCustomers.length,
      convertedPaymentMethods: convertedPaymentMethods.length
    });

    return c.json({
      message: 'Guest data converted successfully',
      converted: {
        customers: convertedCustomers.map(c => ({
          id: c.id,
          provider_customer_id: c.provider_customer_id,
          provider_id: c.provider_id,
          converted_at: c.updated_at
        })),
        payment_methods: convertedPaymentMethods.map(pm => ({
          id: pm.id,
          provider_payment_method_id: pm.provider_payment_method_id,
          payment_type: pm.payment_type,
          last_four: pm.last_four,
          converted_at: pm.updated_at
        }))
      },
      summary: {
        total_customers_converted: convertedCustomers.length,
        total_payment_methods_converted: convertedPaymentMethods.length
      }
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

    console.error('Guest conversion error:', error);
    throw new HTTPException(500, {
      message: 'Failed to convert guest data'
    });
  }
});

// Get guest data for preview before conversion
guestConversion.get('/preview-guest/:email', authMiddleware, async (c) => {
  try {
    const guestEmail = c.req.param('email');
    const userContext = getUserContext(c);

    if (!userContext.isAuthenticated) {
      throw new HTTPException(401, {
        message: 'Authentication required'
      });
    }

    console.log('👀 Previewing guest data for email:', guestEmail);

    const customerRepo = await getCustomerRepository();
    const paymentMethodRepo = await getPaymentMethodRepository();

    // Find guest data
    const guestCustomers = await customerRepo.findGuestsByEmail(guestEmail);
    const guestPaymentMethods = await paymentMethodRepo.findGuestsByEmail(guestEmail);

    return c.json({
      guest_email: guestEmail,
      preview: {
        customers: guestCustomers.map(c => ({
          id: c.id,
          provider_customer_id: c.provider_customer_id,
          provider_id: c.provider_id,
          guest_name: c.guest_name,
          created_at: c.created_at
        })),
        payment_methods: guestPaymentMethods.map(pm => ({
          id: pm.id,
          provider_payment_method_id: pm.provider_payment_method_id,
          payment_type: pm.payment_type,
          card_brand: pm.card_brand,
          last_four: pm.last_four,
          created_at: pm.created_at
        }))
      },
      summary: {
        total_customers: guestCustomers.length,
        total_payment_methods: guestPaymentMethods.length,
        can_convert: guestCustomers.length > 0 || guestPaymentMethods.length > 0
      }
    });

  } catch (error) {
    if (error instanceof HTTPException) {
      throw error;
    }

    console.error('Preview guest data error:', error);
    throw new HTTPException(500, {
      message: 'Failed to preview guest data'
    });
  }
});

// List all guest data for current user (if they have matching email)
guestConversion.get('/my-guest-data', authMiddleware, async (c) => {
  try {
    const userContext = getUserContext(c);

    if (!userContext.isAuthenticated || !userContext.userId) {
      throw new HTTPException(401, {
        message: 'Authentication required'
      });
    }

    // This would require getting user email from the user service
    // For now, we'll return a placeholder response
    return c.json({
      message: 'Feature requires user email lookup',
      note: 'Use /preview-guest/:email endpoint with your email address'
    });

  } catch (error) {
    if (error instanceof HTTPException) {
      throw error;
    }

    console.error('Get my guest data error:', error);
    throw new HTTPException(500, {
      message: 'Failed to retrieve guest data'
    });
  }
});

export default guestConversion;
