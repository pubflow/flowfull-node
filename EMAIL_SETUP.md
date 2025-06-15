# 📧 Email System Setup - Bridge Payments

## ✅ Sistema Implementado

Se ha implementado un **sistema completo de emails para recibos de transacciones** que se envía automáticamente cuando un pago es exitoso.

### 🎯 Características

- ✅ **Envío automático** en el endpoint `/payments/intents/:id/confirm`
- ✅ **Templates profesionales** en Español e Inglés
- ✅ **Soporte i18n** con detección automática de idioma
- ✅ **Integración ZeptoMail** para entrega confiable
- ✅ **Diseño responsivo** para móviles y desktop
- ✅ **Error handling** que no afecta el procesamiento de pagos

## 🚀 Configuración Rápida

### 1. Variables de Entorno

Copia el archivo `.env.bethel` a `.env` y configura:

```env
# Email Configuration (ZeptoMail)
ZEPTOMAIL_API_KEY=Zoho-enczapikey tu_api_key_aquí
EMAIL_FROM_ADDRESS=noreply@bethellakewood.org
EMAIL_FROM_NAME=Bethel Spanish Pentecostal Church
EMAIL_REPLY_TO_ADDRESS=info@bethellakewood.org

# Organization Information
ORGANIZATION_NAME=Bethel Spanish Pentecostal Church
ORGANIZATION_EMAIL=info@bethellakewood.org
ORGANIZATION_PHONE=+1 (732) 367-6585
ORGANIZATION_ADDRESS=219 Clifton Ave, Lakewood, NJ 08701
ORGANIZATION_WEBSITE=https://bethellakewood.org

# Language
GLOBAL_LANG=es
```

### 2. Obtener API Key de ZeptoMail

1. Ve a [ZeptoMail](https://www.zoho.com/zeptomail/)
2. Crea una cuenta o inicia sesión
3. Ve a **Settings > API Keys**
4. Crea una nueva API key
5. Copia la key en formato: `Zoho-enczapikey tu_key_aquí`

### 3. Probar Configuración

```bash
# Verificar configuración
curl http://localhost:4000/bridge-payment/test-email/config

# Enviar email de prueba
curl -X POST http://localhost:4000/bridge-payment/test-email/receipt \
  -H "Content-Type: application/json" \
  -d '{
    "email": "tu-email@example.com",
    "name": "Usuario Prueba",
    "language": "es"
  }'

# Ver template en navegador
curl http://localhost:4000/bridge-payment/test-email/preview/es
```

## 📧 Contenido del Recibo

### Información Incluida

- **Saludo personalizado** con nombre del cliente
- **Detalles de transacción**:
  - Monto en USD
  - Concepto/descripción
  - Fecha y hora
  - ID de transacción
  - Código de referencia
  - Estado (exitoso)
- **Información de contacto** de Bethel
- **Enlaces útiles** (privacidad, términos, contacto)
- **Mensaje de agradecimiento** profesional

### Diseño

- **Responsive** para móviles y desktop
- **Gradientes profesionales** en azul/púrpura
- **Iconos y emojis** para mejor UX
- **Tipografía clara** y legible
- **Colores de marca** consistentes

## 🔧 Funcionamiento

### Flujo Automático

1. **Usuario realiza pago** → Frontend llama a `/payments/intents/:id/confirm`
2. **Pago se confirma** → Estado cambia a `succeeded`
3. **Email se envía automáticamente** → Sin intervención manual
4. **Usuario recibe recibo** → En su bandeja de entrada

### Logs del Sistema

```
📧 Sending transaction receipt email...
✅ Transaction receipt sent successfully
```

O en caso de error:
```
⚠️ Failed to send transaction receipt: [error details]
```

## 🧪 Testing

### Endpoints de Prueba

```bash
# 1. Verificar configuración
GET /bridge-payment/test-email/config

# 2. Enviar email de prueba
POST /bridge-payment/test-email/receipt
{
  "email": "test@example.com",
  "name": "Test User",
  "language": "es"
}

# 3. Preview template en navegador
GET /bridge-payment/test-email/preview/es
GET /bridge-payment/test-email/preview/en

# 4. Info de templates
GET /bridge-payment/test-email/template-info
```

### Respuesta de Configuración

```json
{
  "success": true,
  "config": {
    "zeptomailConfigured": true,
    "fromAddress": "noreply@bethellakewood.org",
    "fromName": "Bethel Spanish Pentecostal Church",
    "organizationName": "Bethel Spanish Pentecostal Church",
    "defaultLanguage": "es",
    "availableLanguages": ["en", "es"],
    "templateExists": {
      "es": true,
      "en": true
    }
  }
}
```

## 🎨 Personalización

### Modificar Templates

Los templates están en:
- `src/lib/email/templates/es/transaction_receipt.html` (Español)
- `src/lib/email/templates/en/transaction_receipt.html` (Inglés)

### Variables Disponibles

```html
{{customer_name}}        <!-- Nombre del cliente -->
{{amount}}              <!-- Monto (25.00) -->
{{currency}}            <!-- Moneda (USD) -->
{{concept}}             <!-- Concepto de la donación -->
{{reference_code}}      <!-- Código de referencia -->
{{transaction_id}}      <!-- ID de transacción -->
{{transaction_date}}    <!-- Fecha formateada -->
{{transaction_time}}    <!-- Hora formateada -->
{{organization_name}}   <!-- Nombre de la organización -->
{{contact_email}}       <!-- Email de contacto -->
{{contact_phone}}       <!-- Teléfono de contacto -->
{{contact_address}}     <!-- Dirección física -->
```

### Agregar Nuevos Idiomas

1. Crear directorio: `src/lib/email/templates/{lang}/`
2. Copiar `transaction_receipt.html` y `subjects.json`
3. Traducir contenido
4. Actualizar `supportedLanguages` en `template-service.ts`

## 🔍 Troubleshooting

### Email No Se Envía

1. **Verificar API Key**: `GET /test-email/config`
2. **Revisar logs**: Buscar mensajes de error en consola
3. **Probar manualmente**: `POST /test-email/receipt`
4. **Verificar variables**: Todas las variables de entorno configuradas

### Template No Se Encuentra

1. **Verificar archivos**: Templates existen en `src/lib/email/templates/`
2. **Permisos**: Archivos son legibles
3. **Sintaxis**: HTML válido sin errores

### Variables No Se Reemplazan

1. **Sintaxis correcta**: `{{variable}}` con dobles llaves
2. **Nombres exactos**: Usar nombres de variables documentados
3. **Datos disponibles**: Verificar que los datos existen en la transacción

## 📝 Logs y Monitoreo

### Logs Importantes

```bash
# Email enviado exitosamente
✅ Transaction receipt sent successfully

# Error de configuración
⚠️ ZEPTOMAIL_API_KEY not configured, skipping email

# Error de template
❌ Transaction receipt template not found

# Error de API
❌ Email API error: 401
```

### Métricas

- **Tasa de entrega**: Monitorear en ZeptoMail dashboard
- **Errores de email**: Revisar logs de aplicación
- **Templates renderizados**: Usar endpoints de preview

## 🎯 Próximos Pasos

1. **Configurar API Key** de ZeptoMail
2. **Probar con transacción real**
3. **Personalizar templates** con branding de Bethel
4. **Configurar monitoreo** de entrega
5. **Agregar más tipos de email** (confirmaciones, recordatorios)

---

**¡El sistema está listo para usar! 🚀**

Solo necesitas configurar tu API Key de ZeptoMail y empezar a recibir recibos automáticos.
