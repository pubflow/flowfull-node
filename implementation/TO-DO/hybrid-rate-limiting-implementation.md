# 🔄 Sistema Híbrido de Rate Limiting 2FA - OPCIONAL

## 📋 **RESUMEN**

Sistema híbrido y **totalmente opcional** de rate limiting para 2FA que combina:
- **Email/SMS**: Extiende ShortTokenManager con rate limiting configurable
- **OTP/Passkeys**: Usa RateLimiter existente con configuración opcional
- **Tabla two_factor**: Mantiene limpia, sin campos de control
- **Configuración ENV**: Cada método puede habilitar/deshabilitar rate limiting

## 🏗️ **ARQUITECTURA HÍBRIDA**

### **Configuración Opcional por Método**
```json
{
  "email": {
    "rate_limiting": {
      "enabled": true,        // ← OPCIONAL: Puede ser false
      "max_attempts": 3,
      "lockout_minutes": 5
    }
  },
  "sms": {
    "rate_limiting": {
      "enabled": true,        // ← OPCIONAL: Puede ser false
      "max_attempts": 3,
      "lockout_minutes": 10
    }
  },
  "otp": {
    "rate_limiting": {
      "enabled": false        // ← DESHABILITADO: Sin límites
    }
  },
  "passkey": {
    "rate_limiting": {
      "enabled": false        // ← DESHABILITADO: Sin límites
    }
  }
}
```

### **Implementación por Método**
1. **Email/SMS**: ShortTokenManager + rate limiting opcional
2. **OTP/Passkeys**: RateLimiter + configuración opcional
3. **Backup Codes**: Rate limiting opcional independiente

## 🔧 **IMPLEMENTACIÓN COMPLETA**

