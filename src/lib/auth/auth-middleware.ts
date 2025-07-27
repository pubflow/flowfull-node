// Secure Authentication Middleware (Enhanced with Validation Mode)
import { Context, Next } from 'hono';
import { HTTPException } from 'hono/http-exception';
import { authService, type AuthValidationResult } from './auth-service.js';
import type { CachedUser } from './user-cache.js';
import { getAuthConfig } from './config';
import { enhancedSessionCache } from './enhanced-session-cache';
import { validationMode } from './validation-mode';
import { SessionSecurityValidator } from './session-security';

// Extend Hono context to include user
declare module 'hono' {
  interface ContextVariableMap {
    user?: CachedUser;
    authResult?: AuthValidationResult;
  }
}

export interface AuthMiddlewareOptions {
  allowedUserTypes?: string[];
  requireAuth?: boolean;
  allowGuest?: boolean;
  ownershipCheck?: boolean;
  rateLimitByUser?: boolean;
}

/**
 * Extract authentication token from request (multiple sources)
 */
function extractAuthToken(c: Context): { type: 'session' | 'token' | null; value: string | null; source?: string } {
  // 1. Try Authorization header first
  const authHeader = c.req.header('Authorization');

  if (authHeader) {
    // Bearer token (session)
    if (authHeader.startsWith('Bearer ')) {
      const sessionId = authHeader.substring(7).trim();
      return sessionId ? { type: 'session', value: sessionId, source: 'Authorization-Bearer' } : { type: null, value: null };
    }

    // Token authentication
    if (authHeader.startsWith('Token ')) {
      const token = authHeader.substring(6).trim();
      return token ? { type: 'token', value: token, source: 'Authorization-Token' } : { type: null, value: null };
    }
  }

  // 2. Try X-Session-ID header
  const sessionHeader = c.req.header('X-Session-ID');
  if (sessionHeader && sessionHeader.trim().length > 10) {
    return { type: 'session', value: sessionHeader.trim(), source: 'X-Session-ID' };
  }

  // 3. Try session_id query parameter
  const sessionParam = c.req.query('session_id');
  if (sessionParam && typeof sessionParam === 'string' && sessionParam.length > 10) {
    return { type: 'session', value: sessionParam, source: 'session_id-param' };
  }

  return { type: null, value: null };
}

/**
 * Extract token from query parameter (for GET requests)
 */
function extractQueryToken(c: Context): string | null {
  const token = c.req.query('token');
  return token && typeof token === 'string' && token.length > 10 ? token : null;
}

/**
 * Log authentication attempt for security monitoring
 */
function logAuthAttempt(c: Context, result: AuthValidationResult, authType: string, authSource?: string) {
  const ip = c.req.header('CF-Connecting-IP') || c.req.header('x-forwarded-for') || 'unknown';
  const userAgent = c.req.header('User-Agent') || 'unknown';
  const path = c.req.path;
  const sourceInfo = authSource ? ` source=${authSource}` : '';

  if (result.success && result.user) {
    console.log(`✅ Auth success: ${authType}${sourceInfo} user=${result.user.id} type=${result.user.userType} ip=${ip} path=${path} cache=${result.fromCache}`);
  } else {
    console.warn(`❌ Auth failed: ${authType}${sourceInfo} ip=${ip} path=${path} error=${result.error} ua=${userAgent.substring(0, 50)}`);
  }
}

/**
 * Admin-only middleware
 */
export function requireAdmin() {
  return async (c: Context, next: Next) => {
    const auth = extractAuthToken(c);

    if (!auth.type || !auth.value) {
      throw new HTTPException(401, {
        message: 'Admin authentication required'
      });
    }

    let result: AuthValidationResult;

    if (auth.type === 'session') {
      result = await authService.validateSession(auth.value);
    } else {
      result = await authService.validateToken(auth.value);
    }

    logAuthAttempt(c, result, `admin-${auth.type}`, auth.source);

    if (!result.success || !result.user) {
      throw new HTTPException(401, {
        message: 'Invalid authentication credentials'
      });
    }

    // Check admin privileges
    if (result.user.userType !== 'admin') {
      console.warn(`🚨 Non-admin user attempted admin access: ${result.user.id} (${result.user.userType}) via ${auth.source}`);
      throw new HTTPException(403, {
        message: 'Admin privileges required'
      });
    }

    // Set user in context
    c.set('user', result.user);
    c.set('authResult', result);

    await next();
  };
}

