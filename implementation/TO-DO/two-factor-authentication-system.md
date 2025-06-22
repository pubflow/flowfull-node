# 🔐 Sistema de Autenticación de Dos Factores (2FA) Universal

## 📋 **RESUMEN EJECUTIVO**

Sistema de autenticación de dos factores escalable y universal para Flowless que soporta múltiples métodos de verificación (email, SMS, OTP, passkeys) con configuración basada en variables de entorno y API RESTful completa.

## 🏗️ **ARQUITECTURA DEL SISTEMA**

### **Tabla Principal: `two_factor` (LIMPIA - CON BACKUP CODES)**

```sql
CREATE TABLE IF NOT EXISTS two_factor (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL,
    identifier_type TEXT NOT NULL, -- 'email', 'phone', 'otp', 'passkey'
    token TEXT NOT NULL, -- Encrypted secret/passkey data (NOT short codes)
    is_active INTEGER NOT NULL DEFAULT 1, -- Boolean: 0=false, 1=true

    -- BACKUP CODES SYSTEM
    backup_codes TEXT, -- JSON array de códigos hasheados: ["hash1", "hash2", ...]
    backup_codes_used INTEGER NOT NULL DEFAULT 0, -- Contador de códigos usados
    backup_codes_generated_at TEXT, -- Cuándo se generaron los códigos

    -- Configuración específica del método
    metadata TEXT, -- JSON: {phone: "+1234567890", etc}

    -- Opcional: Reference codes para casos específicos
    reference_code TEXT, -- Opcional: 'usa_phone_number', 'backup_email', etc.

    -- Estadísticas de uso
    usage_count INTEGER NOT NULL DEFAULT 0,
    last_used_at TEXT NULL,

    -- Timestamps
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at TEXT NOT NULL DEFAULT (datetime('now')),

    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
    UNIQUE (user_id, identifier_type) -- Un método por tipo por usuario
);
```

### **🔗 INTEGRACIÓN CON SHORT TOKENS**

**El sistema 2FA reutiliza completamente la tabla `tokens` existente para códigos temporales:**

```sql
-- REUTILIZA la tabla tokens existente para códigos 2FA + BACKUP CODES
-- AGREGAR COLUMNA updated_at FALTANTE
CREATE TABLE IF NOT EXISTS tokens (
    id TEXT PRIMARY KEY,
    token TEXT UNIQUE NOT NULL,           -- Hash del código corto (ej: hash de "123456") O backup code
    type TEXT NOT NULL,                   -- 'email', 'phone', 'backup_code'
    identifier_value TEXT NOT NULL,      -- Email/teléfono/user_id que recibe el código
    token_type TEXT NOT NULL,            -- 'short_two_factor_email', 'short_two_factor_sms', 'backup_code_verification'
    user_id TEXT NOT NULL,               -- Usuario que solicita 2FA
    attempts_remaining INTEGER NOT NULL DEFAULT 3,
    status TEXT DEFAULT 'active',
    expires_at TEXT NOT NULL,           -- 10 minutos para códigos 2FA, 1 año para backup codes
    created_at TEXT DEFAULT (datetime('now')),
    updated_at TEXT DEFAULT (datetime('now')), -- ⭐ COLUMNA FALTANTE AGREGADA
    consumed_at TEXT NULL,
    context TEXT NULL,                   -- 'login', 'setup', 'sensitive_action', 'backup_recovery'
    metadata TEXT NULL,                  -- JSON con info adicional
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

-- Trigger para updated_at en tokens
CREATE TRIGGER IF NOT EXISTS update_tokens_timestamp
AFTER UPDATE ON tokens
BEGIN
    UPDATE tokens SET updated_at = datetime('now') WHERE id = NEW.id;
END;
```

### **🔗 INTEGRACIÓN CON SESIONES**

**El sistema 2FA usa el sistema de sesiones existente:**

```sql
-- REUTILIZA la tabla sessions existente
-- Agrega metadata para tracking de verificación 2FA
CREATE TABLE sessions (
    id TEXT PRIMARY KEY NOT NULL UNIQUE,
    user_id TEXT NOT NULL,
    expires_at TEXT NOT NULL,
    ip_address TEXT NOT NULL,
    user_agent TEXT,
    user_device TEXT,
    status TEXT DEFAULT 'active',
    last_used_at TEXT NOT NULL,
    metadata TEXT, -- JSON: {"two_factor_verified": true, "verified_methods": ["email"], "verified_at": "2024-01-15T10:30:00Z"}
    FOREIGN KEY (user_id) REFERENCES users(id)
);
```

### **Configuración por Variables de Entorno**

