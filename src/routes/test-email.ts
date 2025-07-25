/**
 * Test Email Routes for Bridge-Payments
 * Development endpoint to test email functionality
 */

import { Hono } from 'hono';
import { receiptService } from '@/lib/email/receipt-service';
import { templateService } from '@/lib/email/template-service';

const testEmailRoutes = new Hono();

/**
 * Test email configuration
 * GET /test-email/config
 */
testEmailRoutes.get('/config', async (c) => {
  try {
    const config = {
      zeptomailConfigured: !!process.env.ZEPTOMAIL_API_KEY,
      fromAddress: process.env.EMAIL_FROM_ADDRESS || 'Not configured',
      fromName: process.env.EMAIL_FROM_NAME || 'Not configured',
      organizationName: process.env.ORGANIZATION_NAME || 'Not configured',
      defaultLanguage: process.env.GLOBAL_LANG || process.env.DEFAULT_LANGUAGE || 'en',
      availableLanguages: templateService.getAvailableLanguages(),
      templateExists: {
        es: templateService.templateExists('transaction_receipt', 'es'),
        en: templateService.templateExists('transaction_receipt', 'en')
      }
    };

    return c.json({
      success: true,
      config
    });
  } catch (error) {
    console.error('[TestEmail] Error checking config:', error);
    return c.json({
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error'
    }, 500);
  }
});

/**
 * Send test receipt email
 * POST /test-email/receipt
 */
testEmailRoutes.post('/receipt', async (c) => {
  try {
    let body: any = {};

    // Try to parse JSON body, but handle empty body gracefully
    try {
      const contentType = c.req.header('content-type');
      if (contentType && contentType.includes('application/json')) {
        body = await c.req.json();
      }
    } catch (parseError) {
      console.log('[TestEmail] No JSON body provided, using defaults');
    }

    const {
      email = process.env.TEST_EMAIL || 'test@example.com',
      name = 'Test User',
      language = 'es'
    } = body;

    if (!email) {
      return c.json({
        success: false,
        error: 'Email address is required. Provide in JSON body or set TEST_EMAIL env var.'
      }, 400);
    }

    // Create test transaction data
    const testTransaction = {
      id: 'test_' + Date.now(),
      amount_cents: 2500, // $25.00
      currency: 'USD',
      status: 'succeeded',
      description: 'Test Transaction Receipt',
      concept: 'Test Payment',
      reference_code: 'TEST_' + Date.now(),
      category: 'test',
      provider_id: 'stripe',
      provider_payment_id: 'pi_test_' + Date.now(),
      customer_email: email,
      customer_name: name || 'Test User',
      created_at: new Date().toISOString(),
      metadata: language ? { language } : undefined
    };

    const result = await receiptService.sendTransactionReceipt(testTransaction);

    return c.json({
      success: result.success,
      message: result.message,
      transactionId: testTransaction.id
    });

  } catch (error) {
    console.error('[TestEmail] Error sending test receipt:', error);
    return c.json({
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error'
    }, 500);
  }
});

/**
 * Send test receipt email via GET (easier testing)
 * GET /test-email/send?email=test@example.com&name=Test&lang=es
 */
testEmailRoutes.get('/send', async (c) => {
  try {
    const email = c.req.query('email') || process.env.TEST_EMAIL || 'test@example.com';
    const name = c.req.query('name') || 'Test User';
    const language = c.req.query('lang') || c.req.query('language') || 'es';

    // Create test transaction data
    const testTransaction = {
      id: 'test_' + Date.now(),
      amount_cents: 2500, // $25.00
      currency: 'USD',
      status: 'succeeded',
      description: 'Test Transaction Receipt',
      concept: 'Test Payment',
      reference_code: 'TEST_' + Date.now(),
      category: 'test',
      provider_id: 'stripe',
      provider_payment_id: 'pi_test_' + Date.now(),
      customer_email: email,
      customer_name: name,
      created_at: new Date().toISOString(),
      metadata: { language }
    };

    const result = await receiptService.sendTransactionReceipt(testTransaction);

    return c.json({
      success: result.success,
      message: result.message,
      transactionId: testTransaction.id,
      email: email,
      name: name,
      language: language
    });

  } catch (error) {
    console.error('[TestEmail] Error sending test receipt via GET:', error);
    return c.json({
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error'
    }, 500);
  }
});

