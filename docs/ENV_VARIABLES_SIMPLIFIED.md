# Variables de Entorno Simplificadas - Bridge Payments

## 🚀 ¿Qué pasa si NO configuro nada?

**¡El sistema funciona automáticamente con valores seguros por defecto!**

### **Valores por defecto (sin configurar nada):**
```bash
# Estos son los valores que se usan automáticamente:
AUTH_VALIDATION_MODE=STANDARD          # ← Modo estándar
AUTH_ENABLE_VALIDATION_MODE=true       # ← Sistema habilitado
AUTH_IP_VALIDATION=true                # ← Valida IP
AUTH_USER_AGENT_VALIDATION=false       # ← NO valida User-Agent
AUTH_DEVICE_VALIDATION=false           # ← NO valida Device
AUTH_AUTO_INVALIDATE=false             # ← NO auto-invalida
AUTH_LOG_VIOLATIONS=true               # ← SÍ logea violaciones
```

### **¿Qué significa esto?**
- ✅ **Sistema habilitado** con modo STANDARD
- ✅ **Solo valida cambios de IP** (más permisivo)
- ✅ **Permite violaciones** pero las logea
- ✅ **Cache LRU funcionando** con TTL dinámico
- ✅ **Compatible con Flowless** automáticamente

### **Comportamiento por defecto:**
1. **Usuario hace login** → Se guarda IP, User-Agent, Device en cache
2. **Usuario cambia de IP** → 🚨 Log violación pero ✅ permite acceso
3. **Usuario cambia navegador** → ✅ Sin validación (ignorado en STANDARD)
4. **Sesión expira en Flowless** → 🗑️ Se remueve automáticamente del cache

## 🎯 Variables Esenciales para Validation Mode

Solo necesitas **7 variables** para personalizar el sistema:

## 🤔 ¿Cuándo necesito configurar algo?

### **✅ NO necesitas configurar nada si:**
- Estás en **desarrollo** o **staging**
- Quieres **validación básica** (solo IP)
- Te parece bien que **permita violaciones** pero las logee
- Usas el sistema **tal como viene**

### **⚙️ SÍ necesitas configurar si quieres:**

#### **Deshabilitar completamente (desarrollo):**
```bash
AUTH_VALIDATION_MODE=DISABLED
```

#### **Validación completa (producción segura):**
```bash
AUTH_VALIDATION_MODE=ADVANCED
AUTH_USER_AGENT_VALIDATION=true
AUTH_DEVICE_VALIDATION=true
```

#### **Máxima seguridad (sistemas críticos):**
```bash
AUTH_VALIDATION_MODE=STRICT
AUTH_AUTO_INVALIDATE=true
```

#### **Sin logs (silencioso):**
```bash
AUTH_LOG_VIOLATIONS=false
```

## 📋 ¿Qué verías en los logs por defecto?

### **Configuración por defecto (sin configurar nada):**

```bash
# Al iniciar el servidor:
# (Sin logs repetidos - sistema simplificado)

# Usuario hace login por primera vez:
💾 Session cached: abc12345... (TTL: 28min)

# Usuario hace request desde IP diferente:
🚨 Security violations for session abc12345...:
  - IP_MISMATCH: expected=192.168.1.100, actual=192.168.1.101 (HIGH)
# ✅ Pero el request se permite (modo STANDARD)

# Usuario hace request desde navegador diferente:
# (Sin logs - User-Agent validation está deshabilitado por defecto)

# Cache hit normal:
⚡ Enhanced auth cache hit: abc12345... (mode: STANDARD)

# Sesión expira en Flowless:
# (Se remueve automáticamente del cache sin logs)
```

### **¿Qué NO verías por defecto?**
- ❌ Logs de User-Agent violations (deshabilitado)
- ❌ Logs de Device violations (deshabilitado)
- ❌ Auto-invalidación de sesiones (deshabilitado)
- ❌ Negación de acceso por violaciones (solo en STRICT)

### **1. AUTH_VALIDATION_MODE**
```bash
AUTH_VALIDATION_MODE=STANDARD
```
**Opciones:** `DISABLED` | `STANDARD` | `ADVANCED` | `STRICT`

- **DISABLED**: Sin validaciones (desarrollo)
- **STANDARD**: Solo validación de IP
- **ADVANCED**: IP + User-Agent + Device
- **STRICT**: Todas las validaciones + auto-invalidación

### **2. AUTH_ENABLE_VALIDATION_MODE**
```bash
AUTH_ENABLE_VALIDATION_MODE=true
```
**Opciones:** `true` | `false`

Habilita/deshabilita todo el sistema de validation mode.

