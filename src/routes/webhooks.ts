import { Hono } from 'hono';
import { z } from 'zod';
import { nanoid } from 'nanoid';
import { PaymentProviderFactory } from '@/lib/providers/factory';
import { getWebhookRepository } from '@/lib/database/repositories/webhooks';
import { webhookProcessor } from '@/lib/webhooks/event-processor';
import { config } from '@/config/environment';

const webhooks = new Hono();

// Webhook signature validation middleware
async function validateWebhookSignature(providerId: string, payload: string, signature: string): Promise<boolean> {
  try {
    const adapter = PaymentProviderFactory.getAdapter(providerId);
    return await adapter.verifyWebhook(payload, signature);
  } catch (error) {
    console.error(`❌ Webhook signature validation failed for ${providerId}:`, error);
    return false;
  }
}

// Stripe webhook endpoint
webhooks.post('/stripe', async (c) => {
  try {
    const signature = c.req.header('stripe-signature');
    if (!signature) {
      console.error('❌ Missing Stripe signature header');
      return c.json({ error: 'Missing signature' }, 400);
    }

    const payload = await c.req.text();
    
    // Validate webhook signature
    const isValid = await validateWebhookSignature('stripe', payload, signature);
    if (!isValid) {
      console.error('❌ Invalid Stripe webhook signature');
      return c.json({ error: 'Invalid signature' }, 401);
    }

    // Parse webhook event
    let event;
    try {
      event = JSON.parse(payload);
    } catch (error) {
      console.error('❌ Invalid JSON payload:', error);
      return c.json({ error: 'Invalid JSON' }, 400);
    }

    console.log(`🔔 Received Stripe webhook: ${event.type} (${event.id})`);

    // Store webhook in database
    const webhookRepo = await getWebhookRepository();
    const webhookId = nanoid();
    
    await webhookRepo.createWebhook({
      id: webhookId,
      provider_id: 'stripe',
      event_type: event.type,
      payload: payload,
      processed: 0
    });

    // Process webhook asynchronously
    setImmediate(async () => {
      try {
        await webhookProcessor.processEvent(webhookId, {
          id: event.id,
          type: event.type,
          data: event.data,
          created: event.created
        });
      } catch (error) {
        console.error(`❌ Failed to process Stripe webhook ${webhookId}:`, error);
      }
    });

    return c.json({ received: true });
    
  } catch (error) {
    console.error('❌ Stripe webhook error:', error);
    return c.json({ error: 'Internal server error' }, 500);
  }
});

// PayPal webhook endpoint
webhooks.post('/paypal', async (c) => {
  try {
    const signature = c.req.header('paypal-transmission-sig');
    if (!signature) {
      console.error('❌ Missing PayPal signature header');
      return c.json({ error: 'Missing signature' }, 400);
    }

    const payload = await c.req.text();
    
    // Validate webhook signature
    const isValid = await validateWebhookSignature('paypal', payload, signature);
    if (!isValid) {
      console.error('❌ Invalid PayPal webhook signature');
      return c.json({ error: 'Invalid signature' }, 401);
    }

    // Parse webhook event
    let event;
    try {
      event = JSON.parse(payload);
    } catch (error) {
      console.error('❌ Invalid JSON payload:', error);
      return c.json({ error: 'Invalid JSON' }, 400);
    }

    console.log(`🔔 Received PayPal webhook: ${event.event_type} (${event.id})`);

    // Store webhook in database
    const webhookRepo = await getWebhookRepository();
    const webhookId = nanoid();
    
    await webhookRepo.createWebhook({
      id: webhookId,
      provider_id: 'paypal',
      event_type: event.event_type,
      payload: payload,
      processed: 0
    });

    // Process webhook asynchronously
    setImmediate(async () => {
      try {
        await webhookProcessor.processEvent(webhookId, {
          id: event.id,
          type: event.event_type,
          data: { resource: event.resource },
          created: Date.now() / 1000 // PayPal doesn't provide created timestamp
        });
      } catch (error) {
        console.error(`❌ Failed to process PayPal webhook ${webhookId}:`, error);
      }
    });

    return c.json({ received: true });
    
  } catch (error) {
    console.error('❌ PayPal webhook error:', error);
    return c.json({ error: 'Internal server error' }, 500);
  }
});

