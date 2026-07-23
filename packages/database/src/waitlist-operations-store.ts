import { randomUUID } from 'node:crypto';

import type { PoolClient } from 'pg';

import type { DatabaseClient } from './client.js';
import type {
  WaitlistNotificationTemplateData,
  WaitlistNotificationType,
} from './notification-store.js';

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
  no_recipient_count: number;
  pending_delivery_count: number;
}

export type WaitlistNotificationIssueType = 'NO_ELIGIBLE_RECIPIENT' | 'DELIVERY_FAILED';

export interface WaitlistNotificationIssueRecord {
  attempt_count: number;
  camper_name: string;
  family_name: string;
  id: string;
  issue_type: WaitlistNotificationIssueType;
  notification_type: WaitlistNotificationType;
  observed_at: string;
  recipient_hint: string | null;
  replay_count: number;
  session_name: string;
}

export interface ReplayWaitlistNotificationContext {
  actorId: string;
  organizationId: string;
  requestId: string;
}

export interface ReplayWaitlistNotificationResult {
  issue_id: string;
  issue_open: boolean;
  issue_type: WaitlistNotificationIssueType;
  queued_count: number;
  replayed_at: string;
}

export class WaitlistNotificationIssueNotFoundError extends Error {}

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
  no_recipient_count: number;
  offers_created_count: number;
  pending_delivery_count: number;
  reminders_queued_count: number;
  sessions_scanned_count: number;
}

interface WaitlistNotificationIssueRow {
  attempt_count: number;
  camper_name: string;
  family_name: string;
  id: string;
  issue_type: WaitlistNotificationIssueType;
  notification_type: WaitlistNotificationType;
  observed_at: Date;
  recipient_email: string | null;
  replay_count: number;
  session_name: string;
}

interface NotificationCoverageIssueReplayRow {
  family_id: string;
  notification_type: WaitlistNotificationType;
  replay_count: number;
  template_data: WaitlistNotificationTemplateData;
  waitlist_offer_id: string;
}

function timestamp(value: Date | null): string | null {
  return value ? value.toISOString() : null;
}

