# 🇩🇴 Azul Checkout - Guía de Integración

Guía completa para integrar **Azul Checkout** (azul_checkout) - el método de hosted checkout más simple y seguro para República Dominicana.

## 🚀 Quick Start

### 1. Pago Básico con Redirect

```javascript
// Crear un pago que redirige a Azul
const response = await fetch('/bridge-payment/payments', {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'X-Session-ID': userSessionId
  },
  body: JSON.stringify({
    amount: 299900, // RD$2,999.00 (en centavos)
    currency: 'DOP',
    description: 'Plan Premium',
    provider: 'azul_checkout', // ← Proveedor de hosted checkout
    customer_email: 'cliente@ejemplo.com',
    return_url: 'https://tu-sitio.com/payment/return',
    cancel_url: 'https://tu-sitio.com/payment/cancel'
  })
});

const payment = await response.json();

// Respuesta incluye URL de redirect
if (payment.status === 'requires_action' && payment.next_action?.type === 'redirect') {
  // Redirigir al usuario a Azul
  window.location.href = payment.next_action.redirect_url;
}
```

### 2. Manejo del Return/Callback

```javascript
// Endpoint para manejar el return de Azul
app.get('/payment/return', async (req, res) => {
  const { 
    OrderNumber, 
    AzulOrderId, 
    ResponseCode, 
    AuthorizationCode,
    Amount,
    ResponseMessage 
  } = req.query;

  try {
    // Verificar el pago en Bridge-Payments
    const payment = await fetch(`/bridge-payment/payments/by-order/${OrderNumber}`);
    const paymentData = await payment.json();

    if (ResponseCode === '00') {
      // Pago exitoso
      res.redirect(`/success?payment_id=${paymentData.id}`);
    } else {
      // Pago falló
      res.redirect(`/failed?error=${ResponseMessage}`);
    }
  } catch (error) {
    res.redirect('/error');
  }
});
```

## 🔧 Configuración

### Environment Variables

```env
# Azul Checkout Configuration
AZUL_CHECKOUT_MERCHANT_ID=your_merchant_id
AZUL_CHECKOUT_MERCHANT_NAME="Tu Tienda Online"
AZUL_CHECKOUT_AUTH_HASH_KEY=your_auth_hash_key
AZUL_CHECKOUT_ENVIRONMENT=sandbox  # or 'production'

# URLs de Callback
AZUL_CHECKOUT_APPROVED_URL=https://tu-sitio.com/payment/success
AZUL_CHECKOUT_DECLINED_URL=https://tu-sitio.com/payment/failed
AZUL_CHECKOUT_CANCEL_URL=https://tu-sitio.com/payment/cancel

# Enable Azul Checkout
ENABLED_PROVIDERS=stripe,paypal,authorize_net,azul,azul_checkout
```

### Sandbox vs Production

**Sandbox (Pruebas):**
- Merchant ID: Tu ID de merchant de pruebas
- Environment: `sandbox`
- URL: `https://pruebas.azul.com.do/PaymentPage`

**Production (Producción):**
- Merchant ID: Tu ID de merchant de producción
- Environment: `production`
- URL: `https://pagos.azul.com.do/PaymentPage`

## 💳 Flujo de Pago Completo

### Paso 1: Crear Payment Intent

```javascript
const createPayment = async () => {
  const paymentData = {
    amount: 250000, // RD$2,500.00
    currency: 'DOP',
    provider: 'azul_checkout',
    description: 'Compra en línea',
    customer_email: 'cliente@ejemplo.com',
    customer_name: 'Juan Pérez',
    metadata: {
      order_id: 'ORD-12345',
      customer_phone: '+1-809-555-0123'
    }
  };

  const response = await fetch('/bridge-payment/payments', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(paymentData)
  });

  return await response.json();
};
```

### Paso 2: Redirect a Azul

```javascript
const processPayment = async () => {
  const payment = await createPayment();
  
  if (payment.status === 'requires_action') {
    const { redirect_url, form_data } = payment.next_action;
    
    // Opción 1: Redirect directo
    window.location.href = redirect_url;
    
    // Opción 2: Formulario HTML (más control)
    const form = document.createElement('form');
    form.method = 'POST';
    form.action = redirect_url;
    
    Object.entries(form_data).forEach(([key, value]) => {
      const input = document.createElement('input');
      input.type = 'hidden';
      input.name = key;
      input.value = value;
      form.appendChild(input);
    });
    
    document.body.appendChild(form);
    form.submit();
  }
};
```

### Paso 3: Usuario Paga en Azul

```
🔄 Usuario es redirigido a: https://pagos.azul.com.do/PaymentPage

📱 Página de Azul (responsive):
   ┌─────────────────────────────┐
   │        AZUL PAGOS           │
   │                             │
   │  💳 Número de Tarjeta       │
   │  📅 Fecha de Vencimiento    │
   │  🔒 Código de Seguridad     │
   │  👤 Nombre del Titular      │
   │                             │
   │  💰 Total: RD$2,500.00      │
   │  📊 ITBIS: RD$450.00        │
   │                             │
   │  [🔒 Pagar Seguro]          │
   │  [❌ Cancelar]              │
   └─────────────────────────────┘
```

