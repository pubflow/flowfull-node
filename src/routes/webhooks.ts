import { Hono } from 'hono';
import { z } from 'zod';
import { nanoid } from 'nanoid';
import { PaymentProviderFactory } from '@/lib/providers/factory';
import { getWebhookRepository } from '@/lib/database/repositories/webhooks';
import { webhookProcessor } from '@/lib/webhooks/event-processor';
import { config } from '@/config/environment';
import { Logger } from '@/lib/utils/logger';

const webhooks = new Hono();

// Webhook signature validation middleware
async function validateWebhookSignature(providerId: string, payload: string, signature: string): Promise<{ isValid: boolean; event?: any }> {
  try {
    const adapter = PaymentProviderFactory.getAdapter(providerId);

    // verifyWebhook returns a WebhookEvent object, not a boolean
    const webhookEvent = await adapter.verifyWebhook(payload, signature);

    return {
      isValid: true,
      event: webhookEvent
    };
  } catch (error) {
    Logger.error(`❌ Webhook signature validation failed for ${providerId}:`, error);

    // Log specific error details for debugging
    if (error instanceof Error) {
      Logger.error(`   Error message: ${error.message}`);
      Logger.error(`   Error type: ${error.constructor.name}`);
    }

    return {
      isValid: false
    };
  }
}

