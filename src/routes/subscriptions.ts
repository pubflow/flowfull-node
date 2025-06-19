import { Hono } from 'hono';
import { HTTPException } from 'hono/http-exception';
import { z } from 'zod';
import { randomUUID } from 'crypto';
import {
  authMiddleware,
  optionalAuthMiddleware,
  getUserContext
} from '@/lib/auth/middleware';
import { PaymentProviderFactory } from '@/lib/providers/factory';

// Helper function to get payment adapter
async function getPaymentAdapter(providerId: string) {
  return PaymentProviderFactory.getAdapter(providerId);
}
import {
  getSubscriptionRepository,
  getCustomerRepository,
  getProductRepository,
  getPaymentMethodRepository
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
  }).optional(),

  // Enhanced tracking fields (inspired by payments table)
  description: z.string().optional(), // Human-readable description (e.g., "Premium Monthly Plan", "Basic Annual Subscription")
  concept: z.string().optional(), // Human-readable concept (e.g., "Monthly Subscription", "Annual Plan", "Trial Subscription")
  reference_code: z.string().optional(), // Machine-readable code for analytics (e.g., "subscription_monthly", "plan_premium_annual")
  category: z.string().optional(), // High-level category (e.g., "subscription", "trial", "upgrade", "downgrade")
  tags: z.string().optional() // Comma-separated tags for flexible categorization (e.g., "promotion,summer,discount,premium")
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

    // Find customer - support both internal ID and provider customer ID
    let customer: any = null;

    // First try to find by internal ID (provider_customers.id)
    try {
      customer = await customerRepo.findById(validatedData.customer_id);
    } catch (error) {
      // If not found, try to find by provider_customer_id (Stripe ID)
      console.log('🔍 Customer not found by internal ID, trying provider_customer_id...');
    }

    // If not found by internal ID, try by provider_customer_id
    if (!customer) {
      try {
        customer = await customerRepo.findByProviderCustomerId(validatedData.provider_id, validatedData.customer_id);
      } catch (error) {
        console.log('🔍 Customer not found by provider_customer_id either');
      }
    }

    // If still not found, check if this is a user_id and create/find customer
    if (!customer && userContext.isAuthenticated) {
      console.log('🔍 Trying to find customer by user_id...');
      try {
        // Try to find existing customer for this user and provider
        const customers = await customerRepo.findByUserId(userContext.userId!);
        customer = customers.find(c => c.provider_id === validatedData.provider_id);

        if (customer) {
          console.log('✅ Found existing customer for user:', customer.id);
          // Update the customer_id in the request to use the correct internal ID
          validatedData.customer_id = customer.id;
        }
      } catch (error) {
        console.log('⚠️ Could not find customer by user_id');
      }
    }

    if (!customer) {
      throw new HTTPException(404, {
        message: 'Customer not found. Please create a customer first or use the correct customer ID.'
      });
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
        }),
        // Enhanced tracking fields
        description: validatedData.description || `${product.name} - ${billingInterval} subscription`,
        concept: validatedData.concept || `${billingInterval.charAt(0).toUpperCase() + billingInterval.slice(1)} Subscription`,
        reference_code: validatedData.reference_code || `subscription_${billingInterval}_${product.id}`,
        category: validatedData.category || 'subscription',
        tags: validatedData.tags
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
        }),
        // Enhanced tracking fields
        description: validatedData.description || `Custom ${validatedData.billing_interval} subscription - $${(validatedData.price_cents / 100).toFixed(2)}`,
        concept: validatedData.concept || `Custom ${validatedData.billing_interval.charAt(0).toUpperCase() + validatedData.billing_interval.slice(1)} Subscription`,
        reference_code: validatedData.reference_code || `subscription_custom_${validatedData.billing_interval}`,
        category: validatedData.category || 'subscription',
        tags: validatedData.tags
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

    // Create subscription in payment provider
    console.log('🔗 Creating subscription in payment provider...');

    try {
      const adapter = await getPaymentAdapter(validatedData.provider_id);

      // Check if provider supports subscriptions
      if (!adapter.getCapabilities().supports_subscriptions) {
        console.log('⚠️ Provider does not support subscriptions - creating local subscription only');
        subscriptionData.provider_subscription_id = `sub_local_${subscriptionData.id}`;
      } else {
        // Get payment method to retrieve provider_payment_method_id
        const paymentMethodRepo = await getPaymentMethodRepository();
        const paymentMethod = await paymentMethodRepo.findById(validatedData.payment_method_id);

        if (!paymentMethod) {
          throw new HTTPException(404, { message: 'Payment method not found' });
        }

        if (!paymentMethod.provider_payment_method_id) {
          throw new HTTPException(400, { message: 'Payment method does not have a provider ID' });
        }

        console.log('🔍 Using payment method:', {
          internal_id: paymentMethod.id,
          provider_id: paymentMethod.provider_payment_method_id
        });

        // Get product info if this is a product-based subscription
        let productInfo = {};
        if (validatedData.product_id) {
          try {
            const product = await productRepo.findById(validatedData.product_id);
            if (product) {
              productInfo = {
                product_name: product.name,
                product_description: product.description,
                is_product_subscription: true
              };
            }
          } catch (error) {
            console.log('⚠️ Could not fetch product info for metadata');
          }
        }

        // Create subscription with provider
        const providerSubscriptionRequest = {
          customer_id: customer.provider_customer_id!,
          price_cents: subscriptionData.price_cents,
          currency: subscriptionData.currency,
          billing_interval: subscriptionData.billing_interval as any,
          interval_multiplier: subscriptionData.interval_multiplier,
          payment_method_id: paymentMethod.provider_payment_method_id, // Use provider ID, not internal ID
          trial_period_days: subscriptionData.trial_end ?
            Math.ceil((new Date(subscriptionData.trial_end).getTime() - Date.now()) / (24 * 60 * 60 * 1000)) :
            undefined,
          product_id: subscriptionData.product_id, // Pass product_id to adapter
          metadata: {
            subscription_id: subscriptionData.id,
            product_id: subscriptionData.product_id,
            // Enhanced tracking fields for provider (especially Stripe)
            concept: subscriptionData.concept,
            description: subscriptionData.description,
            reference_code: subscriptionData.reference_code,
            category: subscriptionData.category,
            tags: subscriptionData.tags,
            // Include product info if available
            ...productInfo,
            // If not product-based, mark as custom
            ...(validatedData.product_id ? {} : { is_custom_subscription: true }),
            ...(subscriptionData.metadata ? JSON.parse(subscriptionData.metadata) : {})
          }
        };

        console.log('📤 Creating provider subscription with data:', {
          customer_id: providerSubscriptionRequest.customer_id,
          price_cents: providerSubscriptionRequest.price_cents,
          currency: providerSubscriptionRequest.currency,
          billing_interval: providerSubscriptionRequest.billing_interval,
          has_trial: !!providerSubscriptionRequest.trial_period_days
        });

        const providerSubscription = await adapter.createSubscription(providerSubscriptionRequest);
        subscriptionData.provider_subscription_id = providerSubscription.id;

        // Update status and dates from provider response
        subscriptionData.status = providerSubscription.status as any;
        subscriptionData.current_period_start = providerSubscription.current_period_start;
        subscriptionData.current_period_end = providerSubscription.current_period_end;

        console.log('✅ Provider subscription created:', providerSubscription.id);
      }
    } catch (providerError) {
      console.error('❌ Provider subscription creation failed:', providerError);
      console.log('⚠️ Falling back to local subscription creation');
      subscriptionData.provider_subscription_id = `sub_local_${subscriptionData.id}`;
    }

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
      // Enhanced tracking fields
      description: subscription.description,
      concept: subscription.concept,
      reference_code: subscription.reference_code,
      category: subscription.category,
      tags: subscription.tags,
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

