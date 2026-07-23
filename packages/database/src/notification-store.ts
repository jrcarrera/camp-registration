import type { PoolClient } from 'pg';

import type { DatabaseClient } from './client.js';

export type WaitlistNotificationType =
  | 'WAITLIST_OFFERED'
  | 'WAITLIST_EXPIRING_SOON'
  | 'WAITLIST_ACCEPTED'
  | 'WAITLIST_DECLINED'
  | 'WAITLIST_EXPIRED'
  | 'WAITLIST_CANCELLED';

export type NotificationType =
  | WaitlistNotificationType
  | 'PAYMENT_RECEIPT'
  | 'ORDER_CONFIRMATION'
  | 'INSTALLMENT_DUE_SOON'
  | 'INSTALLMENT_DUE'
  | 'LIFECYCLE_MESSAGE';

export interface LifecycleNotificationTemplateData {
  body: string;
  portal_path: string;
  subject: string;
}

export interface WaitlistNotificationTemplateData {
  camper_name: string;
  expires_at: string;
  family_name: string;
  organization_timezone: string;
  portal_path: string;
  session_name: string;
}

export interface PaymentReceiptNotificationTemplateData {
  amount_cents: number;
  camper_name: string;
  currency: 'USD';
  family_name: string;
  portal_path: string;
  provider_reference: string | null;
  receipt_url: string | null;
  session_name: string;
  order_summary?: OrderNotificationSummary;
}

export interface OrderNotificationLine {
  assistance_cents: number;
  automatic_discount_cents: number;
  camper_name: string;
  coupon_discount_cents: number;
  gross_price_cents: number;
  net_price_cents: number;
  outcome: 'HELD' | 'CONFIRMED' | 'WAITLISTED' | 'EXPIRED' | 'CANCELLED';
  session_name: string;
}

export interface OrderNotificationInstallment {
  amount_cents: number;
  due_on: string;
  status: 'SCHEDULED' | 'DUE' | 'OVERDUE' | 'PAID';
}

export interface OrderNotificationSummary {
  assistance_cents: number;
  automatic_discount_cents: number;
  coupon_discount_cents: number;
  gross_total_cents: number;
  installments: OrderNotificationInstallment[];
  lines: OrderNotificationLine[];
  net_total_cents: number;
  paid_cents: number;
  remaining_balance_cents: number;
}

export interface BillingNotificationTemplateData {
  amount_cents: number;
  currency: 'USD';
  due_on?: string;
  family_name: string;
  installment_id?: string;
  line_count?: number;
  order_summary?: OrderNotificationSummary;
  portal_path: string;
}

export interface NotificationOutboxRecord {
  attempt_count: number;
  id: string;
  idempotency_key: string;
  notification_type: NotificationType;
  recipient_email: string;
  template_data:
    | WaitlistNotificationTemplateData
    | PaymentReceiptNotificationTemplateData
    | BillingNotificationTemplateData
    | LifecycleNotificationTemplateData;
}

interface NotificationOutboxRow extends Omit<NotificationOutboxRecord, 'template_data'> {
  template_data:
    | WaitlistNotificationTemplateData
    | PaymentReceiptNotificationTemplateData
    | BillingNotificationTemplateData
    | LifecycleNotificationTemplateData;
}

export class NotificationStore {
  constructor(private readonly database: DatabaseClient) {}

  private async withTenant<T>(
    organizationId: string,
    operation: (client: PoolClient) => Promise<T>,
  ): Promise<T> {
    const client = await this.database.pool.connect();
    try {
      await client.query('BEGIN');
      await client.query(`SELECT set_config('app.organization_id', $1, true)`, [organizationId]);
      const result = await operation(client);
      await client.query('COMMIT');
      return result;
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }

  async claimPending(
    organizationId: string,
    workerId: string,
    limit: number,
  ): Promise<NotificationOutboxRecord[]> {
    return this.withTenant(organizationId, async (client) => {
      await client.query(
        `UPDATE notification_outbox
         SET status = 'PENDING',
             available_at = transaction_timestamp(),
             locked_at = NULL,
             locked_by = NULL,
             updated_at = transaction_timestamp()
         WHERE organization_id = $1
           AND status = 'PROCESSING'
           AND locked_at <= transaction_timestamp() - interval '15 minutes'`,
        [organizationId],
      );

      const result = await client.query<NotificationOutboxRow>(
        `WITH candidates AS (
           SELECT id
           FROM notification_outbox
           WHERE organization_id = $1
             AND status = 'PENDING'
             AND available_at <= transaction_timestamp()
           ORDER BY available_at, created_at, id
           LIMIT $3
           FOR UPDATE SKIP LOCKED
         )
         UPDATE notification_outbox outbox
         SET status = 'PROCESSING',
             attempt_count = attempt_count + 1,
             locked_at = transaction_timestamp(),
             locked_by = $2,
             last_error = NULL,
             updated_at = transaction_timestamp()
         FROM candidates
         WHERE outbox.organization_id = $1
           AND outbox.id = candidates.id
         RETURNING
           outbox.id,
           outbox.idempotency_key,
           outbox.notification_type,
           outbox.recipient_email,
           outbox.template_data,
           outbox.attempt_count`,
        [organizationId, workerId, limit],
      );
      return result.rows;
    });
  }

  async markDelivered(organizationId: string, workerId: string, id: string): Promise<void> {
    await this.withTenant(organizationId, async (client) => {
      await client.query(
        `UPDATE notification_outbox
         SET status = 'DELIVERED',
             delivered_at = transaction_timestamp(),
             locked_at = NULL,
             locked_by = NULL,
             updated_at = transaction_timestamp()
         WHERE organization_id = $1
           AND id = $2
           AND status = 'PROCESSING'
           AND locked_by = $3`,
        [organizationId, id, workerId],
      );
    });
  }

  async markFailed(
    organizationId: string,
    workerId: string,
    id: string,
    lastError: string,
    maximumAttempts: number,
  ): Promise<void> {
    await this.withTenant(organizationId, async (client) => {
      await client.query(
        `UPDATE notification_outbox
         SET status = CASE WHEN attempt_count >= $5 THEN 'FAILED' ELSE 'PENDING' END,
             available_at = CASE
               WHEN attempt_count >= $5 THEN available_at
               ELSE transaction_timestamp()
                 + make_interval(secs => LEAST(3600, 30 * power(2, attempt_count - 1))::integer)
             END,
             locked_at = NULL,
             locked_by = NULL,
             last_error = $4,
             updated_at = transaction_timestamp()
         WHERE organization_id = $1
           AND id = $2
           AND status = 'PROCESSING'
           AND locked_by = $3`,
        [organizationId, id, workerId, lastError, maximumAttempts],
      );
    });
  }
}