// Stripe webhook endpoint
webhooks.post('/stripe', async (c) => {
  try {
    const signature = c.req.header('stripe-signature');
    if (!signature) {
      Logger.error('❌ Missing Stripe signature header');
      return c.json({ error: 'Missing signature' }, 400);
    }

    const payload = await c.req.text();

    // Validate webhook signature and get parsed event
    const validationResult = await validateWebhookSignature('stripe', payload, signature);
    if (!validationResult.isValid) {
      Logger.error('❌ Invalid Stripe webhook signature');
      return c.json({ error: 'Invalid signature' }, 401);
    }

    // Use the event from signature validation (already parsed and verified)
    const event = validationResult.event;
    if (!event) {
      Logger.error('❌ No event data received from webhook validation');
      return c.json({ error: 'Invalid event data' }, 400);
    }

    Logger.webhook.received('Stripe', event.type, event.id);

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

    // Process webhook asynchronously with better error handling
    process.nextTick(async () => {
      try {
        await webhookProcessor.processEvent(webhookId, {
          id: event.id,
          type: event.type,
          data: event.data,
          created: event.created
        });
        Logger.webhook.processing.completed('Stripe', webhookId);
      } catch (error) {
        Logger.webhook.processing.failed('Stripe', webhookId, error);

        // Mark webhook as processed even if failed to avoid infinite retry
        try {
          await webhookRepo.markWebhookAsProcessed(webhookId);
        } catch (markError) {
          Logger.error(`❌ Failed to mark webhook ${webhookId} as processed:`, markError);
        }
      }
    });

    return c.json({ received: true });

  } catch (error) {
    Logger.error('❌ Stripe webhook error:', error);

    // Log additional context for debugging
    if (error instanceof Error) {
      Logger.error(`   Error details: ${error.message}`);
      Logger.debug(`   Stack trace: ${error.stack}`);
    }

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

    // Validate webhook signature and get parsed event
    const validationResult = await validateWebhookSignature('paypal', payload, signature);
    if (!validationResult.isValid) {
      console.error('❌ Invalid PayPal webhook signature');
      return c.json({ error: 'Invalid signature' }, 401);
    }

    // Use the event from signature validation or parse manually for PayPal
    let event;
    if (validationResult.event) {
      event = validationResult.event;
    } else {
      try {
        event = JSON.parse(payload);
      } catch (error) {
        console.error('❌ Invalid JSON payload:', error);
        return c.json({ error: 'Invalid JSON' }, 400);
      }
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

    // Process webhook asynchronously with better error handling
    process.nextTick(async () => {
      try {
        await webhookProcessor.processEvent(webhookId, {
          id: event.id,
          type: event.event_type,
          data: { resource: event.resource },
          created: Date.now() / 1000 // PayPal doesn't provide created timestamp
        });
        console.log(`✅ PayPal webhook ${webhookId} processed successfully`);
      } catch (error) {
        console.error(`❌ Failed to process PayPal webhook ${webhookId}:`, error);

        // Mark webhook as processed even if failed to avoid infinite retry
        try {
          await webhookRepo.markWebhookAsProcessed(webhookId);
        } catch (markError) {
          console.error(`❌ Failed to mark webhook ${webhookId} as processed:`, markError);
        }
      }
    });

    return c.json({ received: true });

  } catch (error) {
    console.error('❌ PayPal webhook error:', error);

    // Log additional context for debugging
    if (error instanceof Error) {
      console.error(`   Error details: ${error.message}`);
      console.error(`   Stack trace: ${error.stack}`);
    }

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

// Webhook diagnostics endpoint
webhooks.get('/diagnostics', async (c) => {
  try {
    const diagnostics = {
      timestamp: new Date().toISOString(),
      environment: process.env.NODE_ENV || 'development',
      providers: {},
      configuration: {
        enabled_providers: config.ENABLED_PROVIDERS,
        default_provider: config.DEFAULT_PAYMENT_PROVIDER,
        base_url: config.BASE_URL
      },
      endpoints: [
        `${config.BASE_URL}/bridge-payment/webhooks/stripe`,
        `${config.BASE_URL}/bridge-payment/webhooks/paypal`,
        `${config.BASE_URL}/bridge-payment/webhooks/stats`,
        `${config.BASE_URL}/bridge-payment/webhooks/process`
      ]
    };

    // Check each enabled provider
    for (const providerId of config.ENABLED_PROVIDERS) {
      try {
        const adapter = PaymentProviderFactory.getAdapter(providerId);
        const capabilities = adapter.getCapabilities();

        diagnostics.providers[providerId] = {
          status: 'configured',
          supports_webhooks: capabilities.supports_webhooks,
          webhook_secret_configured: !!(adapter as any).config?.webhook_secret
        };

        if (providerId === 'stripe') {
          diagnostics.providers[providerId].webhook_secret_preview =
            (adapter as any).config?.webhook_secret ?
            `${(adapter as any).config.webhook_secret.substring(0, 10)}...` :
            'NOT SET';
        }

      } catch (error) {
        diagnostics.providers[providerId] = {
          status: 'error',
          error: error instanceof Error ? error.message : 'Unknown error'
        };
      }
    }

    return c.json(diagnostics);

  } catch (error) {
    console.error('❌ Failed to generate diagnostics:', error);
    return c.json({ error: 'Internal server error' }, 500);
  }
});

// Test webhook signature validation endpoint
webhooks.post('/test-signature', async (c) => {
  try {
    const { provider_id, payload, signature } = await c.req.json();

    if (!provider_id || !payload || !signature) {
      return c.json({
        error: 'Missing required fields: provider_id, payload, signature'
      }, 400);
    }

    const validationResult = await validateWebhookSignature(provider_id, payload, signature);

    return c.json({
      provider_id,
      is_valid: validationResult.isValid,
      event_data: validationResult.event || null,
      timestamp: new Date().toISOString()
    });

  } catch (error) {
    Logger.error('❌ Failed to test signature:', error);
    return c.json({ error: 'Internal server error' }, 500);
  }
});

// Logging control endpoint
webhooks.get('/logging', async (c) => {
  try {
    return c.json(Logger.getStatus());
  } catch (error) {
    Logger.error('❌ Failed to get logging status:', error);
    return c.json({ error: 'Internal server error' }, 500);
  }
});

webhooks.post('/logging/toggle', async (c) => {
  try {
    // Note: This only affects the current session, not the environment file
    const currentMode = config.LOG_MODE;

    // Toggle the mode (this is runtime only)
    (config as any).LOG_MODE = !currentMode;

    return c.json({
      message: 'Logging mode toggled (runtime only)',
      previous_mode: currentMode,
      current_mode: config.LOG_MODE,
      note: 'This change only affects the current session. To persist, update LOG_MODE in your .env file.'
    });

  } catch (error) {
    Logger.error('❌ Failed to toggle logging mode:', error);
    return c.json({ error: 'Internal server error' }, 500);
  }
});

export default webhooks;
