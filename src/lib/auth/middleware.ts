import { Context, Next } from 'hono';
import { HTTPException } from 'hono/http-exception';
import { getCookie } from 'hono/cookie';
import { bridgeValidator, SessionData } from './bridge-validator';
import { config } from '@/config/environment';

// Extend Hono context to include session data
declare module 'hono' {
  interface ContextVariableMap {
    session: SessionData;
    user_id: string;
    is_guest: boolean;
    guest_data?: any;
    request_body?: any;
  }
}

// Extract session ID from request
function extractSessionId(c: Context): string | null {
  // Try header first
  const headerSessionId = c.req.header(config.SESSION_HEADER_NAME);
  if (headerSessionId) {
    return headerSessionId;
  }

  // Try cookie
  const cookieSessionId = getCookie(c, config.SESSION_COOKIE_NAME);
  if (cookieSessionId) {
    return cookieSessionId;
  }

  return null;
}

// Authentication middleware - requires valid session
export async function authMiddleware(c: Context, next: Next) {
  const sessionId = extractSessionId(c);

  if (!sessionId) {
    throw new HTTPException(401, {
      message: 'Session ID required. Provide via X-Session-ID header or session_id cookie.'
    });
  }

  try {
    const result = await bridgeValidator.validateAndSyncUser(sessionId);

    if (!result.success || !result.session) {
      throw new HTTPException(401, {
        message: result.error || 'Invalid session'
      });
    }

    // Set session data in context
    c.set('session', result.session);
    c.set('user_id', result.session.user_id);
    c.set('is_guest', false);

    await next();
  } catch (error) {
    if (error instanceof HTTPException) {
      throw error;
    }

    console.error('Authentication middleware error:', error);
    throw new HTTPException(500, {
      message: 'Authentication service unavailable'
    });
  }
}

// Optional authentication middleware - allows guest access
export async function optionalAuthMiddleware(c: Context, next: Next) {
  const sessionId = extractSessionId(c);

  if (sessionId) {
    try {
      const result = await bridgeValidator.validateAndSyncUser(sessionId);

      if (result.success && result.session) {
        c.set('session', result.session);
        c.set('user_id', result.session.user_id);
        c.set('is_guest', false);
      }
    } catch (error) {
      console.warn('Optional auth validation failed:', error);
      // Continue without authentication
    }
  }

  // Set default guest state if no valid session
  if (!c.get('session')) {
    c.set('is_guest', true);
  }

  await next();
}

// Guest checkout middleware - validates guest data when required
export async function guestCheckoutMiddleware(c: Context, next: Next) {
  if (!config.GUEST_CHECKOUT_ENABLED) {
    throw new HTTPException(403, {
      message: 'Guest checkout is disabled'
    });
  }

  const isAuthenticated = !!c.get('session');

  if (!isAuthenticated) {
    // Set guest state - validation will happen in the route handler
    c.set('is_guest', true);
  }

  await next();
}

// Separate function to validate guest data after body is parsed
export function validateGuestData(guestData: any): void {
  const errors: string[] = [];

  if (config.GUEST_REQUIRE_EMAIL && !guestData?.email) {
    errors.push('Guest email is required');
  }

  if (config.GUEST_REQUIRE_NAME && !guestData?.name) {
    errors.push('Guest name is required');
  }

  if (config.GUEST_REQUIRE_PHONE && !guestData?.phone) {
    errors.push('Guest phone is required');
  }

  if (errors.length > 0) {
    console.error('Guest data validation errors:', errors);
    throw new HTTPException(400, {
      message: `Guest data validation failed: ${errors.join(', ')}`,
      cause: errors
    });
  }

  // Validate email format if provided
  if (guestData?.email && !isValidEmail(guestData.email)) {
    throw new HTTPException(400, {
      message: 'Invalid email format'
    });
  }
}

// Async function to check guest payment limits
export async function checkGuestPaymentLimits(email: string): Promise<void> {
  if (!email) return;

  try {
    const { getPaymentRepository } = await import('@/lib/database/repositories');
    const paymentRepo = await getPaymentRepository();

    const recentPayments = await paymentRepo.findGuestPayments(email, config.GUEST_MAX_PAYMENTS_PER_EMAIL);

    if (recentPayments.length >= config.GUEST_MAX_PAYMENTS_PER_EMAIL) {
      throw new HTTPException(429, {
        message: `Guest payment limit exceeded. Maximum ${config.GUEST_MAX_PAYMENTS_PER_EMAIL} payments per email.`
      });
    }
  } catch (error) {
    if (error instanceof HTTPException) {
      throw error;
    }
    console.error('Failed to check guest payment limits:', error);
    // Continue without limit check if database is unavailable
  }
}

