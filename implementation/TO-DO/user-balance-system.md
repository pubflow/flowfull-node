muy bien # 💰 Sistema de Balance Universal - Escalable Multi-Provider + Deudas

## 📋 **RESUMEN**

Sistema de balance escalable que **reutiliza la tabla `payments` existente** como sistema de transacciones y agrega una tabla `user_balances` optimizada para tracking de balances por categoría/grupo. **Incluye sistema completo de deudas/billing** integrado con invoices.

## 🏗️ **ARQUITECTURA ESCALABLE**

### **Reutilización Inteligente**
- **`payments`** = Sistema de transacciones completo (ya implementado)
- **`user_balances`** = Cache de balances por categoría (nueva tabla optimizada)
- **`invoices`** = Sistema de facturación que genera deudas automáticamente
- **Cálculo dinámico** = Balance real desde `payments`, cache en `user_balances`

### **Ventajas de esta Arquitectura**
✅ **Reutiliza infraestructura**: No duplica funcionalidad
✅ **Multi-provider**: Stripe, PayPal, manual, crypto, etc.
✅ **Escalable**: Soporte para millones de transacciones
✅ **Auditoria completa**: Cada transacción en `payments`
✅ **Performance**: Cache de balances para consultas rápidas
✅ **Sistema de deudas**: Invoices → balances negativos → cobranza automática

## 🔧 **IMPLEMENTACIÓN**

### **Nueva Tabla: `user_balances` (Optimizada)**
```sql
-- User Balances (Cache optimizado para consultas rápidas)
CREATE TABLE IF NOT EXISTS user_balances (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL,
    
    -- Categorización flexible
    balance_group TEXT NOT NULL, -- 'wallet', 'rewards', 'credits', 'donations', 'escrow', 'billing', 'subscription'
    balance_type TEXT NOT NULL DEFAULT 'general', -- 'general', 'restricted', 'pending', 'frozen', 'debt'
    currency TEXT NOT NULL DEFAULT 'USD',
    
    -- Balance actual (cache calculado desde payments)
    current_balance_cents INTEGER NOT NULL DEFAULT 0,
    available_balance_cents INTEGER NOT NULL DEFAULT 0, -- Balance disponible (excluye pending)
    pending_balance_cents INTEGER NOT NULL DEFAULT 0, -- Balance pendiente
    
    -- Tracking de cambios
    last_transaction_id TEXT, -- Última transacción que afectó este balance
    last_updated_at TEXT NOT NULL DEFAULT (datetime('now')),
    
    -- Metadatos y configuración
    metadata TEXT, -- JSON: configuración específica del balance
    is_active INTEGER NOT NULL DEFAULT 1,
    
    -- Timestamps
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at TEXT NOT NULL DEFAULT (datetime('now')),
    
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
    FOREIGN KEY (last_transaction_id) REFERENCES payments(id) ON DELETE SET NULL,
    
    -- Un balance por usuario/grupo/tipo/moneda
    UNIQUE (user_id, balance_group, balance_type, currency)
);
```

### **Extensión de `payments` para Balance + Deudas**
```sql
-- Agregar campos específicos para balance a payments existente
ALTER TABLE payments ADD COLUMN balance_group TEXT; -- 'wallet', 'rewards', 'credits', 'billing', 'subscription'
ALTER TABLE payments ADD COLUMN balance_operation TEXT; -- 'credit', 'debit', 'transfer', 'refund', 'debt_created', 'debt_payment'
ALTER TABLE payments ADD COLUMN related_balance_transaction_id TEXT; -- Para transfers entre balances
ALTER TABLE payments ADD COLUMN invoice_id TEXT; -- Referencia a invoice que generó la transacción

-- Índices para balance y deudas
CREATE INDEX idx_payments_balance_group ON payments(user_id, balance_group, status);
CREATE INDEX idx_payments_balance_operation ON payments(balance_operation, status);
CREATE INDEX idx_payments_balance_user_date ON payments(user_id, balance_group, created_at);
CREATE INDEX idx_payments_invoice_id ON payments(invoice_id);
CREATE INDEX idx_payments_debt_operations ON payments(balance_operation) WHERE balance_operation IN ('debt_created', 'debt_payment');
```

