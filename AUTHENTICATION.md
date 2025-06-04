# 🔐 Sistema de Autenticación y Autorización - Bridge Payments

## 📋 Descripción General

Sistema completo de autenticación y autorización con cache seguro para Bridge Payments que integra con tu backend de autenticación existente (FLOWLESS_API_URL).

## 🏗️ Arquitectura del Sistema

### **Componentes Principales:**

1. **🗄️ User Cache Manager** (`src/lib/auth/user-cache.ts`)
   - Cache LRU con TTL configurable
   - Verificación de integridad con hashing seguro
   - Limpieza automática de entradas expiradas
   - Auditoría de seguridad

2. **🔐 Auth Service** (`src/lib/auth/auth-service.ts`)
   - Validación con backend externo
   - Manejo de sesiones y tokens
   - Timeout y retry logic
   - Conversión de respuestas del backend

3. **🛡️ Auth Middleware** (`src/lib/auth/auth-middleware.ts`)
   - Middleware para admin (solo administradores)
   - Middleware para usuarios (acceso a recursos propios)
   - Autenticación opcional
   - Logging de seguridad

4. **⚙️ Configuration** (`src/lib/auth/config.ts`)
   - Configuración centralizada
   - Permisos por ruta
   - Rate limiting por tipo de usuario

## 🔄 Flujos de Autenticación

### **1. Autenticación por Sesión (Usuarios Registrados)**
```
Header: Authorization: Bearer <sessionId>
Backend: POST /auth/bridge/validate
Cache Key: session:<hash>
```

### **2. Autenticación por Token (Usuarios Guest)**
```
Header: Authorization: Token <token>
Query: ?token=<token>
Backend: GET /auth/token/validate?token=<token>
Cache Key: token:<hash>
```

### **3. Usuarios Anónimos**
```
Sin autenticación
Acceso limitado a rutas públicas
```

## 🛡️ Middlewares de Seguridad

### **Admin Middleware**
```typescript
import { requireAdmin } from '../lib/auth/auth-middleware.js';

// Solo administradores
admin.use('*', requireAdmin());
```

### **User Middleware**
```typescript
import { requireUser, optionalAuth } from '../lib/auth/auth-middleware.js';

// Usuarios autenticados con verificación de ownership
payments.get('/payments/:id', requireUser({ ownershipCheck: true }));

// Autenticación opcional (soporta token en query)
payments.get('/payments', optionalAuth());
```

## 🔗 Endpoints Disponibles

### **🔒 Rutas de Admin** (`/bridge-payment/admin/*`)
- `GET /admin/stats` - Estadísticas del sistema
- `GET /admin/payments` - Lista todos los pagos (con filtros)
- `GET /admin/payments/:id` - Detalles de pago específico
- `PATCH /admin/payments/:id` - Actualizar estado de pago
- `GET /admin/cache/stats` - Estadísticas de cache
- `POST /admin/cache/clear` - Limpiar cache
- `GET /admin/health` - Health check del sistema

### **👤 Rutas de Usuario** (`/bridge-payment/payments/*`)
- `GET /payments` - Lista pagos del usuario (con `?token=xyz`)
- `GET /payments/:id` - Detalles de pago propio
- `POST /payments/intents` - Crear payment intent (público)

### **🌐 Rutas Públicas**
- `GET /health` - Health check básico
- `POST /bridge-payment/webhooks/*` - Webhooks de proveedores

## ⚙️ Variables de Entorno

### **Requeridas:**
```env
FLOWLESS_API_URL=http://api.bethellakewood.com
BRIDGE_VALIDATION_SECRET=your_secret_key
```

### **Opcionales:**
```env
# Cache Configuration
USER_CACHE_TTL=600000              # 10 minutos
USER_CACHE_REVALIDATE=180000       # 3 minutos
USER_CACHE_MAX_ENTRIES=500
CACHE_SECRET_KEY=optional_key

# Security
AUTH_REQUEST_TIMEOUT=5000          # 5 segundos
MAX_AUTH_ATTEMPTS=5

# User Type Restrictions
ADMIN_USER_TYPES=admin,super_admin
USER_USER_TYPES=admin,user,premium
GUEST_USER_TYPES=admin,user,guest

# Security Monitoring
LOG_SECURITY_EVENTS=true
ENABLE_SECURITY_MONITORING=true
```

