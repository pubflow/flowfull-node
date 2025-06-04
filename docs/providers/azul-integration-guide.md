# 🇩🇴 Azul Payment Gateway - Complete Integration Guide

Comprehensive guide for integrating Azul (Dominican Republic) payments with Bridge-Payments API. Support for Dominican Peso (DOP), local cards, and international payment methods.

## 🚀 Quick Start

### 1. Basic Azul Payment

```javascript
// Create an Azul payment in Dominican Pesos
const response = await fetch('/bridge-payment/payments', {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'X-Session-ID': userSessionId
  },
  body: JSON.stringify({
    amount: 299900, // RD$2,999.00 (in centavos)
    currency: 'DOP',
    description: 'Plan Premium',
    provider: 'azul'
  })
});

const payment = await response.json();
console.log('Pago creado:', payment);
```

### 2. Payment with Dominican Credit Card

```javascript
// Payment with local Dominican card
const payment = await fetch('/bridge-payment/payments', {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'X-Session-ID': userSessionId
  },
  body: JSON.stringify({
    amount: 150000, // RD$1,500.00
    currency: 'DOP',
    description: 'Compra en línea',
    provider: 'azul',
    payment_method: {
      type: 'credit_card',
      card: {
        number: '4111111111111111',
        exp_month: 12,
        exp_year: 2025,
        cvc: '123'
      },
      billing_details: {
        name: 'Juan Pérez',
        email: 'juan@ejemplo.com',
        phone: '+1-809-555-0123',
        address: {
          line1: 'Calle Principal #123',
          line2: 'Apt 4B',
          city: 'Santo Domingo',
          state: 'Distrito Nacional',
          postal_code: '10101',
          country: 'DO'
        }
      }
    }
  })
});
```

## 🔧 Configuration

### Environment Variables

```env
# Azul Configuration
AZUL_MERCHANT_ID=your_merchant_id
AZUL_AUTH1=your_auth1_key
AZUL_AUTH2=your_auth2_key
AZUL_ENVIRONMENT=sandbox  # or 'production'
AZUL_CERTIFICATE_PATH=/path/to/certificate.pem  # Optional

# Enable Azul
ENABLED_PROVIDERS=stripe,paypal,authorize_net,azul
```

### Sandbox vs Production

**Sandbox (Pruebas):**
- Merchant ID: Use your test merchant ID
- Auth Keys: Use your sandbox authentication keys
- Environment: `sandbox`
- Test URL: `https://pruebas.azul.com.do/WebServices/JSON/default.aspx`

**Production (Producción):**
- Merchant ID: Use your live merchant ID
- Auth Keys: Use your production authentication keys
- Environment: `production`
- Live URL: `https://pagos.azul.com.do/WebServices/JSON/default.aspx`

## 💳 Payment Methods

### Supported Payment Types

| Payment Method | Azul Support | Bridge-Payments API |
|---------------|--------------|-------------------|
| **Credit Cards** | ✅ Visa, MC, Amex | `credit_card` |
| **Debit Cards** | ✅ Local Dominican banks | `debit_card` |
| **International Cards** | ✅ Global acceptance | `credit_card` |
| **Digital Wallets** | ❌ Not supported | N/A |

### Dominican Credit Card Payment

```javascript
const payment = await fetch('/bridge-payment/payments', {
  method: 'POST',
  body: JSON.stringify({
    amount: 250000, // RD$2,500.00
    currency: 'DOP',
    provider: 'azul',
    payment_method: {
      type: 'credit_card',
      card: {
        number: '4111111111111111',
        exp_month: 12,
        exp_year: 2025,
        cvc: '123'
      },
      billing_details: {
        name: 'María González',
        email: 'maria@ejemplo.com',
        phone: '+1-809-555-0456',
        tax_id: '12345678901', // RNC (Registro Nacional del Contribuyente)
        address: {
          line1: 'Av. 27 de Febrero #456',
          city: 'Santiago',
          state: 'Santiago',
          postal_code: '51000',
          country: 'DO'
        }
      }
    }
  })
});
```

### International Card Payment (USD)