// Get subscription by internal ID (primary method - more secure)
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
      success: true,
      subscription: {
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
        billing_interval: subscription.billing_interval,
        interval_multiplier: subscription.interval_multiplier,
        next_billing_date: subscription.next_billing_date,
        billing_status: subscription.billing_status,
        metadata: subscription.metadata ? JSON.parse(subscription.metadata) : null,
        // Enhanced tracking fields
        description: subscription.description,
        concept: subscription.concept,
        reference_code: subscription.reference_code,
        category: subscription.category,
        tags: subscription.tags,
        created_at: subscription.created_at,
        updated_at: subscription.updated_at
      }
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

    // Cancel in payment provider
    try {
      const adapter = await getPaymentAdapter(subscription.provider_id);

      // Check if provider supports subscriptions and this is not a local subscription
      if (adapter.getCapabilities().supports_subscriptions &&
          subscription.provider_subscription_id &&
          !subscription.provider_subscription_id.startsWith('sub_local_')) {

        console.log('🔗 Canceling subscription with provider:', subscription.provider_subscription_id);

        await adapter.cancelSubscription(subscription.provider_subscription_id, {
          at_period_end: validatedData.cancel_at_period_end
        });

        console.log('✅ Provider subscription canceled successfully');
      } else {
        console.log('⚠️ Local subscription or provider does not support cancellation - updating database only');
      }
    } catch (providerError) {
      console.error('❌ Provider cancellation failed:', providerError);
      console.log('⚠️ Continuing with local cancellation');
    }

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

