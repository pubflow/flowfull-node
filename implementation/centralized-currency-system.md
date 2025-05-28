# Sistema Centralizado de Monedas - Propuesta de Implementación

## 🎯 Objetivo

Crear un sistema unificado que maneje **100+ monedas** de forma compatible entre todos los proveedores de pago (Stripe, PayPal, etc.), con enfoque especial en **monedas latinoamericanas** incluyendo **DOP (Peso Dominicano)**.

## 🌍 Problema Actual

- Cada adaptador de pago maneja sus propias listas de monedas
- No hay validación centralizada de monedas
- Difícil agregar nuevas monedas a todos los proveedores
- No hay información sobre límites mínimos por moneda
- Falta soporte completo para Latinoamérica

## ✅ Solución Propuesta

### 1. **Sistema Central de Monedas** (`src/lib/currencies/currency-system.ts`)

```typescript
interface CurrencyInfo {
  code: string;              // 'DOP', 'USD', 'EUR'
  name: string;              // 'Peso Dominicano'
  symbol: string;            // 'RD$'
  decimal_places: number;    // 2 para DOP, 0 para JPY
  region: string;            // 'Latin America'
  country?: string;          // 'Dominican Republic'
  stripe_supported: boolean; // true/false
  paypal_supported: boolean; // true/false
  minimum_amount_cents: number; // Mínimo en centavos
}
```

### 2. **Base de Datos de Monedas Completa**

#### Monedas Latinoamericanas Incluidas:
- **🇩🇴 DOP** - Peso Dominicano (RD$)
- **🇦🇷 ARS** - Peso Argentino
- **🇧🇷 BRL** - Real Brasileiro  
- **🇲🇽 MXN** - Peso Mexicano
- **🇨🇴 COP** - Peso Colombiano
- **🇨🇱 CLP** - Peso Chileno
- **🇵🇪 PEN** - Sol Peruano
- **🇺🇾 UYU** - Peso Uruguayo
- **🇵🇾 PYG** - Guaraní Paraguayo
- **🇧🇴 BOB** - Boliviano
- **🇻🇪 VES** - Bolívar Soberano
- **🇨🇷 CRC** - Colón Costarricense
- **🇬🇹 GTQ** - Quetzal Guatemalteco
- **🇭🇳 HNL** - Lempira Hondureña
- **🇳🇮 NIO** - Córdoba Nicaragüense
- **🇵🇦 PAB** - Balboa Panameño

#### Monedas del Caribe:
- **🇯🇲 JMD** - Jamaica Dollar
- **🇧🇧 BBD** - Barbados Dollar
- **🇹🇹 TTD** - Trinidad and Tobago Dollar

### 3. **API del Sistema**

```typescript
class CurrencySystem {
  // Obtener todas las monedas
  static getAllCurrencies(): CurrencyInfo[]
  
  // Monedas por proveedor
  static getCurrenciesByProvider(provider: 'stripe' | 'paypal'): CurrencyInfo[]
  
  // Monedas por región
  static getLatinAmericanCurrencies(): CurrencyInfo[]
  
  // Validaciones
  static isCurrencySupported(code: string, provider: string): boolean
  static validateAmount(amountCents: number, currency: string): boolean
  
  // Formateo
  static formatAmount(amountCents: number, currency: string): string
  
  // Información
  static getCurrencyInfo(code: string): CurrencyInfo | null
}
```

## 🔧 Implementación por Fases

### **Fase 1: Crear Sistema Base**
1. Crear `src/lib/currencies/currency-system.ts`
2. Definir todas las monedas con información completa
3. Implementar funciones de utilidad

### **Fase 2: Integrar con Adaptadores**
1. Actualizar `PaymentAdapter` base para usar el sistema
2. Modificar `StripeAdapter` para obtener monedas del sistema
3. Actualizar `PayPalAdapter` cuando esté implementado

### **Fase 3: Validación Centralizada**
1. Validación automática de monedas en rutas
2. Validación de montos mínimos por moneda
3. Mensajes de error específicos por moneda

### **Fase 4: Funciones Avanzadas**
1. Conversión de formatos entre proveedores
2. Detección automática de región por moneda
3. Sugerencias de monedas alternativas

## 📊 Ejemplo de Uso

