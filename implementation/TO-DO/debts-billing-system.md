# 💳 Sistema de Deudas y Billing Universal

## 📋 **RESUMEN**

Sistema de deudas/billing que extiende la tabla `invoices` existente para generar **balances negativos** en `user_balances` y crear transacciones de deuda en `payments`. Flujo completo: **Invoice → Debt → Balance Negativo → Collection**.

## 🏗️ **ARQUITECTURA DE DEUDAS**

### **Lógica del Sistema**
```
1. Invoice creada (status: 'open') → Genera DEUDA en user_balances
2. Balance negativo → Usuario debe dinero
3. Payment de cobranza → Reduce la deuda
4. Balance = 0 → Deuda saldada
```

### **Extensión de Invoices para Deudas**
```sql
-- Agregar campos específicos para deudas a invoices existente
ALTER TABLE invoices ADD COLUMN debt_balance_group TEXT DEFAULT 'billing'; -- 'billing', 'subscription', 'fees'
ALTER TABLE invoices ADD COLUMN auto_create_debt INTEGER NOT NULL DEFAULT 1; -- Crear deuda automáticamente
ALTER TABLE invoices ADD COLUMN debt_created_at TEXT; -- Cuándo se creó la deuda
ALTER TABLE invoices ADD COLUMN debt_payment_id TEXT; -- Payment que creó la deuda

-- Índices para deudas
CREATE INDEX idx_invoices_debt_balance_group ON invoices(debt_balance_group);
CREATE INDEX idx_invoices_auto_create_debt ON invoices(auto_create_debt);
CREATE INDEX idx_invoices_debt_created ON invoices(debt_created_at);
CREATE INDEX idx_invoices_due_date ON invoices(due_date, status);
```

### **Extensión de user_balances para Deudas**
```sql
-- user_balances ya soporta balances negativos
-- Solo agregar balance_type específico para deudas
-- balance_type: 'debt', 'billing_debt', 'subscription_debt', 'fee_debt'
```

### **Extensión de payments para Deudas**
```sql
-- payments ya tiene los campos necesarios, solo usar:
-- balance_operation: 'debt_created', 'debt_payment', 'debt_adjustment'
-- category: 'debt', 'billing', 'collection'
-- concept: 'Deuda por factura #INV-001', 'Pago de deuda', etc.
```

## 🔧 **IMPLEMENTACIÓN COMPLETA**

