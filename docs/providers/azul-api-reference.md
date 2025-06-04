# 🇩🇴 Azul API Technical Reference

Technical documentation for Azul payment gateway API integration with detailed request/response specifications.

## 🔗 API Endpoints

### Production Environment
- **Base URL**: `https://pagos.azul.com.do/WebServices/JSON/default.aspx`
- **Protocol**: HTTPS only
- **Method**: POST
- **Content-Type**: `application/json`

### Sandbox Environment
- **Base URL**: `https://pruebas.azul.com.do/WebServices/JSON/default.aspx`
- **Protocol**: HTTPS only
- **Method**: POST
- **Content-Type**: `application/json`

## 🔐 Authentication

### Authentication Parameters
```json
{
  "MerchantId": "your_merchant_id",
  "Auth1": "your_auth1_key",
  "Auth2": "your_auth2_key"
}
```

### Request Signing (Optional)
```javascript
// HMAC-SHA256 signature for enhanced security
const signature = crypto
  .createHmac('sha256', secretKey)
  .update(requestBody)
  .digest('hex');
```

## 💳 Transaction Types

### Sale Transaction (Direct Payment)
```json
{
  "MerchantId": "123456",
  "Auth1": "auth1_key",
  "Auth2": "auth2_key",
  "Channel": "EC",
  "Store": "38",
  "PosInputMode": "E-Commerce",
  "TrxType": "Sale",
  "Amount": "2999.00",
  "CurrencyPosCode": "214", // DOP
  "CardNumber": "4111111111111111",
  "Expiration": "1225", // MMYY
  "CVC": "123",
  "CustomOrderId": "ORDER_12345",
  "DataVaultToken": "", // For tokenized payments
  "Itbis": "537.82", // Dominican tax (18%)
  "ECommerceUrl": "https://your-site.com",
  "AcquirerRefData": "1",
  "RRN": "123456789012"
}
```

### Authorization Transaction
```json
{
  "MerchantId": "123456",
  "Auth1": "auth1_key",
  "Auth2": "auth2_key",
  "Channel": "EC",
  "Store": "38",
  "PosInputMode": "E-Commerce",
  "TrxType": "Auth",
  "Amount": "2999.00",
  "CurrencyPosCode": "214",
  "CardNumber": "4111111111111111",
  "Expiration": "1225",
  "CVC": "123",
  "CustomOrderId": "AUTH_12345"
}
```

### Capture Transaction
```json
{
  "MerchantId": "123456",
  "Auth1": "auth1_key",
  "Auth2": "auth2_key",
  "Channel": "EC",
  "Store": "38",
  "TrxType": "PostAuth",
  "Amount": "2999.00",
  "CurrencyPosCode": "214",
  "AzulOrderId": "original_azul_order_id",
  "CustomOrderId": "CAPTURE_12345"
}
```

### Void Transaction
```json
{
  "MerchantId": "123456",
  "Auth1": "auth1_key",
  "Auth2": "auth2_key",
  "Channel": "EC",
  "Store": "38",
  "TrxType": "Void",
  "AzulOrderId": "original_azul_order_id",
  "CustomOrderId": "VOID_12345"
}
```

### Refund Transaction
```json
{
  "MerchantId": "123456",
  "Auth1": "auth1_key",
  "Auth2": "auth2_key",
  "Channel": "EC",
  "Store": "38",
  "TrxType": "Refund",
  "Amount": "1500.00", // Partial refund amount
  "CurrencyPosCode": "214",
  "AzulOrderId": "original_azul_order_id",
  "CustomOrderId": "REFUND_12345"
}
```

## 🏦 DataVault (Tokenization)

### Create Token
```json
{
  "MerchantId": "123456",
  "Auth1": "auth1_key",
  "Auth2": "auth2_key",
  "Channel": "EC",
  "Store": "38",
  "TrxType": "Create",
  "CardNumber": "4111111111111111",
  "Expiration": "1225",
  "CVC": "123",
  "CardHolderName": "Juan Perez"
}
```

### Use Token for Payment
```json
{
  "MerchantId": "123456",
  "Auth1": "auth1_key",
  "Auth2": "auth2_key",
  "Channel": "EC",
  "Store": "38",
  "TrxType": "Sale",
  "Amount": "2999.00",
  "CurrencyPosCode": "214",
  "DataVaultToken": "token_from_create_response",
  "CustomOrderId": "TOKEN_PAYMENT_12345"
}
```

### Delete Token
```json
{
  "MerchantId": "123456",
  "Auth1": "auth1_key",
  "Auth2": "auth2_key",
  "Channel": "EC",
  "Store": "38",
  "TrxType": "Delete",
  "DataVaultToken": "token_to_delete"
}
```

## 📊 Response Format