/**
 * User authentication middleware (for accessing own resources)
 */
export function requireUser(options: AuthMiddlewareOptions = {}) {
  const {
    allowedUserTypes = ['admin', 'user', 'guest'],
    requireAuth = true,
    allowGuest = true,
    ownershipCheck = false
  } = options;

  return async (c: Context, next: Next) => {
    // Try multiple authentication sources
    let auth = extractAuthToken(c);
    let authSource = auth.source || 'unknown';

    // If no auth found, try query parameter for guest tokens (for GET requests)
    if (!auth.type && c.req.method === 'GET') {
      const queryToken = extractQueryToken(c);
      if (queryToken) {
        auth = { type: 'token', value: queryToken, source: 'token-query' };
        authSource = 'token-query';
      }
    }

    // If no authentication and auth is required
    if (!auth.type && requireAuth) {
      throw new HTTPException(401, {
        message: 'Authentication required'
      });
    }

    // If no authentication but it's optional, continue without user
    if (!auth.type && !requireAuth) {
      await next();
      return;
    }

    // Validate authentication
    let result: AuthValidationResult;

    if (auth.type === 'session') {
      result = await authService.validateSession(auth.value!);
    } else if (auth.type === 'token') {
      result = await authService.validateToken(auth.value!);
    } else {
      throw new HTTPException(401, {
        message: 'Invalid authentication method'
      });
    }

    logAuthAttempt(c, result, `user-${auth.type}`, authSource);

    if (!result.success || !result.user) {
      throw new HTTPException(401, {
        message: 'Invalid authentication credentials'
      });
    }

    // Check user type permissions
    if (!authService.hasUserType(result.user, allowedUserTypes)) {
      console.warn(`🚨 User type not allowed: ${result.user.id} (${result.user.userType}) via ${authSource} for types: ${allowedUserTypes.join(',')}`);
      throw new HTTPException(403, {
        message: 'Insufficient privileges for this resource'
      });
    }

    // Ownership check if required
    if (ownershipCheck) {
      const resourceUserId = c.req.param('userId') || c.req.param('id');
      if (resourceUserId && !authService.canAccessResource(result.user, resourceUserId)) {
        console.warn(`🚨 Ownership check failed: user=${result.user.id} resource=${resourceUserId} via ${authSource}`);
        throw new HTTPException(403, {
          message: 'Access denied: insufficient privileges for this resource'
        });
      }
    }

    // Set user in context
    c.set('user', result.user);
    c.set('authResult', result);

    await next();
  };
}

/**
 * Enhanced Optional authentication middleware with Validation Mode support
 * Supports: sessions, tokens, guest tokens, validation_mode security
 */