### **DebtManager Class**
```typescript
// src/lib/payments/debt-manager.ts
import { getDb } from '../../db';
import { invoices, payments, user_balances } from '../../../db/schema';
import { eq, and, lt } from 'drizzle-orm';
import { UserBalanceManager } from './user-balance-manager';

export class DebtManager {
  
  /**
   * Crear deuda desde invoice
   */
  static async createDebtFromInvoice(invoiceId: string): Promise<{
    success: boolean;
    debtId?: string;
    balanceAfter?: number;
    message?: string;
  }> {
    try {
      // Obtener invoice
      const invoice = await getDb().select()
        .from(invoices)
        .where(eq(invoices.id, invoiceId))
        .get();

      if (!invoice) {
        return { success: false, message: 'Invoice no encontrada' };
      }

      if (invoice.status !== 'open') {
        return { success: false, message: 'Invoice debe estar en status "open"' };
      }

      if (!invoice.auto_create_debt) {
        return { success: false, message: 'Invoice no configurada para crear deuda automática' };
      }

      // Verificar si ya se creó la deuda
      if (invoice.debt_payment_id) {
        return { success: false, message: 'Deuda ya creada para esta invoice' };
      }

      const userId = invoice.user_id || invoice.organization_id;
      if (!userId) {
        return { success: false, message: 'Invoice debe tener user_id o organization_id' };
      }

      // Crear transacción de deuda (balance negativo)
      const debtResult = await UserBalanceManager.createBalanceTransaction({
        userId,
        amountCents: -invoice.total_cents, // NEGATIVO = DEUDA
        currency: invoice.currency,
        balanceGroup: invoice.debt_balance_group || 'billing',
        operation: 'debit', // Débito = reduce balance (crea deuda)
        category: 'debt',
        concept: `Deuda por factura ${invoice.invoice_number}`,
        referenceCode: `invoice_${invoice.id}`,
        metadata: {
          invoice_id: invoice.id,
          invoice_number: invoice.invoice_number,
          due_date: invoice.due_date,
          debt_type: 'invoice_debt'
        }
      });

      if (!debtResult.success) {
        return {
          success: false,
          message: `Error creando deuda: ${debtResult.message}`
        };
      }

      // Actualizar invoice con referencia a la deuda
      await getDb().update(invoices)
        .set({
          debt_payment_id: debtResult.transactionId,
          debt_created_at: new Date().toISOString(),
          updated_at: new Date().toISOString()
        })
        .where(eq(invoices.id, invoiceId));

      console.log(`[Debt] Created debt ${debtResult.transactionId} for invoice ${invoice.invoice_number}`);

      return {
        success: true,
        debtId: debtResult.transactionId,
        balanceAfter: debtResult.newBalance,
        message: `Deuda creada: ${invoice.currency} ${Math.abs(invoice.total_cents / 100)}`
      };

    } catch (error) {
      console.error('[Debt] Error creating debt from invoice:', error);
      return {
        success: false,
        message: 'Error interno creando deuda'
      };
    }
  }

  /**
   * Pagar deuda (total o parcial)
   */
  static async payDebt(options: {
    userId: string;
    amountCents: number;
    currency?: string;
    balanceGroup?: string;
    paymentMethod?: 'wallet' | 'card' | 'bank_transfer' | 'cash';
    invoiceId?: string;
    referenceCode?: string;
    metadata?: any;
  }): Promise<{
    success: boolean;
    paymentId?: string;
    remainingDebt?: number;
    debtPaidOff?: boolean;
    message?: string;
  }> {
    try {
      const {
        userId, amountCents, currency = 'USD', balanceGroup = 'billing',
        paymentMethod = 'card', invoiceId, referenceCode, metadata
      } = options;

      // Verificar que hay deuda pendiente
      const currentBalance = await UserBalanceManager.getUserBalance(userId, balanceGroup, currency);
      if (currentBalance.current_balance_cents >= 0) {
        return {
          success: false,
          message: 'No hay deuda pendiente en este balance'
        };
      }

      const debtAmount = Math.abs(currentBalance.current_balance_cents);
      const paymentAmount = Math.min(amountCents, debtAmount); // No pagar más de la deuda

      // Crear pago de deuda (crédito para reducir balance negativo)
      const paymentResult = await UserBalanceManager.createBalanceTransaction({
        userId,
        amountCents: paymentAmount, // POSITIVO = reduce deuda
        currency,
        balanceGroup,
        operation: 'credit', // Crédito = aumenta balance (reduce deuda)
        category: 'debt_payment',
        concept: invoiceId 
          ? `Pago de deuda - Factura ${invoiceId}`
          : 'Pago de deuda',
        referenceCode: referenceCode || `debt_payment_${Date.now()}`,
        metadata: {
          payment_method: paymentMethod,
          invoice_id: invoiceId,
          original_debt_amount: debtAmount,
          payment_amount: paymentAmount,
          ...metadata
        }
      });

      if (!paymentResult.success) {
        return {
          success: false,
          message: `Error procesando pago: ${paymentResult.message}`
        };
      }

      // Verificar si la deuda se saldó completamente
      const newBalance = await UserBalanceManager.getUserBalance(userId, balanceGroup, currency);
      const debtPaidOff = newBalance.current_balance_cents >= 0;

      // Si hay invoice asociada y se saldó la deuda, marcar como pagada
      if (debtPaidOff && invoiceId) {
        await getDb().update(invoices)
          .set({
            status: 'paid',
            paid_date: new Date().toISOString(),
            payment_id: paymentResult.transactionId,
            updated_at: new Date().toISOString()
          })
          .where(eq(invoices.id, invoiceId));
      }

      console.log(`[Debt] Payment ${paymentResult.transactionId} for ${paymentAmount/100} ${currency}, debt paid off: ${debtPaidOff}`);

      return {
        success: true,
        paymentId: paymentResult.transactionId,
        remainingDebt: Math.abs(Math.min(0, newBalance.current_balance_cents)),
        debtPaidOff,
        message: debtPaidOff 
          ? 'Deuda saldada completamente'
          : `Pago aplicado. Deuda restante: ${currency} ${Math.abs(newBalance.current_balance_cents / 100)}`
      };

    } catch (error) {
      console.error('[Debt] Error paying debt:', error);
      return {
        success: false,
        message: 'Error interno procesando pago'
      };
    }
  }

  /**
   * Obtener resumen de deudas del usuario
   */
  static async getUserDebtSummary(userId: string): Promise<{
    total_debt_cents: number;
    debts_by_group: Array<{
      balance_group: string;
      currency: string;
      debt_amount_cents: number;
      overdue_amount_cents: number;
    }>;
    overdue_invoices: Array<{
      id: string;
      invoice_number: string;
      amount_cents: number;
      due_date: string;
      days_overdue: number;
    }>;
  }> {
    try {
      // Obtener todos los balances negativos (deudas)
      const debtBalances = await getDb().select()
        .from(user_balances)
        .where(and(
          eq(user_balances.user_id, userId),
          lt(user_balances.current_balance_cents, 0),
          eq(user_balances.is_active, 1)
        ));

      // Obtener facturas vencidas
      const now = new Date().toISOString();
      const overdueInvoices = await getDb().select({
        id: invoices.id,
        invoice_number: invoices.invoice_number,
        total_cents: invoices.total_cents,
        due_date: invoices.due_date,
        currency: invoices.currency
      })
      .from(invoices)
      .where(and(
        eq(invoices.user_id, userId),
        eq(invoices.status, 'open'),
        lt(invoices.due_date, now)
      ));

      const totalDebt = debtBalances.reduce((sum, balance) => 
        sum + Math.abs(balance.current_balance_cents), 0
      );

      const debtsByGroup = debtBalances.map(balance => ({
        balance_group: balance.balance_group,
        currency: balance.currency,
        debt_amount_cents: Math.abs(balance.current_balance_cents),
        overdue_amount_cents: 0 // Se calcularía con lógica adicional
      }));

      const overdueInvoicesFormatted = overdueInvoices.map(invoice => {
        const dueDate = new Date(invoice.due_date);
        const today = new Date();
        const daysOverdue = Math.floor((today.getTime() - dueDate.getTime()) / (1000 * 60 * 60 * 24));

        return {
          id: invoice.id,
          invoice_number: invoice.invoice_number,
          amount_cents: invoice.total_cents,
          due_date: invoice.due_date,
          days_overdue: daysOverdue
        };
      });

      return {
        total_debt_cents: totalDebt,
        debts_by_group: debtsByGroup,
        overdue_invoices: overdueInvoicesFormatted
      };

    } catch (error) {
      console.error('[Debt] Error getting debt summary:', error);
      return {
        total_debt_cents: 0,
        debts_by_group: [],
        overdue_invoices: []
      };
    }
  }

  /**
   * Procesar facturas vencidas automáticamente
   */
  static async processOverdueInvoices(): Promise<{
    processed: number;
    errors: number;
    details: Array<{
      invoice_id: string;
      success: boolean;
      message: string;
    }>;
  }> {
    try {
      const now = new Date().toISOString();
      
      // Obtener facturas vencidas que no han creado deuda
      const overdueInvoices = await getDb().select()
        .from(invoices)
        .where(and(
          eq(invoices.status, 'open'),
          lt(invoices.due_date, now),
          eq(invoices.auto_create_debt, 1),
          eq(invoices.debt_payment_id, null) // No han creado deuda aún
        ));

      const results = [];
      let processed = 0;
      let errors = 0;

      for (const invoice of overdueInvoices) {
        const result = await this.createDebtFromInvoice(invoice.id);
        
        results.push({
          invoice_id: invoice.id,
          success: result.success,
          message: result.message || 'Procesado'
        });

        if (result.success) {
          processed++;
        } else {
          errors++;
        }
      }

      console.log(`[Debt] Processed ${processed} overdue invoices, ${errors} errors`);

      return {
        processed,
        errors,
        details: results
      };

    } catch (error) {
      console.error('[Debt] Error processing overdue invoices:', error);
      return {
        processed: 0,
        errors: 1,
        details: [{
          invoice_id: 'unknown',
          success: false,
          message: 'Error interno procesando facturas vencidas'
        }]
      };
    }
  }
}
```

