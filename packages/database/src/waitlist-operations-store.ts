import type { PoolClient } from 'pg';

import type { DatabaseClient } from './client.js';

export interface WaitlistCycleMetrics {
  delivered_count: number;
  delivery_failure_count: number;
  expired_offer_count: number;
  offers_created_count: number;
  reminders_queued_count: number;
  sessions_scanned_count: number;
}

export interface WaitlistOperationsStatusRecord extends WaitlistCycleMetrics {
  consecutive_failures: number;
  expired_offer_backlog_count: number;
  failed_delivery_count: number;
  health: 'HEALTHY' | 'DEGRADED' | 'STALE' | 'NOT_RUNNING';
  last_completed_at: string | null;
  last_error_code: string | null;
  last_started_at: string | null;
  last_succeeded_at: string | null;
  pending_delivery_count: number;
}

interface WaitlistOperationsStatusRow {
  consecutive_failures: number;
  delivered_count: number;
  delivery_failure_count: number;
  expired_offer_backlog_count: number;
  expired_offer_count: number;
  failed_delivery_count: number;
  health: WaitlistOperationsStatusRecord['health'];
  last_completed_at: Date | null;
  last_error_code: string | null;
  last_started_at: Date | null;
  last_succeeded_at: Date | null;
  offers_created_count: number;
  pending_delivery_count: number;
  reminders_queued_count: number;
  sessions_scanned_count: number;
}

function timestamp(value: Date | null): string | null {
  return value ? value.toISOString() : null;
}

export class WaitlistOperationsStore {
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

  async listEnabledOrganizationIds(): Promise<string[]> {
    const result = await this.database.pool.query<{ organization_id: string }>(
      'SELECT organization_id FROM list_waitlist_worker_organizations()',
    );
    return result.rows.map((row) => row.organization_id);
  }

  async recordCycleStarted(organizationId: string, workerId: string): Promise<void> {
    await this.withTenant(organizationId, async (client) => {
      await client.query(
        `INSERT INTO waitlist_worker_status (
           organization_id, worker_id, last_started_at
         ) VALUES ($1, $2, transaction_timestamp())
         ON CONFLICT ON CONSTRAINT waitlist_worker_status_pkey DO UPDATE
         SET worker_id = EXCLUDED.worker_id,
             last_started_at = transaction_timestamp(),
             updated_at = transaction_timestamp()`,
        [organizationId, workerId],
      );
    });
  }

  async recordCycleCompleted(
    organizationId: string,
    workerId: string,
    metrics: WaitlistCycleMetrics,
    errorCode: string | null,
  ): Promise<void> {
    await this.withTenant(organizationId, async (client) => {
      await client.query(
        `INSERT INTO waitlist_worker_status (
           organization_id,
           worker_id,
           last_started_at,
           last_completed_at,
           last_succeeded_at,
           last_failed_at,
           consecutive_failures,
           last_error_code,
           delivered_count,
           delivery_failure_count,
           expired_offer_count,
           offers_created_count,
           reminders_queued_count,
           sessions_scanned_count,
           updated_at
         ) VALUES (
           $1,
           $2,
           transaction_timestamp(),
           transaction_timestamp(),
           CASE WHEN $3::text IS NULL THEN transaction_timestamp() ELSE NULL END,
           CASE WHEN $3::text IS NOT NULL THEN transaction_timestamp() ELSE NULL END,
           CASE WHEN $3::text IS NULL THEN 0 ELSE 1 END,
           $3,
           $4,
           $5,
           $6,
           $7,
           $8,
           $9,
           transaction_timestamp()
         )
         ON CONFLICT ON CONSTRAINT waitlist_worker_status_pkey DO UPDATE
         SET worker_id = EXCLUDED.worker_id,
             last_completed_at = transaction_timestamp(),
             last_succeeded_at = CASE
               WHEN $3::text IS NULL THEN transaction_timestamp()
               ELSE waitlist_worker_status.last_succeeded_at
             END,
             last_failed_at = CASE
               WHEN $3::text IS NOT NULL THEN transaction_timestamp()
               ELSE waitlist_worker_status.last_failed_at
             END,
             consecutive_failures = CASE
               WHEN $3::text IS NULL THEN 0
               ELSE waitlist_worker_status.consecutive_failures + 1
             END,
             last_error_code = $3,
             delivered_count = $4,
             delivery_failure_count = $5,
             expired_offer_count = $6,
             offers_created_count = $7,
             reminders_queued_count = $8,
             sessions_scanned_count = $9,
             updated_at = transaction_timestamp()`,
        [
          organizationId,
          workerId,
          errorCode,
          metrics.delivered_count,
          metrics.delivery_failure_count,
          metrics.expired_offer_count,
          metrics.offers_created_count,
          metrics.reminders_queued_count,
          metrics.sessions_scanned_count,
        ],
      );
    });
  }

