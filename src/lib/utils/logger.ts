import { config } from '@/config/environment';

/**
 * Conditional logging utility
 * Only logs when LOG_MODE is true
 */
export class Logger {
  private static isDebugMode(): boolean {
    return config.LOG_MODE;
  }

  /**
   * Debug log - only shows when LOG_MODE=true
   */
  static debug(...args: any[]): void {
    if (this.isDebugMode()) {
      console.log(...args);
    }
  }

  /**
   * Info log - only shows when LOG_MODE=true
   */
  static info(...args: any[]): void {
    if (this.isDebugMode()) {
      console.log(...args);
    }
  }

  /**
   * Warning log - always shows
   */
  static warn(...args: any[]): void {
    console.warn(...args);
  }

  /**
   * Error log - always shows
   */
  static error(...args: any[]): void {
    console.error(...args);
  }

  /**
   * Success log - only shows when LOG_MODE=true
   */
  static success(...args: any[]): void {
    if (this.isDebugMode()) {
      console.log(...args);
    }
  }

  /**
   * Webhook specific logging
   */
  static webhook = {
    received: (provider: string, eventType: string, eventId: string) => {
      if (Logger.isDebugMode()) {
        console.log(`🔔 Received ${provider} webhook: ${eventType} (${eventId})`);
      }
    },

    signature: {
      verifying: (provider: string, secretPreview: string, signaturePreview: string, payloadLength: number) => {
        if (Logger.isDebugMode()) {
          console.log(`🔐 Verifying ${provider} webhook signature...`);
          console.log(`   Webhook secret: ${secretPreview}...`);
          console.log(`   Signature header: ${signaturePreview}...`);
          console.log(`   Payload length: ${payloadLength}`);
        }
      },

      verified: (provider: string, eventId: string, eventType: string) => {
        if (Logger.isDebugMode()) {
          console.log(`✅ ${provider} webhook signature verified successfully`);
          console.log(`   Event ID: ${eventId}`);
          console.log(`   Event type: ${eventType}`);
        }
      },

      failed: (provider: string, error: any) => {
        // Always log signature failures as they're security-related
        console.error(`❌ ${provider} webhook verification failed:`, error);
      }
    },

    processing: {
      started: (eventType: string, eventId: string) => {
        if (Logger.isDebugMode()) {
          console.log(`🔄 Processing webhook event: ${eventType} (${eventId})`);
        }
      },

      completed: (provider: string, webhookId: string) => {
        if (Logger.isDebugMode()) {
          console.log(`✅ ${provider} webhook ${webhookId} processed successfully`);
        }
      },

      failed: (provider: string, webhookId: string, error: any) => {
        // Always log processing failures
        console.error(`❌ Failed to process ${provider} webhook ${webhookId}:`, error);
      }
    },

    adapter: {
      initializing: (provider: string, apiKeyPreview: string, environment: string) => {
        if (Logger.isDebugMode()) {
          console.log(`🔧 Initializing ${provider} adapter...`);
          console.log(`🔑 API Key: ${apiKeyPreview}...`);
          console.log(`🌍 Environment: ${environment}`);
        }
      }
    }
  };

  /**
   * Get current logging status
   */
  static getStatus() {
    return {
      debug_mode: this.isDebugMode(),
      log_level: config.LOG_LEVEL,
      log_format: config.LOG_FORMAT
    };
  }
}