### **Trigger para Actualización Automática de Balance + Deudas**
```sql
-- Trigger para actualizar user_balances cuando se modifica payments (incluye deudas)
CREATE TRIGGER IF NOT EXISTS update_user_balance_on_payment
AFTER INSERT ON payments
WHEN NEW.status = 'succeeded' AND NEW.balance_group IS NOT NULL
BEGIN
    -- Actualizar o crear balance
    INSERT INTO user_balances (
        id, user_id, balance_group, currency,
        current_balance_cents, last_transaction_id, last_updated_at
    )
    VALUES (
        'bal_' || NEW.user_id || '_' || NEW.balance_group || '_' || NEW.currency,
        NEW.user_id,
        NEW.balance_group,
        NEW.currency,
        CASE
            WHEN NEW.balance_operation IN ('credit', 'debt_payment') THEN NEW.total_cents
            WHEN NEW.balance_operation IN ('debit', 'debt_created') THEN -NEW.total_cents
            ELSE 0
        END,
        NEW.id,
        datetime('now')
    )
    ON CONFLICT (user_id, balance_group, balance_type, currency) DO UPDATE SET
        current_balance_cents = current_balance_cents +
            CASE
                WHEN NEW.balance_operation IN ('credit', 'debt_payment') THEN NEW.total_cents
                WHEN NEW.balance_operation IN ('debit', 'debt_created') THEN -NEW.total_cents
                ELSE 0
            END,
        last_transaction_id = NEW.id,
        last_updated_at = datetime('now'),
        updated_at = datetime('now');
END;
```

## 🎯 **CASOS DE USO ESCALABLES**

### **1. Sistema de Wallet/Billetera**
```sql
-- Agregar fondos al wallet
INSERT INTO payments (
    id, user_id, total_cents, currency, status, 
    balance_group, balance_operation, category, concept
) VALUES (
    'pay_wallet_123', 'user_456', 5000, 'USD', 'succeeded',
    'wallet', 'credit', 'wallet_topup', 'Recarga de billetera'
);

-- Usar fondos del wallet
INSERT INTO payments (
    id, user_id, total_cents, currency, status,
    balance_group, balance_operation, category, concept
) VALUES (
    'pay_purchase_789', 'user_456', -2500, 'USD', 'succeeded',
    'wallet', 'debit', 'purchase', 'Compra de producto'
);
```

### **2. Sistema de Rewards/Puntos**
```sql
-- Ganar puntos por compra
INSERT INTO payments (
    id, user_id, total_cents, currency, status,
    balance_group, balance_operation, category, concept
) VALUES (
    'pay_reward_123', 'user_456', 100, 'USD', 'succeeded',
    'rewards', 'credit', 'reward_earned', 'Puntos por compra'
);

-- Canjear puntos
INSERT INTO payments (
    id, user_id, total_cents, currency, status,
    balance_group, balance_operation, category, concept
) VALUES (
    'pay_redeem_456', 'user_456', -50, 'USD', 'succeeded',
    'rewards', 'debit', 'reward_redeemed', 'Canje de puntos'
);
```

### **3. Sistema de Créditos/Store Credit**
```sql
-- Refund como store credit
INSERT INTO payments (
    id, user_id, total_cents, currency, status,
    balance_group, balance_operation, category, concept,
    reference_code
) VALUES (
    'pay_credit_789', 'user_456', 3000, 'USD', 'succeeded',
    'credits', 'credit', 'refund', 'Reembolso como crédito',
    'refund_original_order_123'
);
```

