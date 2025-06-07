# Payment Method Provider Sync Implementation Guide

This document outlines the implementation strategy for payment method provider synchronization in a multi-provider environment. This feature would allow updating provider-specific fields like expiry dates, billing details, and other metadata that requires synchronization with payment providers.

## Overview

The provider sync system would extend the current local-only update functionality to include fields that require synchronization with payment providers (Stripe, Azul, etc.). This is essential for cases like expired card updates, billing address changes, and provider-specific metadata management.

## Current State vs Future State

### Current Implementation (Local Only)
```typescript
// PUT /payment-methods/:id
// Only updates local fields:
{
  "is_default": true,
  "billing_address_id": "addr_123",
  "metadata": { "nickname": "My card" }
}
```

### Future Implementation (Provider Sync)
```typescript
// PUT /payment-methods/:id/sync
// Updates provider fields with synchronization:
{
  "expiry_month": "12",
  "expiry_year": "2026",
  "billing_details": {
    "name": "John Doe Updated",
    "address": {...}
  },
  "provider_metadata": {
    "stripe_specific_field": "value"
  }
}
```

## Implementation Strategy

### 1. New Endpoint: PUT /payment-methods/:id/sync

This endpoint would handle provider synchronization separately from local updates to maintain clear separation of concerns.

```typescript
// Route definition
paymentMethods.put('/:id/sync', optionalAuth(), async (c) => {
  // 1. Validate ownership (same as current PUT)
  // 2. Validate provider capabilities
  // 3. Update provider first
  // 4. Update local database
  // 5. Handle rollback if needed
});
```

### 2. Provider Capability Detection

Different providers support different update operations:

```typescript
interface ProviderCapabilities {
  canUpdateExpiry: boolean;
  canUpdateBilling: boolean;
  canUpdateMetadata: boolean;
  supportedFields: string[];
}

// Stripe capabilities
const stripeCapabilities: ProviderCapabilities = {
  canUpdateExpiry: true,
  canUpdateBilling: true,
  canUpdateMetadata: true,
  supportedFields: ['billing_details', 'metadata']
};

// Azul capabilities (example)
const azulCapabilities: ProviderCapabilities = {
  canUpdateExpiry: true,
  canUpdateBilling: false,
  canUpdateMetadata: false,
  supportedFields: ['expiry_month', 'expiry_year']
};
```

### 3. Provider Adapter Extension

Extend the existing payment adapter interface:

```typescript
interface PaymentAdapter {
  // Existing methods...
  
  // New sync methods
  updatePaymentMethod(
    paymentMethodId: string,
    updates: ProviderPaymentMethodUpdates
  ): Promise<ProviderPaymentMethod>;
  
  getUpdateCapabilities(): ProviderCapabilities;
  
  validateUpdateFields(
    updates: ProviderPaymentMethodUpdates
  ): ValidationResult;
}
```

### 4. Update Schema for Provider Sync

```typescript
const syncPaymentMethodSchema = z.object({
  // Provider-specific fields
  expiry_month: z.string().regex(/^(0[1-9]|1[0-2])$/).optional(),
  expiry_year: z.string().regex(/^\d{4}$/).optional(),
  
  billing_details: z.object({
    name: z.string().optional(),
    email: z.string().email().optional(),
    phone: z.string().optional(),
    address: z.object({
      line1: z.string().optional(),
      line2: z.string().optional(),
      city: z.string().optional(),
      state: z.string().optional(),
      postal_code: z.string().optional(),
      country: z.string().optional()
    }).optional()
  }).optional(),
  
  provider_metadata: z.record(z.string()).optional()
});
```

## Implementation Steps

### Phase 1: Infrastructure Setup

1. **Extend Provider Adapters**
   ```typescript
   // Add update capabilities to each provider
   class StripeAdapter implements PaymentAdapter {
     async updatePaymentMethod(id: string, updates: any) {
       return await stripe.paymentMethods.update(id, updates);
     }
   }
   ```

