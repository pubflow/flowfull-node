import { Kysely } from 'kysely';
import type { Database, PaymentWebhookTable, PaymentEventTable } from '../types';

export interface PaymentWebhookInsertData {
  id: string;
  provider_id: string;
  event_type: string;
  payload: string;
  processed?: number; // 0 or 1
  created_at?: string;
  processed_at?: string;
}

export interface PaymentWebhookUpdateData {
  processed?: number; // 0 or 1
  processed_at?: string;
}

export interface PaymentEventInsertData {
  id: string;
  entity_type: string;
  entity_id: string;
  event_type: string;
  data?: string;
  created_at?: string;
}

export class WebhookRepository {
  constructor(private db: Kysely<Database>) {}

  // Payment Webhooks methods (following native-payments schema)
  async createWebhook(webhook: PaymentWebhookInsertData): Promise<PaymentWebhookTable> {
    const webhookData = {
      ...webhook,
      processed: webhook.processed ?? 0,
      created_at: webhook.created_at ?? new Date().toISOString()
    };

    const result = await this.db
      .insertInto('payment_webhooks')
      .values(webhookData)
      .returningAll()
      .executeTakeFirstOrThrow();

    return result;
  }

  async findWebhookById(id: string): Promise<PaymentWebhookTable | undefined> {
    return await this.db
      .selectFrom('payment_webhooks')
      .selectAll()
      .where('id', '=', id)
      .executeTakeFirst();
  }

  async findUnprocessedWebhooks(limit: number = 50): Promise<PaymentWebhookTable[]> {
    return await this.db
      .selectFrom('payment_webhooks')
      .selectAll()
      .where('processed', '=', 0)
      .orderBy('created_at', 'asc')
      .limit(limit)
      .execute();
  }

  async findWebhooksByProvider(providerId: string, limit: number = 100): Promise<PaymentWebhookTable[]> {
    return await this.db
      .selectFrom('payment_webhooks')
      .selectAll()
      .where('provider_id', '=', providerId)
      .orderBy('created_at', 'desc')
      .limit(limit)
      .execute();
  }

  async updateWebhook(id: string, updates: PaymentWebhookUpdateData): Promise<PaymentWebhookTable | undefined> {
    return await this.db
      .updateTable('payment_webhooks')
      .set(updates)
      .where('id', '=', id)
      .returningAll()
      .executeTakeFirst();
  }

  async markWebhookAsProcessed(id: string): Promise<PaymentWebhookTable | undefined> {
    return await this.updateWebhook(id, {
      processed: 1,
      processed_at: new Date().toISOString()
    });
  }

  async getWebhookStats(providerId?: string): Promise<{
    total: number;
    processed: number;
    pending: number;
  }> {
    let query = this.db.selectFrom('payment_webhooks');
    
    if (providerId) {
      query = query.where('provider_id', '=', providerId);
    }

    const [total, processed, pending] = await Promise.all([
      query.select(({ fn }) => fn.count<number>('id').as('count')).executeTakeFirstOrThrow(),
      query.where('processed', '=', 1)
        .select(({ fn }) => fn.count<number>('id').as('count')).executeTakeFirstOrThrow(),
      query.where('processed', '=', 0)
        .select(({ fn }) => fn.count<number>('id').as('count')).executeTakeFirstOrThrow()
    ]);

    return {
      total: total.count,
      processed: processed.count,
      pending: pending.count
    };
  }

  async cleanupWebhooks(olderThanDays: number = 30): Promise<number> {
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - olderThanDays);

    const result = await this.db
      .deleteFrom('payment_webhooks')
      .where('processed', '=', 1)
      .where('created_at', '<', cutoffDate.toISOString())
      .executeTakeFirst();

    return Number(result.numDeletedRows || 0);
  }

  // Payment Events methods (following native-payments schema)
  async createEvent(event: PaymentEventInsertData): Promise<PaymentEventTable> {
    const eventData = {
      ...event,
      created_at: event.created_at ?? new Date().toISOString()
    };

    const result = await this.db
      .insertInto('payment_events')
      .values(eventData)
      .returningAll()
      .executeTakeFirstOrThrow();

    return result;
  }

  async findEventById(id: string): Promise<PaymentEventTable | undefined> {
    return await this.db
      .selectFrom('payment_events')
      .selectAll()
      .where('id', '=', id)
      .executeTakeFirst();
  }

  async findEventsByEntity(entityType: string, entityId: string, limit: number = 50): Promise<PaymentEventTable[]> {
    return await this.db
      .selectFrom('payment_events')
      .selectAll()
      .where('entity_type', '=', entityType)
      .where('entity_id', '=', entityId)
      .orderBy('created_at', 'desc')
      .limit(limit)
      .execute();
  }

  async findEventsByType(eventType: string, limit: number = 100): Promise<PaymentEventTable[]> {
    return await this.db
      .selectFrom('payment_events')
      .selectAll()
      .where('event_type', '=', eventType)
      .orderBy('created_at', 'desc')
      .limit(limit)
      .execute();
  }

  async getEventStats(): Promise<{
    total: number;
    by_entity_type: Record<string, number>;
    by_event_type: Record<string, number>;
  }> {
    const [total, byEntityType, byEventType] = await Promise.all([
      this.db
        .selectFrom('payment_events')
        .select(({ fn }) => fn.count<number>('id').as('count'))
        .executeTakeFirstOrThrow(),
      this.db
        .selectFrom('payment_events')
        .select(['entity_type', ({ fn }) => fn.count<number>('id').as('count')])
        .groupBy('entity_type')
        .execute(),
      this.db
        .selectFrom('payment_events')
        .select(['event_type', ({ fn }) => fn.count<number>('id').as('count')])
        .groupBy('event_type')
        .execute()
    ]);

    return {
      total: total.count,
      by_entity_type: byEntityType.reduce((acc, row) => {
        acc[row.entity_type] = row.count;
        return acc;
      }, {} as Record<string, number>),
      by_event_type: byEventType.reduce((acc, row) => {
        acc[row.event_type] = row.count;
        return acc;
      }, {} as Record<string, number>)
    };
  }

  async cleanupEvents(olderThanDays: number = 90): Promise<number> {
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - olderThanDays);

    const result = await this.db
      .deleteFrom('payment_events')
      .where('created_at', '<', cutoffDate.toISOString())
      .executeTakeFirst();

    return Number(result.numDeletedRows || 0);
  }
}

// Factory function
let webhookRepository: WebhookRepository | null = null;

export async function getWebhookRepository(): Promise<WebhookRepository> {
  if (!webhookRepository) {
    const { getDatabase } = await import('../connection');
    const db = await getDatabase();
    webhookRepository = new WebhookRepository(db);
  }
  return webhookRepository;
}
