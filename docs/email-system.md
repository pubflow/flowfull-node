# Email System Documentation

## Overview

Bridge-Payments includes a comprehensive email system for sending transaction receipts and notifications. The system is built with i18n support, professional templates, and automatic webhook integration.

## Features

- ✅ **Universal Transaction Receipts** - Works for all payment types
- ✅ **i18n Support** - Spanish and English templates
- ✅ **ZeptoMail Integration** - Professional email delivery
- ✅ **Automatic Webhook Triggers** - Sends receipts on successful payments
- ✅ **Responsive Templates** - Mobile-friendly email design
- ✅ **Template Variables** - Dynamic content replacement
- ✅ **Error Handling** - Graceful fallbacks and retry logic

## Architecture

```
src/lib/email/
├── email-service.ts          # ZeptoMail API integration
├── template-service.ts       # Template loading and i18n
├── receipt-service.ts        # Transaction receipt logic
└── templates/
    ├── es/
    │   ├── transaction_receipt.html
    │   └── subjects.json
    └── en/
        ├── transaction_receipt.html
        └── subjects.json
```

## Configuration

### Environment Variables

```env
# Email Service Configuration
ZEPTOMAIL_API_KEY=Zoho-enczapikey your_api_key_here
EMAIL_FROM_ADDRESS=noreply@yourdomain.com
EMAIL_FROM_NAME=Your Organization
EMAIL_REPLY_TO_ADDRESS=support@yourdomain.com
EMAIL_REPLY_TO_NAME=Support Team

# Organization Information
ORGANIZATION_NAME=Your Organization Name
ORGANIZATION_EMAIL=info@yourdomain.com
ORGANIZATION_PHONE=+1 (555) 123-4567
ORGANIZATION_ADDRESS=123 Main St, City, State 12345
ORGANIZATION_WEBSITE=https://yourdomain.com

# Language Settings
GLOBAL_LANG=en
DEFAULT_LANGUAGE=en

# Testing
TEST_EMAIL=test@yourdomain.com
```

### Required Configuration

1. **ZEPTOMAIL_API_KEY** - Your ZeptoMail API key
2. **EMAIL_FROM_ADDRESS** - Sender email address
3. **ORGANIZATION_NAME** - Organization name for templates

## Usage

### Automatic Receipt Sending

Receipts are automatically sent when payments succeed via webhooks:

```typescript
// Automatically triggered by webhook processor
// No manual intervention required
```

### Manual Receipt Sending

```typescript
import { receiptService } from '@/lib/email/receipt-service';

const transactionData = {
  id: 'pay_123',
  amount_cents: 2500,
  currency: 'USD',
  status: 'succeeded',
  concept: 'Donation',
  reference_code: 'DON_001',
  customer_email: 'customer@example.com',
  customer_name: 'John Doe',
  created_at: new Date().toISOString()
};

const result = await receiptService.sendTransactionReceipt(transactionData);
```

### Custom Templates

```typescript
// Send with custom variables
const result = await receiptService.sendCustomReceipt(
  transactionData,
  { custom_message: 'Thank you for your donation!' },
  'transaction_receipt'
);
```

## Template Variables

### Available Variables

| Variable | Description | Example |
|----------|-------------|---------|
| `customer_name` | Customer name | John Doe |
| `customer_email` | Customer email | john@example.com |
| `amount` | Formatted amount | 25.00 |
| `currency` | Currency code | USD |
| `concept` | Payment description | Donation |
| `reference_code` | Reference code | DON_001 |
| `transaction_id` | Transaction ID | pi_123456789 |
| `transaction_date` | Formatted date | December 14, 2025 |
| `transaction_time` | Formatted time | 3:45:30 PM |
| `organization_name` | Organization name | Your Org |
| `contact_email` | Contact email | info@yourorg.com |
| `contact_phone` | Contact phone | +1 (555) 123-4567 |
| `contact_address` | Contact address | 123 Main St |
| `privacy_url` | Privacy policy URL | /privacy |
| `terms_url` | Terms of service URL | /terms |
| `contact_url` | Contact page URL | /contact |

### Template Syntax

Use double curly braces for variable replacement:

```html
<p>Dear {{customer_name}},</p>
<p>Your payment of ${{amount}} {{currency}} has been processed.</p>
<p>Transaction ID: {{transaction_id}}</p>
```

## Language Support

### Supported Languages

- **English (en)** - Default language
- **Spanish (es)** - Full translation support

### Language Detection

The system detects language in this order:

1. Transaction metadata (`transaction.metadata.language`)
2. Customer email domain hints (`.es`, `.mx`, `.ar` → Spanish)
3. Environment variable (`GLOBAL_LANG` or `DEFAULT_LANGUAGE`)
4. Default fallback (`en`)

### Adding New Languages

1. Create language directory: `src/lib/email/templates/{lang}/`
2. Add template file: `transaction_receipt.html`
3. Add subjects file: `subjects.json`
4. Update `supportedLanguages` in `template-service.ts`

## Testing

### Test Endpoints

```bash
# Check configuration
GET /test-email/config

# Send test receipt
POST /test-email/receipt
{
  "email": "test@example.com",
  "name": "Test User",
  "language": "es"
}

# Preview template
GET /test-email/preview/es
GET /test-email/preview/en

# Get template info
GET /test-email/template-info
```

### Test Email Configuration

```typescript
import { receiptService } from '@/lib/email/receipt-service';

// Test email setup
const result = await receiptService.testEmailConfiguration();
console.log(result);
```

## Webhook Integration

The email system is automatically integrated with the webhook processor:

```typescript
// In webhook processor
if (newStatus === PaymentStatus.SUCCEEDED) {
  try {
    const updatedPayment = await paymentRepo.findById(payment.id);
    if (updatedPayment) {
      await receiptService.sendTransactionReceipt(updatedPayment);
    }
  } catch (emailError) {
    console.error('Failed to send receipt:', emailError);
    // Webhook processing continues even if email fails
  }
}
```

## Error Handling

### Graceful Degradation

- Email failures don't affect payment processing
- Automatic retry with exponential backoff
- Detailed error logging
- Fallback to mock mode if API key missing

### Common Issues

1. **Missing API Key**: System logs warning and skips email
2. **Template Not Found**: Falls back to default language
3. **Invalid Email**: Logs error and continues
4. **API Failure**: Retries up to 3 times with backoff

## Security

### Best Practices

- API keys stored in environment variables
- No sensitive data in email templates
- Tracking pixels for open/click analytics
- Reply-to addresses for customer support

### Data Privacy

- Only necessary transaction data included
- No payment method details in emails
- Compliant with privacy policies
- Customer can opt-out via contact methods

## Performance

### Optimizations

- Singleton service instances
- Template caching
- Async email sending
- Non-blocking webhook processing

### Monitoring

- Success/failure logging
- Email delivery tracking
- Template rendering metrics
- API response monitoring

## Customization

### Template Customization

1. Edit HTML templates in `src/lib/email/templates/{lang}/`
2. Modify CSS styles inline
3. Add new variables in `receipt-service.ts`
4. Update subject templates in `subjects.json`

### Service Extension

```typescript
// Extend receipt service
class CustomReceiptService extends ReceiptService {
  async sendDonationReceipt(transaction: TransactionData) {
    const customVariables = {
      tax_deductible: 'true',
      charity_number: '123456789'
    };
    
    return await this.sendCustomReceipt(
      transaction,
      customVariables,
      'donation_receipt'
    );
  }
}
```

This completes the comprehensive email system documentation for Bridge-Payments!
