/**
 * Admin Notification Service for Bridge-Payments
 * Sends email notifications to administrators for successful transactions
 * Supports multiple recipients and internationalization
 */

import { emailService } from './email-service';
import { templateService } from './template-service';

interface AdminNotificationData {
  // Transaction details
  transaction_id: string;
  amount_cents: number;
  currency: string;
  status: string;
  provider_id: string;
  provider_payment_id?: string;
  reference_code?: string;
  concept?: string;
  description?: string;
  
  // Customer information
  customer_email?: string;
  customer_name?: string;
  customer_phone?: string;
  user_type: 'registered' | 'guest';
  
  // Payment method details
  payment_method_type?: string;
  payment_method_last_four?: string;
  payment_method_brand?: string;
  
  // Metadata
  metadata?: Record<string, any>;
  created_at: string;
  
  // Additional context
  ip_address?: string;
  user_agent?: string;
}

interface AdminEmailRecipient {
  address: string;
  name?: string;
}

export class AdminNotificationService {
  private defaultLanguage: string = 'en';

  constructor() {
    // Initialize with environment language
    this.defaultLanguage = process.env.GLOBAL_LANG || process.env.DEFAULT_LANGUAGE || 'en';
  }

  /**
   * Check if admin notifications are enabled
   */
  private isAdminNotificationEnabled(): boolean {
    const enabled = process.env.ADMIN_EMAIL_ENABLED;
    return enabled === 'true' || enabled === '1';
  }

  /**
   * Get admin email recipients from environment variable
   */
  private getAdminRecipients(): AdminEmailRecipient[] {
    const adminEmails = process.env.ADMIN_RECEIPT_EMAIL;
    
    if (!adminEmails || adminEmails.trim() === '') {
      console.warn('[AdminNotificationService] ADMIN_RECEIPT_EMAIL not configured');
      return [];
    }

    // Split by comma and clean up emails
    const emails = adminEmails.split(',').map(email => email.trim()).filter(email => email.length > 0);
    
    // Validate email format
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    const validEmails = emails.filter(email => emailRegex.test(email));
    
    if (validEmails.length !== emails.length) {
      console.warn('[AdminNotificationService] Some admin emails are invalid:', emails.filter(email => !emailRegex.test(email)));
    }

    return validEmails.map(email => ({
      address: email,
      name: 'Administrator'
    }));
  }

  /**
   * Get subject prefix from environment
   */
  private getSubjectPrefix(): string {
    return process.env.ADMIN_EMAIL_SUBJECT_PREFIX || '[TRANSACTION]';
  }