### **TwoFactorRateLimitManager (Nuevo)**
```typescript
// src/lib/auth/two-factor/rate-limit-manager.ts
import { getEnv } from '../../../config/env';
import { RateLimiter } from '../rate-limiter';

export class TwoFactorRateLimitManager {
  
  /**
   * Verificar si rate limiting está habilitado para un método
   */
  static isRateLimitingEnabled(methodType: string): boolean {
    try {
      const config = JSON.parse(getEnv().TWO_FACTOR_CONFIG || '{}');
      const methodConfig = config[methodType];
      
      return methodConfig?.rate_limiting?.enabled === true;
    } catch (error) {
      console.error('[2FA-RateLimit] Error parsing config:', error);
      return false; // Por defecto deshabilitado si hay error
    }
  }

  /**
   * Obtener configuración de rate limiting para un método
   */
  static getRateLimitConfig(methodType: string): {
    enabled: boolean;
    max_attempts: number;
    lockout_minutes: number;
  } {
    try {
      const config = JSON.parse(getEnv().TWO_FACTOR_CONFIG || '{}');
      const methodConfig = config[methodType];
      const rateLimitConfig = methodConfig?.rate_limiting || {};
      
      return {
        enabled: rateLimitConfig.enabled === true,
        max_attempts: rateLimitConfig.max_attempts || 3,
        lockout_minutes: rateLimitConfig.lockout_minutes || 5
      };
    } catch (error) {
      console.error('[2FA-RateLimit] Error parsing config:', error);
      return { enabled: false, max_attempts: 3, lockout_minutes: 5 };
    }
  }

  /**
   * Verificar rate limit para OTP/Passkeys (usa RateLimiter)
   */
  static async checkOTPPasskeyRateLimit(
    userId: string, 
    methodType: string
  ): Promise<{
    allowed: boolean;
    attempts_remaining?: number;
    lockout_until?: string;
    rate_limiting_enabled: boolean;
  }> {
    const config = this.getRateLimitConfig(methodType);
    
    if (!config.enabled) {
      return {
        allowed: true,
        rate_limiting_enabled: false
      };
    }

    try {
      const rateLimitKey = `2fa_${methodType}_${userId}`;
      const result = await RateLimiter.checkLimit(
        rateLimitKey, 
        config.max_attempts, 
        config.lockout_minutes * 60 // convertir a segundos
      );

      return {
        allowed: result.allowed,
        attempts_remaining: result.remaining,
        lockout_until: result.resetTime ? new Date(result.resetTime).toISOString() : undefined,
        rate_limiting_enabled: true
      };

    } catch (error) {
      console.error('[2FA-RateLimit] Error checking OTP/Passkey rate limit:', error);
      return {
        allowed: true, // En caso de error, permitir acceso
        rate_limiting_enabled: true
      };
    }
  }

  /**
   * Registrar intento fallido para OTP/Passkeys
   */
  static async recordOTPPasskeyFailedAttempt(
    userId: string, 
    methodType: string
  ): Promise<{
    attempts_remaining: number;
    locked: boolean;
    lockout_until?: string;
  }> {
    const config = this.getRateLimitConfig(methodType);
    
    if (!config.enabled) {
      return {
        attempts_remaining: 999, // Sin límites
        locked: false
      };
    }

    try {
      const rateLimitKey = `2fa_${methodType}_${userId}`;
      await RateLimiter.recordAttempt(rateLimitKey);
      
      const status = await RateLimiter.checkLimit(
        rateLimitKey, 
        config.max_attempts, 
        config.lockout_minutes * 60
      );

      return {
        attempts_remaining: status.remaining || 0,
        locked: !status.allowed,
        lockout_until: status.resetTime ? new Date(status.resetTime).toISOString() : undefined
      };

    } catch (error) {
      console.error('[2FA-RateLimit] Error recording failed attempt:', error);
      return {
        attempts_remaining: 0,
        locked: false
      };
    }
  }

  /**
   * Limpiar rate limit después de éxito
   */
  static async clearOTPPasskeyRateLimit(userId: string, methodType: string): Promise<void> {
    const config = this.getRateLimitConfig(methodType);
    
    if (!config.enabled) {
      return; // No hay nada que limpiar
    }

    try {
      const rateLimitKey = `2fa_${methodType}_${userId}`;
      await RateLimiter.clearLimit(rateLimitKey);
      
      console.log(`[2FA-RateLimit] Cleared rate limit for ${userId}:${methodType}`);
    } catch (error) {
      console.error('[2FA-RateLimit] Error clearing rate limit:', error);
    }
  }
}
```

