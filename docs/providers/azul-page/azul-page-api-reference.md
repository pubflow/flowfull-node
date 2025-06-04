# 🇩🇴 Azul Checkout - API Technical Reference

Referencia técnica completa para la integración de **Azul Checkout** con especificaciones detalladas de parámetros, respuestas y callbacks.

## 🔗 Endpoints

### Azul Payment Page URLs
- **Production**: `https://pagos.azul.com.do/PaymentPage`
- **Sandbox**: `https://pruebas.azul.com.do/PaymentPage`
- **Method**: `POST`
- **Content-Type**: `application/x-www-form-urlencoded`

## 📝 Request Parameters

### Required Parameters

| Parameter | Type | Description | Example |
|-----------|------|-------------|---------|
| `MerchantId` | string | Merchant identifier | `"123456"` |
| `MerchantName` | string | Merchant display name | `"Tu Tienda Online"` |
| `MerchantType` | string | Type of merchant | `"E-Commerce"` |
| `CurrencyCode` | string | Currency code | `"214"` (DOP), `"840"` (USD) |
| `OrderNumber` | string | Unique order identifier | `"ORDER_12345"` |
| `Amount` | string | Payment amount | `"2999.00"` |
| `ApprovedUrl` | string | Success callback URL | `"https://site.com/success"` |
| `DeclinedUrl` | string | Failure callback URL | `"https://site.com/failed"` |
| `CancelUrl` | string | Cancel callback URL | `"https://site.com/cancel"` |

### Optional Parameters

| Parameter | Type | Description | Example |
|-----------|------|-------------|---------|
| `ITBIS` | string | Tax amount (18% for DOP) | `"539.82"` |
| `UseSSL` | string | Force SSL | `"1"` |
| `CustomerEmail` | string | Customer email | `"user@example.com"` |
| `ProductDescription` | string | Product description | `"Plan Premium"` |
| `AuthHash` | string | Security hash | `"calculated_hash"` |
| `MerchantPhone` | string | Merchant phone | `"+1-809-555-0123"` |
| `Custom1` | string | Custom field 1 | `"metadata1"` |
| `Custom2` | string | Custom field 2 | `"metadata2"` |

## 🔐 AuthHash Calculation

### Hash Algorithm
```javascript
// AuthHash calculation (SHA-512)
const calculateAuthHash = (params, secretKey) => {
  // 1. Sort parameters alphabetically (exclude AuthHash itself)
  const sortedParams = Object.keys(params)
    .filter(key => key !== 'AuthHash')
    .sort()
    .map(key => params[key])
    .join('|');
  
  // 2. Append secret key
  const hashString = sortedParams + '|' + secretKey;
  
  // 3. Calculate SHA-512 hash
  const hash = crypto
    .createHash('sha512')
    .update(hashString, 'utf8')
    .digest('hex')
    .toUpperCase();
  
  return hash;
};
```

### Example Hash Calculation
```javascript
const params = {
  MerchantId: "123456",
  OrderNumber: "ORDER_12345",
  Amount: "2999.00",
  CurrencyCode: "214"
};

const secretKey = "your_secret_key";
const authHash = calculateAuthHash(params, secretKey);

// Final parameters with hash
const finalParams = {
  ...params,
  AuthHash: authHash
};
```

## 📋 Complete Form Example

