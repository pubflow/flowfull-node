# 🇩🇴 Azul Database Integration - Using Existing Schema

Complete guide for integrating Azul payment gateway with your existing multi-purpose database schema using JSON metadata columns.

## 📋 Overview

**✅ No se requieren nuevas tablas para Azul**

Tu esquema de base de datos existente ya soporta completamente Azul usando las columnas `metadata` JSON para almacenar datos específicos del proveedor. Esta arquitectura mantiene la flexibilidad y evita la proliferación de tablas específicas por proveedor.

## 🗄️ Tablas Utilizadas

### 1. `payments` - Transacciones Azul

**Campos principales:**
- `provider_id` = `'azul'`
- `provider_payment_id` = Azul Order ID
- `metadata` = Datos específicos de Azul

**Ejemplo de registro:**
```sql
INSERT INTO payments (
    id, order_id, provider_id, provider_payment_id,
    amount_cents, currency, status, metadata
) VALUES (
    'pay_azul_123',
    'order_456', 
    'azul',
    '987654321', -- Azul Order ID
    299900, -- RD$2,999.00
    'DOP',
    'completed',
    '{
        "azul_order_id": "987654321",
        "authorization_code": "123456",
        "rrn": "123456789012", 
        "response_code": "00",
        "lot_number": "001",
        "ticket": "1234",
        "iso_code": "00",
        "merchant_id": "123456",
        "channel": "EC",
        "store": "38",
        "pos_input_mode": "E-Commerce",
        "transaction_type": "Sale",
        "currency_pos_code": "214",
        "itbis": "537.82",
        "custom_order_id": "ORDER_456",
        "ecommerce_url": "https://tu-sitio.com",
        "acquirer_ref_data": "1",
        "three_ds_data": {
            "authentication_status": "Y",
            "eci": "05", 
            "cavv": "base64_cavv_value",
            "xid": "transaction_xid"
        },
        "risk_data": {
            "score": 85,
            "recommendation": "approve"
        }
    }'
);
```

### 2. `payment_methods` - DataVault Tokens

**Campos principales:**
- `provider_id` = `'azul'`
- `provider_payment_method_id` = DataVault Token
- `metadata` = Información del token

**Ejemplo de registro:**
```sql
INSERT INTO payment_methods (
    id, user_id, provider_id, provider_payment_method_id,
    payment_type, last_four, card_brand, metadata
) VALUES (
    'pm_azul_789',
    'user_123',
    'azul', 
    'token_abc123def456', -- DataVault Token
    'credit_card',
    '1111',
    'visa',
    '{
        "azul_token": "token_abc123def456",
        "azul_brand": "VISA",
        "azul_expiration": "1225",
        "token_created_at": "2024-12-02T13:16:26Z",
        "validation_status": "validated",
        "customer_type": "individual",
        "card_holder_name": "Juan Perez",
        "creation_method": "manual_entry",
        "last_validation": "2024-12-02T13:16:26Z",
        "usage_count": 5,
        "risk_score": 90
    }'
);
```

### 3. `provider_customers` - Clientes Azul

**Campos principales:**
- `provider_id` = `'azul'`
- `provider_customer_id` = ID interno de Azul (si aplica)
- `metadata` = Preferencias y datos del cliente

**Ejemplo de registro:**
```sql
INSERT INTO provider_customers (
    id, user_id, provider_id, provider_customer_id,
    guest_email, is_guest, metadata
) VALUES (
    'cust_azul_456',
    'user_123',
    'azul',
    'azul_cust_789', -- ID interno si Azul lo proporciona
    NULL, -- No es guest
    false,
    '{
        "azul_customer_data": {
            "preferred_currency": "DOP",
            "tax_id": "12345678901",
            "preferred_language": "es-DO",
            "billing_preferences": {
                "auto_pay": true,
                "invoice_delivery": "email",
                "payment_reminder": true
            },
            "address_preferences": {
                "default_country": "DO",
                "address_validation": true
            }
        },
        "risk_profile": {
            "score": 85,
            "level": "low",
            "last_updated": "2024-12-02T13:16:26Z",
            "factors": ["good_payment_history", "verified_identity"]
        },
        "preferences": {
            "notifications": {
                "payment_success": true,
                "payment_failed": true,
                "subscription_renewal": true
            },
            "communication": {
                "language": "es-DO",
                "timezone": "America/Santo_Domingo"
            }
        }
    }'
);
```