### **4. Sistema de Deudas/Billing (NUEVO)**
```sql
-- Crear deuda desde invoice vencida
INSERT INTO payments (
    id, user_id, total_cents, currency, status,
    balance_group, balance_operation, category, concept,
    invoice_id, reference_code
) VALUES (
    'pay_debt_123', 'user_456', -5000, 'USD', 'succeeded',
    'billing', 'debt_created', 'debt', 'Deuda por factura INV-001',
    'invoice_123', 'invoice_123'
);
-- user_balances: current_balance_cents = -5000 (DEUDA)

-- Pagar deuda (total o parcial)
INSERT INTO payments (
    id, user_id, total_cents, currency, status,
    balance_group, balance_operation, category, concept,
    invoice_id, reference_code
) VALUES (
    'pay_debt_payment_456', 'user_456', 2500, 'USD', 'succeeded',
    'billing', 'debt_payment', 'debt_payment', 'Pago parcial de deuda',
    'invoice_123', 'debt_payment_partial'
);
-- user_balances: current_balance_cents = -2500 (DEUDA RESTANTE)
```

### **5. Transferencias Entre Usuarios**
```sql
-- Transfer de wallet a wallet
-- Débito del sender
INSERT INTO payments (
    id, user_id, total_cents, currency, status,
    balance_group, balance_operation, category, concept,
    related_balance_transaction_id, metadata
) VALUES (
    'pay_transfer_out_123', 'sender_user_id', -1000, 'USD', 'succeeded',
    'wallet', 'debit', 'transfer_out', 'Transferencia enviada',
    'pay_transfer_in_123', '{"recipient_user_id": "receiver_user_id"}'
);

-- Crédito al receiver
INSERT INTO payments (
    id, user_id, total_cents, currency, status,
    balance_group, balance_operation, category, concept,
    related_balance_transaction_id, metadata
) VALUES (
    'pay_transfer_in_123', 'receiver_user_id', 1000, 'USD', 'succeeded',
    'wallet', 'credit', 'transfer_in', 'Transferencia recibida',
    'pay_transfer_out_123', '{"sender_user_id": "sender_user_id"}'
);
```

## 🔧 **API MANAGER PARA BALANCE**