```javascript
const payment = await fetch('/bridge-payment/payments', {
  method: 'POST',
  body: JSON.stringify({
    amount: 5000, // $50.00 USD
    currency: 'USD',
    provider: 'azul',
    payment_method: {
      type: 'credit_card',
      card: {
        number: '5555555555554444', // Mastercard
        exp_month: 6,
        exp_year: 2026,
        cvc: '456'
      }
    }
  })
});
```

## 👤 Customer Management

### Create Customer Profile

```javascript
const customer = await fetch('/bridge-payment/customers', {
  method: 'POST',
  body: JSON.stringify({
    email: 'cliente@ejemplo.com',
    name: 'Carlos Rodríguez',
    phone: '+1-809-555-0789',
    provider: 'azul',
    metadata: {
      rnc: '12345678901', // Dominican tax ID
      preferred_language: 'es-DO'
    }
  })
});
```

### Save Payment Method (DataVault)

```javascript
const paymentMethod = await fetch('/bridge-payment/payment-methods', {
  method: 'POST',
  body: JSON.stringify({
    provider: 'azul',
    customer_id: 'cust_azul_12345',
    type: 'credit_card',
    card: {
      number: '4111111111111111',
      exp_month: 12,
      exp_year: 2025,
      cvc: '123'
    },
    billing_details: {
      name: 'Ana Martínez',
      address: {
        line1: 'Calle Duarte #789',
        city: 'La Romana',
        state: 'La Romana',
        postal_code: '22000',
        country: 'DO'
      }
    }
  })
});
```

### Use Saved Payment Method

```javascript
const payment = await fetch('/bridge-payment/payments', {
  method: 'POST',
  body: JSON.stringify({
    amount: 180000, // RD$1,800.00
    currency: 'DOP',
    provider: 'azul',
    customer_id: 'cust_azul_12345',
    payment_method_id: 'pm_azul_67890'
  })
});
```

## 🔄 Authorization & Capture

### Authorization Flow

```javascript
// Step 1: Authorize (hold funds)
const auth = await fetch('/bridge-payment/payments', {
  method: 'POST',
  body: JSON.stringify({
    amount: 350000, // RD$3,500.00
    currency: 'DOP',
    provider: 'azul',
    capture_method: 'manual',
    description: 'Reserva de hotel'
  })
});

// Step 2: Capture (charge funds)
const capture = await fetch(`/bridge-payment/payments/${auth.id}/capture`, {
  method: 'POST',
  body: JSON.stringify({
    amount_cents: 300000 // Partial capture: RD$3,000.00
  })
});

// Alternative: Void (cancel authorization)
const void = await fetch(`/bridge-payment/payments/${auth.id}/cancel`, {
  method: 'POST'
});
```

## 🛡️ 3D Secure 2.0 Authentication

### Enhanced Security Flow

```javascript
const payment = await fetch('/bridge-payment/payments', {
  method: 'POST',
  body: JSON.stringify({
    amount: 500000, // RD$5,000.00
    currency: 'DOP',
    provider: 'azul',
    payment_method: {
      type: 'credit_card',
      card: {
        number: '4111111111111111',
        exp_month: 12,
        exp_year: 2025,
        cvc: '123'
      }
    },
    three_d_secure: {
      enabled: true,
      challenge_preference: 'challenge_preferred'
    },
    return_url: 'https://tu-sitio.com/payment/return',
    cancel_url: 'https://tu-sitio.com/payment/cancel'
  })
});

// Handle 3D Secure redirect
if (payment.status === 'requires_action' && payment.next_action?.type === '3d_secure_redirect') {
  window.location.href = payment.next_action.redirect_url;
}
```

## 💰 Refunds

### Full Refund

```javascript
const refund = await fetch('/bridge-payment/refunds', {
  method: 'POST',
  body: JSON.stringify({
    payment_intent_id: 'pi_azul_12345',
    reason: 'requested_by_customer'
  })
});
```

### Partial Refund

```javascript
const refund = await fetch('/bridge-payment/refunds', {
  method: 'POST',
  body: JSON.stringify({
    payment_intent_id: 'pi_azul_12345',
    amount_cents: 100000, // Refund RD$1,000.00 of original amount
    reason: 'partial_refund',
    description: 'Reembolso parcial por cancelación'
  })
});
```

## 🔔 Webhooks

### Supported Events

