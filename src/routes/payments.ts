import { Hono } from 'hono';
import { HTTPException } from 'hono/http-exception';
import { z } from 'zod';
import { randomUUID } from 'crypto';
import {
  authMiddleware,
  optionalAuthMiddleware,
  getUserContext,
  validateGuestData,
  checkGuestPaymentLimits
} from '@/lib/auth/middleware';
import { getPaymentAdapterWithFailover, getPaymentAdapter } from '@/lib/providers/factory';
import { getPaymentRepository } from '@/lib/database/repositories';
import { PaymentStatus } from '@/lib/database/types';
import { PaymentIntentStatus } from '@/lib/providers/base/payment-adapter';

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

// Validation schemas
const createPaymentIntentSchema = z.object({
  amount_cents: z.number().int().positive(),
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
  }).optional()
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

// Create payment intent (without middleware for testing)
payments.post('/payments/intents-test', async (c) => {
  try {
    console.log('🧪 Test payment intent - getting raw text...');
    const rawText = await c.req.text();
    console.log('📝 Raw text received:', rawText);

    console.log('🧪 Test payment intent - parsing JSON manually...');
    const body = JSON.parse(rawText);
    console.log('✅ Test payment intent - JSON parsed successfully:', body);
    return c.json({ success: true, received: body });
  } catch (error) {
    console.error('❌ Test payment intent - JSON parsing failed:', error);
    return c.json({
      error: 'JSON parsing failed',
      details: error instanceof Error ? error.message : 'Unknown error'
    }, 400);
  }
});