  async getStatus(
    organizationId: string,
    staleAfterSeconds: number,
  ): Promise<WaitlistOperationsStatusRecord> {
    return this.withTenant(organizationId, async (client) => {
      const result = await client.query<WaitlistOperationsStatusRow>(
        `SELECT
           COALESCE(status.consecutive_failures, 0)::integer AS consecutive_failures,
           COALESCE(status.delivered_count, 0)::integer AS delivered_count,
           COALESCE(status.delivery_failure_count, 0)::integer AS delivery_failure_count,
           COALESCE(backlog.expired_offer_count, 0)::integer AS expired_offer_backlog_count,
           COALESCE(status.expired_offer_count, 0)::integer AS expired_offer_count,
           COALESCE(backlog.failed_delivery_count, 0)::integer AS failed_delivery_count,
           CASE
             WHEN status.organization_id IS NULL OR status.last_completed_at IS NULL
               THEN 'NOT_RUNNING'
             WHEN status.last_completed_at < transaction_timestamp() - make_interval(secs => $2)
               THEN 'STALE'
             WHEN status.consecutive_failures > 0
               OR COALESCE(backlog.failed_delivery_count, 0) > 0
               OR COALESCE(backlog.expired_offer_count, 0) > 0
               THEN 'DEGRADED'
             ELSE 'HEALTHY'
           END AS health,
           status.last_completed_at,
           status.last_error_code,
           status.last_started_at,
           status.last_succeeded_at,
           COALESCE(status.offers_created_count, 0)::integer AS offers_created_count,
           COALESCE(backlog.pending_delivery_count, 0)::integer AS pending_delivery_count,
           COALESCE(status.reminders_queued_count, 0)::integer AS reminders_queued_count,
           COALESCE(status.sessions_scanned_count, 0)::integer AS sessions_scanned_count
         FROM (SELECT $1::uuid AS organization_id) tenant
         LEFT JOIN waitlist_worker_status status USING (organization_id)
         LEFT JOIN LATERAL (
           SELECT
             count(*) FILTER (WHERE outbox.status IN ('PENDING', 'PROCESSING'))::integer
               AS pending_delivery_count,
             count(*) FILTER (WHERE outbox.status = 'FAILED')::integer
               AS failed_delivery_count,
             (
               SELECT count(*)::integer
               FROM waitlist_offers offers
               WHERE offers.organization_id = $1
                 AND offers.status = 'PENDING'
                 AND offers.expires_at <= transaction_timestamp()
             ) AS expired_offer_count
           FROM notification_outbox outbox
           WHERE outbox.organization_id = $1
         ) backlog ON true`,
        [organizationId, staleAfterSeconds],
      );
      const row = result.rows[0];
      if (!row) throw new Error('Waitlist operations status query returned no result');
      return {
        ...row,
        last_completed_at: timestamp(row.last_completed_at),
        last_started_at: timestamp(row.last_started_at),
        last_succeeded_at: timestamp(row.last_succeeded_at),
      };
    });
  }
}
