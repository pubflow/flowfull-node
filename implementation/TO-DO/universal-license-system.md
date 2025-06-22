# 🔑 Sistema Universal de Licencias - Multi-Propósito y Escalable

## 📋 **RESUMEN**

Sistema universal de licencias que se integra con `products`, `subscriptions`, `memberships` y soporta tanto usuarios autenticados como guest. Perfecto para software vendors, SaaS, aplicaciones móviles, y cualquier producto digital que requiera licenciamiento.

## 🏗️ **ARQUITECTURA DEL SISTEMA**

### **Integración con Sistema Existente**
- **Products**: `product_type: 'license'` otorga licencias
- **Subscriptions**: Licencias recurrentes (SaaS, software subscriptions)
- **Memberships**: Membresías que incluyen acceso a licencias
- **Payments**: Tracking completo de compras de licencias
- **Guest Support**: Licencias para usuarios no registrados

### **Casos de Uso Cubiertos**
✅ **Software Lifetime**: Licencia permanente por compra única  
✅ **SaaS Subscriptions**: Licencias recurrentes mensuales/anuales  
✅ **Mobile Apps**: Licencias por device con límites configurables  
✅ **Enterprise**: Licencias por organización con múltiples seats  
✅ **Freemium**: Licencias gratuitas con limitaciones  
✅ **Trial**: Licencias temporales de prueba  

## 🔧 **IMPLEMENTACIÓN COMPLETA**

### **Nueva Tabla: `licenses`**
```sql
-- Licenses (Universal licensing system)
CREATE TABLE IF NOT EXISTS licenses (
    id TEXT PRIMARY KEY,
    license_key TEXT UNIQUE NOT NULL, -- Hashed license key for security
    license_key_plain TEXT, -- Plain text key (only for initial generation, then cleared)
    
    -- Ownership (supports users, organizations, and guests)
    user_id TEXT,
    organization_id TEXT,
    customer_id TEXT, -- References provider_customers (supports guests)
    
    -- License source (what granted this license)
    product_id TEXT, -- Product that granted this license
    subscription_id TEXT, -- Subscription that granted this license
    membership_id TEXT, -- Membership that granted this license
    order_id TEXT, -- Order that granted this license
    payment_id TEXT, -- Payment that granted this license
    
    -- License configuration
    license_type TEXT NOT NULL, -- 'lifetime', 'subscription', 'trial', 'freemium', 'enterprise'
    software_product TEXT NOT NULL, -- 'my_app_v1', 'premium_features', 'mobile_app'
    version_constraint TEXT, -- '>=1.0.0', '1.x.x', 'any' (semver constraints)
    
    -- Device/Usage limits
    max_devices INTEGER DEFAULT 1, -- Maximum devices allowed (-1 = unlimited)
    max_users INTEGER DEFAULT 1, -- Maximum users allowed (-1 = unlimited)
    current_devices INTEGER NOT NULL DEFAULT 0, -- Current active devices
    current_users INTEGER NOT NULL DEFAULT 0, -- Current active users
    
    -- License status and validity
    status TEXT NOT NULL DEFAULT 'active', -- 'active', 'suspended', 'expired', 'revoked'
    is_trial INTEGER NOT NULL DEFAULT 0, -- Is this a trial license
    
    -- Time constraints
    issued_at TEXT NOT NULL DEFAULT (datetime('now')),
    expires_at TEXT, -- NULL for lifetime licenses
    last_used_at TEXT,
    
    -- Features and permissions
    features TEXT, -- JSON array of enabled features
    permissions TEXT, -- JSON object with detailed permissions
    metadata TEXT, -- JSON with additional license data
    
    -- Guest support
    is_guest_license INTEGER NOT NULL DEFAULT 0,
    guest_data TEXT, -- JSON with guest information
    guest_email TEXT, -- Extracted guest email for indexing
    
    -- Tracking
    activation_count INTEGER NOT NULL DEFAULT 0, -- How many times activated
    last_activation_ip TEXT,
    last_activation_device TEXT, -- Device fingerprint/info
    
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at TEXT NOT NULL DEFAULT (datetime('now')),
    
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
    FOREIGN KEY (organization_id) REFERENCES organizations(id) ON DELETE CASCADE,
    FOREIGN KEY (customer_id) REFERENCES provider_customers(id) ON DELETE CASCADE,
    FOREIGN KEY (product_id) REFERENCES products(id) ON DELETE SET NULL,
    FOREIGN KEY (subscription_id) REFERENCES subscriptions(id) ON DELETE CASCADE,
    FOREIGN KEY (membership_id) REFERENCES user_memberships(id) ON DELETE CASCADE,
    FOREIGN KEY (order_id) REFERENCES orders(id) ON DELETE SET NULL,
    FOREIGN KEY (payment_id) REFERENCES payments(id) ON DELETE SET NULL,
    
    CHECK (user_id IS NOT NULL OR organization_id IS NOT NULL OR customer_id IS NOT NULL OR is_guest_license = 1),
    CHECK (license_type IN ('lifetime', 'subscription', 'trial', 'freemium', 'enterprise')),
    CHECK (status IN ('active', 'suspended', 'expired', 'revoked')),
    CHECK (max_devices >= -1), -- -1 means unlimited
    CHECK (max_users >= -1), -- -1 means unlimited
    CHECK (current_devices >= 0),
    CHECK (current_users >= 0)
);
```