### **UserBalanceManager Class (Actualizado con Deudas)**
```typescript
// src/lib/payments/user-balance-manager.ts
import { getDb } from '../../db';
import { payments, user_balances, invoices } from '../../../db/schema';
import { eq, and, sum, lt } from 'drizzle-orm';

export class UserBalanceManager {
  
  /**
   * Obtener balance actual de un usuario por grupo (incluye deudas)
   */
  static async getUserBalance(
    userId: string,
    balanceGroup: string = 'wallet',
    currency: string = 'USD'
  ): Promise<{
    current_balance_cents: number;
    available_balance_cents: number;
    pending_balance_cents: number;
    debt_amount_cents: number; // NUEVO: Monto de deuda (si balance es negativo)
    has_debt: boolean; // NUEVO: Indica si tiene deuda
  }> {
    try {
      // Intentar obtener desde cache (user_balances)
      const cachedBalance = await getDb().select()
        .from(user_balances)
        .where(and(
          eq(user_balances.user_id, userId),
          eq(user_balances.balance_group, balanceGroup),
          eq(user_balances.currency, currency),
          eq(user_balances.is_active, 1)
        ))
        .get();

      if (cachedBalance) {
        const hasDebt = cachedBalance.current_balance_cents < 0;
        return {
          current_balance_cents: cachedBalance.current_balance_cents,
          available_balance_cents: cachedBalance.available_balance_cents,
          pending_balance_cents: cachedBalance.pending_balance_cents,
          debt_amount_cents: hasDebt ? Math.abs(cachedBalance.current_balance_cents) : 0,
          has_debt: hasDebt
        };
      }

      // Si no hay cache, calcular desde payments y crear cache
      const calculatedBalance = await this.calculateBalanceFromPayments(userId, balanceGroup, currency);
      await this.createOrUpdateBalanceCache(userId, balanceGroup, currency, calculatedBalance);
      
      return calculatedBalance;

    } catch (error) {
      console.error('[UserBalance] Error getting balance:', error);
      return {
        current_balance_cents: 0,
        available_balance_cents: 0,
        pending_balance_cents: 0
      };
    }
  }

  /**
   * Calcular balance real desde tabla payments
   */
  private static async calculateBalanceFromPayments(
    userId: string,
    balanceGroup: string,
    currency: string
  ): Promise<{
    current_balance_cents: number;
    available_balance_cents: number;
    pending_balance_cents: number;
    debt_amount_cents: number;
    has_debt: boolean;
  }> {
    // Balance de transacciones completadas
    const completedTransactions = await getDb().select({
      total: sum(payments.total_cents)
    })
    .from(payments)
    .where(and(
      eq(payments.user_id, userId),
      eq(payments.balance_group, balanceGroup),
      eq(payments.currency, currency),
      eq(payments.status, 'succeeded')
    ))
    .get();

    // Balance de transacciones pendientes
    const pendingTransactions = await getDb().select({
      total: sum(payments.total_cents)
    })
    .from(payments)
    .where(and(
      eq(payments.user_id, userId),
      eq(payments.balance_group, balanceGroup),
      eq(payments.currency, currency),
      eq(payments.status, 'pending')
    ))
    .get();

    const currentBalance = completedTransactions?.total || 0;
    const pendingBalance = pendingTransactions?.total || 0;
    const hasDebt = currentBalance < 0;

    return {
      current_balance_cents: currentBalance,
      available_balance_cents: Math.max(0, currentBalance), // Disponible = solo positivo
      pending_balance_cents: pendingBalance,
      debt_amount_cents: hasDebt ? Math.abs(currentBalance) : 0,
      has_debt: hasDebt
    };
  }

  /**
   * Crear transacción de balance (incluye deudas)
   */
  static async createBalanceTransaction(options: {
    userId: string;
    amountCents: number;
    currency?: string;
    balanceGroup?: string;
    operation: 'credit' | 'debit' | 'debt_created' | 'debt_payment';
    category: string;
    concept: string;
    referenceCode?: string;
    invoiceId?: string; // NUEVO: Para transacciones relacionadas con invoices
    metadata?: any;
  }): Promise<{
    success: boolean;
    transactionId?: string;
    newBalance?: number;
    isDebt?: boolean; // NUEVO: Indica si el balance resultante es deuda
    message?: string;
  }> {
    try {
      const {
        userId, amountCents, currency = 'USD', balanceGroup = 'wallet',
        operation, category, concept, referenceCode, invoiceId, metadata
      } = options;

      // Validar balance suficiente para débitos (excepto para creación de deudas)
      if (operation === 'debit' && operation !== 'debt_created') {
        const currentBalance = await this.getUserBalance(userId, balanceGroup, currency);
        if (currentBalance.available_balance_cents < Math.abs(amountCents)) {
          return {
            success: false,
            message: 'Balance insuficiente'
          };
        }
      }

      // Crear transacción en payments
      const transactionId = `pay_${balanceGroup}_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
      const finalAmount = (operation === 'debit' || operation === 'debt_created')
        ? -Math.abs(amountCents)
        : Math.abs(amountCents);

      await getDb().insert(payments).values({
        id: transactionId,
        user_id: userId,
        total_cents: finalAmount,
        subtotal_cents: finalAmount,
        currency,
        status: 'succeeded',
        balance_group: balanceGroup,
        balance_operation: operation,
        category,
        concept,
        reference_code: referenceCode,
        invoice_id: invoiceId, // NUEVO: Referencia a invoice
        metadata: metadata ? JSON.stringify(metadata) : null,
        completed_at: new Date().toISOString()
      });

      // El trigger actualizará automáticamente user_balances
      
      // Obtener nuevo balance
      const newBalance = await this.getUserBalance(userId, balanceGroup, currency);

      console.log(`[UserBalance] ${operation} ${finalAmount} ${currency} for user ${userId} in ${balanceGroup}`);

      return {
        success: true,
        transactionId,
        newBalance: newBalance.current_balance_cents,
        isDebt: newBalance.has_debt, // NUEVO: Indica si es deuda
        message: newBalance.has_debt
          ? `Deuda creada: ${currency} ${Math.abs(newBalance.current_balance_cents / 100)}`
          : `${operation === 'credit' || operation === 'debt_payment' ? 'Crédito' : 'Débito'} procesado exitosamente`
      };

    } catch (error) {
      console.error('[UserBalance] Error creating transaction:', error);
      return {
        success: false,
        message: 'Error al procesar transacción'
      };
    }
  }

  /**
   * Obtener historial de transacciones de balance (incluye deudas)
   */
  static async getBalanceHistory(
    userId: string,
    balanceGroup: string = 'wallet',
    limit: number = 50,
    offset: number = 0
  ): Promise<{
    transactions: Array<{
      id: string;
      amount_cents: number;
      operation: string;
      category: string;
      concept: string;
      status: string;
      created_at: string;
      reference_code?: string;
      invoice_id?: string; // NUEVO: Referencia a invoice
      is_debt_related: boolean; // NUEVO: Indica si es transacción de deuda
    }>;
    total_count: number;
  }> {
    try {
      const transactions = await getDb().select({
        id: payments.id,
        amount_cents: payments.total_cents,
        operation: payments.balance_operation,
        category: payments.category,
        concept: payments.concept,
        status: payments.status,
        created_at: payments.created_at,
        reference_code: payments.reference_code,
        invoice_id: payments.invoice_id // NUEVO: Incluir invoice_id
      })
      .from(payments)
      .where(and(
        eq(payments.user_id, userId),
        eq(payments.balance_group, balanceGroup)
      ))
      .orderBy(payments.created_at, 'desc')
      .limit(limit)
      .offset(offset);

      // Contar total (para paginación)
      const totalCount = await getDb().select({ count: count() })
        .from(payments)
        .where(and(
          eq(payments.user_id, userId),
          eq(payments.balance_group, balanceGroup)
        ))
        .get();

      return {
        transactions: transactions.map(t => ({
          id: t.id,
          amount_cents: t.amount_cents,
          operation: t.operation || 'unknown',
          category: t.category || 'general',
          concept: t.concept || 'Transacción',
          status: t.status,
          created_at: t.created_at,
          reference_code: t.reference_code || undefined,
          invoice_id: t.invoice_id || undefined, // NUEVO: Incluir invoice_id
          is_debt_related: ['debt_created', 'debt_payment'].includes(t.operation || '') // NUEVO: Marcar transacciones de deuda
        })),
        total_count: totalCount?.count || 0
      };

    } catch (error) {
      console.error('[UserBalance] Error getting history:', error);
      return {
        transactions: [],
        total_count: 0
      };
    }
  }
}
```

## 🛠️ **RUTAS API PARA BALANCE**

### **Balance Endpoints**
```typescript
// GET /api/balance/:userId/:group?
app.get('/api/balance/:userId/:group?', async (c) => {
  try {
    const userId = c.req.param('userId');
    const balanceGroup = c.req.param('group') || 'wallet';
    const currency = c.req.query('currency') || 'USD';

    const balance = await UserBalanceManager.getUserBalance(userId, balanceGroup, currency);

    return c.json({
      success: true,
      balance: {
        current_balance: balance.current_balance_cents / 100,
        available_balance: balance.available_balance_cents / 100,
        pending_balance: balance.pending_balance_cents / 100,
        debt_amount: balance.debt_amount_cents / 100, // NUEVO: Monto de deuda
        has_debt: balance.has_debt, // NUEVO: Indica si tiene deuda
        currency,
        balance_group: balanceGroup
      }
    });

  } catch (error) {
    return c.json({ success: false, message: 'Error obteniendo balance' }, 500);
  }
});

