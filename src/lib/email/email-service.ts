/**
 * Email Service for Bridge-Payments
 * Universal email service using ZeptoMail API
 * Independent implementation - no external dependencies
 */

interface EmailRecipient {
  address: string;
  name?: string;
}

interface EmailOptions {
  from?: EmailRecipient;
  to: EmailRecipient[];
  subject: string;
  htmlBody: string;
  textBody?: string;
  replyTo?: EmailRecipient;
}

interface ZeptoMailRequestBody {
  from: {
    address: string;
    name?: string;
  };
  to: {
    email_address: {
      address: string;
      name?: string;
    };
  }[];
  reply_to?: {
    address: string;
    name?: string;
  }[];
  subject: string;
  htmlbody: string;
  textbody?: string;
  track_clicks?: boolean;
  track_opens?: boolean;
}

export class EmailService {
  private apiUrl: string = 'https://api.zeptomail.com/v1.1/email';
  private defaultSender: EmailRecipient = {
    address: 'noreply@bridgepayments.com',
    name: 'Bridge Payments'
  };

  /**
   * Get API key from environment variables
   */
  private getApiKey(): string {
    const apiKey = process.env.ZEPTOMAIL_API_KEY || '';
    // console.log(`[EmailService] API Key configured: ${apiKey ? 'YES' : 'NO'}`);
    // if (apiKey) {
    //   console.log(`[EmailService] API Key starts with: ${apiKey.substring(0, 15)}...`);
    // }
    return apiKey;
  }

  /**
   * Get sender configuration from environment
   */
  private getSenderConfig(): EmailRecipient {
    const senderEmail = process.env.EMAIL_FROM_ADDRESS;
    const senderName = process.env.EMAIL_FROM_NAME;
    
    if (senderEmail) {
      return {
        address: senderEmail,
        name: senderName || 'Bridge Payments'
      };
    }
    
    return this.defaultSender;
  }

  /**
   * Get reply-to configuration from environment
   */
  private getReplyToConfig(): EmailRecipient | undefined {
    const replyToEmail = process.env.EMAIL_REPLY_TO_ADDRESS;
    const replyToName = process.env.EMAIL_REPLY_TO_NAME;
    
    if (replyToEmail) {
      return {
        address: replyToEmail,
        name: replyToName
      };
    }
    
    return undefined;
  }

  /**
   * Send email using ZeptoMail API
   */
  async sendEmail(options: EmailOptions): Promise<{ success: boolean; message?: string }> {
    const apiKey = this.getApiKey();
    
    if (!apiKey) {
      console.warn('[EmailService] ZEPTOMAIL_API_KEY not configured, skipping email');
      return {
        success: false,
        message: 'Email service not configured'
      };
    }

    try {
      const senderConfig = this.getSenderConfig();
      const replyToConfig = this.getReplyToConfig();
      
      const requestBody: ZeptoMailRequestBody = {
        from: {
          address: options.from?.address || senderConfig.address,
          name: options.from?.name || senderConfig.name
        },
        to: options.to.map(recipient => ({
          email_address: {
            address: recipient.address,
            name: recipient.name
          }
        })),
        subject: options.subject,
        htmlbody: options.htmlBody,
        track_opens: true,
        track_clicks: true
      };

      // Add reply_to if configured
      const replyTo = options.replyTo || replyToConfig;
      if (replyTo) {
        requestBody.reply_to = [{
          address: replyTo.address,
          name: replyTo.name
        }];
      }

      // Add text body if provided
      if (options.textBody) {
        requestBody.textbody = options.textBody;
      }

      // console.log(`[EmailService] Sending email to ${options.to[0].address}`);
      // console.log(`[EmailService] Using API key: ${apiKey.substring(0, 20)}...`);
      // console.log(`[EmailService] Request body:`, JSON.stringify(requestBody, null, 2));

      const response = await fetch(this.apiUrl, {
        method: 'POST',
        headers: {
          'Accept': 'application/json',
          'Content-Type': 'application/json',
          'Authorization': apiKey
        },
        body: JSON.stringify(requestBody)
      });

      if (!response.ok) {
        const errorText = await response.text();
        console.error('[EmailService] API error:', response.status, errorText);

        return {
          success: false,
          message: `Email API error: ${response.status}`
        };
      }

      const responseData = await response.text();
      // console.log('[EmailService] Email sent successfully');
      
      return { success: true };

    } catch (error) {
      console.error('[EmailService] Error sending email:', error);
      return {
        success: false,
        message: error instanceof Error ? error.message : 'Unknown error'
      };
    }
  }

  /**
   * Send email with automatic retry
   */
  async sendEmailWithRetry(
    options: EmailOptions, 
    maxRetries: number = 3
  ): Promise<{ success: boolean; message?: string }> {
    let lastError: string = '';
    
    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      const result = await this.sendEmail(options);
      
      if (result.success) {
        return result;
      }
      
      lastError = result.message || 'Unknown error';
      
      if (attempt < maxRetries) {
        const delay = Math.pow(2, attempt) * 1000; // Exponential backoff
        // console.log(`[EmailService] Retry ${attempt}/${maxRetries} in ${delay}ms`);
        await new Promise(resolve => setTimeout(resolve, delay));
      }
    }
    
    return {
      success: false,
      message: `Failed after ${maxRetries} attempts: ${lastError}`
    };
  }
}

// Export singleton instance
export const emailService = new EmailService();