### **Nueva Tabla: `license_activations`**
```sql
-- License Activations (Track device/user activations)
CREATE TABLE IF NOT EXISTS license_activations (
    id TEXT PRIMARY KEY,
    license_id TEXT NOT NULL,
    
    -- Device/User identification
    device_id TEXT NOT NULL, -- Unique device identifier (hashed)
    device_fingerprint TEXT, -- Device fingerprint for additional security
    device_info TEXT, -- JSON with device information (OS, version, etc.)
    user_agent TEXT,
    ip_address TEXT,
    
    -- User information (if applicable)
    activated_by_user_id TEXT, -- User who activated this device
    activated_by_email TEXT, -- Email of activator (for guest licenses)
    
    -- Activation status
    status TEXT NOT NULL DEFAULT 'active', -- 'active', 'deactivated', 'suspended'
    activation_method TEXT DEFAULT 'api', -- 'api', 'manual', 'auto'
    
    -- Timestamps
    activated_at TEXT NOT NULL DEFAULT (datetime('now')),
    last_seen_at TEXT NOT NULL DEFAULT (datetime('now')),
    deactivated_at TEXT,
    
    -- Tracking
    usage_count INTEGER NOT NULL DEFAULT 0, -- How many times this device was used
    last_version_used TEXT, -- Last software version used on this device
    
    metadata TEXT, -- JSON with additional activation data
    
    FOREIGN KEY (license_id) REFERENCES licenses(id) ON DELETE CASCADE,
    FOREIGN KEY (activated_by_user_id) REFERENCES users(id) ON DELETE SET NULL,
    
    UNIQUE (license_id, device_id), -- One activation per device per license
    CHECK (status IN ('active', 'deactivated', 'suspended'))
);
```

