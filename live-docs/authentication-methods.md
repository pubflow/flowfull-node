# Authentication Methods Documentation

The Bridge Payments API supports multiple authentication methods to provide flexibility for different integration scenarios. This document outlines all supported authentication methods and their use cases.

## Supported Authentication Methods

### 1. Authorization Bearer Header (Standard)

The traditional OAuth-style Bearer token authentication.

```http
Authorization: Bearer <sessionId>
```

**Example:**
```bash
curl -X GET "https://api.example.com/bridge-payment/payments" \
  -H "Authorization: Bearer 1dc72119bc5eb3a74bfda3d73da59a5f71b1086a" \
  -H "Content-Type: application/json"
```

**Use Cases:**
- Standard REST API clients
- OAuth-compatible applications
- Most HTTP libraries default support

### 2. X-Session-ID Header (Custom)

Custom header for session identification, useful when Authorization header is not available or conflicts with other auth systems.

```http
X-Session-ID: <sessionId>
```

**Example:**
```bash
curl -X GET "https://api.example.com/bridge-payment/payments" \
  -H "X-Session-ID: 1dc72119bc5eb3a74bfda3d73da59a5f71b1086a" \
  -H "Content-Type: application/json"
```

**Use Cases:**
- Applications with existing Authorization header usage
- Custom integrations requiring specific header names
- Legacy systems with header naming conventions

### 3. session_id Query Parameter

Query parameter authentication for scenarios where headers cannot be easily modified.

```http
GET /bridge-payment/payments?session_id=<sessionId>
```

**Example:**
```bash
curl -X GET "https://api.example.com/bridge-payment/payments?session_id=1dc72119bc5eb3a74bfda3d73da59a5f71b1086a" \
  -H "Content-Type: application/json"
```

**Use Cases:**
- Simple GET requests from browsers
- URL-based authentication for webhooks
- Testing and debugging scenarios
- Applications with limited header control

### 4. Guest Token Authentication

Special token-based authentication for guest users who don't have full accounts.

```http
GET /bridge-payment/payments?token=<guest_token>
```

**Example:**
```bash
curl -X GET "https://api.example.com/bridge-payment/payments?token=guest_token_abc123" \
  -H "Content-Type: application/json"
```

**Use Cases:**
- Guest checkout flows
- Temporary access to payment data
- Post-checkout payment information access

## Authentication Priority Order

When multiple authentication methods are provided, the system checks them in this order:

1. **Authorization Header** (Bearer or Token)
2. **X-Session-ID Header**
3. **session_id Query Parameter**
4. **token Query Parameter** (for guest access)

**Note:** Only the first valid authentication method found will be used.

## Session vs Token Authentication

### Session Authentication (sessionId)

Used for authenticated users with active sessions.

**Validation Endpoint:**
```http
POST /auth/bridge/validate
Content-Type: application/json

{
  "sessionId": "1dc72119bc5eb3a74bfda3d73da59a5f71b1086a"
}
```

**Response:**
```json
{
  "success": true,
  "user": {
    "id": "kjahsd9819868",
    "email": "samuelorecio@gmail.com",
    "name": "Samuel",
    "userType": "admin",
    "paymentUserId": "kjahsd9819868",
    "firstName": "Samuel",
    "lastName": "Recio",
    "phone": null,
    "isVerified": false
  },
  "session": {
    "id": "1dc72119bc5eb3a74bfda3d73da59a5f71b1086a",
    "userId": "kjahsd9819868",
    "expiresAt": "2025-07-07T02:55:17.864Z",
    "lastUsedAt": "2025-06-07T02:55:17.864Z"
  },
  "timestamp": "2025-06-07T02:55:49.408Z"
}
```

### Guest Token Authentication

Used for guest users with temporary access tokens.

**Validation Endpoint:**
```http
GET /auth/token/validate?token=<guest_token>
```

**Response:**
```json
{
  "success": true,
  "user": {
    "id": "guest_user_123",
    "email": "guest@example.com",
    "name": "Guest User",
    "userType": "guest",
    "isVerified": true
  },
  "tokenType": "token_login",
  "token_id": "tok_abc123",
  "expires_at": "2025-06-05T03:34:29.000Z"
}
```

## Implementation Examples

### JavaScript/Fetch

