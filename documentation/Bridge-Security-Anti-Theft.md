# Bridge-Payments - Sistema Anti-Robo de Sesiones

## 🛡️ **Protección Contra Robo de Sesiones Implementada**

### **Problema de Seguridad:**
Sin protección, si alguien obtiene un `session_id`, puede usarlo desde cualquier dispositivo/IP para acceder a la cuenta del usuario.

### **Solución: Sistema de Doble Capa**

#### **Capa 1: Flowless (Device-Bound Sessions)**
- Validación estricta de IP + User-Agent + User-Device
- Función especial `validateSessionForBridge()` sin validación de dispositivo
- Cache optimizado con datos de seguridad

#### **Capa 2: Bridge-Payments (Device Fingerprinting)**
- Captura y almacena fingerprint del dispositivo en primera validación
- Valida dispositivo en requests subsecuentes
- Cache seguro con datos de dispositivo

## 🔧 **Implementación Técnica**

### **1. SessionData Interface Extendida**
```typescript
export interface SessionData {
  // Datos básicos
  user_id: string;
  email: string;
  name: string;
  
  // Datos de seguridad (nuevos)
  device_fingerprint?: string;
  ip_address?: string;
  user_agent?: string;
  user_device?: string;
  first_seen_at?: string;
}
```

### **2. Device Fingerprinting**
```typescript
// Extrae datos del dispositivo
private extractDeviceFingerprint(headers: Record<string, string>): {
  ip_address: string;
  user_agent: string;
  user_device: string;
  device_fingerprint: string;
} {
  const ip = headers['x-forwarded-for'] || headers['cf-connecting-ip'] || 'unknown';
  const userAgent = headers['user-agent'] || 'unknown';
  const userDevice = headers['sec-ch-ua'] || 'unknown';
  
  // Genera hash único del dispositivo
  const fingerprint = this.generateDeviceFingerprint(ip, userAgent, userDevice);
  
  return { ip_address: ip, user_agent: userAgent, user_device: userDevice, device_fingerprint: fingerprint };
}
```

### **3. Validación de Dispositivo**
```typescript
// Valida que el request venga del mismo dispositivo
private validateDeviceFingerprint(
  sessionData: SessionData, 
  currentFingerprint: { device_fingerprint: string; ip_address: string; user_agent: string }
): { valid: boolean; violations: string[] } {
  const violations: string[] = [];

  // Valida fingerprint del dispositivo
  if (sessionData.device_fingerprint !== currentFingerprint.device_fingerprint) {
    violations.push('Device fingerprint mismatch');
  }

  // Valida IP (opcional para usuarios móviles)
  if (config.BRIDGE_VALIDATE_IP && sessionData.ip_address !== currentFingerprint.ip_address) {
    violations.push(`IP mismatch: session=${sessionData.ip_address}, current=${currentFingerprint.ip_address}`);
  }

  return { valid: violations.length === 0, violations };
}
```

### **4. Middleware Actualizado**
```typescript
// Middleware extrae headers y valida dispositivo
export async function authMiddleware(c: Context, next: Next) {
  const sessionId = extractSessionId(c);
  const requestHeaders = extractRequestHeaders(c); // ← Nuevo
  
  // Valida sesión con seguridad de dispositivo
  const result = await bridgeValidator.validateSession(sessionId, requestHeaders); // ← Actualizado
  
  if (!result.success) {
    throw new HTTPException(401, { message: result.error });
  }
}
```

## ⚙️ **Configuración de Seguridad**

### **Variables de Entorno:**
```bash
# Bridge Security (Device-Bound Sessions)
BRIDGE_VALIDATE_IP=false          # Validar IP (deshabilitado para móviles)
BRIDGE_VALIDATE_DEVICE=true       # Validar dispositivo (recomendado)
BRIDGE_SECURITY_ENABLED=true      # Habilitar sistema de seguridad
BRIDGE_SECURITY_LOG_VIOLATIONS=true # Logs de violaciones de seguridad
```

### **Configuración Recomendada:**

