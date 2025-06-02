import { PayPalOrderRequest, PayPalOrder, PayPalAccessTokenResponse, PayPalCaptureResponse } from './types';

export interface PayPalClientConfig {
  clientId: string;
  clientSecret: string;
  environment: 'sandbox' | 'production';
  webhookId?: string;
  bnCode?: string;
}

export class PayPalHttpClient {
  private config: PayPalClientConfig;
  private baseUrl: string;
  private accessToken: string | null = null;
  private tokenExpiry: number = 0;

  constructor(config: PayPalClientConfig) {
    this.config = config;
    this.baseUrl = config.environment === 'production' 
      ? 'https://api-m.paypal.com'
      : 'https://api-m.sandbox.paypal.com';
  }

  async generateAccessToken(): Promise<string> {
    // Return cached token if still valid
    if (this.accessToken && Date.now() < this.tokenExpiry) {
      return this.accessToken;
    }

    console.log('🔑 Generating PayPal access token...');

    const auth = Buffer.from(`${this.config.clientId}:${this.config.clientSecret}`).toString('base64');
    
    const response = await fetch(`${this.baseUrl}/v1/oauth2/token`, {
      method: 'POST',
      headers: {
        'Authorization': `Basic ${auth}`,
        'Accept': 'application/json',
        'Accept-Language': 'en_US',
        'Content-Type': 'application/x-www-form-urlencoded'
      },
      body: 'grant_type=client_credentials'
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error('❌ PayPal token generation failed:', response.status, errorText);
      throw new Error(`PayPal authentication failed: ${response.status}`);
    }

    const tokenData: PayPalAccessTokenResponse = await response.json();
    
    this.accessToken = tokenData.access_token;
    // Set expiry to 90% of actual expiry for safety margin
    this.tokenExpiry = Date.now() + (tokenData.expires_in * 900);
    
    console.log('✅ PayPal access token generated successfully');
    return this.accessToken;
  }

  async createOrder(orderRequest: PayPalOrderRequest): Promise<PayPalOrder> {
    console.log('🔄 Creating PayPal order...');
    
    const accessToken = await this.generateAccessToken();
    
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${accessToken}`,
      'Accept': 'application/json',
      'PayPal-Request-Id': this.generateRequestId(),
      'Prefer': 'return=representation'
    };

    // Add BN Code if provided (for partner attribution)
    if (this.config.bnCode) {
      headers['PayPal-Partner-Attribution-Id'] = this.config.bnCode;
    }

    const response = await fetch(`${this.baseUrl}/v2/checkout/orders`, {
      method: 'POST',
      headers,
      body: JSON.stringify(orderRequest)
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error('❌ PayPal order creation failed:', response.status, errorText);
      throw new Error(`PayPal order creation failed: ${response.status} - ${errorText}`);
    }

    const order: PayPalOrder = await response.json();
    console.log('✅ PayPal order created:', order.id);
    
    return order;
  }

  async getOrder(orderId: string): Promise<PayPalOrder> {
    console.log('📋 Getting PayPal order:', orderId);
    
    const accessToken = await this.generateAccessToken();
    
    const response = await fetch(`${this.baseUrl}/v2/checkout/orders/${orderId}`, {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${accessToken}`,
        'Accept': 'application/json'
      }
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error('❌ PayPal order retrieval failed:', response.status, errorText);
      throw new Error(`PayPal order retrieval failed: ${response.status} - ${errorText}`);
    }