```bash
# Métodos disponibles (separados por coma)
TWO_FACTOR_AVAILABLE="email,sms,otp,passkey"

# Configuración específica por método
TWO_FACTOR_CONFIG='{
  "email": {
    "enabled": true,
    "provider": "zepto",
    "template": "two_factor_email"
  },
  "sms": {
    "enabled": true,
    "provider": "msg91",
    "template_id": "your_template_id"
  },
  "otp": {
    "enabled": true,
    "provider": "internal",
    "issuer": "Flowless",
    "digits": 6,
    "period": 30
  },
  "passkey": {
    "enabled": true,
    "provider": "webauthn",
    "rp_name": "Flowless",
    "rp_id": "localhost"
  }
}'
```

## 🛠️ **API ENDPOINTS PROPUESTOS**

### **1. Obtener Métodos Disponibles**
```http
GET /auth/two-factor/methods
Authorization: Bearer {session_id}
```

**Respuesta:**
```json
{
  "success": true,
  "available_methods": ["email", "sms", "otp"],
  "user_methods": [
    {
      "id": "2fa_123",
      "identifier_type": "email",
      "is_active": true,
      "last_used_at": "2024-01-15T10:30:00Z"
    }
  ]
}
```

### **2. Configurar Método 2FA**
```http
POST /auth/two-factor/{method}/setup
Authorization: Bearer {session_id}
Content-Type: application/json

{
  "identifier": "user@example.com", // Para email/sms
  "reference_code": "usa_phone_number", // Opcional: para casos específicos
  "backup_codes": true // Opcional: generar códigos de respaldo
}
```

### **3. Iniciar Verificación (Usa Short Tokens)**
```http
POST /auth/two-factor/{method}/start
Authorization: Bearer {session_id}
Content-Type: application/json

{
  "action": "login", // 'login', 'setup', 'disable', 'sensitive_action'
  "context": "change_password" // Opcional: contexto específico
}

# Internamente usa ShortTokenManager.generateShortToken() con:
# - tokenType: 'short_two_factor_email' o 'short_two_factor_sms'
# - context: action + context
# - Envía código de 6 dígitos via email/SMS
```

### **4. Verificar Código (Usa Short Tokens + Control de Intentos)**
```http
POST /auth/two-factor/verify
Authorization: Bearer {session_id}
Content-Type: application/json

{
  "method": "email",
  "code": "123456", // Código de 6 dígitos recibido
  "action": "login",
  "remember_device": false // Opcional: recordar dispositivo
}

Response (éxito):
{
  "success": true,
  "verified": true,
  "message": "Verificación exitosa"
}

Response (fallo):
{
  "success": false,
  "verified": false,
  "attempts_remaining": 2,
  "message": "Código incorrecto. 2 intentos restantes."
}

Response (bloqueado):
{
  "success": false,
  "verified": false,
  "locked": true,
  "lockout_until": "2024-01-15T10:45:00Z",
  "message": "Método bloqueado por 10 minutos debido a intentos fallidos."
}

# Internamente:
# 1. Verifica si método está bloqueado
# 2. Usa ShortTokenManager.validateShortToken()
# 3. Si falla, registra intento y verifica bloqueo
# 4. Si éxito, limpia intentos y actualiza session metadata
```

### **5. Eliminar Método 2FA**
```http
DELETE /auth/two-factor/{id}
Authorization: Bearer {session_id}
Content-Type: application/json

{
  "verification_code": "123456", // Requerido para confirmar
  "method": "email"
}
```

### **6. Generar Backup Codes**
```http
POST /auth/two-factor/backup-codes/generate
Authorization: Bearer {session_id}
Content-Type: application/json

{
  "verification_code": "123456", // Código 2FA requerido para seguridad
  "method": "email" // Método usado para verificación
}

Response:
{
  "success": true,
  "backup_codes": [
    "a1b2c3d4", "e5f6g7h8", "i9j0k1l2", "m3n4o5p6", "q7r8s9t0",
    "u1v2w3x4", "y5z6a7b8", "c9d0e1f2", "g3h4i5j6", "k7l8m9n0"
  ],
  "codes_count": 10,
  "generated_at": "2024-01-15T10:30:00Z",
  "warning": "Guarda estos códigos en un lugar seguro. No se mostrarán nuevamente."
}
```

### **7. Verificar con Backup Code**
```http
POST /auth/two-factor/backup-code/verify
Authorization: Bearer {session_id}
Content-Type: application/json

{
  "backup_code": "a1b2c3d4",
  "action": "login"
}

Response:
{
  "success": true,
  "verified": true,
  "remaining_codes": 9,
  "message": "Backup code verificado correctamente"
}
```

### **8. Ver Estado de Backup Codes**
```http
GET /auth/two-factor/backup-codes/status
Authorization: Bearer {session_id}

Response:
{
  "success": true,
  "has_backup_codes": true,
  "total_codes": 10,
  "used_codes": 1,
  "remaining_codes": 9,
  "generated_at": "2024-01-15T10:30:00Z",
  "last_used_at": "2024-01-15T15:45:00Z"
}
```

## 🔧 **ESTRUCTURA DE ARCHIVOS PROPUESTA**

