# Logging Control System

## 🎛️ Control de Logs con LOG_MODE

El sistema de webhooks ahora incluye un control granular de logs usando la variable de entorno `LOG_MODE`.

### **Configuración**

#### En tu archivo `.env`:
```bash
# Para OCULTAR logs de debug (producción recomendado)
LOG_MODE=false

# Para MOSTRAR logs de debug (desarrollo/debugging)
LOG_MODE=true
```

### **Comportamiento de Logs**

#### ✅ **LOG_MODE=false** (Logs Mínimos)
```bash
# Solo se muestran errores críticos y warnings
❌ Invalid Stripe webhook signature
❌ Failed to process Stripe webhook webhook_123: Error message
⚠️  PayPal not configured, skipping validation test
```

#### 🔍 **LOG_MODE=true** (Logs Completos)
```bash
# Se muestran todos los logs de debug
🔧 Initializing Stripe adapter...
🔑 API Key: sk_test_51J8yBS...
🌍 Environment: sandbox
🔐 Verifying Stripe webhook signature...
   Webhook secret: whsec_7beb...
   Signature header: t=1750227674,v1=6b9d...
   Payload length: 4305
✅ Stripe webhook signature verified successfully
   Event ID: evt_3RbFMzJH4Zr08WDG1H2QMFIa
   Event type: charge.succeeded
🔔 Received Stripe webhook: charge.succeeded (evt_3RbFMzJH4Zr08WDG1H2QMFIa)
🔄 Processing webhook event: charge.succeeded (evt_3RbFMzJH4Zr08WDG1H2QMFIa)
✅ Stripe webhook 1XF8SEIVYlSO0WrLADs3p processed successfully
```

### **Tipos de Logs**

| Tipo | LOG_MODE=false | LOG_MODE=true | Descripción |
|------|----------------|---------------|-------------|
| `Logger.debug()` | ❌ Oculto | ✅ Visible | Información de debugging |
| `Logger.info()` | ❌ Oculto | ✅ Visible | Información general |
| `Logger.success()` | ❌ Oculto | ✅ Visible | Operaciones exitosas |
| `Logger.warn()` | ✅ Visible | ✅ Visible | Advertencias importantes |
| `Logger.error()` | ✅ Visible | ✅ Visible | Errores críticos |

### **Logs de Webhooks Específicos**

#### **Recepción de Webhooks:**
```javascript
// LOG_MODE=true
Logger.webhook.received('Stripe', 'payment_intent.succeeded', 'evt_123');
// Output: 🔔 Received Stripe webhook: payment_intent.succeeded (evt_123)

// LOG_MODE=false
// No output
```

#### **Verificación de Firmas:**
```javascript
// LOG_MODE=true
Logger.webhook.signature.verifying('Stripe', 'whsec_abc', 't=123,v1=def', 1024);
// Output: 🔐 Verifying Stripe webhook signature...
//         Webhook secret: whsec_abc...
//         Signature header: t=123,v1=def...
//         Payload length: 1024

// LOG_MODE=false
// No output (excepto errores)
```

#### **Procesamiento:**
```javascript
// LOG_MODE=true
Logger.webhook.processing.completed('Stripe', 'webhook_123');
// Output: ✅ Stripe webhook webhook_123 processed successfully

// LOG_MODE=false
// No output
```

### **Configuración Recomendada**

#### **🔧 Desarrollo:**
```bash
LOG_MODE=true
LOG_LEVEL=debug
```

#### **🚀 Producción:**
```bash
LOG_MODE=false
LOG_LEVEL=warn
```

#### **🐛 Debugging Issues:**
```bash
LOG_MODE=true
LOG_LEVEL=debug
```

### **Reiniciar para Aplicar Cambios**

Después de cambiar `LOG_MODE` en tu archivo `.env`:

```bash
# Reinicia el servidor
bun run dev
# o
npm run dev
```

### **Verificar Estado Actual**

Puedes verificar el estado actual de logging:

```bash
# Endpoint de diagnóstico
curl http://localhost:3001/bridge-payment/webhooks/diagnostics

# Respuesta incluye:
{
  "configuration": {
    "log_mode": false,
    "log_level": "info"
  }
}
```

### **Ejemplos de Uso**

#### **Producción Limpia:**
```bash
# .env
LOG_MODE=false

# Logs mínimos - solo errores importantes
❌ Invalid Stripe webhook signature
❌ Failed to process payment: Card declined
```

#### **Debugging Completo:**
```bash
# .env
LOG_MODE=true

# Logs completos para debugging
🔧 Initializing Stripe adapter...
🔐 Verifying Stripe webhook signature...
✅ Stripe webhook signature verified successfully
🔔 Received Stripe webhook: payment_intent.succeeded
🔄 Processing webhook event: payment_intent.succeeded
✅ Stripe webhook processed successfully
```

### **Beneficios**

✅ **Producción limpia** - Sin logs verbosos  
✅ **Debugging fácil** - Logs detallados cuando necesites  
✅ **Flexibilidad** - Control granular por tipo de log  
✅ **Rendimiento** - Menos I/O cuando LOG_MODE=false  
✅ **Seguridad** - Información sensible solo en debug mode