### HTML Form Generation
```html
<form action="https://pagos.azul.com.do/PaymentPage" method="POST" id="azul-payment-form">
  <!-- Required Parameters -->
  <input type="hidden" name="MerchantId" value="123456">
  <input type="hidden" name="MerchantName" value="Tu Tienda Online">
  <input type="hidden" name="MerchantType" value="E-Commerce">
  <input type="hidden" name="CurrencyCode" value="214">
  <input type="hidden" name="OrderNumber" value="ORDER_12345">
  <input type="hidden" name="Amount" value="2999.00">
  <input type="hidden" name="ITBIS" value="539.82">
  
  <!-- Callback URLs -->
  <input type="hidden" name="ApprovedUrl" value="https://tu-sitio.com/payment/success">
  <input type="hidden" name="DeclinedUrl" value="https://tu-sitio.com/payment/failed">
  <input type="hidden" name="CancelUrl" value="https://tu-sitio.com/payment/cancel">
  
  <!-- Optional Parameters -->
  <input type="hidden" name="UseSSL" value="1">
  <input type="hidden" name="CustomerEmail" value="cliente@ejemplo.com">
  <input type="hidden" name="ProductDescription" value="Plan Premium">
  
  <!-- Security Hash -->
  <input type="hidden" name="AuthHash" value="calculated_hash_value">
  
  <!-- Submit Button -->
  <button type="submit">Pagar con Azul</button>
</form>
```

### JavaScript Form Generation
```javascript
const generateAzulForm = (paymentData) => {
  const form = document.createElement('form');
  form.method = 'POST';
  form.action = getAzulUrl(); // Production or Sandbox
  
  const parameters = {
    MerchantId: process.env.AZUL_CHECKOUT_MERCHANT_ID,
    MerchantName: process.env.AZUL_CHECKOUT_MERCHANT_NAME,
    MerchantType: 'E-Commerce',
    CurrencyCode: paymentData.currency === 'DOP' ? '214' : '840',
    OrderNumber: paymentData.order_number,
    Amount: (paymentData.amount_cents / 100).toFixed(2),
    ITBIS: calculateITBIS(paymentData.amount_cents, paymentData.currency),
    ApprovedUrl: `${process.env.BASE_URL}/payment/success`,
    DeclinedUrl: `${process.env.BASE_URL}/payment/failed`,
    CancelUrl: `${process.env.BASE_URL}/payment/cancel`,
    UseSSL: '1',
    CustomerEmail: paymentData.customer_email,
    ProductDescription: paymentData.description
  };
  
  // Calculate AuthHash
  parameters.AuthHash = calculateAuthHash(parameters, process.env.AZUL_CHECKOUT_AUTH_HASH_KEY);
  
  // Create hidden inputs
  Object.entries(parameters).forEach(([key, value]) => {
    const input = document.createElement('input');
    input.type = 'hidden';
    input.name = key;
    input.value = value;
    form.appendChild(input);
  });
  
  return form;
};
```

## 📊 Response/Callback Parameters

### Success Callback (ApprovedUrl)
```
GET /payment/success?OrderNumber=ORDER_12345&AzulOrderId=987654321&ResponseCode=00&AuthorizationCode=123456&Amount=2999.00&ResponseMessage=APROBADA&AuthHash=response_hash
```

| Parameter | Type | Description |
|-----------|------|-------------|
| `OrderNumber` | string | Original order number |
| `AzulOrderId` | string | Azul internal order ID |
| `ResponseCode` | string | Response code (`00` = approved) |
| `AuthorizationCode` | string | Authorization code |
| `Amount` | string | Transaction amount |
| `ResponseMessage` | string | Response message |
| `AuthHash` | string | Response hash for validation |

### Failure Callback (DeclinedUrl)
```
GET /payment/failed?OrderNumber=ORDER_12345&ResponseCode=05&ResponseMessage=DECLINADA&AuthHash=response_hash
```

| Parameter | Type | Description |
|-----------|------|-------------|
| `OrderNumber` | string | Original order number |
| `ResponseCode` | string | Error code (`05` = declined) |
| `ResponseMessage` | string | Error message |
| `AuthHash` | string | Response hash for validation |

### Cancel Callback (CancelUrl)
```
GET /payment/cancel?OrderNumber=ORDER_12345&ResponseCode=CANCEL&ResponseMessage=CANCELADA&AuthHash=response_hash
```

## 🔢 Response Codes

### Success Codes
| Code | Description | Action |
|------|-------------|--------|
| `00` | APROBADA | Payment approved successfully |

