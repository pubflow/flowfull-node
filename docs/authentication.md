# Authentication & Flowless Integration

## Overview

Bridge-Payments integrates securely with your Flowless backend to validate user sessions and maintain authentication state across services. This document explains the authentication architecture and implementation details.

## Authentication Flow

### Session Validation Process

```
┌─────────────┐    ┌─────────────┐    ┌─────────────┐
│   Client    │    │   Bridge    │    │  Flowless   │
│             │    │  Payments   │    │             │
└─────────────┘    └─────────────┘    └─────────────┘
       │                  │                  │
       │ Request +        │                  │
       │ session_id       │                  │
       ├─────────────────►│                  │
       │                  │ Validate Session │
       │                  ├─────────────────►│
       │                  │ User Data        │
       │                  │◄─────────────────┤
       │                  │ Process Request  │
       │                  │                  │
       │ Response         │                  │
       │◄─────────────────┤                  │
```

## Flowless Integration Setup

### 1. Environment Configuration

```env
# Flowless Integration
FLOWLESS_API_URL=https://api.flowless.com
BRIDGE_VALIDATION_SECRET=your-shared-secret-key
BRIDGE_VALIDATION_TIMEOUT=5000
BRIDGE_RETRY_ATTEMPTS=3
```

### 2. Shared Secret Configuration

The shared secret must be configured in both systems:

**Bridge-Payments (.env):**
```env
BRIDGE_VALIDATION_SECRET=your-super-secret-key-here
```

**Flowless (.env):**
```env
BRIDGE_VALIDATION_SECRET=your-super-secret-key-here
```

### 3. Flowless Validation Endpoint

Add this endpoint to your Flowless backend:

```typescript
// flowless/src/routes/auth.ts
auth.post('/bridge/validate', async (c) => {
  const bridgeSecret = c.req.header('X-Bridge-Secret');
  const configuredSecret = c.env.BRIDGE_VALIDATION_SECRET;

  // Validate shared secret
  if (!bridgeSecret || bridgeSecret !== configuredSecret) {
    return c.json({ error: 'Unauthorized bridge request' }, 401);
  }

  const { sessionId } = await c.req.json();
  
  if (!sessionId) {
    return c.json({ error: 'Session ID required' }, 400);
  }

  // Use your existing SessionManager
  const session = await SessionManager.validateSession(sessionId);
  
  if (!session) {
    return c.json({ error: 'Invalid session' }, 401);
  }

  // Get user data
  const user = await getDb().select()
    .from(users)
    .where(eq(users.id, session.userId))
    .get();

  if (!user) {
    return c.json({ error: 'User not found' }, 404);
  }

  return c.json({
    success: true,
    user: {
      id: user.id,
      email: user.email,
      name: user.name,
      userType: user.userType,
      paymentUserId: user.id // Use same ID or create mapping
    },
    session: {
      id: session.id,
      expiresAt: session.expiresAt
    }
  });
});
```

## Bridge-Payments Authentication Implementation

### 1. Bridge Validator

```typescript
// src/lib/auth/bridge-validator.ts
import { config } from '@/config/environment';

export class BridgeValidator {
  static async validateSession(sessionId: string): Promise<User | null> {
    try {
      const response = await fetch(`${config.flowlessApiUrl}/auth/bridge/validate`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Bridge-Secret': config.bridgeValidationSecret
        },
        body: JSON.stringify({ sessionId }),
        signal: AbortSignal.timeout(config.bridgeValidationTimeout)
      });

      if (!response.ok) {
        console.warn(`Session validation failed: ${response.status}`);
        return null;
      }
      
      const data = await response.json();
      return data.user || null;
    } catch (error) {
      console.error('Bridge validation error:', error);
      return null;
    }
  }

  static async validateSessionWithRetry(sessionId: string): Promise<User | null> {
    let lastError: Error | null = null;
    
    for (let attempt = 1; attempt <= config.bridgeRetryAttempts; attempt++) {
      try {
        const result = await this.validateSession(sessionId);
        if (result) return result;
        
        // If validation returns null (invalid session), don't retry
        return null;
      } catch (error) {
        lastError = error as Error;
        
        if (attempt < config.bridgeRetryAttempts) {
          // Exponential backoff
          const delay = Math.pow(2, attempt - 1) * 1000;
          await new Promise(resolve => setTimeout(resolve, delay));
        }
      }
    }
    
    console.error(`Session validation failed after ${config.bridgeRetryAttempts} attempts:`, lastError);
    return null;
  }
}
```