// POST /api/balance/transaction (actualizado con deudas)
app.post('/api/balance/transaction', async (c) => {
  try {
    const {
      userId, amount, currency = 'USD', balanceGroup = 'wallet',
      operation, category, concept, referenceCode, invoiceId, metadata
    } = await c.req.json();

    const amountCents = Math.round(amount * 100);

    const result = await UserBalanceManager.createBalanceTransaction({
      userId,
      amountCents,
      currency,
      balanceGroup,
      operation,
      category,
      concept,
      referenceCode,
      invoiceId, // NUEVO: Soporte para invoice_id
      metadata
    });

    if (result.success) {
      return c.json({
        success: true,
        transaction_id: result.transactionId,
        new_balance: result.newBalance ? result.newBalance / 100 : 0,
        is_debt: result.isDebt, // NUEVO: Indica si es deuda
        message: result.message
      });
    } else {
      return c.json({
        success: false,
        message: result.message
      }, 400);
    }

  } catch (error) {
    return c.json({ success: false, message: 'Error procesando transacción' }, 500);
  }
});

// GET /api/balance/:userId/history/:group?
app.get('/api/balance/:userId/history/:group?', async (c) => {
  try {
    const userId = c.req.param('userId');
    const balanceGroup = c.req.param('group') || 'wallet';
    const limit = parseInt(c.req.query('limit') || '50');
    const offset = parseInt(c.req.query('offset') || '0');

    const history = await UserBalanceManager.getBalanceHistory(userId, balanceGroup, limit, offset);

    return c.json({
      success: true,
      transactions: history.transactions.map(t => ({
        id: t.id,
        amount: t.amount_cents / 100,
        operation: t.operation,
        category: t.category,
        concept: t.concept,
        status: t.status,
        created_at: t.created_at,
        reference_code: t.reference_code,
        invoice_id: t.invoice_id, // NUEVO: Incluir invoice_id
        is_debt_related: t.is_debt_related // NUEVO: Marcar transacciones de deuda
      })),
      pagination: {
        total: history.total_count,
        limit,
        offset,
        has_more: (offset + limit) < history.total_count
      }
    });

  } catch (error) {
    return c.json({ success: false, message: 'Error obteniendo historial' }, 500);
  }
});
```

## 🎯 **VENTAJAS DEL SISTEMA PROPUESTO**

### **✅ Reutilización Máxima**
- **Tabla payments**: Ya maneja multi-provider, guest, manual, refunds
- **Infraestructura existente**: Webhooks, eventos, analytics
- **Cero duplicación**: No reimplementa funcionalidad

### **✅ Escalabilidad Extrema**
- **Multi-provider**: Stripe, PayPal, crypto, manual, cualquier provider
- **Multi-currency**: USD, EUR, MXN, crypto, puntos, etc.
- **Multi-balance**: wallet, rewards, credits, escrow, donations
- **Performance**: Cache en user_balances, cálculo real desde payments

### **✅ Flexibilidad Total**
- **Balance groups**: wallet, rewards, credits, escrow, donations, etc.
- **Balance types**: general, restricted, pending, frozen
- **Operations**: credit, debit, transfer, refund, adjustment
- **Categories**: topup, purchase, reward, transfer, refund

### **✅ Auditoria Completa**
- **Cada transacción** registrada en payments con metadata completa
- **Trazabilidad total**: De dónde viene y a dónde va cada centavo
- **Compliance**: Cumple con regulaciones financieras
- **Analytics**: Integrado con sistema de analytics existente
- **Sistema de deudas**: Tracking completo de invoices → deudas → pagos

## 📊 **CASOS DE USO AVANZADOS**

### **1. E-commerce con Wallet**
```typescript
// Usuario recarga wallet
await UserBalanceManager.createBalanceTransaction({
  userId: 'user_123',
  amountCents: 10000, // $100
  operation: 'credit',
  category: 'wallet_topup',
  concept: 'Recarga de billetera via Stripe',
  referenceCode: 'stripe_payment_intent_123'
});

