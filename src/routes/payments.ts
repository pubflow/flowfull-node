import { Hono } from 'hono';
import { HTTPException } from 'hono/http-exception';
import { z } from 'zod';
import { randomUUID } from 'crypto';
import {
  getUserContext,
  validateGuestData,
  checkGuestPaymentLimits
} from '@/lib/auth/middleware';
import { optionalAuth } from '../lib/auth/auth-middleware.js';
import { formatResponse, formatError, validateOrderParams, validatePaginationParams } from '../lib/utils/response-formatter.js';
import { getPaymentAdapterWithFailover, getPaymentAdapter } from '@/lib/providers/factory';
import { getPaymentRepository } from '../lib/database/repositories/index.js';
import { processIntelligentPricing, type PricingInput } from '@/lib/utils/pricing-calculator';
import { PaymentStatus } from '@/lib/database/types';
import { PaymentIntentStatus } from '@/lib/providers/base/payment-adapter';
import { receiptService } from '@/lib/email/receipt-service';
import { adminNotificationService } from '@/lib/email/admin-notification-service';

// Helper function to send admin notification from payment data
async function sendAdminNotificationFromPayment(payment: any): Promise<void> {
  try {
    // Debug: Log payment object structure
    console.log('🔍 [DEBUG] Payment object for admin notification:', {
      id: payment.id,
      amount_cents: payment.amount_cents,
      currency: payment.currency,
      status: payment.status,
      provider_id: payment.provider_id,
      keys: Object.keys(payment)
    });

    // Build admin notification data from payment with proper validation
    const adminNotificationData = {
      transaction_id: payment.id || 'unknown',
      amount_cents: payment.amount_cents || 0,
      currency: payment.currency || 'USD',
      status: payment.status || 'unknown',
      provider_id: payment.provider_id || 'unknown',
      provider_payment_id: payment.provider_payment_id || undefined,
      reference_code: payment.reference_code || undefined,
      concept: payment.concept || payment.description || undefined,
      description: payment.description || undefined,
      customer_email: payment.customer_email || undefined,
      customer_name: payment.customer_name || undefined,
      customer_phone: payment.customer_phone || undefined,
      user_type: payment.is_guest_payment ? 'guest' as const : 'registered' as const,
      payment_method_type: payment.payment_method_type || undefined,
      payment_method_last_four: payment.payment_method_last_four || undefined,
      payment_method_brand: payment.payment_method_brand || undefined,
      metadata: payment.metadata ? (typeof payment.metadata === 'string' ? JSON.parse(payment.metadata) : payment.metadata) : undefined,
      created_at: payment.created_at || new Date().toISOString(),
      ip_address: payment.ip_address || undefined,
      user_agent: payment.user_agent || undefined
    };

    await adminNotificationService.sendTransactionNotification(adminNotificationData);
    console.log(`✅ Admin notification sent for payment ${payment.id}`);
  } catch (error) {
    console.error(`❌ Failed to send admin notification for payment ${payment.id}:`, error);
    throw error; // Re-throw to be caught by caller
  }
}

// Helper function to map PaymentIntentStatus to PaymentStatus
function mapPaymentIntentStatus(status: PaymentIntentStatus): PaymentStatus {
  switch (status) {
    case PaymentIntentStatus.PENDING:
      return PaymentStatus.PENDING;
    case PaymentIntentStatus.REQUIRES_CONFIRMATION:
      return PaymentStatus.REQUIRES_CONFIRMATION;
    case PaymentIntentStatus.REQUIRES_ACTION:
      return PaymentStatus.REQUIRES_ACTION;
    case PaymentIntentStatus.PROCESSING:
      return PaymentStatus.PROCESSING;
    case PaymentIntentStatus.SUCCEEDED:
      return PaymentStatus.SUCCEEDED;
    case PaymentIntentStatus.FAILED:
      return PaymentStatus.FAILED;
    case PaymentIntentStatus.CANCELED:
      return PaymentStatus.CANCELED;
    default:
      return PaymentStatus.FAILED;
  }
}

const payments = new Hono();

// Test route to debug JSON parsing
payments.post('/test-json', async (c) => {
  try {
    console.log('🧪 Test route - using c.req.json() directly...');
    const body = await c.req.json();
    console.log('✅ Test route - JSON parsed successfully:', body);
    return c.json({ success: true, received: body });
  } catch (error) {
    console.error('❌ Test route - JSON parsing failed:', error);
    return c.json({
      error: 'JSON parsing failed',
      details: error instanceof Error ? error.message : 'Unknown error'
    }, 400);
  }
});

// Validation schemas with INTELLIGENT PRICING SYSTEM
const createPaymentIntentSchema = z.object({
  // INTELLIGENT PRICING SYSTEM - flexible input
  subtotal_cents: z.number().int().min(0).optional(),
  tax_cents: z.number().int().min(0).optional(),
  discount_cents: z.number().int().min(0).optional(),
  total_cents: z.number().int().min(0).optional(),

  currency: z.string().length(3),
  description: z.string().optional(),
  provider_id: z.string().optional(),
  payment_method_id: z.string().optional(),
  return_url: z.string().url().optional(),
  metadata: z.record(z.any()).optional(),
  guest_data: z.object({
    email: z.string().email(),
    name: z.string().min(1),
    phone: z.string().optional()
  }).optional(),
  // Enhanced tracking fields for analytics
  concept: z.string().optional(), // Human-readable concept (e.g., "Monthly Subscription", "Donation")
  reference_code: z.string().optional(), // Machine-readable code for analytics (e.g., "donation_general", "subscription_monthly")
  category: z.string().optional(), // High-level category (e.g., "donation", "subscription", "purchase")
  tags: z.string().optional(), // Comma-separated tags for flexible categorization

  // Custom/Manual payment support
  is_manual_payment: z.boolean().default(false),
  manual_payment_method: z.string().optional(),
  manual_payment_reference: z.string().optional(),
  manual_payment_date: z.string().optional(),

  // Coupon tracking
  applied_coupons: z.array(z.any()).optional()
}).refine((data) => {
  // At least one pricing field must be provided
  const hasPricing = data.subtotal_cents !== undefined ||
                    data.tax_cents !== undefined ||
                    data.discount_cents !== undefined ||
                    data.total_cents !== undefined;

  if (!hasPricing) {
    throw new Error("At least one pricing field (subtotal_cents, tax_cents, discount_cents, or total_cents) must be provided");
  }

  return true;
}, {
  message: "At least one pricing field must be provided",
  path: ["pricing"]
});

const confirmPaymentIntentSchema = z.object({
  payment_method_id: z.string().optional(),
  return_url: z.string().url().optional(),
  save_payment_method: z.boolean().optional().default(false)
});

const updatePaymentIntentSchema = z.object({
  amount_cents: z.number().int().positive().optional(),
  currency: z.string().length(3).optional(),
  description: z.string().optional(),
  setup_future_usage: z.enum(['on_session', 'off_session']).optional(),
  customer_id: z.string().optional(),
  metadata: z.record(z.any()).optional()
});

// Debug endpoint to check user context
payments.get('/payments/debug-user', optionalAuth(), async (c) => {
  try {
    const user = c.get('user');
    const session = c.get('session');
    const isGuest = c.get('is_guest');
    const userContext = getUserContext(c);

    return c.json({
      raw_context: {
        hasUser: !!user,
        user: user ? {
          id: user.id,
          userType: user.userType,
          email: user.email
        } : null,
        hasSession: !!session,
        isGuest
      },
      user_context: userContext,
      auth_headers: {
        authorization: c.req.header('Authorization'),
        sessionId: c.req.header('X-Session-ID'),
        sessionParam: c.req.query('session_id')
      }
    });
  } catch (error: any) {
    return c.json({
      error: error.message || 'Debug failed'
    }, 400);
  }
});