### 2. Authentication Middleware

```typescript
// src/lib/auth/middleware.ts
import { Context, Next } from 'hono';
import { BridgeValidator } from './bridge-validator';
import { UserSync } from '@/lib/users/sync';

export const authMiddleware = () => {
  return async (c: Context, next: Next) => {
    const sessionId = getSessionId(c);
    
    if (!sessionId) {
      return c.json({ error: 'Authentication required' }, 401);
    }

    // Validate session with Flowless
    const flowlessUser = await BridgeValidator.validateSessionWithRetry(sessionId);
    
    if (!flowlessUser) {
      return c.json({ error: 'Invalid or expired session' }, 401);
    }

    // Sync/create payment user
    const paymentUserId = await UserSync.ensurePaymentUser(flowlessUser);
    
    // Add to context
    c.set('flowlessUser', flowlessUser);
    c.set('paymentUserId', paymentUserId);
    c.set('user', { ...flowlessUser, paymentUserId });
    c.set('isAuthenticated', true);
    c.set('isGuest', false);
    
    await next();
  };
};

export const flexibleAuthMiddleware = () => {
  return async (c: Context, next: Next) => {
    const sessionId = getSessionId(c);
    const config = getCheckoutConfig();
    
    // Try authentication first
    if (sessionId) {
      try {
        const flowlessUser = await BridgeValidator.validateSession(sessionId);
        if (flowlessUser) {
          const paymentUserId = await UserSync.ensurePaymentUser(flowlessUser);
          c.set('user', { ...flowlessUser, paymentUserId });
          c.set('isAuthenticated', true);
          c.set('isGuest', false);
          await next();
          return;
        }
      } catch (error) {
        console.log('Auth failed, checking guest options');
      }
    }
    
    // Fall back to guest checkout if enabled
    if (!config.guestCheckoutEnabled) {
      return c.json({ error: 'Authentication required' }, 401);
    }
    
    c.set('user', null);
    c.set('isAuthenticated', false);
    c.set('isGuest', true);
    
    await next();
  };
};

function getSessionId(c: Context): string | null {
  // Try header first
  const headerSessionId = c.req.header('X-Session-ID');
  if (headerSessionId) return headerSessionId;
  
  // Try cookie
  const cookieSessionId = c.req.cookie('session_id');
  if (cookieSessionId) return cookieSessionId;
  
  // Try query parameter (for webhooks or special cases)
  const querySessionId = c.req.query('session_id');
  if (querySessionId) return querySessionId;
  
  return null;
}
```

### 3. User Synchronization

```typescript
// src/lib/users/sync.ts
import { db } from '@/lib/database/connection';
import { nanoid } from 'nanoid';

export class UserSync {
  static async ensurePaymentUser(flowlessUser: any): Promise<string> {
    // Check if payment user already exists
    let paymentUser = await db.selectFrom('payment_users')
      .selectAll()
      .where('flowless_user_id', '=', flowlessUser.id)
      .executeTakeFirst();
    
    if (!paymentUser) {
      // Create new payment user
      paymentUser = await db.insertInto('payment_users')
        .values({
          id: nanoid(),
          flowless_user_id: flowlessUser.id,
          email: flowlessUser.email,
          name: flowlessUser.name,
          user_type: flowlessUser.userType || 'individual',
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString()
        })
        .returningAll()
        .executeTakeFirst();
    } else {
      // Update existing user data
      paymentUser = await db.updateTable('payment_users')
        .set({
          email: flowlessUser.email,
          name: flowlessUser.name,
          user_type: flowlessUser.userType || 'individual',
          updated_at: new Date().toISOString()
        })
        .where('id', '=', paymentUser.id)
        .returningAll()
        .executeTakeFirst();
    }
    
    return paymentUser!.id;
  }

  static async getPaymentUser(flowlessUserId: string): Promise<any | null> {
    return await db.selectFrom('payment_users')
      .selectAll()
      .where('flowless_user_id', '=', flowlessUserId)
      .executeTakeFirst();
  }
}
```

