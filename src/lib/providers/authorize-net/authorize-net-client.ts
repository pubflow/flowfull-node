import {
  AuthorizeNetConfig,
  AuthorizeNetApiRequest,
  AuthorizeNetApiResponse,
  AuthorizeNetTransactionRequest,
  AuthorizeNetCreateCustomerProfileRequest,
  AuthorizeNetCreateCustomerProfileResponse,
  AuthorizeNetCreatePaymentProfileRequest,
  AuthorizeNetCreatePaymentProfileResponse,
  AuthorizeNetWebhookPayload
} from './types';
import crypto from 'crypto';

export class AuthorizeNetHttpClient {
  private config: AuthorizeNetConfig;
  private baseUrl: string;

  constructor(config: AuthorizeNetConfig) {
    this.config = config;
    this.baseUrl = config.environment === 'production'
      ? 'https://api.authorize.net/xml/v1/request.api'
      : 'https://apitest.authorize.net/xml/v1/request.api';
  }

  // Create Transaction
  async createTransaction(transactionRequest: AuthorizeNetTransactionRequest): Promise<AuthorizeNetApiResponse> {
    console.log('🔄 Creating Authorize.Net transaction...');

    const request: AuthorizeNetApiRequest = {
      createTransactionRequest: {
        merchantAuthentication: {
          name: this.config.apiLoginId,
          transactionKey: this.config.transactionKey
        },
        refId: this.generateRefId(),
        transactionRequest
      }
    };

    return this.makeApiCall(request);
  }

  // Get Transaction Details
  async getTransactionDetails(transId: string): Promise<any> {
    console.log('📋 Getting Authorize.Net transaction details:', transId);

    const request = {
      getTransactionDetailsRequest: {
        merchantAuthentication: {
          name: this.config.apiLoginId,
          transactionKey: this.config.transactionKey
        },
        transId
      }
    };

    return this.makeApiCall(request);
  }

  // Void Transaction
  async voidTransaction(refTransId: string): Promise<AuthorizeNetApiResponse> {
    console.log('❌ Voiding Authorize.Net transaction:', refTransId);

    const transactionRequest: AuthorizeNetTransactionRequest = {
      transactionType: 'voidTransaction' as any,
      amount: '0', // Amount not required for void
      refTransId
    };

    return this.createTransaction(transactionRequest);
  }

  // Refund Transaction
  async refundTransaction(refTransId: string, amount: string, payment?: any): Promise<AuthorizeNetApiResponse> {
    console.log('💰 Refunding Authorize.Net transaction:', refTransId, 'Amount:', amount);

    const transactionRequest: AuthorizeNetTransactionRequest = {
      transactionType: 'refundTransaction' as any,
      amount,
      refTransId,
      payment
    };

    return this.createTransaction(transactionRequest);
  }

  // Customer Information Manager (CIM) Methods

  // Create Customer Profile
  async createCustomerProfile(request: AuthorizeNetCreateCustomerProfileRequest): Promise<AuthorizeNetCreateCustomerProfileResponse> {
    console.log('👤 Creating Authorize.Net customer profile...');

    const apiRequest = {
      createCustomerProfileRequest: {
        merchantAuthentication: {
          name: this.config.apiLoginId,
          transactionKey: this.config.transactionKey
        },
        profile: request.profile,
        validationMode: request.validationMode || 'none'
      }
    };

    return this.makeApiCall(apiRequest);
  }

  // Get Customer Profile
  async getCustomerProfile(customerProfileId: string): Promise<any> {
    console.log('📋 Getting Authorize.Net customer profile:', customerProfileId);

    const request = {
      getCustomerProfileRequest: {
        merchantAuthentication: {
          name: this.config.apiLoginId,
          transactionKey: this.config.transactionKey
        },
        customerProfileId,
        unmaskExpirationDate: true
      }
    };

    return this.makeApiCall(request);
  }

  // Update Customer Profile
  async updateCustomerProfile(customerProfileId: string, profile: any): Promise<any> {
    console.log('📝 Updating Authorize.Net customer profile:', customerProfileId);

    const request = {
      updateCustomerProfileRequest: {
        merchantAuthentication: {
          name: this.config.apiLoginId,
          transactionKey: this.config.transactionKey
        },
        profile: {
          ...profile,
          customerProfileId
        }
      }
    };

    return this.makeApiCall(request);
  }

  // Delete Customer Profile
  async deleteCustomerProfile(customerProfileId: string): Promise<any> {
    console.log('🗑️ Deleting Authorize.Net customer profile:', customerProfileId);

    const request = {
      deleteCustomerProfileRequest: {
        merchantAuthentication: {
          name: this.config.apiLoginId,
          transactionKey: this.config.transactionKey
        },
        customerProfileId
      }
    };

    return this.makeApiCall(request);
  }

  // Create Payment Profile
  async createPaymentProfile(request: AuthorizeNetCreatePaymentProfileRequest): Promise<AuthorizeNetCreatePaymentProfileResponse> {
    console.log('💳 Creating Authorize.Net payment profile...');

    const apiRequest = {
      createCustomerPaymentProfileRequest: {
        merchantAuthentication: {
          name: this.config.apiLoginId,
          transactionKey: this.config.transactionKey
        },
        customerProfileId: request.customerProfileId,
        paymentProfile: request.paymentProfile,
        validationMode: request.validationMode || 'none'
      }
    };

    return this.makeApiCall(apiRequest);
  }