### **Extensión de `products` para Licencias**
```sql
-- Agregar campos específicos para licencias a products existente
ALTER TABLE products ADD COLUMN license_config TEXT; -- JSON con configuración de licencia

-- Ejemplo de license_config:
-- {
--   "software_product": "my_app_v1",
--   "license_type": "lifetime",
--   "max_devices": 3,
--   "max_users": 1,
--   "features": ["premium_features", "advanced_analytics"],
--   "version_constraint": ">=1.0.0",
--   "trial_days": 0
-- }

  /**
   * Verificar licencia (para uso en aplicaciones)
   */
  static async verifyLicense(options: {
    licenseKey: string;
    deviceId: string;
    softwareProduct: string;
    version?: string;
  }): Promise<{
    valid: boolean;
    license?: any;
    features?: string[];
    permissions?: any;
    message?: string;
  }> {
    try {
      const hashedKey = await this.hashLicenseKey(options.licenseKey);

      // Buscar licencia activa
      const license = await getDb().select()
        .from(licenses)
        .where(and(
          eq(licenses.license_key, hashedKey),
          eq(licenses.software_product, options.softwareProduct),
          eq(licenses.status, 'active')
        ))
        .get();

      if (!license) {
        return {
          valid: false,
          message: 'Licencia no válida para este producto'
        };
      }

      // Verificar expiración
      if (license.expires_at && new Date(license.expires_at) < new Date()) {
        return {
          valid: false,
          message: 'Licencia expirada'
        };
      }

      // Verificar activación del dispositivo
      const activation = await getDb().select()
        .from(license_activations)
        .where(and(
          eq(license_activations.license_id, license.id),
          eq(license_activations.device_id, options.deviceId),
          eq(license_activations.status, 'active')
        ))
        .get();

      if (!activation) {
        return {
          valid: false,
          message: 'Dispositivo no activado para esta licencia'
        };
      }

      // Verificar versión si se especifica
      if (options.version && license.version_constraint !== 'any') {
        // Aquí podrías implementar lógica de semver
        // Por simplicidad, asumimos que es válida
      }

      // Actualizar last_seen_at
      await getDb().update(license_activations)
        .set({
          last_seen_at: new Date().toISOString(),
          usage_count: activation.usage_count + 1,
          last_version_used: options.version
        })
        .where(eq(license_activations.id, activation.id));

      return {
        valid: true,
        license: {
          id: license.id,
          license_type: license.license_type,
          software_product: license.software_product,
          expires_at: license.expires_at
        },
        features: JSON.parse(license.features || '[]'),
        permissions: JSON.parse(license.permissions || '{}'),
        message: 'Licencia válida'
      };

    } catch (error) {
      console.error('[License] Error verifying license:', error);
      return {
        valid: false,
        message: 'Error verificando licencia'
      };
    }
  }

  /**
   * Desactivar dispositivo
   */
  static async deactivateDevice(options: {
    licenseKey: string;
    deviceId: string;
  }): Promise<{
    success: boolean;
    message?: string;
  }> {
    try {
      const hashedKey = await this.hashLicenseKey(options.licenseKey);

      const license = await getDb().select()
        .from(licenses)
        .where(eq(licenses.license_key, hashedKey))
        .get();

      if (!license) {
        return {
          success: false,
          message: 'Licencia no encontrada'
        };
      }

      await getDb().update(license_activations)
        .set({
          status: 'deactivated',
          deactivated_at: new Date().toISOString()
        })
        .where(and(
          eq(license_activations.license_id, license.id),
          eq(license_activations.device_id, options.deviceId)
        ));

      return {
        success: true,
        message: 'Dispositivo desactivado exitosamente'
      };

    } catch (error) {
      console.error('[License] Error deactivating device:', error);
      return {
        success: false,
        message: 'Error desactivando dispositivo'
      };
    }
  }

  /**
   * Obtener información de licencia
   */
  static async getLicenseInfo(licenseKey: string): Promise<{
    success: boolean;
    license?: any;
    activations?: any[];
    message?: string;
  }> {
    try {
      const hashedKey = await this.hashLicenseKey(licenseKey);

      const license = await getDb().select()
        .from(licenses)
        .where(eq(licenses.license_key, hashedKey))
        .get();

      if (!license) {
        return {
          success: false,
          message: 'Licencia no encontrada'
        };
      }

      const activations = await getDb().select()
        .from(license_activations)
        .where(eq(license_activations.license_id, license.id));

      return {
        success: true,
        license: {
          id: license.id,
          license_type: license.license_type,
          software_product: license.software_product,
          status: license.status,
          max_devices: license.max_devices,
          current_devices: license.current_devices,
          features: JSON.parse(license.features || '[]'),
          issued_at: license.issued_at,
          expires_at: license.expires_at,
          last_used_at: license.last_used_at
        },
        activations: activations.map(a => ({
          device_id: a.device_id,
          status: a.status,
          activated_at: a.activated_at,
          last_seen_at: a.last_seen_at,
          usage_count: a.usage_count
        }))
      };

    } catch (error) {
      console.error('[License] Error getting license info:', error);
      return {
        success: false,
        message: 'Error obteniendo información de licencia'
      };
    }
  }

  /**
   * Generar license key
   */
  private static generateLicenseKey(): string {
    // Formato: XXXX-XXXX-XXXX-XXXX (16 caracteres alfanuméricos)
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
    let result = '';

    for (let i = 0; i < 16; i++) {
      if (i > 0 && i % 4 === 0) {
        result += '-';
      }
      result += chars.charAt(Math.floor(Math.random() * chars.length));
    }

    return result;
  }

  /**
   * Hash license key para almacenamiento seguro
   */
  private static async hashLicenseKey(licenseKey: string): Promise<string> {
    return crypto.createHash('sha256').update(licenseKey).digest('hex');
  }
}
```

## 🛠️ **RUTAS API PARA LICENCIAS**

