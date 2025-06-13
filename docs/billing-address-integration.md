# Billing Address Integration

## Overview

The Bridge Payment system now supports optional billing address integration for payment methods. This feature allows you to:

1. **Link existing addresses** to payment methods using `billing_address_id`
2. **Auto-populate billing details** from saved addresses
3. **Maintain backward compatibility** with direct `billing_details` input

## Features

### ✅ **Optional Integration**
- `billing_address_id` is completely optional
- Existing payment method creation still works without changes
- Non-invasive implementation that doesn't break existing functionality

### ✅ **Address Resolution**
- Automatically fetches address data when `billing_address_id` is provided
- Validates user access to the address (user ownership or guest email match)
- Merges address data with any additional `billing_details` provided

### ✅ **Provider Integration**
- Works seamlessly with Stripe provider
- Address data is properly formatted for Stripe's billing_details structure
- Maintains all existing Stripe functionality

## API Usage

### 1. Create Payment Method with Existing Address

```json
POST /bridge-payment/payment-methods/with-token
{
  "payment_method_token": "pm_1234567890",
  "provider_id": "stripe",
  "type": "credit_card",
  "billing_address_id": "addr_abc123",
  "save_for_future": true
}
```

### 2. Create Payment Method with Address + Additional Details

```json
POST /bridge-payment/payment-methods/with-token
{
  "payment_method_token": "pm_1234567890",
  "provider_id": "stripe",
  "type": "credit_card",
  "billing_address_id": "addr_abc123",
  "billing_details": {
    "name": "Custom Name Override",
    "phone": "+1234567890"
  },
  "save_for_future": true
}
```

### 3. Traditional Method (Still Works)

```json
POST /bridge-payment/payment-methods/with-token
{
  "payment_method_token": "pm_1234567890",
  "provider_id": "stripe",
  "type": "credit_card",
  "billing_details": {
    "name": "John Doe",
    "email": "john@example.com",
    "address": {
      "line1": "123 Main St",
      "city": "New York",
      "state": "NY",
      "postal_code": "10001",
      "country": "US"
    }
  },
  "save_for_future": true
}
```

## Response Format

All payment method responses now include `billing_address_id`:

```json
{
  "id": "pm_local_123",
  "provider_payment_method_id": "pm_stripe_456",
  "payment_type": "credit_card",
  "card_brand": "visa",
  "last_four": "4242",
  "expiry_month": "12",
  "expiry_year": "2025",
  "is_default": false,
  "is_guest": false,
  "billing_address_id": "addr_abc123",
  "created_at": "2024-01-15T10:30:00Z"
}
```

## Security & Validation

### **Address Access Control**
- **Authenticated Users**: Can only access addresses where `address.user_id = user.id`
- **Guest Users**: Can only access addresses where `address.is_guest = true` and `address.guest_email = user.email`
- **Invalid Access**: Returns 403 Forbidden

### **Address Validation**
- Validates that `billing_address_id` exists in the database
- Returns 404 if address not found
- Ensures proper user authorization before using address data

## Implementation Details

### **Data Flow**
1. Client sends `billing_address_id` in payment method creation
2. System fetches address from database
3. System validates user access to address
4. Address data is converted to `billing_details` format
5. Merged with any additional `billing_details` provided
6. Sent to payment provider (Stripe)
7. Payment method saved with `billing_address_id` reference

### **Database Schema**
- `payment_methods.billing_address_id` (VARCHAR(255), nullable)
- Links to `addresses.id`
- Maintains referential integrity

### **Backward Compatibility**
- All existing endpoints work unchanged
- `billing_address_id` is optional in all schemas
- No breaking changes to existing functionality

## Error Handling

### **Common Errors**

```json
// Address not found
{
  "error": "Billing address not found: addr_invalid123",
  "status": 404
}

// Access denied
{
  "error": "Access denied to billing address",
  "status": 403
}

// Invalid address ID format
{
  "error": "Validation Error",
  "details": ["billing_address_id must be a string"],
  "status": 400
}
```

## Testing

### **Test Scenarios**
1. ✅ Create payment method with valid `billing_address_id`
2. ✅ Create payment method with invalid `billing_address_id` (should fail)
3. ✅ Create payment method with unauthorized `billing_address_id` (should fail)
4. ✅ Create payment method without `billing_address_id` (should work as before)
5. ✅ Update payment method `billing_address_id`
6. ✅ List payment methods (should include `billing_address_id`)

### **Provider Testing**
1. ✅ Verify Stripe receives correct billing_details from address
2. ✅ Verify payment method creation succeeds in Stripe
3. ✅ Verify payment method attachment to customer works

## Future Enhancements

- **Address Auto-Creation**: Automatically create address from billing_details if not exists
- **Default Address**: Support for default billing address per user
- **Address Validation**: Integration with address validation services
- **Multiple Providers**: Extend support to other payment providers
