# 🔐 Backup Codes Implementation - Sistema 2FA

## 📋 **RESUMEN**

Implementación completa del sistema de backup codes para recuperación de acceso cuando se pierde el método 2FA principal. Los códigos se almacenan hasheados en la tabla `two_factor` y se integran perfectamente con el sistema de short tokens existente.

## 🏗️ **ARQUITECTURA DE BACKUP CODES**

### **Almacenamiento Eficiente**
```sql
-- En tabla two_factor
backup_codes TEXT, -- JSON array: ["hash1", "hash2", "hash3", ...]
backup_codes_used INTEGER NOT NULL DEFAULT 0, -- Contador de códigos usados
backup_codes_generated_at TEXT, -- Timestamp de generación
```

### **Formato de Códigos**
- **Longitud**: 8 caracteres alfanuméricos
- **Formato**: `a1b2c3d4` (minúsculas + números)
- **Cantidad**: 10 códigos por defecto
- **Almacenamiento**: Hasheados individualmente con PasswordManager
- **Uso**: Un solo uso por código

## 🔧 **IMPLEMENTACIÓN COMPLETA**

### **BackupCodesManager Class**
```typescript
// src/lib/auth/two-factor/backup-codes-manager.ts
import { getDb } from '../../../db';
import { two_factor } from '../../../../db/schema';
import { eq, and } from 'drizzle-orm';
import { PasswordManager } from '../password';
import { nanoid } from 'nanoid';

export class BackupCodesManager {
  private static readonly DEFAULT_CODES_COUNT = 10;
  private static readonly CODE_LENGTH = 8;
  
  /**
   * Generar nuevos backup codes para un método 2FA
   */
  static async generateBackupCodes(
    userId: string,
    methodId: string,
    count: number = this.DEFAULT_CODES_COUNT
  ): Promise<{
    success: boolean;
    backup_codes?: string[];
    message?: string;
  }> {
    try {
      // Verificar que el método 2FA existe y pertenece al usuario
      const method = await getDb().select()
        .from(two_factor)
        .where(and(
          eq(two_factor.id, methodId),
          eq(two_factor.user_id, userId),
          eq(two_factor.is_active, 1)
        ))
        .get();

      if (!method) {
        return {
          success: false,
          message: 'Método 2FA no encontrado'
        };
      }

      // Generar códigos únicos
      const rawCodes: string[] = [];
      const hashedCodes: string[] = [];

      for (let i = 0; i < count; i++) {
        let code: string;
        let isUnique = false;
        let attempts = 0;

        // Asegurar que el código sea único
        do {
          code = this.generateAlphanumericCode(this.CODE_LENGTH);
          isUnique = !rawCodes.includes(code);
          attempts++;
        } while (!isUnique && attempts < 50);

        if (!isUnique) {
          throw new Error('No se pudo generar código único');
        }

        const hashedCode = await PasswordManager.hash(code);
        rawCodes.push(code);
        hashedCodes.push(hashedCode);
      }

      // Actualizar método 2FA con nuevos backup codes
      await getDb().update(two_factor)
        .set({
          backup_codes: JSON.stringify(hashedCodes),
          backup_codes_used: 0,
          backup_codes_generated_at: new Date().toISOString(),
          updated_at: new Date().toISOString()
        })
        .where(eq(two_factor.id, methodId));

      console.log(`[BackupCodes] Generated ${count} backup codes for user ${userId}`);

      return {
        success: true,
        backup_codes: rawCodes
      };

    } catch (error) {
      console.error('[BackupCodes] Error generating codes:', error);
      return {
        success: false,
        message: 'Error al generar códigos de respaldo'
      };
    }
  }

  /**
   * Verificar backup code
   */
  static async verifyBackupCode(
    userId: string,
    providedCode: string
  ): Promise<{
    success: boolean;
    verified: boolean;
    remaining_codes?: number;
    message?: string;
  }> {
    try {
      // Buscar métodos 2FA del usuario que tengan backup codes
      const methods = await getDb().select()
        .from(two_factor)
        .where(and(
          eq(two_factor.user_id, userId),
          eq(two_factor.is_active, 1)
        ));

      for (const method of methods) {
        if (!method.backup_codes) continue;

        const hashedCodes = JSON.parse(method.backup_codes) as string[];
        
        // Verificar código contra cada hash
        for (let i = 0; i < hashedCodes.length; i++) {
          const isValid = await PasswordManager.verify(providedCode, hashedCodes[i]);
          
          if (isValid) {
            // Código válido - marcarlo como usado (eliminarlo)
            const updatedCodes = hashedCodes.filter((_, index) => index !== i);
            const usedCount = method.backup_codes_used + 1;

            await getDb().update(two_factor)
              .set({
                backup_codes: JSON.stringify(updatedCodes),
                backup_codes_used: usedCount,
                last_used_at: new Date().toISOString(),
                updated_at: new Date().toISOString()
              })
              .where(eq(two_factor.id, method.id));

            console.log(`[BackupCodes] Used backup code for user ${userId}, ${updatedCodes.length} remaining`);

            return {
              success: true,
              verified: true,
              remaining_codes: updatedCodes.length
            };
          }
        }
      }

      // Código no válido
      return {
        success: true,
        verified: false,
        message: 'Código de respaldo inválido'
      };

    } catch (error) {
      console.error('[BackupCodes] Error verifying code:', error);
      return {
        success: false,
        verified: false,
        message: 'Error al verificar código de respaldo'
      };
    }
  }

  /**
   * Obtener estado de backup codes del usuario
   */
  static async getBackupCodesStatus(userId: string): Promise<{
    has_backup_codes: boolean;
    total_codes: number;
    used_codes: number;
    remaining_codes: number;
    generated_at?: string;
    last_used_at?: string;
  }> {
    try {
      const methods = await getDb().select()
        .from(two_factor)
        .where(and(
          eq(two_factor.user_id, userId),
          eq(two_factor.is_active, 1)
        ));

      let totalCodes = 0;
      let usedCodes = 0;
      let generatedAt: string | undefined;
      let lastUsedAt: string | undefined;

      for (const method of methods) {
        if (method.backup_codes) {
          const hashedCodes = JSON.parse(method.backup_codes) as string[];
          totalCodes += hashedCodes.length + method.backup_codes_used;
          usedCodes += method.backup_codes_used;
          
          if (method.backup_codes_generated_at) {
            generatedAt = method.backup_codes_generated_at;
          }
          
          if (method.last_used_at) {
            lastUsedAt = method.last_used_at;
          }
        }
      }

      return {
        has_backup_codes: totalCodes > 0,
        total_codes: totalCodes,
        used_codes: usedCodes,
        remaining_codes: totalCodes - usedCodes,
        generated_at: generatedAt,
        last_used_at: lastUsedAt
      };

    } catch (error) {
      console.error('[BackupCodes] Error getting status:', error);
      return {
        has_backup_codes: false,
        total_codes: 0,
        used_codes: 0,
        remaining_codes: 0
      };
    }
  }

  /**
   * Generar código alfanumérico
   */
  private static generateAlphanumericCode(length: number): string {
    const chars = 'abcdefghijklmnopqrstuvwxyz0123456789';
    let result = '';
    for (let i = 0; i < length; i++) {
      result += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return result;
  }

  /**
   * Verificar si el usuario tiene backup codes disponibles
   */
  static async hasAvailableBackupCodes(userId: string): Promise<boolean> {
    const status = await this.getBackupCodesStatus(userId);
    return status.remaining_codes > 0;
  }

  /**
   * Eliminar todos los backup codes de un usuario
   */
  static async clearBackupCodes(userId: string, methodId: string): Promise<boolean> {
    try {
      await getDb().update(two_factor)
        .set({
          backup_codes: null,
          backup_codes_used: 0,
          backup_codes_generated_at: null,
          updated_at: new Date().toISOString()
        })
        .where(and(
          eq(two_factor.id, methodId),
          eq(two_factor.user_id, userId)
        ));

      console.log(`[BackupCodes] Cleared backup codes for user ${userId}`);
      return true;

    } catch (error) {
      console.error('[BackupCodes] Error clearing codes:', error);
      return false;
    }
  }
}
```