// Debug endpoint to check payment method and customer info
payments.get('/payments/debug/:payment_method_id', optionalAuth(), async (c) => {
  try {
    const paymentMethodId = c.req.param('payment_method_id');
    const user = c.get('user');

    console.log('🔍 Debug payment method:', paymentMethodId);
    console.log('👤 User:', user ? `${user.id} (${user.userType})` : 'none');

    // Get payment adapter
    const adapter = getPaymentAdapter('stripe');

    // Get payment method from Stripe
    const paymentMethod = await adapter.getPaymentMethod(paymentMethodId);

    // Get customer from our database if user exists
    let dbCustomer = null;
    if (user) {
      const { getCustomerRepository } = await import('@/lib/database/repositories');
      const customerRepo = await getCustomerRepository();
      dbCustomer = await customerRepo.findByUserAndProvider(user.id, 'stripe');
    }

    return c.json({
      payment_method: {
        id: paymentMethod.id,
        type: paymentMethod.type,
        customer_from_stripe: (paymentMethod.provider_data as any)?.customer || null
      },
      customer_from_db: dbCustomer ? {
        id: dbCustomer.id,
        provider_customer_id: dbCustomer.provider_customer_id,
        user_id: dbCustomer.user_id
      } : null,
      user_context: user ? {
        id: user.id,
        userType: user.userType
      } : null
    });
  } catch (error: any) {
    console.error('Debug endpoint error:', error);
    return c.json({
      error: error.message || 'Debug failed'
    }, 400);
  }
});

// Removed test endpoint that was creating unnecessary payment intents