2. **Database Schema Updates**
   ```sql
   -- Add provider sync tracking
   ALTER TABLE payment_methods ADD COLUMN last_provider_sync TEXT;
   ALTER TABLE payment_methods ADD COLUMN provider_sync_status TEXT;
   ```

3. **Error Handling Framework**
   ```typescript
   class ProviderSyncError extends Error {
     constructor(
       public provider: string,
       public operation: string,
       public originalError: any
     ) {
       super(`Provider sync failed: ${provider} ${operation}`);
     }
   }
   ```

### Phase 2: Core Implementation

1. **Sync Endpoint Implementation**
   ```typescript
   paymentMethods.put('/:id/sync', optionalAuth(), async (c) => {
     try {
       // 1. Ownership validation (reuse existing logic)
       const hasAccess = await validateOwnership(paymentMethodId, user, token);
       
       // 2. Provider capability check
       const capabilities = adapter.getUpdateCapabilities();
       const validationResult = adapter.validateUpdateFields(updates);
       
       // 3. Provider update
       const providerResult = await adapter.updatePaymentMethod(
         paymentMethod.provider_payment_method_id,
         updates
       );
       
       // 4. Database update
       const dbUpdates = {
         ...extractDbFields(providerResult),
         last_provider_sync: new Date().toISOString(),
         provider_sync_status: 'success'
       };
       
       const updatedPaymentMethod = await paymentMethodRepo.update(
         paymentMethodId,
         dbUpdates
       );
       
       return c.json(formatResponse(updatedPaymentMethod));
       
     } catch (error) {
       // Rollback logic if needed
       await handleSyncError(error, paymentMethodId);
       throw error;
     }
   });
   ```

2. **Rollback Mechanism**
   ```typescript
   async function handleSyncError(error: any, paymentMethodId: string) {
     // Log the error
     console.error('Provider sync failed:', error);
     
     // Update sync status
     await paymentMethodRepo.update(paymentMethodId, {
       provider_sync_status: 'failed',
       last_sync_error: error.message,
       updated_at: new Date().toISOString()
     });
     
     // Optionally: attempt to revert provider changes
     // This depends on provider capabilities
   }
   ```

### Phase 3: Provider-Specific Implementations

1. **Stripe Implementation**
   ```typescript
   class StripeAdapter {
     async updatePaymentMethod(id: string, updates: any) {
       const stripeUpdates: any = {};
       
       if (updates.billing_details) {
         stripeUpdates.billing_details = updates.billing_details;
       }
       
       if (updates.expiry_month || updates.expiry_year) {
         stripeUpdates.card = {
           exp_month: updates.expiry_month,
           exp_year: updates.expiry_year
         };
       }
       
       return await stripe.paymentMethods.update(id, stripeUpdates);
     }
   }
   ```

2. **Azul Implementation**
   ```typescript
   class AzulAdapter {
     async updatePaymentMethod(id: string, updates: any) {
       // Azul-specific update logic
       const azulUpdates = {
         expiration_date: `${updates.expiry_month}/${updates.expiry_year}`,
         // Map other fields according to Azul API
       };
       
       return await azul.updatePaymentMethod(id, azulUpdates);
     }
   }
   ```

## Use Cases and Examples

### 1. Expired Card Update
```bash
# User updates expired card
curl -X PUT "https://api.example.com/bridge-payment/payment-methods/pm_123/sync" \
  -H "Authorization: Bearer token" \
  -d '{
    "expiry_month": "12",
    "expiry_year": "2026"
  }'
```

### 2. Billing Address Update
```bash
# User moves to new address
curl -X PUT "https://api.example.com/bridge-payment/payment-methods/pm_123/sync" \
  -H "Authorization: Bearer token" \
  -d '{
    "billing_details": {
      "address": {
        "line1": "456 New Street",
        "city": "New City",
        "postal_code": "12345"
      }
    }
  }'
```