| Event Type | Description |
|------------|-------------|
| `payment.completed` | Pago completado exitosamente |
| `payment.failed` | Pago falló o fue declinado |
| `payment.authorized` | Pago autorizado (pendiente captura) |
| `payment.captured` | Pago autorizado capturado |
| `payment.voided` | Pago anulado |
| `payment.refunded` | Pago reembolsado |
| `fraud.detected` | Detección de fraude |
| `3ds.completed` | Autenticación 3D Secure completada |

### Webhook Setup

```javascript
// Webhook endpoint
app.post('/webhooks/azul', async (req, res) => {
  const signature = req.headers['x-azul-signature'];
  const payload = req.body;

  try {
    const event = await azulAdapter.verifyWebhook(
      JSON.stringify(payload),
      signature
    );

    switch (event.type) {
      case 'payment.completed':
        console.log('Pago completado:', event.data);
        break;
      case 'payment.failed':
        console.log('Pago falló:', event.data);
        break;
      case 'fraud.detected':
        console.log('Fraude detectado:', event.data);
        break;
    }

    res.status(200).send('OK');
  } catch (error) {
    console.error('Verificación de webhook falló:', error);
    res.status(400).send('Firma inválida');
  }
});
```

## 🌍 Currency Support

### Primary Currency: Dominican Peso (DOP)

```javascript
// Dominican Peso payment
const payment = {
  amount: 299900, // RD$2,999.00 (in centavos)
  currency: 'DOP',
  provider: 'azul'
};
```

### Secondary Currency: US Dollar (USD)

```javascript
// US Dollar payment (for international transactions)
const payment = {
  amount: 5000, // $50.00 USD (in cents)
  currency: 'USD',
  provider: 'azul'
};
```

### Currency Conversion

```javascript
// Automatic currency conversion
const payment = await fetch('/bridge-payment/payments', {
  method: 'POST',
  body: JSON.stringify({
    amount: 5000, // $50.00 USD
    currency: 'USD',
    provider: 'azul',
    convert_to: 'DOP', // Convert to Dominican Pesos
    exchange_rate: 58.50 // Optional: specify rate
  })
});
```

## 🛡️ Security & Compliance

### PCI Compliance
- **Level 1 PCI DSS** certified
- **DataVault Tokenization** for stored payment methods
- **No raw card data** stored in your system

### Fraud Prevention
- **Real-time fraud detection**
- **Velocity checking**
- **Geolocation validation**
- **Device fingerprinting**

### Dominican Regulations
- **Superintendencia de Bancos** compliance
- **BCRD (Banco Central)** regulations
- **Local tax requirements** (ITBIS)

## 🔧 Error Handling

### Common Error Codes

| Code | Description | Solution |
|------|-------------|----------|
| `00` | Aprobada | Transacción exitosa |
| `05` | Declinada | Verificar fondos o límites |
| `14` | Número de tarjeta inválido | Validar número de tarjeta |
| `54` | Tarjeta vencida | Solicitar tarjeta válida |
| `61` | Excede límite de retiro | Reducir monto o contactar banco |
| `96` | Error del sistema | Reintentar transacción |

### Error Response Format

```javascript
{
  "error": {
    "type": "azul_error",
    "code": "05",
    "message": "Transacción declinada",
    "description": "Fondos insuficientes",
    "provider": "azul",
    "localized_message": "Su tarjeta no tiene fondos suficientes"
  }
}
```

### Error Handling Best Practices

```javascript
try {
  const payment = await fetch('/bridge-payment/payments', {
    method: 'POST',
    body: JSON.stringify(paymentData)
  });

  const result = await payment.json();

  if (!payment.ok) {
    switch (result.error.code) {
      case '05':
        showError('Fondos insuficientes. Intente con otra tarjeta.');
        break;
      case '14':
        showError('Número de tarjeta inválido. Verifique los datos.');
        break;
      case '54':
        showError('Tarjeta vencida. Use una tarjeta válida.');
        break;
      default:
        showError('Error procesando el pago. Intente nuevamente.');
    }
    return;
  }

  // Payment successful
  handleSuccessfulPayment(result);
} catch (error) {
  console.error('Payment error:', error);
  showError('Error de conexión. Verifique su internet.');
}
```

