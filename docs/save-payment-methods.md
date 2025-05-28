# Save Payment Methods During Payment Confirmation

This document explains how to save payment methods during the payment confirmation process for both authenticated users and guests.

## Overview

The bridge-payments system now supports saving payment methods automatically during payment confirmation. This feature allows users to store their payment information securely for future use without requiring a separate API call.

## How It Works

### For Authenticated Users

When an authenticated user confirms a payment with `save_payment_method: true`:

1. **Customer Creation**: If the user doesn't have a customer record with the payment provider, one is created automatically
2. **Payment Confirmation**: The payment is confirmed with Stripe's `setup_future_usage: 'off_session'` parameter
3. **Method Storage**: Upon successful payment, the payment method is saved to the local database
4. **Future Use**: The saved payment method can be used for future payments

### For Guest Users

When a guest user confirms a payment with `save_payment_method: true`:

1. **Guest Customer Creation**: A guest customer record is created in the payment provider
2. **Payment Confirmation**: The payment is confirmed with setup for future use
3. **Provider Storage**: The payment method is saved in the payment provider (e.g., Stripe)
4. **Local Storage**: The payment method is saved in the local database with guest information

## API Usage

### Basic Payment Confirmation

```bash
curl -X POST "/bridge-payment/payments/intents/{id}/confirm" \
  -H "Authorization: Bearer your_token" \
  -H "Content-Type: application/json" \
  -d '{
    "payment_method_id": "pm_1234567890",
    "return_url": "https://yoursite.com/success"
  }'
```

### Payment Confirmation with Save

```bash
curl -X POST "/bridge-payment/payments/intents/{id}/confirm" \
  -H "Authorization: Bearer your_token" \
  -H "Content-Type: application/json" \
  -d '{
    "payment_method_id": "pm_1234567890",
    "return_url": "https://yoursite.com/success",
    "save_payment_method": true
  }'
```

### Response

```json
{
  "id": "pay_1234567890",
  "status": "succeeded",
  "provider_intent_id": "pi_1234567890abcdef",
  "requires_action": false,
  "payment_method_saved": true,
  "updated_at": "2025-01-15T10:35:00Z"
}
```

## Implementation Details

### Stripe Integration

The system uses Stripe's `setup_future_usage` parameter to enable payment method saving:

```typescript
// In Stripe adapter
if (request.save_payment_method) {
  params.setup_future_usage = 'off_session';
}
```

### Database Storage

For authenticated users, payment methods are stored in the `payment_methods` table:

```sql
INSERT INTO payment_methods (
  id, user_id, provider_id, provider_payment_method_id,
  payment_type, last_four, expiry_month, expiry_year,
  card_brand, is_default, billing_address_id
) VALUES (...)
```

### Error Handling

- If payment method saving fails, the payment confirmation still succeeds
- Errors are logged but don't affect the payment status
- The `payment_method_saved` field in the response indicates success/failure

## Current Limitations

### Database Schema

- All database schemas (PostgreSQL, MySQL, SQLite) now support guest payment methods
- Guest payment methods are stored with `is_guest`, `guest_email`, and `guest_name` fields
- Full guest support is now implemented

### Provider Support

- Currently only implemented for Stripe
- PayPal and Authorize.net implementations pending

## Security Considerations

1. **PCI Compliance**: No sensitive card data is stored locally
2. **Tokenization**: Only payment method tokens are stored
3. **Provider Security**: Actual payment data remains with the payment provider
4. **Access Control**: Users can only access their own payment methods

## Future Enhancements

1. **Payment Method Management**: APIs for listing, updating, and deleting saved methods
2. **Default Methods**: Support for setting default payment methods
3. **Multiple Providers**: Support for saving methods across different payment providers (PayPal, Authorize.net)
4. **Guest Conversion**: Automatic conversion of guest payment methods when guests register

## Best Practices

1. **User Consent**: Always get explicit user consent before saving payment methods
2. **Clear Communication**: Inform users when their payment method will be saved
3. **Easy Management**: Provide users with ways to manage their saved payment methods
4. **Security**: Follow PCI DSS guidelines for handling payment data

## Testing

To test the save payment method functionality:

1. Create a payment intent for an authenticated user
2. Confirm the payment with `save_payment_method: true`
3. Verify the payment method appears in the user's saved methods
4. Test with guest users to see provider-level saving

## Troubleshooting

### Common Issues

1. **Payment method not saved**: Check if user is authenticated and payment succeeded
2. **Guest saving not working**: This is expected - requires schema updates
3. **Provider errors**: Check payment provider configuration and API keys

### Debugging

Enable debug logging to see the payment method saving process:

```typescript
console.log('🔐 Setting up payment method for future use');
console.log('💾 Saving payment method after successful payment...');
console.log('✅ Payment method saved successfully');
```