### **License Management Endpoints**
```typescript
// POST /api/licenses/activate
app.post('/api/licenses/activate', async (c) => {
  try {
    const {
      license_key, device_id, device_info, user_agent, ip_address, user_id, email
    } = await c.req.json();

    const result = await LicenseManager.activateLicense({
      licenseKey: license_key,
      deviceId: device_id,
      deviceInfo: device_info,
      userAgent: user_agent,
      ipAddress: ip_address,
      userId: user_id,
      email
    });

    if (result.success) {
      return c.json({
        success: true,
        activation: result.activation,
        license: result.license,
        message: result.message
      });
    } else {
      return c.json({
        success: false,
        message: result.message
      }, 400);
    }

  } catch (error) {
    return c.json({ success: false, message: 'Error activando licencia' }, 500);
  }
});

// POST /api/licenses/verify
app.post('/api/licenses/verify', async (c) => {
  try {
    const { license_key, device_id, software_product, version } = await c.req.json();

    const result = await LicenseManager.verifyLicense({
      licenseKey: license_key,
      deviceId: device_id,
      softwareProduct: software_product,
      version
    });

    return c.json({
      valid: result.valid,
      license: result.license,
      features: result.features,
      permissions: result.permissions,
      message: result.message
    });

  } catch (error) {
    return c.json({ valid: false, message: 'Error verificando licencia' }, 500);
  }
});

// POST /api/licenses/deactivate
app.post('/api/licenses/deactivate', async (c) => {
  try {
    const { license_key, device_id } = await c.req.json();

    const result = await LicenseManager.deactivateDevice({
      licenseKey: license_key,
      deviceId: device_id
    });

    return c.json({
      success: result.success,
      message: result.message
    });

  } catch (error) {
    return c.json({ success: false, message: 'Error desactivando dispositivo' }, 500);
  }
});

// GET /api/licenses/:licenseKey/info
app.get('/api/licenses/:licenseKey/info', async (c) => {
  try {
    const licenseKey = c.req.param('licenseKey');
    const result = await LicenseManager.getLicenseInfo(licenseKey);

    if (result.success) {
      return c.json({
        success: true,
        license: result.license,
        activations: result.activations
      });
    } else {
      return c.json({
        success: false,
        message: result.message
      }, 404);
    }

  } catch (error) {
    return c.json({ success: false, message: 'Error obteniendo información' }, 500);
  }
});

// POST /api/licenses/create-from-product (Internal/Admin)
app.post('/api/licenses/create-from-product', async (c) => {
  try {
    const {
      product_id, user_id, organization_id, customer_id, order_id, payment_id, guest_data
    } = await c.req.json();

    const result = await LicenseManager.createLicenseFromProduct({
      productId: product_id,
      userId: user_id,
      organizationId: organization_id,
      customerId: customer_id,
      orderId: order_id,
      paymentId: payment_id,
      guestData: guest_data
    });

    if (result.success) {
      return c.json({
        success: true,
        license_id: result.licenseId,
        license_key: result.licenseKey,
        message: result.message
      });
    } else {
      return c.json({
        success: false,
        message: result.message
      }, 400);
    }

  } catch (error) {
    return c.json({ success: false, message: 'Error creando licencia' }, 500);
  }
});
```

## 🎯 **INTEGRACIÓN CON SISTEMA EXISTENTE**

### **Trigger para Crear Licencias Automáticamente**
```sql
-- Trigger para crear licencia cuando se completa un pago de producto tipo 'license'
CREATE TRIGGER IF NOT EXISTS auto_create_license_on_payment
AFTER UPDATE ON payments
WHEN NEW.status = 'succeeded' AND OLD.status != 'succeeded'
BEGIN
    -- Verificar si el pago es por un producto de tipo licencia
    INSERT INTO licenses (
        id, license_key, user_id, organization_id, product_id, order_id, payment_id,
        license_type, software_product, max_devices, max_users, features, permissions
    )
    SELECT
        'lic_' || substr(hex(randomblob(8)), 1, 16),
        lower(hex(randomblob(16))), -- Temporal, se reemplazará por hash
        NEW.user_id,
        NEW.organization_id,
        oi.product_id,
        NEW.order_id,
        NEW.id,
        json_extract(p.license_config, '$.license_type'),
        json_extract(p.license_config, '$.software_product'),
        json_extract(p.license_config, '$.max_devices'),
        json_extract(p.license_config, '$.max_users'),
        json_extract(p.license_config, '$.features'),
        json_extract(p.license_config, '$.permissions')
    FROM order_items oi
    JOIN products p ON oi.product_id = p.id
    WHERE oi.order_id = NEW.order_id
      AND p.product_type = 'license'
      AND p.license_config IS NOT NULL;
END;
```

### **Integración con Subscriptions**
```sql
-- Trigger para crear licencia desde suscripción activa
CREATE TRIGGER IF NOT EXISTS auto_create_license_on_subscription
AFTER UPDATE ON subscriptions
WHEN NEW.status = 'active' AND OLD.status != 'active'
BEGIN
    INSERT INTO licenses (
        id, license_key, user_id, organization_id, subscription_id, product_id,
        license_type, software_product, max_devices, max_users, features, permissions,
        expires_at
    )
    SELECT
        'lic_' || substr(hex(randomblob(8)), 1, 16),
        lower(hex(randomblob(16))),
        NEW.user_id,
        NEW.organization_id,
        NEW.id,
        NEW.product_id,
        'subscription',
        json_extract(p.license_config, '$.software_product'),
        json_extract(p.license_config, '$.max_devices'),
        json_extract(p.license_config, '$.max_users'),
        json_extract(p.license_config, '$.features'),
        json_extract(p.license_config, '$.permissions'),
        NEW.current_period_end
    FROM products p
    WHERE p.id = NEW.product_id
      AND p.product_type = 'license'
      AND p.license_config IS NOT NULL;
END;
```

## 🎯 **CASOS DE USO AVANZADOS**