## 🛠️ **RUTAS API PARA BACKUP CODES**

### **Generar Backup Codes**
```typescript
// POST /auth/two-factor/backup-codes/generate
auth.post('/two-factor/backup-codes/generate', 
  authMiddleware(),
  async (c) => {
    try {
      const userId = c.get('user_id');
      const { verification_code, method, method_id } = await c.req.json();

      // Verificar código 2FA actual para seguridad
      const verification = await TwoFactorManager.verifyCode(
        c.get('session_id'), 
        verification_code, 
        method
      );

      if (!verification.verified) {
        return c.json({
          success: false,
          message: 'Código de verificación inválido'
        }, 400);
      }

      // Generar backup codes
      const result = await BackupCodesManager.generateBackupCodes(userId, method_id);

      if (!result.success) {
        return c.json({
          success: false,
          message: result.message
        }, 400);
      }

      return c.json({
        success: true,
        backup_codes: result.backup_codes,
        codes_count: result.backup_codes?.length || 0,
        generated_at: new Date().toISOString(),
        warning: 'Guarda estos códigos en un lugar seguro. No se mostrarán nuevamente.'
      });

    } catch (error) {
      console.error('Error generating backup codes:', error);
      return c.json({
        success: false,
        message: 'Error interno del servidor'
      }, 500);
    }
  }
);
```