### **3. AUTH_IP_VALIDATION**
```bash
AUTH_IP_VALIDATION=true
```
**Opciones:** `true` | `false`

Valida que la IP del request coincida con la IP almacenada en cache.

### **4. AUTH_USER_AGENT_VALIDATION**
```bash
AUTH_USER_AGENT_VALIDATION=true
```
**Opciones:** `true` | `false`

Valida que el User-Agent del request coincida con el almacenado en cache.

### **5. AUTH_DEVICE_VALIDATION**
```bash
AUTH_DEVICE_VALIDATION=false
```
**Opciones:** `true` | `false`

Valida que el device fingerprint del request coincida con el almacenado en cache.

### **6. AUTH_AUTO_INVALIDATE**
```bash
AUTH_AUTO_INVALIDATE=false
```
**Opciones:** `true` | `false`

Auto-invalida sesiones cuando hay violaciones de seguridad HIGH.

### **7. AUTH_LOG_VIOLATIONS**
```bash
AUTH_LOG_VIOLATIONS=true
```
**Opciones:** `true` | `false`

Habilita logging de violaciones de seguridad.

## 📋 Configuraciones por Entorno

### **Desarrollo (Sin validaciones)**
```bash
AUTH_VALIDATION_MODE=DISABLED
AUTH_ENABLE_VALIDATION_MODE=false
# Las demás variables se ignoran
```

### **Staging (Validación básica)**
```bash
AUTH_VALIDATION_MODE=STANDARD
AUTH_ENABLE_VALIDATION_MODE=true
AUTH_IP_VALIDATION=true
AUTH_USER_AGENT_VALIDATION=false
AUTH_DEVICE_VALIDATION=false
AUTH_AUTO_INVALIDATE=false
AUTH_LOG_VIOLATIONS=true
```

### **Producción (Validación completa)**
```bash
AUTH_VALIDATION_MODE=ADVANCED
AUTH_ENABLE_VALIDATION_MODE=true
AUTH_IP_VALIDATION=true
AUTH_USER_AGENT_VALIDATION=true
AUTH_DEVICE_VALIDATION=true
AUTH_AUTO_INVALIDATE=false
AUTH_LOG_VIOLATIONS=true
```

### **Sistemas Críticos (Máxima seguridad)**
```bash
AUTH_VALIDATION_MODE=STRICT
AUTH_ENABLE_VALIDATION_MODE=true
AUTH_IP_VALIDATION=true
AUTH_USER_AGENT_VALIDATION=true
AUTH_DEVICE_VALIDATION=true
AUTH_AUTO_INVALIDATE=true
AUTH_LOG_VIOLATIONS=true
```

## 🔄 Comportamiento por Modo

### **DISABLED**
- ✅ Cache habilitado
- ❌ Sin validaciones de seguridad
- ❌ Sin logging de violaciones

### **STANDARD**
- ✅ Cache habilitado con TTL dinámico
- ✅ Validación de IP (si `AUTH_IP_VALIDATION=true`)
- ❌ Sin validación de User-Agent/Device
- ✅ Logging de violaciones (si `AUTH_LOG_VIOLATIONS=true`)

### **ADVANCED**
- ✅ Cache habilitado con TTL dinámico
- ✅ Validación de IP (si `AUTH_IP_VALIDATION=true`)
- ✅ Validación de User-Agent (si `AUTH_USER_AGENT_VALIDATION=true`)
- ✅ Validación de Device (si `AUTH_DEVICE_VALIDATION=true`)
- ✅ Logging de violaciones (si `AUTH_LOG_VIOLATIONS=true`)

### **STRICT**
- ✅ Cache habilitado con TTL dinámico
- ✅ Todas las validaciones habilitadas
- ✅ Auto-invalidación en violaciones HIGH
- ✅ Cualquier violación = negación de acceso
- ✅ Logging de violaciones forzado

## 📱 ¿Cómo se Detecta y Almacena el Device?

### **1. Extracción del Device (automática)**
```javascript
// El sistema extrae automáticamente del request:
const userDevice = request.headers['sec-ch-ua'] || 'unknown';

// Ejemplos de valores reales:
// Chrome: "Google Chrome";v="119", "Chromium";v="119", "Not?A_Brand";v="24"
// Firefox: "Firefox";v="119"
// Safari: "Safari";v="17.1"
// Mobile: "Chrome Mobile";v="119"
```

### **2. Almacenamiento en Cache**
```javascript
// Primera vez que el usuario hace login:
enhancedSessionCache.set(sessionId, {
  user: { id: 'user123', email: 'user@example.com' },
  ipAddress: '192.168.1.100',           // ← IP del login
  userAgent: 'Mozilla/5.0 Chrome/119',  // ← Navegador del login
  userDevice: 'Google Chrome v119',     // ← Device del login
  // ...
});
```

