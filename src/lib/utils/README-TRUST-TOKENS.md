# Trust Tokens System (PASETO v4)

Ultra-secure, **general-purpose** token system using PASETO v4 (Ed25519 signatures). Use it for **ANY** secure token needs in your application.

## What is PASETO?

**PASETO** (Platform-Agnostic Security Tokens) is a modern alternative to JWT with better security defaults:

- **Cryptographically signed** with Ed25519 (impossible to forge)
- **No algorithm confusion** attacks (unlike JWT)
- **Built-in expiration** and timestamp validation
- **Versioned protocol** for future-proof security

## Use Cases

Trust Tokens in Flowfull can be used for **ANY secure token need**:

✅ **Email Verification** - Verify user email addresses
✅ **Password Reset** - Secure password reset links
✅ **Invitations** - Organization/team invitations
✅ **Magic Links** - Passwordless authentication
✅ **API Keys** - Short-lived API access tokens
✅ **2FA Tokens** - Two-factor authentication codes
✅ **Phone Verification** - Verify phone numbers
✅ **Transaction Approval** - Approve sensitive transactions
✅ **Account Deletion** - Confirm account deletion
✅ **Custom Actions** - Any scenario requiring secure, single-use tokens

## Features

- **Zero Database Storage** - Tokens are NOT stored in database (only metadata in cache)
- **Flexible Expiration** - YOU decide the TTL (via env or function parameter)
- **Single-Use Enforcement** - Tokens can only be used once
- **6 Security Layers** - Multiple validation checks
- **Flexible Payload** - Store any data you need in the token (including custom metadata)
- **Type-Agnostic** - Use ANY token type you want (not limited to predefined types)

## Quick Start

### 1. Generate PASETO Key

```bash
bun run scripts/generate-paseto-key.ts
```

Copy the output to your `.env` file:

```env
PASETO_PRIVATE_KEY=MC4CAQAwBQYDK2VwBCIEIE...

# Optional: Configure expiration (in hours)
TOKEN_TTL_HOURS=168  # Default: 7 days

# Optional: Per-type expiration
TOKEN_EMAIL_VERIFICATION_TTL_HOURS=24
TOKEN_PASSWORD_RESET_TTL_HOURS=1
TOKEN_INVITATION_TTL_HOURS=168
```

### 2. Generate a Token

```typescript
import { generateTrustToken } from '@/lib/utils/trust-tokens';

// Email verification (uses TOKEN_EMAIL_VERIFICATION_TTL_HOURS or default)
const token = await generateTrustToken({
  type: 'email_verification',
  userId: user.id,
  email: user.email
});

// Password reset with custom expiration (1 hour)
const resetToken = await generateTrustToken({
  type: 'password_reset',
  userId: user.id
}, 1);

// Custom token with metadata
const customToken = await generateTrustToken({
  type: 'approve_transaction',
  userId: user.id,
  metadata: {
    transactionId: 'tx_123',
    amount: 1000,
    currency: 'USD'
  }
});

// Send via email
await sendEmail(user.email, `Verify your email: ${token}`);
```

### 3. Validate a Token

```typescript
import { validateTrustToken, markTokenAsUsed } from '@/lib/utils/trust-tokens';

// Validate token
const result = await validateTrustToken(token);

if (result.valid && result.payload) {
  // Token is valid - perform action
  await verifyUserEmail(result.payload.userId);

  // Mark as used (prevents reuse)
  await markTokenAsUsed(result.payload.userId);

  return { success: true };
} else {
  return { success: false, error: result.error };
}
```

## Token Types

The `type` field in the payload can be **ANYTHING** you need:

```typescript
type: 'email_verification'    // Email verification
type: 'password_reset'        // Password reset
type: 'invitation'            // Organization/team invitation
type: 'magic_link'            // Passwordless login
type: 'api_key'               // API access token
type: 'phone_verification'    // Phone number verification
type: 'approve_transaction'   // Transaction approval
type: 'confirm_delete'        // Account deletion confirmation
type: 'custom_action'         // Any custom use case you create!
```