## 📊 Testing

### Test Environment Setup

```env
# Sandbox Configuration
AZUL_MERCHANT_ID=test_merchant_123
AZUL_AUTH1=test_auth1_key
AZUL_AUTH2=test_auth2_key
AZUL_ENVIRONMENT=sandbox
```

### Test Card Numbers

| Card Type | Number | CVV | Expiry | Expected Result |
|-----------|--------|-----|--------|-----------------|
| **Visa** | 4111111111111111 | 123 | 12/25 | Approved |
| **Mastercard** | 5555555555554444 | 456 | 06/26 | Approved |
| **Amex** | 378282246310005 | 1234 | 09/25 | Approved |
| **Declined** | 4000000000000002 | 123 | 12/25 | Declined |
| **Insufficient Funds** | 4000000000000119 | 123 | 12/25 | Code 05 |
| **Expired Card** | 4000000000000069 | 123 | 12/20 | Code 54 |

### Test Scenarios

```javascript
// Test successful payment
const testSuccessfulPayment = async () => {
  const payment = await fetch('/bridge-payment/payments', {
    method: 'POST',
    body: JSON.stringify({
      amount: 100000, // RD$1,000.00
      currency: 'DOP',
      provider: 'azul',
      payment_method: {
        type: 'credit_card',
        card: {
          number: '4111111111111111',
          exp_month: 12,
          exp_year: 2025,
          cvc: '123'
        }
      }
    })
  });

  expect(payment.status).toBe('succeeded');
};

// Test declined payment
const testDeclinedPayment = async () => {
  const payment = await fetch('/bridge-payment/payments', {
    method: 'POST',
    body: JSON.stringify({
      amount: 100000,
      currency: 'DOP',
      provider: 'azul',
      payment_method: {
        type: 'credit_card',
        card: {
          number: '4000000000000002', // Declined test card
          exp_month: 12,
          exp_year: 2025,
          cvc: '123'
        }
      }
    })
  });

  expect(payment.status).toBe('failed');
  expect(payment.error.code).toBe('05');
};
```

## 🌐 Localization

### Spanish (Dominican Republic)

```javascript
const messages = {
  'es-DO': {
    'payment.processing': 'Procesando pago...',
    'payment.success': 'Pago realizado exitosamente',
    'payment.failed': 'El pago no pudo ser procesado',
    'card.invalid': 'Número de tarjeta inválido',
    'card.expired': 'Tarjeta vencida',
    'insufficient.funds': 'Fondos insuficientes',
    'try.again': 'Intente nuevamente'
  }
};
```

### Address Format (Dominican Republic)

```javascript
const dominicanAddress = {
  line1: 'Calle Principal #123',
  line2: 'Apt 4B, Edificio Central',
  city: 'Santo Domingo',
  state: 'Distrito Nacional', // Province
  postal_code: '10101',
  country: 'DO'
};
```

### Phone Number Format

```javascript
const dominicanPhone = '+1-809-555-0123'; // Format: +1-XXX-XXX-XXXX
```

## 🚀 Best Practices

### 1. Always Use HTTPS
```javascript
// ✅ Correct
const apiUrl = 'https://your-api.com/bridge-payment/payments';

// ❌ Incorrect
const apiUrl = 'http://your-api.com/bridge-payment/payments';
```

### 2. Validate Input Data
```javascript
const validateCardNumber = (cardNumber) => {
  const cleaned = cardNumber.replace(/\D/g, '');
  return cleaned.length >= 13 && cleaned.length <= 19;
};

const validateExpiryDate = (month, year) => {
  const now = new Date();
  const expiry = new Date(year, month - 1);
  return expiry > now;
};
```

### 3. Handle Network Errors
```javascript
const makePayment = async (paymentData) => {
  try {
    const response = await fetch('/bridge-payment/payments', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Session-ID': sessionId
      },
      body: JSON.stringify(paymentData),
      timeout: 30000 // 30 second timeout
    });

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    }

    return await response.json();
  } catch (error) {
    if (error.name === 'AbortError') {
      throw new Error('Timeout: El pago tardó demasiado en procesarse');
    }
    throw error;
  }
};
```