### **3. Validación en Requests Posteriores**
```javascript
// En cada request posterior, se compara:
const storedDevice = 'Google Chrome v119';     // ← Del cache
const currentDevice = 'Firefox v119';         // ← Del request actual

// Si AUTH_DEVICE_VALIDATION=true y son diferentes:
// → Genera DEVICE_MISMATCH violation
```

## 🎯 Ejemplos Prácticos Detallados

### **Escenario 1: Usuario Normal (STANDARD)**
```bash
# Configuración
AUTH_VALIDATION_MODE=STANDARD
AUTH_IP_VALIDATION=true
AUTH_USER_AGENT_VALIDATION=false
AUTH_DEVICE_VALIDATION=false
```

**Flujo:**
1. **Login inicial**: IP `192.168.1.100`, Chrome, Windows
2. **Cache almacena**: IP, User-Agent, Device
3. **Request desde casa**: IP `192.168.1.101` (WiFi diferente), mismo Chrome
4. **Resultado**:
   - ✅ **ALLOW** (solo valida IP en STANDARD, pero permite violaciones)
   - 📝 **Log**: "IP_MISMATCH: expected=192.168.1.100, actual=192.168.1.101"

### **Escenario 2: Usuario Móvil (ADVANCED)**
```bash
# Configuración
AUTH_VALIDATION_MODE=ADVANCED
AUTH_IP_VALIDATION=true
AUTH_USER_AGENT_VALIDATION=true
AUTH_DEVICE_VALIDATION=true
```

**Flujo:**
1. **Login inicial**: IP `192.168.1.100`, Chrome Mobile, Android
2. **Cache almacena**:
   - IP: `192.168.1.100`
   - User-Agent: `Mozilla/5.0 Chrome Mobile`
   - Device: `Chrome Mobile v119`
3. **Request desde trabajo**: IP `10.0.0.50`, mismo Chrome Mobile
4. **Resultado**:
   - ✅ **ALLOW** (ADVANCED permite violaciones)
   - 📝 **Log**: "IP_MISMATCH: expected=192.168.1.100, actual=10.0.0.50"

### **Escenario 3: Cambio de Navegador (ADVANCED)**
```bash
# Configuración
AUTH_VALIDATION_MODE=ADVANCED
AUTH_DEVICE_VALIDATION=true
```

**Flujo:**
1. **Login inicial**: Chrome Desktop
2. **Cache almacena**: Device: `Google Chrome v119`
3. **Request desde Firefox**: Device: `Firefox v119`
4. **Resultado**:
   - ✅ **ALLOW** (ADVANCED permite violaciones)
   - 📝 **Log**: "DEVICE_MISMATCH: expected=Google Chrome v119, actual=Firefox v119"

### **Escenario 4: Sistema Crítico (STRICT)**
```bash
# Configuración
AUTH_VALIDATION_MODE=STRICT
AUTH_DEVICE_VALIDATION=true
```

**Flujo:**
1. **Login inicial**: Chrome Desktop
2. **Cache almacena**: Device: `Google Chrome v119`
3. **Request desde Firefox**: Device: `Firefox v119`
4. **Resultado**:
   - ❌ **DENY** (STRICT niega cualquier violación)
   - 📝 **Log**: "DEVICE_MISMATCH: expected=Google Chrome v119, actual=Firefox v119"
   - 🚫 **Usuario debe hacer login nuevamente**

### **Escenario 5: Auto-Invalidación (cualquier modo)**
```bash
# Configuración
AUTH_AUTO_INVALIDATE=true
AUTH_IP_VALIDATION=true
```

**Flujo:**
1. **Login inicial**: IP `192.168.1.100`
2. **Request sospechoso**: IP `203.0.113.1` (IP completamente diferente)
3. **Resultado**:
   - 🗑️ **INVALIDATE** (remueve sesión del cache)
   - 📝 **Log**: "IP_MISMATCH: expected=192.168.1.100, actual=203.0.113.1 (HIGH)"
   - 🚫 **Usuario debe hacer login nuevamente**

## 🤔 Diferencias Clave Entre Modos

### **¿Cuándo usar cada modo?**

| Modo | Cuándo Usar | Validaciones | Comportamiento |
|------|-------------|--------------|----------------|
| **DISABLED** | Desarrollo local | Ninguna | Cache sin validaciones |
| **STANDARD** | Producción básica | Solo IP | Permite violaciones, solo logea |
| **ADVANCED** | Producción segura | IP + User-Agent + Device | Permite violaciones, logea todo |
| **STRICT** | Sistemas críticos | Todas forzadas | Niega acceso con cualquier violación |