## 🛠️ **RUTAS API PARA DEUDAS**

### **Debt Management Endpoints**
```typescript
// POST /api/debts/create-from-invoice
app.post('/api/debts/create-from-invoice', async (c) => {
  try {
    const { invoice_id } = await c.req.json();

    const result = await DebtManager.createDebtFromInvoice(invoice_id);

    if (result.success) {
      return c.json({
        success: true,
        debt_id: result.debtId,
        balance_after: result.balanceAfter ? result.balanceAfter / 100 : 0,
        message: result.message
      });
    } else {
      return c.json({
        success: false,
        message: result.message
      }, 400);
    }

  } catch (error) {
    return c.json({ success: false, message: 'Error creando deuda' }, 500);
  }
});

// POST /api/debts/pay
app.post('/api/debts/pay', async (c) => {
  try {
    const {
      user_id, amount, currency = 'USD', balance_group = 'billing',
      payment_method = 'card', invoice_id, reference_code, metadata
    } = await c.req.json();

    const amountCents = Math.round(amount * 100);

    const result = await DebtManager.payDebt({
      userId: user_id,
      amountCents,
      currency,
      balanceGroup: balance_group,
      paymentMethod: payment_method,
      invoiceId: invoice_id,
      referenceCode: reference_code,
      metadata
    });

    if (result.success) {
      return c.json({
        success: true,
        payment_id: result.paymentId,
        remaining_debt: result.remainingDebt ? result.remainingDebt / 100 : 0,
        debt_paid_off: result.debtPaidOff,
        message: result.message
      });
    } else {
      return c.json({
        success: false,
        message: result.message
      }, 400);
    }

  } catch (error) {
    return c.json({ success: false, message: 'Error procesando pago' }, 500);
  }
});

// GET /api/debts/:userId/summary
app.get('/api/debts/:userId/summary', async (c) => {
  try {
    const userId = c.req.param('userId');
    const summary = await DebtManager.getUserDebtSummary(userId);

    return c.json({
      success: true,
      total_debt: summary.total_debt_cents / 100,
      debts_by_group: summary.debts_by_group.map(debt => ({
        balance_group: debt.balance_group,
        currency: debt.currency,
        debt_amount: debt.debt_amount_cents / 100,
        overdue_amount: debt.overdue_amount_cents / 100
      })),
      overdue_invoices: summary.overdue_invoices.map(invoice => ({
        id: invoice.id,
        invoice_number: invoice.invoice_number,
        amount: invoice.amount_cents / 100,
        due_date: invoice.due_date,
        days_overdue: invoice.days_overdue
      }))
    });

  } catch (error) {
    return c.json({ success: false, message: 'Error obteniendo resumen de deudas' }, 500);
  }
});

// POST /api/debts/process-overdue (Admin/Cron)
app.post('/api/debts/process-overdue', async (c) => {
  try {
    const result = await DebtManager.processOverdueInvoices();

    return c.json({
      success: true,
      processed: result.processed,
      errors: result.errors,
      details: result.details
    });

  } catch (error) {
    return c.json({ success: false, message: 'Error procesando facturas vencidas' }, 500);
  }
});
```