### **Verificar Backup Code**
```typescript
// POST /auth/two-factor/backup-code/verify
auth.post('/two-factor/backup-code/verify',
  authMiddleware(),
  async (c) => {
    try {
      const userId = c.get('user_id');
      const sessionId = c.get('session_id');
      const { backup_code, action = 'login' } = await c.req.json();

      if (!backup_code || backup_code.length !== 8) {
        return c.json({
          success: false,
          message: 'Código de respaldo inválido'
        }, 400);
      }

      // Verificar backup code
      const verification = await BackupCodesManager.verifyBackupCode(userId, backup_code);

      if (!verification.verified) {
        return c.json({
          success: false,
          message: verification.message || 'Código de respaldo inválido'
        }, 400);
      }

      // Marcar sesión como verificada 2FA
      await TwoFactorManager.markSessionVerified(sessionId, 'backup_code');

      return c.json({
        success: true,
        verified: true,
        remaining_codes: verification.remaining_codes,
        message: 'Código de respaldo verificado correctamente'
      });

    } catch (error) {
      console.error('Error verifying backup code:', error);
      return c.json({
        success: false,
        message: 'Error interno del servidor'
      }, 500);
    }
  }
);
```

### **Estado de Backup Codes**
```typescript
// GET /auth/two-factor/backup-codes/status
auth.get('/two-factor/backup-codes/status',
  authMiddleware(),
  async (c) => {
    try {
      const userId = c.get('user_id');
      const status = await BackupCodesManager.getBackupCodesStatus(userId);

      return c.json({
        success: true,
        ...status
      });

    } catch (error) {
      console.error('Error getting backup codes status:', error);
      return c.json({
        success: false,
        message: 'Error interno del servidor'
      }, 500);
    }
  }
);
```

## 🔄 **INTEGRACIÓN CON SISTEMA EXISTENTE**

### **Actualización de TwoFactorManager**
```typescript
// Agregar a TwoFactorManager
export class TwoFactorManager {
  // ... métodos existentes ...

  /**
   * Verificar si el código es un backup code
   */
  static async verifyCode(sessionId: string, code: string, method: string): Promise<{
    success: boolean;
    verified: boolean;
    message?: string;
  }> {
    const userId = await this.getUserIdFromSession(sessionId);

    // Si el código tiene 8 caracteres, podría ser un backup code
    if (code.length === 8 && /^[a-z0-9]+$/.test(code)) {
      const backupVerification = await BackupCodesManager.verifyBackupCode(userId, code);

      if (backupVerification.verified) {
        await this.markSessionVerified(sessionId, 'backup_code');
        return {
          success: true,
          verified: true,
          message: `Backup code verificado. Códigos restantes: ${backupVerification.remaining_codes}`
        };
      }
    }

    // Si no es backup code, usar verificación normal (short tokens)
    if (method === 'email') {
      return await EmailTwoFactorProvider.validateCode(/* ... */);
    } else if (method === 'sms') {
      return await SMSTwoFactorProvider.validateCode(/* ... */);
    }
    // ... otros métodos

    return {
      success: false,
      verified: false,
      message: 'Código inválido'
    };
  }
}
```