### Decline Codes
| Code | Description | Action |
|------|-------------|--------|
| `05` | DECLINADA | Generic decline |
| `14` | NUMERO INVALIDO | Invalid card number |
| `54` | TARJETA VENCIDA | Expired card |
| `61` | EXCEDE LIMITE | Exceeds limit |
| `96` | ERROR SISTEMA | System error |

### Special Codes
| Code | Description | Action |
|------|-------------|--------|
| `CANCEL` | CANCELADA | User canceled payment |
| `TIMEOUT` | TIMEOUT | Session timeout |

## 🌍 Currency Codes

| Currency | Code | Description |
|----------|------|-------------|
| **DOP** | 214 | Dominican Peso |
| **USD** | 840 | US Dollar |

## 💰 Amount Formatting

### DOP (Dominican Peso)
```javascript
// Amount in centavos → Azul format
const formatDOPAmount = (amountCents) => {
  return (amountCents / 100).toFixed(2); // "2999.00"
};

// ITBIS calculation (18%)
const calculateITBIS = (amountCents) => {
  const itbis = Math.round(amountCents * 0.18);
  return (itbis / 100).toFixed(2); // "539.82"
};
```

### USD (US Dollar)
```javascript
// Amount in cents → Azul format
const formatUSDAmount = (amountCents) => {
  return (amountCents / 100).toFixed(2); // "50.00"
};
```

## 🔒 Security Validation

### Callback Hash Validation
```javascript
const validateCallbackHash = (callbackParams) => {
  const { AuthHash, ...paramsToHash } = callbackParams;
  
  // Sort parameters alphabetically
  const sortedValues = Object.keys(paramsToHash)
    .sort()
    .map(key => paramsToHash[key])
    .join('|');
  
  // Calculate expected hash
  const hashString = sortedValues + '|' + process.env.AZUL_CHECKOUT_AUTH_HASH_KEY;
  const expectedHash = crypto
    .createHash('sha512')
    .update(hashString, 'utf8')
    .digest('hex')
    .toUpperCase();
  
  return AuthHash === expectedHash;
};
```

### URL Validation
```javascript
const validateCallbackUrl = (url, allowedUrls) => {
  try {
    const parsedUrl = new URL(url);
    return allowedUrls.some(allowed => {
      const parsedAllowed = new URL(allowed);
      return parsedUrl.origin === parsedAllowed.origin &&
             parsedUrl.pathname === parsedAllowed.pathname;
    });
  } catch {
    return false;
  }
};
```

## 📱 Mobile Considerations

### Viewport Meta Tag
```html
<meta name="viewport" content="width=device-width, initial-scale=1.0">
```

### Mobile-Optimized Form
```css
.azul-payment-form {
  max-width: 100%;
  padding: 20px;
  box-sizing: border-box;
}

.pay-button {
  width: 100%;
  min-height: 44px; /* iOS touch target */
  font-size: 16px; /* Prevent zoom on iOS */
}
```

## 🔄 Integration with Bridge-Payments

### Payment Intent Creation
```javascript
// Bridge-Payments API call
POST /bridge-payment/payments
{
  "amount": 299900,
  "currency": "DOP",
  "provider": "azul_checkout",
  "description": "Plan Premium",
  "customer_email": "cliente@ejemplo.com",
  "return_url": "https://tu-sitio.com/payment/return",
  "cancel_url": "https://tu-sitio.com/payment/cancel"
}

// Response
{
  "id": "pi_azul_checkout_123",
  "status": "requires_action",
  "next_action": {
    "type": "redirect",
    "redirect_url": "https://pagos.azul.com.do/PaymentPage",
    "form_data": {
      "MerchantId": "123456",
      "OrderNumber": "ORDER_12345",
      "Amount": "2999.00",
      // ... all form parameters
    }
  }
}
```