// Create payment intent
payments.post('/payments/intents', async (c) => {
  try {
    console.log('🔍 Parsing request body with c.req.json()...');
    const body = await c.req.json();
    console.log('📝 Request body:', JSON.stringify(body, null, 2));

    const validatedData = createPaymentIntentSchema.parse(body);
    console.log('✅ Validated data:', JSON.stringify(validatedData, null, 2));

    // Get initial user context
    let userContext = getUserContext(c);
    console.log('👤 Initial user context:', userContext);

    // Manual guest checkout validation
    if (!userContext.isAuthenticated) {
      console.log('🔍 User not authenticated, treating as guest');
      c.set('is_guest', true);

      const guestData = validatedData.guest_data;
      console.log('📧 Guest data:', guestData);

      if (guestData) {
        validateGuestData(guestData);

        // Check guest payment limits
        if (guestData.email) {
          await checkGuestPaymentLimits(guestData.email);
        }

        // Set guest data in context
        c.set('guest_data', guestData);
      }

      // Update user context after setting guest state
      userContext = getUserContext(c);
      console.log('👤 Updated user context:', userContext);
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

    // Create payment intent with provider
    const paymentIntent = await adapter.createPaymentIntent({
      amount_cents: validatedData.amount_cents,
      currency: validatedData.currency,
      description: validatedData.description,
      payment_method_id: validatedData.payment_method_id,
      return_url: validatedData.return_url,
      metadata: validatedData.metadata
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
        provider_id: adapter.getProviderId(),
        provider_payment_id: null,
        provider_intent_id: paymentIntent.id,
        client_secret: paymentIntent.client_secret || null,
        amount_cents: validatedData.amount_cents,
        currency: validatedData.currency,
        status: mapPaymentIntentStatus(paymentIntent.status),
        description: validatedData.description || null,
        error_message: null,
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
        provider_id: adapter.getProviderId(),
        provider_payment_id: null,
        provider_intent_id: paymentIntent.id,
        client_secret: paymentIntent.client_secret || null,
        amount_cents: validatedData.amount_cents,
        currency: validatedData.currency,
        status: mapPaymentIntentStatus(paymentIntent.status),
        description: validatedData.description || null,
        error_message: null,
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
      amount_cents: payment.amount_cents,
      currency: payment.currency,
      status: payment.status,
      provider_id: payment.provider_id,
      is_guest_payment: payment.is_guest_payment,
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
    throw new HTTPException(500, {
      message: 'Failed to create payment intent'
    });
  }
});

// Update payment intent
payments.put('/payments/intents/:id', optionalAuthMiddleware, async (c) => {
  try {
    const paymentId = c.req.param('id');
    const body = await c.req.json();
    const validatedData = updatePaymentIntentSchema.parse(body);
    const userContext = getUserContext(c);

    console.log('🔄 Updating payment intent:', {
      paymentId,
      updates: validatedData,
      userContext: userContext.isAuthenticated ? 'authenticated' : 'guest'
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
    if (!userContext.isGuest && payment.user_id !== userContext.userId) {
      throw new HTTPException(403, {
        message: 'Access denied'
      });
    }

    if (userContext.isGuest && !payment.is_guest_payment) {
      throw new HTTPException(403, {
        message: 'Access denied'
      });
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
payments.post('/payments/intents/:id/confirm', optionalAuthMiddleware, async (c) => {
  try {
    const paymentId = c.req.param('id');
    const body = await c.req.json();
    const validatedData = confirmPaymentIntentSchema.parse(body);
    const userContext = getUserContext(c);

    console.log('🔍 Confirming payment intent:', {
      paymentId,
      savePaymentMethod: validatedData.save_payment_method,
      userContext: userContext.isAuthenticated ? 'authenticated' : 'guest'
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
    if (!userContext.isGuest && payment.user_id !== userContext.userId) {
      throw new HTTPException(403, {
        message: 'Access denied'
      });
    }

    if (userContext.isGuest && !payment.is_guest_payment) {
      throw new HTTPException(403, {
        message: 'Access denied'
      });
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

// Get payment by ID
payments.get('/payments/:id', optionalAuthMiddleware, async (c) => {
  try {
    const paymentId = c.req.param('id');
    const userContext = getUserContext(c);

    const paymentRepo = await getPaymentRepository();
    const payment = await paymentRepo.findById(paymentId);

    if (!payment) {
      throw new HTTPException(404, {
        message: 'Payment not found'
      });
    }

    // Check authorization
    if (!userContext.isGuest && payment.user_id !== userContext.userId) {
      throw new HTTPException(403, {
        message: 'Access denied'
      });
    }

    if (userContext.isGuest && !payment.is_guest_payment) {
      throw new HTTPException(403, {
        message: 'Access denied'
      });
    }

    // Don't expose sensitive data
    const response = {
      id: payment.id,
      amount_cents: payment.amount_cents,
      currency: payment.currency,
      status: payment.status,
      description: payment.description,
      provider_id: payment.provider_id,
      is_guest_payment: payment.is_guest_payment,
      metadata: payment.metadata ? JSON.parse(payment.metadata) : null,
      created_at: payment.created_at,
      updated_at: payment.updated_at,
      completed_at: payment.completed_at
    };

    return c.json(response);

  } catch (error) {
    if (error instanceof HTTPException) {
      throw error;
    }

    console.error('Get payment error:', error);
    throw new HTTPException(500, {
      message: 'Failed to retrieve payment'
    });
  }
});

// List user payments
payments.get('/payments', authMiddleware, async (c) => {
  try {
    const userId = c.get('user_id');
    const limit = Math.min(parseInt(c.req.query('limit') || '20'), 100);
    const offset = parseInt(c.req.query('offset') || '0');

    const paymentRepo = await getPaymentRepository();
    const payments = await paymentRepo.findByUserId(userId, limit);

    const response = payments.map(payment => ({
      id: payment.id,
      amount_cents: payment.amount_cents,
      currency: payment.currency,
      status: payment.status,
      description: payment.description,
      provider_id: payment.provider_id,
      metadata: payment.metadata ? JSON.parse(payment.metadata) : null,
      created_at: payment.created_at,
      completed_at: payment.completed_at
    }));

    return c.json({
      payments: response,
      limit,
      offset,
      total: response.length
    });

  } catch (error) {
    console.error('List payments error:', error);
    throw new HTTPException(500, {
      message: 'Failed to retrieve payments'
    });
  }
});

// Cancel payment intent
payments.post('/payments/:id/cancel', optionalAuthMiddleware, async (c) => {
  try {
    const paymentId = c.req.param('id');
    const userContext = getUserContext(c);

    const paymentRepo = await getPaymentRepository();
    const payment = await paymentRepo.findById(paymentId);

    if (!payment) {
      throw new HTTPException(404, {
        message: 'Payment not found'
      });
    }

    // Check authorization
    if (!userContext.isGuest && payment.user_id !== userContext.userId) {
      throw new HTTPException(403, {
        message: 'Access denied'
      });
    }

    if (userContext.isGuest && !payment.is_guest_payment) {
      throw new HTTPException(403, {
        message: 'Access denied'
      });
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
payments.post('/payments/:id/capture', optionalAuthMiddleware, async (c) => {
  try {
    const paymentId = c.req.param('id');
    const userContext = getUserContext(c);

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
    if (!userContext.isGuest && payment.user_id !== userContext.userId) {
      throw new HTTPException(403, {
        message: 'Access denied'
      });
    }

    if (userContext.isGuest && !payment.is_guest_payment) {
      throw new HTTPException(403, {
        message: 'Access denied'
      });
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

export default payments;
