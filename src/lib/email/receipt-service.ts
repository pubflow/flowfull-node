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
  // NEW UNIFIED PRICING SYSTEM
  subtotal_cents?: number;
  tax_cents?: number;
  discount_cents?: number;
  total_cents?: number;
  // Legacy support
  amount_cents?: number;
  currency: string;
  status: string;
  description?: string;
  concept?: string;
  reference_code?: string;
  category?: string;

  // Provider information
  provider_id: string;
  provider_payment_id?: string;
  provider_intent_id?: string; // Added for receipt URL retrieval

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
   * Get receipt URL from payment provider (currently only Stripe)
   */
  private async getReceiptUrl(transaction: TransactionData): Promise<string | null> {
    console.log(`🔍 Checking receipt URL eligibility:`, {
      provider_id: transaction.provider_id,
      status: transaction.status,
      provider_intent_id: transaction.provider_intent_id,
      transaction_id: transaction.id
    });

    // Only get receipt URL for Stripe and successful payments
    if (transaction.provider_id !== 'stripe') {
      console.log(`⚠️ Provider ${transaction.provider_id} is not Stripe, skipping receipt URL`);
      return null;
    }

    if (transaction.status !== 'succeeded') {
      console.log(`⚠️ Transaction status ${transaction.status} is not succeeded, skipping receipt URL`);
      return null;
    }

    if (!transaction.provider_intent_id) {
      console.log(`⚠️ No provider_intent_id found, skipping receipt URL`);
      return null;
    }

    try {
      console.log(`🧾 Getting receipt URL for Stripe transaction: ${transaction.id} with intent: ${transaction.provider_intent_id}`);

      // Use PaymentProviderFactory to get Stripe adapter
      const { getPaymentAdapter } = await import('../providers/factory');

      console.log(`🔧 Getting Stripe adapter from factory`);

      // Get Stripe adapter instance
      const stripeAdapter = getPaymentAdapter('stripe');

      // Verify it's a Stripe adapter and has the getReceiptUrl method
      if (!stripeAdapter || typeof (stripeAdapter as any).getReceiptUrl !== 'function') {
        console.warn('⚠️ Stripe adapter does not have getReceiptUrl method');
        return null;
      }

      // Get receipt URL
      console.log(`📞 Calling stripeAdapter.getReceiptUrl(${transaction.provider_intent_id})`);
      const receiptUrl = await (stripeAdapter as any).getReceiptUrl(transaction.provider_intent_id);

      if (receiptUrl) {
        console.log(`✅ Receipt URL obtained for transaction ${transaction.id}: ${receiptUrl.substring(0, 50)}...`);
      } else {
        console.log(`⚠️ No receipt URL available for transaction ${transaction.id}`);
      }

      return receiptUrl;

    } catch (error) {
      console.error('❌ Failed to get receipt URL:', error);
      return null; // Don't break email flow if receipt URL fails
    }
  }

  /**
   * Generate logo header HTML if ORGANIZATION_LOGO is set
   */
  private generateLogoHeader(): string {
    const logoUrl = process.env.ORGANIZATION_LOGO;

    if (!logoUrl) {
      return '';
    }

    return `
      <div class="logo-header">
        <img src="${logoUrl}" alt="Organization Logo" class="organization-logo" />
      </div>
    `;
  }

  /**
   * Generate receipt section HTML for Stripe payments
   */
  private generateReceiptSection(receiptUrl: string | null, language: string): string {
    if (!receiptUrl) {
      return '';
    }

    const isSpanish = language === 'es';

    const title = isSpanish ? '📄 Recibo Oficial de Pago' : '📄 Official Payment Receipt';
    const text = isSpanish
      ? 'Vea y descargue su recibo oficial de pago desde nuestro procesador de pagos. Este recibo contiene todos los detalles de la transacción y puede usarlo para sus registros:'
      : 'View and download your official payment receipt from our payment processor. This receipt contains all transaction details and can be used for your records:';
    const buttonText = isSpanish ? '🔗 Ver Recibo Oficial' : '🔗 View Official Receipt';
    const note = isSpanish
      ? 'Este recibo es proporcionado por nuestro procesador de pagos seguro y contiene los detalles completos de la transacción.'
      : 'This receipt is provided by our secure payment processor and contains complete transaction details.';

    return `
      <div class="receipt-section">
        <div class="receipt-title">${title}</div>
        <div class="receipt-text">
          ${text}
        </div>
        <div class="receipt-button-container">
          <a href="${receiptUrl}" target="_blank" class="receipt-button">
            ${buttonText}
          </a>
        </div>
        <div class="receipt-note">
          ${note}
        </div>
      </div>
    `;
  }

  /**
   * Build template variables from transaction data
   */
  private async buildTemplateVariables(transaction: TransactionData, receiptUrl?: string | null): Promise<Record<string, string>> {
    const customer = this.getCustomerInfo(transaction);
    const organization = this.getOrganizationConfig();
    const transactionDate = new Date(transaction.created_at);
    const language = this.getLanguage(transaction);
    
    return {
      // Customer information
      customer_name: customer.name,
      customer_email: customer.email,
      
      // Transaction details with INTELLIGENT PRICING SYSTEM
      amount: this.formatAmount(transaction.total_cents || transaction.amount_cents || 0),
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
      category: transaction.category || 'payment',

      // Logo header (optional)
      logo_header: this.generateLogoHeader(),

      // Receipt section (Stripe only)
      receipt_section: this.generateReceiptSection(receiptUrl, language),

      // Legacy variables (for backward compatibility)
      receipt_url: receiptUrl || '',
      has_receipt_url: receiptUrl ? 'true' : 'false'
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

      // Get receipt URL for Stripe payments
      const receiptUrl = await this.getReceiptUrl(transaction);

      const variables = await this.buildTemplateVariables(transaction, receiptUrl);
      
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

      // Get receipt URL for Stripe payments (unless overridden in customVariables)
      const receiptUrl = customVariables.receipt_url !== undefined ?
        customVariables.receipt_url :
        await this.getReceiptUrl(transaction);

      const baseVariables = await this.buildTemplateVariables(transaction, receiptUrl);
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
      // NEW UNIFIED PRICING SYSTEM
      subtotal_cents: 2500,
      tax_cents: 0,
      discount_cents: 0,
      total_cents: 2500,
      // Legacy support
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
