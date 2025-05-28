# Guía de Migración - Sistema Centralizado de Monedas

## 🎯 Objetivo de la Migración

Migrar del sistema actual de monedas distribuido a un sistema centralizado que soporte **100+ monedas** con enfoque en **Latinoamérica** y **DOP**.

## 📊 Estado Actual vs Estado Objetivo

### **Estado Actual**
```typescript
// En StripeAdapter
supported_currencies: [
  'USD', 'EUR', 'GBP', 'CAD', 'AUD', 'JPY', 'CHF', 'SEK', 'NOK', 'DKK',
  'PLN', 'CZK', 'HUF', 'BGN', 'RON', 'HRK', 'ISK', 'MXN', 'BRL', 'SGD',
  // ... lista hardcodeada
]

// Validación manual en cada adaptador
if (!this.supportedCurrencies.includes(currency)) {
  throw new Error('Currency not supported');
}
```

### **Estado Objetivo**
```typescript
// Sistema centralizado
supported_currencies: CurrencySystem.getProviderCurrencyCodes('stripe')

// Validación inteligente
CurrencySystem.validateCurrency(currency, 'stripe')
```

## 🚀 Plan de Migración por Fases

### **Fase 1: Preparación (Sin Breaking Changes)**

#### 1.1 Crear Sistema Base
```bash
# Crear archivos del sistema
mkdir src/lib/currencies
touch src/lib/currencies/currency-system.ts
touch src/lib/currencies/currency-data.ts
touch src/lib/currencies/index.ts
```

#### 1.2 Implementar Base de Datos de Monedas
```typescript
// src/lib/currencies/currency-data.ts
export const LATIN_AMERICAN_CURRENCIES = {
  DOP: {
    code: 'DOP',
    name: 'Peso Dominicano',
    symbol: 'RD$',
    decimal_places: 2,
    region: 'Latin America',
    country: 'Dominican Republic',
    stripe_supported: true,
    paypal_supported: false,
    minimum_amount_cents: 2500 // RD$25.00
  },
  // ... más monedas
};
```

#### 1.3 Testing del Sistema Nuevo
```typescript
// tests/currency-system.test.ts
describe('CurrencySystem', () => {
  test('should support DOP for Stripe', () => {
    expect(CurrencySystem.isCurrencySupported('DOP', 'stripe')).toBe(true);
  });
  
  test('should format DOP correctly', () => {
    expect(CurrencySystem.formatAmount(2500, 'DOP')).toBe('RD$25.00');
  });
});
```

### **Fase 2: Integración Gradual**

#### 2.1 Actualizar PaymentAdapter Base
```typescript
// src/lib/providers/base/payment-adapter.ts
import { CurrencySystem } from '@/lib/currencies';

abstract class PaymentAdapter {
  // Nuevo método que usa sistema centralizado
  protected validateCurrencyNew(currency: string): void {
    if (!CurrencySystem.isCurrencySupported(currency, this.providerId)) {
      const info = CurrencySystem.getCurrencyInfo(currency);
      throw new Error(`${info?.name || currency} not supported by ${this.providerId}`);
    }
  }
  
  // Mantener método actual para compatibilidad
  protected validateCurrency(currency: string): void {
    // Usar nuevo sistema si está disponible, sino usar actual
    if (process.env.USE_CENTRALIZED_CURRENCIES === 'true') {
      return this.validateCurrencyNew(currency);
    }
    
    // Lógica actual como fallback
    if (!this.supportsCurrency(currency)) {
      throw new Error(`Currency ${currency} is not supported by ${this.config.provider_id}`);
    }
  }
}
```

