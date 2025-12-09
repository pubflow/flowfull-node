import { getDatabase } from '@/lib/database/connection';
import { sql } from 'kysely';
import type { Context, Next } from 'hono';

interface RateLimitConfig {
  windowMs: number;
  max: number;
  blockDuration?: number;
}

export class RateLimiter {
  private config: RateLimitConfig;

  constructor(config: RateLimitConfig = { windowMs: 10 * 60 * 1000, max: 10, blockDuration: 60 * 60 * 1000 }) {
    this.config = config;
  }

  private getKey(ip: string, action: string): string {
    // ✅ FIX: Use FULL IP for rate limiting to avoid blocking entire networks
    // Sanitization is ONLY for logging privacy, NOT for identification
    return `${ip}:${action}`;
  }

  /**
   * Sanitize IP for logging ONLY (hide last octet for privacy)
   * ⚠️ WARNING: This should NEVER be used for rate limit keys!
   * Using sanitized IPs for rate limiting blocks entire networks (e.g., 192.168.1.***)
   * @param ip - IP address
   * @returns sanitized IP for logging purposes only
   */
  private sanitizeIP(ip: string): string {
    if (ip.includes(':')) {
      // IPv6 - show first 4 groups
      const parts = ip.split(':');
      return parts.slice(0, 4).join(':') + ':***';
    } else {
      // IPv4 - hide last octet
      const parts = ip.split('.');
      if (parts.length === 4) {
        return parts.slice(0, 3).join('.') + '.***';
      }
    }
    return 'unknown';
  }

  async check(ip: string, action: string): Promise<{ allowed: boolean; remaining: number }> {
    const key = this.getKey(ip, action);
    const sanitizedIP = this.sanitizeIP(ip);
    const now = new Date();

    try {
      const db = await getDatabase();
      
      // Clean up expired entries first
      const expiredTime = now.toISOString();
      await db.deleteFrom('rate_limits')
        .where('key', '=', key)
        .where('expires', '<', expiredTime)
        .execute();

      const limit = await db.selectFrom('rate_limits')
        .selectAll()
        .where('key', '=', key)
        .executeTakeFirst();

      if (!limit) {
        // First request from this IP for this action
        const expiresAt = new Date(now.getTime() + this.config.windowMs);
        await db.insertInto('rate_limits').values({
          key,
          points: this.config.max - 1,
          expires: expiresAt.toISOString()
        }).execute();

        console.log(`[RateLimit] New ${action} request from ${sanitizedIP}: 1/${this.config.max} attempts`);
        return { allowed: true, remaining: this.config.max - 1 };
      }

      if (limit.points <= 0) {
        const remainingTime = Math.ceil((new Date(limit.expires).getTime() - now.getTime()) / 1000 / 60);
        console.log(`[RateLimit] ${action} blocked for ${sanitizedIP}: 0/${this.config.max} attempts, ${remainingTime}m remaining`);
        return { allowed: false, remaining: 0 };
      }

      // Decrement points
      await db.updateTable('rate_limits')
        .set({ points: limit.points - 1 })
        .where('key', '=', key)
        .execute();

      const used = this.config.max - limit.points + 1;
      console.log(`[RateLimit] ${action} request from ${sanitizedIP}: ${used}/${this.config.max} attempts`);

      return { allowed: true, remaining: limit.points - 1 };

    } catch (error) {
      console.error(`[RateLimit] Error checking rate limit for ${sanitizedIP}:`, error);
      // On error, allow the request but log it
      return { allowed: true, remaining: this.config.max };
    }
  }

  async isBlocked(ip: string): Promise<boolean> {
    const key = this.getKey(ip, 'any');
    try {
      const db = await getDatabase();
      const limit = await db.selectFrom('rate_limits')
        .selectAll()
        .where('key', '=', key)
        .executeTakeFirst();

      return limit ? limit.points <= 0 : false;
    } catch (error) {
      console.error('[RateLimit] Error checking if blocked:', error);
      return false;
    }
  }
}

/**
 * Get client IP from Hono context
 * @param c - Hono context
 * @returns client IP address
 */
export function getClientIP(c: Context): string {
  // Try various headers in order of preference
  const headers = [
    'CF-Connecting-IP',      // Cloudflare
    'X-Forwarded-For',       // Standard proxy header
    'X-Real-IP',             // Nginx
    'X-Client-IP',           // Apache
    'X-Forwarded',           // General
    'Forwarded-For',         // RFC 7239
    'Forwarded'              // RFC 7239
  ];

  for (const header of headers) {
    const value = c.req.header(header);
    if (value) {
      // X-Forwarded-For can contain multiple IPs, take the first one
      const ip = value.split(',')[0].trim();
      if (ip && ip !== 'unknown') {
        return ip;
      }
    }
  }

  // Fallback to connection info
  return c.env?.CF_CONNECTING_IP || 'unknown';
}

/**
 * Create rate limiting middleware for Hono
 * @param action - Action name for rate limiting (e.g., 'health_detailed')
 * @param config - Rate limiting configuration
 * @returns Hono middleware function
 */
export function createRateLimitMiddleware(
  action: string = 'api_request',
  config?: RateLimitConfig
): (c: Context, next: Next) => Promise<Response | void> {
  const rateLimiter = new RateLimiter(config);

  return async (c: Context, next: Next) => {
    const ip = getClientIP(c);

    try {
      const result = await rateLimiter.check(ip, action);

      if (!result.allowed) {
        return c.json({
          success: false,
          error: 'rate_limit_exceeded',
          message: 'Too many requests. Please try again later.',
          remaining: result.remaining
        }, 429);
      }

      // Add rate limit info to response headers
      c.header('X-RateLimit-Limit', config?.max?.toString() || '10');
      c.header('X-RateLimit-Remaining', result.remaining.toString());

      await next();

    } catch (error) {
      console.error(`[RateLimit] Middleware error for ${action}:`, error);
      // On error, allow the request to continue
      await next();
    }
  };
}

// Create specific rate limiters for different actions
export const healthDetailedRateLimit = createRateLimitMiddleware('health_detailed', {
  windowMs: 5 * 60 * 1000,  // 5 minutes
  max: 10,                  // 10 requests per 5 minutes
  blockDuration: 30 * 60 * 1000 // 30 minutes block
});

export const healthMetricsRateLimit = createRateLimitMiddleware('health_metrics', {
  windowMs: 5 * 60 * 1000,  // 5 minutes
  max: 20,                  // 20 requests per 5 minutes
  blockDuration: 30 * 60 * 1000 // 30 minutes block
});

export const adminActionRateLimit = createRateLimitMiddleware('admin_action', {
  windowMs: 10 * 60 * 1000, // 10 minutes
  max: 50,                  // 50 admin actions per 10 minutes
  blockDuration: 60 * 60 * 1000 // 1 hour block
});