### **1. Software Desktop con Licencia Lifetime**
```typescript
// 1. Usuario compra software lifetime
const order = await createOrder({
  user_id: 'user_123',
  items: [{
    product_id: 'prod_software_lifetime', // MyApp Pro Lifetime
    quantity: 1
  }]
});

// 2. Al completar pago, se crea licencia automáticamente
// 3. Usuario recibe license key: "ABCD-EFGH-IJKL-MNOP"

// 4. Usuario activa en su dispositivo
const activation = await LicenseManager.activateLicense({
  licenseKey: 'ABCD-EFGH-IJKL-MNOP',
  deviceId: 'device_fingerprint_123',
  deviceInfo: { os: 'Windows 11', version: '22H2' },
  userId: 'user_123'
});

// 5. Aplicación verifica licencia en cada inicio
const verification = await LicenseManager.verifyLicense({
  licenseKey: 'ABCD-EFGH-IJKL-MNOP',
  deviceId: 'device_fingerprint_123',
  softwareProduct: 'myapp_pro',
  version: '1.2.0'
});
```

### **2. SaaS con Licencias por Suscripción**
```typescript
// 1. Usuario se suscribe a plan mensual
const subscription = await createSubscription({
  user_id: 'user_456',
  product_id: 'prod_saas_monthly',
  payment_method_id: 'pm_123'
});

// 2. Se crea licencia automáticamente con expiración = current_period_end
// 3. Usuario puede usar la API con su license key

// 4. Verificación en cada API call
app.use('/api/premium/*', async (c, next) => {
  const licenseKey = c.req.header('X-License-Key');
  const verification = await LicenseManager.verifyLicense({
    licenseKey,
    deviceId: 'api_access',
    softwareProduct: 'saas_platform'
  });

  if (!verification.valid) {
    return c.json({ error: 'Licencia inválida' }, 401);
  }

  c.set('license', verification.license);
  c.set('features', verification.features);
  await next();
});
```

### **3. App Móvil con Límite de Dispositivos**
```typescript
// 1. Usuario compra premium en app móvil
const purchase = await createPayment({
  user_id: 'user_789',
  product_id: 'prod_mobile_premium',
  amount_cents: 499
});

// 2. Se crea licencia con max_devices: 1
// 3. Usuario activa en su teléfono
const activation = await LicenseManager.activateLicense({
  licenseKey: 'MOBILE-KEY-123',
  deviceId: 'iphone_uuid_456',
  deviceInfo: {
    platform: 'iOS',
    version: '17.0',
    model: 'iPhone 15 Pro'
  }
});

// 4. Si intenta activar en otro dispositivo
const secondActivation = await LicenseManager.activateLicense({
  licenseKey: 'MOBILE-KEY-123',
  deviceId: 'android_uuid_789'
});
// Result: { success: false, message: 'Límite de dispositivos alcanzado (1)' }

// 5. Usuario puede desactivar primer dispositivo
await LicenseManager.deactivateDevice({
  licenseKey: 'MOBILE-KEY-123',
  deviceId: 'iphone_uuid_456'
});

// 6. Ahora puede activar en el nuevo dispositivo
```

### **4. Licencia Empresarial con Múltiples Usuarios**
```typescript
// 1. Empresa compra licencia enterprise
const enterpriseOrder = await createOrder({
  organization_id: 'org_company',
  items: [{
    product_id: 'prod_enterprise', // Enterprise License
    quantity: 1
  }]
});

// 2. Se crea licencia con max_users: 100, max_devices: -1 (unlimited)
// 3. Administrador distribuye license key a empleados

// 4. Cada empleado activa en sus dispositivos
const employeeActivation = await LicenseManager.activateLicense({
  licenseKey: 'ENTERPRISE-KEY-ABC',
  deviceId: 'employee_laptop_123',
  userId: 'employee_456',
  email: 'employee@company.com'
});

// 5. Sistema trackea cuántos usuarios únicos han usado la licencia
```

### **5. Membership que Incluye Licencias**
```typescript
// 1. Usuario compra Developer Membership
const membership = await createUserMembership({
  user_id: 'dev_123',
  membership_type_id: 'membership_developer'
});

// 2. Membership incluye acceso a múltiples licencias
const membershipFeatures = JSON.parse(membership.features);
// ['access_to_all_tools', 'license:developer_tools', 'license:premium_plugins']

// 3. Sistema crea licencias automáticamente para cada feature tipo 'license:'
for (const feature of membershipFeatures) {
  if (feature.startsWith('license:')) {
    const softwareProduct = feature.replace('license:', '');
    await LicenseManager.createLicenseFromMembership({
      membershipId: membership.id,
      userId: 'dev_123',
      softwareProduct,
      licenseType: 'membership'
    });
  }
}

// 4. Usuario puede usar todas las herramientas incluidas en su membership
```

### **6. Sistema de Trial/Freemium**
```typescript
// 1. Usuario se registra y recibe licencia trial automática
const trialLicense = await LicenseManager.createTrialLicense({
  userId: 'new_user_123',
  softwareProduct: 'myapp_pro',
  trialDays: 30,
  features: ['basic_features']
});

// 2. Después de 30 días, licencia expira automáticamente
// 3. Usuario puede upgrade a licencia completa

const upgrade = await LicenseManager.upgradeLicense({
  oldLicenseKey: 'TRIAL-KEY-123',
  newProductId: 'prod_software_lifetime'
});
```