// Get subscription by provider ID (for integration purposes)
subscriptions.get('/by-provider/:provider_id/:provider_subscription_id', optionalAuthMiddleware, async (c) => {
  try {
    const { provider_id, provider_subscription_id } = c.req.param();
    const userContext = getUserContext(c);

    console.log('🔍 Subscription lookup by provider ID:', {
      provider_id,
      provider_subscription_id,
      user_id: userContext.userId
    });

    const subscriptionRepo = await getSubscriptionRepository();

    // Find subscription by provider details
    const subscription = await subscriptionRepo.findByProviderSubscriptionId(provider_subscription_id, provider_id);

    if (!subscription) {
      throw new HTTPException(404, { message: 'Subscription not found' });
    }

    // Security check: ensure user has access to this subscription
    if (userContext.isAuthenticated && !userContext.isGuest) {
      // For authenticated users, check ownership
      if (subscription.user_id !== userContext.userId) {
        throw new HTTPException(403, { message: 'Access denied to this subscription' });
      }
    } else {
      // For guests, this endpoint is not available for security
      throw new HTTPException(401, { message: 'Authentication required for provider ID lookup' });
    }

    console.log('✅ Subscription found by provider ID:', {
      internal_id: subscription.id,
      provider_subscription_id: subscription.provider_subscription_id,
      status: subscription.status
    });

    return c.json({
      success: true,
      subscription: {
        id: subscription.id, // Return internal ID
        user_id: subscription.user_id,
        customer_id: subscription.customer_id,
        provider_id: subscription.provider_id,
        provider_subscription_id: subscription.provider_subscription_id,
        status: subscription.status,
        current_period_start: subscription.current_period_start,
        current_period_end: subscription.current_period_end,
        cancel_at_period_end: subscription.cancel_at_period_end,
        trial_end: subscription.trial_end,
        price_cents: subscription.price_cents,
        currency: subscription.currency,
        billing_interval: subscription.billing_interval,
        interval_multiplier: subscription.interval_multiplier,
        next_billing_date: subscription.next_billing_date,
        billing_status: subscription.billing_status,
        metadata: subscription.metadata ? JSON.parse(subscription.metadata) : null,
        created_at: subscription.created_at,
        updated_at: subscription.updated_at
      }
    });

  } catch (error) {
    console.error('❌ Subscription lookup by provider ID failed:', error);

    if (error instanceof HTTPException) {
      throw error;
    }

    throw new HTTPException(500, { message: 'Failed to lookup subscription by provider ID' });
  }
});

// Get subscription by internal ID and provider verification (double security)
subscriptions.get('/secure/:id/:provider_subscription_id', optionalAuthMiddleware, async (c) => {
  try {
    const { id, provider_subscription_id } = c.req.param();
    const userContext = getUserContext(c);

    console.log('🔒 Secure subscription lookup:', {
      internal_id: id,
      provider_subscription_id,
      user_id: userContext.userId
    });

    const subscriptionRepo = await getSubscriptionRepository();

    // Find by internal ID first
    const subscription = await subscriptionRepo.findById(id);

    if (!subscription) {
      throw new HTTPException(404, { message: 'Subscription not found' });
    }

    // Verify provider subscription ID matches (double security)
    if (subscription.provider_subscription_id !== provider_subscription_id) {
      console.log('❌ Provider subscription ID mismatch:', {
        expected: subscription.provider_subscription_id,
        provided: provider_subscription_id
      });
      throw new HTTPException(403, { message: 'Subscription verification failed' });
    }

    // Security check: ensure user has access
    if (userContext.isAuthenticated && !userContext.isGuest) {
      if (subscription.user_id !== userContext.userId) {
        throw new HTTPException(403, { message: 'Access denied to this subscription' });
      }
    } else {
      throw new HTTPException(401, { message: 'Authentication required for secure lookup' });
    }

    console.log('✅ Secure subscription verified:', {
      internal_id: subscription.id,
      provider_subscription_id: subscription.provider_subscription_id,
      status: subscription.status
    });

    return c.json({
      success: true,
      verified: true,
      subscription: {
        id: subscription.id,
        user_id: subscription.user_id,
        customer_id: subscription.customer_id,
        provider_id: subscription.provider_id,
        provider_subscription_id: subscription.provider_subscription_id,
        status: subscription.status,
        current_period_start: subscription.current_period_start,
        current_period_end: subscription.current_period_end,
        cancel_at_period_end: subscription.cancel_at_period_end,
        trial_end: subscription.trial_end,
        price_cents: subscription.price_cents,
        currency: subscription.currency,
        billing_interval: subscription.billing_interval,
        interval_multiplier: subscription.interval_multiplier,
        next_billing_date: subscription.next_billing_date,
        billing_status: subscription.billing_status,
        metadata: subscription.metadata ? JSON.parse(subscription.metadata) : null,
        created_at: subscription.created_at,
        updated_at: subscription.updated_at
      }
    });

  } catch (error) {
    console.error('❌ Secure subscription lookup failed:', error);

    if (error instanceof HTTPException) {
      throw error;
    }

    throw new HTTPException(500, { message: 'Failed to perform secure subscription lookup' });
  }
});

export default subscriptions;
