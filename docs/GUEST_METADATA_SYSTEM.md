# Guest Metadata System

## 🎯 Problema Solucionado

**Antes:** Los datos de usuarios guest (nombre, email, teléfono) no se guardaban en los metadatos de Stripe, dificultando el seguimiento y análisis de transacciones.

**Ahora:** Sistema completo que guarda automáticamente la información del guest en los metadatos de Stripe durante la creación y sincronización del payment intent.

## 🔄 Flujo del Sistema

### **1. Creación del Payment Intent (Frontend)**

```javascript
// En PaymentProcessor.tsx
const metadata = {
  source: 'bethel-payment-element-setup',
  frontend_url: window.location.origin,
  save_payment_method: savePaymentMethod,
  create_account: createAccount,
  concept: concept,
  reference_code: reference_code,
  category: category,
  // ✅ NUEVO: Datos del guest agregados automáticamente
  ...(guestData?.name && { guest_name: guestData.name }),
  ...(guestData?.email && { guest_email: guestData.email }),
  ...(guestData?.phone && { guest_phone: guestData.phone })
}
```

### **2. Procesamiento en Backend (bridge-payments)**

```javascript
// En /payments/intents endpoint
if (userContext.isGuest && userContext.guestData) {
  paymentMetadata = {
    ...paymentMetadata,
    // Datos del guest para el proveedor de pagos
    guest_email: userContext.guestData.email,
    guest_name: userContext.guestData.name,
    ...(userContext.guestData.phone && { guest_phone: userContext.guestData.phone }),
    is_guest_payment: 'true'
  };
}
```

### **3. Sincronización Post-Pago**

```javascript
// En /payments/intents/:id/sync endpoint
if (userContext.isGuest && payment.guest_email && payment.guest_data) {
  const metadataUpdate = {
    guest_email: payment.guest_email,
    guest_name: guestData.name || 'Guest User',
    ...(guestData.phone && { guest_phone: guestData.phone }),
    is_guest_payment: 'true',
    updated_by_sync: 'true',
    sync_timestamp: new Date().toISOString()
  };

  // ✅ NUEVO: Actualizar metadatos en Stripe
  await adapter.updatePaymentIntent(payment.provider_intent_id!, {
    metadata: metadataUpdate
  });
}
```

## 📋 Estructura de Metadatos

### **Metadatos Guardados en Stripe:**

```json
{
  "guest_email": "juan.perez@example.com",
  "guest_name": "Juan Pérez",
  "guest_phone": "+1234567890",
  "is_guest_payment": "true",
  "updated_by_sync": "true",
  "sync_timestamp": "2025-06-18T08:30:00.000Z",
  "source": "bethel-payment-element-setup",
  "concept": "Diezmo",
  "reference_code": "donation_tithe",
  "category": "donation"
}
```

### **Campos Obligatorios:**
- `guest_email` - Email del usuario guest
- `guest_name` - Nombre completo del usuario
- `is_guest_payment` - Flag que indica pago de guest

### **Campos Opcionales:**
- `guest_phone` - Teléfono del usuario (si se proporciona)
- `updated_by_sync` - Flag que indica actualización por sync
- `sync_timestamp` - Timestamp de la sincronización

## 🔧 Implementación Técnica

### **Frontend (PaymentProcessor)**

```typescript
// Agregar datos del guest a metadatos
metadata: {
  // ... otros metadatos
  ...(guestData?.name && { guest_name: guestData.name }),
  ...(guestData?.email && { guest_email: guestData.email }),
  ...(guestData?.phone && { guest_phone: guestData.phone })
}
```

### **Backend (Stripe Adapter)**

```typescript
// Método updatePaymentIntent actualizado
async updatePaymentIntent(id: string, updates: any): Promise<PaymentIntent> {
  const params: Stripe.PaymentIntentUpdateParams = {};
  
  if (updates.metadata !== undefined) {
    params.metadata = updates.metadata; // ✅ Soporta actualización de metadatos
  }
  
  const paymentIntent = await this.stripe.paymentIntents.update(id, params);
  return this.mapStripePaymentIntent(paymentIntent);
}
```

### **Endpoint de Sync**

```typescript
// Actualización de metadatos durante sync
if (userContext.isGuest && payment.guest_email && payment.guest_data) {
  const metadataUpdate = {
    guest_email: payment.guest_email,
    guest_name: guestData.name || 'Guest User',
    ...(guestData.phone && { guest_phone: guestData.phone }),
    is_guest_payment: 'true',
    updated_by_sync: 'true',
    sync_timestamp: new Date().toISOString()
  };

  await adapter.updatePaymentIntent(payment.provider_intent_id!, {
    metadata: metadataUpdate
  });
}
```

## 🧪 Testing

### **Script de Prueba:**

```bash
# Ejecutar test de metadatos
bun run scripts/test-guest-metadata.ts
```

### **Verificación Manual:**

1. **Crear donación como guest** en `/donate`
2. **Completar pago** con Stripe
3. **Verificar en Stripe Dashboard:**
   - Ir a: `https://dashboard.stripe.com/test/payments/{payment_intent_id}`
   - Revisar sección "Metadata"
   - Confirmar que aparecen: `guest_email`, `guest_name`, `guest_phone`, `is_guest_payment`

### **Logs de Debug:**

```bash
# Activar logs detallados
LOG_MODE=true

# Buscar en logs:
📝 Updating Stripe payment intent metadata with guest information...
✅ Stripe payment intent metadata updated with guest information
```

## 📊 Beneficios

### **Para Análisis:**
- ✅ Datos de guest visibles en Stripe Dashboard
- ✅ Reportes más completos con información de contacto
- ✅ Seguimiento de donaciones por email de guest

### **Para Soporte:**
- ✅ Identificación rápida de transacciones de guest
- ✅ Información de contacto disponible para resolución de problemas
- ✅ Historial completo de interacciones

### **Para Marketing:**
- ✅ Segmentación de usuarios guest vs registrados
- ✅ Análisis de patrones de donación por tipo de usuario
- ✅ Datos para campañas de conversión guest → usuario registrado

## 🔍 Troubleshooting

### **Metadatos No Aparecen:**

1. **Verificar frontend:**
   ```javascript
   // Confirmar que guestData se pasa correctamente
   console.log('Guest data:', guestData);
   ```

2. **Verificar backend:**
   ```bash
   # Buscar en logs
   📧 Adding guest data to stripe metadata for guest payment
   ```

3. **Verificar sync:**
   ```bash
   # Buscar en logs
   📝 Updating Stripe payment intent metadata with guest information...
   ✅ Stripe payment intent metadata updated
   ```

### **Datos Incompletos:**

- **Email faltante:** Verificar que `guest_data.email` esté presente
- **Nombre faltante:** Verificar que `guest_data.name` esté presente  
- **Teléfono faltante:** Campo opcional, verificar si se proporciona

### **Sync Fallando:**

```bash
# Error común
⚠️ Failed to update Stripe metadata: [error details]

# Solución: Verificar que payment_intent_id sea válido
```

## 🚀 Próximos Pasos

### **Mejoras Futuras:**
1. **Webhook Integration:** Procesar metadatos en webhooks de Stripe
2. **Analytics Dashboard:** Mostrar estadísticas de guest vs usuarios registrados
3. **Guest Conversion:** Tracking de conversión guest → usuario registrado
4. **Metadata Validation:** Validación más estricta de datos de guest

### **Monitoreo:**
- Implementar alertas para fallos de actualización de metadatos
- Dashboard de métricas de guest payments
- Reportes automáticos de calidad de datos