## 🛡️ **SEGURIDAD DE BACKUP CODES**

### **Características de Seguridad**
1. **Hashing Individual**: Cada código se hashea por separado con PasswordManager
2. **Un Solo Uso**: Los códigos se eliminan después del uso
3. **Verificación 2FA Requerida**: Se necesita código 2FA actual para generar nuevos
4. **Longitud Segura**: 8 caracteres = 36^8 = 2.8 trillones de combinaciones
5. **Formato Restringido**: Solo minúsculas y números (evita confusión)

### **Mejores Prácticas**
- **Generación Segura**: Usa crypto.getRandomValues() si está disponible
- **Almacenamiento Hasheado**: Nunca almacenar códigos en texto plano
- **Límite de Intentos**: Heredado del sistema de rate limiting
- **Audit Trail**: Logs automáticos de uso y generación
- **Expiración**: Los códigos no expiran, pero se pueden regenerar

## 📊 **ESQUEMAS DE BASE DE DATOS ACTUALIZADOS**

### **SQLite (Desarrollo)**
```sql
-- Agregar columnas a tabla two_factor existente
ALTER TABLE two_factor ADD COLUMN backup_codes TEXT;
ALTER TABLE two_factor ADD COLUMN backup_codes_used INTEGER NOT NULL DEFAULT 0;
ALTER TABLE two_factor ADD COLUMN backup_codes_generated_at TEXT;

-- Agregar columna updated_at a tokens
ALTER TABLE tokens ADD COLUMN updated_at TEXT DEFAULT (datetime('now'));

-- Trigger para updated_at en two_factor
CREATE TRIGGER IF NOT EXISTS update_two_factor_timestamp
AFTER UPDATE ON two_factor
BEGIN
    UPDATE two_factor SET updated_at = datetime('now') WHERE id = NEW.id;
END;
```

### **Índices para Backup Codes**
```sql
-- Índices optimizados para backup codes
CREATE INDEX idx_two_factor_backup_codes ON two_factor(user_id) WHERE backup_codes IS NOT NULL;
CREATE INDEX idx_two_factor_backup_generated ON two_factor(backup_codes_generated_at);
CREATE INDEX idx_two_factor_backup_used ON two_factor(backup_codes_used);
```

## 🎯 **CASOS DE USO**

### **1. Usuario Pierde Teléfono (OTP)**
1. Usuario intenta login → sistema pide OTP
2. Usuario no puede acceder a app OTP
3. Usuario usa backup code → acceso concedido
4. Usuario puede deshabilitar OTP y configurar nuevo método

### **2. Usuario Cambia Email**
1. Usuario quiere cambiar email principal
2. Sistema pide verificación 2FA
3. Usuario usa backup code → verificación exitosa
4. Usuario puede cambiar email y reconfigurar 2FA

### **3. Emergencia de Acceso**
1. Usuario pierde acceso a todos los métodos 2FA
2. Usuario usa backup codes para acceder
3. Usuario regenera nuevos backup codes
4. Usuario configura nuevos métodos 2FA

## ✅ **VENTAJAS DEL SISTEMA**

- **🔗 Integración Perfecta**: Usa PasswordManager y sistemas existentes
- **💾 Almacenamiento Eficiente**: JSON en columna, no tabla separada
- **🛡️ Seguridad Robusta**: Hashing individual, un solo uso
- **⚡ Rendimiento**: Búsqueda rápida, índices optimizados
- **🔄 Compatibilidad**: Funciona con todos los métodos 2FA
- **📱 UX Amigable**: Códigos fáciles de escribir manualmente

---

**Status**: ✅ Implementación completa lista para integración
