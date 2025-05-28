import { Hono } from 'hono';
import { HTTPException } from 'hono/http-exception';
import { z } from 'zod';
import { randomUUID } from 'crypto';
import {
  authMiddleware,
  optionalAuthMiddleware,
  getUserContext
} from '@/lib/auth/middleware';
// import { getPaymentAdapter } from '@/lib/providers/factory'; // TODO: Uncomment when subscription methods are implemented
import {
  getSubscriptionRepository,
  getCustomerRepository,
  getProductRepository
} from '@/lib/database/repositories';
import { SubscriptionStatus } from '@/lib/database/types';

const subscriptions = new Hono();

// Validation schemas
const createSubscriptionSchema = z.object({
  customer_id: z.string().min(1),
  product_id: z.string().optional(), // Optional for custom subscriptions
  payment_method_id: z.string().min(1),
  provider_id: z.string().default('stripe'),

  // Organization support
  organization_id: z.string().optional(), // Optional organization ID

  // Custom subscription fields (used when product_id is null)
  price_cents: z.number().int().positive().optional(),
  currency: z.string().length(3).optional(),
  billing_interval: z.enum(['monthly', 'yearly', 'weekly', 'daily']).default('monthly'),
  interval_multiplier: z.number().int().min(1).max(12).default(1),
  trial_days: z.number().int().min(0).optional(),

  // Optional overrides (even for product-based subscriptions)
  custom_price_cents: z.number().int().positive().optional(),
  custom_trial_days: z.number().int().min(0).optional(),

  metadata: z.record(z.any()).optional(),
  guest_data: z.object({
    email: z.string().email(),
    name: z.string().min(1)
  }).optional()
});

const updateSubscriptionSchema = z.object({
  payment_method_id: z.string().optional(),
  metadata: z.record(z.any()).optional()
});

const cancelSubscriptionSchema = z.object({
  cancel_at_period_end: z.boolean().default(true),
  reason: z.string().optional()
});