### Paso 4: Callback Processing

```javascript
// Azul redirige de vuelta con parámetros
// GET /payment/success?OrderNumber=ORD123&AzulOrderId=987654&ResponseCode=00&AuthorizationCode=123456

app.get('/payment/success', async (req, res) => {
  const params = req.query;
  
  // Validar AuthHash (si está configurado)
  const isValid = validateAuthHash(params);
  if (!isValid) {
    return res.status(400).send('Invalid callback');
  }
  
  // Actualizar estado del pago
  await updatePaymentStatus(params.OrderNumber, {
    status: params.ResponseCode === '00' ? 'completed' : 'failed',
    azul_order_id: params.AzulOrderId,
    authorization_code: params.AuthorizationCode,
    response_message: params.ResponseMessage
  });
  
  // Redirigir al usuario
  if (params.ResponseCode === '00') {
    res.redirect('/thank-you');
  } else {
    res.redirect(`/payment-failed?reason=${params.ResponseMessage}`);
  }
});
```

## 🌍 Soporte de Monedas

### Peso Dominicano (DOP)

```javascript
const dopPayment = {
  amount: 299900, // RD$2,999.00 (en centavos)
  currency: 'DOP',
  provider: 'azul_checkout',
  metadata: {
    itbis_included: true, // ITBIS calculado automáticamente
    itbis_rate: 0.18     // 18% ITBIS
  }
};
```

### Dólar Estadounidense (USD)

```javascript
const usdPayment = {
  amount: 5000, // $50.00 USD (en centavos)
  currency: 'USD',
  provider: 'azul_checkout',
  metadata: {
    exchange_rate: 58.50, // Tasa de cambio opcional
    convert_to_dop: true  // Convertir a DOP en Azul
  }
};
```

### Cálculo Automático de ITBIS

```javascript
// ITBIS se calcula automáticamente para DOP
const calculateTotal = (subtotal, currency = 'DOP') => {
  if (currency === 'DOP') {
    const itbis = Math.round(subtotal * 0.18); // 18%
    return {
      subtotal,
      itbis,
      total: subtotal + itbis
    };
  }
  return { subtotal, itbis: 0, total: subtotal };
};

// Ejemplo
const order = calculateTotal(299900); // RD$2,999.00
// Result: { subtotal: 299900, itbis: 53982, total: 353882 }
```

## 🔒 Seguridad

### AuthHash Validation

```javascript
// Validar AuthHash en callbacks
const validateAuthHash = (params) => {
  const { AuthHash, ...dataToHash } = params;
  
  // Construir string para hash
  const hashString = Object.values(dataToHash)
    .sort()
    .join('|') + '|' + process.env.AZUL_CHECKOUT_AUTH_HASH_KEY;
  
  // Calcular hash esperado
  const expectedHash = crypto
    .createHash('sha512')
    .update(hashString)
    .digest('hex')
    .toUpperCase();
  
  return AuthHash === expectedHash;
};
```

### URL Whitelisting

```javascript
// Validar URLs de callback
const allowedCallbackUrls = [
  'https://tu-sitio.com/payment/success',
  'https://tu-sitio.com/payment/failed',
  'https://tu-sitio.com/payment/cancel'
];

const validateCallbackUrl = (url) => {
  return allowedCallbackUrls.includes(url);
};
```

## 📱 Mobile Optimization

### Responsive Design

```html
<!-- La página de Azul es automáticamente responsive -->
<!-- Tu página de checkout debe ser mobile-friendly -->

<div class="payment-container">
  <div class="payment-summary">
    <h3>Resumen de Compra</h3>
    <p>Subtotal: RD$2,999.00</p>
    <p>ITBIS (18%): RD$539.82</p>
    <p><strong>Total: RD$3,538.82</strong></p>
  </div>
  
  <button onclick="redirectToAzul()" class="pay-button">
    🔒 Pagar con Azul
  </button>
  
  <p class="security-note">
    Serás redirigido a la página segura de Azul para completar tu pago.
  </p>
</div>
```

### Mobile UX Best Practices

```javascript
const redirectToAzul = () => {
  // Mostrar loading antes del redirect
  showLoadingSpinner('Redirigiendo a Azul...');
  
  // Guardar estado en localStorage para recovery
  localStorage.setItem('payment_in_progress', JSON.stringify({
    order_id: 'ORD-12345',
    amount: 353882,
    timestamp: Date.now()
  }));
  
  // Redirect
  setTimeout(() => {
    window.location.href = azulRedirectUrl;
  }, 1000);
};

// Recovery en página de return
window.addEventListener('load', () => {
  const paymentInProgress = localStorage.getItem('payment_in_progress');
  if (paymentInProgress) {
    localStorage.removeItem('payment_in_progress');
    // Mostrar mensaje de bienvenida de vuelta
    showWelcomeBackMessage();
  }
});
```