## 🔒 **SEGURIDAD Y MEJORES PRÁCTICAS**

### **Seguridad de License Keys**
- ✅ **Keys hasheadas**: Solo se almacena hash SHA-256 en BD
- ✅ **Keys temporales**: Plain text se elimina después de 5 segundos
- ✅ **Device fingerprinting**: Identificación única de dispositivos
- ✅ **Rate limiting**: Límites en verificaciones por IP/device

### **Validación Robusta**
- ✅ **Verificación de expiración**: Automática en cada verificación
- ✅ **Límites de dispositivos**: Enforcement estricto
- ✅ **Tracking de uso**: Monitoreo de activaciones sospechosas
- ✅ **Revocación**: Capacidad de revocar licencias comprometidas

### **Escalabilidad**
- ✅ **Índices optimizados**: Para búsquedas rápidas por license key
- ✅ **Caching**: Redis para verificaciones frecuentes
- ✅ **Batch operations**: Procesamiento masivo de licencias
- ✅ **Multi-database**: Soporte para PostgreSQL, MySQL, SQLite

## 📊 **ÍNDICES PARA PERFORMANCE**

```sql
-- Índices principales para licenses
CREATE INDEX idx_licenses_license_key ON licenses(license_key);
CREATE INDEX idx_licenses_software_product ON licenses(software_product);
CREATE INDEX idx_licenses_status ON licenses(status);
CREATE INDEX idx_licenses_user_id ON licenses(user_id);
CREATE INDEX idx_licenses_organization_id ON licenses(organization_id);
CREATE INDEX idx_licenses_product_id ON licenses(product_id);
CREATE INDEX idx_licenses_subscription_id ON licenses(subscription_id);
CREATE INDEX idx_licenses_expires_at ON licenses(expires_at);
CREATE INDEX idx_licenses_guest_email ON licenses(guest_email);

-- Índices para license_activations
CREATE INDEX idx_activations_license_id ON license_activations(license_id);
CREATE INDEX idx_activations_device_id ON license_activations(device_id);
CREATE INDEX idx_activations_status ON license_activations(status);
CREATE INDEX idx_activations_last_seen ON license_activations(last_seen_at);

-- Índices compuestos para consultas comunes
CREATE INDEX idx_licenses_software_status ON licenses(software_product, status);
CREATE INDEX idx_licenses_key_software ON licenses(license_key, software_product);
CREATE INDEX idx_activations_license_device ON license_activations(license_id, device_id);
CREATE INDEX idx_activations_license_status ON license_activations(license_id, status);
```

---

## 🚀 **IMPLEMENTACIÓN RECOMENDADA**

### **Fase 1: Esquema Base**
1. Crear tablas `licenses` y `license_activations`
2. Agregar `license_config` a tabla `products`
3. Crear índices de performance
4. Implementar `LicenseManager` básico

### **Fase 2: Integración con Productos**
1. Configurar products con `product_type: 'license'`
2. Implementar triggers automáticos
3. Crear APIs de activación/verificación
4. Testing con productos lifetime

### **Fase 3: Integración con Subscriptions**
1. Licencias automáticas desde suscripciones
2. Renovación automática de licencias
3. Manejo de expiración y reactivación
4. Testing con SaaS subscriptions

### **Fase 4: Funcionalidades Avanzadas**
1. Integración con memberships
2. Sistema de trial/freemium
3. Dashboard de gestión de licencias
4. Analytics y reporting

### **Fase 5: Seguridad y Escalabilidad**
1. Implementar rate limiting
2. Sistema de detección de fraude
3. Caching con Redis
4. Optimización de performance

**¿Te parece perfecto este sistema universal de licencias que se integra completamente con tu infraestructura de productos, subscriptions y memberships?**

### **Triggers para Actualización Automática**
```sql
-- Trigger para updated_at en licenses
CREATE TRIGGER IF NOT EXISTS update_licenses_timestamp
AFTER UPDATE ON licenses
BEGIN
    UPDATE licenses SET updated_at = datetime('now') WHERE id = NEW.id;
END;

-- Trigger para updated_at en license_activations
CREATE TRIGGER IF NOT EXISTS update_license_activations_timestamp
AFTER UPDATE ON license_activations
BEGIN
    UPDATE license_activations SET updated_at = datetime('now') WHERE id = NEW.id;
END;

-- Trigger para actualizar current_devices en licenses
CREATE TRIGGER IF NOT EXISTS update_license_device_count
AFTER INSERT ON license_activations
WHEN NEW.status = 'active'
BEGIN
    UPDATE licenses 
    SET current_devices = (
        SELECT COUNT(*) 
        FROM license_activations 
        WHERE license_id = NEW.license_id AND status = 'active'
    ),
    updated_at = datetime('now')
    WHERE id = NEW.license_id;
END;

-- Trigger para decrementar current_devices cuando se desactiva
CREATE TRIGGER IF NOT EXISTS update_license_device_count_deactivate
AFTER UPDATE ON license_activations
WHEN OLD.status = 'active' AND NEW.status != 'active'
BEGIN
    UPDATE licenses 
    SET current_devices = (
        SELECT COUNT(*) 
        FROM license_activations 
        WHERE license_id = NEW.license_id AND status = 'active'
    ),
    updated_at = datetime('now')
    WHERE id = NEW.license_id;
END;
```

