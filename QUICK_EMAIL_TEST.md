# 🚀 Prueba Rápida del Sistema de Emails

## ✅ URLs de Prueba (Copiar y Pegar)

### 1. Verificar Configuración
```
http://localhost:4000/bridge-payment/test-email/config
```

### 2. Ver Template en Español
```
http://localhost:4000/bridge-payment/test-email/preview/es
```

### 3. Ver Template en Inglés
```
http://localhost:4000/bridge-payment/test-email/preview/en
```

### 4. Enviar Email de Prueba (GET - Fácil)
```
http://localhost:4000/bridge-payment/test-email/send?email=samuelorecio@gmail.com&name=Samuel&lang=es
```

### 5. Información de Templates
```
http://localhost:4000/bridge-payment/test-email/template-info
```

## 📧 Configuración Necesaria

Para que funcione el envío de emails, agrega estas variables a tu `.env`:

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

# Testing
TEST_EMAIL=samuelorecio@gmail.com
```

## 🔧 Obtener API Key de ZeptoMail

1. Ve a [ZeptoMail](https://www.zoho.com/zeptomail/)
2. Crea cuenta o inicia sesión
3. Ve a **Settings > API Keys**
4. Crea nueva API key
5. Copia en formato: `Zoho-enczapikey tu_key_aquí`

## 📱 Prueba con cURL

```bash
# Verificar configuración
curl http://localhost:4000/bridge-payment/test-email/config

# Enviar email de prueba
curl "http://localhost:4000/bridge-payment/test-email/send?email=tu-email@example.com&name=Tu%20Nombre&lang=es"

# Enviar via POST con JSON
curl -X POST http://localhost:4000/bridge-payment/test-email/receipt \
  -H "Content-Type: application/json" \
  -d '{"email":"tu-email@example.com","name":"Tu Nombre","language":"es"}'
```

## 🎯 Respuestas Esperadas

### Configuración OK:
```json
{
  "success": true,
  "config": {
    "zeptomailConfigured": true,
    "fromAddress": "noreply@bethellakewood.org",
    "organizationName": "Bethel Spanish Pentecostal Church",
    "defaultLanguage": "es",
    "templateExists": {
      "es": true,
      "en": true
    }
  }
}
```

### Email Enviado:
```json
{
  "success": true,
  "message": "Email sent successfully",
  "transactionId": "test_1234567890",
  "email": "samuelorecio@gmail.com",
  "name": "Samuel",
  "language": "es"
}
```

### Sin Configuración:
```json
{
  "success": false,
  "message": "Email service not configured"
}
```

## 🔍 Troubleshooting

### Email no se envía:
1. ✅ Verificar que `ZEPTOMAIL_API_KEY` esté configurado
2. ✅ Verificar que la API key sea válida
3. ✅ Revisar logs en consola de bridge-payments
4. ✅ Probar con `/config` primero

### Template no se ve:
1. ✅ Verificar que los archivos existan en `src/lib/email/templates/`
2. ✅ Verificar permisos de lectura
3. ✅ Revisar `/template-info` para diagnóstico

### Error de JSON:
1. ✅ Usar endpoint GET: `/send?email=...`
2. ✅ Verificar Content-Type en POST
3. ✅ Usar cURL con headers correctos

## 🎨 Personalización

Los templates están en:
- `src/lib/email/templates/es/transaction_receipt.html`
- `src/lib/email/templates/en/transaction_receipt.html`

Puedes modificar:
- Colores y estilos CSS
- Texto y mensajes
- Variables dinámicas
- Estructura del email

## 📊 Monitoreo

Logs importantes a revisar:
```
📧 Sending transaction receipt email...
✅ Transaction receipt sent successfully
⚠️ Failed to send transaction receipt: [error]
```

¡El sistema está listo para usar! 🚀