### Successful Response
```json
{
  "ResponseCode": "00",
  "ResponseMessage": "APROBADA",
  "AuthorizationCode": "123456",
  "DateTime": "20241202131626",
  "AzulOrderId": "987654321",
  "CustomOrderId": "ORDER_12345",
  "RRN": "123456789012",
  "LotNumber": "001",
  "Ticket": "1234",
  "IsoCode": "00",
  "DataVaultToken": "token_if_requested",
  "DataVaultBrand": "VISA",
  "DataVaultExpiration": "1225",
  "ErrorDescription": ""
}
```

### Error Response
```json
{
  "ResponseCode": "05",
  "ResponseMessage": "DECLINADA",
  "AuthorizationCode": "",
  "DateTime": "20241202131626",
  "AzulOrderId": "",
  "CustomOrderId": "ORDER_12345",
  "RRN": "",
  "LotNumber": "",
  "Ticket": "",
  "IsoCode": "05",
  "DataVaultToken": "",
  "DataVaultBrand": "",
  "DataVaultExpiration": "",
  "ErrorDescription": "FONDOS INSUFICIENTES"
}
```

## 🔢 Response Codes

### Success Codes
| Code | Description | Action |
|------|-------------|--------|
| `00` | APROBADA | Transaction approved |
| `08` | APROBADA CON ID | Approved with ID verification |

### Decline Codes
| Code | Description | Action |
|------|-------------|--------|
| `05` | DECLINADA | Generic decline |
| `14` | NUMERO INVALIDO | Invalid card number |
| `54` | TARJETA VENCIDA | Expired card |
| `61` | EXCEDE LIMITE | Exceeds limit |
| `62` | TARJETA RESTRINGIDA | Restricted card |
| `65` | EXCEDE FRECUENCIA | Exceeds frequency |
| `78` | TARJETA NO ACTIVA | Card not active |
| `96` | ERROR SISTEMA | System error |

### Special Codes
| Code | Description | Action |
|------|-------------|--------|
| `Error` | System Error | Check ErrorDescription field |
| `Timeout` | Request Timeout | Retry transaction |

## 🌍 Currency Codes

### Supported Currencies
| Currency | Code | Description |
|----------|------|-------------|
| **DOP** | 214 | Dominican Peso (Primary) |
| **USD** | 840 | US Dollar (Secondary) |

### Amount Format
- **DOP**: `"2999.00"` (RD$2,999.00)
- **USD**: `"50.00"` ($50.00)
- **Decimals**: Always include 2 decimal places

## 🛡️ 3D Secure 2.0

### 3DS Authentication Request
```json
{
  "MerchantId": "123456",
  "Auth1": "auth1_key",
  "Auth2": "auth2_key",
  "Channel": "EC",
  "Store": "38",
  "TrxType": "Sale",
  "Amount": "2999.00",
  "CurrencyPosCode": "214",
  "CardNumber": "4111111111111111",
  "Expiration": "1225",
  "CVC": "123",
  "CustomOrderId": "3DS_12345",
  "ThreeDSRequestorChallengeInd": "01", // Challenge preference
  "ThreeDSRequestorAuthenticationInd": "01", // Authentication type
  "BrowserAcceptHeader": "text/html,application/xhtml+xml",
  "BrowserJavaEnabled": "true",
  "BrowserLanguage": "es-DO",
  "BrowserColorDepth": "24",
  "BrowserScreenHeight": "1080",
  "BrowserScreenWidth": "1920",
  "BrowserTZ": "-240", // Timezone offset
  "BrowserUserAgent": "Mozilla/5.0..."
}
```

### 3DS Response (Challenge Required)
```json
{
  "ResponseCode": "3DS",
  "ResponseMessage": "3D SECURE REQUIRED",
  "ThreeDSServerTransID": "3ds_server_trans_id",
  "ACSUrl": "https://acs.bank.com/3ds",
  "PAReq": "base64_encoded_pareq",
  "TermUrl": "https://your-site.com/3ds/return",
  "MD": "merchant_data"
}
```

## 📱 Mobile Integration

### Mobile-Specific Parameters
```json
{
  "Channel": "EC",
  "PosInputMode": "Mobile",
  "DeviceType": "Mobile",
  "AppName": "YourApp",
  "AppVersion": "1.0.0",
  "DeviceId": "unique_device_id",
  "IPAddress": "192.168.1.1"
}
```

## 🔔 Webhooks (Notifications)

### Webhook Endpoint Setup
- **URL**: Your webhook endpoint
- **Method**: POST
- **Content-Type**: `application/json`
- **Authentication**: HMAC signature verification

### Webhook Payload
```json
{
  "NotificationId": "notif_12345",
  "EventType": "payment.completed",
  "Timestamp": "2024-12-02T13:16:26Z",
  "MerchantId": "123456",
  "Data": {
    "AzulOrderId": "987654321",
    "CustomOrderId": "ORDER_12345",
    "Amount": "2999.00",
    "Currency": "DOP",
    "ResponseCode": "00",
    "AuthorizationCode": "123456",
    "TransactionType": "Sale",
    "CardBrand": "VISA",
    "LastFourDigits": "1111"
  },
  "Signature": "hmac_sha256_signature"
}
```