```
flowless/src/lib/auth/two-factor/
├── manager.ts              # Gestor principal de 2FA (integra con ShortTokenManager)
├── providers/
│   ├── email-provider.ts   # Proveedor de email (usa ShortTokenManager + Zepto)
│   ├── sms-provider.ts     # Proveedor de SMS (usa ShortTokenManager + MSG91)
│   ├── otp-provider.ts     # Proveedor de OTP (TOTP directo, sin short tokens)
│   └── passkey-provider.ts # Proveedor de Passkeys (WebAuthn directo)
├── session-integration.ts  # Integración con SessionManager existente
└── middleware.ts           # Middleware de verificación 2FA

flowless/src/routes/
└── two-factor.ts           # Rutas del API 2FA (usa auth middleware existente)

flowless/db/
└── schema.ts               # Solo agrega tabla two_factor (reutiliza tokens y sessions)
```

## 🔗 **INTEGRACIÓN PERFECTA CON SISTEMAS EXISTENTES**

### **Reutilización de Short Tokens**
- **Email/SMS 2FA**: Usa `ShortTokenManager` para códigos de 6 dígitos
- **Token Types**: `short_two_factor_email`, `short_two_factor_sms`
- **Misma seguridad**: 3 intentos, 10 minutos de expiración
- **Misma infraestructura**: Email via Zepto, SMS via MSG91

### **Reutilización de Sesiones**
- **Session Metadata**: Agrega info de verificación 2FA
- **SessionManager.createSession()**: Sin cambios
- **Middleware existente**: Compatible con `authMiddleware()`
- **Cookies**: Mismo sistema de cookies de sesión

## 📊 **ESQUEMA DE BASE DE DATOS COMPLETO**

### **Tabla Principal (SIMPLIFICADA)**
```sql
-- Two Factor Authentication Methods (solo configuración permanente)
CREATE TABLE IF NOT EXISTS two_factor (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL,
    identifier_type TEXT NOT NULL, -- 'email', 'phone', 'otp', 'passkey'
    token TEXT NOT NULL, -- Secret encriptado (TOTP secret, passkey data, etc.)
    is_active INTEGER NOT NULL DEFAULT 1,

    -- Configuración específica del método
    metadata TEXT, -- JSON: {phone: "+1234567890", backup_codes: [...], etc}

    -- Opcional: Reference codes para casos específicos
    reference_code TEXT, -- Opcional: 'usa_phone_number', 'backup_email', etc.

    -- Estadísticas de uso
    usage_count INTEGER NOT NULL DEFAULT 0,
    last_used_at TEXT NULL,

    -- Timestamps
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at TEXT NOT NULL DEFAULT (datetime('now')),

    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
    UNIQUE (user_id, identifier_type),
    CHECK (identifier_type IN ('email', 'phone', 'otp', 'passkey'))
);
```

### **❌ NO NECESITA TABLA SEPARADA DE SESIONES**
**Reutiliza completamente las tablas existentes:**

1. **`tokens`** - Para códigos temporales de email/SMS (via ShortTokenManager)
2. **`sessions`** - Para tracking de verificación 2FA (via SessionManager)

```sql
-- REUTILIZA tokens existente para códigos temporales
-- token_type: 'short_two_factor_email', 'short_two_factor_sms'
-- context: 'login', 'setup', 'sensitive_action'

-- REUTILIZA sessions existente para tracking
-- metadata: {"two_factor_verified": true, "verified_methods": ["email"]}
```

### **🔒 CONTROL DE INTENTOS HÍBRIDO Y OPCIONAL**

```sql
-- ✅ SOLUCIÓN HÍBRIDA:
-- 1. Email/SMS: Usa ShortTokenManager (tabla tokens) con rate limiting opcional
-- 2. OTP/Passkeys: Usa RateLimiter (tabla rate_limits) con configuración opcional
-- 3. Tabla two_factor: LIMPIA, solo configuración permanente

-- Trigger para updated_at en two_factor
CREATE TRIGGER IF NOT EXISTS update_two_factor_timestamp
AFTER UPDATE ON two_factor
BEGIN
    UPDATE two_factor SET updated_at = datetime('now') WHERE id = NEW.id;
END;
```

### **Índices Optimizados (TABLA LIMPIA + BACKUP CODES)**
```sql
-- Two Factor indexes principales
CREATE INDEX idx_two_factor_user_id ON two_factor(user_id);
CREATE INDEX idx_two_factor_user_type ON two_factor(user_id, identifier_type);
CREATE INDEX idx_two_factor_active ON two_factor(is_active);
CREATE INDEX idx_two_factor_reference_code ON two_factor(reference_code);

-- Backup codes indexes
CREATE INDEX idx_two_factor_backup_codes ON two_factor(user_id) WHERE backup_codes IS NOT NULL;
CREATE INDEX idx_two_factor_backup_generated ON two_factor(backup_codes_generated_at);

-- Tokens indexes (para Short Tokens con rate limiting opcional)
CREATE INDEX idx_tokens_updated_at ON tokens(updated_at);
CREATE INDEX idx_tokens_user_type ON tokens(user_id, token_type);

-- Rate limits indexes (para OTP/Passkeys con rate limiting opcional)
-- Ya existen en tabla rate_limits
```

