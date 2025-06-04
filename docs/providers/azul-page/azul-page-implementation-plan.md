# 🇩🇴 Azul Checkout - Plan de Implementación

Plan completo para implementar **Azul Checkout** (azul_checkout) como proveedor de hosted checkout en Bridge-Payments API.

## 📋 Overview

**Azul Checkout** es el método de **hosted checkout page** de Azul - una solución de redirect payment que es:

- ✅ **Más simple** que la integración directa de API
- ✅ **Más segura** - datos de tarjeta nunca tocan tu servidor
- ✅ **PCI Compliance mínimo** - Azul maneja toda la seguridad
- ✅ **Implementación rápida** - solo redirects y callbacks
- ✅ **UI/UX optimizada** - página de pagos de Azul localizada

## 🎯 Objetivos de Implementación

### **Características Principales**
- ✅ **Redirect Payment Flow** - Redirigir a página de Azul
- ✅ **Callback Handling** - Procesar respuestas de Azul
- ✅ **Dominican Peso (DOP)** - Soporte completo
- ✅ **ITBIS Calculation** - Cálculo automático de impuestos (18%)
- ✅ **Mobile Optimized** - Página responsive de Azul
- ✅ **3D Secure** - Automático en página de Azul
- ✅ **Guest Checkout** - No requiere registro

### **Limitaciones (por diseño)**
- ❌ **No tokenización** - Cada pago es independiente
- ❌ **No authorization/capture** - Solo pagos directos
- ❌ **No refunds via API** - Refunds manuales en portal Azul
- ❌ **No saved payment methods** - Redirect cada vez

## 🏗️ Arquitectura

### **Flujo de Pago**
```
1. Cliente → Bridge-Payments API
2. Bridge-Payments → Genera formulario de redirect
3. Cliente → Redirigido a Azul Página de Pagos
4. Cliente → Ingresa datos en página de Azul
5. Azul → Procesa pago y redirige de vuelta
6. Bridge-Payments → Procesa callback y actualiza estado
```

### **URLs de Azul**
- **Producción**: `https://pagos.azul.com.do/PaymentPage`
- **Sandbox**: `https://pruebas.azul.com.do/PaymentPage`

## 📁 Estructura de Archivos

```
src/lib/providers/azul-checkout/
├── azul-checkout-adapter.ts     # Adaptador principal (redirect)
├── azul-checkout-client.ts      # Cliente para callbacks
├── types.ts                 # Interfaces TypeScript
├── utils.ts                 # Utilidades y validaciones
├── callbacks.ts             # Manejo de callbacks
├── index.ts                 # Exportaciones
└── test-adapter.ts          # Testing
```

## 🗄️ Integración con Base de Datos

**✅ Usa el esquema existente - No nuevas tablas**

### **Payments Table**
```javascript
{
  "provider_id": "azul_checkout",
  "provider_payment_id": "ORDER_12345", // Order Number
  "status": "pending", // pending → completed/failed
  "metadata": {
    "azul_checkout_data": {
      "order_number": "ORDER_12345",
      "redirect_url": "https://pagos.azul.com.do/PaymentPage",
      "approved_url": "https://tu-sitio.com/payment/success",
      "declined_url": "https://tu-sitio.com/payment/failed",
      "cancel_url": "https://tu-sitio.com/payment/cancel"
    },
    "azul_response": {
      "azul_order_id": "987654321", // Después del callback
      "authorization_code": "123456",
      "response_code": "00"
    }
  }
}
```

## 🔧 Características Técnicas

### **1. Redirect Payment Processing**
- **Form Generation** - Generar formulario HTML para redirect
- **Hash Calculation** - Calcular AuthHash para seguridad
- **Parameter Validation** - Validar todos los parámetros
- **URL Management** - Manejar URLs de callback

### **2. Callback Processing**
- **Response Validation** - Validar respuesta de Azul
- **Status Mapping** - Mapear códigos de respuesta
- **Database Updates** - Actualizar estado del pago
- **Webhook Simulation** - Generar eventos internos

### **3. Security Features**
- **AuthHash Validation** - Verificar integridad de datos
- **URL Whitelisting** - Validar URLs de callback
- **Parameter Sanitization** - Limpiar datos de entrada
- **CSRF Protection** - Protección contra ataques

## 💰 Soporte de Monedas

### **Monedas Soportadas**
- **DOP (214)** - Peso Dominicano (principal)
- **USD (840)** - Dólar Estadounidense (secundario)

### **Cálculo de ITBIS**
```javascript
// Cálculo automático de impuestos dominicanos
const calculateITBIS = (amount, rate = 0.18) => {
  return Math.round(amount * rate);
};

// Ejemplo: RD$2,999.00 + 18% ITBIS = RD$537.82
const subtotal = 299900; // centavos
const itbis = calculateITBIS(subtotal); // 53982 centavos
const total = subtotal + itbis; // 353882 centavos
```

## 🔄 Estados de Pago

### **Estados del Payment Intent**
1. **pending** - Esperando redirect a Azul
2. **processing** - Usuario en página de Azul
3. **completed** - Pago exitoso
4. **failed** - Pago falló o declinado
5. **canceled** - Usuario canceló en página de Azul

