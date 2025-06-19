// src/lib/email/subscription-email-service.ts
import { emailService } from './email-service';
import { templateService } from './template-service';

/**
 * Servicio de emails para subscripciones con soporte i18n
 * Maneja todos los eventos de subscripciones: creación, éxito, fallo, cancelación, etc.
 */
export class SubscriptionEmailService {
  private defaultLang = 'en';

  /**
   * Determina el idioma global desde configuración
   */
  private getGlobalLanguage(): string {
    try {
      // Opción 1: Variable directa
      if (process.env.GLOBAL_LANG) {
        return process.env.GLOBAL_LANG;
      }
      
      // Opción 2: Dentro de AUTH config
      const authConfig = JSON.parse(process.env.AUTH || '{}');
      if (authConfig.global_lang) {
        return authConfig.global_lang;
      }
      
      return this.defaultLang;
    } catch (error) {
      console.warn('[SubscriptionEmailService] Error reading language config, using default:', this.defaultLang);
      return this.defaultLang;
    }
  }

  /**
   * Obtiene información de reply_to desde INSTANCE
   */
  private getReplyToInfo() {
    try {
      const instanceInfo = JSON.parse(process.env.INSTANCE || '{}');
      return {
        email: instanceInfo['client-email'],
        name: instanceInfo['client-nickname'] || instanceInfo['client-name']
      };
    } catch (error) {
      return { email: null, name: null };
    }
  }

  /**
   * Obtiene el nombre de la organización con prioridades
   */
  private getOrganizationName(): string {
    // Prioridad 1: ORGANIZATION_SHORT_NAME
    if (process.env.ORGANIZATION_SHORT_NAME) {
      return process.env.ORGANIZATION_SHORT_NAME;
    }

    // Prioridad 2: EMAIL_FROM_NAME
    if (process.env.EMAIL_FROM_NAME) {
      return process.env.EMAIL_FROM_NAME;
    }

    // Prioridad 3: INSTANCE.client-name (fallback)
    try {
      const instanceInfo = JSON.parse(process.env.INSTANCE || '{}');
      if (instanceInfo['client-name']) {
        return instanceInfo['client-name'];
      }
    } catch (error) {
      console.warn('[SubscriptionEmailService] Error parsing INSTANCE config:', error);
    }

    // Fallback final
    return 'App';
  }

  /**
   * Obtiene variables del sistema para templates
   */
  private getSystemVariables(additionalVars: Record<string, string> = {}): Record<string, string> {
    const instanceInfo = JSON.parse(process.env.INSTANCE || '{}');
    const clientLogo = instanceInfo.client || '';
    const organizationName = this.getOrganizationName();

    return {
      client_name: organizationName,
      organization_name: organizationName, // Alias para compatibilidad
      client_logo: clientLogo,
      client_logo_display: clientLogo ? 'block' : 'none',
      provider_name: instanceInfo['provider-name'] || 'Sistema',
      app_url: instanceInfo.app || '',
      current_year: new Date().getFullYear().toString(),
      current_date: new Date().toLocaleDateString(),
      // Logo header
      logo_header: this.generateLogoHeader(),
      ...additionalVars
    };
  }

