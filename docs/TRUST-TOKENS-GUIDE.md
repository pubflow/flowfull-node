# 🔐 Trust Tokens (PASETO) - Secure Cryptographic Tokens

**Developer-Friendly Guide to PASETO Tokens in Flowfull**

---

## 👋 What are Trust Tokens?

Trust Tokens are **cryptographically secure tokens** used for:

- 📧 **Email verification** - Verify user emails securely
- 🔑 **Password reset** - Secure password recovery links
- 👥 **Invitations** - Invite users to organizations/teams
- 🎫 **API access** - Temporary API access tokens
- ✅ **One-time actions** - Secure single-use tokens

### Why PASETO Instead of JWT?

| Feature | JWT | PASETO |
|---------|-----|--------|
| **Security** | ⚠️ Algorithm confusion attacks | ✅ No algorithm choice |
| **Encryption** | ❌ Not built-in | ✅ Built-in encryption |
| **Simplicity** | ⚠️ Complex configuration | ✅ Simple API |
| **Modern Crypto** | ⚠️ Old algorithms | ✅ Ed25519, XChaCha20 |

**PASETO = Platform-Agnostic SEcurity TOkens**

---

## 🏗️ How Trust Tokens Work

```
┌─────────────────────────────────────────────────────────┐
│                  TRUST TOKEN FLOW                        │
├─────────────────────────────────────────────────────────┤
│                                                          │
│  1️⃣ Generate Token                                      │
│     └─ Server creates token with Ed25519 private key   │
│                                                          │
│  2️⃣ Send to User                                        │
│     └─ Email, SMS, or API response                     │
│                                                          │
│  3️⃣ User Clicks Link                                    │
│     └─ Token sent back to server                       │
│                                                          │
│  4️⃣ Validate Token (6 Security Layers)                 │
│     ├─ Layer 1: PASETO signature (Ed25519)             │
│     ├─ Layer 2: Expiration check                       │
│     ├─ Layer 3: Redis status check                     │
│     ├─ Layer 4: Database status check                  │
│     ├─ Layer 5: User ownership check                   │
│     └─ Layer 6: Resource validation                    │
│                                                          │
│  5️⃣ Consume Token                                       │
│     └─ Mark as used, perform action                    │
│                                                          │
└─────────────────────────────────────────────────────────┘
```

---

## 🚀 Quick Start

### 1. Install Dependencies

```bash
bun add paseto
```

### 2. Generate Key Pair

```bash
# Generate Ed25519 key pair
bun run scripts/generate-paseto-keys.ts
```

**Output**:
```
✅ PASETO Keys Generated!

Add to your .env file:

PASETO_PRIVATE_KEY=k4.secret.xxxxx...
PASETO_PUBLIC_KEY=k4.public.xxxxx...
```

### 3. Configure Environment

```env
# PASETO Keys
PASETO_PRIVATE_KEY=k4.secret.your-private-key-here
PASETO_PUBLIC_KEY=k4.public.your-public-key-here

# Token Settings
TOKEN_EXPIRATION=86400  # 24 hours in seconds
```

### 4. Copy Implementation

```bash
# From pubflow-flowfull (complete implementation)
cp ../pubflow-flowfull/src/lib/utils/paseto-invitation-token.ts src/lib/utils/
```

---

## 💡 Real-World Examples

### Example 1: Email Verification

```typescript
import { V4 } from 'paseto';
import { getKeyPair } from './lib/utils/paseto-keys';

// Generate verification token
async function generateEmailVerificationToken(userId: string, email: string) {
  const { privateKey } = getKeyPair();
  
  const payload = {
    userId,
    email,
    type: 'email_verification',
    exp: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString() // 24 hours
  };
  
  const token = await V4.sign(payload, privateKey);
  
  // Store in Redis for tracking
  await redis.set(`email_verify:${userId}`, JSON.stringify({
    status: 'pending',
    email,
    createdAt: new Date().toISOString()
  }), 'EX', 86400);
  
  return token;
}

// Send verification email
async function sendVerificationEmail(userId: string, email: string) {
  const token = await generateEmailVerificationToken(userId, email);
  
  const verificationUrl = `https://your-app.com/verify-email?token=${token}`;
  
  await sendEmail({
    to: email,
    subject: 'Verify your email',
    html: `
      <h1>Welcome!</h1>
      <p>Click the link below to verify your email:</p>
      <a href="${verificationUrl}">Verify Email</a>
    `
  });
}