## Session Management

### Session ID Sources

Bridge-Payments accepts session IDs from multiple sources (in order of priority):

1. **HTTP Header**: `X-Session-ID: session_abc123`
2. **Cookie**: `session_id=session_abc123`
3. **Query Parameter**: `?session_id=session_abc123`

### Session Caching

To improve performance, session validation results can be cached:

```typescript
// src/lib/auth/session-cache.ts
import { LRUCache } from 'lru-cache';

const sessionCache = new LRUCache<string, any>({
  max: 1000,
  ttl: 5 * 60 * 1000 // 5 minutes
});

export class SessionCache {
  static get(sessionId: string): any | null {
    return sessionCache.get(sessionId) || null;
  }
  
  static set(sessionId: string, userData: any): void {
    sessionCache.set(sessionId, userData);
  }
  
  static delete(sessionId: string): void {
    sessionCache.delete(sessionId);
  }
  
  static clear(): void {
    sessionCache.clear();
  }
}
```

## Error Handling

### Authentication Errors

```typescript
// Common authentication error responses
{
  "error": {
    "code": "AUTH_REQUIRED",
    "message": "Authentication required",
    "details": {
      "session_sources": ["header", "cookie", "query"],
      "guest_checkout_available": true
    }
  }
}

{
  "error": {
    "code": "INVALID_SESSION",
    "message": "Invalid or expired session",
    "details": {
      "session_id": "sess_***123",
      "validation_failed": true
    }
  }
}

{
  "error": {
    "code": "BRIDGE_VALIDATION_FAILED",
    "message": "Unable to validate session with authentication service",
    "details": {
      "flowless_available": false,
      "retry_after": 30
    }
  }
}
```

## Security Considerations

### Shared Secret Security

- Use a strong, randomly generated secret (minimum 32 characters)
- Rotate secrets regularly
- Store secrets securely (environment variables, not code)
- Use different secrets for different environments

### Network Security

- Always use HTTPS in production
- Implement request timeouts
- Use connection pooling for efficiency
- Monitor for unusual authentication patterns

### Session Security

- Validate session expiration
- Implement session invalidation
- Log authentication events
- Rate limit authentication attempts

## Testing Authentication

### Unit Tests

```typescript
// tests/auth/bridge-validator.test.ts
import { BridgeValidator } from '@/lib/auth/bridge-validator';

describe('BridgeValidator', () => {
  it('should validate valid session', async () => {
    const user = await BridgeValidator.validateSession('valid_session_id');
    expect(user).toBeTruthy();
    expect(user.id).toBeDefined();
  });

  it('should return null for invalid session', async () => {
    const user = await BridgeValidator.validateSession('invalid_session_id');
    expect(user).toBeNull();
  });
});
```

### Integration Tests

```typescript
// tests/integration/auth.test.ts
import { testClient } from '@/tests/helpers';

describe('Authentication Integration', () => {
  it('should allow authenticated requests', async () => {
    const response = await testClient
      .post('/bridge-payment/payments')
      .set('X-Session-ID', 'valid_session')
      .send({ amount: 1000 });
      
    expect(response.status).toBe(200);
  });

  it('should reject unauthenticated requests', async () => {
    const response = await testClient
      .post('/bridge-payment/payments')
      .send({ amount: 1000 });
      
    expect(response.status).toBe(401);
  });
});
```

## Next Steps

- **[API Reference](./api-reference.md)** - Complete API documentation
- **[Database Schema](./database.md)** - Database design details
- **[Provider Setup](./providers/)** - Payment provider configuration
- **[Examples](./examples/)** - Authentication examples
