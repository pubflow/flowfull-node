// Secure Authentication Service
import { secureUserCache, type CachedUser } from './user-cache.js';
import { getEnv } from '@/lib/runtime';

export interface AuthValidationResult {
  success: boolean;
  user?: CachedUser;
  error?: string;
  fromCache?: boolean;
}

export interface BackendSessionResponse {
  success: boolean;
  user: {
    id: string;
    email: string;
    name: string;
    userType: string;
    paymentUserId?: string;
    firstName?: string;
    lastName?: string;
    phone?: string | null;
    isVerified?: boolean;
  };
  session: {
    id: string;
    userId: string;
    expiresAt: string;
    lastUsedAt: string;
  };
  timestamp: string;
}

export interface BackendTokenResponse {
  success: boolean;
  user: {
    id: string;
    email: string;
    name: string;
    isVerified: boolean;
  };
  tokenType: string;
  token_id: string;
  expires_at: string;
  message?: string;
}

class SecureAuthService {
  private readonly FLOWLESS_API_URL: string;
  private readonly BRIDGE_SECRET: string;
  private readonly REQUEST_TIMEOUT = parseInt(getEnv('AUTH_TIMEOUT') || '25000');

  constructor() {
    this.FLOWLESS_API_URL = getEnv('FLOWLESS_API_URL') || '';
    this.BRIDGE_SECRET = getEnv('BRIDGE_VALIDATION_SECRET') || '';

    if (!this.FLOWLESS_API_URL) {
      throw new Error('FLOWLESS_API_URL environment variable is required');
    }
    if (!this.BRIDGE_SECRET) {
      throw new Error('BRIDGE_VALIDATION_SECRET environment variable is required');
    }
  }