## 🔄 **FLUJO DE TRABAJO**

### **1. Configuración Inicial**
1. Usuario habilita 2FA desde dashboard
2. Selecciona método (email/SMS/OTP/passkey)
3. Sistema valida y configura el método
4. Se generan códigos de respaldo (opcional)

### **2. Proceso de Login con 2FA**
1. Usuario ingresa credenciales normales
2. Sistema detecta 2FA habilitado
3. Envía código/solicita verificación
4. Usuario proporciona código/verificación
5. Sistema valida y permite acceso

### **3. Acciones Sensibles**
1. Usuario intenta acción sensible (cambio password, etc.)
2. Sistema solicita verificación 2FA adicional
3. Usuario proporciona verificación
4. Sistema permite la acción

## 🛡️ **CARACTERÍSTICAS DE SEGURIDAD**

### **Encriptación y Hashing**
- Tokens/secretos encriptados con `BRIDGE_ENCRYPTION_KEY`
- Códigos de verificación hasheados antes de almacenar
- Códigos de respaldo encriptados individualmente

### **Rate Limiting**
- Máximo 3 intentos por sesión de verificación
- Cooldown de 5 minutos entre intentos fallidos
- Bloqueo temporal después de múltiples fallos

### **Expiración de Códigos**
- Email/SMS: 10 minutos
- OTP: 30 segundos (estándar TOTP)
- Passkeys: Inmediato (sin expiración)

### **Dispositivos Confiables**
- Opción de "recordar dispositivo" por 30 días
- Identificación por IP + User-Agent + Device fingerprint
- Revocación manual de dispositivos confiables

## 🚀 **IMPLEMENTACIÓN TÉCNICA**

### **Gestor Principal (TwoFactorManager) - INTEGRADO**

```typescript
import { ShortTokenManager } from '../token-manager';
import { SessionManager } from '../session';

export class TwoFactorManager {
  // Obtener métodos disponibles del sistema
  static async getAvailableMethods(): Promise<string[]>

  // Obtener métodos configurados por usuario
  static async getUserMethods(userId: string): Promise<TwoFactorMethod[]>

  // Configurar nuevo método 2FA
  static async setupMethod(userId: string, type: string, config: any): Promise<TwoFactorMethod>

  // Iniciar verificación (USA ShortTokenManager para email/SMS)
  static async startVerification(userId: string, methodId: string, action: string): Promise<{
    success: boolean;
    method: string;
    message: string;
    expiresIn?: number; // Para códigos temporales
  }>

  // Verificar código/token (USA ShortTokenManager + actualiza Session + CONTROL DE INTENTOS)
  static async verifyCode(sessionId: string, code: string, method: string): Promise<{
    success: boolean;
    verified: boolean;
    attempts_remaining?: number;
    lockout_until?: string;
    message?: string;
  }>

  // Eliminar método 2FA
  static async removeMethod(userId: string, methodId: string, verificationCode: string): Promise<boolean>

  // Verificar si sesión tiene 2FA válido
  static async isSessionVerified(sessionId: string, action: string): Promise<boolean>

  // Marcar sesión como verificada 2FA
  static async markSessionVerified(sessionId: string, method: string): Promise<void>

  // BACKUP CODES MANAGEMENT
  // Generar nuevos backup codes
  static async generateBackupCodes(userId: string, methodId: string): Promise<{
    success: boolean;
    backup_codes?: string[];
    message?: string;
  }>

  // Verificar backup code
  static async verifyBackupCode(userId: string, backupCode: string): Promise<{
    success: boolean;
    verified: boolean;
    remaining_codes?: number;
    message?: string;
  }>

  // Obtener estado de backup codes
  static async getBackupCodesStatus(userId: string): Promise<{
    has_backup_codes: boolean;
    total_codes: number;
    used_codes: number;
    remaining_codes: number;
    generated_at?: string;
    last_used_at?: string;
  }>

  // CONTROL DE INTENTOS HÍBRIDO Y OPCIONAL
  // Verificar si método tiene rate limiting habilitado
  static async isRateLimitingEnabled(identifierType: string): Promise<boolean>

  // Verificar si método está bloqueado (híbrido: ShortTokens o RateLimiter)
  static async isMethodLocked(userId: string, identifierType: string): Promise<{
    locked: boolean;
    lockout_until?: string;
    attempts_remaining?: number;
    rate_limiting_enabled?: boolean;
  }>

  // Verificar código con rate limiting opcional
  static async verifyCodeWithOptionalRateLimit(
    sessionId: string,
    code: string,
    method: string
  ): Promise<{
    success: boolean;
    verified: boolean;
    attempts_remaining?: number;
    lockout_until?: string;
    rate_limiting_enabled?: boolean;
    message?: string;
  }>
}
```