### Webhook Events
- `payment.completed` - Payment successfully processed
- `payment.failed` - Payment failed or declined
- `payment.authorized` - Payment authorized
- `payment.captured` - Authorization captured
- `payment.voided` - Payment voided
- `payment.refunded` - Payment refunded

## ⚠️ Error Handling

### Network Errors
```javascript
// Handle timeout
if (error.code === 'TIMEOUT') {
  // Retry with exponential backoff
  await retryWithBackoff(request);
}

// Handle connection errors
if (error.code === 'ECONNRESET') {
  // Check transaction status before retry
  const status = await checkTransactionStatus(orderId);
  if (status === 'pending') {
    await retryTransaction(request);
  }
}
```

### Duplicate Transaction Prevention
```json
{
  "CustomOrderId": "unique_order_id_12345",
  "IdempotencyKey": "idem_key_67890" // Prevent duplicates
}
```

## 🔍 Transaction Status Check

### Status Inquiry Request
```json
{
  "MerchantId": "123456",
  "Auth1": "auth1_key",
  "Auth2": "auth2_key",
  "TrxType": "Status",
  "AzulOrderId": "987654321"
}
```

### Status Response
```json
{
  "ResponseCode": "00",
  "TransactionStatus": "Approved",
  "Amount": "2999.00",
  "AuthorizationCode": "123456",
  "DateTime": "20241202131626",
  "SettlementStatus": "Pending"
}
```

## 📈 Rate Limits

### API Limits
- **Transactions**: 100 per minute
- **Status Checks**: 200 per minute
- **Token Operations**: 50 per minute

### Best Practices
- Implement exponential backoff
- Cache transaction results
- Use idempotency keys
- Monitor rate limit headers

## 🗄️ Data Storage Mapping

### Uso del Esquema Existente

**✅ Azul utiliza el esquema multipropósito existente con metadata JSON**

#### Mapeo de Respuesta Azul → Payments Table
```javascript
// Respuesta de Azul API
{
  "ResponseCode": "00",
  "ResponseMessage": "APROBADA",
  "AuthorizationCode": "123456",
  "AzulOrderId": "987654321",
  "RRN": "123456789012"
}

// Se almacena en payments table como:
{
  "provider_id": "azul",
  "provider_payment_id": "987654321", // AzulOrderId
  "status": "completed", // Mapeado desde ResponseCode
  "metadata": {
    "azul_order_id": "987654321",
    "authorization_code": "123456",
    "response_code": "00",
    "response_message": "APROBADA",
    "rrn": "123456789012",
    "transaction_type": "Sale",
    "currency_pos_code": "214"
  }
}
```

#### Mapeo de DataVault → Payment Methods Table
```javascript
// Respuesta de DataVault
{
  "ResponseCode": "00",
  "DataVaultToken": "token_abc123",
  "DataVaultBrand": "VISA",
  "DataVaultExpiration": "1225"
}

// Se almacena en payment_methods table como:
{
  "provider_id": "azul",
  "provider_payment_method_id": "token_abc123", // DataVaultToken
  "payment_type": "credit_card",
  "card_brand": "visa", // Mapeado desde DataVaultBrand
  "metadata": {
    "azul_token": "token_abc123",
    "azul_brand": "VISA",
    "azul_expiration": "1225",
    "token_created_at": "2024-12-02T13:16:26Z",
    "validation_status": "validated"
  }
}
```

#### Mapeo de Webhooks → Payment Webhooks Table
```javascript
// Webhook payload de Azul
{
  "NotificationId": "notif_12345",
  "EventType": "payment.completed",
  "Data": {
    "AzulOrderId": "987654321",
    "Amount": "2999.00",
    "ResponseCode": "00"
  }
}

// Se almacena en payment_webhooks table como:
{
  "provider_id": "azul",
  "event_type": "payment.completed",
  "payload": {
    "NotificationId": "notif_12345",
    "EventType": "payment.completed",
    "Data": {...}
  },
  "processed": false
}
```

### Índices Recomendados para Performance

```sql
-- Índice para búsquedas por Azul Order ID
CREATE INDEX idx_payments_azul_order_id
ON payments ((JSON_EXTRACT(metadata, '$.azul_order_id')))
WHERE provider_id = 'azul';

-- Índice para tokens DataVault
CREATE INDEX idx_payment_methods_azul_token
ON payment_methods ((JSON_EXTRACT(metadata, '$.azul_token')))
WHERE provider_id = 'azul';

-- Índice para códigos de respuesta
CREATE INDEX idx_payments_azul_response_code
ON payments ((JSON_EXTRACT(metadata, '$.response_code')))
WHERE provider_id = 'azul';
```

---

This technical reference provides all the necessary details for implementing Azul payment gateway integration with proper error handling, security, and best practices.