  /**
   * Format amount for display
   */
  private formatAmount(amountCents: number, currency: string): string {
    const amount = amountCents / 100;
    const formatter = new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: currency.toUpperCase(),
      minimumFractionDigits: 2
    });
    return formatter.format(amount);
  }

  /**
   * Generate dashboard section HTML if URL is configured
   */
  private generateDashboardSection(): string {
    const dashboardUrl = process.env.ADMIN_DASHBOARD_URL;

    // If no dashboard URL is configured or it's just a placeholder, return empty
    if (!dashboardUrl || dashboardUrl.trim() === '' || dashboardUrl === '#') {
      return '';
    }

    // Get current language for button text
    const language = this.defaultLanguage;
    const buttonText = language === 'es' ? 'Ver en Dashboard' : 'View in Dashboard';

    return `
            <div class="action-buttons">
                <a href="${dashboardUrl}" class="btn">${buttonText}</a>
            </div>`;
  }

  /**
   * Build template variables for admin notification
   */
  private buildAdminTemplateVariables(transaction: AdminNotificationData): Record<string, string> {
    const formattedAmount = this.formatAmount(transaction.amount_cents, transaction.currency);
    const transactionDate = new Date(transaction.created_at).toLocaleString();
    
    // Get organization info from environment
    const organizationName = process.env.ORGANIZATION_NAME || 'Bridge Payments';
    const organizationEmail = process.env.ORGANIZATION_EMAIL || process.env.EMAIL_FROM_ADDRESS || '';
    
    return {
      // Transaction details
      transaction_id: transaction.transaction_id,
      amount: formattedAmount,
      amount_cents: transaction.amount_cents.toString(),
      currency: transaction.currency.toUpperCase(),
      status: transaction.status,
      provider_id: transaction.provider_id,
      provider_payment_id: transaction.provider_payment_id || 'N/A',
      reference_code: transaction.reference_code || 'N/A',
      concept: transaction.concept || 'Payment',
      description: transaction.description || 'Payment transaction',
      transaction_date: transactionDate,
      
      // Customer information
      customer_email: transaction.customer_email || 'N/A',
      customer_name: transaction.customer_name || 'N/A',
      customer_phone: transaction.customer_phone || 'N/A',
      user_type: transaction.user_type === 'registered' ? 'Registered User' : 'Guest User',
      
      // Payment method
      payment_method_type: transaction.payment_method_type || 'N/A',
      payment_method_last_four: transaction.payment_method_last_four || 'N/A',
      payment_method_brand: transaction.payment_method_brand || 'N/A',
      payment_method: transaction.payment_method_brand && transaction.payment_method_last_four 
        ? `${transaction.payment_method_brand} ****${transaction.payment_method_last_four}`
        : 'N/A',
      
      // Organization info
      organization_name: organizationName,
      organization_email: organizationEmail,
      
      // Additional context
      ip_address: transaction.ip_address || 'N/A',
      user_agent: transaction.user_agent || 'N/A',
      
      // Metadata as JSON string (if exists)
      metadata: transaction.metadata ? JSON.stringify(transaction.metadata, null, 2) : 'None',
      
      // Admin dashboard URL (if configured)
      admin_dashboard_url: process.env.ADMIN_DASHBOARD_URL || '#',

      // Dashboard section (conditional)
      dashboard_section: this.generateDashboardSection(),
      
      // Current timestamp
      current_year: new Date().getFullYear().toString(),
      current_date: new Date().toLocaleDateString(),
      current_time: new Date().toLocaleTimeString()
    };
  }

  /**
   * Send admin notification for successful transaction
   */
  async sendTransactionNotification(transaction: AdminNotificationData): Promise<{ success: boolean; message?: string }> {
    try {
      // Check if admin notifications are enabled
      if (!this.isAdminNotificationEnabled()) {
        console.log('[AdminNotificationService] Admin notifications disabled');
        return {
          success: false,
          message: 'Admin notifications disabled'
        };
      }

      // Get admin recipients
      const recipients = this.getAdminRecipients();
      if (recipients.length === 0) {
        console.warn('[AdminNotificationService] No valid admin recipients configured');
        return {
          success: false,
          message: 'No admin recipients configured'
        };
      }

      // Build template variables
      const variables = this.buildAdminTemplateVariables(transaction);
      
      // Get template name from environment or use default
      const templateName = process.env.ADMIN_EMAIL_TEMPLATE || 'admin_transaction_notification';
      
      // Get template content
      const template = templateService.getTemplate(templateName, variables, this.defaultLanguage);
      
      if (!template) {
        console.error(`[AdminNotificationService] Template ${templateName} not found`);
        return {
          success: false,
          message: `Email template ${templateName} not found`
        };
      }

      // Add subject prefix
      const subjectPrefix = this.getSubjectPrefix();
      const finalSubject = `${subjectPrefix} ${template.subject}`;

      // Send email to all admin recipients
      const result = await emailService.sendEmailWithRetry({
        to: recipients,
        subject: finalSubject,
        htmlBody: template.html
      });

      if (result.success) {
        console.log(`[AdminNotificationService] Admin notification sent successfully to ${recipients.length} recipients for transaction ${transaction.transaction_id}`);
      } else {
        console.error(`[AdminNotificationService] Failed to send admin notification for transaction ${transaction.transaction_id}:`, result.message);
      }

      return result;

    } catch (error) {
      console.error('[AdminNotificationService] Error sending admin notification:', error);
      return {
        success: false,
        message: error instanceof Error ? error.message : 'Unknown error'
      };
    }
  }

  /**
   * Test admin notification system
   */
  async testAdminNotification(): Promise<{ success: boolean; message?: string; recipients?: number }> {
    const testTransaction: AdminNotificationData = {
      transaction_id: 'test_' + Date.now(),
      amount_cents: 5000,
      currency: 'USD',
      status: 'succeeded',
      provider_id: 'test',
      provider_payment_id: 'test_payment_123',
      reference_code: 'TEST_001',
      concept: 'Test Transaction',
      description: 'Test admin notification',
      customer_email: 'test@example.com',
      customer_name: 'Test Customer',
      user_type: 'guest',
      payment_method_type: 'card',
      payment_method_last_four: '4242',
      payment_method_brand: 'visa',
      created_at: new Date().toISOString(),
      ip_address: '127.0.0.1',
      metadata: { test: true }
    };

    const recipients = this.getAdminRecipients();
    const result = await this.sendTransactionNotification(testTransaction);
    
    return {
      ...result,
      recipients: recipients.length
    };
  }
}

// Export singleton instance
export const adminNotificationService = new AdminNotificationService();