export function optionalAuth() {
  return async (c: Context, next: Next) => {
    const authConfig = getAuthConfig();

    // Try multiple authentication sources
    let auth = extractAuthToken(c);

    // Try query parameter for guest tokens (for GET requests)
    if (!auth.type && c.req.method === 'GET') {
      const queryToken = extractQueryToken(c);
      if (queryToken) {
        auth = { type: 'token', value: queryToken, source: 'token-query' };
      }
    }

    // If no authentication, continue without user
    if (!auth.type) {
      await next();
      return;
    }

    // Try to validate authentication with enhanced system
    try {
      let result: AuthValidationResult;
      let fromEnhancedCache = false;

      if (auth.type === 'session' && authConfig.ENABLE_VALIDATION_MODE) {
        // Try enhanced cache first for sessions
        const cachedResult = enhancedSessionCache.get(auth.value!);
        if (cachedResult) {
          fromEnhancedCache = true;

          // Apply validation mode checks
          const securityData = SessionSecurityValidator.extractSecurityData(c.req);
          const validationContext = {
            sessionId: auth.value!,
            request: c.req,
            cachedUser: cachedResult.user,
            securityData
          };

          const validationResult = await validationMode.validateSession(validationContext);

          if (validationResult.valid) {
            result = {
              success: true,
              user: {
                id: cachedResult.user.id,
                email: cachedResult.user.email,
                name: cachedResult.user.name,
                userType: cachedResult.user.userType,
                isVerified: cachedResult.user.isVerified,
                cachedAt: cachedResult.user.cachedAt,
                expiresAt: cachedResult.user.expiresAt,
                tokenType: cachedResult.user.tokenType,
                originalIdentifier: cachedResult.user.originalIdentifier
              },
              fromCache: true
            };
          } else {
            // Validation failed, invalidate cache if needed
            if (validationResult.action === 'invalidate') {
              enhancedSessionCache.invalidate(auth.value!);
            }
            console.log(`👤 Optional auth validation failed for ${auth.value!.substring(0, 8)}...: ${validationResult.violations.map(v => v.type).join(', ')}`);
            result = { success: false, error: 'Session validation failed' };
          }
        }
      }

      // Fallback to original auth service if not using enhanced cache
      if (!result) {
        if (auth.type === 'session') {
          result = await authService.validateSession(auth.value!);
        } else if (auth.type === 'token') {
          result = await authService.validateToken(auth.value!);
        } else {
          await next();
          return;
        }

        // Store in enhanced cache if successful and validation mode is enabled
        if (result.success && result.user && auth.type === 'session' && authConfig.ENABLE_VALIDATION_MODE) {
          const securityData = SessionSecurityValidator.extractSecurityData(c.req);
          enhancedSessionCache.set(auth.value!, {
            user: {
              id: result.user.id,
              email: result.user.email,
              name: result.user.name,
              userType: result.user.userType,
              isVerified: result.user.isVerified || true,
              cachedAt: new Date().toISOString(),
              expiresAt: new Date(Date.now() + 10 * 60 * 1000).toISOString(), // 10 min default
              tokenType: 'session',
              originalIdentifier: auth.value!
            },
            expiresAt: new Date(Date.now() + 10 * 60 * 1000).toISOString(),
            sessionExpiresAt: result.user.expiresAt,
            ipAddress: securityData.ipAddress,
            userAgent: securityData.userAgent,
            userDevice: securityData.userDevice,
            lastValidated: new Date().toISOString()
          });
        }
      }

      // If successful, set user in context
      if (result.success && result.user) {
        c.set('user', result.user);
        c.set('authResult', result);

        const cacheInfo = fromEnhancedCache ? ` (enhanced cache, mode: ${authConfig.VALIDATION_MODE})` : result.fromCache ? ' (cache)' : ' (backend)';
        console.log(`👤 Optional auth success: ${result.user.id} (${result.user.userType}) via ${auth.source || 'unknown'}${cacheInfo}`);
      } else {
        console.log(`👤 Optional auth failed via ${auth.source || 'unknown'}: ${result.error || 'unknown error'}`);
      }
    } catch (error) {
      // Log but don't fail - this is optional auth
      console.warn(`Optional auth failed via ${auth.source || 'unknown'}:`, error);
    }

    await next();
  };
}

/**
 * Rate limiting by user type
 */
export function rateLimitByUserType() {
  return async (c: Context, next: Next) => {
    const user = c.get('user');
    const ip = c.req.header('CF-Connecting-IP') || c.req.header('x-forwarded-for') || 'unknown';
    
    // Different rate limits based on user type
    const rateLimits = {
      admin: { requests: 1000, window: 15 * 60 * 1000 }, // 1000 req/15min
      user: { requests: 500, window: 15 * 60 * 1000 },   // 500 req/15min
      guest: { requests: 100, window: 15 * 60 * 1000 },  // 100 req/15min
      anonymous: { requests: 50, window: 15 * 60 * 1000 } // 50 req/15min
    };

    const userType = user?.userType || 'anonymous';
    const limit = rateLimits[userType as keyof typeof rateLimits] || rateLimits.anonymous;

    // TODO: Implement actual rate limiting logic here
    // This would integrate with your existing rate limiter
    
    console.log(`🚦 Rate limit check: ${userType} from ${ip} - limit: ${limit.requests}/${limit.window}ms`);

    await next();
  };
}

// Export helper functions
export { extractAuthToken, extractQueryToken, logAuthAttempt };