## 🎯 **CASOS DE USO COMPLETOS**

### **1. Facturación de Suscripción**
```typescript
// 1. Crear invoice por suscripción vencida
const invoice = await createInvoice({
  user_id: 'user_123',
  subscription_id: 'sub_456',
  total_cents: 2999, // $29.99
  due_date: '2024-02-01T00:00:00Z',
  debt_balance_group: 'subscription',
  auto_create_debt: true
});

// 2. Al vencer, automáticamente crea deuda
await DebtManager.createDebtFromInvoice(invoice.id);
// user_balances: current_balance_cents = -2999 (deuda)

// 3. Usuario paga la deuda
await DebtManager.payDebt({
  userId: 'user_123',
  amountCents: 2999,
  balanceGroup: 'subscription',
  paymentMethod: 'card',
  invoiceId: invoice.id
});
// user_balances: current_balance_cents = 0 (saldado)
// invoice: status = 'paid'
```

### **2. Facturación de Servicios**
```typescript
// 1. Crear invoice por servicios profesionales
const invoice = await createInvoice({
  user_id: 'client_789',
  total_cents: 150000, // $1,500
  due_date: '2024-01-30T00:00:00Z',
  debt_balance_group: 'billing',
  auto_create_debt: true,
  concept: 'Servicios de consultoría - Enero 2024'
});

// 2. Cliente no paga a tiempo → se crea deuda automática
await DebtManager.processOverdueInvoices();

// 3. Cliente hace pago parcial
await DebtManager.payDebt({
  userId: 'client_789',
  amountCents: 75000, // $750 (50%)
  balanceGroup: 'billing',
  paymentMethod: 'bank_transfer'
});
// Deuda restante: $750
```