### 3. Provider-Specific Metadata
```bash
# Update Stripe-specific metadata
curl -X PUT "https://api.example.com/bridge-payment/payment-methods/pm_123/sync" \
  -H "Authorization: Bearer token" \
  -d '{
    "provider_metadata": {
      "stripe_account": "acct_123",
      "business_type": "individual"
    }
  }'
```

## Error Handling Scenarios

### 1. Provider Unavailable
```json
{
  "error": "Provider Sync Failed",
  "details": "Stripe API is currently unavailable",
  "retry_after": 300,
  "fallback_options": ["retry_later", "local_only_update"]
}
```

### 2. Field Not Supported
```json
{
  "error": "Field Not Supported",
  "details": "Azul provider does not support billing_details updates",
  "supported_fields": ["expiry_month", "expiry_year"],
  "alternative": "Use local metadata for billing information"
}
```

### 3. Validation Failed
```json
{
  "error": "Provider Validation Failed",
  "details": "Invalid expiry date format for Stripe",
  "field_errors": {
    "expiry_year": "Must be 4-digit year (e.g., 2026)"
  }
}
```

## Security Considerations

### 1. Ownership Validation
- Reuse existing ownership validation logic
- Support guest tokens for guest payment methods
- Admin override capabilities

### 2. Provider Authentication
- Secure API key management per provider
- Rate limiting for provider API calls
- Audit logging for all sync operations

### 3. Data Integrity
- Atomic operations where possible
- Rollback mechanisms for failed syncs
- Consistency checks between local and provider data

## Performance Considerations

### 1. Async Processing
```typescript
// For non-critical updates, use background processing
paymentMethods.put('/:id/sync-async', async (c) => {
  // Queue the sync operation
  await syncQueue.add('payment-method-sync', {
    paymentMethodId,
    updates,
    userId: user.id
  });
  
  return c.json({ 
    message: "Sync queued",
    job_id: "job_123"
  });
});
```

### 2. Caching Strategy
```typescript
// Cache provider capabilities
const providerCapabilitiesCache = new Map<string, ProviderCapabilities>();

// Cache recent sync results
const syncResultsCache = new LRUCache<string, SyncResult>({
  max: 1000,
  ttl: 1000 * 60 * 5 // 5 minutes
});
```

### 3. Batch Operations
```typescript
// For multiple payment method updates
paymentMethods.put('/batch-sync', async (c) => {
  const { payment_method_ids, updates } = await c.req.json();
  
  const results = await Promise.allSettled(
    payment_method_ids.map(id => 
      syncPaymentMethod(id, updates)
    )
  );
  
  return c.json({ results });
});
```

## Testing Strategy

### 1. Unit Tests
- Provider adapter mocking
- Validation logic testing
- Error handling scenarios

### 2. Integration Tests
- Real provider API testing (sandbox)
- Database consistency checks
- Rollback mechanism testing

### 3. End-to-End Tests
- Complete user workflows
- Multi-provider scenarios
- Error recovery testing

## Migration Strategy

### 1. Backward Compatibility
- Keep existing PUT endpoint for local updates
- Add new /sync endpoint for provider updates
- Clear documentation on when to use each

### 2. Gradual Rollout
- Start with Stripe provider only
- Add other providers incrementally
- Feature flags for provider-specific capabilities

### 3. Data Migration
- No schema changes required for existing data
- Add new fields for sync tracking
- Populate capabilities data for existing providers

## Monitoring and Observability

### 1. Metrics
- Sync success/failure rates per provider
- Average sync latency
- Provider API error rates

### 2. Logging
- Detailed sync operation logs
- Provider API request/response logging
- Error tracking and alerting

### 3. Health Checks
- Provider API availability checks
- Sync queue health monitoring
- Database consistency checks

---

*This implementation guide provides a comprehensive roadmap for adding provider synchronization capabilities to the payment method update system while maintaining the existing local-only update functionality.*