### 4. `payment_webhooks` - Eventos Azul

**Campos principales:**
- `provider_id` = `'azul'`
- `event_type` = Tipo de evento Azul
- `payload` = Datos completos del webhook

**Ejemplo de registro:**
```sql
INSERT INTO payment_webhooks (
    id, provider_id, event_type, payload, processed
) VALUES (
    'webhook_azul_101',
    'azul',
    'payment.completed',
    '{
        "NotificationId": "notif_12345",
        "EventType": "payment.completed", 
        "Timestamp": "2024-12-02T13:16:26Z",
        "MerchantId": "123456",
        "Data": {
            "AzulOrderId": "987654321",
            "CustomOrderId": "ORDER_456",
            "Amount": "2999.00",
            "Currency": "DOP",
            "ResponseCode": "00",
            "AuthorizationCode": "123456",
            "TransactionType": "Sale",
            "CardBrand": "VISA",
            "LastFourDigits": "1111",
            "RRN": "123456789012",
            "Ticket": "1234",
            "LotNumber": "001"
        },
        "Signature": "hmac_sha256_signature"
    }',
    false
);
```

## 🔍 Consultas Útiles

### Buscar Transacciones Azul por Order ID
```sql
SELECT 
    p.*,
    JSON_EXTRACT(p.metadata, '$.azul_order_id') as azul_order_id,
    JSON_EXTRACT(p.metadata, '$.authorization_code') as auth_code,
    JSON_EXTRACT(p.metadata, '$.response_code') as response_code
FROM payments p 
WHERE p.provider_id = 'azul' 
AND JSON_EXTRACT(p.metadata, '$.azul_order_id') = '987654321';
```

### Obtener Tokens DataVault de un Usuario
```sql
SELECT 
    pm.*,
    JSON_EXTRACT(pm.metadata, '$.azul_token') as azul_token,
    JSON_EXTRACT(pm.metadata, '$.azul_brand') as card_brand,
    JSON_EXTRACT(pm.metadata, '$.azul_expiration') as expiration
FROM payment_methods pm
WHERE pm.provider_id = 'azul' 
AND pm.user_id = 'user_123'
AND pm.payment_type = 'credit_card';
```

### Estadísticas de Transacciones Azul
```sql
SELECT 
    JSON_EXTRACT(metadata, '$.response_code') as response_code,
    COUNT(*) as transaction_count,
    SUM(amount_cents) as total_amount,
    currency
FROM payments 
WHERE provider_id = 'azul'
AND created_at >= DATE_SUB(NOW(), INTERVAL 30 DAY)
GROUP BY JSON_EXTRACT(metadata, '$.response_code'), currency
ORDER BY transaction_count DESC;
```

### Webhooks Pendientes de Procesar
```sql
SELECT 
    pw.*,
    JSON_EXTRACT(pw.payload, '$.EventType') as event_type,
    JSON_EXTRACT(pw.payload, '$.Data.AzulOrderId') as azul_order_id
FROM payment_webhooks pw
WHERE pw.provider_id = 'azul' 
AND pw.processed = false
ORDER BY pw.created_at ASC;
```

### Clientes con Preferencias Dominicanas
```sql
SELECT 
    pc.*,
    JSON_EXTRACT(pc.metadata, '$.azul_customer_data.preferred_currency') as currency,
    JSON_EXTRACT(pc.metadata, '$.azul_customer_data.tax_id') as rnc,
    JSON_EXTRACT(pc.metadata, '$.azul_customer_data.preferred_language') as language
FROM provider_customers pc
WHERE pc.provider_id = 'azul'
AND JSON_EXTRACT(pc.metadata, '$.azul_customer_data.preferred_currency') = 'DOP';
```

## 📊 Índices Recomendados

