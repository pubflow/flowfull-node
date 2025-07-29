# Authentication Modes Guide

Esta guía explica los diferentes modos de autenticación disponibles en FLOWFULL y cómo configurarlos según tus necesidades de seguridad.

## 🔐 Modos de Validación Disponibles

FLOWFULL incluye 4 modos de validación de sesiones con diferentes niveles de seguridad:

### 1. **DISABLED** - Sin Validación
- 🔓 **Uso**: Solo desarrollo local
- ⚡ **Performance**: Máxima
- 🛡️ **Seguridad**: Mínima
- 📝 **Descripción**: Desactiva todas las validaciones de seguridad

### 2. **STANDARD** - Validación Básica  
- 🔓 **Uso**: Desarrollo y staging
- ⚡ **Performance**: Alta
- 🛡️ **Seguridad**: Básica
- 📝 **Descripción**: Validación de IP address únicamente

### 3. **ADVANCED** - Validación Avanzada
- 🔓 **Uso**: Producción estándar
- ⚡ **Performance**: Media
- 🛡️ **Seguridad**: Alta
- 📝 **Descripción**: Validación de IP + User-Agent + Device

### 4. **STRICT** - Validación Estricta
- 🔓 **Uso**: Aplicaciones críticas
- ⚡ **Performance**: Menor
- 🛡️ **Seguridad**: Máxima
- 📝 **Descripción**: Todas las validaciones + auto-invalidación

## ⚙️ Configuración por Modo

### **DISABLED Mode**

```env
# .env - Solo para desarrollo local
AUTH_VALIDATION_MODE=DISABLED
AUTH_ENABLE_VALIDATION_MODE=false

# Todas las validaciones desactivadas
AUTH_IP_VALIDATION=false
AUTH_USER_AGENT_VALIDATION=false
AUTH_DEVICE_VALIDATION=false
AUTH_AUTO_INVALIDATE=false
AUTH_LOG_VIOLATIONS=false
```

**Cuándo usar:**
- ✅ Desarrollo local
- ✅ Testing automatizado
- ✅ Debugging de autenticación
- ❌ Nunca en producción

### **STANDARD Mode**

```env
# .env - Desarrollo y staging
AUTH_VALIDATION_MODE=STANDARD
AUTH_ENABLE_VALIDATION_MODE=true

# Solo validación de IP
AUTH_IP_VALIDATION=true
AUTH_USER_AGENT_VALIDATION=false
AUTH_DEVICE_VALIDATION=false
AUTH_AUTO_INVALIDATE=false
AUTH_LOG_VIOLATIONS=true
```

**Cuándo usar:**
- ✅ Staging environment
- ✅ Aplicaciones internas
- ✅ APIs con usuarios confiables
- ⚠️ Producción con bajo riesgo

**Validaciones activas:**
- 🔍 **IP Address**: Detecta cambios de ubicación
- 📊 **Logging**: Registra violaciones de seguridad

### **ADVANCED Mode** (Recomendado)

```env
# .env - Producción estándar
AUTH_VALIDATION_MODE=ADVANCED
AUTH_ENABLE_VALIDATION_MODE=true

# Validaciones múltiples
AUTH_IP_VALIDATION=true
AUTH_USER_AGENT_VALIDATION=true
AUTH_DEVICE_VALIDATION=true
AUTH_AUTO_INVALIDATE=false
AUTH_LOG_VIOLATIONS=true
```

**Cuándo usar:**
- ✅ Producción estándar
- ✅ Aplicaciones web públicas
- ✅ APIs con datos sensibles
- ✅ E-commerce y fintech

**Validaciones activas:**
- 🔍 **IP Address**: Detecta cambios de ubicación
- 🖥️ **User-Agent**: Detecta cambios de navegador/dispositivo
- 📱 **Device Fingerprint**: Detecta cambios de dispositivo
- 📊 **Logging**: Registra todas las violaciones

### **STRICT Mode**

```env
# .env - Aplicaciones críticas
AUTH_VALIDATION_MODE=STRICT
AUTH_ENABLE_VALIDATION_MODE=true

# Todas las validaciones + auto-invalidación
AUTH_IP_VALIDATION=true
AUTH_USER_AGENT_VALIDATION=true
AUTH_DEVICE_VALIDATION=true
AUTH_AUTO_INVALIDATE=true
AUTH_LOG_VIOLATIONS=true
```

**Cuándo usar:**
- ✅ Aplicaciones bancarias
- ✅ Sistemas de salud
- ✅ Datos gubernamentales
- ✅ Aplicaciones con PII sensible

**Validaciones activas:**
- 🔍 **IP Address**: Detecta y bloquea cambios de ubicación
- 🖥️ **User-Agent**: Detecta y bloquea cambios de navegador
- 📱 **Device Fingerprint**: Detecta y bloquea cambios de dispositivo
- ⚡ **Auto-Invalidate**: Invalida sesiones automáticamente
- 📊 **Logging**: Registra y alerta sobre violaciones

## 🔍 Detalles de Validaciones

### **IP Address Validation**

```typescript
// Detecta cambios en la dirección IP
const currentIP = request.headers['x-forwarded-for'] || request.ip;
const sessionIP = session.ip_address;

if (currentIP !== sessionIP) {
  // STANDARD/ADVANCED: Log warning
  // STRICT: Invalidate session
}
```

