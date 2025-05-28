import { Hono } from 'hono';
import { HTTPException } from 'hono/http-exception';
import { handleRenewalWebhook } from '@/lib/renewal-system';

const renewalWebhooks = new Hono();

/**
 * Handle Stripe renewal webhooks
 */
renewalWebhooks.post('/stripe', async (c) => {
  try {
    const body = await c.req.json();
    const eventType = body.type;
    
    console.log(`🔔 Received Stripe renewal webhook: ${eventType}`);

    // Verify webhook signature (TODO: Implement signature verification)
    // const signature = c.req.header('stripe-signature');
    // if (!verifyStripeSignature(body, signature)) {
    //   throw new HTTPException(401, { message: 'Invalid webhook signature' });
    // }

    // Handle renewal-related events
    const renewalEvents = [
      'invoice.payment_succeeded',
      'invoice.payment_failed',
      'customer.subscription.updated',
      'customer.subscription.deleted'
    ];

    if (renewalEvents.includes(eventType)) {
      await handleRenewalWebhook('stripe', eventType, body);
      console.log(`✅ Processed Stripe renewal webhook: ${eventType}`);
    } else {
      console.log(`ℹ️ Ignoring non-renewal Stripe webhook: ${eventType}`);
    }

    return c.json({ received: true });

  } catch (error) {
    console.error('❌ Failed to process Stripe renewal webhook:', error);

    if (error instanceof HTTPException) {
      throw error;
    }

    throw new HTTPException(500, {
      message: 'Failed to process webhook',
      cause: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

/**
 * Handle PayPal renewal webhooks
 */
renewalWebhooks.post('/paypal', async (c) => {
  try {
    const body = await c.req.json();
    const eventType = body.event_type;
    
    console.log(`🔔 Received PayPal renewal webhook: ${eventType}`);

    // Verify webhook signature (TODO: Implement signature verification)
    // const signature = c.req.header('paypal-transmission-sig');
    // if (!verifyPayPalSignature(body, signature)) {
    //   throw new HTTPException(401, { message: 'Invalid webhook signature' });
    // }

    // Handle renewal-related events
    const renewalEvents = [
      'BILLING.SUBSCRIPTION.PAYMENT.COMPLETED',
      'BILLING.SUBSCRIPTION.PAYMENT.FAILED',
      'BILLING.SUBSCRIPTION.CANCELLED',
      'BILLING.SUBSCRIPTION.SUSPENDED'
    ];

    if (renewalEvents.includes(eventType)) {
      await handleRenewalWebhook('paypal', eventType, body);
      console.log(`✅ Processed PayPal renewal webhook: ${eventType}`);
    } else {
      console.log(`ℹ️ Ignoring non-renewal PayPal webhook: ${eventType}`);
    }

    return c.json({ received: true });

  } catch (error) {
    console.error('❌ Failed to process PayPal renewal webhook:', error);

    if (error instanceof HTTPException) {
      throw error;
    }

    throw new HTTPException(500, {
      message: 'Failed to process webhook',
      cause: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

/**
 * Handle generic renewal webhooks (for testing or custom providers)
 */
renewalWebhooks.post('/generic', async (c) => {
  try {
    const body = await c.req.json();
    const provider = c.req.query('provider') || 'generic';
    const eventType = body.event_type || body.type || 'unknown';
    
    console.log(`🔔 Received ${provider} renewal webhook: ${eventType}`);

    await handleRenewalWebhook(provider, eventType, body);
    console.log(`✅ Processed ${provider} renewal webhook: ${eventType}`);

    return c.json({ received: true });

  } catch (error) {
    console.error('❌ Failed to process generic renewal webhook:', error);

    if (error instanceof HTTPException) {
      throw error;
    }

    throw new HTTPException(500, {
      message: 'Failed to process webhook',
      cause: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

/**
 * Test webhook endpoint for development
 */
renewalWebhooks.post('/test', async (c) => {
  try {
    const body = await c.req.json();
    
    console.log('🧪 Test renewal webhook received:', body);

    // Simulate different webhook events for testing
    const testEvents = {
      'test.renewal.success': {
        type: 'subscription.renewal.succeeded',
        subscription_id: 'test_sub_123',
        customer_id: 'test_cus_123',
        amount: 2999,
        currency: 'usd'
      },
      'test.renewal.failure': {
        type: 'subscription.renewal.failed',
        subscription_id: 'test_sub_123',
        customer_id: 'test_cus_123',
        error: 'Payment method declined'
      }
    };

    const eventType = body.event_type || 'test.renewal.success';
    const testData = testEvents[eventType as keyof typeof testEvents] || testEvents['test.renewal.success'];

    await handleRenewalWebhook('test', eventType, { ...body, ...testData });
    
    return c.json({ 
      received: true, 
      test: true,
      event_type: eventType,
      processed_data: testData
    });

  } catch (error) {
    console.error('❌ Failed to process test renewal webhook:', error);

    throw new HTTPException(500, {
      message: 'Failed to process test webhook',
      cause: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

export default renewalWebhooks;