// Create payment intent
payments.post('/payments/intents', optionalAuth(), async (c) => {
  try {
    console.log('🔍 Parsing request body with c.req.json()...');
    const body = await c.req.json();
    console.log('📝 Request body:', JSON.stringify(body, null, 2));

    const validatedData = createPaymentIntentSchema.parse(body);
    console.log('✅ Validated data:', JSON.stringify(validatedData, null, 2));

    // 🧠 INTELLIGENT PRICING CALCULATION
    console.log('🧠 Processing intelligent pricing...');
    const pricingInput: PricingInput = {
      subtotal_cents: validatedData.subtotal_cents,
      tax_cents: validatedData.tax_cents,
      discount_cents: validatedData.discount_cents,
      total_cents: validatedData.total_cents
    };

    const pricingResult = processIntelligentPricing(pricingInput);
    console.log('✅ Intelligent pricing result:', {
      scenario: pricingResult.scenario,
      calculated_fields: pricingResult.calculated_fields,
      pricing: pricingResult.pricing
    });

    // Update validatedData with calculated pricing
    const finalPricing = pricingResult.pricing;
    validatedData.subtotal_cents = finalPricing.subtotal_cents;
    validatedData.tax_cents = finalPricing.tax_cents;
    validatedData.discount_cents = finalPricing.discount_cents;
    validatedData.total_cents = finalPricing.total_cents;

    // Debug: Check what's in the context
    const user = c.get('user');
    const session = c.get('session');
    const isGuest = c.get('is_guest');
    console.log('🔍 Context debug:', {
      hasUser: !!user,
      userInfo: user ? { id: user.id, userType: user.userType } : null,
      hasSession: !!session,
      isGuest
    });

    // Get initial user context
    let userContext = getUserContext(c);
    console.log('👤 Initial user context:', userContext);

    // Handle guest vs authenticated user logic
    if (!userContext.isAuthenticated) {
      console.log('🔍 User not authenticated, treating as guest');

      // For guest payments, we need guest_data
      const guestData = validatedData.guest_data;
      console.log('📧 Guest data:', guestData);

      if (!guestData) {
        throw new HTTPException(400, {
          message: 'Guest data is required for guest payments'
        });
      }

      validateGuestData(guestData);

      // Check guest payment limits
      if (guestData.email) {
        await checkGuestPaymentLimits(guestData.email);
      }

      // Set guest data in context
      c.set('guest_data', guestData);
      c.set('is_guest', true);

      // Update user context after setting guest state
      userContext = getUserContext(c);
      console.log('👤 Updated user context (guest):', userContext);
    } else {
      console.log('✅ User is authenticated, proceeding with authenticated payment');
      console.log('👤 Authenticated user:', {
        userId: userContext.userId,
        isAuthenticated: userContext.isAuthenticated
      });
    }

    // Get payment adapter (without health check)
    if (!validatedData.provider_id) {
      throw new HTTPException(400, {
        message: 'Provider ID is required'
      });
    }
    const adapter = getPaymentAdapter(validatedData.provider_id);

    // Validate currency support
    if (!adapter.supportsCurrency(validatedData.currency)) {
      throw new HTTPException(400, {
        message: `Currency ${validatedData.currency} is not supported by ${adapter.getProviderId()}`
      });
    }

    // Validate payment method and get customer info if provided
    let customerId: string | undefined;
    if (validatedData.payment_method_id) {
      console.log('🔍 Validating payment method:', validatedData.payment_method_id);
      try {
        // Try to get the payment method to validate it exists and get customer info
        const paymentMethod = await adapter.getPaymentMethod(validatedData.payment_method_id);
        console.log('✅ Payment method validated');

        // Check if payment method belongs to a customer
        if (paymentMethod.provider_data && (paymentMethod.provider_data as any).customer) {
          customerId = (paymentMethod.provider_data as any).customer;
          console.log('🔍 Payment method belongs to customer (from Stripe):', customerId);
        }

        // Alternative: Get customer from our database if user is authenticated
        if (!customerId && userContext.isAuthenticated && userContext.userId) {
          console.log('🔍 Looking for customer in our database for user:', userContext.userId);
          try {
            const { getCustomerRepository } = await import('@/lib/database/repositories');
            const customerRepo = await getCustomerRepository();

            const existingCustomer = await customerRepo.findByUserAndProvider(
              userContext.userId,
              validatedData.provider_id
            );

            if (existingCustomer) {
              customerId = existingCustomer.provider_customer_id;
              console.log('✅ Found customer in database:', customerId);
            }
          } catch (dbError) {
            console.log('⚠️ Could not find customer in database:', dbError);
          }
        }
      } catch (pmError: any) {
        console.error('❌ Payment method validation failed:', pmError);
        throw new HTTPException(400, {
          message: `Invalid payment method: ${pmError.message || 'Payment method not found'}`
        });
      }
    }

    // Create payment intent with provider
    console.log('🔄 Creating Stripe payment intent...');
    console.log('👤 Using customer ID:', customerId || 'none');
    console.log('💳 Payment method ID:', validatedData.payment_method_id || 'none');
    console.log('🎯 User context:', {
      isAuthenticated: userContext.isAuthenticated,
      userId: userContext.userId,
      isGuest: userContext.isGuest
    });

    // Prepare metadata - add guest data for guest payments (multi-provider support)
    let paymentMetadata = validatedData.metadata || {};

    // For guest payments, add guest data to payment provider metadata
    // This works with all providers (Stripe, PayPal, Authorize.Net) that support metadata
    if (userContext.isGuest && userContext.guestData) {
      console.log(`📧 Adding guest data to ${validatedData.provider_id} metadata for guest payment`);
      paymentMetadata = {
        ...paymentMetadata,
        // Add guest data to metadata for payment provider transaction
        guest_email: userContext.guestData.email,
        guest_name: userContext.guestData.name,
        ...(userContext.guestData.phone && { guest_phone: userContext.guestData.phone }),
        is_guest_payment: 'true' // String because most payment providers metadata only support strings
      };
      console.log('✅ Enhanced metadata with guest data:', {
        provider: validatedData.provider_id,
        guest_email: paymentMetadata.guest_email,
        guest_name: paymentMetadata.guest_name,
        guest_phone: paymentMetadata.guest_phone || 'not provided'
      });
    }

    const paymentIntent = await adapter.createPaymentIntent({
      amount_cents: validatedData.total_cents, // Use total_cents for final payment amount
      currency: validatedData.currency,
      description: validatedData.description,
      payment_method_id: validatedData.payment_method_id,
      customer_id: customerId, // ✅ Include customer_id if available
      return_url: validatedData.return_url,
      metadata: paymentMetadata // ✅ Enhanced metadata with guest data for guest payments
    });

    // Save payment to database
    const paymentRepo = await getPaymentRepository();

    let payment;
    console.log('💾 Saving payment to database...');
    console.log('👤 User context for DB save:', {
      isAuthenticated: userContext.isAuthenticated,
      isGuest: userContext.isGuest,
      userId: userContext.userId
    });

    // Debug: Log the data we're trying to insert
    console.log('🔍 Payment data for DB insert:', {
      user_id: userContext.userId,
      payment_method_id: validatedData.payment_method_id,
      provider_id: validatedData.provider_id,
      organization_id: userContext.organizationId
    });

    // Verify foreign key references exist
    if (validatedData.payment_method_id) {
      console.log('🔍 Checking if payment method exists in our database...');
      try {
        const { getPaymentMethodRepository } = await import('@/lib/database/repositories');
        const pmRepo = await getPaymentMethodRepository();

        // Use provider_id directly (e.g., "stripe") - no need for UUID lookup
        const existingPM = await pmRepo.findByProviderPaymentMethodId(validatedData.provider_id, validatedData.payment_method_id);

        if (!existingPM) {
          console.log('❌ Payment method not found in our database:', validatedData.payment_method_id);
          throw new HTTPException(400, {
            message: 'El método de pago seleccionado no está registrado en el sistema. Por favor, agrega el método de pago primero.'
          });
        }

        console.log('✅ Payment method found in database:', {
          id: existingPM.id,
          provider_payment_method_id: existingPM.provider_payment_method_id,
          user_id: existingPM.user_id,
          provider_id: existingPM.provider_id
        });

        // Use the internal payment method ID for the foreign key
        validatedData.payment_method_id = existingPM.id;
        console.log('🔄 Using internal payment method ID:', existingPM.id);

      } catch (pmError: any) {
        console.error('❌ Error checking payment method:', pmError);
        if (pmError instanceof HTTPException) {
          throw pmError;
        }
        throw new HTTPException(400, {
          message: 'Error al verificar el método de pago'
        });
      }
    }

    if (userContext.isGuest) {
      // Guest payment
      console.log('💳 Creating guest payment...');
      const guestData = userContext.guestData || validatedData.guest_data;
      if (!guestData) {
        throw new HTTPException(400, {
          message: 'Guest data is required for guest payments'
        });
      }

      payment = await paymentRepo.createGuestPayment({
        order_id: null,
        subscription_id: null,
        user_id: null,
        organization_id: null,
        payment_method_id: validatedData.payment_method_id || null,
        provider_id: validatedData.provider_id, // Use provider_id directly (e.g., "stripe")
        provider_payment_id: null,
        provider_intent_id: paymentIntent.id,
        client_secret: paymentIntent.client_secret || null,
        // NEW UNIFIED PRICING SYSTEM
        subtotal_cents: validatedData.subtotal_cents,
        tax_cents: validatedData.tax_cents,
        discount_cents: validatedData.discount_cents,
        total_cents: validatedData.total_cents,
        currency: validatedData.currency,
        status: mapPaymentIntentStatus(paymentIntent.status),
        description: validatedData.description || null,
        error_message: null,
        // Enhanced tracking fields
        concept: validatedData.concept || null,
        reference_code: validatedData.reference_code || null,
        category: validatedData.category || null,
        tags: validatedData.tags || null,
        // Custom/Manual payment support
        is_manual_payment: validatedData.is_manual_payment,
        manual_payment_method: validatedData.manual_payment_method || null,
        manual_payment_reference: validatedData.manual_payment_reference || null,
        manual_payment_date: validatedData.manual_payment_date || null,
        // Coupon tracking
        applied_coupons: validatedData.applied_coupons ? JSON.stringify(validatedData.applied_coupons) : null,
        is_guest_payment: false, // Will be overridden to 1 in createGuestPayment
        metadata: JSON.stringify(validatedData.metadata || {}),
        completed_at: null,
        guest_data: guestData,
        guest_email: guestData.email
      });
    } else {
      // Authenticated user payment
      console.log('👤 Creating authenticated user payment...');
      payment = await paymentRepo.create({
        id: paymentRepo['generateId'](),
        order_id: null,
        subscription_id: null,
        user_id: userContext.userId!,
        organization_id: null,
        payment_method_id: validatedData.payment_method_id || null,
        provider_id: validatedData.provider_id, // Use provider_id directly (e.g., "stripe")
        provider_payment_id: null,
        provider_intent_id: paymentIntent.id,
        client_secret: paymentIntent.client_secret || null,
        // NEW UNIFIED PRICING SYSTEM
        subtotal_cents: validatedData.subtotal_cents,
        tax_cents: validatedData.tax_cents,
        discount_cents: validatedData.discount_cents,
        total_cents: validatedData.total_cents,
        currency: validatedData.currency,
        status: mapPaymentIntentStatus(paymentIntent.status),
        description: validatedData.description || null,
        error_message: null,
        // Enhanced tracking fields
        concept: validatedData.concept || null,
        reference_code: validatedData.reference_code || null,
        category: validatedData.category || null,
        tags: validatedData.tags || null,
        // Custom/Manual payment support
        is_manual_payment: validatedData.is_manual_payment,
        manual_payment_method: validatedData.manual_payment_method || null,
        manual_payment_reference: validatedData.manual_payment_reference || null,
        manual_payment_date: validatedData.manual_payment_date || null,
        // Coupon tracking
        applied_coupons: validatedData.applied_coupons ? JSON.stringify(validatedData.applied_coupons) : null,
        is_guest_payment: false,
        guest_data: null,
        guest_email: null,
        metadata: JSON.stringify(validatedData.metadata || {}),
        completed_at: null,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
      });
    }

    return c.json({
      id: payment.id,
      provider_intent_id: paymentIntent.id,
      client_secret: paymentIntent.client_secret,
      // NEW UNIFIED PRICING RESPONSE
      pricing: {
        subtotal_cents: payment.subtotal_cents || validatedData.subtotal_cents,
        tax_cents: payment.tax_cents || validatedData.tax_cents,
        discount_cents: payment.discount_cents || validatedData.discount_cents,
        total_cents: payment.total_cents || validatedData.total_cents
      },
      currency: payment.currency,
      status: payment.status,
      provider_id: payment.provider_id,
      is_guest_payment: payment.is_guest_payment,
      is_manual_payment: payment.is_manual_payment || validatedData.is_manual_payment,
      created_at: payment.created_at
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

    console.error('Create payment intent error:', error);

    // Handle specific Stripe errors
    if (error.message && error.message.includes('No such PaymentMethod')) {
      throw new HTTPException(400, {
        message: 'El método de pago seleccionado no es válido o ha expirado. Por favor, selecciona otro método de pago.'
      });
    }

    if (error.message && error.message.includes('Invalid request')) {
      throw new HTTPException(400, {
        message: `Error en la solicitud: ${error.message}`
      });
    }

    throw new HTTPException(500, {
      message: 'Error al crear el pago. Por favor, intenta de nuevo.'
    });
  }
});

// Update payment intent
payments.put('/payments/intents/:id', optionalAuth(), async (c) => {
  try {
    const paymentId = c.req.param('id');
    const body = await c.req.json();
    const validatedData = updatePaymentIntentSchema.parse(body);
    const user = c.get('user');

    console.log('🔄 Updating payment intent:', {
      paymentId,
      updates: validatedData,
      userContext: user ? `authenticated (${user.userType})` : 'anonymous'
    });

    // Get payment from database
    const paymentRepo = await getPaymentRepository();
    const payment = await paymentRepo.findById(paymentId);

    if (!payment) {
      throw new HTTPException(404, {
        message: 'Payment not found'
      });
    }

    // Check authorization
    if (user) {
      // Authenticated user - check ownership (admin can access all)
      if (user.userType !== 'admin' && payment.user_id !== user.id) {
        throw new HTTPException(403, {
          message: 'Access denied: insufficient privileges for this payment'
        });
      }
    } else {
      // Anonymous user - can only access guest payments
      if (!payment.is_guest_payment) {
        throw new HTTPException(403, {
          message: 'Access denied: authentication required for this payment'
        });
      }
    }

    // Check if payment can be updated
    if (![PaymentStatus.PENDING, PaymentStatus.REQUIRES_CONFIRMATION, PaymentStatus.REQUIRES_ACTION].includes(payment.status as PaymentStatus)) {
      throw new HTTPException(400, {
        message: 'Payment cannot be updated in current status'
      });
    }

    // Get payment adapter
    const adapter = await getPaymentAdapterWithFailover(payment.provider_id);

    // Update payment intent with provider
    const updatedIntent = await adapter.updatePaymentIntent(payment.provider_intent_id!, validatedData);

    // Update payment in database if needed
    let updatedPayment = payment;
    if (validatedData.amount_cents || validatedData.currency || validatedData.description) {
      const updateData: any = {};

      if (validatedData.amount_cents) updateData.amount_cents = validatedData.amount_cents;
      if (validatedData.currency) updateData.currency = validatedData.currency;
      if (validatedData.description) updateData.description = validatedData.description;
      if (validatedData.metadata) updateData.metadata = JSON.stringify(validatedData.metadata);

      // Update the payment record
      const updateResult = await paymentRepo.update(payment.id, {
        ...updateData,
        updated_at: new Date().toISOString()
      });

      if (updateResult) {
        updatedPayment = updateResult;
      }
    }

    return c.json({
      id: updatedPayment.id,
      provider_intent_id: updatedIntent.id,
      client_secret: updatedIntent.client_secret,
      amount_cents: updatedPayment.amount_cents,
      currency: updatedPayment.currency,
      status: updatedPayment.status,
      provider_id: updatedPayment.provider_id,
      setup_future_usage_updated: !!validatedData.setup_future_usage,
      updated_at: updatedPayment.updated_at
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

    console.error('Update payment intent error:', error);
    throw new HTTPException(500, {
      message: 'Failed to update payment intent'
    });
  }
});

// Confirm payment intent
payments.post('/payments/intents/:id/confirm', optionalAuth(), async (c) => {
  try {
    const paymentId = c.req.param('id');
    const body = await c.req.json();
    const validatedData = confirmPaymentIntentSchema.parse(body);
    const user = c.get('user');

    // Get user context for backward compatibility
    const userContext = getUserContext(c);

    console.log('🔍 Confirming payment intent:', {
      paymentId,
      savePaymentMethod: validatedData.save_payment_method,
      userContext: user ? `authenticated (${user.userType})` : 'guest'
    });

    // Get payment from database
    const paymentRepo = await getPaymentRepository();
    const payment = await paymentRepo.findById(paymentId);

    if (!payment) {
      throw new HTTPException(404, {
        message: 'Payment not found'
      });
    }

    // Check authorization using new system
    if (user) {
      // Authenticated user - check ownership (admin can access all)
      if (user.userType !== 'admin' && payment.user_id !== user.id) {
        throw new HTTPException(403, {
          message: 'Access denied: insufficient privileges for this payment'
        });
      }
    } else {
      // Anonymous user - can only access guest payments
      if (!payment.is_guest_payment) {
        throw new HTTPException(403, {
          message: 'Access denied: authentication required for this payment'
        });
      }
    }

    // Get payment adapter
    const adapter = await getPaymentAdapterWithFailover(payment.provider_id);

    // Prepare customer ID for saving payment method
    let customerId: string | undefined;
    if (validatedData.save_payment_method) {
      if (userContext.isAuthenticated) {
        // For authenticated users, get or create customer
        const { getCustomerRepository } = await import('@/lib/database/repositories');
        const customerRepo = await getCustomerRepository();

        const existingCustomer = await customerRepo.findByUserAndProvider(
          userContext.userId!,
          payment.provider_id
        );

        if (existingCustomer) {
          customerId = existingCustomer.provider_customer_id;
          console.log('🔍 Using existing customer:', customerId);
        } else {
          // Create customer for authenticated user
          console.log('👤 Creating new customer for authenticated user');
          const newCustomer = await adapter.createCustomer({
            email: `user-${userContext.userId}@example.com`, // Simplified email
            name: 'User',
            metadata: { user_id: userContext.userId! }
          });

          // Save customer to database
          await customerRepo.create({
            id: randomUUID(),
            user_id: userContext.userId!,
            organization_id: null,
            provider_id: payment.provider_id,
            provider_customer_id: newCustomer.id,
            is_guest: false,
            guest_email: null,
            guest_name: null,
            metadata: JSON.stringify(newCustomer.provider_data || {}),
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString()
          });

          customerId = newCustomer.id;
          console.log('✅ Created new customer:', customerId);
        }
      } else if (userContext.isGuest && payment.guest_email) {
        // For guests, create a guest customer
        console.log('👤 Creating guest customer for payment method saving');

        // Parse guest_data if it's a string
        let guestData: any = {};
        if (typeof payment.guest_data === 'string') {
          try {
            guestData = JSON.parse(payment.guest_data);
          } catch (e) {
            console.warn('Failed to parse guest_data:', e);
          }
        } else {
          guestData = payment.guest_data || {};
        }

        const guestCustomer = await adapter.createCustomer({
          email: payment.guest_email,
          name: guestData.name || 'Guest User',
          metadata: {
            is_guest: 'true',
            guest_email: payment.guest_email
          }
        });

        // Save guest customer to database
        const { getCustomerRepository } = await import('@/lib/database/repositories');
        const customerRepo = await getCustomerRepository();
        await customerRepo.create({
          id: randomUUID(),
          user_id: null,
          organization_id: null,
          provider_id: payment.provider_id,
          provider_customer_id: guestCustomer.id,
          is_guest: true,
          guest_email: payment.guest_email,
          guest_name: guestData.name || null,
          metadata: JSON.stringify(guestCustomer.provider_data || {}),
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString()
        });

        customerId = guestCustomer.id;
        console.log('✅ Created guest customer:', customerId);
      }
    }

    // Confirm payment with provider
    const confirmedIntent = await adapter.confirmPaymentIntent({
      payment_intent_id: payment.provider_intent_id!,
      payment_method_id: validatedData.payment_method_id,
      return_url: validatedData.return_url,
      save_payment_method: validatedData.save_payment_method,
      customer_id: customerId
    });

    // Update payment status
    const mappedStatus = mapPaymentIntentStatus(confirmedIntent.status);
    const updatedPayment = await paymentRepo.updateStatus(
      payment.id,
      mappedStatus,
      mappedStatus === PaymentStatus.FAILED ? 'Payment confirmation failed' : undefined
    );

    // Debug: Log payment status for email sending
    // console.log(`🔍 Payment status after confirmation: ${mappedStatus}`);
    // console.log(`🔍 Updated payment exists: ${!!updatedPayment}`);
    // console.log(`🔍 Should send email: ${mappedStatus === PaymentStatus.SUCCEEDED && !!updatedPayment}`);

    // Send receipt email for successful payments
    if (mappedStatus === PaymentStatus.SUCCEEDED && updatedPayment) {
      try {
        console.log('📧 Sending transaction receipt email...');

        // Prepare transaction data for email service
        let transactionData: any = {
          ...updatedPayment,
          customer_email: null,
          customer_name: null
        };

        // Get customer email and name based on user type
        if (userContext.isAuthenticated && userContext.userId) {
          // For authenticated users, get email from user context
          // console.log('🔍 Getting email for authenticated user:', userContext.userId);
          transactionData.customer_email = user?.email || 'unknown@example.com';
          transactionData.customer_name = user?.name || user?.user_name || 'Valued Customer';
          // console.log('📧 Using authenticated user email:', transactionData.customer_email);
        } else if (updatedPayment.guest_email) {
          // For guest users, use guest_email from payment
          // console.log('🔍 Using guest email from payment:', updatedPayment.guest_email);
          transactionData.customer_email = updatedPayment.guest_email;

          // Try to get guest name from guest_data
          if (updatedPayment.guest_data) {
            try {
              const guestData = typeof updatedPayment.guest_data === 'string'
                ? JSON.parse(updatedPayment.guest_data)
                : updatedPayment.guest_data;
              transactionData.customer_name = guestData.name || 'Valued Customer';
            } catch (e) {
              // console.warn('Failed to parse guest_data for email:', e);
              transactionData.customer_name = 'Valued Customer';
            }
          }
        }

        // console.log('📧 Final email data:', {
        //   customer_email: transactionData.customer_email,
        //   customer_name: transactionData.customer_name,
        //   amount_cents: transactionData.amount_cents
        // });

        await receiptService.sendTransactionReceipt(transactionData);
        console.log('✅ Transaction receipt sent successfully');

        // Send admin notification for successful payment
        if (mappedStatus === PaymentStatus.SUCCEEDED) {
          try {
            await sendAdminNotificationFromPayment(updatedPayment);
          } catch (adminEmailError) {
            console.error('⚠️ Failed to send admin notification:', adminEmailError);
            // Don't fail the payment confirmation if admin email fails
          }
        }
      } catch (emailError) {
        console.error('⚠️ Failed to send transaction receipt:', emailError);
        // Don't fail the payment confirmation if email fails
      }
    }

    // If payment succeeded and save_payment_method is true, save the payment method
    let paymentMethodSaved = false;
    if (mappedStatus === PaymentStatus.SUCCEEDED && validatedData.save_payment_method && confirmedIntent.payment_method_id) {
      console.log('💾 Saving payment method after successful payment...');

      try {
        // Get payment method details from provider
        const paymentMethod = await adapter.getPaymentMethod(confirmedIntent.payment_method_id);

        // Save to database
        const { getPaymentMethodRepository } = await import('@/lib/database/repositories');
        const paymentMethodRepo = await getPaymentMethodRepository();

        // Check if payment method already exists for this user/provider
        const existingPaymentMethod = await paymentMethodRepo.findByProviderPaymentMethodId(
          payment.provider_id,
          paymentMethod.id
        );

        if (existingPaymentMethod &&
            ((userContext.isAuthenticated && existingPaymentMethod.user_id === userContext.userId) ||
             (userContext.isGuest && existingPaymentMethod.guest_email === payment.guest_email))) {
          // Payment method already exists for this user
          console.log(`💳 Payment method already exists, skipping save: ${paymentMethod.id}`);
          paymentMethodSaved = false; // Already exists, so not "newly saved"
        } else {
          // Parse guest_data if needed
          let guestData: any = {};
          if (userContext.isGuest && payment.guest_data) {
            if (typeof payment.guest_data === 'string') {
              try {
                guestData = JSON.parse(payment.guest_data);
              } catch (e) {
                console.warn('Failed to parse guest_data for payment method:', e);
              }
            } else {
              guestData = payment.guest_data;
            }
          }

          // Create payment method data for both authenticated users and guests
          const paymentMethodData = {
            id: randomUUID(),
            user_id: userContext.isAuthenticated ? userContext.userId! : null,
            organization_id: null,
            provider_id: payment.provider_id,
            provider_payment_method_id: paymentMethod.id,
            payment_type: paymentMethod.type,
            last_four: paymentMethod.card?.last_four || null,
            expiry_month: paymentMethod.card?.exp_month?.toString().padStart(2, '0') || null,
            expiry_year: paymentMethod.card?.exp_year?.toString() || null,
            card_brand: paymentMethod.card?.brand || null,
            is_default: false,
            billing_address_id: null,
            is_guest: userContext.isGuest,
            guest_email: userContext.isGuest ? payment.guest_email : null,
            guest_name: userContext.isGuest ? guestData.name || null : null,
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString()
          };

          await paymentMethodRepo.create(paymentMethodData);
          paymentMethodSaved = true;
          console.log(`✅ Payment method saved successfully for ${userContext.isGuest ? 'guest' : 'authenticated user'}`);
        }
      } catch (saveError) {
        console.error('⚠️ Failed to save payment method:', saveError);
        // Don't fail the payment confirmation if saving the payment method fails
      }
    }

    return c.json({
      id: updatedPayment!.id,
      status: updatedPayment!.status,
      provider_intent_id: payment.provider_intent_id,
      requires_action: mappedStatus === PaymentStatus.REQUIRES_ACTION,
      payment_method_saved: paymentMethodSaved,
      updated_at: updatedPayment!.updated_at
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

    console.error('Confirm payment intent error:', error);
    throw new HTTPException(500, {
      message: 'Failed to confirm payment intent'
    });
  }
});

// Sync payment intent status (for Payment Elements flow)
// This endpoint is called after frontend confirms payment with Stripe
// It syncs the status and triggers email/payment method saving
payments.post('/payments/intents/:id/sync', optionalAuth(), async (c) => {
  try {
    const paymentId = c.req.param('id');
    const user = c.get('user');

    // Debug authentication headers
    console.log('🔍 Sync endpoint auth debug:', {
      hasUser: !!user,
      userInfo: user ? {
        id: user.id,
        email: user.email,
        userType: user.userType,
        name: user.name
      } : null,
      headers: {
        authorization: c.req.header('Authorization'),
        sessionId: c.req.header('X-Session-ID'),
        sessionParam: c.req.query('session_id')
      }
    });

    // Parse request body
    const body = await c.req.json().catch(() => ({}));
    const validatedData = {
      save_payment_method: body.save_payment_method || false,
      expected_status: body.expected_status || null // Frontend can tell us what status it expects
    };

    console.log('🔄 Syncing payment intent status:', {
      paymentId,
      savePaymentMethod: validatedData.save_payment_method,
      userContext: user ? `authenticated (${user.userType})` : 'guest'
    });

    const paymentRepo = await getPaymentRepository();
    const payment = await paymentRepo.findById(paymentId);

    if (!payment) {
      throw new HTTPException(404, {
        message: 'Payment not found'
      });
    }

    // Get user context
    const userContext = getUserContext(c);

    // Get payment adapter
    const adapter = await getPaymentAdapterWithFailover(payment.provider_id);

    // Get current status from Stripe (don't confirm, just retrieve)
    // Add retry logic for timing issues between frontend and Stripe
    let currentIntent;
    let retryCount = 0;
    const maxRetries = 3;

    do {
      currentIntent = await adapter.getPaymentIntent(payment.provider_intent_id!);
      console.log(`📊 Current payment intent status from Stripe (attempt ${retryCount + 1}):`, currentIntent.status);

      // If frontend expects 'succeeded' but we get 'pending', wait and retry
      if (validatedData.expected_status === 'succeeded' &&
          currentIntent.status === 'pending' &&
          retryCount < maxRetries) {
        console.log('⏳ Status mismatch, waiting 2s before retry...');
        await new Promise(resolve => setTimeout(resolve, 2000));
        retryCount++;
      } else {
        break;
      }
    } while (retryCount <= maxRetries);

    // Update payment intent metadata in Stripe if this is a guest payment
    if (userContext.isGuest && payment.guest_email && payment.guest_data) {
      try {
        console.log('📝 Updating Stripe payment intent metadata with guest information...');

        // Parse guest_data
        let guestData: any = {};
        if (typeof payment.guest_data === 'string') {
          try {
            guestData = JSON.parse(payment.guest_data);
          } catch (e) {
            console.warn('Failed to parse guest_data for metadata update:', e);
          }
        } else {
          guestData = payment.guest_data;
        }

        // Prepare metadata update
        const metadataUpdate = {
          guest_email: payment.guest_email,
          guest_name: guestData.name || 'Guest User',
          ...(guestData.phone && { guest_phone: guestData.phone }),
          is_guest_payment: 'true',
          updated_by_sync: 'true',
          sync_timestamp: new Date().toISOString()
        };

        // Update payment intent metadata in Stripe
        await adapter.updatePaymentIntent(payment.provider_intent_id!, {
          metadata: metadataUpdate
        });

        console.log('✅ Stripe payment intent metadata updated with guest information:', {
          guest_email: metadataUpdate.guest_email,
          guest_name: metadataUpdate.guest_name,
          guest_phone: metadataUpdate.guest_phone || 'not provided'
        });
      } catch (metadataError) {
        console.error('⚠️ Failed to update Stripe metadata:', metadataError);
        // Don't fail the sync if metadata update fails
      }
    }

    // Update payment status in database
    const mappedStatus = mapPaymentIntentStatus(currentIntent.status);
    const updatedPayment = await paymentRepo.updateStatus(
      payment.id,
      mappedStatus,
      mappedStatus === PaymentStatus.FAILED ? 'Payment sync failed' : undefined
    );

    // Send receipt email for successful payments
    if (mappedStatus === PaymentStatus.SUCCEEDED && updatedPayment) {
      try {
        console.log('📧 Sending transaction receipt email...');

        // Prepare transaction data for email service
        let transactionData: any = {
          ...updatedPayment,
          customer_email: null,
          customer_name: null,
          provider_intent_id: payment.provider_intent_id // Add for receipt URL retrieval
        };

        // Get customer email and name based on user type
        if (userContext.isAuthenticated && userContext.userId) {
          // For authenticated users, get email from user context
          transactionData.customer_email = user?.email || 'unknown@example.com';
          transactionData.customer_name = user?.name || user?.firstName || 'Valued Customer';

          console.log('👤 Authenticated user email data:', {
            email: transactionData.customer_email,
            name: transactionData.customer_name,
            userType: user?.userType
          });
        } else if (updatedPayment.guest_email) {
          // For guest users, use guest_email from payment
          transactionData.customer_email = updatedPayment.guest_email;

          // Try to get guest name from guest_data
          if (updatedPayment.guest_data) {
            try {
              const guestData = typeof updatedPayment.guest_data === 'string'
                ? JSON.parse(updatedPayment.guest_data)
                : updatedPayment.guest_data;
              transactionData.customer_name = guestData.name || 'Valued Customer';
            } catch (e) {
              transactionData.customer_name = 'Valued Customer';
            }
          }

          console.log('👤 Guest user email data:', {
            email: transactionData.customer_email,
            name: transactionData.customer_name,
            isGuest: true
          });
        } else {
          console.warn('⚠️ No email data found for transaction receipt:', {
            isAuthenticated: userContext.isAuthenticated,
            hasUser: !!user,
            hasGuestEmail: !!updatedPayment.guest_email,
            userContext
          });
        }

        await receiptService.sendTransactionReceipt(transactionData);
        console.log('✅ Transaction receipt sent successfully');

        // Send admin notification for successful payment
        if (mappedStatus === PaymentStatus.SUCCEEDED) {
          try {
            await sendAdminNotificationFromPayment(updatedPayment);
          } catch (adminEmailError) {
            console.error('⚠️ Failed to send admin notification:', adminEmailError);
            // Don't fail the sync if admin email fails
          }
        }
      } catch (emailError) {
        console.error('⚠️ Failed to send transaction receipt:', emailError);
        // Don't fail the sync if email fails
      }
    }

    // Save payment method if requested and payment succeeded
    let paymentMethodSaved = false;
    if (mappedStatus === PaymentStatus.SUCCEEDED && validatedData.save_payment_method && currentIntent.payment_method_id) {
      console.log('💾 Saving payment method after successful payment...');

      try {
        // Get payment method details from provider
        const paymentMethod = await adapter.getPaymentMethod(currentIntent.payment_method_id);

        // Save to database
        const { getPaymentMethodRepository } = await import('@/lib/database/repositories');
        const paymentMethodRepo = await getPaymentMethodRepository();

        // Check if payment method already exists for this user/provider
        const existingPaymentMethod = await paymentMethodRepo.findByProviderPaymentMethodId(
          payment.provider_id,
          paymentMethod.id
        );

        if (existingPaymentMethod &&
            ((userContext.isAuthenticated && existingPaymentMethod.user_id === userContext.userId) ||
             (userContext.isGuest && existingPaymentMethod.guest_email === payment.guest_email))) {
          // Payment method already exists for this user
          console.log(`💳 Payment method already exists, skipping save: ${paymentMethod.id}`);
          paymentMethodSaved = false; // Already exists, so not "newly saved"
        } else {
          // Parse guest_data if needed
          let guestData: any = {};
          if (userContext.isGuest && payment.guest_data) {
            if (typeof payment.guest_data === 'string') {
              try {
                guestData = JSON.parse(payment.guest_data);
              } catch (e) {
                console.warn('Failed to parse guest_data for payment method:', e);
              }
            } else {
              guestData = payment.guest_data;
            }
          }

          // Create payment method data for both authenticated users and guests
          const paymentMethodData = {
            id: randomUUID(),
            user_id: userContext.isAuthenticated ? userContext.userId! : null,
            organization_id: null,
            provider_id: payment.provider_id,
            provider_payment_method_id: paymentMethod.id,
            payment_type: paymentMethod.type,
            last_four: paymentMethod.card?.last_four || null,
            expiry_month: paymentMethod.card?.exp_month?.toString().padStart(2, '0') || null,
            expiry_year: paymentMethod.card?.exp_year?.toString() || null,
            card_brand: paymentMethod.card?.brand || null,
            is_default: false,
            billing_address_id: null,
            is_guest: userContext.isGuest,
            guest_email: userContext.isGuest ? payment.guest_email : null,
            guest_name: userContext.isGuest ? guestData.name || null : null,
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString()
          };

          await paymentMethodRepo.create(paymentMethodData);
          paymentMethodSaved = true;
          console.log(`✅ Payment method saved successfully for ${userContext.isGuest ? 'guest' : 'authenticated user'}`);
        }
      } catch (saveError) {
        console.error('⚠️ Failed to save payment method:', saveError);
        // Don't fail the sync if saving the payment method fails
      }
    }

    return c.json({
      id: updatedPayment!.id,
      status: updatedPayment!.status,
      provider_intent_id: payment.provider_intent_id,
      payment_method_saved: paymentMethodSaved,
      updated_at: updatedPayment!.updated_at,
      synced: true
    });

  } catch (error) {
    console.error('Sync payment intent error:', error);
    throw new HTTPException(500, {
      message: 'Failed to sync payment intent'
    });
  }
});

// Cancel payment intent
payments.post('/payments/:id/cancel', optionalAuth(), async (c) => {
  try {
    const paymentId = c.req.param('id');
    const user = c.get('user');

    const paymentRepo = await getPaymentRepository();
    const payment = await paymentRepo.findById(paymentId);

    if (!payment) {
      throw new HTTPException(404, {
        message: 'Payment not found'
      });
    }

    // Check authorization
    if (user) {
      // Authenticated user - check ownership (admin can access all)
      if (user.userType !== 'admin' && payment.user_id !== user.id) {
        throw new HTTPException(403, {
          message: 'Access denied: insufficient privileges for this payment'
        });
      }
    } else {
      // Anonymous user - can only access guest payments
      if (!payment.is_guest_payment) {
        throw new HTTPException(403, {
          message: 'Access denied: authentication required for this payment'
        });
      }
    }

    // Check if payment can be cancelled
    if (![PaymentStatus.PENDING, PaymentStatus.REQUIRES_CONFIRMATION, PaymentStatus.REQUIRES_ACTION].includes(payment.status as PaymentStatus)) {
      throw new HTTPException(400, {
        message: 'Payment cannot be cancelled in current status'
      });
    }

    // Cancel with provider
    const adapter = await getPaymentAdapterWithFailover(payment.provider_id);
    await adapter.cancelPaymentIntent(payment.provider_intent_id!);

    // Update payment status
    const updatedPayment = await paymentRepo.updateStatus(
      payment.id,
      PaymentStatus.CANCELED
    );

    return c.json({
      id: updatedPayment!.id,
      status: updatedPayment!.status,
      updated_at: updatedPayment!.updated_at
    });

  } catch (error) {
    if (error instanceof HTTPException) {
      throw error;
    }

    console.error('Cancel payment error:', error);
    throw new HTTPException(500, {
      message: 'Failed to cancel payment'
    });
  }
});

// Capture payment intent (for manual capture/authorization)
payments.post('/payments/:id/capture', optionalAuth(), async (c) => {
  try {
    const paymentId = c.req.param('id');
    const user = c.get('user');

    // Parse request body for optional amount
    const body = await c.req.json().catch(() => ({}));
    const { amount_cents } = body;

    const paymentRepo = await getPaymentRepository();
    const payment = await paymentRepo.findById(paymentId);

    if (!payment) {
      throw new HTTPException(404, {
        message: 'Payment not found'
      });
    }

    // Check authorization
    if (user) {
      // Authenticated user - check ownership (admin can access all)
      if (user.userType !== 'admin' && payment.user_id !== user.id) {
        throw new HTTPException(403, {
          message: 'Access denied: insufficient privileges for this payment'
        });
      }
    } else {
      // Anonymous user - can only access guest payments
      if (!payment.is_guest_payment) {
        throw new HTTPException(403, {
          message: 'Access denied: authentication required for this payment'
        });
      }
    }

    // Check if payment is in a capturable state
    if (!['authorized', 'requires_capture'].includes(payment.status)) {
      throw new HTTPException(400, {
        message: `Payment cannot be captured. Current status: ${payment.status}`
      });
    }

    const adapter = await getPaymentAdapterWithFailover(payment.provider_id);

    // Check if provider supports manual capture
    const capabilities = adapter.getCapabilities();
    if (!capabilities.supports_manual_capture) {
      throw new HTTPException(400, {
        message: `Provider ${payment.provider_id} does not support manual capture`
      });
    }

    const capturedPayment = await adapter.capturePaymentIntent(
      payment.provider_intent_id || paymentId,
      amount_cents
    );

    // Update payment in database with capture information
    const mappedStatus = mapPaymentIntentStatus(capturedPayment.status);
    const updateData: any = {
      status: mappedStatus,
      metadata: JSON.stringify(capturedPayment.metadata),
      updated_at: new Date().toISOString()
    };

    if (mappedStatus === PaymentStatus.SUCCEEDED) {
      updateData.completed_at = new Date().toISOString();
    }

    const updatedPayment = await paymentRepo.update(paymentId, updateData);

    console.log('✅ Payment captured successfully:', paymentId);

    return c.json({
      id: updatedPayment!.id,
      status: updatedPayment!.status,
      amount_cents: payment.amount_cents,
      currency: payment.currency,
      // Include computed authorization/capture fields for easy access
      authorized_amount_cents: capturedPayment.metadata?.authorized_amount_cents,
      captured_amount_cents: capturedPayment.metadata?.captured_amount_cents,
      remaining_amount_cents: capturedPayment.metadata?.remaining_amount_cents,
      capture_status: capturedPayment.metadata?.capture_status,
      updated_at: updatedPayment!.updated_at,
      completed_at: updatedPayment!.completed_at
    });
  } catch (error) {
    if (error instanceof HTTPException) {
      throw error;
    }

    console.error('❌ Error capturing payment:', error);
    throw new HTTPException(500, {
      message: error instanceof Error ? error.message : 'Failed to capture payment'
    });
  }
});

// Get payments with optional authentication (supports token parameter)
payments.get('/payments', optionalAuth(), async (c) => {
  try {
    const user = c.get('user');
    const token = c.req.query('token'); // Get token from query parameter

    // Parse and validate query parameters
    const { page, limit } = validatePaginationParams(
      c.req.query('page'),
      c.req.query('limit'),
      50 // Max 50 for users
    );

    const status = c.req.query('status');
    const search = c.req.query('search');
    const created_at_from = c.req.query('created_at_from');
    const created_at_to = c.req.query('created_at_to');

    const { orderBy, orderDir } = validateOrderParams(
      c.req.query('orderBy'),
      c.req.query('orderDir'),
      ['created_at', 'amount_cents', 'status', 'updated_at']
    );

    console.log(`💳 Payments list requested by: ${user ? `${user.id} (${user.userType})` : 'anonymous'} ${token ? `with token: ${token.substring(0, 8)}...` : ''}`);

    const paymentRepo = await getPaymentRepository();

    if (user) {
      // Authenticated user - different logic for guest vs regular users
      let userPayments: any[] = [];
      let total = 0;

      if (user.userType === 'guest' && user.email) {
        // Guest user with token - search by guest_email using optimized query
        console.log(`🔍 Guest user authenticated with token:`);
        console.log(`   - User ID: ${user.id}`);
        console.log(`   - Email: ${user.email}`);
        console.log(`   - User Type: ${user.userType}`);
        console.log(`   - Searching payments by guest_email: ${user.email}`);

        // Use optimized query with filters
        const result = await paymentRepo.findGuestPaymentsWithFilters(
          user.email,
          {
            status,
            search,
            created_at_from,
            created_at_to
          },
          {
            page,
            limit,
            orderBy,
            orderDir
          }
        );

        userPayments = result.payments;
        total = result.total;

        console.log(`✅ Found ${userPayments.length} guest payments for email: ${user.email} (total: ${total})`);

        if (userPayments.length === 0) {
          console.log(`🔍 No payments found, checking all guest payments in database...`);
          const allGuestPayments = await paymentRepo.findRecent(50);
          const guestOnly = allGuestPayments.filter(p => p.is_guest_payment);
          console.log(`📊 Total guest payments in DB: ${guestOnly.length}`);
          guestOnly.forEach(p => {
            console.log(`   - Payment ${p.id}: guest_email="${p.guest_email}"`);
          });
        }
      } else {
        // Regular authenticated user - search by user_id (mantener lógica actual)
        console.log(`🔍 Regular user authenticated, searching payments by user_id: ${user.id}`);
        const filters = {
          user_id: user.id,
          status: status || undefined
        };

        const result = await paymentRepo.findWithFilters(filters, {
          page,
          limit
        });

        userPayments = result.payments;
        total = result.total;

        console.log(`✅ Found ${userPayments.length} user payments for user_id: ${user.id}`);
      }

      // Format payments data with NEW UNIFIED PRICING SYSTEM
      const formattedPayments = userPayments.map(p => ({
        id: p.id,
        // NEW UNIFIED PRICING SYSTEM
        subtotal_cents: p.subtotal_cents || p.amount_cents || 0,
        tax_cents: p.tax_cents || 0,
        discount_cents: p.discount_cents || 0,
        total_cents: p.total_cents || p.amount_cents || 0,
        // Legacy compatibility
        amount_cents: p.total_cents || p.amount_cents || 0,
        currency: p.currency,
        status: p.status,
        description: p.description,
        provider_id: p.provider_id,
        // Payment method reference
        payment_method_id: p.payment_method_id,
        // Enhanced tracking fields
        concept: p.concept,
        reference_code: p.reference_code,
        category: p.category,
        tags: p.tags,
        created_at: p.created_at,
        updated_at: p.updated_at,
        completed_at: p.completed_at,
        is_guest_payment: p.is_guest_payment,
        guest_email: user.userType === 'guest' ? p.guest_email : undefined
        // Don't expose sensitive data like client_secret
      }));

      // Use new standard response format
      const response = formatResponse(
        formattedPayments,
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
      );

      console.log(`📤 Sending response with ${formattedPayments.length} payments`);
      return c.json(response);
    } else if (token && typeof token === 'string') {
      // Token provided but authentication failed - try fallback search by guest_email
      console.log(`🔍 Token authentication failed, attempting fallback search for token: ${token.substring(0, 8)}...`);

      try {
        // Try to find guest email associated with this token
        const guestEmail = await paymentRepo.findGuestEmailByToken(token);

        if (guestEmail) {
          console.log(`✅ Found guest email for token: ${guestEmail}`);

          // Search payments by guest email
          const guestPayments = await paymentRepo.findGuestPayments(guestEmail, limit);

          console.log(`✅ Found ${guestPayments.length} payments for guest email: ${guestEmail}`);

          return c.json({
            success: true,
            data: {
              payments: guestPayments.map(p => ({
                id: p.id,
                // NEW UNIFIED PRICING SYSTEM
                subtotal_cents: p.subtotal_cents || p.amount_cents || 0,
                tax_cents: p.tax_cents || 0,
                discount_cents: p.discount_cents || 0,
                total_cents: p.total_cents || p.amount_cents || 0,
                // Legacy compatibility
                amount_cents: p.total_cents || p.amount_cents || 0,
                currency: p.currency,
                status: p.status,
                description: p.description,
                provider_id: p.provider_id,
                // Enhanced tracking fields
                concept: p.concept,
                reference_code: p.reference_code,
                category: p.category,
                tags: p.tags,
                created_at: p.created_at,
                updated_at: p.updated_at,
                completed_at: p.completed_at,
                is_guest_payment: p.is_guest_payment
              })),
              pagination: {
                page: 1,
                limit: guestPayments.length,
                total: guestPayments.length,
                pages: 1
              },
              user_context: {
                authenticated: false,
                guest_access: true,
                guest_email: guestEmail,
                token_provided: true,
                access_method: 'fallback_token_search',
                message: 'Showing payments for guest user (fallback mode)'
              }
            },
            timestamp: new Date().toISOString()
          });
        } else {
          console.warn(`⚠️ No guest email found for token: ${token.substring(0, 8)}...`);
          // Don't show any payments for invalid tokens (security)
        }
      } catch (fallbackError) {
        console.error('Fallback search error:', fallbackError);
      }

      // If all fallbacks fail, return error
      return c.json(formatError(
        "Authentication Failed",
        "Token validation failed and no associated payments found"
      ), 401);
    } else {
      // Anonymous user - no token provided
      return c.json(formatError(
        "Authentication Required",
        "Authentication required to view payments"
      ), 401);
    }

  } catch (error) {
    console.error('Get payments error:', error);
    throw new HTTPException(500, {
      message: 'Failed to retrieve payments'
    });
  }
});

// Get specific payment by ID (with ownership check and guest token support)
payments.get('/payments/:id', optionalAuth(), async (c) => {
  try {
    const user = c.get('user');
    const paymentId = c.req.param('id');
    const token = c.req.query('token'); // Get token from query parameter

    console.log(`🔍 Payment details requested: ${paymentId} by ${user ? `${user.id} (${user.userType})` : 'anonymous'} ${token ? `with token: ${token.substring(0, 8)}...` : ''}`);

    const paymentRepo = await getPaymentRepository();
    const payment = await paymentRepo.findById(paymentId);

    if (!payment) {
      return c.json(formatError(
        "Not Found",
        `Resource with ID ${paymentId} not found`
      ), 404);
    }

    // Get payment method details if payment_method_id exists
    let paymentMethodDetails = null;
    if (payment.payment_method_id) {
      try {
        const { getPaymentMethodRepository } = await import('../lib/database/repositories/index.js');
        const paymentMethodRepo = await getPaymentMethodRepository();
        const paymentMethod = await paymentMethodRepo.findById(payment.payment_method_id);

        if (paymentMethod) {
          // Include basic payment method info (safe fields only)
          paymentMethodDetails = {
            id: paymentMethod.id,
            payment_type: paymentMethod.payment_type,
            card_brand: paymentMethod.card_brand,
            last_four: paymentMethod.last_four,
            expiry_month: paymentMethod.expiry_month,
            expiry_year: paymentMethod.expiry_year,
            is_guest: paymentMethod.is_guest,
            // Parse metadata if it exists
            metadata: paymentMethod.metadata ? (() => {
              try {
                return JSON.parse(paymentMethod.metadata);
              } catch {
                return null;
              }
            })() : null
          };
          console.log('✅ Payment method details loaded for payment');
        }
      } catch (error) {
        console.warn('⚠️ Could not load payment method details:', error);
        // Continue without payment method details - not critical
      }
    }

    // Check access permissions
    if (user) {
      // Authenticated user - check ownership
      let hasAccess = false;
      let accessMethod = '';

      if (user.userType === 'admin') {
        // Admin can see all payments
        hasAccess = true;
        accessMethod = 'admin_access';
      } else if (user.userType === 'guest' && user.email && payment.is_guest_payment && payment.guest_email === user.email) {
        // Guest user with token - check guest email match
        hasAccess = true;
        accessMethod = 'guest_token_access';
        console.log(`✅ Guest token access granted: payment.guest_email="${payment.guest_email}" matches user.email="${user.email}"`);
      } else if (payment.user_id === user.id) {
        // Regular user - check user_id match
        hasAccess = true;
        accessMethod = 'user_id_access';
      }

      if (!hasAccess) {
        console.warn(`🚨 Unauthorized payment access attempt: user=${user.id} (${user.userType}) payment=${paymentId} owner=${payment.user_id} guest_email=${payment.guest_email}`);
        return c.json(formatError(
          "Access Denied",
          "Insufficient privileges for this payment"
        ), 403);
      }

      // Parse payment metadata if it exists
      let parsedMetadata = null;
      if (payment.metadata) {
        try {
          parsedMetadata = JSON.parse(payment.metadata);
        } catch (error) {
          console.warn('⚠️ Failed to parse payment metadata:', error);
        }
      }

      // Extract guest_name from guest_data if available
      let guestName = null;
      if (payment.guest_data) {
        try {
          const guestData = JSON.parse(payment.guest_data);
          guestName = guestData.name || null;
        } catch (error) {
          console.warn('⚠️ Failed to parse guest_data:', error);
        }
      }

      // Return payment details with NEW UNIFIED PRICING SYSTEM (exclude sensitive data for non-admin users)
      const paymentData = {
        id: payment.id,
        // NEW UNIFIED PRICING SYSTEM
        subtotal_cents: (payment as any).subtotal_cents || (payment as any).amount_cents || 0,
        tax_cents: (payment as any).tax_cents || 0,
        discount_cents: (payment as any).discount_cents || 0,
        total_cents: (payment as any).total_cents || (payment as any).amount_cents || 0,
        // Legacy compatibility
        amount_cents: (payment as any).total_cents || (payment as any).amount_cents || 0,
        currency: payment.currency,
        status: payment.status,
        description: payment.description,
        provider_id: payment.provider_id,
        provider_payment_id: payment.provider_payment_id,
        provider_intent_id: payment.provider_intent_id, // ✅ Include for payment continuation
        // Include client_secret for payment owners (needed for payment continuation)
        ...(payment.user_id === user?.id && {
          client_secret: payment.client_secret
        }),
        // Enhanced tracking fields
        concept: payment.concept,
        reference_code: payment.reference_code, // ✅ Include reference_code
        category: payment.category,
        tags: payment.tags,
        // Payment method details if available
        ...(paymentMethodDetails && { payment_method: paymentMethodDetails }),
        created_at: payment.created_at,
        updated_at: payment.updated_at,
        completed_at: payment.completed_at,
        is_guest_payment: payment.is_guest_payment,
        // Include guest info for guest users and admins
        ...((user.userType === 'guest' || user.userType === 'admin') && {
          guest_email: payment.guest_email,
          guest_name: guestName
        }),
        // Include metadata for all authenticated users (parsed)
        ...(parsedMetadata && { metadata: parsedMetadata }),
        // Include sensitive data only for admin
        ...(user.userType === 'admin' && {
          guest_data: payment.guest_data,
          user_id: payment.user_id,
          payment_method_id: payment.payment_method_id,
          error_message: payment.error_message
          // client_secret and provider_intent_id already included above for all owners
        })
      };

      // Debug log for client_secret inclusion
      console.log('🔑 Payment response debug:', {
        paymentId: payment.id,
        userId: user?.id,
        isOwner: payment.user_id === user?.id,
        hasClientSecret: !!paymentData.client_secret,
        hasProviderIntentId: !!paymentData.provider_intent_id,
        userType: user?.userType
      });

      // Use new standard response format
      return c.json(formatResponse(
        paymentData,
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
          is_owner: payment.user_id === user.id || (user.userType === 'guest' && payment.guest_email === user.email),
          is_admin: user.userType === 'admin'
        }
      ));

    } else if (token && typeof token === 'string') {
      // Token provided but authentication failed - try fallback search
      console.log(`🔍 Token authentication failed for payment details, attempting fallback search for token: ${token.substring(0, 8)}...`);

      // For payment details, we need to be more strict about token validation
      // Only allow access if the payment is a guest payment
      if (!payment.is_guest_payment || !payment.guest_email) {
        console.warn(`⚠️ Token provided for non-guest payment: ${paymentId}`);
        return c.json(formatError(
          "Authentication Failed",
          "Invalid token for this payment"
        ), 401);
      }

      try {
        // Try to find guest email associated with this token
        const guestEmail = await paymentRepo.findGuestEmailByToken(token);

        if (guestEmail && guestEmail === payment.guest_email) {
          console.log(`✅ Fallback token access granted: token maps to email "${guestEmail}" which matches payment guest_email`);

          // Extract guest_name for fallback response too
          let fallbackGuestName = null;
          if (payment.guest_data) {
            try {
              const guestData = JSON.parse(payment.guest_data);
              fallbackGuestName = guestData.name || null;
            } catch (error) {
              console.warn('⚠️ Failed to parse guest_data for fallback:', error);
            }
          }

          // Return limited payment details for fallback access with NEW UNIFIED PRICING SYSTEM
          const paymentData = {
            id: payment.id,
            // NEW UNIFIED PRICING SYSTEM
            subtotal_cents: (payment as any).subtotal_cents || (payment as any).amount_cents || 0,
            tax_cents: (payment as any).tax_cents || 0,
            discount_cents: (payment as any).discount_cents || 0,
            total_cents: (payment as any).total_cents || (payment as any).amount_cents || 0,
            // Legacy compatibility
            amount_cents: (payment as any).total_cents || (payment as any).amount_cents || 0,
            currency: payment.currency,
            status: payment.status,
            description: payment.description,
            provider_id: payment.provider_id,
            // Include basic tracking fields for guest access
            concept: payment.concept,
            reference_code: payment.reference_code, // ✅ Include reference_code for guests too
            category: payment.category,
            created_at: payment.created_at,
            updated_at: payment.updated_at,
            completed_at: payment.completed_at,
            is_guest_payment: payment.is_guest_payment,
            guest_email: payment.guest_email,
            guest_name: fallbackGuestName
          };

          return c.json(formatResponse(
            paymentData,
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
              message: 'Showing payment details for guest user (fallback mode)'
            }
          ));
        } else {
          console.warn(`⚠️ Token does not match payment guest email: token_email="${guestEmail}" payment_email="${payment.guest_email}"`);
        }
      } catch (fallbackError) {
        console.error('Fallback token search error:', fallbackError);
      }

      // If fallback fails, return error
      return c.json(formatError(
        "Authentication Failed",
        "Token validation failed for this payment"
      ), 401);
    } else {
      // Anonymous user - no token provided
      return c.json(formatError(
        "Authentication Required",
        "Authentication required to view payment details"
      ), 401);
    }

  } catch (error) {
    if (error instanceof HTTPException) {
      throw error;
    }
    console.error('Get payment details error:', error);
    return c.json(formatError(
      "Internal Server Error",
      "Failed to retrieve payment details"
    ), 500);
  }
});

export default payments;