// Permission middleware - checks user permissions
export function requirePermission(permission: string) {
  return async (c: Context, next: Next) => {
    const session = c.get('session');

    if (!session) {
      throw new HTTPException(401, {
        message: 'Authentication required'
      });
    }

    const userPermissions = session.permissions || [];

    if (!userPermissions.includes(permission) && !userPermissions.includes('admin')) {
      throw new HTTPException(403, {
        message: `Permission required: ${permission}`
      });
    }

    await next();
  };
}

// Organization middleware - ensures user belongs to organization
export function requireOrganization(organizationId?: string) {
  return async (c: Context, next: Next) => {
    const session = c.get('session');

    if (!session) {
      throw new HTTPException(401, {
        message: 'Authentication required'
      });
    }

    const requiredOrgId = organizationId || c.req.param('organizationId');

    if (!requiredOrgId) {
      throw new HTTPException(400, {
        message: 'Organization ID required'
      });
    }

    if (session.organization_id !== requiredOrgId) {
      throw new HTTPException(403, {
        message: 'Access denied: Organization mismatch'
      });
    }

    await next();
  };
}

// Rate limiting middleware for guest users
export function guestRateLimit(requestsPerHour = 10) {
  const guestRequests = new Map<string, { count: number; resetTime: number }>();

  return async (c: Context, next: Next) => {
    const isGuest = c.get('is_guest');

    if (isGuest) {
      const guestData = c.get('guest_data');
      const identifier = guestData?.email || c.req.header('x-forwarded-for') || 'unknown';

      const now = Date.now();
      const hourMs = 60 * 60 * 1000;

      const current = guestRequests.get(identifier);

      if (current) {
        if (now > current.resetTime) {
          // Reset counter
          guestRequests.set(identifier, { count: 1, resetTime: now + hourMs });
        } else if (current.count >= requestsPerHour) {
          throw new HTTPException(429, {
            message: 'Rate limit exceeded for guest users'
          });
        } else {
          current.count++;
        }
      } else {
        guestRequests.set(identifier, { count: 1, resetTime: now + hourMs });
      }
    }

    await next();
  };
}

// Session validation middleware - validates session without requiring it
export async function validateSessionMiddleware(c: Context, next: Next) {
  const sessionId = extractSessionId(c);

  if (sessionId) {
    try {
      const result = await bridgeValidator.validateSession(sessionId);

      if (result.success && result.session) {
        c.set('session', result.session);
        c.set('user_id', result.session.user_id);
        c.set('is_guest', false);
      } else {
        // Invalid session - clear any existing session data
        c.set('is_guest', true);
      }
    } catch (error) {
      console.warn('Session validation failed:', error);
      c.set('is_guest', true);
    }
  } else {
    c.set('is_guest', true);
  }

  await next();
}

// Helper function to validate email format
function isValidEmail(email: string): boolean {
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return emailRegex.test(email);
}

// Helper function to get user context
export function getUserContext(c: Context): {
  isAuthenticated: boolean;
  isGuest: boolean;
  userId?: string;
  organizationId?: string;
  session?: SessionData;
  guestData?: any;
} {
  const session = c.get('session');
  return {
    isAuthenticated: !!session,
    isGuest: c.get('is_guest') || false,
    userId: c.get('user_id'),
    organizationId: session?.organization_id,
    session,
    guestData: c.get('guest_data')
  };
}

// Middleware to log authentication events
export async function authLoggingMiddleware(c: Context, next: Next) {
  const startTime = Date.now();
  const sessionId = extractSessionId(c);

  try {
    await next();

    if (config.DEV_LOG_REQUESTS) {
      const duration = Date.now() - startTime;
      const userContext = getUserContext(c);

      console.log(`Auth: ${c.req.method} ${c.req.path}`, {
        session_id: sessionId ? sessionId.substring(0, 8) + '...' : null,
        authenticated: userContext.isAuthenticated,
        is_guest: userContext.isGuest,
        user_id: userContext.userId,
        duration_ms: duration
      });
    }
  } catch (error) {
    if (config.DEV_LOG_REQUESTS) {
      console.error(`Auth Error: ${c.req.method} ${c.req.path}`, {
        session_id: sessionId ? sessionId.substring(0, 8) + '...' : null,
        error: error instanceof Error ? error.message : 'Unknown error'
      });
    }
    throw error;
  }
}
