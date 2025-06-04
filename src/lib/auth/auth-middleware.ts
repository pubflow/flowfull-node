// Secure Authentication Middleware
import { Context, Next } from 'hono';
import { HTTPException } from 'hono/http-exception';
import { authService, type AuthValidationResult } from './auth-service.js';
import type { CachedUser } from './user-cache.js';

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
 * Extract authentication token from request
 */
function extractAuthToken(c: Context): { type: 'session' | 'token' | null; value: string | null } {
  const authHeader = c.req.header('Authorization');
  
  if (!authHeader) {
    return { type: null, value: null };
  }

  // Bearer token (session)
  if (authHeader.startsWith('Bearer ')) {
    const sessionId = authHeader.substring(7).trim();
    return sessionId ? { type: 'session', value: sessionId } : { type: null, value: null };
  }

  // Token authentication
  if (authHeader.startsWith('Token ')) {
    const token = authHeader.substring(6).trim();
    return token ? { type: 'token', value: token } : { type: null, value: null };
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
function logAuthAttempt(c: Context, result: AuthValidationResult, authType: string) {
  const ip = c.req.header('CF-Connecting-IP') || c.req.header('x-forwarded-for') || 'unknown';
  const userAgent = c.req.header('User-Agent') || 'unknown';
  const path = c.req.path;

  if (result.success && result.user) {
    console.log(`✅ Auth success: ${authType} user=${result.user.id} type=${result.user.userType} ip=${ip} path=${path} cache=${result.fromCache}`);
  } else {
    console.warn(`❌ Auth failed: ${authType} ip=${ip} path=${path} error=${result.error} ua=${userAgent.substring(0, 50)}`);
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

    logAuthAttempt(c, result, `admin-${auth.type}`);

    if (!result.success || !result.user) {
      throw new HTTPException(401, {
        message: 'Invalid authentication credentials'
      });
    }

    // Check admin privileges
    if (result.user.userType !== 'admin') {
      console.warn(`🚨 Non-admin user attempted admin access: ${result.user.id} (${result.user.userType})`);
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
    // Try header authentication first
    let auth = extractAuthToken(c);
    let authSource = 'header';

    // If no header auth, try query parameter (for GET requests)
    if (!auth.type && c.req.method === 'GET') {
      const queryToken = extractQueryToken(c);
      if (queryToken) {
        auth = { type: 'token', value: queryToken };
        authSource = 'query';
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

    logAuthAttempt(c, result, `user-${auth.type}-${authSource}`);

    if (!result.success || !result.user) {
      throw new HTTPException(401, {
        message: 'Invalid authentication credentials'
      });
    }

    // Check user type permissions
    if (!authService.hasUserType(result.user, allowedUserTypes)) {
      console.warn(`🚨 User type not allowed: ${result.user.id} (${result.user.userType}) for types: ${allowedUserTypes.join(',')}`);
      throw new HTTPException(403, {
        message: 'Insufficient privileges for this resource'
      });
    }

    // Ownership check if required
    if (ownershipCheck) {
      const resourceUserId = c.req.param('userId') || c.req.param('id');
      if (resourceUserId && !authService.canAccessResource(result.user, resourceUserId)) {
        console.warn(`🚨 Ownership check failed: user=${result.user.id} resource=${resourceUserId}`);
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
 * Optional authentication middleware (for public endpoints with optional user context)
 */
export function optionalAuth() {
  return async (c: Context, next: Next) => {
    // Try header authentication
    let auth = extractAuthToken(c);

    // Try query parameter for GET requests
    if (!auth.type && c.req.method === 'GET') {
      const queryToken = extractQueryToken(c);
      if (queryToken) {
        auth = { type: 'token', value: queryToken };
      }
    }

    // If no authentication, continue without user
    if (!auth.type) {
      await next();
      return;
    }

    // Try to validate authentication
    try {
      let result: AuthValidationResult;
      
      if (auth.type === 'session') {
        result = await authService.validateSession(auth.value!);
      } else if (auth.type === 'token') {
        result = await authService.validateToken(auth.value!);
      } else {
        await next();
        return;
      }

      // If successful, set user in context
      if (result.success && result.user) {
        c.set('user', result.user);
        c.set('authResult', result);
        console.log(`👤 Optional auth success: ${result.user.id} (${result.user.userType})`);
      }
    } catch (error) {
      // Log but don't fail - this is optional auth
      console.warn('Optional auth failed:', error);
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
