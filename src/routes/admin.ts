// Admin Routes - Secure payment management for administrators
import { Hono } from 'hono';
import { HTTPException } from 'hono/http-exception';
import { requireAdmin } from '../lib/auth/auth-middleware.js';
import { authService } from '../lib/auth/auth-service.js';
import { getPaymentRepository } from '../lib/database/repositories/index.js';
import { z } from 'zod';

const admin = new Hono();

// Apply admin middleware to all routes
admin.use('*', requireAdmin());

// Admin dashboard stats
admin.get('/stats', async (c) => {
  try {
    const user = c.get('user');
    console.log(`📊 Admin stats requested by: ${user?.id} (${user?.userType})`);

    const paymentRepo = await getPaymentRepository();
    
    // Get payment statistics
    const [
      totalPayments,
      completedPayments,
      failedPayments,
      pendingPayments,
      totalRevenue
    ] = await Promise.all([
      paymentRepo.countByStatus(),
      paymentRepo.countByStatus('completed'),
      paymentRepo.countByStatus('failed'),
      paymentRepo.countByStatus('pending'),
      paymentRepo.getTotalRevenue()
    ]);

    // Get recent payments
    const recentPayments = await paymentRepo.findRecent(10);

    // Get provider statistics
    const providerStats = await paymentRepo.getProviderStats();

    // Get cache statistics
    const cacheStats = authService.getCacheStats();

    return c.json({
      success: true,
      stats: {
        payments: {
          total: totalPayments,
          completed: completedPayments,
          failed: failedPayments,
          pending: pendingPayments
        },
        revenue: {
          total: totalRevenue,
          currency: 'USD' // TODO: Support multiple currencies
        },
        providers: providerStats,
        cache: cacheStats,
        recent_payments: recentPayments.map(p => ({
          id: p.id,
          amount_cents: p.amount_cents,
          currency: p.currency,
          status: p.status,
          provider_id: p.provider_id,
          created_at: p.created_at,
          is_guest_payment: p.is_guest_payment,
          guest_email: p.guest_email
        }))
      },
      timestamp: new Date().toISOString()
    });

  } catch (error) {
    console.error('Admin stats error:', error);
    throw new HTTPException(500, {
      message: 'Failed to retrieve admin statistics'
    });
  }
});

// Get all payments with pagination and filters
admin.get('/payments', async (c) => {
  try {
    const user = c.get('user');
    console.log(`💳 Admin payments list requested by: ${user?.id}`);

    // Parse query parameters
    const page = parseInt(c.req.query('page') || '1');
    const limit = Math.min(parseInt(c.req.query('limit') || '20'), 100); // Max 100
    const status = c.req.query('status');
    const provider = c.req.query('provider');
    const search = c.req.query('search'); // Email or payment ID search

    const paymentRepo = await getPaymentRepository();
    
    const filters = {
      status: status || undefined,
      provider_id: provider || undefined,
      search: search || undefined
    };

    const { payments, total } = await paymentRepo.findWithFilters(filters, {
      page,
      limit
    });

    return c.json({
      success: true,
      data: {
        payments: payments.map(p => ({
          id: p.id,
          order_id: p.order_id,
          user_id: p.user_id,
          provider_id: p.provider_id,
          provider_payment_id: p.provider_payment_id,
          amount_cents: p.amount_cents,
          currency: p.currency,
          status: p.status,
          description: p.description,
          is_guest_payment: p.is_guest_payment,
          guest_email: p.guest_email,
          created_at: p.created_at,
          updated_at: p.updated_at,
          completed_at: p.completed_at
        })),
        pagination: {
          page,
          limit,
          total,
          pages: Math.ceil(total / limit)
        },
        filters
      },
      timestamp: new Date().toISOString()
    });

  } catch (error) {
    console.error('Admin payments list error:', error);
    throw new HTTPException(500, {
      message: 'Failed to retrieve payments'
    });
  }
});

// Get specific payment details
admin.get('/payments/:id', async (c) => {
  try {
    const user = c.get('user');
    const paymentId = c.req.param('id');
    
    console.log(`🔍 Admin payment details requested by: ${user?.id} for payment: ${paymentId}`);

    const paymentRepo = await getPaymentRepository();
    const payment = await paymentRepo.findById(paymentId);

    if (!payment) {
      throw new HTTPException(404, {
        message: 'Payment not found'
      });
    }

    return c.json({
      success: true,
      data: {
        payment: {
          ...payment,
          // Include sensitive data for admin
          client_secret: payment.client_secret,
          metadata: payment.metadata,
          guest_data: payment.guest_data
        }
      },
      timestamp: new Date().toISOString()
    });

  } catch (error) {
    if (error instanceof HTTPException) {
      throw error;
    }
    console.error('Admin payment details error:', error);
    throw new HTTPException(500, {
      message: 'Failed to retrieve payment details'
    });
  }
});

// Update payment status (admin operation)
const updatePaymentSchema = z.object({
  status: z.enum(['pending', 'completed', 'failed', 'canceled']),
  admin_note: z.string().optional()
});