// Usuario compra producto usando wallet
await UserBalanceManager.createBalanceTransaction({
  userId: 'user_123',
  amountCents: 2500, // $25
  operation: 'debit',
  category: 'purchase',
  concept: 'Compra: Producto XYZ',
  referenceCode: 'order_456'
});
```

### **2. Sistema de Rewards/Loyalty**
```typescript
// Usuario gana puntos por compra
await UserBalanceManager.createBalanceTransaction({
  userId: 'user_123',
  amountCents: 500, // 500 puntos = $5 en rewards
  balanceGroup: 'rewards',
  operation: 'credit',
  category: 'reward_earned',
  concept: 'Puntos por compra de $50',
  referenceCode: 'purchase_order_789'
});

// Usuario canjea puntos
await UserBalanceManager.createBalanceTransaction({
  userId: 'user_123',
  amountCents: 250, // 250 puntos
  balanceGroup: 'rewards',
  operation: 'debit',
  category: 'reward_redeemed',
  concept: 'Canje: Descuento 10%',
  referenceCode: 'discount_coupon_abc'
});
```

### **3. Sistema de Deudas/Billing (NUEVO)**
```typescript
// Crear deuda desde invoice vencida
await UserBalanceManager.createBalanceTransaction({
  userId: 'user_123',
  amountCents: 2999, // $29.99
  balanceGroup: 'billing',
  operation: 'debt_created',
  category: 'debt',
  concept: 'Deuda por factura INV-001',
  invoiceId: 'invoice_123',
  referenceCode: 'invoice_123'
});
// Balance resultante: -2999 (DEUDA)