// Generic webhook endpoint for other providers
webhooks.post('/:providerId', async (c) => {
  try {
    const providerId = c.req.param('providerId');
    
    // Validate provider exists
    const availableProviders = PaymentProviderFactory.getAvailableProviders();
    if (!availableProviders.includes(providerId)) {
      return c.json({ error: 'Provider not supported' }, 404);
    }

    const payload = await c.req.text();
    
    // For generic providers, we might not have signature validation
    console.log(`🔔 Received ${providerId} webhook`);

    // Store webhook in database
    const webhookRepo = await getWebhookRepository();
    const webhookId = nanoid();
    
    let event;
    try {
      event = JSON.parse(payload);
    } catch (error) {
      console.error('❌ Invalid JSON payload:', error);
      return c.json({ error: 'Invalid JSON' }, 400);
    }
    
    await webhookRepo.createWebhook({
      id: webhookId,
      provider_id: providerId,
      event_type: event.type || event.event_type || 'unknown',
      payload: payload,
      processed: 0
    });

    return c.json({ received: true });
    
  } catch (error) {
    console.error(`❌ Generic webhook error:`, error);
    return c.json({ error: 'Internal server error' }, 500);
  }
});

// Webhook management endpoints

// Get webhook stats
webhooks.get('/stats', async (c) => {
  try {
    const providerId = c.req.query('provider_id');
    const webhookRepo = await getWebhookRepository();
    
    const [webhookStats, eventStats] = await Promise.all([
      webhookRepo.getWebhookStats(providerId),
      webhookRepo.getEventStats()
    ]);

    return c.json({
      webhooks: webhookStats,
      events: eventStats
    });
    
  } catch (error) {
    console.error('❌ Failed to get webhook stats:', error);
    return c.json({ error: 'Internal server error' }, 500);
  }
});

// Get webhooks by provider
webhooks.get('/provider/:providerId', async (c) => {
  try {
    const providerId = c.req.param('providerId');
    const limit = parseInt(c.req.query('limit') || '50');
    
    const webhookRepo = await getWebhookRepository();
    const webhooks = await webhookRepo.findWebhooksByProvider(providerId, limit);

    return c.json({
      webhooks: webhooks.map(webhook => ({
        id: webhook.id,
        event_type: webhook.event_type,
        processed: webhook.processed === 1,
        created_at: webhook.created_at,
        processed_at: webhook.processed_at
      }))
    });
    
  } catch (error) {
    console.error('❌ Failed to get webhooks:', error);
    return c.json({ error: 'Internal server error' }, 500);
  }
});

// Process unprocessed webhooks manually
webhooks.post('/process', async (c) => {
  try {
    console.log('🔄 Manually processing unprocessed webhooks...');
    await webhookProcessor.processUnprocessedEvents();
    
    return c.json({ message: 'Processing completed' });
    
  } catch (error) {
    console.error('❌ Failed to process webhooks:', error);
    return c.json({ error: 'Internal server error' }, 500);
  }
});

// Cleanup old webhooks
webhooks.delete('/cleanup', async (c) => {
  try {
    const days = parseInt(c.req.query('days') || '30');
    const webhookRepo = await getWebhookRepository();
    
    const [deletedWebhooks, deletedEvents] = await Promise.all([
      webhookRepo.cleanupWebhooks(days),
      webhookRepo.cleanupEvents(days * 3) // Keep events longer
    ]);

    return c.json({
      deleted_webhooks: deletedWebhooks,
      deleted_events: deletedEvents
    });
    
  } catch (error) {
    console.error('❌ Failed to cleanup webhooks:', error);
    return c.json({ error: 'Internal server error' }, 500);
  }
});

export default webhooks;