### 4. Implement Retry Logic
```javascript
const retryPayment = async (paymentData, maxRetries = 3) => {
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      return await makePayment(paymentData);
    } catch (error) {
      if (attempt === maxRetries) {
        throw error;
      }

      // Wait before retry (exponential backoff)
      await new Promise(resolve =>
        setTimeout(resolve, Math.pow(2, attempt) * 1000)
      );
    }
  }
};
```

### 5. Secure Data Handling
```javascript
// ✅ Use tokenization for stored cards
const savePaymentMethod = async (cardData) => {
  const tokenResponse = await fetch('/bridge-payment/payment-methods', {
    method: 'POST',
    body: JSON.stringify({
      provider: 'azul',
      type: 'credit_card',
      card: cardData // Card data sent once for tokenization
    })
  });

  // Store only the token, never the card data
  const { id: tokenId } = await tokenResponse.json();
  localStorage.setItem('payment_method_id', tokenId);

  // Clear sensitive data
  cardData = null;
};
```

## 📚 Additional Resources

### Azul Documentation
- **Developer Portal**: https://dev.azul.com.do
- **API Documentation**: Available in Spanish
- **Support Email**: solucionesecommerce@azul.com.do

### Dominican Banking
- **Superintendencia de Bancos**: https://www.sib.gob.do
- **Banco Central**: https://www.bancentral.gov.do
- **Payment Regulations**: Local compliance requirements

### Integration Support
- Technical documentation
- Code examples in multiple languages
- Testing guidelines
- Production deployment checklist

## 🗄️ Database Integration

### Uso del Esquema Existente

**✅ Azul utiliza tu esquema multipropósito existente - No se requieren nuevas tablas**

Todos los datos específicos de Azul se almacenan en las columnas `metadata` JSON de las tablas existentes:

#### Payments Table
```javascript
// Ejemplo de payment con metadata de Azul
{
  "id": "pay_azul_123",
  "provider_id": "azul",
  "provider_payment_id": "987654321", // Azul Order ID
  "amount_cents": 299900,
  "currency": "DOP",
  "status": "completed",
  "metadata": {
    "azul_order_id": "987654321",
    "authorization_code": "123456",
    "rrn": "123456789012",
    "response_code": "00",
    "transaction_type": "Sale",
    "itbis": "537.82",
    "three_ds_data": {
      "authentication_status": "Y",
      "eci": "05"
    }
  }
}
```

#### Payment Methods Table (DataVault)
```javascript
// Ejemplo de payment method con token DataVault
{
  "id": "pm_azul_456",
  "provider_id": "azul",
  "provider_payment_method_id": "token_abc123",
  "payment_type": "credit_card",
  "last_four": "1111",
  "card_brand": "visa",
  "metadata": {
    "azul_token": "token_abc123",
    "azul_brand": "VISA",
    "azul_expiration": "1225",
    "validation_status": "validated"
  }
}
```

#### Provider Customers Table
```javascript
// Ejemplo de customer con preferencias dominicanas
{
  "id": "cust_azul_789",
  "provider_id": "azul",
  "user_id": "user_123",
  "metadata": {
    "azul_customer_data": {
      "preferred_currency": "DOP",
      "tax_id": "12345678901", // RNC
      "preferred_language": "es-DO"
    }
  }
}
```

### Consultas Útiles

#### Buscar transacciones Azul por Order ID
```sql
SELECT * FROM payments
WHERE provider_id = 'azul'
AND JSON_EXTRACT(metadata, '$.azul_order_id') = '987654321';
```

#### Obtener tokens DataVault de un usuario
```sql
SELECT * FROM payment_methods
WHERE provider_id = 'azul'
AND user_id = 'user_123'
AND JSON_EXTRACT(metadata, '$.azul_token') IS NOT NULL;
```

#### Estadísticas por código de respuesta
```sql
SELECT
  JSON_EXTRACT(metadata, '$.response_code') as response_code,
  COUNT(*) as count,
  SUM(amount_cents) as total_amount
FROM payments
WHERE provider_id = 'azul'
GROUP BY JSON_EXTRACT(metadata, '$.response_code');
```

---

This comprehensive guide provides everything needed to integrate Azul payments into your application while maintaining the same unified API experience as other payment providers in Bridge-Payments.