### **Proveedores Específicos**

#### **Email Provider (Integrado con ShortTokenManager)**
```typescript
export class EmailTwoFactorProvider {
  // USA ShortTokenManager.generateShortToken() internamente
  static async sendVerificationCode(email: string, userId: string, action: string): Promise<{
    success: boolean;
    message: string;
    expiresIn?: number;
  }> {
    return await ShortTokenManager.generateShortToken({
      identifier: email,
      type: 'email',
      tokenType: 'short_two_factor_email',
      userId,
      context: action
    });
  }

  // USA ShortTokenManager.validateShortToken() internamente
  static async validateCode(email: string, code: string): Promise<{
    success: boolean;
    valid: boolean;
    userId?: string;
  }> {
    return await ShortTokenManager.validateShortToken(code, email, 'short_two_factor_email');
  }
}
```

#### **SMS Provider (Integrado con ShortTokenManager)**
```typescript
export class SMSTwoFactorProvider {
  // USA ShortTokenManager.generateShortToken() internamente
  static async sendVerificationCode(phone: string, userId: string, action: string): Promise<{
    success: boolean;
    message: string;
    expiresIn?: number;
  }> {
    return await ShortTokenManager.generateShortToken({
      identifier: phone,
      type: 'phone',
      tokenType: 'short_two_factor_sms',
      userId,
      context: action
    });
  }

  // USA ShortTokenManager.validateShortToken() internamente
  static async validateCode(phone: string, code: string): Promise<{
    success: boolean;
    valid: boolean;
    userId?: string;
  }> {
    return await ShortTokenManager.validateShortToken(code, phone, 'short_two_factor_sms');
  }
}
```

#### **OTP Provider (TOTP)**
```typescript
export class OTPTwoFactorProvider {
  async generateSecret(): Promise<string>
  async generateQRCode(secret: string, userEmail: string): Promise<string>
  async validateToken(secret: string, token: string): Promise<boolean>
}
```

#### **Passkey Provider (WebAuthn)**
```typescript
export class PasskeyTwoFactorProvider {
  async generateRegistrationOptions(userId: string): Promise<any>
  async verifyRegistration(userId: string, credential: any): Promise<boolean>
  async generateAuthenticationOptions(userId: string): Promise<any>
  async verifyAuthentication(userId: string, credential: any): Promise<boolean>
}
```

#### **Backup Codes Provider**
```typescript
export class BackupCodesProvider {
  // Generar códigos de respaldo
  static async generateBackupCodes(count: number = 10): Promise<{
    raw_codes: string[];
    hashed_codes: string[];
  }> {
    const codes = [];
    const hashedCodes = [];

    for (let i = 0; i < count; i++) {
      // Generar código de 8 caracteres alfanuméricos
      const rawCode = this.generateAlphanumericCode(8);
      const hashedCode = await PasswordManager.hash(rawCode);

      codes.push(rawCode);
      hashedCodes.push(hashedCode);
    }

    return {
      raw_codes: codes,
      hashed_codes: hashedCodes
    };
  }

  // Verificar backup code
  static async verifyBackupCode(
    providedCode: string,
    hashedCodes: string[]
  ): Promise<{
    valid: boolean;
    used_index?: number;
  }> {
    for (let i = 0; i < hashedCodes.length; i++) {
      const isValid = await PasswordManager.verify(providedCode, hashedCodes[i]);
      if (isValid) {
        return { valid: true, used_index: i };
      }
    }
    return { valid: false };
  }

  // Generar código alfanumérico
  private static generateAlphanumericCode(length: number): string {
    const chars = 'abcdefghijklmnopqrstuvwxyz0123456789';
    let result = '';
    for (let i = 0; i < length; i++) {
      result += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return result;
  }

  // Marcar código como usado (remover del array)
  static markCodeAsUsed(hashedCodes: string[], usedIndex: number): string[] {
    return hashedCodes.filter((_, index) => index !== usedIndex);
  }
}
```

## 🔧 **MIDDLEWARE DE VERIFICACIÓN**

### **Middleware Principal (Integrado con SessionManager)**
```typescript
import { SessionManager } from '../session';

export function requireTwoFactor(action: string = 'sensitive_action') {
  return async (c: Context, next: Next) => {
    const userId = c.get('user_id');
    const sessionId = c.get('session_id');

    // Verificar si el usuario tiene 2FA habilitado
    const userMethods = await TwoFactorManager.getUserMethods(userId);
    if (userMethods.length === 0) {
      return await next(); // No 2FA configurado, continuar
    }

    // Verificar si ya se verificó 2FA para esta acción en la sesión actual
    const isVerified = await TwoFactorManager.isSessionVerified(sessionId, action);
    if (isVerified) {
      return await next(); // Ya verificado en esta sesión, continuar
    }

    // Requerir verificación 2FA
    return c.json({
      success: false,
      error: 'two_factor_required',
      message: 'Se requiere verificación de dos factores',
      available_methods: userMethods.map(m => ({
        id: m.id,
        type: m.identifier_type,
        reference_code: m.reference_code // Incluye reference_code si existe
      })),
      session_id: sessionId // Para usar en verificación
    }, 403);
  };
}
```