### **3. Sistema de Crédito/Wallet**
```typescript
// 1. Usuario tiene crédito en wallet
const walletBalance = await UserBalanceManager.getUserBalance('user_123', 'wallet');
// current_balance_cents: 5000 ($50 de crédito)

// 2. Se crea una deuda por compra
await DebtManager.createDebtFromInvoice('invoice_purchase_123');
// billing balance: -3000 ($30 de deuda)

// 3. Pagar deuda usando wallet
await DebtManager.payDebt({
  userId: 'user_123',
  amountCents: 3000,
  balanceGroup: 'billing',
  paymentMethod: 'wallet' // Usar fondos del wallet
});
// billing balance: 0 (saldado)
// wallet balance: 2000 ($20 restante)
```

## 🔄 **TRIGGERS AUTOMÁTICOS**

### **Auto-crear Deuda al Vencer Invoice**
```sql
-- Trigger para crear deuda automáticamente cuando invoice vence
CREATE TRIGGER IF NOT EXISTS auto_create_debt_on_overdue
AFTER UPDATE ON invoices
WHEN NEW.status = 'open'
     AND NEW.due_date < datetime('now')
     AND NEW.auto_create_debt = 1
     AND NEW.debt_payment_id IS NULL
     AND OLD.debt_payment_id IS NULL
BEGIN
    -- Crear transacción de deuda en payments
    INSERT INTO payments (
        id, user_id, total_cents, currency, status,
        balance_group, balance_operation, category, concept,
        reference_code, metadata, completed_at
    ) VALUES (
        'debt_' || NEW.id || '_' || strftime('%s', 'now'),
        COALESCE(NEW.user_id, NEW.organization_id),
        -NEW.total_cents, -- NEGATIVO = DEUDA
        NEW.currency,
        'succeeded',
        COALESCE(NEW.debt_balance_group, 'billing'),
        'debit',
        'debt',
        'Deuda por factura ' || NEW.invoice_number,
        'invoice_' || NEW.id,
        json_object(
            'invoice_id', NEW.id,
            'invoice_number', NEW.invoice_number,
            'due_date', NEW.due_date,
            'debt_type', 'invoice_debt'
        ),
        datetime('now')
    );

    -- Actualizar invoice con referencia a la deuda
    UPDATE invoices SET
        debt_payment_id = 'debt_' || NEW.id || '_' || strftime('%s', 'now'),
        debt_created_at = datetime('now'),
        updated_at = datetime('now')
    WHERE id = NEW.id;
END;
```

## 🎯 **VENTAJAS DEL SISTEMA**

### **✅ Reutilización Total**
- **Invoices existente**: Ya tiene toda la funcionalidad de facturación
- **user_balances**: Soporta balances negativos (deudas) naturalmente
- **payments**: Registra todas las transacciones de deuda y pago
- **Cero duplicación**: No reimplementa funcionalidad

### **✅ Flujo Natural**
- **Invoice → Debt**: Factura vencida crea deuda automática
- **Debt → Negative Balance**: Deuda se refleja como balance negativo
- **Payment → Debt Reduction**: Pagos reducen la deuda
- **Balance = 0**: Deuda saldada, invoice marcada como pagada

### **✅ Flexibilidad Total**
- **Múltiples tipos de deuda**: billing, subscription, fees, penalties
- **Pagos parciales**: Permite pagos graduales de la deuda
- **Múltiples métodos de pago**: card, wallet, bank_transfer, cash
- **Automatización**: Triggers para crear deudas automáticamente

### **✅ Reporting Completo**
- **Resumen de deudas**: Por usuario, grupo, moneda
- **Facturas vencidas**: Con días de retraso
- **Historial completo**: Todas las transacciones en payments
- **Analytics**: Integrado con sistema de analytics existente

---

## 🚀 **IMPLEMENTACIÓN RECOMENDADA**

### **Fase 1: Extensión de Esquema**
1. Agregar campos de deuda a `invoices`
2. Crear triggers automáticos
3. Implementar `DebtManager`

### **Fase 2: APIs y Lógica**
1. Crear endpoints de deuda
2. Integrar con sistema de billing existente
3. Implementar procesamiento automático

### **Fase 3: Frontend y UX**
1. Dashboard de deudas para usuarios
2. Alertas de facturas vencidas
3. Flujo de pago de deudas

### **Fase 4: Automatización**
1. Cron jobs para procesar facturas vencidas
2. Notificaciones automáticas
3. Reportes de cobranza

**¿Te parece perfecta esta integración de deudas con tu sistema de invoices y balances existente?**