function recipientHint(email: string | null): string | null {
  if (!email) return null;
  const separator = email.lastIndexOf('@');
  return separator >= 0 ? `***${email.slice(separator)}` : 'Address withheld';
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
               OR COALESCE(backlog.no_recipient_count, 0) > 0
               OR COALESCE(backlog.expired_offer_count, 0) > 0
               THEN 'DEGRADED'
             ELSE 'HEALTHY'
           END AS health,
           status.last_completed_at,
           status.last_error_code,
           status.last_started_at,
           status.last_succeeded_at,
           COALESCE(backlog.no_recipient_count, 0)::integer AS no_recipient_count,
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
               FROM notification_coverage_issues coverage
               WHERE coverage.organization_id = $1
                 AND coverage.status = 'OPEN'
             ) AS no_recipient_count,
             (
               SELECT count(*)::integer
               FROM waitlist_offers offers
               WHERE offers.organization_id = $1
                 AND offers.status = 'PENDING'
                 AND offers.expires_at <= transaction_timestamp()
             ) AS expired_offer_count
           FROM notification_outbox outbox
           WHERE outbox.organization_id = $1
             AND outbox.notification_type IN (
               'WAITLIST_OFFERED',
               'WAITLIST_EXPIRING_SOON',
               'WAITLIST_ACCEPTED',
               'WAITLIST_DECLINED',
               'WAITLIST_EXPIRED',
               'WAITLIST_CANCELLED'
             )
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

  async listNotificationIssues(
    organizationId: string,
    limit = 20,
  ): Promise<WaitlistNotificationIssueRecord[]> {
    return this.withTenant(organizationId, async (client) => {
      const result = await client.query<WaitlistNotificationIssueRow>(
        `SELECT *
         FROM (
           SELECT
             coverage.id,
             'NO_ELIGIBLE_RECIPIENT'::text AS issue_type,
             coverage.notification_type,
             coverage.template_data->>'camper_name' AS camper_name,
             coverage.template_data->>'family_name' AS family_name,
             coverage.template_data->>'session_name' AS session_name,
             NULL::text AS recipient_email,
             0::integer AS attempt_count,
             coverage.replay_count,
             coverage.last_observed_at AS observed_at
           FROM notification_coverage_issues coverage
           WHERE coverage.organization_id = $1
             AND coverage.status = 'OPEN'
             AND coverage.notification_type IN (
               'WAITLIST_OFFERED',
               'WAITLIST_EXPIRING_SOON',
               'WAITLIST_ACCEPTED',
               'WAITLIST_DECLINED',
               'WAITLIST_EXPIRED',
               'WAITLIST_CANCELLED'
             )

           UNION ALL

           SELECT
             outbox.id,
             'DELIVERY_FAILED'::text AS issue_type,
             outbox.notification_type,
             outbox.template_data->>'camper_name' AS camper_name,
             outbox.template_data->>'family_name' AS family_name,
             outbox.template_data->>'session_name' AS session_name,
             outbox.recipient_email,
             outbox.attempt_count,
             0::integer AS replay_count,
             outbox.updated_at AS observed_at
           FROM notification_outbox outbox
           WHERE outbox.organization_id = $1
             AND outbox.status = 'FAILED'
             AND outbox.notification_type IN (
               'WAITLIST_OFFERED',
               'WAITLIST_EXPIRING_SOON',
               'WAITLIST_ACCEPTED',
               'WAITLIST_DECLINED',
               'WAITLIST_EXPIRED',
               'WAITLIST_CANCELLED'
             )
         ) issues
         ORDER BY observed_at DESC, id
         LIMIT $2`,
        [organizationId, limit],
      );
      return result.rows.map((row) => {
        const { recipient_email, ...issue } = row;
        return {
          ...issue,
          observed_at: row.observed_at.toISOString(),
          recipient_hint: recipientHint(recipient_email),
        };
      });
    });
  }

  async replayNotificationIssue(
    context: ReplayWaitlistNotificationContext,
    issueType: WaitlistNotificationIssueType,
    issueId: string,
    reason: string,
  ): Promise<ReplayWaitlistNotificationResult> {
    return this.withTenant(context.organizationId, async (client) => {
      if (issueType === 'DELIVERY_FAILED') {
        return this.replayFailedDelivery(client, context, issueId, reason);
      }
      return this.replayCoverageIssue(client, context, issueId, reason);
    });
  }

  private async replayFailedDelivery(
    client: PoolClient,
    context: ReplayWaitlistNotificationContext,
    issueId: string,
    reason: string,
  ): Promise<ReplayWaitlistNotificationResult> {
    const failed = await client.query<{ attempt_count: number }>(
      `SELECT attempt_count
       FROM notification_outbox
       WHERE organization_id = $1 AND id = $2 AND status = 'FAILED'
       FOR UPDATE`,
      [context.organizationId, issueId],
    );
    const row = failed.rows[0];
    if (!row) {
      throw new WaitlistNotificationIssueNotFoundError(
        'Failed notification was not found or has already been replayed',
      );
    }
    const updated = await client.query<{ replayed_at: Date }>(
      `UPDATE notification_outbox
       SET status = 'PENDING',
           attempt_count = 0,
           available_at = transaction_timestamp(),
           locked_at = NULL,
           locked_by = NULL,
           last_error = NULL,
           updated_at = transaction_timestamp()
       WHERE organization_id = $1 AND id = $2
       RETURNING updated_at AS replayed_at`,
      [context.organizationId, issueId],
    );
    await this.insertReplayAudit(client, context, issueId, 'notification_outbox', reason, {
      issue_type: 'DELIVERY_FAILED',
      previous_attempt_count: row.attempt_count,
      queued_count: 1,
    });
    const replayedAt = updated.rows[0]?.replayed_at;
    if (!replayedAt) throw new Error('Failed notification replay did not return a timestamp');
    return {
      issue_id: issueId,
      issue_open: false,
      issue_type: 'DELIVERY_FAILED',
      queued_count: 1,
      replayed_at: replayedAt.toISOString(),
    };
  }

  private async replayCoverageIssue(
    client: PoolClient,
    context: ReplayWaitlistNotificationContext,
    issueId: string,
    reason: string,
  ): Promise<ReplayWaitlistNotificationResult> {
    const issue = await client.query<NotificationCoverageIssueReplayRow>(
      `SELECT family_id, notification_type, replay_count, template_data, waitlist_offer_id
       FROM notification_coverage_issues
       WHERE organization_id = $1 AND id = $2 AND status = 'OPEN'
       FOR UPDATE`,
      [context.organizationId, issueId],
    );
    const row = issue.rows[0];
    if (!row) {
      throw new WaitlistNotificationIssueNotFoundError(
        'Notification coverage issue was not found or has already been resolved',
      );
    }
    const recipients = await client.query<{ recipient_email: string; recipient_id: string }>(
      `SELECT recipient_id, recipient_email
       FROM waitlist_notification_recipients
       WHERE organization_id = $1 AND family_id = $2
       ORDER BY recipient_id`,
      [context.organizationId, row.family_id],
    );
    const replayCount = row.replay_count + 1;
    let queuedCount = 0;
    for (const recipient of recipients.rows) {
      const inserted = await client.query(
        `INSERT INTO notification_outbox (
           id,
           organization_id,
           family_id,
           session_id,
           registration_id,
           waitlist_offer_id,
           notification_type,
           recipient_email,
           template_data,
           idempotency_key
         )
         SELECT
           $3,
           issue.organization_id,
           issue.family_id,
           issue.session_id,
           issue.registration_id,
           issue.waitlist_offer_id,
           issue.notification_type,
           $4,
           issue.template_data,
           $5
         FROM notification_coverage_issues issue
         WHERE issue.organization_id = $1 AND issue.id = $2
         ON CONFLICT (organization_id, idempotency_key) DO NOTHING
         RETURNING id`,
        [
          context.organizationId,
          issueId,
          randomUUID(),
          recipient.recipient_email,
          `waitlist:coverage-replay:${issueId}:${replayCount}:${recipient.recipient_id}`,
        ],
      );
      queuedCount += inserted.rowCount ?? 0;
    }
    const issueOpen = recipients.rows.length === 0;
    const updated = await client.query<{ replayed_at: Date }>(
      `UPDATE notification_coverage_issues
       SET status = CASE WHEN $3::boolean THEN 'OPEN' ELSE 'RESOLVED' END,
           replay_count = $4,
           last_observed_at = transaction_timestamp(),
           resolved_at = CASE WHEN $3::boolean THEN NULL ELSE transaction_timestamp() END,
           updated_at = transaction_timestamp()
       WHERE organization_id = $1 AND id = $2
       RETURNING updated_at AS replayed_at`,
      [context.organizationId, issueId, issueOpen, replayCount],
    );
    await this.insertReplayAudit(client, context, issueId, 'notification_coverage_issue', reason, {
      issue_type: 'NO_ELIGIBLE_RECIPIENT',
      queued_count: queuedCount,
      recipient_count: recipients.rows.length,
      replay_count: replayCount,
    });
    const replayedAt = updated.rows[0]?.replayed_at;
    if (!replayedAt) throw new Error('Coverage replay did not return a timestamp');
    return {
      issue_id: issueId,
      issue_open: issueOpen,
      issue_type: 'NO_ELIGIBLE_RECIPIENT',
      queued_count: queuedCount,
      replayed_at: replayedAt.toISOString(),
    };
  }

  private async insertReplayAudit(
    client: PoolClient,
    context: ReplayWaitlistNotificationContext,
    targetId: string,
    targetType: string,
    reason: string,
    details: Record<string, unknown>,
  ): Promise<void> {
    await client.query(
      `INSERT INTO audit_events (
         organization_id, actor_id, action, target_type, target_id, outcome,
         request_id, details
       ) VALUES ($1, $2, 'waitlist.notification_replayed', $3, $4, 'success', $5, $6::jsonb)`,
      [
        context.organizationId,
        context.actorId,
        targetType,
        targetId,
        context.requestId,
        JSON.stringify({ ...details, reason }),
      ],
    );
  }
}