  /**
   * Validate session with backend
   */
  private async validateSessionWithBackend(sessionId: string): Promise<BackendSessionResponse | null> {
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), this.REQUEST_TIMEOUT);

      const response = await fetch(`${this.FLOWLESS_API_URL}/auth/bridge/validate`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Bridge-Secret': this.BRIDGE_SECRET,
          'User-Agent': 'Bridge-Payments/1.0'
        },
        body: JSON.stringify({ sessionId }),
        signal: controller.signal
      });

      clearTimeout(timeoutId);

      if (!response.ok) {
        console.warn(`Backend session validation failed: ${response.status} ${response.statusText}`);
        return null;
      }

      const data = await response.json() as BackendSessionResponse;
      
      // Validate response structure
      if (!data.success || !data.user || !data.session) {
        console.warn('Invalid backend session response structure');
        return null;
      }

      return data;
    } catch (error) {
      if (error instanceof Error && error.name === 'AbortError') {
        console.warn('Backend session validation timeout');
      } else {
        console.error('Backend session validation error:', error);
      }
      return null;
    }
  }

  /**
   * Validate token with backend
   */
  private async validateTokenWithBackend(token: string): Promise<BackendTokenResponse | null> {
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), this.REQUEST_TIMEOUT);

      // Sanitize token for URL
      const sanitizedToken = encodeURIComponent(token);
      const url = `${this.FLOWLESS_API_URL}/auth/token/validate?token=${sanitizedToken}`;

      console.log(`🔍 Validating token with backend: ${url.replace(sanitizedToken, token.substring(0, 8) + '...')} (timeout: ${this.REQUEST_TIMEOUT}ms)`);

      const startTime = Date.now();
      const response = await fetch(url, {
        method: 'GET',
        headers: {
          'User-Agent': 'Bridge-Payments/1.0'
        },
        signal: controller.signal
      });

      clearTimeout(timeoutId);
      const duration = Date.now() - startTime;

      console.log(`📡 Backend response: ${response.status} ${response.statusText} (took ${duration}ms)`);

      if (!response.ok) {
        console.warn(`Backend token validation failed: ${response.status} ${response.statusText}`);
        return null;
      }

      const data = await response.json() as BackendTokenResponse;

      console.log(`✅ Backend token validation successful: user=${data.user?.id} email=${data.user?.email}`);

      // Validate response structure
      if (!data.success || !data.user) {
        console.warn('Invalid backend token response structure:', data);
        return null;
      }

      return data;
    } catch (error) {
      if (error instanceof Error && error.name === 'AbortError') {
        console.warn(`⏰ Backend token validation timeout after ${this.REQUEST_TIMEOUT}ms - consider increasing AUTH_TIMEOUT in .env`);
      } else {
        console.error('❌ Backend token validation error:', error);
      }
      return null;
    }
  }

  /**
   * Convert backend session response to cached user
   */
  private sessionResponseToCachedUser(response: BackendSessionResponse): CachedUser {
    const now = new Date();
    const cacheExpiry = new Date(now.getTime() + 10 * 60 * 1000); // 10 minutes

    console.log(`🔄 Converting session response to cached user:`);
    console.log(`   - User ID: ${response.user.id}`);
    console.log(`   - Email: ${response.user.email}`);
    console.log(`   - User Type: ${response.user.userType}`);
    console.log(`   - Session Expires: ${response.session.expiresAt}`);

    return {
      id: response.user.id,
      email: response.user.email,
      name: response.user.name,
      userType: response.user.userType, // Use userType from your API response
      isVerified: response.user.isVerified || false,
      firstName: response.user.firstName || response.user.name,
      lastName: response.user.lastName || '',
      cachedAt: now.toISOString(),
      expiresAt: cacheExpiry.toISOString(),
      sessionExpiresAt: response.session.expiresAt,
      tokenType: 'session',
      originalIdentifier: response.session.id
    };
  }

  /**
   * Convert backend token response to cached user
   */
  private tokenResponseToCachedUser(response: BackendTokenResponse, token: string): CachedUser {
    const now = new Date();
    const cacheExpiry = new Date(now.getTime() + 10 * 60 * 1000); // 10 minutes cache

    // Use the actual token expiration from backend
    const tokenExpiry = new Date(response.expires_at);

    console.log(`🔄 Converting token response to cached user:`);
    console.log(`   - User ID: ${response.user.id}`);
    console.log(`   - Email: ${response.user.email}`);
    console.log(`   - Token Type: ${response.tokenType}`);
    console.log(`   - Token Expires: ${response.expires_at}`);
    console.log(`   - Cache Expires: ${cacheExpiry.toISOString()}`);

    return {
      id: response.user.id,
      email: response.user.email,
      name: response.user.name,
      userType: 'guest', // Token users are guests
      isVerified: response.user.isVerified,
      firstName: response.user.name,
      lastName: '',
      cachedAt: now.toISOString(),
      expiresAt: cacheExpiry.toISOString(),
      sessionExpiresAt: response.expires_at, // Use actual token expiration
      tokenType: 'token_login',
      originalIdentifier: token
    };
  }

  /**
   * Validate session ID
   */
  async validateSession(sessionId: string): Promise<AuthValidationResult> {
    try {
      // Input validation
      if (!sessionId || typeof sessionId !== 'string' || sessionId.length < 10) {
        return { success: false, error: 'Invalid session ID format' };
      }

      // Check cache first
      const cachedUser = await secureUserCache.get('session', sessionId);
      if (cachedUser && !(await secureUserCache.needsValidation('session', sessionId))) {
        console.log(`⚡ Session validation from cache: ${sessionId.substring(0, 8)}... (instant)`);
        return { success: true, user: cachedUser, fromCache: true };
      }

      // Validate with backend
      const backendResponse = await this.validateSessionWithBackend(sessionId);
      if (!backendResponse) {
        // Remove from cache if backend validation fails
        await secureUserCache.invalidate('session', sessionId);
        return { success: false, error: 'Session validation failed' };
      }

      // Convert and cache the user
      const user = this.sessionResponseToCachedUser(backendResponse);
      await secureUserCache.set('session', sessionId, user);

      return { success: true, user, fromCache: false };
    } catch (error) {
      console.error('Session validation error:', error);
      return { success: false, error: 'Internal validation error' };
    }
  }

  /**
   * Validate token
   */
  async validateToken(token: string): Promise<AuthValidationResult> {
    try {
      // Input validation
      if (!token || typeof token !== 'string' || token.length < 10) {
        return { success: false, error: 'Invalid token format' };
      }

      // Check cache first
      const cachedUser = await secureUserCache.get('token', token);
      if (cachedUser && !(await secureUserCache.needsValidation('token', token))) {
        console.log(`⚡ Token validation from cache: ${token.substring(0, 8)}... (instant)`);
        return { success: true, user: cachedUser, fromCache: true };
      }

      // Validate with backend
      const backendResponse = await this.validateTokenWithBackend(token);
      if (!backendResponse) {
        // Remove from cache if backend validation fails
        await secureUserCache.invalidate('token', token);
        return { success: false, error: 'Token validation failed' };
      }

      // Convert and cache the user
      const user = this.tokenResponseToCachedUser(backendResponse, token);
      await secureUserCache.set('token', token, user);

      return { success: true, user, fromCache: false };
    } catch (error) {
      console.error('Token validation error:', error);
      return { success: false, error: 'Internal validation error' };
    }
  }

  /**
   * Check if user has required user type
   */
  hasUserType(user: CachedUser, allowedTypes: string[]): boolean {
    return allowedTypes.includes(user.userType);
  }

  /**
   * Check if user can access resource (ownership check)
   */
  canAccessResource(user: CachedUser, resourceUserId: string): boolean {
    // Admin can access any resource
    if (user.userType === 'admin') {
      return true;
    }
    
    // User can only access their own resources
    return user.id === resourceUserId;
  }

  /**
   * Get cache statistics
   */
  getCacheStats() {
    return secureUserCache.getStats();
  }

  /**
   * Clear cache (admin operation)
   */
  clearCache(): void {
    secureUserCache.clear();
  }

  /**
   * Security audit
   */
  auditSecurity() {
    return secureUserCache.auditCache();
  }
}

// Singleton instance
export const authService = new SecureAuthService();

// Export types
export type { AuthValidationResult, BackendSessionResponse, BackendTokenResponse };