  // Get Payment Profile
  async getPaymentProfile(customerProfileId: string, customerPaymentProfileId: string): Promise<any> {
    console.log('📋 Getting Authorize.Net payment profile:', customerPaymentProfileId);

    const request = {
      getCustomerPaymentProfileRequest: {
        merchantAuthentication: {
          name: this.config.apiLoginId,
          transactionKey: this.config.transactionKey
        },
        customerProfileId,
        customerPaymentProfileId,
        unmaskExpirationDate: true
      }
    };

    return this.makeApiCall(request);
  }

  // Update Payment Profile
  async updatePaymentProfile(customerProfileId: string, paymentProfile: any): Promise<any> {
    console.log('📝 Updating Authorize.Net payment profile...');

    const request = {
      updateCustomerPaymentProfileRequest: {
        merchantAuthentication: {
          name: this.config.apiLoginId,
          transactionKey: this.config.transactionKey
        },
        customerProfileId,
        paymentProfile
      }
    };

    return this.makeApiCall(request);
  }

  // Delete Payment Profile
  async deletePaymentProfile(customerProfileId: string, customerPaymentProfileId: string): Promise<any> {
    console.log('🗑️ Deleting Authorize.Net payment profile:', customerPaymentProfileId);

    const request = {
      deleteCustomerPaymentProfileRequest: {
        merchantAuthentication: {
          name: this.config.apiLoginId,
          transactionKey: this.config.transactionKey
        },
        customerProfileId,
        customerPaymentProfileId
      }
    };

    return this.makeApiCall(request);
  }

  // Validate Customer Payment Profile
  async validatePaymentProfile(customerProfileId: string, customerPaymentProfileId: string, validationMode: 'none' | 'testMode' | 'liveMode' = 'testMode'): Promise<any> {
    console.log('✅ Validating Authorize.Net payment profile:', customerPaymentProfileId);

    const request = {
      validateCustomerPaymentProfileRequest: {
        merchantAuthentication: {
          name: this.config.apiLoginId,
          transactionKey: this.config.transactionKey
        },
        customerProfileId,
        customerPaymentProfileId,
        validationMode
      }
    };

    return this.makeApiCall(request);
  }

  // Webhook Signature Validation
  verifyWebhookSignature(headers: Record<string, string>, body: string): boolean {
    if (!this.config.signatureKey) {
      console.warn('⚠️ Authorize.Net signature key not configured, skipping webhook verification');
      return true; // Allow if no signature key configured
    }

    const signature = headers['x-anet-signature'];
    if (!signature) {
      console.error('❌ Missing X-ANET-Signature header');
      return false;
    }

    try {
      // Authorize.Net uses SHA-512 HMAC
      const computedSignature = crypto
        .createHmac('sha512', this.config.signatureKey)
        .update(body)
        .digest('hex')
        .toUpperCase();

      const expectedSignature = `sha512=${computedSignature}`;
      const isValid = signature.toUpperCase() === expectedSignature.toUpperCase();

      if (!isValid) {
        console.error('❌ Authorize.Net webhook signature verification failed');
        console.error('Expected:', expectedSignature);
        console.error('Received:', signature);
      } else {
        console.log('✅ Authorize.Net webhook signature verified');
      }

      return isValid;
    } catch (error) {
      console.error('❌ Error verifying Authorize.Net webhook signature:', error);
      return false;
    }
  }

  // Parse Webhook Payload
  parseWebhookPayload(body: string): AuthorizeNetWebhookPayload {
    try {
      return JSON.parse(body);
    } catch (error) {
      throw new Error('Invalid webhook payload format');
    }
  }

  // Private helper methods
  private async makeApiCall(request: any): Promise<any> {
    try {
      const response = await fetch(this.baseUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Accept': 'application/json'
        },
        body: JSON.stringify(request)
      });

      if (!response.ok) {
        const errorText = await response.text();
        console.error('❌ Authorize.Net API error:', response.status, errorText);
        throw new Error(`Authorize.Net API error: ${response.status} ${errorText}`);
      }

      const responseData = await response.json();
      
      // Log API response for debugging (without sensitive data)
      console.log('✅ Authorize.Net API response:', {
        resultCode: responseData.messages?.resultCode,
        messageCount: responseData.messages?.message?.length || 0
      });

      return responseData;
    } catch (error) {
      console.error('❌ Authorize.Net API call failed:', error);
      throw error;
    }
  }

  private generateRefId(): string {
    return `ref_${Date.now()}_${Math.random().toString(36).substring(2, 11)}`;
  }

  // Health check
  async healthCheck(): Promise<{ success: boolean; latency?: number; error?: string }> {
    const startTime = Date.now();
    
    try {
      // Use a minimal API call to test connectivity
      const request = {
        getMerchantDetailsRequest: {
          merchantAuthentication: {
            name: this.config.apiLoginId,
            transactionKey: this.config.transactionKey
          }
        }
      };

      await this.makeApiCall(request);
      
      return {
        success: true,
        latency: Date.now() - startTime
      };
    } catch (error) {
      return {
        success: false,
        latency: Date.now() - startTime,
        error: error instanceof Error ? error.message : 'Unknown error'
      };
    }
  }
}