admin.patch('/payments/:id', async (c) => {
  try {
    const user = c.get('user');
    const paymentId = c.req.param('id');
    
    console.log(`✏️ Admin payment update requested by: ${user?.id} for payment: ${paymentId}`);

    const body = await c.req.json();
    const validatedData = updatePaymentSchema.parse(body);

    const paymentRepo = await getPaymentRepository();
    
    // Check if payment exists
    const existingPayment = await paymentRepo.findById(paymentId);
    if (!existingPayment) {
      throw new HTTPException(404, {
        message: 'Payment not found'
      });
    }

    // Update payment
    const updatedPayment = await paymentRepo.update(paymentId, {
      status: validatedData.status,
      updated_at: new Date().toISOString(),
      // Add admin note to metadata if provided
      metadata: validatedData.admin_note ? JSON.stringify({
        ...JSON.parse(existingPayment.metadata || '{}'),
        admin_note: validatedData.admin_note,
        admin_updated_by: user?.id,
        admin_updated_at: new Date().toISOString()
      }) : existingPayment.metadata
    });

    console.log(`✅ Payment ${paymentId} updated by admin ${user?.id}: ${existingPayment.status} → ${validatedData.status}`);

    return c.json({
      success: true,
      data: {
        payment: updatedPayment
      },
      message: 'Payment updated successfully',
      timestamp: new Date().toISOString()
    });

  } catch (error) {
    if (error instanceof z.ZodError) {
      throw new HTTPException(400, {
        message: 'Invalid request data',
        cause: error.errors
      });
    }
    if (error instanceof HTTPException) {
      throw error;
    }
    console.error('Admin payment update error:', error);
    throw new HTTPException(500, {
      message: 'Failed to update payment'
    });
  }
});

// Cache management endpoints
admin.get('/cache/stats', async (c) => {
  try {
    const user = c.get('user');
    console.log(`🗄️ Cache stats requested by admin: ${user?.id}`);

    const stats = authService.getCacheStats();
    const audit = authService.auditSecurity();

    return c.json({
      success: true,
      data: {
        cache_stats: stats,
        security_audit: audit
      },
      timestamp: new Date().toISOString()
    });

  } catch (error) {
    console.error('Cache stats error:', error);
    throw new HTTPException(500, {
      message: 'Failed to retrieve cache statistics'
    });
  }
});

admin.post('/cache/clear', async (c) => {
  try {
    const user = c.get('user');
    console.log(`🧹 Cache clear requested by admin: ${user?.id}`);

    authService.clearCache();

    return c.json({
      success: true,
      message: 'Cache cleared successfully',
      cleared_by: user?.id,
      timestamp: new Date().toISOString()
    });

  } catch (error) {
    console.error('Cache clear error:', error);
    throw new HTTPException(500, {
      message: 'Failed to clear cache'
    });
  }
});

// System health check (admin only)
admin.get('/health', async (c) => {
  try {
    const user = c.get('user');
    console.log(`🏥 System health check by admin: ${user?.id}`);

    const paymentRepo = await getPaymentRepository();
    
    // Check database connectivity
    const dbHealth = await paymentRepo.healthCheck();
    
    // Check cache health
    const cacheStats = authService.getCacheStats();
    const cacheHealth = cacheStats.healthCheck;

    // Check auth service
    const authHealth = {
      flowless_api_configured: !!process.env.FLOWLESS_API_URL,
      bridge_secret_configured: !!process.env.BRIDGE_VALIDATION_SECRET
    };

    const overallHealth = dbHealth && cacheHealth && authHealth.flowless_api_configured;

    return c.json({
      success: true,
      data: {
        overall_health: overallHealth,
        components: {
          database: dbHealth,
          cache: cacheHealth,
          auth_service: authHealth
        },
        cache_stats: cacheStats,
        checked_by: user?.id
      },
      timestamp: new Date().toISOString()
    });

  } catch (error) {
    console.error('Admin health check error:', error);
    throw new HTTPException(500, {
      message: 'Health check failed'
    });
  }
});

// Test admin notification system (admin only)
admin.post('/test-admin-notification', async (c) => {
  try {
    const user = c.get('user');
    console.log(`🧪 Testing admin notification system by admin: ${user?.id}`);

    const { adminNotificationService } = await import('@/lib/email/admin-notification-service');

    const result = await adminNotificationService.testAdminNotification();

    return c.json({
      success: result.success,
      message: result.message,
      recipients: result.recipients,
      tested_by: user?.id,
      timestamp: new Date().toISOString()
    });

  } catch (error) {
    console.error('[Admin] Error testing admin notification:', error);
    return c.json({
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error'
    }, 500);
  }
});

// Check admin notification configuration (admin only)
admin.get('/admin-notification-config', async (c) => {
  try {
    const user = c.get('user');
    console.log(`🔍 Checking admin notification config by admin: ${user?.id}`);

    const config = {
      enabled: process.env.ADMIN_EMAIL_ENABLED === 'true',
      recipients: process.env.ADMIN_RECEIPT_EMAIL || 'Not configured',
      template: process.env.ADMIN_EMAIL_TEMPLATE || 'admin_transaction_notification',
      subject_prefix: process.env.ADMIN_EMAIL_SUBJECT_PREFIX || '[TRANSACTION]',
      dashboard_url: process.env.ADMIN_DASHBOARD_URL || 'Not configured',
      language: process.env.GLOBAL_LANG || process.env.DEFAULT_LANGUAGE || 'en'
    };

    return c.json({
      success: true,
      config,
      checked_by: user?.id,
      timestamp: new Date().toISOString()
    });

  } catch (error) {
    console.error('[Admin] Error checking admin notification config:', error);
    return c.json({
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error'
    }, 500);
  }
});

export default admin;
