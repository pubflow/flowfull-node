import { config } from '@/config/environment';
import { LRUCache } from 'lru-cache';

// Session validation cache
const sessionCache = new LRUCache<string, SessionData>({
  max: 1000,
  ttl: config.SESSION_VALIDATION_CACHE_TTL * 1000 // Convert to milliseconds
});

export interface SessionData {
  user_id: string;
  email: string;
  name: string;
  user_type?: string;
  organization_id?: string;
  permissions?: string[];
  expires_at?: string;
  validated_at: string;
}

export interface ValidationResult {
  success: boolean;
  session?: SessionData;
  error?: string;
  cached?: boolean;
}

export class BridgeValidator {
  private flowlessApiUrl: string;
  private validationSecret: string;
  private timeout: number;
  private retryAttempts: number;

  constructor() {
    this.flowlessApiUrl = config.FLOWLESS_API_URL;
    this.validationSecret = config.BRIDGE_VALIDATION_SECRET;
    this.timeout = config.BRIDGE_VALIDATION_TIMEOUT;
    this.retryAttempts = config.BRIDGE_RETRY_ATTEMPTS;
  }

  // Validate session with Flowless backend
  async validateSession(sessionId: string): Promise<ValidationResult> {
    if (!sessionId) {
      return {
        success: false,
        error: 'Session ID is required'
      };
    }

    // Check cache first
    const cached = sessionCache.get(sessionId);
    if (cached) {
      return {
        success: true,
        session: cached,
        cached: true
      };
    }

    // Validate with Flowless
    try {
      const session = await this.validateWithFlowless(sessionId);
      
      if (session) {
        // Cache successful validation
        sessionCache.set(sessionId, session);
        
        return {
          success: true,
          session,
          cached: false
        };
      } else {
        return {
          success: false,
          error: 'Invalid session'
        };
      }
    } catch (error) {
      console.error('Session validation failed:', error);
      
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Validation failed'
      };
    }
  }

  // Validate session with Flowless backend (with retries)
  private async validateWithFlowless(sessionId: string): Promise<SessionData | null> {
    let lastError: Error | null = null;

    for (let attempt = 1; attempt <= this.retryAttempts; attempt++) {
      try {
        const response = await this.makeValidationRequest(sessionId);
        
        if (response.ok) {
          const data = await response.json();
          
          if (data.success && data.user) {
            return {
              user_id: data.user.id,
              email: data.user.email,
              name: data.user.name,
              user_type: data.user.user_type,
              organization_id: data.user.organization_id,
              permissions: data.user.permissions,
              expires_at: data.expires_at,
              validated_at: new Date().toISOString()
            };
          } else {
            return null; // Invalid session
          }
        } else if (response.status === 401 || response.status === 403) {
          // Don't retry for authentication errors
          return null;
        } else {
          throw new Error(`Validation request failed: ${response.status} ${response.statusText}`);
        }
      } catch (error) {
        lastError = error instanceof Error ? error : new Error('Unknown error');
        
        if (attempt < this.retryAttempts) {
          // Wait before retry (exponential backoff)
          const delay = Math.min(1000 * Math.pow(2, attempt - 1), 5000);
          await new Promise(resolve => setTimeout(resolve, delay));
          
          console.warn(`Session validation attempt ${attempt} failed, retrying in ${delay}ms:`, error);
        }
      }
    }

    throw lastError || new Error('All validation attempts failed');
  }

  // Make HTTP request to Flowless validation endpoint
  private async makeValidationRequest(sessionId: string): Promise<Response> {
    const url = `${this.flowlessApiUrl}/auth/validation`;
    
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), this.timeout);

    try {
      const response = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${this.validationSecret}`,
          'X-Bridge-Request': 'true'
        },
        body: JSON.stringify({
          session_id: sessionId,
          timestamp: Date.now(),
          source: 'bridge-payments'
        }),
        signal: controller.signal
      });

      return response;
    } finally {
      clearTimeout(timeoutId);
    }
  }

  // Invalidate cached session
  invalidateSession(sessionId: string): void {
    sessionCache.delete(sessionId);
  }

  // Clear all cached sessions
  clearCache(): void {
    sessionCache.clear();
  }

  // Get cache statistics
  getCacheStats() {
    return {
      size: sessionCache.size,
      max: sessionCache.max,
      ttl: sessionCache.ttl,
      calculatedSize: sessionCache.calculatedSize
    };
  }

  // Validate session and sync user data
  async validateAndSyncUser(sessionId: string): Promise<ValidationResult & { synced?: boolean }> {
    const result = await this.validateSession(sessionId);
    
    if (result.success && result.session && !result.cached) {
      try {
        // Import here to avoid circular dependencies
        const { getPaymentUserRepository } = await import('@/lib/database/repositories');
        const userRepo = await getPaymentUserRepository();
        
        // Sync user data with payment users table
        await userRepo.upsertFromFlowless({
          id: result.session.user_id,
          email: result.session.email,
          name: result.session.name,
          userType: result.session.user_type
        });
        
        return {
          ...result,
          synced: true
        };
      } catch (error) {
        console.error('Failed to sync user data:', error);
        // Don't fail validation if sync fails
        return {
          ...result,
          synced: false
        };
      }
    }
    
    return result;
  }

  // Batch validate multiple sessions
  async validateSessions(sessionIds: string[]): Promise<Map<string, ValidationResult>> {
    const results = new Map<string, ValidationResult>();
    
    // Process in parallel with concurrency limit
    const concurrency = 5;
    const chunks = [];
    
    for (let i = 0; i < sessionIds.length; i += concurrency) {
      chunks.push(sessionIds.slice(i, i + concurrency));
    }
    
    for (const chunk of chunks) {
      const promises = chunk.map(async (sessionId) => {
        const result = await this.validateSession(sessionId);
        return [sessionId, result] as const;
      });
      
      const chunkResults = await Promise.all(promises);
      chunkResults.forEach(([sessionId, result]) => {
        results.set(sessionId, result);
      });
    }
    
    return results;
  }

  // Health check for Flowless connection
  async healthCheck(): Promise<{ success: boolean; latency?: number; error?: string }> {
    const startTime = Date.now();
    
    try {
      const response = await fetch(`${this.flowlessApiUrl}/health`, {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${this.validationSecret}`,
          'X-Bridge-Request': 'true'
        },
        signal: AbortSignal.timeout(this.timeout)
      });
      
      const latency = Date.now() - startTime;
      
      if (response.ok) {
        return {
          success: true,
          latency
        };
      } else {
        return {
          success: false,
          latency,
          error: `HTTP ${response.status}: ${response.statusText}`
        };
      }
    } catch (error) {
      const latency = Date.now() - startTime;
      
      return {
        success: false,
        latency,
        error: error instanceof Error ? error.message : 'Unknown error'
      };
    }
  }
}

// Singleton instance
export const bridgeValidator = new BridgeValidator();