### **¿Por qué STANDARD ignora User-Agent/Device?**

```bash
# En modo STANDARD, estas configuraciones se IGNORAN:
AUTH_USER_AGENT_VALIDATION=true   # ← Se ignora
AUTH_DEVICE_VALIDATION=true       # ← Se ignora

# Solo se usa:
AUTH_IP_VALIDATION=true           # ← Solo esta se aplica
```

**Razón**: STANDARD está diseñado para validación básica (solo IP) independientemente de la configuración.

### **¿Cuándo se aplican todas las configuraciones?**

Solo en **ADVANCED** y **STRICT**:

```bash
# En ADVANCED/STRICT, todas se respetan:
AUTH_IP_VALIDATION=true           # ← Se aplica
AUTH_USER_AGENT_VALIDATION=true   # ← Se aplica
AUTH_DEVICE_VALIDATION=true       # ← Se aplica
```

## ⚠️ Notas Importantes

1. **Device Detection**: Se usa el header `sec-ch-ua` del navegador automáticamente
2. **Sin soporte JSON**: Bridge-Payments usa solo variables individuales, no formato JSON
3. **Sin hash de integridad**: Flowless ya valida las sesiones, no necesitamos duplicar
4. **TTL dinámico**: El cache usa la expiración real de las sesiones de Flowless
5. **Fallback automático**: Si falla el cache, usa bridge-validator automáticamente
6. **Compatible con Flowless**: El sistema respeta las sesiones y expiraciones de Flowless
7. **Violaciones MEDIUM vs HIGH**: Solo violaciones HIGH pueden auto-invalidar sesiones

## 🚨 Severidad de Violaciones

| Tipo de Violación | Severidad | ¿Auto-Invalidate? | Descripción |
|-------------------|-----------|-------------------|-------------|
| **IP_MISMATCH** | HIGH | ✅ Sí | Cambio de dirección IP |
| **USER_AGENT_MISMATCH** | MEDIUM | ❌ No | Cambio de navegador |
| **DEVICE_MISMATCH** | MEDIUM | ❌ No | Cambio de dispositivo |

### **¿Qué significa cada severidad?**

- **HIGH**: Violación crítica que puede indicar sesión comprometida
- **MEDIUM**: Violación normal que puede ser cambio legítimo de usuario

### **¿Cuándo se auto-invalida una sesión?**

```bash
# Solo si AUTH_AUTO_INVALIDATE=true Y hay violación HIGH
AUTH_AUTO_INVALIDATE=true

# Ejemplos:
# ✅ IP cambió de 192.168.1.100 → 203.0.113.1 = AUTO-INVALIDATE
# ❌ User-Agent cambió Chrome → Firefox = NO auto-invalidate
# ❌ Device cambió Desktop → Mobile = NO auto-invalidate
```

## 📋 Logs del Sistema en Acción

### **Ejemplo de logs reales:**

```bash
# Usuario hace login inicial
💾 Session cached: abc12345... (TTL: 28min)

# Usuario hace request desde IP diferente (STANDARD mode)
🚨 Security violations for session abc12345...:
  - IP_MISMATCH: expected=192.168.1.100, actual=192.168.1.101 (HIGH)

# Usuario hace request desde navegador diferente (ADVANCED mode)
🚨 Security violations for session def67890...:
  - DEVICE_MISMATCH: expected=Google Chrome v119, actual=Firefox v119 (MEDIUM)

# Sesión auto-invalidada por IP sospechosa
🚨 Security violations for session ghi11111...:
  - IP_MISMATCH: expected=192.168.1.100, actual=203.0.113.1 (HIGH)
🗑️ Session invalidated from cache: ghi11111...

# Cache hit normal
⚡ Enhanced auth cache hit: jkl22222... (mode: STANDARD)
```

## 🧪 Verificación

Para verificar que funciona:

```bash
cd bridge-payments
bun run scripts/test-validation-mode.ts
```

Deberías ver:
```
✅ Auth Config loaded successfully
   - Validation Mode: STANDARD
   - Enabled: true
   - IP Validation: true
   - User-Agent Validation: false
   - Device Validation: false
   - Auto Invalidate: false
   - Log Violations: true

✅ Security validation working
   - Violations detected: 1
   - IP_MISMATCH: HIGH
```

## 🎉 Listo para Producción

Con estas 7 variables tienes:
- ✅ Sistema de validation mode compatible con Flowless
- ✅ Cache LRU optimizado con TTL dinámico
- ✅ Validaciones de seguridad configurables
- ✅ Sin complejidad innecesaria
- ✅ Fallback automático al sistema anterior
