# Sistema de Renovaciones Automáticas de Subscripciones

## 🎯 Objetivo
Implementar un sistema completo de renovaciones automáticas que:
- ✅ Detecte subscripciones próximas a vencer
- ✅ Genere payments automáticamente
- ✅ Actualice períodos de subscripciones
- ✅ Maneje fallos de pago (past_due, retry logic)
- ✅ Integre con webhooks para confirmaciones
- ✅ Soporte intervalos flexibles con multiplicadores

## 🚨 Problemas Actuales a Resolver

### 1. **billing_interval no está en tabla subscriptions**
```sql
-- ❌ PROBLEMA ACTUAL
CREATE TABLE subscriptions (
    -- ... otros campos
    metadata JSON  -- billing_interval solo aquí
);

-- ✅ SOLUCIÓN
ALTER TABLE subscriptions 
ADD COLUMN billing_interval VARCHAR(20),
ADD COLUMN interval_multiplier INTEGER DEFAULT 1;
```

### 2. **No hay sistema de renovación automática**
- ❌ No hay cron jobs
- ❌ No hay generación automática de payments
- ❌ Webhooks no manejan renovaciones

## 📋 Opciones de Implementación

### **Opción A: Intervalos + Multiplicador (RECOMENDADA)**
```typescript
// Más flexible y escalable
{
  billing_interval: 'monthly',
  interval_multiplier: 2,  // = cada 2 meses
  // Ejemplos:
  // monthly + 1 = mensual
  // monthly + 3 = trimestral  
  // weekly + 2 = quincenal
  // yearly + 1 = anual
}
```

### **Opción B: Intervalos Predefinidos**
```typescript
// Más simple pero menos flexible
{
  billing_interval: 'biweekly' | 'quarterly' | 'bimonthly'
  // Requiere agregar cada combinación manualmente
}
```

## 🏗️ Arquitectura del Sistema

### **Componentes Principales**
1. **Database Migration**: Agregar campos faltantes
2. **Billing Calculator**: Calcular próximas fechas de facturación
3. **Renewal Processor**: Procesar renovaciones automáticas
4. **Cron Scheduler**: Programar tareas con Croner
5. **Webhook Integration**: Manejar confirmaciones de pago
6. **Retry Logic**: Manejar fallos de pago

### **Flujo de Renovación**
```
Cron Job (diario) → Detectar Subscripciones → Crear Payment → 
Provider Processing → Webhook Confirmation → Update Subscription
```

## 📊 Casos de Uso Soportados

### **Intervalos Comunes**
- **Semanal**: `weekly + 1`
- **Quincenal**: `weekly + 2` 
- **Mensual**: `monthly + 1`
- **Bimestral**: `monthly + 2`
- **Trimestral**: `monthly + 3`
- **Semestral**: `monthly + 6`
- **Anual**: `yearly + 1`

### **Intervalos Especiales**
- **2 veces al mes**: `biweekly + 1` (cada 14 días)
- **Cada 3 semanas**: `weekly + 3`
- **Cada 4 meses**: `monthly + 4`

## 🔧 Implementación Técnica

### **1. Database Schema Updates**
```sql
-- Agregar campos a subscriptions
ALTER TABLE subscriptions 
ADD COLUMN billing_interval VARCHAR(20) NOT NULL DEFAULT 'monthly',
ADD COLUMN interval_multiplier INTEGER NOT NULL DEFAULT 1,
ADD COLUMN next_billing_date TIMESTAMP,
ADD COLUMN last_billing_attempt TIMESTAMP,
ADD COLUMN billing_retry_count INTEGER DEFAULT 0,
ADD COLUMN max_retry_attempts INTEGER DEFAULT 3;

-- Migrar datos existentes
UPDATE subscriptions 
SET billing_interval = JSON_EXTRACT(metadata, '$.billing_interval')
WHERE metadata IS NOT NULL;
```

### **2. Billing Calculator Service**
```typescript
class BillingCalculator {
  calculateNextBillingDate(
    currentDate: Date,
    interval: BillingInterval,
    multiplier: number
  ): Date;
  
  calculatePeriodDates(
    startDate: Date,
    interval: BillingInterval,
    multiplier: number
  ): { start: Date; end: Date };
}
```

### **3. Renewal Processor**
```typescript
class SubscriptionRenewalProcessor {
  async processRenewals(): Promise<void>;
  async createRenewalPayment(subscription: Subscription): Promise<Payment>;
  async handleSuccessfulRenewal(subscription: Subscription): Promise<void>;
  async handleFailedRenewal(subscription: Subscription, error: Error): Promise<void>;
}
```

### **4. Cron Scheduler con Croner**
```typescript
import { Cron } from 'croner';

class RenewalScheduler {
  private jobs: Map<string, Cron> = new Map();
  
  startDailyRenewalJob(): void;
  startRetryJob(): void;
  stopAllJobs(): void;
}
```

## 📅 Cronograma de Implementación

### **Fase 1: Database & Core Logic (2-3 días)**
- ✅ Migration para agregar campos
- ✅ BillingCalculator service
- ✅ Actualizar SubscriptionRepository

### **Fase 2: Renewal System (3-4 días)**
- ✅ RenewalProcessor implementation
- ✅ Payment creation logic
- ✅ Error handling & retry logic

### **Fase 3: Cron Integration (1-2 días)**
- ✅ Croner setup
- ✅ Scheduled jobs
- ✅ Monitoring & logging

### **Fase 4: Webhook Integration (2-3 días)**
- ✅ Webhook handlers para renewals
- ✅ Status updates
- ✅ Event logging

### **Fase 5: Testing & Documentation (2-3 días)**
- ✅ Unit tests
- ✅ Integration tests
- ✅ API documentation
- ✅ Deployment guide

## 🎯 Beneficios del Sistema

### **Flexibilidad**
- ✅ Cualquier combinación de interval + multiplier
- ✅ Fácil agregar nuevos intervalos
- ✅ Soporte para casos edge (cada 5 semanas, etc.)

### **Escalabilidad**
- ✅ Procesamiento en lotes
- ✅ Retry logic robusto
- ✅ Monitoring integrado

### **Confiabilidad**
- ✅ Webhook confirmations
- ✅ Audit trail completo
- ✅ Error handling comprehensivo

## 📋 Archivos a Crear

1. **Database**
   - `migrations/add-billing-fields.sql`
   - `repositories/billing-calculator.ts`

2. **Core Services**
   - `services/renewal-processor.ts`
   - `services/billing-calculator.ts`
   - `services/renewal-scheduler.ts`

3. **Cron Jobs**
   - `cron/renewal-jobs.ts`
   - `cron/scheduler-manager.ts`

4. **Webhooks**
   - `webhooks/renewal-handlers.ts`
   - `webhooks/subscription-events.ts`

5. **Types & Interfaces**
   - `types/billing.ts`
   - `types/renewal.ts`

6. **Tests**
   - `tests/billing-calculator.test.ts`
   - `tests/renewal-processor.test.ts`

7. **Documentation**
   - `docs/renewal-system.md`
   - `docs/billing-intervals.md`

¿Quieres que proceda con la implementación completa? ¿Prefieres la Opción A (interval + multiplier) o la Opción B (intervalos predefinidos)?