// Create subscription
subscriptions.post('/', optionalAuthMiddleware, async (c) => {
  try {
    const body = await c.req.json();
    const validatedData = createSubscriptionSchema.parse(body);
    const userContext = getUserContext(c);

    console.log('🔄 Creating subscription...');
    console.log('📋 Subscription data:', {
      customer_id: validatedData.customer_id,
      product_id: validatedData.product_id,
      has_custom_pricing: !!validatedData.price_cents
    });

    // Get repositories
    const subscriptionRepo = await getSubscriptionRepository();
    const customerRepo = await getCustomerRepository();
    const productRepo = await getProductRepository();

    // Verify customer exists and user has access
    const customer = await customerRepo.findById(validatedData.customer_id);
    if (!customer) {
      throw new HTTPException(404, { message: 'Customer not found' });
    }

    // Verify user has access to this customer
    if (!userContext.isGuest) {
      const hasUserAccess = customer.user_id === userContext.userId;
      const hasOrgAccess = userContext.organizationId && customer.organization_id === userContext.organizationId;

      if (!hasUserAccess && !hasOrgAccess) {
        throw new HTTPException(403, { message: 'Access denied to this customer' });
      }
    } else {
      if (!customer.is_guest) {
        throw new HTTPException(403, { message: 'Guest cannot access non-guest customer' });
      }
    }

    let subscriptionData: any;
    // let providerSubscriptionData: any; // TODO: Uncomment when provider integration is implemented

    if (validatedData.product_id) {
      // Product-based subscription
      console.log('📦 Creating product-based subscription...');

      const product = await productRepo.findById(validatedData.product_id);
      if (!product) {
        throw new HTTPException(404, { message: 'Product not found' });
      }

      if (!product.is_active) {
        throw new HTTPException(400, { message: 'Product is not active' });
      }

      if (!product.is_recurring) {
        throw new HTTPException(400, { message: 'Product is not a subscription product' });
      }

      // Use product data with optional overrides
      const finalPriceCents = validatedData.custom_price_cents || product.price_cents;
      const finalTrialDays = validatedData.custom_trial_days ?? product.trial_days;
      const finalCurrency = product.currency;
      const billingInterval = product.billing_interval;

      if (!billingInterval) {
        throw new HTTPException(400, { message: 'Product must have a billing interval for subscriptions' });
      }

      console.log('💰 Using product pricing:', {
        price_cents: finalPriceCents,
        currency: finalCurrency,
        billing_interval: billingInterval,
        trial_days: finalTrialDays
      });

      // Calculate period dates based on billing interval
      const now = new Date();
      const periodStart = now.toISOString();
      let periodEnd: string;

      switch (billingInterval) {
        case 'monthly':
          periodEnd = new Date(now.getFullYear(), now.getMonth() + 1, now.getDate()).toISOString();
          break;
        case 'yearly':
          periodEnd = new Date(now.getFullYear() + 1, now.getMonth(), now.getDate()).toISOString();
          break;
        case 'weekly':
          periodEnd = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000).toISOString();
          break;
        case 'daily':
          periodEnd = new Date(now.getTime() + 24 * 60 * 60 * 1000).toISOString();
          break;
        default:
          throw new HTTPException(400, { message: 'Invalid billing interval' });
      }

      subscriptionData = {
        id: randomUUID(),
        user_id: userContext.isAuthenticated ? userContext.userId : null,
        organization_id: validatedData.organization_id || userContext.organizationId || null,
        customer_id: validatedData.customer_id,
        product_id: validatedData.product_id,
        payment_method_id: validatedData.payment_method_id,
        provider_id: validatedData.provider_id,
        provider_subscription_id: null, // Will be set after provider creation
        status: finalTrialDays > 0 ? SubscriptionStatus.TRIALING : SubscriptionStatus.ACTIVE,
        current_period_start: periodStart,
        current_period_end: periodEnd,
        cancel_at_period_end: false,
        trial_end: finalTrialDays > 0 ? new Date(now.getTime() + finalTrialDays * 24 * 60 * 60 * 1000).toISOString() : null,
        price_cents: finalPriceCents,
        currency: finalCurrency,
        // New billing fields
        billing_interval: billingInterval,
        interval_multiplier: validatedData.interval_multiplier,
        next_billing_date: periodEnd, // Use calculated period end
        last_billing_attempt: null,
        billing_retry_count: 0,
        max_retry_attempts: 3,
        billing_status: 'active',
        metadata: JSON.stringify({
          ...validatedData.metadata,
          product_name: product.name,
          is_product_subscription: true
        })
      };

      // TODO: Uncomment when provider integration is implemented
      // providerSubscriptionData = {
      //   customer_id: customer.provider_customer_id,
      //   price_cents: finalPriceCents,
      //   currency: finalCurrency,
      //   interval: billingInterval,
      //   trial_period_days: finalTrialDays,
      //   payment_method_id: validatedData.payment_method_id,
      //   metadata: {
      //     subscription_id: subscriptionData.id,
      //     product_id: validatedData.product_id,
      //     product_name: product.name
      //   }
      // };

    } else {
      // Custom subscription (no product)
      console.log('🎨 Creating custom subscription...');

      if (!validatedData.price_cents || !validatedData.currency || !validatedData.billing_interval) {
        throw new HTTPException(400, {
          message: 'For custom subscriptions, price_cents, currency, and billing_interval are required'
        });
      }

      const finalTrialDays = validatedData.trial_days || 0;

      console.log('💰 Using custom pricing:', {
        price_cents: validatedData.price_cents,
        currency: validatedData.currency,
        billing_interval: validatedData.billing_interval,
        trial_days: finalTrialDays
      });

      // Calculate period dates
      const now = new Date();
      const periodStart = now.toISOString();
      let periodEnd: string;

      switch (validatedData.billing_interval) {
        case 'monthly':
          periodEnd = new Date(now.getFullYear(), now.getMonth() + 1, now.getDate()).toISOString();
          break;
        case 'yearly':
          periodEnd = new Date(now.getFullYear() + 1, now.getMonth(), now.getDate()).toISOString();
          break;
        case 'weekly':
          periodEnd = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000).toISOString();
          break;
        case 'daily':
          periodEnd = new Date(now.getTime() + 24 * 60 * 60 * 1000).toISOString();
          break;
        default:
          throw new HTTPException(400, { message: 'Invalid billing interval' });
      }

      subscriptionData = {
        id: randomUUID(),
        user_id: userContext.isAuthenticated ? userContext.userId : null,
        organization_id: validatedData.organization_id || userContext.organizationId || null,
        customer_id: validatedData.customer_id,
        product_id: null, // Custom subscription
        payment_method_id: validatedData.payment_method_id,
        provider_id: validatedData.provider_id,
        provider_subscription_id: null,
        status: finalTrialDays > 0 ? SubscriptionStatus.TRIALING : SubscriptionStatus.ACTIVE,
        current_period_start: periodStart,
        current_period_end: periodEnd,
        cancel_at_period_end: false,
        trial_end: finalTrialDays > 0 ? new Date(now.getTime() + finalTrialDays * 24 * 60 * 60 * 1000).toISOString() : null,
        price_cents: validatedData.price_cents,
        currency: validatedData.currency,
        // New billing fields
        billing_interval: validatedData.billing_interval,
        interval_multiplier: validatedData.interval_multiplier,
        next_billing_date: periodEnd, // Use calculated period end
        last_billing_attempt: null,
        billing_retry_count: 0,
        max_retry_attempts: 3,
        billing_status: 'active',
        metadata: JSON.stringify({
          ...validatedData.metadata,
          is_custom_subscription: true
        })
      };

      // TODO: Uncomment when provider integration is implemented
      // providerSubscriptionData = {
      //   customer_id: customer.provider_customer_id,
      //   price_cents: validatedData.price_cents,
      //   currency: validatedData.currency,
      //   interval: validatedData.billing_interval,
      //   trial_period_days: finalTrialDays,
      //   payment_method_id: validatedData.payment_method_id,
      //   metadata: {
      //     subscription_id: subscriptionData.id,
      //     is_custom: true
      //   }
      // };
    }

    // Create subscription in payment provider (TODO: Implement subscription methods in PaymentAdapter)
    console.log('🔗 Creating subscription in payment provider...');
    // const adapter = await getPaymentAdapter(validatedData.provider_id);
    // const providerSubscription = await adapter.createSubscription(providerSubscriptionData);
    console.log('⚠️ Provider subscription creation not implemented yet - creating local subscription only');

    // Update subscription with provider ID (using placeholder for now)
    subscriptionData.provider_subscription_id = `sub_local_${subscriptionData.id}`;

    // Save to database
    console.log('💾 Saving subscription to database...');
    const subscription = await subscriptionRepo.create(subscriptionData);

    console.log('✅ Subscription created successfully:', subscription.id);

    return c.json({
      id: subscription.id,
      customer_id: subscription.customer_id,
      product_id: subscription.product_id,
      payment_method_id: subscription.payment_method_id,
      provider_id: subscription.provider_id,
      provider_subscription_id: subscription.provider_subscription_id,
      status: subscription.status,
      current_period_start: subscription.current_period_start,
      current_period_end: subscription.current_period_end,
      cancel_at_period_end: subscription.cancel_at_period_end,
      trial_end: subscription.trial_end,
      price_cents: subscription.price_cents,
      currency: subscription.currency,
      metadata: subscription.metadata ? JSON.parse(subscription.metadata) : null,
      created_at: subscription.created_at
    }, 201);

  } catch (error) {
    console.error('❌ Subscription creation failed:', error);

    if (error instanceof HTTPException) {
      throw error;
    }

    if (error instanceof z.ZodError) {
      throw new HTTPException(400, {
        message: 'Validation failed',
        cause: error.errors
      });
    }

    throw new HTTPException(500, {
      message: 'Failed to create subscription',
      cause: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

// Get subscription by ID
subscriptions.get('/:id', optionalAuthMiddleware, async (c) => {
  try {
    const subscriptionId = c.req.param('id');
    const userContext = getUserContext(c);

    const subscriptionRepo = await getSubscriptionRepository();
    const subscription = await subscriptionRepo.findById(subscriptionId);

    if (!subscription) {
      throw new HTTPException(404, { message: 'Subscription not found' });
    }

    // Verify user has access to this subscription
    if (!userContext.isGuest) {
      const hasUserAccess = subscription.user_id === userContext.userId;
      const hasOrgAccess = userContext.organizationId && subscription.organization_id === userContext.organizationId;

      if (!hasUserAccess && !hasOrgAccess) {
        throw new HTTPException(403, { message: 'Access denied to this subscription' });
      }
    } else {
      // For guests, verify via customer
      const customerRepo = await getCustomerRepository();
      const customer = await customerRepo.findById(subscription.customer_id);
      if (!customer?.is_guest) {
        throw new HTTPException(403, { message: 'Access denied to this subscription' });
      }
    }

    return c.json({
      id: subscription.id,
      user_id: subscription.user_id,
      organization_id: subscription.organization_id,
      customer_id: subscription.customer_id,
      product_id: subscription.product_id,
      payment_method_id: subscription.payment_method_id,
      provider_id: subscription.provider_id,
      provider_subscription_id: subscription.provider_subscription_id,
      status: subscription.status,
      current_period_start: subscription.current_period_start,
      current_period_end: subscription.current_period_end,
      cancel_at_period_end: subscription.cancel_at_period_end,
      trial_end: subscription.trial_end,
      price_cents: subscription.price_cents,
      currency: subscription.currency,
      metadata: subscription.metadata ? JSON.parse(subscription.metadata) : null,
      created_at: subscription.created_at,
      updated_at: subscription.updated_at
    });

  } catch (error) {
    console.error('❌ Failed to get subscription:', error);

    if (error instanceof HTTPException) {
      throw error;
    }

    throw new HTTPException(500, {
      message: 'Failed to get subscription',
      cause: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

// List subscriptions
subscriptions.get('/', authMiddleware, async (c) => {
  try {
    const userContext = getUserContext(c);
    const limit = Math.min(parseInt(c.req.query('limit') || '20'), 100);
    const offset = parseInt(c.req.query('offset') || '0');
    const status = c.req.query('status') as SubscriptionStatus | undefined;

    const subscriptionRepo = await getSubscriptionRepository();

    const options: any = {
      limit,
      offset
    };

    if (status) {
      options.status = status;
    }

    if (userContext.userId) {
      options.userId = userContext.userId;
    }

    if (userContext.organizationId) {
      options.organizationId = userContext.organizationId;
    }

    const result = await subscriptionRepo.list(options);

    const subscriptions = result.subscriptions.map(subscription => ({
      id: subscription.id,
      customer_id: subscription.customer_id,
      product_id: subscription.product_id,
      status: subscription.status,
      price_cents: subscription.price_cents,
      currency: subscription.currency,
      current_period_start: subscription.current_period_start,
      current_period_end: subscription.current_period_end,
      cancel_at_period_end: subscription.cancel_at_period_end,
      trial_end: subscription.trial_end,
      created_at: subscription.created_at
    }));

    return c.json({
      subscriptions,
      total: result.total,
      limit,
      offset
    });

  } catch (error) {
    console.error('❌ Failed to list subscriptions:', error);

    throw new HTTPException(500, {
      message: 'Failed to list subscriptions',
      cause: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

// Cancel subscription
subscriptions.post('/:id/cancel', optionalAuthMiddleware, async (c) => {
  try {
    const subscriptionId = c.req.param('id');
    const body = await c.req.json();
    const validatedData = cancelSubscriptionSchema.parse(body);
    const userContext = getUserContext(c);

    const subscriptionRepo = await getSubscriptionRepository();
    const subscription = await subscriptionRepo.findById(subscriptionId);

    if (!subscription) {
      throw new HTTPException(404, { message: 'Subscription not found' });
    }

    // Verify user has access to this subscription
    if (!userContext.isGuest) {
      const hasUserAccess = subscription.user_id === userContext.userId;
      const hasOrgAccess = userContext.organizationId && subscription.organization_id === userContext.organizationId;

      if (!hasUserAccess && !hasOrgAccess) {
        throw new HTTPException(403, { message: 'Access denied to this subscription' });
      }
    } else {
      // For guests, verify via customer
      const customerRepo = await getCustomerRepository();
      const customer = await customerRepo.findById(subscription.customer_id);
      if (!customer?.is_guest) {
        throw new HTTPException(403, { message: 'Access denied to this subscription' });
      }
    }

    if (subscription.status === SubscriptionStatus.CANCELED) {
      throw new HTTPException(400, { message: 'Subscription is already canceled' });
    }

    console.log('🚫 Canceling subscription:', {
      id: subscriptionId,
      cancel_at_period_end: validatedData.cancel_at_period_end
    });

    // Cancel in payment provider (TODO: Implement subscription methods in PaymentAdapter)
    // const adapter = await getPaymentAdapter(subscription.provider_id);
    // await adapter.cancelSubscription(subscription.provider_subscription_id!, {
    //   cancel_at_period_end: validatedData.cancel_at_period_end
    // });
    console.log('⚠️ Provider cancellation not implemented yet - updating local database only');

    // Update in database
    let updatedSubscription;
    if (validatedData.cancel_at_period_end) {
      updatedSubscription = await subscriptionRepo.cancelAtPeriodEnd(subscriptionId, true);
    } else {
      updatedSubscription = await subscriptionRepo.updateStatus(subscriptionId, SubscriptionStatus.CANCELED, {
        cancellation_reason: validatedData.reason,
        canceled_at: new Date().toISOString()
      });
    }

    console.log('✅ Subscription canceled successfully');

    return c.json({
      id: updatedSubscription!.id,
      status: updatedSubscription!.status,
      cancel_at_period_end: updatedSubscription!.cancel_at_period_end,
      current_period_end: updatedSubscription!.current_period_end,
      message: validatedData.cancel_at_period_end
        ? 'Subscription will be canceled at the end of the current period'
        : 'Subscription has been canceled immediately',
      updated_at: updatedSubscription!.updated_at
    });

  } catch (error) {
    console.error('❌ Failed to cancel subscription:', error);

    if (error instanceof HTTPException) {
      throw error;
    }

    if (error instanceof z.ZodError) {
      throw new HTTPException(400, {
        message: 'Validation failed',
        cause: error.errors
      });
    }

    throw new HTTPException(500, {
      message: 'Failed to cancel subscription',
      cause: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

// Get guest subscriptions by email
subscriptions.get('/guest/:email', async (c) => {
  try {
    const email = c.req.param('email');

    const subscriptionRepo = await getSubscriptionRepository();
    const customerRepo = await getCustomerRepository();

    const guestSubscriptions = await subscriptionRepo.findGuestsByEmail(email);

    const subscriptionsWithGuestInfo = await Promise.all(
      guestSubscriptions.map(async (subscription) => {
        const customer = await customerRepo.findById(subscription.customer_id);
        return {
          id: subscription.id,
          customer_id: subscription.customer_id,
          product_id: subscription.product_id,
          status: subscription.status,
          price_cents: subscription.price_cents,
          currency: subscription.currency,
          trial_end: subscription.trial_end,
          current_period_start: subscription.current_period_start,
          current_period_end: subscription.current_period_end,
          guest_info: {
            email: customer?.guest_email,
            name: customer?.guest_name
          },
          created_at: subscription.created_at
        };
      })
    );

    return c.json({
      subscriptions: subscriptionsWithGuestInfo,
      total: subscriptionsWithGuestInfo.length
    });

  } catch (error) {
    console.error('❌ Failed to get guest subscriptions:', error);

    throw new HTTPException(500, {
      message: 'Failed to get guest subscriptions',
      cause: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

export default subscriptions;