#### 2.2 Actualizar StripeAdapter Gradualmente
```typescript
// src/lib/providers/stripe/stripe-adapter.ts
export class StripeAdapter extends PaymentAdapter {
  getCapabilities(): PaymentAdapterCapabilities {
    return {
      // ... otras propiedades
      supported_currencies: this.getSupportedCurrencies(),
      // ... resto
    };
  }
  
  private getSupportedCurrencies(): string[] {
    // Usar sistema nuevo si está habilitado
    if (process.env.USE_CENTRALIZED_CURRENCIES === 'true') {
      return CurrencySystem.getProviderCurrencyCodes('stripe');
    }
    
    // Fallback a lista actual
    return [
      'USD', 'EUR', 'GBP', 'CAD', 'AUD', 'JPY', 'CHF', 'SEK', 'NOK', 'DKK',
      'PLN', 'CZK', 'HUF', 'BGN', 'RON', 'HRK', 'ISK', 'MXN', 'BRL', 'SGD',
      // ... lista actual
    ];
  }
}
```

### **Fase 3: Testing y Validación**

#### 3.1 Testing A/B
```typescript
// Configuración de feature flag
const USE_CENTRALIZED_CURRENCIES = process.env.USE_CENTRALIZED_CURRENCIES === 'true';

// Testing comparativo
describe('Currency Migration', () => {
  test('both systems should support same currencies', () => {
    const oldCurrencies = stripeAdapter.getCapabilities().supported_currencies;
    const newCurrencies = CurrencySystem.getProviderCurrencyCodes('stripe');
    
    // Verificar que el nuevo sistema incluye todas las monedas actuales
    oldCurrencies.forEach(currency => {
      expect(newCurrencies).toContain(currency);
    });
  });
  
  test('new system should support additional Latin American currencies', () => {
    const newCurrencies = CurrencySystem.getProviderCurrencyCodes('stripe');
    
    expect(newCurrencies).toContain('DOP'); // Peso Dominicano
    expect(newCurrencies).toContain('COP'); // Peso Colombiano
    expect(newCurrencies).toContain('PEN'); // Sol Peruano
  });
});
```

#### 3.2 Validación de Producción
```typescript
// Logging comparativo
const validateCurrencyMigration = (currency: string, provider: string) => {
  const oldResult = oldValidation(currency, provider);
  const newResult = CurrencySystem.isCurrencySupported(currency, provider);
  
  if (oldResult !== newResult) {
    console.warn(`Currency validation mismatch for ${currency}:`, {
      old: oldResult,
      new: newResult,
      provider
    });
  }
  
  return oldResult; // Usar resultado actual hasta completar migración
};
```

### **Fase 4: Migración Completa**

#### 4.1 Activar Sistema Nuevo
```bash
# Variables de entorno
USE_CENTRALIZED_CURRENCIES=true
CURRENCY_SYSTEM_VERSION=1.0.0
```

#### 4.2 Remover Código Legacy
```typescript
// Limpiar código antiguo después de validación exitosa
export class StripeAdapter extends PaymentAdapter {
  getCapabilities(): PaymentAdapterCapabilities {
    return {
      // ... otras propiedades
      supported_currencies: CurrencySystem.getProviderCurrencyCodes('stripe'),
      // ... resto
    };
  }
  
  // Remover método getSupportedCurrencies() legacy
}
```

## 🔧 Herramientas de Migración