### **Códigos de Respuesta Azul**
- **00** - Aprobada
- **05** - Declinada
- **96** - Error del sistema
- **CANCEL** - Cancelada por usuario

## 📊 Capabilities

```javascript
getCapabilities(): PaymentAdapterCapabilities {
  return {
    supports_payment_intents: true,
    supports_saved_payment_methods: false,    // ← No tokenización
    supports_customers: false,                // ← No gestión de clientes
    supports_refunds: false,                  // ← Refunds manuales
    supports_webhooks: false,                 // ← Solo callbacks
    supports_subscriptions: false,
    supports_3d_secure: true,                // ← Automático en Azul
    supports_manual_capture: false,          // ← Solo pagos directos
    supports_multiple_captures: false,
    supported_currencies: ['DOP', 'USD'],
    supported_payment_methods: [
      PaymentMethodType.CREDIT_CARD,
      PaymentMethodType.DEBIT_CARD
    ],
    redirect_flow: true,                      // ← Característica principal
    hosted_payment_page: true
  };
}
```

## 🔔 Event Handling

### **Eventos Internos**
- `payment.redirect_created` - Redirect generado
- `payment.user_redirected` - Usuario redirigido a Azul
- `payment.callback_received` - Callback de Azul recibido
- `payment.completed` - Pago completado
- `payment.failed` - Pago falló
- `payment.canceled` - Pago cancelado

## 🧪 Testing Strategy

### **Test Scenarios**
1. **Successful Payment** - Flujo completo exitoso
2. **Declined Payment** - Pago declinado
3. **Canceled Payment** - Usuario cancela
4. **Invalid Callback** - Callback malformado
5. **Hash Validation** - Verificación de AuthHash
6. **Mobile Flow** - Testing en dispositivos móviles

### **Test Data**
```javascript
const testPayment = {
  amount: 299900, // RD$2,999.00
  currency: 'DOP',
  provider: 'azul_page',
  description: 'Test Payment',
  customer_email: 'test@ejemplo.com'
};
```

## 📈 Performance Considerations

### **Optimizaciones**
- **Fast Redirects** - Generación rápida de formularios
- **Callback Processing** - Procesamiento asíncrono
- **Database Indexing** - Índices para order_number
- **Caching** - Cache de configuración

### **Monitoring**
- **Redirect Success Rate** - % de redirects exitosos
- **Callback Response Time** - Tiempo de procesamiento
- **Payment Completion Rate** - % de pagos completados
- **Error Rates** - Monitoreo de errores

## 🚀 Fases de Implementación

### **Fase 1: Core Implementation**
1. **Adaptador básico** - Redirect y callbacks
2. **Form generation** - Generar formularios HTML
3. **Hash calculation** - Implementar AuthHash
4. **Basic testing** - Pruebas fundamentales

### **Fase 2: Advanced Features**
1. **Error handling** - Manejo completo de errores
2. **Validation** - Validaciones exhaustivas
3. **Mobile optimization** - Optimización móvil
4. **Comprehensive testing** - Testing completo

### **Fase 3: Production Ready**
1. **Security audit** - Auditoría de seguridad
2. **Performance testing** - Pruebas de rendimiento
3. **Documentation** - Documentación completa
4. **Go-live preparation** - Preparación para producción

## 📋 Implementation Checklist

### **Core Adapter**
- [ ] `AzulCheckoutAdapter` extending `PaymentAdapter`
- [ ] Redirect form generation
- [ ] Callback processing
- [ ] Error handling

### **Security**
- [ ] AuthHash calculation and validation
- [ ] Parameter sanitization
- [ ] URL validation
- [ ] CSRF protection

### **Integration**
- [ ] Database schema integration
- [ ] Factory registration
- [ ] Environment configuration
- [ ] Testing suite

### **Documentation**
- [ ] Integration guide
- [ ] API reference
- [ ] Deployment guide
- [ ] Best practices

## 🎯 Ventajas vs Azul API Directa

| Aspecto | Azul API | Azul Checkout |
|---------|----------|-----------|
| **Complejidad** | Alta | Baja |
| **Seguridad** | Alta | Máxima |
| **PCI Compliance** | Completo | Mínimo |
| **Tokenización** | ✅ | ❌ |
| **Auth/Capture** | ✅ | ❌ |
| **Implementación** | Semanas | Días |
| **Mantenimiento** | Alto | Bajo |
| **UX Control** | Total | Limitado |

## 📞 Recursos

### **Azul Support**
- **Email**: solucionesecommerce@azul.com.do
- **Portal**: https://dev.azul.com.do
- **Documentación**: Página de Pagos E-Commerce

### **Testing**
- **Sandbox**: https://pruebas.azul.com.do/PaymentPage
- **Test Cards**: Proporcionadas por Azul
- **Test Amounts**: Diferentes escenarios

---

Esta implementación de Azul Checkout establece un patrón consistente para hosted checkouts y proporciona una alternativa simple, segura y rápida de implementar para procesar pagos dominicanos con mínima complejidad técnica.