// Pagar deuda parcialmente
await UserBalanceManager.createBalanceTransaction({
  userId: 'user_123',
  amountCents: 1500, // $15 pago parcial
  balanceGroup: 'billing',
  operation: 'debt_payment',
  category: 'debt_payment',
  concept: 'Pago parcial de deuda',
  invoiceId: 'invoice_123'
});
// Balance resultante: -1499 (DEUDA RESTANTE)
```

### **4. Marketplace con Escrow**
```typescript
// Comprador paga, dinero va a escrow
await UserBalanceManager.createBalanceTransaction({
  userId: 'buyer_123',
  amountCents: 5000,
  balanceGroup: 'escrow',
  operation: 'credit',
  category: 'escrow_deposit',
  concept: 'Pago en garantía - Orden #456',
  referenceCode: 'order_456',
  metadata: { seller_id: 'seller_789', order_id: 'order_456' }
});

// Después de entrega, liberar a vendedor
await UserBalanceManager.createBalanceTransaction({
  userId: 'seller_789',
  amountCents: 4750, // Menos comisión
  balanceGroup: 'wallet',
  operation: 'credit',
  category: 'escrow_release',
  concept: 'Pago liberado - Orden #456',
  referenceCode: 'order_456_completed'
});
```

---

## 🚀 **IMPLEMENTACIÓN RECOMENDADA**

### **Fase 1: Extensión de Payments + Deudas**
1. Agregar campos `balance_group`, `balance_operation`, `invoice_id` a tabla payments
2. Agregar campos de deuda a tabla invoices
3. Crear índices para balance y deudas
4. Implementar UserBalanceManager básico

### **Fase 2: Cache de Balances + Sistema de Deudas**
1. Crear tabla user_balances (soporta balances negativos)
2. Implementar triggers automáticos (incluye deudas)
3. Implementar DebtManager
4. Migrar balances existentes

### **Fase 3: APIs y Frontend**
1. Crear endpoints de balance (incluye deudas)
2. Crear endpoints de deudas/billing
3. Implementar UI de wallet/balance con indicador de deudas
4. Integrar con checkout existente

### **Fase 4: Funcionalidades Avanzadas**
1. Transferencias entre usuarios
2. Sistema de rewards
3. Escrow para marketplace
4. Procesamiento automático de facturas vencidas
5. Dashboard de deudas y cobranza

**¿Te parece bien esta arquitectura escalable que reutiliza tu infraestructura existente?**