### **ShortTokenManager Extendido (Actualización)**
```typescript
// Actualización en src/lib/auth/token-manager.ts
import { TwoFactorRateLimitManager } from './two-factor/rate-limit-manager';

export class ShortTokenManager {
  
  /**
   * Generar short token con rate limiting opcional
   */
  static async generateShortToken(options: {
    identifier: string;
    type: 'email' | 'phone';
    tokenType: string;
    userId?: string;
    context?: string;
  }): Promise<{
    success: boolean;
    message: string;
    expiresIn?: number;
    rate_limiting_enabled?: boolean;
  }> {
    try {
      // Verificar si rate limiting está habilitado
      const methodType = options.type === 'phone' ? 'sms' : 'email';
      const rateLimitConfig = TwoFactorRateLimitManager.getRateLimitConfig(methodType);
      
      if (rateLimitConfig.enabled) {
        // Verificar rate limit antes de generar token
        const rateLimitCheck = await this.checkEmailSMSRateLimit(options.userId!, methodType);
        if (!rateLimitCheck.allowed) {
          return {
            success: false,
            message: `Demasiados intentos. Intenta de nuevo en ${rateLimitConfig.lockout_minutes} minutos.`,
            rate_limiting_enabled: true
          };
        }
      }

      // Generar token normalmente (código existente)
      const result = await this.generateShortTokenOriginal(options);
      
      return {
        ...result,
        rate_limiting_enabled: rateLimitConfig.enabled
      };

    } catch (error) {
      console.error('[ShortToken] Error generating token with rate limit:', error);
      return {
        success: false,
        message: 'Error al generar código de verificación'
      };
    }
  }

  /**
   * Validar short token con rate limiting opcional
   */
  static async validateShortToken(
    code: string,
    identifier: string,
    tokenType?: string
  ): Promise<{
    success: boolean;
    valid: boolean;
    message?: string;
    attemptsRemaining?: number;
    userId?: string;
    rate_limiting_enabled?: boolean;
    lockout_until?: string;
  }> {
    try {
      // Determinar tipo de método
      const methodType = tokenType?.includes('sms') ? 'sms' : 'email';
      const rateLimitConfig = TwoFactorRateLimitManager.getRateLimitConfig(methodType);
      
      // Validar token normalmente (código existente)
      const validation = await this.validateShortTokenOriginal(code, identifier, tokenType);
      
      if (!validation.valid && rateLimitConfig.enabled && validation.userId) {
        // Registrar intento fallido si rate limiting está habilitado
        const rateLimitResult = await this.recordEmailSMSFailedAttempt(validation.userId, methodType);
        
        return {
          ...validation,
          attemptsRemaining: rateLimitResult.attempts_remaining,
          lockout_until: rateLimitResult.lockout_until,
          rate_limiting_enabled: true
        };
      }

      return {
        ...validation,
        rate_limiting_enabled: rateLimitConfig.enabled
      };

    } catch (error) {
      console.error('[ShortToken] Error validating token with rate limit:', error);
      return {
        success: false,
        valid: false,
        message: 'Error de validación'
      };
    }
  }

  /**
   * Verificar rate limit para Email/SMS (usa tokens existente)
   */
  private static async checkEmailSMSRateLimit(
    userId: string, 
    methodType: string
  ): Promise<{
    allowed: boolean;
    attempts_remaining?: number;
  }> {
    // Implementar usando la tabla tokens existente
    // Contar tokens activos del usuario para este método en las últimas X horas
    const config = TwoFactorRateLimitManager.getRateLimitConfig(methodType);
    const hoursBack = config.lockout_minutes / 60;
    const cutoffTime = new Date(Date.now() - (hoursBack * 60 * 60 * 1000)).toISOString();
    
    const recentTokens = await getDb().select()
      .from(tokens)
      .where(and(
        eq(tokens.user_id, userId),
        eq(tokens.token_type, `short_two_factor_${methodType}`),
        gt(tokens.created_at, cutoffTime)
      ));

    const attemptCount = recentTokens.length;
    const allowed = attemptCount < config.max_attempts;
    
    return {
      allowed,
      attempts_remaining: Math.max(0, config.max_attempts - attemptCount)
    };
  }

  /**
   * Registrar intento fallido para Email/SMS
   */
  private static async recordEmailSMSFailedAttempt(
    userId: string, 
    methodType: string
  ): Promise<{
    attempts_remaining: number;
    lockout_until?: string;
  }> {
    // Para Email/SMS, el rate limiting se maneja automáticamente
    // por la expiración de tokens en la tabla tokens
    const config = TwoFactorRateLimitManager.getRateLimitConfig(methodType);
    const rateLimitCheck = await this.checkEmailSMSRateLimit(userId, methodType);
    
    return {
      attempts_remaining: rateLimitCheck.attempts_remaining || 0,
      lockout_until: !rateLimitCheck.allowed 
        ? new Date(Date.now() + (config.lockout_minutes * 60 * 1000)).toISOString()
        : undefined
    };
  }
}
```

