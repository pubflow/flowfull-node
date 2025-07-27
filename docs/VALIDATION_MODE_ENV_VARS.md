# Validation Mode Environment Variables

Bridge-Payments ahora soporta el sistema de validation_mode compatible con Flowless usando variables de entorno individuales para mayor facilidad de configuración.

## 🔧 Variables de Entorno Principales

### **Validation Mode**
```bash
# Modo de validación (compatible con Flowless)
AUTH_VALIDATION_MODE=STANDARD          # DISABLED | STANDARD | ADVANCED | STRICT | CUSTOM
AUTH_ENABLE_VALIDATION_MODE=true       # Habilitar/deshabilitar validation mode
```

### **Configuración de Sesión**
```bash
# Configuración de sesión (compatible con Flowless AUTH)
AUTH_SESSION_TIME=30d                  # Tiempo de sesión (30d, 12h, etc.)
AUTH_ENABLED=true                      # Autenticación habilitada
AUTH_VERIFY_REGISTRATION=false         # Verificar registro
AUTH_PUBLIC_ACCOUNTS=false             # Cuentas públicas
AUTH_DEFAULT_USER_TYPE=customer        # Tipo de usuario por defecto
AUTH_LOGIN_URL=https://example.com/login  # URL de login
```

### **Configuración de Seguridad**
```bash
# Validaciones de seguridad
AUTH_IP_VALIDATION=true                # Validar IP address
AUTH_USER_AGENT_VALIDATION=true        # Validar User-Agent
AUTH_DEVICE_VALIDATION=false           # Validar device fingerprint
AUTH_AUTO_INVALIDATE=false             # Auto-invalidar sesiones con violaciones
AUTH_LOG_VIOLATIONS=true               # Log de violaciones de seguridad
AUTH_STRICT_MODE=false                 # Modo estricto
```

### **Configuración de Cache**
```bash
# Cache LRU mejorado
AUTH_CACHE_ENABLED=true                # Habilitar cache
AUTH_CACHE_TTL_MULTIPLIER=1.0          # Multiplicador de TTL
AUTH_CACHE_MAX_ENTRIES=1000            # Máximo de entradas en cache
AUTH_CACHE_VALIDATION_INTERVAL=300000  # Intervalo de revalidación (5 min)
AUTH_CACHE_SMART_INVALIDATION=true     # Invalidación inteligente
```

### **Configuración de Auditoría**
```bash
# Auditoría y logging
AUTH_AUDIT_ENABLED=false               # Habilitar auditoría
AUTH_AUDIT_LOG_VIOLATIONS=true         # Log de violaciones
AUTH_AUDIT_LOG_VALIDATIONS=false       # Log de todas las validaciones
```

## 🎯 Configuraciones por Modo

### **DISABLED (Desarrollo)**
```bash
AUTH_VALIDATION_MODE=DISABLED
AUTH_ENABLE_VALIDATION_MODE=false
# Cache habilitado pero sin validaciones de seguridad
```

### **STANDARD (Producción Básica)**
```bash
AUTH_VALIDATION_MODE=STANDARD
AUTH_ENABLE_VALIDATION_MODE=true
AUTH_IP_VALIDATION=true
AUTH_USER_AGENT_VALIDATION=false
AUTH_DEVICE_VALIDATION=false
AUTH_AUTO_INVALIDATE=false
AUTH_LOG_VIOLATIONS=true
```

### **ADVANCED (Producción Segura)**
```bash
AUTH_VALIDATION_MODE=ADVANCED
AUTH_ENABLE_VALIDATION_MODE=true
AUTH_IP_VALIDATION=true
AUTH_USER_AGENT_VALIDATION=true
AUTH_DEVICE_VALIDATION=true
AUTH_AUTO_INVALIDATE=false
AUTH_LOG_VIOLATIONS=true
AUTH_AUDIT_ENABLED=true
```

### **STRICT (Máxima Seguridad)**
```bash
AUTH_VALIDATION_MODE=STRICT
AUTH_ENABLE_VALIDATION_MODE=true
AUTH_IP_VALIDATION=true
AUTH_USER_AGENT_VALIDATION=true
AUTH_DEVICE_VALIDATION=true
AUTH_AUTO_INVALIDATE=true
AUTH_LOG_VIOLATIONS=true
AUTH_STRICT_MODE=true
AUTH_AUDIT_ENABLED=true
AUTH_AUDIT_LOG_VALIDATIONS=true
# Cache con TTL reducido
AUTH_CACHE_TTL_MULTIPLIER=0.5
AUTH_CACHE_MAX_ENTRIES=200
AUTH_CACHE_VALIDATION_INTERVAL=60000   # 1 minuto
```

### **CUSTOM (Configuración Personalizada)**
```bash
AUTH_VALIDATION_MODE=CUSTOM
AUTH_ENABLE_VALIDATION_MODE=true
# Configurar individualmente cada opción según necesidades
AUTH_IP_VALIDATION=true
AUTH_USER_AGENT_VALIDATION=true
AUTH_DEVICE_VALIDATION=false
AUTH_AUTO_INVALIDATE=false
AUTH_LOG_VIOLATIONS=true
# Cache personalizado
AUTH_CACHE_TTL_MULTIPLIER=0.8
AUTH_CACHE_MAX_ENTRIES=500
```

## 🔄 Compatibilidad con Flowless

El sistema también soporta la configuración JSON de Flowless para compatibilidad:

```bash
# Formato JSON (compatible con Flowless)
AUTH='{"enabled":true,"validation_mode":"STANDARD","session_time":"30d","public_accounts":true}'

# O usando variable específica de Flowless
FLOWLESS_AUTH_CONFIG='{"enabled":true,"validation_mode":"STANDARD","session_time":"30d"}'
```

**Prioridad de configuración:**
1. Variables individuales (`AUTH_VALIDATION_MODE`, etc.) - **Preferido para Bridge-Payments**
2. Variables de compatibilidad (`VALIDATION_MODE`, `ENABLE_VALIDATION_MODE`)
3. Configuración JSON (`AUTH`, `FLOWLESS_AUTH_CONFIG`)

## 📊 Monitoreo y Logs

El sistema genera logs informativos sobre la configuración:

```
🔐 Bridge-Payments Validation Mode: STANDARD
🔗 Flowless AUTH Config detected: validation_mode=STANDARD, session_time=30d
🔄 Enhanced Session Cache enabled (mode: STANDARD)
⚡ Session cache hit: abc12345...
🚨 Security violations for session abc12345...:
  - IP_MISMATCH: expected=192.168.1.1, actual=192.168.1.2 (HIGH)
```

## 🚀 Migración desde Sistema Anterior

Para migrar desde el sistema de cache básico:

1. **Agregar variables de entorno:**
```bash
AUTH_VALIDATION_MODE=STANDARD
AUTH_ENABLE_VALIDATION_MODE=true
```

2. **El sistema automáticamente:**
   - Detecta la configuración de Flowless
   - Usa cache mejorado con TTL dinámico
   - Aplica validaciones de seguridad según el modo
   - Mantiene compatibilidad con el sistema anterior

3. **Sin cambios de código necesarios** - el middleware existente funciona automáticamente con el nuevo sistema.

## ⚠️ Notas Importantes

- **TTL Dinámico**: El cache usa TTL basado en la expiración real de las sesiones de Flowless
- **Invalidación Automática**: Las sesiones expiradas se remueven automáticamente del cache
- **Seguridad**: Los datos en cache incluyen hash de integridad para prevenir manipulación
- **Escalabilidad**: Configuración optimizada para millones de usuarios según el modo seleccionado