// Verify email endpoint
app.get('/verify-email', async (c) => {
  const token = c.req.query('token');
  
  if (!token) {
    return c.json({ error: 'Token required' }, 400);
  }
  
  try {
    // Layer 1: Verify PASETO signature
    const { publicKey } = getKeyPair();
    const payload = await V4.verify(token, publicKey);
    
    // Layer 2: Check expiration
    if (new Date(payload.exp) < new Date()) {
      return c.json({ error: 'Token expired' }, 400);
    }
    
    // Layer 3: Check Redis status
    const cached = await redis.get(`email_verify:${payload.userId}`);
    if (!cached) {
      return c.json({ error: 'Token already used or invalid' }, 400);
    }
    
    const data = JSON.parse(cached);
    if (data.status !== 'pending') {
      return c.json({ error: 'Email already verified' }, 400);
    }
    
    // Layer 4: Update database
    await db.updateTable('users')
      .set({ email_verified: true })
      .where('id', '=', payload.userId)
      .execute();
    
    // Layer 5: Mark as used in Redis
    await redis.set(`email_verify:${payload.userId}`, JSON.stringify({
      ...data,
      status: 'verified',
      verifiedAt: new Date().toISOString()
    }), 'EX', 86400);
    
    return c.json({ success: true, message: 'Email verified!' });
    
  } catch (error) {
    return c.json({ error: 'Invalid token' }, 400);
  }
});
```

### Example 2: Password Reset

```typescript
// Generate password reset token
async function generatePasswordResetToken(userId: string, email: string) {
  const { privateKey } = getKeyPair();
  
  const payload = {
    userId,
    email,
    type: 'password_reset',
    exp: new Date(Date.now() + 1 * 60 * 60 * 1000).toISOString() // 1 hour
  };
  
  const token = await V4.sign(payload, privateKey);
  
  // Store in Redis (1 hour expiration)
  await redis.set(`pwd_reset:${userId}`, JSON.stringify({
    status: 'pending',
    email,
    createdAt: new Date().toISOString()
  }), 'EX', 3600);
  
  return token;
}

// Request password reset
app.post('/forgot-password', async (c) => {
  const { email } = await c.req.json();
  
  // Find user
  const user = await db.selectFrom('users')
    .where('email', '=', email.toLowerCase())
    .select(['id', 'email'])
    .executeTakeFirst();
  
  if (!user) {
    // Don't reveal if email exists
    return c.json({ success: true, message: 'If email exists, reset link sent' });
  }
  
  // Generate token
  const token = await generatePasswordResetToken(user.id, user.email);
  
  // Send email
  const resetUrl = `https://your-app.com/reset-password?token=${token}`;
  
  await sendEmail({
    to: user.email,
    subject: 'Reset your password',
    html: `
      <h1>Password Reset</h1>
      <p>Click the link below to reset your password:</p>
      <a href="${resetUrl}">Reset Password</a>
      <p>This link expires in 1 hour.</p>
    `
  });
  
  return c.json({ success: true, message: 'If email exists, reset link sent' });
});

// Reset password endpoint
app.post('/reset-password', async (c) => {
  const { token, newPassword } = await c.req.json();
  
  try {
    // Validate token (6 layers)
    const { publicKey } = getKeyPair();
    const payload = await V4.verify(token, publicKey);
    
    if (new Date(payload.exp) < new Date()) {
      return c.json({ error: 'Token expired' }, 400);
    }
    
    const cached = await redis.get(`pwd_reset:${payload.userId}`);
    if (!cached || JSON.parse(cached).status !== 'pending') {
      return c.json({ error: 'Token already used or invalid' }, 400);
    }
    
    // Hash new password
    const hashedPassword = await hashPassword(newPassword);
    
    // Update database
    await db.updateTable('users')
      .set({ password: hashedPassword })
      .where('id', '=', payload.userId)
      .execute();
    
    // Mark token as used
    await redis.del(`pwd_reset:${payload.userId}`);
    
    return c.json({ success: true, message: 'Password reset successful' });
    
  } catch (error) {
    return c.json({ error: 'Invalid token' }, 400);
  }
});
```

### Example 3: Organization Invitations

```typescript
// Generate invitation token
async function generateInvitationToken(
  organizationId: string,
  invitedEmail: string,
  invitedBy: string,
  role: string
) {
  const { privateKey } = getKeyPair();

  const memberId = nanoid();

  const payload = {
    memberId,
    organizationId,
    invitedEmail,
    invitedBy,
    role,
    type: 'organization_invitation',
    exp: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString() // 7 days
  };

  const token = await V4.sign(payload, privateKey);

  // Store in database
  await db.insertInto('organization_members').values({
    id: memberId,
    organization_id: organizationId,
    email: invitedEmail,
    role,
    status: 'pending',
    invited_by: invitedBy,
    created_at: new Date().toISOString()
  }).execute();

  // Cache in Redis
  await redis.set(`invite:${memberId}`, JSON.stringify({
    status: 'pending',
    organizationId,
    email: invitedEmail
  }), 'EX', 604800); // 7 days

  return { token, memberId };
}