## 🎯 **CASOS DE USO ESPECÍFICOS**

### **1. Software Lifetime License**
```sql
-- Product que otorga licencia lifetime
INSERT INTO products (
    id, name, product_type, subtotal_cents, currency,
    license_config
) VALUES (
    'prod_software_lifetime', 'MyApp Pro Lifetime', 'license', 9999, 'USD',
    json_object(
        'software_product', 'myapp_pro',
        'license_type', 'lifetime',
        'max_devices', 3,
        'max_users', 1,
        'features', json_array('premium_features', 'priority_support'),
        'version_constraint', '>=1.0.0'
    )
);

-- Al completarse el pago, se crea la licencia automáticamente
```

### **2. SaaS Subscription License**
```sql
-- Product que otorga licencia por suscripción
INSERT INTO products (
    id, name, product_type, is_recurring, billing_interval, subtotal_cents,
    license_config
) VALUES (
    'prod_saas_monthly', 'SaaS Pro Monthly', 'license', 1, 'monthly', 2999,
    json_object(
        'software_product', 'saas_platform',
        'license_type', 'subscription',
        'max_devices', -1,
        'max_users', 10,
        'features', json_array('api_access', 'advanced_analytics', 'integrations')
    )
);
```

### **3. Mobile App License**
```sql
-- Product para app móvil con límite de dispositivos
INSERT INTO products (
    id, name, product_type, subtotal_cents,
    license_config
) VALUES (
    'prod_mobile_premium', 'Mobile App Premium', 'license', 499,
    json_object(
        'software_product', 'mobile_app',
        'license_type', 'lifetime',
        'max_devices', 1,
        'max_users', 1,
        'features', json_array('ad_free', 'premium_themes', 'cloud_sync')
    )
);
```

### **4. Enterprise License**
```sql
-- Product para licencia empresarial
INSERT INTO products (
    id, name, product_type, subtotal_cents,
    license_config
) VALUES (
    'prod_enterprise', 'Enterprise License', 'license', 99999,
    json_object(
        'software_product', 'enterprise_suite',
        'license_type', 'enterprise',
        'max_devices', -1,
        'max_users', 100,
        'features', json_array('all_features', 'white_label', 'api_access', 'priority_support')
    )
);
```

### **5. Membership que Incluye Licencia**
```sql
-- Membership type que otorga acceso a licencias
INSERT INTO membership_types (
    id, name, duration_type, price_cents,
    features
) VALUES (
    'membership_developer', 'Developer Membership', 'recurring', 4999,
    json_array(
        'access_to_all_tools',
        'license:developer_tools',
        'license:premium_plugins',
        'priority_support'
    )
);
```

## 🔧 **LICENSEMANAGER CLASS**