/**
 * Preview email template
 * GET /test-email/preview/:language?
 */
testEmailRoutes.get('/preview/:language?', async (c) => {
  try {
    const language = c.req.param('language') || 'en';
    
    // Sample variables for preview
    const sampleVariables = {
      customer_name: 'John Doe',
      customer_email: 'john.doe@example.com',
      amount: '25.00',
      currency: 'USD',
      concept: 'Sample Donation',
      reference_code: 'SAMPLE_001',
      transaction_id: 'pi_sample_123456789',
      transaction_date: new Date().toLocaleDateString(language === 'es' ? 'es-ES' : 'en-US'),
      transaction_time: new Date().toLocaleTimeString(language === 'es' ? 'es-ES' : 'en-US'),
      organization_name: process.env.ORGANIZATION_NAME || 'Sample Organization',
      contact_email: process.env.ORGANIZATION_EMAIL || 'info@example.com',
      contact_phone: process.env.ORGANIZATION_PHONE || '+1 (555) 123-4567',
      contact_address: process.env.ORGANIZATION_ADDRESS || '123 Main St, City, State 12345',
      privacy_url: (process.env.ORGANIZATION_WEBSITE || 'https://example.com') + '/privacy',
      terms_url: (process.env.ORGANIZATION_WEBSITE || 'https://example.com') + '/terms',
      contact_url: (process.env.ORGANIZATION_WEBSITE || 'https://example.com') + '/contact'
    };

    const template = templateService.getTemplate('transaction_receipt', sampleVariables, language);

    if (!template) {
      return c.json({
        success: false,
        error: `Template not found for language: ${language}`
      }, 404);
    }

    // Return HTML for preview
    return new Response(template.html, {
      headers: {
        'Content-Type': 'text/html; charset=utf-8'
      }
    });

  } catch (error) {
    console.error('[TestEmail] Error previewing template:', error);
    return c.json({
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error'
    }, 500);
  }
});

/**
 * Get template info
 * GET /test-email/template-info
 */
testEmailRoutes.get('/template-info', async (c) => {
  try {
    const languages = templateService.getAvailableLanguages();
    const templateInfo: Record<string, any> = {};

    for (const lang of languages) {
      templateInfo[lang] = {
        exists: templateService.templateExists('transaction_receipt', lang),
        path: templateService.getTemplatePath('transaction_receipt', lang)
      };
    }

    return c.json({
      success: true,
      languages,
      templates: templateInfo,
      defaultLanguage: process.env.GLOBAL_LANG || process.env.DEFAULT_LANGUAGE || 'en'
    });

  } catch (error) {
    console.error('[TestEmail] Error getting template info:', error);
    return c.json({
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error'
    }, 500);
  }
});

/**
 * Test admin notification
 * GET /test-email/admin-notification
 */
testEmailRoutes.get('/admin-notification', async (c) => {
  try {
    const { adminNotificationService } = await import('@/lib/email/admin-notification-service');

    const result = await adminNotificationService.testAdminNotification();

    // Check dashboard configuration for debugging
    const dashboardUrl = process.env.ADMIN_DASHBOARD_URL;
    const hasDashboard = dashboardUrl && dashboardUrl.trim() !== '' && dashboardUrl !== '#';

    return c.json({
      success: result.success,
      message: result.message,
      recipients: result.recipients,
      dashboard_configured: hasDashboard,
      dashboard_url: dashboardUrl || 'Not configured',
      timestamp: new Date().toISOString()
    });

  } catch (error) {
    console.error('[TestEmail] Error testing admin notification:', error);
    return c.json({
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error'
    }, 500);
  }
});

export default testEmailRoutes;
