/**
 * Receipt Service for Bridge-Payments
 * Handles transaction receipt emails with i18n support
 * Universal service for all payment types
 */

import { emailService } from './email-service';
import { templateService } from './template-service';

interface TransactionData {
  // Payment information
  id: string;
  amount_cents: number;
  currency: string;
  status: string;
  description?: string;
  concept?: string;
  reference_code?: string;
  category?: string;
  
  // Provider information
  provider_id: string;
  provider_payment_id?: string;
  
  // Customer information
  customer_email?: string;
  customer_name?: string;
  guest_email?: string;
  guest_name?: string;
  
  // Timestamps
  created_at: string;
  updated_at?: string;
  
  // Metadata
  metadata?: Record<string, any>;
}

interface OrganizationConfig {
  name: string;
  email: string;
  phone?: string;
  address?: string;
  website?: string;
}

export class ReceiptService {
  
  /**
   * Get organization configuration from environment
   */
  private getOrganizationConfig(): OrganizationConfig {
    return {
      name: process.env.ORGANIZATION_NAME || 'Bridge Payments',
      email: process.env.ORGANIZATION_EMAIL || process.env.EMAIL_FROM_ADDRESS || 'noreply@bridgepayments.com',
      phone: process.env.ORGANIZATION_PHONE || '',
      address: process.env.ORGANIZATION_ADDRESS || '',
      website: process.env.ORGANIZATION_WEBSITE || process.env.FRONTEND_URL || ''
    };
  }

  /**
   * Get customer information from transaction data
   */
  private getCustomerInfo(transaction: TransactionData): { email: string; name: string } {
    const email = transaction.customer_email || transaction.guest_email || '';
    const name = transaction.customer_name || transaction.guest_name || 'Valued Customer';
    
    return { email, name };
  }

  /**
   * Format amount for display
   */
  private formatAmount(amountCents: number): string {
    return (amountCents / 100).toFixed(2);
  }

  /**
   * Get language from transaction metadata or environment
   */
  private getLanguage(transaction: TransactionData): string {
    // Check transaction metadata first
    if (transaction.metadata?.language) {
      return transaction.metadata.language;
    }
    
    // Check customer email domain for hints (optional)
    const customerEmail = transaction.customer_email || transaction.guest_email || '';
    if (customerEmail.includes('.es') || customerEmail.includes('.mx') || customerEmail.includes('.ar')) {
      return 'es';
    }
    
    // Default from environment
    return process.env.GLOBAL_LANG || process.env.DEFAULT_LANGUAGE || 'en';
  }

  /**
   * Build template variables from transaction data
   */
  private buildTemplateVariables(transaction: TransactionData): Record<string, string> {
    const customer = this.getCustomerInfo(transaction);
    const organization = this.getOrganizationConfig();
    const transactionDate = new Date(transaction.created_at);
    const language = this.getLanguage(transaction);
    
    return {
      // Customer information
      customer_name: customer.name,
      customer_email: customer.email,
      
      // Transaction details
      amount: this.formatAmount(transaction.amount_cents),
      currency: transaction.currency.toUpperCase(),
      concept: transaction.concept || transaction.description || 'Payment',
      reference_code: transaction.reference_code || transaction.id,
      transaction_id: transaction.provider_payment_id || transaction.id,
      transaction_date: transactionDate.toLocaleDateString(language === 'es' ? 'es-ES' : 'en-US'),
      transaction_time: transactionDate.toLocaleTimeString(language === 'es' ? 'es-ES' : 'en-US'),
      
      // Organization information
      organization_name: organization.name,
      contact_email: organization.email,
      contact_phone: organization.phone,
      contact_address: organization.address,
      
      // URLs (if available)
      privacy_url: `${organization.website}/privacy`,
      terms_url: `${organization.website}/terms`,
      contact_url: `${organization.website}/contact`,
      
      // Additional metadata
      payment_method: transaction.metadata?.payment_method || 'Card',
      category: transaction.category || 'payment'
    };
  }

  /**
   * Send transaction receipt email
   */
  async sendTransactionReceipt(transaction: TransactionData): Promise<{ success: boolean; message?: string }> {
    try {
      const customer = this.getCustomerInfo(transaction);
      
      if (!customer.email) {
        // console.warn('[ReceiptService] No customer email found, skipping receipt');
        return {
          success: false,
          message: 'No customer email provided'
        };
      }

      // Only send receipts for successful payments
      if (transaction.status !== 'succeeded' && transaction.status !== 'completed') {
        // console.log(`[ReceiptService] Transaction ${transaction.id} status is ${transaction.status}, skipping receipt`);
        return {
          success: false,
          message: `Transaction status is ${transaction.status}, not sending receipt`
        };
      }

      const language = this.getLanguage(transaction);
      const variables = this.buildTemplateVariables(transaction);
      
      // Get template content
      const template = templateService.getTemplate('transaction_receipt', variables, language);
      
      if (!template) {
        console.error('[ReceiptService] Transaction receipt template not found');
        return {
          success: false,
          message: 'Email template not found'
        };
      }

      // Send email
      const result = await emailService.sendEmailWithRetry({
        to: [{ address: customer.email, name: customer.name }],
        subject: template.subject,
        htmlBody: template.html
      });

      if (result.success) {
        console.log(`✅ Receipt sent to ${customer.email}`);
      } else {
        console.error(`❌ Failed to send receipt to ${customer.email}:`, result.message);
      }

      return result;

    } catch (error) {
      console.error('[ReceiptService] Error sending transaction receipt:', error);
      return {
        success: false,
        message: error instanceof Error ? error.message : 'Unknown error'
      };
    }
  }

  /**
   * Send receipt with custom template variables
   */
  async sendCustomReceipt(
    transaction: TransactionData,
    customVariables: Record<string, string> = {},
    templateName: string = 'transaction_receipt'
  ): Promise<{ success: boolean; message?: string }> {
    try {
      const customer = this.getCustomerInfo(transaction);

      if (!customer.email) {
        return {
          success: false,
          message: 'No customer email provided'
        };
      }

      const language = this.getLanguage(transaction);
      const baseVariables = this.buildTemplateVariables(transaction);
      const variables = { ...baseVariables, ...customVariables };

      const template = templateService.getTemplate(templateName, variables, language);

      if (!template) {
        return {
          success: false,
          message: `Email template ${templateName} not found`
        };
      }

      return await emailService.sendEmailWithRetry({
        to: [{ address: customer.email, name: customer.name }],
        subject: template.subject,
        htmlBody: template.html
      });

    } catch (error) {
      console.error('[ReceiptService] Error sending custom receipt:', error);
      return {
        success: false,
        message: error instanceof Error ? error.message : 'Unknown error'
      };
    }
  }

  /**
   * Test email configuration
   */
  async testEmailConfiguration(): Promise<{ success: boolean; message?: string }> {
    const testTransaction: TransactionData = {
      id: 'test_' + Date.now(),
      amount_cents: 2500,
      currency: 'USD',
      status: 'succeeded',
      description: 'Test Transaction',
      concept: 'Test Payment',
      reference_code: 'TEST_001',
      provider_id: 'stripe',
      provider_payment_id: 'pi_test_123',
      customer_email: process.env.TEST_EMAIL || 'test@example.com',
      customer_name: 'Test User',
      created_at: new Date().toISOString()
    };

    return await this.sendTransactionReceipt(testTransaction);
  }
}

// Export singleton instance
export const receiptService = new ReceiptService();
