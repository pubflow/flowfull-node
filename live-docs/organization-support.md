# Organization Support in Bridge-Payments

This document provides a comprehensive overview of organization support across all Bridge-Payments APIs.

## 📊 Current Support Status

| API | Organization Support | Status | Notes |
|-----|---------------------|--------|-------|
| **Subscriptions** | ✅ **FULL SUPPORT** | Complete | All features implemented |
| **Addresses** | ❌ **NOT SUPPORTED** | Pending | Hardcoded to `null` |
| **Payments** | ❌ **NOT SUPPORTED** | Pending | Hardcoded to `null` |
| **Customers** | ✅ **FULL SUPPORT** | Complete | Schema supports organizations |
| **Payment Methods** | ❌ **NOT SUPPORTED** | Pending | Hardcoded to `null` |

## ✅ Subscriptions API - FULLY SUPPORTED

### Features
- ✅ **Request Body**: Accepts `organization_id` parameter
- ✅ **Auto-detection**: Uses user's organization if not specified
- ✅ **Access Control**: Users can access org subscriptions
- ✅ **Product-based**: Full support for org product subscriptions
- ✅ **Custom Subscriptions**: Enterprise pricing support
- ✅ **Guest Support**: Organizations can create guest subscriptions

### Example Usage
```bash
# Organization subscription with custom pricing
curl -X POST "/bridge-payment/subscriptions" \
  -H "Authorization: Bearer org_token" \
  -d '{
    "customer_id": "cust_org_123",
    "organization_id": "org_456789",
    "price_cents": 49999,
    "currency": "USD",
    "billing_interval": "yearly",
    "payment_method_id": "pm_org_card"
  }'
```

### Access Control Logic
```typescript
// Users can access subscriptions via:
// 1. Personal access: subscription.user_id === user.id
// 2. Organization access: subscription.organization_id === user.organization_id
const hasAccess = subscription.user_id === userId || 
                  (userOrgId && subscription.organization_id === userOrgId);
```

## ❌ Addresses API - NOT SUPPORTED

### Current Limitation
```typescript
// ❌ PROBLEM: Hardcoded in addresses.ts line 160
organization_id: null, // No organization support for now
```

### Missing Features
- ❌ No `organization_id` in request schema
- ❌ No organization access control
- ❌ Cannot save addresses to organizations
- ❌ No organization-level address management

### Impact
- Organizations cannot save billing/shipping addresses
- No centralized address management for companies
- Users must create personal addresses for org payments

## ❌ Payments API - NOT SUPPORTED

### Current Limitations
```typescript
// ❌ PROBLEMS: Multiple hardcoded nulls in payments.ts
organization_id: null, // Lines 215, 336, 381, 445
```

### Missing Features
- ❌ No `organization_id` in request schema
- ❌ No organization access control
- ❌ Cannot create payments for organizations
- ❌ No organization payment history

### Impact
- Organizations cannot track company payments
- No separation between personal and business payments
- Limited reporting for organizational spending

## ❌ Payment Methods API - NOT SUPPORTED

### Current Limitation
```typescript
// ❌ PROBLEM: Hardcoded in payment-methods.ts
organization_id: null,
```

### Missing Features
- ❌ No organization payment method storage
- ❌ No company card management
- ❌ No shared payment methods for org members

## 🎯 Recommended Implementation Plan

### Phase 1: Addresses API (High Priority)
```typescript
// Add to addresses schema
const createAddressSchema = z.object({
  // ... existing fields
  organization_id: z.string().optional(),
  // ... rest of fields
});

// Update creation logic
organization_id: validatedData.organization_id || userContext.organizationId || null,
```

### Phase 2: Payments API (High Priority)
```typescript
// Add to payments schema
const createPaymentSchema = z.object({
  // ... existing fields
  organization_id: z.string().optional(),
  // ... rest of fields
});

// Update access control
const hasAccess = payment.user_id === userId || 
                  (userOrgId && payment.organization_id === userOrgId);
```

### Phase 3: Payment Methods API (Medium Priority)
```typescript
// Add organization support to payment methods
organization_id: validatedData.organization_id || userContext.organizationId || null,
```

## 🔧 Implementation Template

For each API that needs organization support:

### 1. Update Schema
```typescript
const schema = z.object({
  // ... existing fields
  organization_id: z.string().optional(),
  // ... rest of fields
});
```

### 2. Update Creation Logic
```typescript
const data = {
  // ... existing fields
  organization_id: validatedData.organization_id || userContext.organizationId || null,
  // ... rest of fields
};
```

### 3. Update Access Control
```typescript
// Verify user has access
if (!userContext.isGuest) {
  const hasUserAccess = record.user_id === userContext.userId;
  const hasOrgAccess = userContext.organizationId && 
                       record.organization_id === userContext.organizationId;
  
  if (!hasUserAccess && !hasOrgAccess) {
    throw new HTTPException(403, { message: 'Access denied' });
  }
}
```

### 4. Update List Queries
```typescript
const options: any = { limit, offset };

if (userContext.userId) {
  options.userId = userContext.userId;
}

if (userContext.organizationId) {
  options.organizationId = userContext.organizationId;
}
```

## 📋 Database Schema Status

All database schemas already support organizations:

### ✅ Subscriptions Table
```sql
CREATE TABLE subscriptions (
    organization_id VARCHAR(255), -- ✅ Supported
    FOREIGN KEY (organization_id) REFERENCES organizations(id)
);
```

### ✅ Addresses Table
```sql
CREATE TABLE addresses (
    organization_id VARCHAR(255), -- ✅ Schema ready
    FOREIGN KEY (organization_id) REFERENCES organizations(id)
);
```

### ✅ Payments Table
```sql
CREATE TABLE payments (
    organization_id VARCHAR(255), -- ✅ Schema ready
    FOREIGN KEY (organization_id) REFERENCES organizations(id)
);
```

### ✅ Payment Methods Table
```sql
CREATE TABLE payment_methods (
    organization_id VARCHAR(255), -- ✅ Schema ready
    FOREIGN KEY (organization_id) REFERENCES organizations(id)
);
```

## 🎉 Summary

**Only Subscriptions API is fully organization-ready!** The database schemas support organizations everywhere, but the API implementations need to be updated to match the subscriptions pattern.

### Quick Wins Available
1. **Addresses**: ~30 minutes to implement
2. **Payments**: ~45 minutes to implement  
3. **Payment Methods**: ~30 minutes to implement

All the infrastructure is there - just need to follow the subscriptions implementation pattern! 🚀