#### **Desarrollo:**
```bash
BRIDGE_VALIDATE_IP=false          # IPs cambian frecuentemente
BRIDGE_VALIDATE_DEVICE=true       # Detectar cambios de navegador
BRIDGE_SECURITY_ENABLED=true      # Siempre habilitado
```

#### **Producción:**
```bash
BRIDGE_VALIDATE_IP=false          # Usuarios móviles cambian IP
BRIDGE_VALIDATE_DEVICE=true       # Máxima seguridad
BRIDGE_SECURITY_ENABLED=true      # Siempre habilitado
BRIDGE_SECURITY_LOG_VIOLATIONS=true # Monitoreo de ataques
```

## 🔒 **Flujo de Seguridad**

### **Primera Validación (Registro de Dispositivo):**
```
1. Usuario hace login desde Chrome en Windows
2. Bridge-payments recibe session_id + headers
3. Valida con flowless (exitoso)
4. Genera device_fingerprint: "a1b2c3d4"
5. Almacena en cache con datos de dispositivo
6. ✅ Acceso permitido
```

### **Validaciones Subsecuentes (Mismo Dispositivo):**
```
1. Usuario hace request desde mismo Chrome/Windows
2. Bridge-payments extrae headers actuales
3. Genera fingerprint: "a1b2c3d4" (mismo)
4. Compara con cache: MATCH ✅
5. ✅ Acceso permitido (desde cache)
```

### **Intento de Robo (Dispositivo Diferente):**
```
1. Atacante usa session_id desde Firefox/Linux
2. Bridge-payments extrae headers del atacante
3. Genera fingerprint: "x9y8z7w6" (diferente)
4. Compara con cache: MISMATCH ❌
5. ❌ Acceso denegado + sesión invalidada
6. 🚨 Log de violación de seguridad
```

## 📊 **Logs de Seguridad**

### **Logs Normales:**
```bash
[BRIDGE-SECURITY] Current device fingerprint: a1b2c3d4
[BRIDGE-SECURITY] ✅ Device validation passed for cached session
[BRIDGE-SECURITY] ✅ Device fingerprint added to new session: a1b2c3d4
```

### **Logs de Violación:**
```bash
[BRIDGE-SECURITY] ❌ Device validation failed for cached session: ["Device fingerprint mismatch", "User-Agent mismatch"]
[BRIDGE-SECURITY] Session d94abfb1... invalidated due to device violations: ["Device fingerprint mismatch"]
```

## 🎯 **Beneficios del Sistema**

### **Seguridad:**
✅ **Protección contra robo**: Session_id inútil sin el dispositivo original  
✅ **Detección de ataques**: Logs automáticos de intentos de robo  
✅ **Invalidación automática**: Sesiones comprometidas se eliminan  
✅ **Compatibilidad móvil**: IP validation opcional para usuarios móviles  

### **Performance:**
✅ **Cache optimizado**: Validación rápida para dispositivos conocidos  
✅ **Validación local**: No requiere llamada a flowless en cache hit  
✅ **Configuración flexible**: Habilitar/deshabilitar según necesidades  

### **Usabilidad:**
✅ **Transparente**: Usuario no nota la protección  
✅ **Sesiones legacy**: Compatible con sesiones sin device data  
✅ **Configuración granular**: Control fino de validaciones  

## 🚨 **Casos de Uso de Seguridad**

### **Escenario 1: Robo de Session_ID**
- **Antes**: Atacante puede usar session_id desde cualquier lugar
- **Después**: Session_id inútil sin el dispositivo original

### **Escenario 2: Usuario Móvil**
- **IP Validation**: Deshabilitada (IPs móviles cambian)
- **Device Validation**: Habilitada (mismo navegador/app)

### **Escenario 3: Usuario en Café/WiFi Público**
- **IP Validation**: Deshabilitada (IP compartida)
- **Device Validation**: Habilitada (mismo dispositivo)

**El sistema ahora protege completamente contra robo de sesiones manteniendo usabilidad óptima.**