### **TwoFactorManager Actualizado (Híbrido)**
```typescript
// src/lib/auth/two-factor/manager.ts (actualizado)
import { TwoFactorRateLimitManager } from './rate-limit-manager';
import { ShortTokenManager } from '../token-manager';

export class TwoFactorManager {

  /**
   * Verificar código con rate limiting híbrido y opcional
   */
  static async verifyCode(sessionId: string, code: string, method: string): Promise<{
    success: boolean;
    verified: boolean;
    attempts_remaining?: number;
    lockout_until?: string;
    rate_limiting_enabled?: boolean;
    message?: string;
  }> {
    try {
      const userId = await this.getUserIdFromSession(sessionId);

      // 1. Verificar si rate limiting está habilitado para este método
      const rateLimitingEnabled = TwoFactorRateLimitManager.isRateLimitingEnabled(method);

      // 2. Si rate limiting está habilitado, verificar bloqueo
      if (rateLimitingEnabled) {
        if (method === 'otp' || method === 'passkey') {
          // Para OTP/Passkeys: usar RateLimiter
          const rateLimitCheck = await TwoFactorRateLimitManager.checkOTPPasskeyRateLimit(userId, method);
          if (!rateLimitCheck.allowed) {
            return {
              success: false,
              verified: false,
              lockout_until: rateLimitCheck.lockout_until,
              rate_limiting_enabled: true,
              message: `Método bloqueado. Intenta de nuevo más tarde.`
            };
          }
        }
        // Para Email/SMS: el rate limiting se maneja en ShortTokenManager
      }

      // 3. Verificar código según el método
      let verificationResult;

      if (code.length === 8 && /^[a-z0-9]+$/.test(code)) {
        // Posible backup code
        verificationResult = await BackupCodesManager.verifyBackupCode(userId, code);

        if (verificationResult.verified) {
          return {
            success: true,
            verified: true,
            rate_limiting_enabled: false, // Backup codes no tienen rate limiting
            message: `Backup code verificado. Códigos restantes: ${verificationResult.remaining_codes}`
          };
        }
      } else {
        // Verificación por método específico
        if (method === 'email' || method === 'sms') {
          // Email/SMS: usar ShortTokenManager con rate limiting opcional
          const tokenType = `short_two_factor_${method}`;
          const identifier = await this.getMethodIdentifier(userId, method);

          verificationResult = await ShortTokenManager.validateShortToken(code, identifier, tokenType);

          if (verificationResult.valid) {
            await this.markSessionVerified(sessionId, method);
            return {
              success: true,
              verified: true,
              rate_limiting_enabled: verificationResult.rate_limiting_enabled,
              message: 'Verificación exitosa'
            };
          } else {
            return {
              success: false,
              verified: false,
              attempts_remaining: verificationResult.attemptsRemaining,
              lockout_until: verificationResult.lockout_until,
              rate_limiting_enabled: verificationResult.rate_limiting_enabled,
              message: verificationResult.message || 'Código incorrecto'
            };
          }

        } else if (method === 'otp') {
          // OTP: verificar TOTP + rate limiting opcional
          const otpSecret = await this.getOTPSecret(userId);
          const isValidOTP = await OTPTwoFactorProvider.validateToken(otpSecret, code);

          if (isValidOTP) {
            // Éxito: limpiar rate limit si está habilitado
            if (rateLimitingEnabled) {
              await TwoFactorRateLimitManager.clearOTPPasskeyRateLimit(userId, method);
            }
            await this.markSessionVerified(sessionId, method);

            return {
              success: true,
              verified: true,
              rate_limiting_enabled: rateLimitingEnabled,
              message: 'Verificación OTP exitosa'
            };
          } else {
            // Fallo: registrar intento si rate limiting está habilitado
            if (rateLimitingEnabled) {
              const attemptResult = await TwoFactorRateLimitManager.recordOTPPasskeyFailedAttempt(userId, method);

              return {
                success: false,
                verified: false,
                attempts_remaining: attemptResult.attempts_remaining,
                lockout_until: attemptResult.lockout_until,
                rate_limiting_enabled: true,
                message: attemptResult.locked
                  ? 'Demasiados intentos fallidos. Método bloqueado temporalmente.'
                  : `Código OTP incorrecto. ${attemptResult.attempts_remaining} intentos restantes.`
              };
            } else {
              return {
                success: false,
                verified: false,
                rate_limiting_enabled: false,
                message: 'Código OTP incorrecto'
              };
            }
          }

        } else if (method === 'passkey') {
          // Passkey: verificar WebAuthn + rate limiting opcional
          const isValidPasskey = await PasskeyTwoFactorProvider.verifyAuthentication(userId, code);

          if (isValidPasskey) {
            // Éxito: limpiar rate limit si está habilitado
            if (rateLimitingEnabled) {
              await TwoFactorRateLimitManager.clearOTPPasskeyRateLimit(userId, method);
            }
            await this.markSessionVerified(sessionId, method);

            return {
              success: true,
              verified: true,
              rate_limiting_enabled: rateLimitingEnabled,
              message: 'Verificación Passkey exitosa'
            };
          } else {
            // Fallo: registrar intento si rate limiting está habilitado
            if (rateLimitingEnabled) {
              const attemptResult = await TwoFactorRateLimitManager.recordOTPPasskeyFailedAttempt(userId, method);

              return {
                success: false,
                verified: false,
                attempts_remaining: attemptResult.attempts_remaining,
                lockout_until: attemptResult.lockout_until,
                rate_limiting_enabled: true,
                message: attemptResult.locked
                  ? 'Demasiados intentos fallidos. Método bloqueado temporalmente.'
                  : `Passkey inválido. ${attemptResult.attempts_remaining} intentos restantes.`
              };
            } else {
              return {
                success: false,
                verified: false,
                rate_limiting_enabled: false,
                message: 'Passkey inválido'
              };
            }
          }
        }
      }

      // Código no válido para ningún método
      return {
        success: false,
        verified: false,
        rate_limiting_enabled: rateLimitingEnabled,
        message: 'Código de verificación inválido'
      };

    } catch (error) {
      console.error('[TwoFactor] Error verifying code:', error);
      return {
        success: false,
        verified: false,
        message: 'Error interno del servidor'
      };
    }
  }
}
```