### Índices para Consultas Azul
```sql
-- Índice para búsquedas por Azul Order ID
CREATE INDEX idx_payments_azul_order_id 
ON payments ((JSON_EXTRACT(metadata, '$.azul_order_id')))
WHERE provider_id = 'azul';

-- Índice para tokens DataVault
CREATE INDEX idx_payment_methods_azul_token
ON payment_methods ((JSON_EXTRACT(metadata, '$.azul_token')))
WHERE provider_id = 'azul';

-- Índice para response codes
CREATE INDEX idx_payments_azul_response_code
ON payments ((JSON_EXTRACT(metadata, '$.response_code')))
WHERE provider_id = 'azul';

-- Índice para webhooks por evento
CREATE INDEX idx_webhooks_azul_event_type
ON payment_webhooks ((JSON_EXTRACT(payload, '$.EventType')))
WHERE provider_id = 'azul';
```

## 🔄 Migración de Datos (Si es necesario)

### Script para Migrar Datos Existentes
```sql
-- Si ya tienes datos de Azul en otras tablas, puedes migrarlos:

-- Migrar transacciones existentes
INSERT INTO payments (
    id, provider_id, provider_payment_id, amount_cents, 
    currency, status, metadata, created_at
)
SELECT 
    CONCAT('pay_azul_', old_id),
    'azul',
    azul_order_id,
    amount_cents,
    currency,
    CASE 
        WHEN response_code = '00' THEN 'completed'
        WHEN response_code IN ('05', '14', '54') THEN 'failed'
        ELSE 'pending'
    END,
    JSON_OBJECT(
        'azul_order_id', azul_order_id,
        'authorization_code', authorization_code,
        'response_code', response_code,
        'rrn', rrn,
        'migrated_from', 'legacy_table'
    ),
    created_at
FROM legacy_azul_transactions;
```

## 🛠️ Funciones de Utilidad

### Función para Extraer Datos Azul
```sql
-- Función para obtener datos específicos de Azul del metadata
DELIMITER //
CREATE FUNCTION GetAzulData(payment_metadata JSON, data_key VARCHAR(255))
RETURNS VARCHAR(255)
READS SQL DATA
DETERMINISTIC
BEGIN
    RETURN JSON_UNQUOTE(JSON_EXTRACT(payment_metadata, CONCAT('$.', data_key)));
END //
DELIMITER ;

-- Uso:
SELECT 
    id,
    GetAzulData(metadata, 'azul_order_id') as azul_order_id,
    GetAzulData(metadata, 'authorization_code') as auth_code
FROM payments 
WHERE provider_id = 'azul';
```

### Procedimiento para Limpiar Webhooks Procesados
```sql
DELIMITER //
CREATE PROCEDURE CleanupProcessedAzulWebhooks(IN days_old INT)
BEGIN
    DELETE FROM payment_webhooks 
    WHERE provider_id = 'azul' 
    AND processed = true 
    AND processed_at < DATE_SUB(NOW(), INTERVAL days_old DAY);
    
    SELECT ROW_COUNT() as deleted_webhooks;
END //
DELIMITER ;

-- Uso: Limpiar webhooks procesados de más de 30 días
CALL CleanupProcessedAzulWebhooks(30);
```

## 📈 Ventajas de Usar el Esquema Existente

### ✅ Beneficios
1. **Sin Proliferación de Tablas** - Mantiene el esquema limpio
2. **Flexibilidad** - Fácil agregar nuevos campos específicos de Azul
3. **Consistencia** - Mismo patrón para todos los proveedores
4. **Performance** - Índices JSON optimizados para consultas frecuentes
5. **Mantenimiento** - Un solo esquema para mantener
6. **Escalabilidad** - Fácil agregar nuevos proveedores

### 🔧 Consideraciones
1. **Índices JSON** - Crear índices específicos para consultas frecuentes
2. **Validación** - Implementar validación de esquema JSON en la aplicación
3. **Migración** - Plan para migrar datos existentes si es necesario
4. **Backup** - Asegurar que los backups incluyan datos JSON correctamente

## 🚀 Próximos Pasos

1. **Implementar Adaptador** - Usar este esquema en el AzulAdapter
2. **Crear Índices** - Implementar índices JSON recomendados
3. **Testing** - Probar consultas con datos de prueba
4. **Monitoreo** - Configurar métricas para consultas JSON
5. **Documentación** - Actualizar documentación del equipo

---

Esta integración aprovecha al máximo tu esquema existente, manteniendo la flexibilidad y evitando la complejidad de tablas adicionales específicas para Azul.