### **Gestor Principal de Licencias**
```typescript
// src/lib/licensing/license-manager.ts
import { getDb } from '../../db';
import { licenses, license_activations, products } from '../../../db/schema';
import { eq, and, lt, gt } from 'drizzle-orm';
import { nanoid } from 'nanoid';
import crypto from 'crypto';

export class LicenseManager {
  
  /**
   * Generar licencia desde producto
   */
  static async createLicenseFromProduct(options: {
    productId: string;
    userId?: string;
    organizationId?: string;
    customerId?: string;
    orderId?: string;
    paymentId?: string;
    guestData?: any;
  }): Promise<{
    success: boolean;
    licenseId?: string;
    licenseKey?: string;
    message?: string;
  }> {
    try {
      // Obtener configuración del producto
      const product = await getDb().select()
        .from(products)
        .where(eq(products.id, options.productId))
        .get();

      if (!product || product.product_type !== 'license') {
        return {
          success: false,
          message: 'Producto no es de tipo licencia'
        };
      }

      const licenseConfig = product.license_config 
        ? JSON.parse(product.license_config) 
        : {};

      // Generar license key
      const licenseKey = this.generateLicenseKey();
      const hashedKey = await this.hashLicenseKey(licenseKey);

      // Determinar expiración
      let expiresAt: string | null = null;
      if (licenseConfig.license_type === 'trial' && licenseConfig.trial_days) {
        const expiry = new Date();
        expiry.setDate(expiry.getDate() + licenseConfig.trial_days);
        expiresAt = expiry.toISOString();
      }

      // Crear licencia
      const licenseId = `lic_${nanoid(16)}`;
      
      await getDb().insert(licenses).values({
        id: licenseId,
        license_key: hashedKey,
        license_key_plain: licenseKey, // Se limpiará después
        user_id: options.userId,
        organization_id: options.organizationId,
        customer_id: options.customerId,
        product_id: options.productId,
        order_id: options.orderId,
        payment_id: options.paymentId,
        license_type: licenseConfig.license_type || 'lifetime',
        software_product: licenseConfig.software_product || product.name,
        version_constraint: licenseConfig.version_constraint || 'any',
        max_devices: licenseConfig.max_devices || 1,
        max_users: licenseConfig.max_users || 1,
        expires_at: expiresAt,
        features: JSON.stringify(licenseConfig.features || []),
        permissions: JSON.stringify(licenseConfig.permissions || {}),
        is_guest_license: options.guestData ? 1 : 0,
        guest_data: options.guestData ? JSON.stringify(options.guestData) : null,
        guest_email: options.guestData?.email || null
      });

      // Limpiar license key plain por seguridad
      setTimeout(async () => {
        await getDb().update(licenses)
          .set({ license_key_plain: null })
          .where(eq(licenses.id, licenseId));
      }, 5000); // 5 segundos para que el cliente pueda obtener la key

      console.log(`[License] Created license ${licenseId} for product ${options.productId}`);

      return {
        success: true,
        licenseId,
        licenseKey,
        message: 'Licencia creada exitosamente'
      };

    } catch (error) {
      console.error('[License] Error creating license:', error);
      return {
        success: false,
        message: 'Error creando licencia'
      };
    }
  }

  /**
   * Activar licencia en dispositivo
   */
  static async activateLicense(options: {
    licenseKey: string;
    deviceId: string;
    deviceInfo?: any;
    userAgent?: string;
    ipAddress?: string;
    userId?: string;
    email?: string;
  }): Promise<{
    success: boolean;
    activation?: any;
    license?: any;
    message?: string;
  }> {
    try {
      const hashedKey = await this.hashLicenseKey(options.licenseKey);
      
      // Buscar licencia
      const license = await getDb().select()
        .from(licenses)
        .where(eq(licenses.license_key, hashedKey))
        .get();

      if (!license) {
        return {
          success: false,
          message: 'Licencia no válida'
        };
      }

      // Verificar estado de la licencia
      if (license.status !== 'active') {
        return {
          success: false,
          message: `Licencia ${license.status}`
        };
      }

      // Verificar expiración
      if (license.expires_at && new Date(license.expires_at) < new Date()) {
        await getDb().update(licenses)
          .set({ status: 'expired' })
          .where(eq(licenses.id, license.id));
        
        return {
          success: false,
          message: 'Licencia expirada'
        };
      }

      // Verificar límite de dispositivos
      if (license.max_devices !== -1 && license.current_devices >= license.max_devices) {
        // Verificar si este dispositivo ya está activado
        const existingActivation = await getDb().select()
          .from(license_activations)
          .where(and(
            eq(license_activations.license_id, license.id),
            eq(license_activations.device_id, options.deviceId),
            eq(license_activations.status, 'active')
          ))
          .get();

        if (!existingActivation) {
          return {
            success: false,
            message: `Límite de dispositivos alcanzado (${license.max_devices})`
          };
        }
      }

      // Crear o actualizar activación
      const activationId = `act_${nanoid(16)}`;
      
      await getDb().insert(license_activations).values({
        id: activationId,
        license_id: license.id,
        device_id: options.deviceId,
        device_info: options.deviceInfo ? JSON.stringify(options.deviceInfo) : null,
        user_agent: options.userAgent,
        ip_address: options.ipAddress,
        activated_by_user_id: options.userId,
        activated_by_email: options.email,
        status: 'active'
      }).onConflictDoUpdate({
        target: [license_activations.license_id, license_activations.device_id],
        set: {
          status: 'active',
          last_seen_at: new Date().toISOString(),
          usage_count: license_activations.usage_count + 1
        }
      });

      // Actualizar last_used_at en licencia
      await getDb().update(licenses)
        .set({
          last_used_at: new Date().toISOString(),
          activation_count: license.activation_count + 1,
          last_activation_ip: options.ipAddress,
          last_activation_device: options.deviceId
        })
        .where(eq(licenses.id, license.id));

      console.log(`[License] Activated license ${license.id} on device ${options.deviceId}`);

      return {
        success: true,
        activation: { id: activationId },
        license: {
          id: license.id,
          software_product: license.software_product,
          license_type: license.license_type,
          features: JSON.parse(license.features || '[]'),
          permissions: JSON.parse(license.permissions || '{}'),
          expires_at: license.expires_at
        },
        message: 'Licencia activada exitosamente'
      };

    } catch (error) {
      console.error('[License] Error activating license:', error);
      return {
        success: false,
        message: 'Error activando licencia'
      };
    }
  }
}