    const order: PayPalOrder = await response.json();
    return order;
  }

  async captureOrder(orderId: string): Promise<PayPalOrder> {
    console.log('💰 Capturing PayPal order:', orderId);
    
    const accessToken = await this.generateAccessToken();
    
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${accessToken}`,
      'Accept': 'application/json',
      'PayPal-Request-Id': this.generateRequestId(),
      'Prefer': 'return=representation'
    };

    if (this.config.bnCode) {
      headers['PayPal-Partner-Attribution-Id'] = this.config.bnCode;
    }

    const response = await fetch(`${this.baseUrl}/v2/checkout/orders/${orderId}/capture`, {
      method: 'POST',
      headers,
      body: JSON.stringify({})
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error('❌ PayPal order capture failed:', response.status, errorText);
      throw new Error(`PayPal order capture failed: ${response.status} - ${errorText}`);
    }

    const captureResponse: PayPalOrder = await response.json();
    console.log('✅ PayPal order captured successfully');
    
    return captureResponse;
  }

  async authorizeOrder(orderId: string): Promise<PayPalOrder> {
    console.log('🔒 Authorizing PayPal order:', orderId);
    
    const accessToken = await this.generateAccessToken();
    
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${accessToken}`,
      'Accept': 'application/json',
      'PayPal-Request-Id': this.generateRequestId(),
      'Prefer': 'return=representation'
    };

    if (this.config.bnCode) {
      headers['PayPal-Partner-Attribution-Id'] = this.config.bnCode;
    }

    const response = await fetch(`${this.baseUrl}/v2/checkout/orders/${orderId}/authorize`, {
      method: 'POST',
      headers,
      body: JSON.stringify({})
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error('❌ PayPal order authorization failed:', response.status, errorText);
      throw new Error(`PayPal order authorization failed: ${response.status} - ${errorText}`);
    }

    const authResponse: PayPalOrder = await response.json();
    console.log('✅ PayPal order authorized successfully');
    
    return authResponse;
  }

  async refundCapture(captureId: string, amount?: { currency_code: string; value: string }): Promise<any> {
    console.log('💸 Refunding PayPal capture:', captureId);
    
    const accessToken = await this.generateAccessToken();
    
    const refundRequest: any = {};
    if (amount) {
      refundRequest.amount = amount;
    }

    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${accessToken}`,
      'Accept': 'application/json',
      'PayPal-Request-Id': this.generateRequestId(),
      'Prefer': 'return=representation'
    };

    if (this.config.bnCode) {
      headers['PayPal-Partner-Attribution-Id'] = this.config.bnCode;
    }

    const response = await fetch(`${this.baseUrl}/v2/payments/captures/${captureId}/refund`, {
      method: 'POST',
      headers,
      body: JSON.stringify(refundRequest)
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error('❌ PayPal refund failed:', response.status, errorText);
      throw new Error(`PayPal refund failed: ${response.status} - ${errorText}`);
    }

    const refundResponse = await response.json();
    console.log('✅ PayPal refund processed successfully');
    
    return refundResponse;
  }

  async verifyWebhookSignature(
    headers: Record<string, string>,
    body: string,
    webhookId: string
  ): Promise<boolean> {
    console.log('🔐 Verifying PayPal webhook signature...');
    
    const accessToken = await this.generateAccessToken();
    
    const verificationRequest = {
      auth_algo: headers['paypal-auth-algo'],
      cert_id: headers['paypal-cert-id'],
      transmission_id: headers['paypal-transmission-id'],
      transmission_sig: headers['paypal-transmission-sig'],
      transmission_time: headers['paypal-transmission-time'],
      webhook_id: webhookId,
      webhook_event: JSON.parse(body)
    };

    const response = await fetch(`${this.baseUrl}/v1/notifications/verify-webhook-signature`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${accessToken}`,
        'Accept': 'application/json'
      },
      body: JSON.stringify(verificationRequest)
    });

    if (!response.ok) {
      console.error('❌ PayPal webhook verification failed:', response.status);
      return false;
    }

    const verificationResponse = await response.json();
    const isValid = verificationResponse.verification_status === 'SUCCESS';
    
    console.log(isValid ? '✅ PayPal webhook signature verified' : '❌ PayPal webhook signature invalid');
    return isValid;
  }

  private generateRequestId(): string {
    return `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
  }
}