## 🔔 Event Handling

### Custom Events

```javascript
// Eventos personalizados para tracking
const trackPaymentEvent = (eventType, data) => {
  // Analytics
  gtag('event', eventType, {
    event_category: 'payment',
    event_label: 'azul_checkout',
    value: data.amount / 100
  });
  
  // Custom tracking
  fetch('/analytics/payment-event', {
    method: 'POST',
    body: JSON.stringify({
      event: eventType,
      provider: 'azul_checkout',
      ...data
    })
  });
};

// Usar en diferentes puntos
trackPaymentEvent('payment_initiated', { amount: 353882 });
trackPaymentEvent('redirect_to_azul', { order_id: 'ORD-12345' });
trackPaymentEvent('payment_completed', { azul_order_id: '987654' });
```

## 🧪 Testing

### Test Scenarios

```javascript
// Escenarios de prueba
const testScenarios = [
  {
    name: 'Successful Payment',
    amount: 100000, // RD$1,000.00
    expected_result: 'completed'
  },
  {
    name: 'Declined Payment',
    amount: 200000, // RD$2,000.00 (usar tarjeta de prueba declinada)
    expected_result: 'failed'
  },
  {
    name: 'Canceled Payment',
    amount: 150000, // RD$1,500.00
    expected_result: 'canceled'
  }
];
```

### Test Implementation

```javascript
const runPaymentTest = async (scenario) => {
  console.log(`🧪 Testing: ${scenario.name}`);
  
  // Crear pago de prueba
  const payment = await fetch('/bridge-payment/payments', {
    method: 'POST',
    body: JSON.stringify({
      amount: scenario.amount,
      currency: 'DOP',
      provider: 'azul_checkout',
      description: `Test: ${scenario.name}`,
      customer_email: 'test@ejemplo.com'
    })
  });
  
  const paymentData = await payment.json();
  
  console.log('✅ Payment created:', paymentData.id);
  console.log('🔗 Redirect URL:', paymentData.next_action?.redirect_url);
  
  // En sandbox, puedes automatizar el testing
  if (process.env.NODE_ENV === 'test') {
    const result = await simulateAzulCallback(paymentData.id, scenario.expected_result);
    console.log('📊 Test result:', result);
  }
};
```

## 🚀 Best Practices

### 1. User Experience

```javascript
// Preparar al usuario para el redirect
const showRedirectWarning = () => {
  const modal = document.createElement('div');
  modal.innerHTML = `
    <div class="redirect-modal">
      <h3>🔒 Pago Seguro</h3>
      <p>Serás redirigido a la página segura de Azul para completar tu pago.</p>
      <p>⚠️ No cierres esta ventana durante el proceso.</p>
      <button onclick="proceedToAzul()">Continuar</button>
    </div>
  `;
  document.body.appendChild(modal);
};
```

### 2. Error Handling

```javascript
// Manejo robusto de errores
const handlePaymentError = (error, context) => {
  console.error('Payment error:', error);
  
  // Log para debugging
  logPaymentError({
    error: error.message,
    context,
    timestamp: new Date().toISOString(),
    user_agent: navigator.userAgent
  });
  
  // Mostrar mensaje amigable al usuario
  showUserFriendlyError(error.type);
};

const showUserFriendlyError = (errorType) => {
  const messages = {
    'network_error': 'Problema de conexión. Intenta nuevamente.',
    'validation_error': 'Verifica los datos ingresados.',
    'azul_error': 'Error en el procesamiento. Contacta soporte.',
    'timeout_error': 'El pago tardó demasiado. Verifica el estado.'
  };
  
  alert(messages[errorType] || 'Error inesperado. Intenta nuevamente.');
};
```

### 3. Performance

```javascript
// Optimizar redirects
const optimizeRedirect = () => {
  // Preload Azul domain
  const link = document.createElement('link');
  link.rel = 'dns-prefetch';
  link.href = 'https://pagos.azul.com.do';
  document.head.appendChild(link);
  
  // Minimize redirect delay
  const form = generateAzulForm();
  form.style.display = 'none';
  document.body.appendChild(form);
  
  // Submit immediately
  requestAnimationFrame(() => form.submit());
};
```

## 📚 Recursos Adicionales

### Azul Documentation
- **Portal**: https://dev.azul.com.do
- **Soporte**: solucionesecommerce@azul.com.do
- **Documentación**: E-Commerce Página de Pagos

### Testing Resources
- **Sandbox**: https://pruebas.azul.com.do/PaymentPage
- **Test Cards**: Solicitar a Azul soporte
- **Test Scenarios**: Documentación de pruebas

---

Esta guía proporciona todo lo necesario para implementar Azul Página de Pagos de manera simple, segura y efectiva, aprovechando la infraestructura de redirect payment de Azul.