**Casos detectados:**
- 🌍 Cambio de ubicación geográfica
- 🏠 Cambio de red (casa → oficina)
- 📱 Cambio de conexión (WiFi → móvil)
- 🔒 Uso de VPN/Proxy

### **User-Agent Validation**

```typescript
// Detecta cambios en el navegador/dispositivo
const currentUA = request.headers['user-agent'];
const sessionUA = session.user_agent;

if (currentUA !== sessionUA) {
  // ADVANCED: Log warning
  // STRICT: Invalidate session
}
```

**Casos detectados:**
- 🌐 Cambio de navegador
- 📱 Cambio de dispositivo
- 🔄 Actualización de navegador
- 🤖 Uso de bots/scrapers

### **Device Fingerprint Validation**

```typescript
// Detecta cambios en el fingerprint del dispositivo
const currentDevice = generateDeviceFingerprint(request);
const sessionDevice = session.user_device;

if (currentDevice !== sessionDevice) {
  // ADVANCED: Log warning
  // STRICT: Invalidate session
}
```

**Casos detectados:**
- 💻 Cambio de dispositivo físico
- 🔧 Cambios en configuración del sistema
- 🖥️ Cambios en resolución/pantalla
- 🔌 Cambios en plugins/extensiones

## 📊 Impacto en Performance

### **Latencia por Modo**

| Modo | Cache Hit | Cache Miss | Validaciones |
|------|-----------|------------|--------------|
| DISABLED | ~1ms | ~1ms | 0 |
| STANDARD | ~2ms | ~50ms | 1 |
| ADVANCED | ~3ms | ~60ms | 3 |
| STRICT | ~4ms | ~70ms | 3 + invalidation |

### **Optimizaciones Incluidas**

- 🚀 **LFU Cache**: Sessions frecuentes en memoria
- ⚡ **Batch Validation**: Validaciones en paralelo
- 🔄 **Connection Pooling**: Reutilización de conexiones
- 📦 **Compression**: Respuestas comprimidas

## 🛠️ Configuración Dinámica

### **Por Environment**

```typescript
// src/config/auth-modes.ts
const authConfig = {
  development: {
    mode: 'DISABLED',
    enableValidation: false
  },
  staging: {
    mode: 'STANDARD',
    enableValidation: true,
    ipValidation: true
  },
  production: {
    mode: 'ADVANCED',
    enableValidation: true,
    ipValidation: true,
    userAgentValidation: true,
    deviceValidation: true
  }
};
```

### **Por Tipo de Usuario**

```typescript
// Configuración granular por userType
app.use('/admin/*', authMiddleware, (c, next) => {
  const user = c.get('user');
  
  if (user.userType === 'admin') {
    // Forzar modo STRICT para admins
    c.set('authMode', 'STRICT');
  }
  
  return next();
});
```

### **Por Ruta Sensible**

```typescript
// Validación estricta para rutas críticas
app.delete('/users/:id', authMiddleware, strictValidation, async (c) => {
  // Esta ruta siempre usa validación STRICT
});

// Middleware de validación estricta
const strictValidation = async (c, next) => {
  c.set('authMode', 'STRICT');
  return next();
};
```

## 🚨 Manejo de Violaciones

### **Logging de Seguridad**

```typescript
// Logs automáticos por violación
{
  "timestamp": "2024-01-15T10:30:00Z",
  "level": "SECURITY_WARNING",
  "event": "IP_VALIDATION_FAILED",
  "userId": "user_123",
  "sessionId": "sess_456",
  "details": {
    "expectedIP": "192.168.1.100",
    "actualIP": "203.0.113.50",
    "userAgent": "Mozilla/5.0...",
    "action": "logged" // o "invalidated"
  }
}
```

### **Respuestas por Modo**

```typescript
// STANDARD/ADVANCED - Warning
{
  "warning": "Security validation failed",
  "code": "IP_MISMATCH",
  "action": "logged"
}

// STRICT - Session invalidated
{
  "error": "Session invalidated",
  "code": "SECURITY_VIOLATION",
  "action": "invalidated",
  "message": "Please login again"
}
```

## 📋 Recomendaciones por Caso de Uso

### **🏗️ Desarrollo**
```env
AUTH_VALIDATION_MODE=DISABLED
```
- Sin validaciones para desarrollo rápido
- Fácil debugging y testing

### **🧪 Staging/QA**
```env
AUTH_VALIDATION_MODE=STANDARD
```
- Validación básica para detectar problemas
- Performance similar a producción

### **🌐 Web App Pública**
```env
AUTH_VALIDATION_MODE=ADVANCED
```
- Balance entre seguridad y usabilidad
- Detecta la mayoría de ataques

### **🏦 Aplicación Crítica**
```env
AUTH_VALIDATION_MODE=STRICT
```
- Máxima seguridad
- Auto-invalidación de sesiones sospechosas

### **📱 Mobile App**
```env
AUTH_VALIDATION_MODE=STANDARD
# Device validation puede ser problemática en móviles
AUTH_DEVICE_VALIDATION=false
```

## 🔗 Referencias

- [Protected Routes Guide](./protected-routes.md)
- [Environment Setup](./environment-setup.md)
- [Security Best Practices](./security.md)
- [Troubleshooting Auth](./troubleshooting-auth.md)
