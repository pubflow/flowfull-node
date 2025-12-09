# Flowfull Auth Middleware Examples

This directory contains examples of how to use the flexible authentication middleware in your Flowfull backend.

## Available Middleware

Flowfull provides 4 main authentication middleware functions:

### 1. `requireAuth()`
**Use case**: Any authenticated user can access

```typescript
app.get('/api/profile', requireAuth(), async (c) => {
  const userId = c.get('user_id');
  return c.json({ userId });
});
```

### 2. `optionalAuth()`
**Use case**: Public routes with optional personalization

```typescript
app.get('/api/posts', optionalAuth(), async (c) => {
  const userId = c.get('user_id');
  
  if (userId) {
    return c.json({ posts: await getPersonalizedPosts(userId) });
  } else {
    return c.json({ posts: await getPublicPosts() });
  }
});
```

### 3. `requireUserType(userTypes)`
**Use case**: Specific user type(s) required

```typescript
// Single user type
app.get('/api/admin/users', requireUserType('admin'), handler);

// Multiple user types
app.get('/api/manager/dashboard', requireUserType(['admin', 'manager']), handler);

// Custom user types
app.get('/api/teacher/classes', requireUserType('teacher'), handler);
```

### 4. `requirePermission(permission)`
**Use case**: Specific permission required

```typescript
app.delete('/api/posts/:id', requirePermission('posts.delete'), handler);
```

## Why `requireUserType` is Better Than `requireAuth`

`requireAuth()` is too restrictive - it only checks if the user is authenticated, but doesn't validate the user type. This means you have to manually check user types in your route handlers.

`requireUserType()` is **more flexible** because:

1. ✅ **Single or Multiple Types**: Accept one user type or an array
2. ✅ **Custom User Types**: Works with ANY user type you define
3. ✅ **Clear Error Messages**: Shows exactly what types are allowed
4. ✅ **Type Safety**: Validates at middleware level, not in route handler

## Custom User Types

Flowfull is a **configurable starter kit** for developers. You can define ANY user types that match your business logic:

```typescript
const USER_TYPES = {
  // Basic
  ADMIN: 'admin',
  USER: 'user',
  
  // Business
  MANAGER: 'manager',
  EMPLOYEE: 'employee',
  
  // Education
  TEACHER: 'teacher',
  STUDENT: 'student',
  
  // E-commerce
  SELLER: 'seller',
  BUYER: 'buyer',
  
  // Healthcare
  DOCTOR: 'doctor',
  NURSE: 'nurse',
  PATIENT: 'patient',
  
  // Subscription
  FREE: 'free',
  PREMIUM: 'premium',
  ENTERPRISE: 'enterprise'
};
```

## Examples

See `auth-middleware-usage.ts` for complete examples including:

- Public routes
- Protected routes
- Optional authentication
- Single user type
- Multiple user types
- Custom user types for different industries
- Permission-based access
- Chaining multiple middleware
- Dynamic role-based behavior

## Quick Reference

| Middleware | Use Case | Example |
|------------|----------|---------|
| `requireAuth()` | Any authenticated user | User profile, settings |
| `requireUserType('admin')` | Only specific user type | Admin dashboard |
| `requireUserType(['admin', 'manager'])` | Multiple user types | Management reports |
| `optionalAuth()` | Public with personalization | Product listings |
| `requirePermission('posts.delete')` | Specific permission | Delete operations |

## Chaining Middleware

You can chain multiple middleware for complex requirements:

```typescript
app.post(
  '/api/admin/users',
  requireAuth(),                    // 1. Ensure authenticated
  requireUserType('admin'),         // 2. Ensure admin
  requirePermission('users.create'), // 3. Ensure permission
  handler
);
```

## Documentation

For more details, see the full documentation at:
- [Auth Middleware Docs](../docs/pubflow-flowfull-docs/core-concepts/auth-middleware.md)
- [Bridge Validation](../docs/pubflow-flowfull-docs/core-concepts/bridge-validation.md)
- [Validation Modes](../docs/pubflow-flowfull-docs/core-concepts/validation-modes.md)