**The system is completely flexible** - you're not limited to predefined types!

## Security Layers

PASETO tokens go through 6 layers of validation:

1. **PASETO Signature Verification** - Ed25519 cryptographic signature
2. **Expiration Check** - Token must not be expired
3. **Redis Status Check** - Token must exist in cache and not be used
4. **Database Status Check** - Application-specific validation (optional)
5. **User Ownership** - Verify user owns the resource (optional)
6. **Resource Validation** - Verify resource exists and is valid (optional)

## API Reference

### `generateTrustToken(data, expirationHours?)`

Generate a new Trust Token (PASETO v4).

```typescript
// Basic usage (uses env TTL)
const token = await generateTrustToken({
  type: 'email_verification',  // Required: token type (ANY string)
  userId: 'user_123',          // Required: user ID
  email: 'user@example.com',   // Optional: email
  memberId: 'member_456',      // Optional: member ID
  resourceId: 'org_789',       // Optional: resource ID
  role: 'admin',               // Optional: role
  invitedBy: 'user_000',       // Optional: inviter ID
  metadata: {                  // Optional: custom data
    key: 'value'
  }
});

// With custom expiration (1 hour)
const token = await generateTrustToken({
  type: 'password_reset',
  userId: 'user_123'
}, 1);
```

### `validateTrustToken(token)`

Validate a Trust Token.

```typescript
const result = await validateTrustToken(token);

if (result.valid) {
  console.log('Token is valid:', result.payload);
} else {
  console.error('Token is invalid:', result.error);
}
```

### `markTokenAsUsed(userId, auditTTL?)`

Mark a token as used (single-use enforcement).

```typescript
// Default audit TTL (24 hours)
await markTokenAsUsed(userId);

// Custom audit TTL (7 days)
await markTokenAsUsed(userId, 7 * 24 * 60 * 60);
```

### `invalidateToken(userId)`

Invalidate a token (e.g., when user cancels action).

```typescript
await invalidateToken(userId);
```

## Examples

### Email Verification

```typescript
// Generate token
const token = await generateInvitationToken({
  type: 'email_verification',
  userId: user.id,
  email: user.email
});

// Send email
await sendEmail(user.email, {
  subject: 'Verify your email',
  body: `Click here to verify: ${process.env.FRONTEND_URL}/verify?token=${token}`
});

// Validate and verify
const result = await validateInvitationToken(token);
if (result.valid) {
  await db.updateTable('users')
    .set({ email_verified: true })
    .where('id', '=', result.payload.userId)
    .execute();
  
  await markTokenAsUsed(result.payload.userId);
}
```

### Password Reset

```typescript
// Generate token
const token = await generateInvitationToken({
  type: 'password_reset',
  userId: user.id,
  email: user.email
});

// Send email
await sendEmail(user.email, {
  subject: 'Reset your password',
  body: `Reset link: ${process.env.FRONTEND_URL}/reset?token=${token}`
});

// Validate and reset
const result = await validateInvitationToken(token);
if (result.valid) {
  // Allow user to set new password
  await updatePassword(result.payload.userId, newPassword);
  await markTokenAsUsed(result.payload.userId);
}
```

## Testing

Run the test script to verify the PASETO system:

```bash
bun run scripts/test-paseto-tokens.ts
```

## Security Best Practices

✅ **DO**:
- Generate a unique PASETO key for each environment (dev/staging/prod)
- Keep the private key secret (never commit to Git)
- Use short expiration times for sensitive actions (1-24 hours)
- Always mark tokens as used after successful validation
- Rotate keys every 90 days

❌ **DON'T**:
- Share the same key across environments
- Store tokens in database (defeats the purpose)
- Reuse tokens (always generate new ones)
- Skip the `markTokenAsUsed()` call
- Use long expiration times for sensitive actions

## Documentation

See [TRUST-TOKENS-GUIDE.md](../../../docs/TRUST-TOKENS-GUIDE.md) for complete documentation.