  /**
   * Genera header con logo si existe (compatible con receipt-service)
   */
  private generateLogoHeader(): string {
    // Prioridad 1: ORGANIZATION_LOGO (como en receipt-service)
    let logoUrl = process.env.ORGANIZATION_LOGO;

    // Prioridad 2: INSTANCE.client (fallback)
    if (!logoUrl) {
      try {
        const instanceInfo = JSON.parse(process.env.INSTANCE || '{}');
        logoUrl = instanceInfo.client;
      } catch (error) {
        console.warn('[SubscriptionEmailService] Error parsing INSTANCE config:', error);
      }
    }

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
   * Envía email de subscripción exitosa
   */
  async sendSubscriptionSuccessEmail(
    subscription: any,
    customerEmail: string
  ): Promise<{ success: boolean; message?: string }> {
    try {
      const lang = this.getGlobalLanguage();
      console.log(`[SubscriptionEmailService] Sending subscription success email in ${lang} to ${customerEmail}`);

      const variables = this.getSystemVariables({
        customer_email: customerEmail,
        subscription_id: subscription.id,
        subscription_concept: subscription.concept || 'Subscription',
        subscription_description: subscription.description || '',
        subscription_amount: `$${(subscription.price_cents / 100).toFixed(2)}`,
        subscription_currency: subscription.currency?.toUpperCase() || 'USD',
        subscription_interval: subscription.billing_interval || 'monthly',
        next_billing_date: subscription.next_billing_date ? new Date(subscription.next_billing_date).toLocaleDateString() : '',
        subscription_status: subscription.status || 'active'
      });

      const htmlContent = this.getSubscriptionSuccessTemplate(lang, variables);
      const subject = this.getSubscriptionSuccessSubject(lang, variables);

      const replyTo = this.getReplyToInfo();
      const emailOptions: any = {
        to: [{ address: customerEmail }],
        subject,
        htmlBody: htmlContent
      };

      if (replyTo.email) {
        emailOptions.replyTo = {
          address: replyTo.email,
          name: replyTo.name
        };
      }

      const result = await emailService.sendEmail(emailOptions);
      console.log(`[SubscriptionEmailService] Subscription success email sent: ${result.success}`);
      return result;

    } catch (error) {
      console.error('[SubscriptionEmailService] Error sending subscription success email:', error);
      return {
        success: false,
        message: error instanceof Error ? error.message : 'Unknown error'
      };
    }
  }

  /**
   * Envía email de subscripción fallida
   */
  async sendSubscriptionFailedEmail(
    subscription: any,
    customerEmail: string,
    errorMessage?: string
  ): Promise<{ success: boolean; message?: string }> {
    try {
      const lang = this.getGlobalLanguage();
      console.log(`[SubscriptionEmailService] Sending subscription failed email in ${lang} to ${customerEmail}`);

      const variables = this.getSystemVariables({
        customer_email: customerEmail,
        subscription_id: subscription.id,
        subscription_concept: subscription.concept || 'Subscription',
        subscription_amount: `$${(subscription.price_cents / 100).toFixed(2)}`,
        subscription_currency: subscription.currency?.toUpperCase() || 'USD',
        error_message: errorMessage || 'Payment processing failed',
        retry_url: `${process.env.APP_URL || ''}/subscriptions/${subscription.id}/retry`
      });

      const htmlContent = this.getSubscriptionFailedTemplate(lang, variables);
      const subject = this.getSubscriptionFailedSubject(lang, variables);

      const replyTo = this.getReplyToInfo();
      const emailOptions: any = {
        to: [{ address: customerEmail }],
        subject,
        htmlBody: htmlContent
      };

      if (replyTo.email) {
        emailOptions.replyTo = {
          address: replyTo.email,
          name: replyTo.name
        };
      }

      const result = await emailService.sendEmail(emailOptions);
      console.log(`[SubscriptionEmailService] Subscription failed email sent: ${result.success}`);
      return result;

    } catch (error) {
      console.error('[SubscriptionEmailService] Error sending subscription failed email:', error);
      return {
        success: false,
        message: error instanceof Error ? error.message : 'Unknown error'
      };
    }
  }

  /**
   * Envía email de subscripción reembolsada
   */
  async sendSubscriptionRefundedEmail(
    subscription: any,
    customerEmail: string,
    refundAmount: number,
    refundId: string,
    refundReason?: string
  ): Promise<{ success: boolean; message?: string }> {
    try {
      const lang = this.getGlobalLanguage();
      console.log(`[SubscriptionEmailService] Sending subscription refunded email in ${lang} to ${customerEmail}`);

      const variables = this.getSystemVariables({
        customer_email: customerEmail,
        customer_name: customerEmail.split('@')[0], // Fallback name
        subscription_id: subscription.id,
        subscription_concept: subscription.concept || 'Subscription',
        subscription_amount: `$${(subscription.price_cents / 100).toFixed(2)}`,
        subscription_currency: subscription.currency?.toUpperCase() || 'USD',
        refund_amount: `$${(refundAmount / 100).toFixed(2)}`,
        refund_id: refundId,
        refund_reason: refundReason || 'Customer requested refund',
        contact_phone: '+1 (732) 367-6585',
        contact_email: 'info@bethellakewood.org',
        contact_address: 'Bethel Spanish Pentecostal Church',
        privacy_url: `${process.env.APP_URL || ''}/privacy`,
        terms_url: `${process.env.APP_URL || ''}/terms`,
        contact_url: `${process.env.APP_URL || ''}/contact`
      });

      const htmlContent = this.getSubscriptionRefundedTemplate(lang, variables);
      const subject = this.getSubscriptionRefundedSubject(lang, variables);

      const replyTo = this.getReplyToInfo();
      const emailOptions: any = {
        to: [{ address: customerEmail }],
        subject,
        htmlBody: htmlContent
      };

      if (replyTo.email) {
        emailOptions.replyTo = {
          address: replyTo.email,
          name: replyTo.name
        };
      }

      const result = await emailService.sendEmail(emailOptions);
      console.log(`[SubscriptionEmailService] Subscription refunded email sent: ${result.success}`);
      return result;

    } catch (error) {
      console.error('[SubscriptionEmailService] Error sending subscription refunded email:', error);
      return {
        success: false,
        message: error instanceof Error ? error.message : 'Unknown error'
      };
    }
  }

  /**
   * Envía email de subscripción cancelada
   */
  async sendSubscriptionCancelledEmail(
    subscription: any,
    customerEmail: string,
    reason?: string
  ): Promise<{ success: boolean; message?: string }> {
    try {
      const lang = this.getGlobalLanguage();
      console.log(`[SubscriptionEmailService] Sending subscription cancelled email in ${lang} to ${customerEmail}`);

      const variables = this.getSystemVariables({
        customer_email: customerEmail,
        subscription_id: subscription.id,
        subscription_concept: subscription.concept || 'Subscription',
        subscription_amount: `$${(subscription.price_cents / 100).toFixed(2)}`,
        subscription_currency: subscription.currency?.toUpperCase() || 'USD',
        cancellation_reason: reason || 'User requested cancellation',
        end_date: subscription.current_period_end ? new Date(subscription.current_period_end).toLocaleDateString() : '',
        reactivate_url: `${process.env.APP_URL || ''}/subscriptions/${subscription.id}/reactivate`
      });

      const htmlContent = this.getSubscriptionCancelledTemplate(lang, variables);
      const subject = this.getSubscriptionCancelledSubject(lang, variables);

      const replyTo = this.getReplyToInfo();
      const emailOptions: any = {
        to: [{ address: customerEmail }],
        subject,
        htmlBody: htmlContent
      };

      if (replyTo.email) {
        emailOptions.replyTo = {
          address: replyTo.email,
          name: replyTo.name
        };
      }

      const result = await emailService.sendEmail(emailOptions);
      console.log(`[SubscriptionEmailService] Subscription cancelled email sent: ${result.success}`);
      return result;

    } catch (error) {
      console.error('[SubscriptionEmailService] Error sending subscription cancelled email:', error);
      return {
        success: false,
        message: error instanceof Error ? error.message : 'Unknown error'
      };
    }
  }

  /**
   * Reemplaza variables en template
   */
  private replaceVariables(template: string, variables: Record<string, string>): string {
    let content = template;
    Object.entries(variables).forEach(([key, value]) => {
      const regex = new RegExp(`{{${key}}}`, 'g');
      content = content.replace(regex, value || '');
    });
    return content;
  }

  /**
   * Obtiene subject para subscription success
   */
  private getSubscriptionSuccessSubject(lang: string, variables: Record<string, string>): string {
    try {
      const result = templateService.getTemplate('subscription_created', variables, lang);
      if (result) {
        return result.subject;
      }
    } catch (error) {
      console.warn(`[SubscriptionEmailService] Subject template error for ${lang}:`, error);
    }

    // Fallback subjects
    const subjects = {
      'es': '🎉 ¡Subscripción Activada! - {{client_name}}',
      'en': '🎉 Subscription Activated! - {{client_name}}'
    };

    const template = subjects[lang as keyof typeof subjects] || subjects['en'];
    return this.replaceVariables(template, variables);
  }

  /**
   * Obtiene subject para subscription failed
   */
  private getSubscriptionFailedSubject(lang: string, variables: Record<string, string>): string {
    try {
      const result = templateService.getTemplate('subscription_failed', variables, lang);
      if (result) {
        return result.subject;
      }
    } catch (error) {
      console.warn(`[SubscriptionEmailService] Subject template error for ${lang}:`, error);
    }

    // Fallback subjects
    const subjects = {
      'es': '⚠️ Problema con tu Subscripción - {{client_name}}',
      'en': '⚠️ Subscription Payment Issue - {{client_name}}'
    };

    const template = subjects[lang as keyof typeof subjects] || subjects['en'];
    return this.replaceVariables(template, variables);
  }

  /**
   * Obtiene subject para subscription cancelled
   */
  private getSubscriptionCancelledSubject(lang: string, variables: Record<string, string>): string {
    try {
      const result = templateService.getTemplate('subscription_cancelled', variables, lang);
      if (result) {
        return result.subject;
      }
    } catch (error) {
      console.warn(`[SubscriptionEmailService] Subject template error for ${lang}:`, error);
    }

    // Fallback subjects
    const subjects = {
      'es': '📋 Subscripción Cancelada - {{client_name}}',
      'en': '📋 Subscription Cancelled - {{client_name}}'
    };

    const template = subjects[lang as keyof typeof subjects] || subjects['en'];
    return this.replaceVariables(template, variables);
  }

  /**
   * Obtiene subject para subscription refunded
   */
  private getSubscriptionRefundedSubject(lang: string, variables: Record<string, string>): string {
    try {
      const result = templateService.getTemplate('subscription_refunded', variables, lang);
      if (result) {
        return result.subject;
      }
    } catch (error) {
      console.warn(`[SubscriptionEmailService] Subject template error for ${lang}:`, error);
    }

    // Fallback subjects
    const subjects = {
      'es': '💰 Reembolso de Subscripción Procesado - {{client_name}}',
      'en': '💰 Subscription Refund Processed - {{client_name}}'
    };

    const template = subjects[lang as keyof typeof subjects] || subjects['en'];
    return this.replaceVariables(template, variables);
  }

  /**
   * Obtiene template para subscription success
   */
  private getSubscriptionSuccessTemplate(lang: string, variables: Record<string, string>): string {
    try {
      const result = templateService.getTemplate('subscription_created', variables, lang);
      if (result) {
        return result.html;
      }
      console.warn(`[SubscriptionEmailService] Template not found for ${lang}, using fallback`);
      return this.getFallbackSuccessTemplate(lang, variables);
    } catch (error) {
      console.warn(`[SubscriptionEmailService] Template error for ${lang}, using fallback:`, error);
      return this.getFallbackSuccessTemplate(lang, variables);
    }
  }

  /**
   * Obtiene template para subscription failed
   */
  private getSubscriptionFailedTemplate(lang: string, variables: Record<string, string>): string {
    try {
      const result = templateService.getTemplate('subscription_failed', variables, lang);
      if (result) {
        return result.html;
      }
      console.warn(`[SubscriptionEmailService] Template not found for ${lang}, using fallback`);
      return this.getFallbackFailedTemplate(lang, variables);
    } catch (error) {
      console.warn(`[SubscriptionEmailService] Template error for ${lang}, using fallback:`, error);
      return this.getFallbackFailedTemplate(lang, variables);
    }
  }

  /**
   * Obtiene template para subscription cancelled
   */
  private getSubscriptionCancelledTemplate(lang: string, variables: Record<string, string>): string {
    try {
      const result = templateService.getTemplate('subscription_cancelled', variables, lang);
      if (result) {
        return result.html;
      }
      console.warn(`[SubscriptionEmailService] Template not found for ${lang}, using fallback`);
      return this.getFallbackCancelledTemplate(lang, variables);
    } catch (error) {
      console.warn(`[SubscriptionEmailService] Template error for ${lang}, using fallback:`, error);
      return this.getFallbackCancelledTemplate(lang, variables);
    }
  }

  /**
   * Obtiene template para subscription refunded
   */
  private getSubscriptionRefundedTemplate(lang: string, variables: Record<string, string>): string {
    try {
      const result = templateService.getTemplate('subscription_refunded', variables, lang);
      if (result) {
        return result.html;
      }
      console.warn(`[SubscriptionEmailService] Template not found for ${lang}, using fallback`);
      return this.getFallbackRefundedTemplate(lang, variables);
    } catch (error) {
      console.warn(`[SubscriptionEmailService] Template error for ${lang}, using fallback:`, error);
      return this.getFallbackRefundedTemplate(lang, variables);
    }
  }

  /**
   * Template de fallback para subscription success
   */
  private getFallbackSuccessTemplate(lang: string, variables: Record<string, string>): string {
    const isSpanish = lang === 'es';
    return `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
        <h1 style="color: #28a745;">${isSpanish ? '🎉 ¡Subscripción Activada!' : '🎉 Subscription Activated!'}</h1>
        <p>${isSpanish ? 'Tu subscripción ha sido activada exitosamente.' : 'Your subscription has been successfully activated.'}</p>
        <p><strong>${isSpanish ? 'Plan:' : 'Plan:'}</strong> ${variables.subscription_concept}</p>
        <p><strong>${isSpanish ? 'Precio:' : 'Price:'}</strong> ${variables.subscription_amount} ${variables.subscription_currency}</p>
        <p><strong>${isSpanish ? 'Próximo pago:' : 'Next payment:'}</strong> ${variables.next_billing_date}</p>
      </div>
    `;
  }

  /**
   * Template de fallback para subscription failed
   */
  private getFallbackFailedTemplate(lang: string, variables: Record<string, string>): string {
    const isSpanish = lang === 'es';
    return `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
        <h1 style="color: #dc3545;">${isSpanish ? '⚠️ Problema con tu Subscripción' : '⚠️ Subscription Payment Issue'}</h1>
        <p>${isSpanish ? 'Hemos detectado un problema con el pago de tu subscripción.' : 'We detected an issue with your subscription payment.'}</p>
        <p><strong>${isSpanish ? 'Subscripción:' : 'Subscription:'}</strong> ${variables.subscription_concept}</p>
        <p><strong>${isSpanish ? 'Monto:' : 'Amount:'}</strong> ${variables.subscription_amount} ${variables.subscription_currency}</p>
        <p><strong>${isSpanish ? 'Error:' : 'Error:'}</strong> ${variables.error_message}</p>
      </div>
    `;
  }

  /**
   * Template de fallback para subscription cancelled
   */
  private getFallbackCancelledTemplate(lang: string, variables: Record<string, string>): string {
    const isSpanish = lang === 'es';
    return `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
        <h1 style="color: #6c757d;">${isSpanish ? '📋 Subscripción Cancelada' : '📋 Subscription Cancelled'}</h1>
        <p>${isSpanish ? 'Tu subscripción ha sido cancelada exitosamente.' : 'Your subscription has been successfully cancelled.'}</p>
        <p><strong>${isSpanish ? 'Plan cancelado:' : 'Cancelled plan:'}</strong> ${variables.subscription_concept}</p>
        <p><strong>${isSpanish ? 'Acceso hasta:' : 'Access until:'}</strong> ${variables.end_date}</p>
      </div>
    `;
  }

  /**
   * Template de fallback para subscription refunded
   */
  private getFallbackRefundedTemplate(lang: string, variables: Record<string, string>): string {
    const isSpanish = lang === 'es';
    return `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
        <h1 style="color: #38a169;">${isSpanish ? '💰 Reembolso Procesado' : '💰 Refund Processed'}</h1>
        <p>${isSpanish ? 'Su reembolso de subscripción ha sido procesado exitosamente.' : 'Your subscription refund has been processed successfully.'}</p>
        <p><strong>${isSpanish ? 'Monto reembolsado:' : 'Refunded amount:'}</strong> ${variables.refund_amount} ${variables.subscription_currency}</p>
        <p><strong>${isSpanish ? 'Subscripción:' : 'Subscription:'}</strong> ${variables.subscription_concept}</p>
        <p><strong>${isSpanish ? 'ID de reembolso:' : 'Refund ID:'}</strong> ${variables.refund_id}</p>
      </div>
    `;
  }
}

// Export singleton instance
export const subscriptionEmailService = new SubscriptionEmailService();