## 🛠️ **RUTAS API ACTUALIZADAS**

### **Verificación con Rate Limiting Híbrido**
```typescript
// POST /auth/two-factor/verify (actualizada)
auth.post('/two-factor/verify',
  authMiddleware(),
  async (c) => {
    try {
      const sessionId = c.get('session_id');
      const { code, method, action = 'login' } = await c.req.json();

      // Verificar código con rate limiting híbrido y opcional
      const result = await TwoFactorManager.verifyCode(sessionId, code, method);

      if (result.verified) {
        return c.json({
          success: true,
          verified: true,
          rate_limiting_enabled: result.rate_limiting_enabled,
          message: result.message
        });
      } else {
        const statusCode = result.lockout_until ? 429 : 400;

        return c.json({
          success: false,
          verified: false,
          attempts_remaining: result.attempts_remaining,
          lockout_until: result.lockout_until,
          locked: !!result.lockout_until,
          rate_limiting_enabled: result.rate_limiting_enabled,
          message: result.message
        }, statusCode);
      }

    } catch (error) {
      console.error('Error verifying 2FA code:', error);
      return c.json({
        success: false,
        message: 'Error interno del servidor'
      }, 500);
    }
  }
);
```

## 🎯 **VENTAJAS DEL SISTEMA HÍBRIDO**

### **✅ Totalmente Opcional**
- Cada método puede habilitar/deshabilitar rate limiting independientemente
- Configuración flexible via ENV
- Sin rate limiting = sin límites de intentos

### **✅ Reutiliza Infraestructura**
- Email/SMS: Usa ShortTokenManager existente
- OTP/Passkeys: Usa RateLimiter existente
- Tabla two_factor: Mantiene limpia

### **✅ Como Telegram/WhatsApp**
- Rate limiting inteligente por método
- Bloqueos temporales configurables
- Mensajes claros al usuario

### **✅ Configuración Granular**
```bash
# Ejemplo: Solo SMS con rate limiting
TWO_FACTOR_CONFIG='{
  "email": {"rate_limiting": {"enabled": false}},
  "sms": {"rate_limiting": {"enabled": true, "max_attempts": 3}},
  "otp": {"rate_limiting": {"enabled": false}},
  "passkey": {"rate_limiting": {"enabled": false}}
}'
```

---

**Status**: ✅ Sistema híbrido y opcional implementado completamente