// Accept invitation
app.post('/accept-invite', requireAuth(), async (c) => {
  const { token } = await c.req.json();
  const userId = c.get('user_id');

  try {
    // Validate token (6 layers)
    const { publicKey } = getKeyPair();
    const payload = await V4.verify(token, publicKey);

    // All 6 layers of validation...
    // (See full example in pubflow-flowfull)

    // Accept invitation
    await db.updateTable('organization_members')
      .set({
        user_id: userId,
        status: 'active',
        accepted_at: new Date().toISOString()
      })
      .where('id', '=', payload.memberId)
      .execute();

    return c.json({ success: true });

  } catch (error) {
    return c.json({ error: 'Invalid token' }, 400);
  }
});
```

---

## 🔒 The 6 Security Layers

Trust Tokens use **6 layers of security** to prevent abuse:

### Layer 1: PASETO Signature (Ed25519)

```typescript
// Cryptographic verification
const payload = await V4.verify(token, publicKey);
// ✅ Token signed by our private key
// ❌ Throws error if signature invalid
```

### Layer 2: Expiration Check

```typescript
if (new Date(payload.exp) < new Date()) {
  throw new Error('Token expired');
}
// ✅ Token still valid
// ❌ Token expired
```

### Layer 3: Redis Status Check

```typescript
const cached = await redis.get(`token:${payload.id}`);
if (!cached || cached.status !== 'pending') {
  throw new Error('Token already used');
}
// ✅ Token pending in cache
// ❌ Token already consumed
```

### Layer 4: Database Status Check

```typescript
const record = await db.selectFrom('tokens')
  .where('id', '=', payload.id)
  .executeTakeFirst();

if (!record || record.status !== 'pending') {
  throw new Error('Token invalid');
}
// ✅ Token pending in database
// ❌ Token already used or deleted
```

### Layer 5: User Ownership Check

```typescript
if (payload.userId !== currentUserId) {
  throw new Error('Token not for this user');
}
// ✅ Token belongs to current user
// ❌ Token belongs to different user
```

### Layer 6: Resource Validation

```typescript
const resource = await db.selectFrom('resources')
  .where('id', '=', payload.resourceId)
  .executeTakeFirst();

if (!resource) {
  throw new Error('Resource not found');
}
// ✅ Resource exists
// ❌ Resource deleted
```

---

## 🎯 Best Practices

### ✅ DO

- **Use short expiration times** - 1 hour for password reset, 24 hours for email verification
- **Store token status** in both Redis and database
- **Validate all 6 layers** - Don't skip any
- **Use HTTPS only** - Never send tokens over HTTP
- **Log token usage** - Track generation and consumption
- **Rate limit** - Prevent token generation spam

### ❌ DON'T

- **Reuse tokens** - One token, one use
- **Store tokens in database** - Only store metadata
- **Use long expiration** - Tokens should expire quickly
- **Skip validation layers** - All 6 layers are important
- **Send tokens in URLs** for sensitive actions (use POST body)

---

## 🐛 Troubleshooting

### Token Validation Failed

**Problem**: `Invalid token` error

**Solutions**:
```typescript
// Check key pair matches
const { publicKey, privateKey } = getKeyPair();
console.log('Public Key:', publicKey);
console.log('Private Key:', privateKey);

// Verify token manually
try {
  const payload = await V4.verify(token, publicKey);
  console.log('Payload:', payload);
} catch (error) {
  console.error('Verification failed:', error);
}
```

### Token Expired

**Problem**: Token expires too quickly

**Solutions**:
```typescript
// Increase expiration time
const payload = {
  ...data,
  exp: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString() // 7 days
};
```

### Redis Not Found

**Problem**: Token not found in Redis

**Solutions**:
```bash
# Check Redis connection
redis-cli ping

# Check if key exists
redis-cli GET "token:your-token-id"

# Check TTL
redis-cli TTL "token:your-token-id"
```

---

## 📚 Additional Resources

- **[Core Concepts](CORE-CONCEPTS.md)** - Full architecture guide
- **[HybridCache Guide](HYBRIDCACHE-GUIDE.md)** - Caching implementation
- **[Pubflow Documentation](https://pubflow.com/docs)** - Complete Pubflow guide
- **[PASETO Specification](https://paseto.io)** - Official PASETO docs

---

## 🎉 Summary

Trust Tokens (PASETO) give you:

✅ **Cryptographically secure** - Ed25519 signatures
✅ **6 layers of security** - Comprehensive validation
✅ **Simple API** - Easy to use, hard to misuse
✅ **Modern crypto** - No algorithm confusion attacks
✅ **Production ready** - Battle-tested in Pubflow

**Next Steps**:
1. Generate PASETO key pair
2. Copy implementation from `pubflow-flowfull`
3. Implement email verification
4. Add password reset
5. Create invitation system

🔐 **Ready to build secure token-based features!**