## 📱 **INTEGRACIÓN CON SISTEMA EXISTENTE**

### **Actualización de Rutas de Autenticación (Integrado)**
```typescript
// En /auth/login - después de validar credenciales
const userMethods = await TwoFactorManager.getUserMethods(user.id);
if (user.two_factor && userMethods.length > 0) {
  // Crear sesión NORMAL (no temporal) pero sin marcar como verificada 2FA
  const sessionId = await SessionManager.createSession(user.id, c);

  // Establecer cookie de sesión
  setCookie(c, 'session_id', sessionId, {
    httpOnly: true,
    secure: true,
    sameSite: 'Lax',
    maxAge: 30 * 24 * 60 * 60 // 30 días
  });

  return c.json({
    success: false,
    requires_2fa: true,
    session_id: sessionId, // Sesión válida pero sin 2FA verificado
    available_methods: userMethods.map(m => ({
      id: m.id,
      type: m.identifier_type,
      reference_code: m.reference_code
    }))
  });
}

// Si no tiene 2FA, login normal completo
const sessionId = await SessionManager.createSession(user.id, c);
// ... resto del login normal
```

### **Protección de Rutas Sensibles**
```typescript
// Ejemplo: Cambio de contraseña
auth.post('/change-password',
  authMiddleware(),
  requireTwoFactor('change_password'),
  async (c) => {
    // Lógica de cambio de contraseña
  }
);
```

## 🌐 **CONFIGURACIÓN MULTI-BASE DE DATOS**

### **SQLite (Desarrollo)**
```sql
-- Esquema optimizado para SQLite
-- (Ya incluido arriba)
```

### **PostgreSQL (Producción)**
```sql
-- Two Factor Authentication Table LIMPIA con Backup Codes
CREATE TABLE IF NOT EXISTS two_factor (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL,
    identifier_type VARCHAR(20) NOT NULL,
    token TEXT NOT NULL,
    is_active BOOLEAN NOT NULL DEFAULT true,

    -- BACKUP CODES SYSTEM
    backup_codes JSONB, -- Array de códigos hasheados: ["hash1", "hash2", ...]
    backup_codes_used INTEGER NOT NULL DEFAULT 0,
    backup_codes_generated_at TIMESTAMP WITH TIME ZONE,

    -- Configuración y metadata
    metadata JSONB,
    reference_code VARCHAR(100),

    -- Estadísticas
    usage_count INTEGER NOT NULL DEFAULT 0,
    last_used_at TIMESTAMP WITH TIME ZONE,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),

    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
    UNIQUE (user_id, identifier_type),
    CHECK (identifier_type IN ('email', 'phone', 'otp', 'passkey'))
);

-- Trigger para updated_at
CREATE OR REPLACE FUNCTION update_two_factor_timestamp()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER update_two_factor_timestamp
    BEFORE UPDATE ON two_factor
    FOR EACH ROW
    EXECUTE FUNCTION update_two_factor_timestamp();

-- Actualizar tabla tokens para agregar updated_at
ALTER TABLE tokens ADD COLUMN IF NOT EXISTS updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW();

CREATE OR REPLACE FUNCTION update_tokens_timestamp()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER update_tokens_timestamp
    BEFORE UPDATE ON tokens
    FOR EACH ROW
    EXECUTE FUNCTION update_tokens_timestamp();
```

### **MySQL (Alternativo)**
```sql
-- Two Factor Authentication Table LIMPIA con Backup Codes
CREATE TABLE IF NOT EXISTS two_factor (
    id CHAR(36) PRIMARY KEY DEFAULT (UUID()),
    user_id CHAR(36) NOT NULL,
    identifier_type ENUM('email', 'phone', 'otp', 'passkey') NOT NULL,
    token TEXT NOT NULL,
    is_active BOOLEAN NOT NULL DEFAULT TRUE,

    -- BACKUP CODES SYSTEM
    backup_codes JSON, -- Array de códigos hasheados: ["hash1", "hash2", ...]
    backup_codes_used INT NOT NULL DEFAULT 0,
    backup_codes_generated_at TIMESTAMP NULL,

    -- Configuración y metadata
    metadata JSON,
    reference_code VARCHAR(100),

    -- Estadísticas
    usage_count INT NOT NULL DEFAULT 0,
    last_used_at TIMESTAMP NULL,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,

    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
    UNIQUE KEY unique_user_method (user_id, identifier_type)
);

-- Actualizar tabla tokens para agregar updated_at
ALTER TABLE tokens ADD COLUMN updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP;
```

