import { Hono } from 'hono';
import { HTTPException } from 'hono/http-exception';
import { z } from 'zod';
import {
  authMiddleware,
  optionalAuthMiddleware,
  guestCheckoutMiddleware,
  getUserContext,
  validateGuestData,
  checkGuestPaymentLimits
} from '@/lib/auth/middleware';
import { getPaymentAdapterWithFailover, getPaymentAdapter } from '@/lib/providers/factory';
import { getPaymentRepository, getPaymentUserRepository } from '@/lib/database/repositories';
import { PaymentStatus } from '@/lib/database/types';
import { PaymentIntentStatus } from '@/lib/providers/base/payment-adapter';
import { config } from '@/config/environment';

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
  return_url: z.string().url().optional()
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

// Confirm payment intent
payments.post('/payments/intents/:id/confirm', optionalAuthMiddleware, async (c) => {
  try {
    const paymentId = c.req.param('id');
    const body = await c.req.json();
    const validatedData = confirmPaymentIntentSchema.parse(body);
    const userContext = getUserContext(c);

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

    // Confirm payment with provider
    const confirmedIntent = await adapter.confirmPaymentIntent({
      payment_intent_id: payment.provider_intent_id!,
      payment_method_id: validatedData.payment_method_id,
      return_url: validatedData.return_url
    });

    // Update payment status
    const mappedStatus = mapPaymentIntentStatus(confirmedIntent.status);
    const updatedPayment = await paymentRepo.updateStatus(
      payment.id,
      mappedStatus,
      mappedStatus === PaymentStatus.FAILED ? 'Payment confirmation failed' : undefined
    );

    return c.json({
      id: updatedPayment!.id,
      status: updatedPayment!.status,
      provider_intent_id: payment.provider_intent_id,
      requires_action: mappedStatus === PaymentStatus.REQUIRES_ACTION,
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

export default payments;