### **Script de Validación**
```typescript
// scripts/validate-currency-migration.ts
import { CurrencySystem } from '../src/lib/currencies';
import { StripeAdapter } from '../src/lib/providers/stripe/stripe-adapter';

async function validateMigration() {
  console.log('🔍 Validating currency migration...');
  
  // Comparar listas de monedas
  const stripeAdapter = new StripeAdapter(config);
  const currentCurrencies = stripeAdapter.getCapabilities().supported_currencies;
  const newCurrencies = CurrencySystem.getProviderCurrencyCodes('stripe');
  
  console.log(`📊 Current: ${currentCurrencies.length} currencies`);
  console.log(`📊 New: ${newCurrencies.length} currencies`);
  
  // Verificar monedas faltantes
  const missing = currentCurrencies.filter(c => !newCurrencies.includes(c));
  const added = newCurrencies.filter(c => !currentCurrencies.includes(c));
  
  if (missing.length > 0) {
    console.warn('⚠️ Missing currencies in new system:', missing);
  }
  
  if (added.length > 0) {
    console.log('✅ New currencies added:', added);
  }
  
  // Validar monedas latinoamericanas
  const latinCurrencies = CurrencySystem.getLatinAmericanCurrencies();
  console.log(`🌎 Latin American currencies: ${latinCurrencies.length}`);
  
  latinCurrencies.forEach(currency => {
    const supported = CurrencySystem.isCurrencySupported(currency.code, 'stripe');
    console.log(`  ${currency.code} (${currency.name}): ${supported ? '✅' : '❌'}`);
  });
}

validateMigration().catch(console.error);
```

### **Monitoreo de Migración**
```typescript
// middleware/currency-migration-monitor.ts
export const currencyMigrationMonitor = (req: Request, res: Response, next: NextFunction) => {
  const currency = req.body.currency;
  
  if (currency) {
    // Log uso de monedas para análisis
    console.log('💰 Currency usage:', {
      currency,
      endpoint: req.path,
      timestamp: new Date().toISOString(),
      userAgent: req.headers['user-agent']
    });
    
    // Validar con ambos sistemas durante migración
    if (process.env.MIGRATION_VALIDATION === 'true') {
      const oldValid = oldCurrencyValidation(currency);
      const newValid = CurrencySystem.isCurrencySupported(currency, 'stripe');
      
      if (oldValid !== newValid) {
        console.warn('🚨 Currency validation mismatch:', {
          currency,
          old: oldValid,
          new: newValid
        });
      }
    }
  }
  
  next();
};
```

## 📋 Checklist de Migración

### **Pre-Migración**
- [ ] Crear sistema de monedas centralizado
- [ ] Implementar todas las monedas latinoamericanas
- [ ] Crear tests exhaustivos
- [ ] Configurar feature flags
- [ ] Preparar scripts de validación

### **Durante Migración**
- [ ] Activar sistema nuevo en desarrollo
- [ ] Ejecutar tests comparativos
- [ ] Validar monedas latinoamericanas
- [ ] Monitorear logs de errores
- [ ] Verificar compatibilidad con proveedores

### **Post-Migración**
- [ ] Remover código legacy
- [ ] Actualizar documentación
- [ ] Verificar métricas de uso
- [ ] Confirmar soporte completo para DOP
- [ ] Limpiar feature flags

## 🚨 Rollback Plan

### **Si algo sale mal:**
```bash
# Desactivar sistema nuevo
USE_CENTRALIZED_CURRENCIES=false

# Revertir a código anterior
git revert <commit-hash>

# Verificar funcionalidad
npm test
```

### **Monitoreo de Rollback:**
```typescript
// Detectar problemas automáticamente
const healthCheck = () => {
  try {
    const currencies = CurrencySystem.getProviderCurrencyCodes('stripe');
    if (currencies.length < 30) { // Threshold mínimo
      throw new Error('Too few currencies detected');
    }
    return { healthy: true };
  } catch (error) {
    console.error('🚨 Currency system unhealthy, rolling back...');
    process.env.USE_CENTRALIZED_CURRENCIES = 'false';
    return { healthy: false, error };
  }
};
```

## 🎯 Métricas de Éxito

- ✅ **100% compatibilidad** con monedas actuales
- ✅ **+20 monedas latinoamericanas** agregadas
- ✅ **DOP completamente soportado** en Stripe
- ✅ **0 errores** en producción durante migración
- ✅ **Tiempo de respuesta** sin degradación
- ✅ **Cobertura de tests** >95%

---

**Nota**: Esta migración se puede hacer de forma **gradual y segura** sin afectar la funcionalidad actual del sistema.