### Callback Processing
```javascript
// Callback endpoint
GET /bridge-payment/callbacks/azul-page?OrderNumber=ORDER_12345&ResponseCode=00&...

// Internal processing
const processCallback = async (params) => {
  // 1. Validate hash
  if (!validateCallbackHash(params)) {
    throw new Error('Invalid callback hash');
  }
  
  // 2. Find payment by order number
  const payment = await findPaymentByOrderNumber(params.OrderNumber);
  
  // 3. Update payment status
  const status = mapResponseCodeToStatus(params.ResponseCode);
  await updatePaymentStatus(payment.id, {
    status,
    provider_payment_id: params.AzulOrderId,
    metadata: {
      azul_response: params
    }
  });
  
  // 4. Trigger webhooks/events
  await triggerPaymentEvent(payment.id, status);
};
```

## 🧪 Testing

### Test Parameters
```javascript
const testPayment = {
  MerchantId: "test_merchant_123",
  OrderNumber: "TEST_ORDER_" + Date.now(),
  Amount: "100.00",
  CurrencyCode: "214",
  CustomerEmail: "test@ejemplo.com"
};
```

### Sandbox Testing
- Use sandbox URL: `https://pruebas.azul.com.do/PaymentPage`
- Test with provided test card numbers
- Verify all callback scenarios

## 📈 Error Handling

### Common Errors
```javascript
const errorHandling = {
  'INVALID_MERCHANT': 'Invalid merchant configuration',
  'INVALID_AMOUNT': 'Invalid amount format',
  'INVALID_CURRENCY': 'Unsupported currency',
  'INVALID_HASH': 'Security hash validation failed',
  'CALLBACK_TIMEOUT': 'Callback not received within timeout',
  'DUPLICATE_ORDER': 'Order number already exists'
};
```

### Retry Logic
```javascript
const retryCallback = async (orderNumber, maxRetries = 3) => {
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      const status = await checkPaymentStatus(orderNumber);
      if (status !== 'pending') {
        return status;
      }
      
      // Wait before retry
      await new Promise(resolve => 
        setTimeout(resolve, attempt * 2000)
      );
    } catch (error) {
      if (attempt === maxRetries) throw error;
    }
  }
};
```

## 🗄️ Database Storage

### Payment Storage in Existing Schema

```javascript
// Payments table record for azul_checkout
{
  "id": "pi_azul_checkout_123",
  "provider_id": "azul_checkout",
  "provider_payment_id": "ORDER_12345", // Order Number
  "amount_cents": 299900,
  "currency": "DOP",
  "status": "requires_action", // → completed/failed/canceled
  "metadata": {
    "azul_checkout_data": {
      "order_number": "ORDER_12345",
      "merchant_id": "123456",
      "redirect_url": "https://pagos.azul.com.do/PaymentPage",
      "form_parameters": {
        "MerchantId": "123456",
        "Amount": "2999.00",
        "CurrencyCode": "214"
      }
    },
    "azul_response": {
      "azul_order_id": "987654321", // After callback
      "authorization_code": "123456",
      "response_code": "00",
      "response_message": "APROBADA"
    }
  }
}
```

### Useful Queries

```sql
-- Find payment by order number
SELECT * FROM payments
WHERE provider_id = 'azul_checkout'
AND JSON_EXTRACT(metadata, '$.azul_checkout_data.order_number') = 'ORDER_12345';

-- Get pending redirects
SELECT * FROM payments
WHERE provider_id = 'azul_checkout'
AND status = 'requires_action'
AND created_at > DATE_SUB(NOW(), INTERVAL 1 HOUR);

-- Payment success rate
SELECT
  JSON_EXTRACT(metadata, '$.azul_response.response_code') as response_code,
  COUNT(*) as count,
  SUM(amount_cents) as total_amount
FROM payments
WHERE provider_id = 'azul_checkout'
AND JSON_EXTRACT(metadata, '$.azul_response.response_code') IS NOT NULL
GROUP BY JSON_EXTRACT(metadata, '$.azul_response.response_code');
```

---

Esta referencia técnica proporciona todas las especificaciones necesarias para implementar correctamente la integración con Azul Página de Pagos, incluyendo parámetros, validaciones de seguridad y manejo de respuestas.