```javascript
// Method 1: Authorization Bearer
const response1 = await fetch('/bridge-payment/payments', {
  headers: {
    'Authorization': 'Bearer 1dc72119bc5eb3a74bfda3d73da59a5f71b1086a',
    'Content-Type': 'application/json'
  }
});

// Method 2: X-Session-ID Header
const response2 = await fetch('/bridge-payment/payments', {
  headers: {
    'X-Session-ID': '1dc72119bc5eb3a74bfda3d73da59a5f71b1086a',
    'Content-Type': 'application/json'
  }
});

// Method 3: Query Parameter
const response3 = await fetch('/bridge-payment/payments?session_id=1dc72119bc5eb3a74bfda3d73da59a5f71b1086a');

// Method 4: Guest Token
const response4 = await fetch('/bridge-payment/payments?token=guest_token_abc123');
```

### cURL Examples

```bash
# Authorization Bearer
curl -H "Authorization: Bearer SESSION_ID" \
     -H "Content-Type: application/json" \
     https://api.example.com/bridge-payment/payments

# X-Session-ID Header
curl -H "X-Session-ID: SESSION_ID" \
     -H "Content-Type: application/json" \
     https://api.example.com/bridge-payment/payments

# Query Parameter
curl "https://api.example.com/bridge-payment/payments?session_id=SESSION_ID"

# Guest Token
curl "https://api.example.com/bridge-payment/payments?token=GUEST_TOKEN"
```

### Python Requests

```python
import requests

# Method 1: Authorization Bearer
response1 = requests.get(
    'https://api.example.com/bridge-payment/payments',
    headers={
        'Authorization': 'Bearer 1dc72119bc5eb3a74bfda3d73da59a5f71b1086a',
        'Content-Type': 'application/json'
    }
)

# Method 2: X-Session-ID Header
response2 = requests.get(
    'https://api.example.com/bridge-payment/payments',
    headers={
        'X-Session-ID': '1dc72119bc5eb3a74bfda3d73da59a5f71b1086a',
        'Content-Type': 'application/json'
    }
)

# Method 3: Query Parameter
response3 = requests.get(
    'https://api.example.com/bridge-payment/payments',
    params={'session_id': '1dc72119bc5eb3a74bfda3d73da59a5f71b1086a'}
)

# Method 4: Guest Token
response4 = requests.get(
    'https://api.example.com/bridge-payment/payments',
    params={'token': 'guest_token_abc123'}
)
```

## Security Considerations

### Session ID Security

- **Length Validation**: Session IDs must be at least 10 characters
- **HTTPS Only**: Always use HTTPS in production
- **Expiration**: Sessions have configurable expiration times
- **Rate Limiting**: Authentication attempts are rate limited

### Guest Token Security

- **Temporary Access**: Guest tokens have limited lifespans
- **Scope Limited**: Guest tokens only access guest-specific resources
- **Email Validation**: Guest access is validated against email ownership

### Best Practices

1. **Use HTTPS**: Always use HTTPS in production environments
2. **Token Storage**: Store tokens securely (not in localStorage for sensitive data)
3. **Expiration Handling**: Implement proper token expiration handling
4. **Error Handling**: Handle authentication failures gracefully
5. **Logging**: Monitor authentication attempts for security

## Error Responses

### Authentication Required
```http
HTTP/1.1 401 Unauthorized
Content-Type: application/json

{
  "error": "Authentication Required",
  "details": "Authentication required to access this resource"
}
```

### Invalid Credentials
```http
HTTP/1.1 401 Unauthorized
Content-Type: application/json

{
  "error": "Authentication Failed",
  "details": "Invalid authentication credentials"
}
```

### Insufficient Privileges
```http
HTTP/1.1 403 Forbidden
Content-Type: application/json

{
  "error": "Access Denied",
  "details": "Insufficient privileges for this resource"
}
```

## Configuration

### Environment Variables

```env
# Backend authentication service URL
FLOWLESS_API_URL=https://your-auth-backend.com

# Authentication timeout (milliseconds)
AUTH_TIMEOUT=25000

# Cache settings
TOKEN_CACHE_TTL=300000  # 5 minutes
```

### Cache Configuration

The authentication system includes intelligent caching:

- **Session Cache**: 10 minutes default TTL
- **Token Cache**: 5 minutes default TTL
- **LRU Eviction**: Automatic cleanup of old entries
- **Memory Efficient**: Configurable cache size limits

## Monitoring and Logging

### Authentication Logs

The system provides detailed logging for security monitoring:

```
✅ Auth success: session source=X-Session-ID user=kjahsd9819868 type=admin ip=192.168.1.1 path=/payments cache=true
❌ Auth failed: token source=token-query ip=192.168.1.2 path=/payments error=invalid_token
```

### Metrics

- Authentication success/failure rates
- Cache hit/miss ratios
- Response times by authentication method
- User type distribution

---

*Last updated: June 4, 2025*