## 🔄 **CASOS DE USO ESPECÍFICOS**

### **1. Setup de Email 2FA (Integrado con Short Tokens)**
```http
POST /auth/two-factor/email/setup
{
  "identifier": "user@example.com",
  "reference_code": "backup_email" // Opcional
}

# Sistema:
# 1. Usa ShortTokenManager.generateShortToken() con tokenType: 'short_two_factor_email'
# 2. Envía código de 6 dígitos via email (Zepto)
# 3. Código expira en 10 minutos, 3 intentos máximo
# 4. Retorna success + expiresIn
```

### **2. Setup de SMS 2FA (Integrado con Short Tokens)**
```http
POST /auth/two-factor/sms/setup
{
  "identifier": "+1234567890",
  "reference_code": "usa_phone_number" // Opcional
}

# Sistema:
# 1. Valida formato de teléfono
# 2. Usa ShortTokenManager.generateShortToken() con tokenType: 'short_two_factor_sms'
# 3. Envía código de 6 dígitos via SMS (MSG91)
# 4. Código expira en 10 minutos, 3 intentos máximo
```

### **3. Setup de OTP 2FA**
```http
POST /auth/two-factor/otp/setup
{}

# Sistema:
# 1. Genera secret TOTP
# 2. Crea QR code
# 3. Retorna secret y QR para configurar app
# 4. Espera verificación inicial
```

### **4. Setup de Passkey 2FA**
```http
POST /auth/two-factor/passkey/setup
{}

# Sistema:
# 1. Genera challenge WebAuthn
# 2. Retorna opciones de registro
# 3. Frontend maneja registro con navegador
# 4. Verifica y almacena credencial
```

### **5. Generar Backup Codes (Cualquier método)**
```http
POST /auth/two-factor/backup-codes/generate
{
  "verification_code": "123456", // Código 2FA actual requerido
  "method": "email" // Método usado para verificación
}

# Sistema:
# 1. Verifica código 2FA actual para seguridad
# 2. Genera 10 códigos alfanuméricos de 8 caracteres
# 3. Hashea códigos antes de almacenar
# 4. Retorna códigos en texto plano (única vez)
# 5. Actualiza backup_codes en tabla two_factor
```

### **6. Usar Backup Code para Login**
```http
POST /auth/two-factor/backup-code/verify
{
  "backup_code": "a1b2c3d4",
  "action": "login"
}

# Sistema:
# 1. Busca usuario con backup codes activos
# 2. Verifica código contra hashes almacenados
# 3. Si válido, marca código como usado (lo elimina)
# 4. Actualiza session metadata con verificación 2FA
# 5. Decrementa contador de códigos disponibles
```

## 🎯 **VENTAJAS DEL SISTEMA HÍBRIDO**

### **✅ Reutilización Máxima**
- **Short Tokens**: Reutiliza completamente el sistema existente para Email/SMS
- **Rate Limits**: Reutiliza RateLimiter existente para OTP/Passkeys
- **Sesiones**: Integra con SessionManager sin cambios en la tabla sessions
- **Email/SMS**: Usa la infraestructura de Zepto y MSG91 ya implementada
- **Middleware**: Compatible con authMiddleware() existente

### **✅ Control Opcional y Flexible**
- **Totalmente opcional**: Cada método puede habilitar/deshabilitar rate limiting
- **Configuración ENV**: Control granular via TWO_FACTOR_CONFIG
- **Sin rate limiting**: Sin límites = sin restricciones de intentos
- **Como Telegram/WhatsApp**: Rate limiting inteligente por método

### **✅ Simplicidad Arquitectural**
- **Tabla limpia**: `two_factor` solo para configuración permanente
- **Cero duplicación**: No reimplementa funcionalidad existente
- **Migración suave**: No afecta usuarios existentes
- **Híbrido inteligente**: Usa la mejor herramienta para cada método

### **✅ Escalabilidad Natural**
- **Reference codes**: Soporte opcional para casos específicos (usa_phone_number, etc.)
- **Multi-método**: Un usuario puede tener email + SMS + OTP + passkey
- **Rate limiting granular**: Diferentes límites por método
- **Multi-DB**: Compatible con SQLite, PostgreSQL, MySQL

## 🔧 **VARIABLES DE ENTORNO REQUERIDAS**