## 🔐 Ejemplos de Uso

### **1. Usuario Admin Accediendo a Estadísticas**
```bash
curl -H "Authorization: Bearer <sessionId>" \
     http://localhost:3001/bridge-payment/admin/stats
```

### **2. Usuario Viendo Sus Pagos (con Token)**
```bash
curl "http://localhost:3001/bridge-payment/payments?token=<token>"
```

### **3. Usuario Viendo Sus Pagos (con Header)**
```bash
curl -H "Authorization: Token <token>" \
     http://localhost:3001/bridge-payment/payments
```

### **4. Usuario Viendo Pago Específico**
```bash
curl -H "Authorization: Bearer <sessionId>" \
     http://localhost:3001/bridge-payment/payments/<payment_id>
```

## 🔒 Características de Seguridad

### **Cache Seguro:**
- ✅ Hashing de identificadores (no se almacenan tokens/sesiones raw)
- ✅ Verificación de integridad con hash de seguridad
- ✅ TTL automático y limpieza de entradas expiradas
- ✅ Auditoría de actividad sospechosa

### **Validación de Backend:**
- ✅ Timeout configurable (5 segundos por defecto)
- ✅ Validación de estructura de respuesta
- ✅ Manejo seguro de errores
- ✅ Logging de intentos de autenticación

### **Control de Acceso:**
- ✅ Verificación de ownership (usuarios solo ven sus recursos)
- ✅ Permisos granulares por userType
- ✅ Admin puede acceder a todos los recursos
- ✅ Rate limiting por tipo de usuario

### **Logging de Seguridad:**
- ✅ Intentos de autenticación (exitosos y fallidos)
- ✅ Intentos de acceso no autorizado
- ✅ Actividad sospechosa en cache
- ✅ Operaciones administrativas

## 📊 Monitoreo y Auditoría

### **Cache Statistics:**
```typescript
const stats = authService.getCacheStats();
// Returns: size, maxSize, ttl, healthCheck
```

### **Security Audit:**
```typescript
const audit = authService.auditSecurity();
// Returns: suspicious activity, integrity issues
```

### **Health Check:**
```bash
curl http://localhost:3001/bridge-payment/admin/health
```

## 🚨 Alertas de Seguridad

El sistema genera alertas automáticas para:
- 🔴 Intentos de acceso no autorizado
- 🟡 Rate limiting excedido
- 🟡 Cache approaching limits
- 🔴 Integrity check failures
- 🟡 Backend validation timeouts

## 🔧 Troubleshooting

### **Cache Issues:**
```bash
# Clear cache (admin only)
curl -X POST -H "Authorization: Bearer <admin_session>" \
     http://localhost:3001/bridge-payment/admin/cache/clear
```

### **Backend Connection Issues:**
- Verificar `FLOWLESS_API_URL` y `BRIDGE_VALIDATION_SECRET`
- Revisar logs de timeout en validación
- Verificar conectividad de red

### **Permission Issues:**
- Verificar `userType` del usuario
- Revisar configuración de `ADMIN_USER_TYPES`
- Verificar ownership de recursos

## 📈 Performance

### **Cache Hit Rates:**
- Primer acceso: Backend validation
- Accesos subsecuentes: Cache hit (hasta TTL)
- Re-validación: Cada 3 minutos por defecto

### **Rate Limits:**
- Admin: 1000 req/15min
- User: 500 req/15min  
- Guest: 100 req/15min
- Anonymous: 50 req/15min

## 🔄 Integración con Frontend

### **Headers Recomendados:**
```javascript
// Para usuarios con sesión
headers: {
  'Authorization': `Bearer ${sessionId}`,
  'Content-Type': 'application/json'
}

// Para usuarios con token
headers: {
  'Authorization': `Token ${token}`,
  'Content-Type': 'application/json'
}
```

### **Query Parameters:**
```javascript
// Para GET requests con token
const url = `/bridge-payment/payments?token=${token}`;
```

## ✅ Testing

El sistema incluye endpoints de debug y testing:
- `GET /bridge-payment/payments/debug/recent` - Pagos recientes
- `GET /bridge-payment/admin/cache/stats` - Estadísticas de cache
- `GET /bridge-payment/admin/health` - Health check completo