### **Antes (Sistema Actual)**
```typescript
// En cada adaptador por separado
const supportedCurrencies = ['USD', 'EUR', 'MXN', ...];

// Validación manual
if (!supportedCurrencies.includes(currency)) {
  throw new Error('Currency not supported');
}
```

### **Después (Sistema Centralizado)**
```typescript
// Una sola fuente de verdad
const currencies = CurrencySystem.getProviderCurrencyCodes('stripe');

// Validación inteligente
if (!CurrencySystem.isCurrencySupported('DOP', 'stripe')) {
  const info = CurrencySystem.getCurrencyInfo('DOP');
  throw new Error(`${info.name} (${info.symbol}) not supported by Stripe`);
}

// Formateo automático
const formatted = CurrencySystem.formatAmount(2500, 'DOP'); // "RD$25.00"
```

## 🌟 Beneficios

### **Para Desarrolladores**
- ✅ Una sola fuente de verdad para monedas
- ✅ Validación automática y consistente
- ✅ Fácil agregar nuevas monedas
- ✅ Información completa de cada moneda

### **Para el Negocio**
- ✅ Soporte completo para Latinoamérica
- ✅ Experiencia consistente entre proveedores
- ✅ Mensajes de error informativos
- ✅ Escalabilidad para nuevos mercados

### **Para Usuarios**
- ✅ Montos mostrados en formato local
- ✅ Validación precisa de montos mínimos
- ✅ Soporte para su moneda local
- ✅ Experiencia de pago mejorada

## 🚀 Migración Gradual

### **Paso 1: Implementar sin Breaking Changes**
```typescript
// Mantener compatibilidad actual
class StripeAdapter {
  getCapabilities() {
    return {
      // Opción 1: Usar sistema nuevo
      supported_currencies: CurrencySystem.getProviderCurrencyCodes('stripe'),
      
      // Opción 2: Mantener lista actual como fallback
      supported_currencies: this.legacyCurrencies || CurrencySystem.getProviderCurrencyCodes('stripe')
    };
  }
}
```

### **Paso 2: Migrar Validaciones**
```typescript
// Reemplazar validaciones manuales
protected validateCurrency(currency: string): void {
  // Nuevo: usar sistema centralizado
  if (!CurrencySystem.isCurrencySupported(currency, this.providerId)) {
    const info = CurrencySystem.getCurrencyInfo(currency);
    throw new Error(`${info?.name || currency} not supported by ${this.providerId}`);
  }
}
```

### **Paso 3: Agregar Funciones Avanzadas**
```typescript
// Formateo inteligente
const displayAmount = CurrencySystem.formatAmount(amountCents, currency);

// Validación de montos
const isValidAmount = CurrencySystem.validateAmount(amountCents, currency);

// Información de moneda
const currencyInfo = CurrencySystem.getCurrencyInfo(currency);
```

## 📋 Lista de Archivos a Crear

```
src/lib/currencies/
├── currency-system.ts          # Sistema principal
├── currency-data.ts           # Base de datos de monedas
├── currency-validators.ts     # Validadores específicos
├── currency-formatters.ts     # Formateadores por región
└── index.ts                   # Exports públicos

implementation/
├── centralized-currency-system.md    # Esta documentación
├── currency-migration-guide.md       # Guía de migración
├── supported-currencies.md           # Lista completa de monedas
└── provider-compatibility.md         # Compatibilidad por proveedor
```

## 🔄 Compatibilidad con Sistema Actual

El sistema propuesto es **100% compatible** con la implementación actual:

1. **No rompe código existente** - Los adaptadores actuales siguen funcionando
2. **Migración gradual** - Se puede implementar por partes
3. **Fallback automático** - Si el sistema nuevo falla, usa el actual
4. **Testing independiente** - Se puede probar sin afectar producción

## 🎯 Próximos Pasos

1. **Revisar propuesta** con el equipo
2. **Aprobar arquitectura** y estructura
3. **Implementar Fase 1** (sistema base)
4. **Testing exhaustivo** con monedas latinoamericanas
5. **Migración gradual** de adaptadores existentes
6. **Documentación completa** para desarrolladores

---

**Nota**: Esta propuesta mantiene la flexibilidad actual mientras prepara el sistema para escalar a 100+ monedas de forma eficiente y mantenible.