```bash
# Configuración principal HÍBRIDA Y OPCIONAL
TWO_FACTOR_AVAILABLE="email,sms,otp,passkey"
TWO_FACTOR_CONFIG='{
  "email": {
    "enabled": true,
    "provider": "zepto",
    "template": "two_factor_email",
    "code_length": 6,
    "expiry_minutes": 10,
    "rate_limiting": {
      "enabled": true,
      "max_attempts": 3,
      "lockout_minutes": 5
    }
  },
  "sms": {
    "enabled": true,
    "provider": "msg91",
    "template_id": "your_template_id",
    "code_length": 6,
    "expiry_minutes": 10,
    "rate_limiting": {
      "enabled": true,
      "max_attempts": 3,
      "lockout_minutes": 10
    }
  },
  "otp": {
    "enabled": true,
    "provider": "internal",
    "issuer": "Flowless",
    "digits": 6,
    "period": 30,
    "window": 1,
    "rate_limiting": {
      "enabled": false
    }
  },
  "passkey": {
    "enabled": true,
    "provider": "webauthn",
    "rp_name": "Flowless",
    "rp_id": "localhost",
    "timeout": 60000,
    "rate_limiting": {
      "enabled": false
    }
  }
}'

# Configuración de seguridad + BACKUP CODES + INTENTOS GLOBALES
TWO_FACTOR_SECURITY='{
  "default_max_attempts": 3,
  "default_lockout_minutes": 5,
  "trusted_device_days": 30,
  "require_for_sensitive": true,
  "backup_codes": {
    "enabled": true,
    "count": 10,
    "length": 8,
    "format": "alphanumeric",
    "require_2fa_to_generate": true,
    "max_attempts": 3,
    "lockout_minutes": 30
  },
  "rate_limiting": {
    "per_user_per_method": true,
    "global_attempts_per_hour": 50,
    "suspicious_activity_threshold": 10
  }
}'
```

## 📋 **CHECKLIST DE IMPLEMENTACIÓN**

### **Fase 1: Base de Datos (SIMPLIFICADA)**
- [ ] Crear tabla `two_factor` (solo una tabla nueva)
- [ ] Agregar índices optimizados
- [ ] Actualizar esquema en SQLite/PostgreSQL/MySQL
- [ ] Crear trigger de updated_at

### **Fase 2: Gestores (INTEGRADOS)**
- [ ] Implementar `TwoFactorManager` (integra con ShortTokenManager)
- [ ] Crear `EmailTwoFactorProvider` (wrapper de ShortTokenManager)
- [ ] Crear `SMSTwoFactorProvider` (wrapper de ShortTokenManager)
- [ ] Crear `OTPTwoFactorProvider` (TOTP directo)
- [ ] Crear `PasskeyTwoFactorProvider` (WebAuthn directo)

### **Fase 3: API y Middleware (REUTILIZA)**
- [ ] Implementar rutas `/auth/two-factor/*` (usa authMiddleware existente)
- [ ] Crear middleware `requireTwoFactor` (integra con SessionManager)
- [ ] Actualizar `/auth/login` para detectar 2FA
- [ ] Agregar nuevos token_types a ShortTokenManager

### **Fase 4: Integración (MÍNIMA)**
- [ ] Actualizar session metadata para tracking 2FA
- [ ] Proteger rutas sensibles con requireTwoFactor()
- [ ] Crear tests de integración con sistemas existentes
- [ ] Documentar nuevos endpoints

### **Fase 5: Frontend (Futuro)**
- [ ] Componentes de configuración 2FA
- [ ] Flujos de verificación
- [ ] Gestión de dispositivos confiables
- [ ] Códigos de respaldo

## 🚨 **CONSIDERACIONES IMPORTANTES**

### **Integración Perfecta con Sistema Actual**
- **Cero cambios** en tabla `users`, `sessions`, `tokens` existentes
- **Reutiliza 100%** la infraestructura de ShortTokenManager
- **Compatible 100%** con authMiddleware() y SessionManager
- **Misma seguridad** que el sistema de short tokens actual

### **Migración Cero-Impacto**
- **Usuarios existentes**: No se ven afectados en absoluto
- **Sesiones actuales**: Siguen funcionando normalmente
- **APIs existentes**: Sin cambios de comportamiento
- **Configuración**: Solo agregar nuevas variables ENV opcionales

### **Rendimiento Optimizado**
- **Una sola tabla nueva**: Mínimo impacto en base de datos
- **Reutiliza índices**: Los de `tokens` y `sessions` ya optimizados
- **Cache natural**: Via SessionManager existente
- **Rate limiting heredado**: Del sistema ShortTokenManager

### **Reference Codes (Opcional)**
```sql
-- Ejemplos de reference_code para casos específicos:
reference_code: 'usa_phone_number'    -- Teléfono específico de USA
reference_code: 'backup_email'        -- Email de respaldo
reference_code: 'work_phone'          -- Teléfono del trabajo
reference_code: 'personal_device'     -- Dispositivo personal
reference_code: NULL                  -- Método principal (default)
```

---

## 📞 **PRÓXIMOS PASOS**

1. **Revisar y aprobar** la propuesta de arquitectura
2. **Confirmar** los métodos de 2FA a implementar inicialmente
3. **Validar** la integración con sistemas existentes
4. **Planificar** la implementación por fases
5. **Definir** los casos de uso prioritarios

¿Te parece bien esta propuesta? ¿Hay algún aspecto que quieras modificar o alguna funcionalidad específica que quieras agregar?
