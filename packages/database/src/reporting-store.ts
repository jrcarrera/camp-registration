import { randomUUID } from 'node:crypto';

import type { PoolClient } from 'pg';

import type { DatabaseClient } from './client.js';

export type OperationalReportPreset =
  | 'SESSION_ROSTER'
  | 'CHECK_IN_SHEET'
  | 'CONTACT_LIST'
  | 'BALANCE_DUE'
  | 'WAITLIST'
  | 'READINESS'
  | 'ATTENDANCE'
  | 'PICKUP_SHEET'
  | 'CAMPER_LABELS';
export type OperationalReportFormat = 'CSV' | 'XLSX' | 'PRINT';
export type OperationalRegistrationStatus = 'ALL' | 'CONFIRMED' | 'WAITLISTED' | 'CANCELLED';

export interface OperationalReportFiltersRecord {
  end_date: string | null;
  registration_status: OperationalRegistrationStatus;
  session_ids: string[];
  start_date: string | null;
}

export interface OperationalReportContext {
  actorId: string;
  organizationId: string;
  requestId: string;
}

export interface OperationalReportViewRecord {
  created_at: string;
  created_by: string;
  default_format: OperationalReportFormat;
  filters: OperationalReportFiltersRecord;
  id: string;
  name: string;
  preset: OperationalReportPreset;
  updated_at: string;
  version: number;
}

export interface OperationalReportViewWrite {
  default_format: OperationalReportFormat;
  filters: OperationalReportFiltersRecord;
  id?: string;
  name: string;
  preset: OperationalReportPreset;
  version?: number;
}

export interface OperationalReportRowRecord {
  adult_emails: string;
  adult_names: string;
  adult_phones: string;
  attendance_date: string | null;
  attendance_note: string | null;
  attendance_status: string;
  authorized_pickups: string;
  balance_due_cents: number;
  birth_date: string;
  camper_name: string;
  checked_in_at: string | null;
  checked_out_at: string | null;
  emergency_contacts: string;
  family_name: string;
  form_assigned_count: number;
  form_missing_count: number;
  form_submitted_count: number;
  gender: string | null;
  payment_status: string;
  pickup_name: string | null;
  preferred_name: string | null;
  registered_at: string;
  registration_id: string;
  registration_source: string;
  registration_status: 'CONFIRMED' | 'WAITLISTED' | 'CANCELLED';
  school_grade: string | null;
  session_code: string;
  session_ends_on: string;
  session_id: string;
  session_name: string;
  session_starts_on: string;
  support_note_on_file: boolean;
}

export interface SeasonPerformanceRecord {
  cancelled_registrations: number;
  capacity: number;
  confirmed_registrations: number;
  net_collected_cents: number;
  outstanding_balance_cents: number;
  payments_collected_cents: number;
  refunds_cents: number;
  season_id: string;
  season_name: string;
  session_count: number;
  tuition_booked_cents: number;
  unique_confirmed_campers: number;
  waitlisted_registrations: number;
  year: number;
}

export interface SeasonComparisonOptionRecord {
  id: string;
  name: string;
  year: number;
}

export interface SeasonComparisonRecord {
  returning_campers: number;
  seasons: SeasonPerformanceRecord[];
}

export class OperationalReportNotFoundError extends Error {}
export class OperationalReportConflictError extends Error {}

interface ViewRow extends Omit<OperationalReportViewRecord, 'created_at' | 'updated_at'> {
  created_at: Date;
  updated_at: Date;
}

interface ReportRow extends Omit<
  OperationalReportRowRecord,
  | 'attendance_date'
  | 'birth_date'
  | 'checked_in_at'
  | 'checked_out_at'
  | 'registered_at'
  | 'session_ends_on'
  | 'session_starts_on'
> {
  attendance_date: Date | null;
  birth_date: Date | string;
  checked_in_at: Date | null;
  checked_out_at: Date | null;
  registered_at: Date;
  session_ends_on: Date | string;
  session_starts_on: Date | string;
}

interface SeasonPerformanceRow extends Omit<
  SeasonPerformanceRecord,
  | 'net_collected_cents'
  | 'outstanding_balance_cents'
  | 'payments_collected_cents'
  | 'refunds_cents'
  | 'tuition_booked_cents'
> {
  net_collected_cents: number | string;
  outstanding_balance_cents: number | string;
  payments_collected_cents: number | string;
  refunds_cents: number | string;
  tuition_booked_cents: number | string;
}

function date(value: Date | string): string {
  return value instanceof Date ? value.toISOString().slice(0, 10) : String(value);
}

function iso(value: Date | null): string | null {
  return value?.toISOString() ?? null;
}

function mapView(row: ViewRow): OperationalReportViewRecord {
  return {
    ...row,
    created_at: row.created_at.toISOString(),
    updated_at: row.updated_at.toISOString(),
  };
}

function mapReportRow(row: ReportRow): OperationalReportRowRecord {
  return {
    ...row,
    attendance_date: row.attendance_date ? date(row.attendance_date) : null,
    birth_date: date(row.birth_date),
    checked_in_at: iso(row.checked_in_at),
    checked_out_at: iso(row.checked_out_at),
    registered_at: row.registered_at.toISOString(),
    session_ends_on: date(row.session_ends_on),
    session_starts_on: date(row.session_starts_on),
  };
}

function mapSeasonPerformance(row: SeasonPerformanceRow): SeasonPerformanceRecord {
  return {
    ...row,
    net_collected_cents: Number(row.net_collected_cents),
    outstanding_balance_cents: Number(row.outstanding_balance_cents),
    payments_collected_cents: Number(row.payments_collected_cents),
    refunds_cents: Number(row.refunds_cents),
    tuition_booked_cents: Number(row.tuition_booked_cents),
  };
}

export class ReportingStore {
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

  async listViews(organizationId: string): Promise<OperationalReportViewRecord[]> {
    return this.withTenant(organizationId, async (client) => {
      const result = await client.query<ViewRow>(
        `SELECT id, name, preset, filters, default_format, version, created_by, created_at, updated_at
         FROM operational_report_views
         WHERE organization_id = $1
         ORDER BY lower(name), id`,
        [organizationId],
      );
      return result.rows.map(mapView);
    });
  }

  async listSeasonComparisonOptions(
    organizationId: string,
  ): Promise<SeasonComparisonOptionRecord[]> {
    return this.withTenant(organizationId, async (client) => {
      const result = await client.query<SeasonComparisonOptionRecord>(
        `SELECT id, name, year
         FROM seasons
         WHERE organization_id = $1
         ORDER BY year DESC, lower(name), id`,
        [organizationId],
      );
      return result.rows;
    });
  }

  async compareSeasons(
    context: OperationalReportContext,
    primarySeasonId: string,
    comparisonSeasonId: string,
  ): Promise<SeasonComparisonRecord> {
    return this.withTenant(context.organizationId, async (client) => {
      const result = await client.query<SeasonPerformanceRow>(
        `WITH requested_seasons AS (
           SELECT id, name, year
           FROM seasons
           WHERE organization_id = $1
             AND id = ANY($2::uuid[])
         ),
         session_metrics AS (
           SELECT
             requested.id AS season_id,
             count(session.id) FILTER (WHERE session.status <> 'CANCELLED')::integer
               AS session_count,
             COALESCE(
               sum(session.capacity) FILTER (WHERE session.status <> 'CANCELLED'),
               0
             )::integer AS capacity
           FROM requested_seasons requested
           LEFT JOIN sessions session
             ON session.organization_id = $1
            AND session.season_id = requested.id
           GROUP BY requested.id
         ),
         registration_ledger AS (
           SELECT
             session.season_id,
             registration.id,
             registration.camper_id,
             registration.status,
             registration.price_cents,
             COALESCE(ledger.balance_credit_cents, 0)::bigint AS balance_credit_cents,
             GREATEST(COALESCE(ledger.payments_collected_cents, 0), 0)::bigint
               AS payments_collected_cents,
             COALESCE(refunds.refunds_cents, 0)::bigint AS refunds_cents
           FROM registrations registration
           JOIN sessions session
             ON session.organization_id = registration.organization_id
            AND session.id = registration.session_id
           JOIN requested_seasons requested ON requested.id = session.season_id
           LEFT JOIN LATERAL (
             SELECT
               COALESCE(sum(payment.amount_cents), 0)::bigint AS balance_credit_cents,
               COALESCE(sum(payment.amount_cents) FILTER (
                 WHERE payment.method IN (
                   'OFFLINE_CASH', 'OFFLINE_CHECK', 'OFFLINE_CARD', 'ONLINE_CARD', 'OTHER'
                 )
               ), 0)::bigint AS payments_collected_cents
             FROM registration_payments payment
             WHERE payment.organization_id = registration.organization_id
               AND payment.registration_id = registration.id
           ) ledger ON true
           LEFT JOIN LATERAL (
             SELECT COALESCE(sum(adjustment.amount_cents), 0)::bigint AS refunds_cents
             FROM payment_adjustments adjustment
             WHERE adjustment.organization_id = registration.organization_id
               AND adjustment.registration_id = registration.id
               AND adjustment.adjustment_type = 'REFUND'
               AND adjustment.status = 'SUCCEEDED'
           ) refunds ON true
           WHERE registration.organization_id = $1
         ),
         registration_metrics AS (
           SELECT
             requested.id AS season_id,
             count(ledger.id) FILTER (WHERE ledger.status = 'CONFIRMED')::integer
               AS confirmed_registrations,
             count(ledger.id) FILTER (WHERE ledger.status = 'WAITLISTED')::integer
               AS waitlisted_registrations,
             count(ledger.id) FILTER (WHERE ledger.status = 'CANCELLED')::integer
               AS cancelled_registrations,
             count(DISTINCT ledger.camper_id) FILTER (WHERE ledger.status = 'CONFIRMED')::integer
               AS unique_confirmed_campers,
             COALESCE(
               sum(ledger.price_cents) FILTER (WHERE ledger.status = 'CONFIRMED'),
               0
             )::bigint AS tuition_booked_cents,
             COALESCE(sum(ledger.payments_collected_cents), 0)::bigint
               AS payments_collected_cents,
             COALESCE(sum(ledger.refunds_cents), 0)::bigint AS refunds_cents,
             COALESCE(
               sum(
                 GREATEST(ledger.price_cents - ledger.balance_credit_cents, 0)
               ) FILTER (WHERE ledger.status = 'CONFIRMED'),
               0
             )::bigint AS outstanding_balance_cents
           FROM requested_seasons requested
           LEFT JOIN registration_ledger ledger ON ledger.season_id = requested.id
           GROUP BY requested.id
         )
         SELECT
           requested.id AS season_id,
           requested.name AS season_name,
           requested.year,
           sessions.session_count,
           sessions.capacity,
           registrations.confirmed_registrations,
           registrations.waitlisted_registrations,
           registrations.cancelled_registrations,
           registrations.unique_confirmed_campers,
           registrations.tuition_booked_cents,
           registrations.payments_collected_cents,
           registrations.refunds_cents,
           registrations.payments_collected_cents - registrations.refunds_cents
             AS net_collected_cents,
           registrations.outstanding_balance_cents
         FROM requested_seasons requested
         JOIN session_metrics sessions ON sessions.season_id = requested.id
         JOIN registration_metrics registrations ON registrations.season_id = requested.id
         ORDER BY requested.year DESC, requested.name, requested.id`,
        [context.organizationId, [primarySeasonId, comparisonSeasonId]],
      );

      const returning = await client.query<{ returning_campers: number }>(
        `SELECT count(DISTINCT primary_registration.camper_id)::integer AS returning_campers
         FROM registrations primary_registration
         JOIN sessions primary_session
           ON primary_session.organization_id = primary_registration.organization_id
          AND primary_session.id = primary_registration.session_id
         WHERE primary_registration.organization_id = $1
           AND primary_session.season_id = $2
           AND primary_registration.status = 'CONFIRMED'
           AND EXISTS (
             SELECT 1
             FROM registrations comparison_registration
             JOIN sessions comparison_session
               ON comparison_session.organization_id = comparison_registration.organization_id
              AND comparison_session.id = comparison_registration.session_id
             WHERE comparison_registration.organization_id = primary_registration.organization_id
               AND comparison_registration.camper_id = primary_registration.camper_id
               AND comparison_registration.status = 'CONFIRMED'
               AND comparison_session.season_id = $3
           )`,
        [context.organizationId, primarySeasonId, comparisonSeasonId],
      );

      await this.audit(client, context, 'report.season_comparison_viewed', context.organizationId, {
        comparison_season_id: comparisonSeasonId,
        primary_season_id: primarySeasonId,
      });

      return {
        returning_campers: returning.rows[0]?.returning_campers ?? 0,
        seasons: result.rows.map(mapSeasonPerformance),
      };
    });
  }

  async createView(
    context: OperationalReportContext,
    view: OperationalReportViewWrite,
  ): Promise<OperationalReportViewRecord> {
    return this.withTenant(context.organizationId, async (client) => {
      try {
        const result = await client.query<ViewRow>(
          `INSERT INTO operational_report_views (
             id, organization_id, name, preset, filters, default_format, created_by
           ) VALUES ($1, $2, $3, $4, $5::jsonb, $6, $7)
           RETURNING id, name, preset, filters, default_format, version, created_by, created_at,
                     updated_at`,
          [
            view.id ?? randomUUID(),
            context.organizationId,
            view.name,
            view.preset,
            JSON.stringify(view.filters),
            view.default_format,
            context.actorId,
          ],
        );
        const created = result.rows[0]!;
        await this.audit(client, context, 'report.view_created', created.id, {
          default_format: created.default_format,
          preset: created.preset,
        });
        return mapView(created);
      } catch (error) {
        if ((error as { code?: string }).code === '23505') {
          throw new OperationalReportConflictError('A saved report view already uses that name');
        }
        throw error;
      }
    });
  }

  async updateView(
    context: OperationalReportContext,
    viewId: string,
    view: OperationalReportViewWrite,
  ): Promise<OperationalReportViewRecord> {
    return this.withTenant(context.organizationId, async (client) => {
      try {
        const result = await client.query<ViewRow>(
          `UPDATE operational_report_views
           SET name = $3,
               preset = $4,
               filters = $5::jsonb,
               default_format = $6,
               version = version + 1,
               updated_at = transaction_timestamp()
           WHERE organization_id = $1 AND id = $2 AND version = $7
           RETURNING id, name, preset, filters, default_format, version, created_by, created_at,
                     updated_at`,
          [
            context.organizationId,
            viewId,
            view.name,
            view.preset,
            JSON.stringify(view.filters),
            view.default_format,
            view.version,
          ],
        );
        if (!result.rows[0]) {
          const exists = await client.query(
            'SELECT 1 FROM operational_report_views WHERE organization_id = $1 AND id = $2',
            [context.organizationId, viewId],
          );
          if (exists.rowCount)
            throw new OperationalReportConflictError('Saved view changed; refresh and retry');
          throw new OperationalReportNotFoundError('Saved report view not found');
        }
        await this.audit(client, context, 'report.view_updated', viewId, {
          default_format: view.default_format,
          preset: view.preset,
        });
        return mapView(result.rows[0]);
      } catch (error) {
        if ((error as { code?: string }).code === '23505') {
          throw new OperationalReportConflictError('A saved report view already uses that name');
        }
        throw error;
      }
    });
  }

  async deleteView(context: OperationalReportContext, viewId: string): Promise<void> {
    return this.withTenant(context.organizationId, async (client) => {
      const result = await client.query<{ id: string }>(
        `DELETE FROM operational_report_views
         WHERE organization_id = $1 AND id = $2
         RETURNING id`,
        [context.organizationId, viewId],
      );
      if (!result.rows[0]) throw new OperationalReportNotFoundError('Saved report view not found');
      await this.audit(client, context, 'report.view_deleted', viewId, {});
    });
  }

  async listRows(
    organizationId: string,
    filters: OperationalReportFiltersRecord,
  ): Promise<OperationalReportRowRecord[]> {
    return this.withTenant(organizationId, async (client) => {
      const result = await client.query<ReportRow>(
        `SELECT
           r.id AS registration_id,
           r.status AS registration_status,
           r.source AS registration_source,
           r.registered_at,
           s.id AS session_id,
           s.code AS session_code,
           s.name AS session_name,
           s.starts_on AS session_starts_on,
           s.ends_on AS session_ends_on,
           concat_ws(' ', c.first_name, c.last_name) AS camper_name,
           c.preferred_name,
           c.birth_date::text AS birth_date,
           c.gender,
           c.school_grade,
           (c.accessibility_needs IS NOT NULL AND btrim(c.accessibility_needs) <> '') AS support_note_on_file,
           f.family_name,
           COALESCE(adults.names, '') AS adult_names,
           COALESCE(adults.emails, '') AS adult_emails,
           COALESCE(adults.phones, '') AS adult_phones,
           COALESCE(contacts.emergency_contacts, '') AS emergency_contacts,
           COALESCE(pickups.authorized_pickups, '') AS authorized_pickups,
           COALESCE(forms.assigned_count, 0)::int AS form_assigned_count,
           COALESCE(forms.submitted_count, 0)::int AS form_submitted_count,
           COALESCE(forms.assigned_count - forms.submitted_count, 0)::int AS form_missing_count,
           attendance.attendance_date,
           COALESCE(attendance.status, 'NOT_MARKED') AS attendance_status,
           attendance.checked_in_at,
           attendance.checked_out_at,
           attendance.pickup_name,
           attendance.note AS attendance_note,
           GREATEST(COALESCE(line.net_price_cents, r.price_cents) - COALESCE(payments.paid_cents, 0), 0)::int
             AS balance_due_cents,
           CASE
             WHEN COALESCE(line.net_price_cents, r.price_cents) <= COALESCE(payments.paid_cents, 0) THEN 'PAID'
             WHEN COALESCE(payments.paid_cents, 0) > 0 THEN 'PARTIAL'
             WHEN COALESCE(line.net_price_cents, r.price_cents) = 0 THEN 'NOT_DUE'
             ELSE 'DUE'
           END AS payment_status
         FROM registrations r
         JOIN sessions s ON s.organization_id = r.organization_id AND s.id = r.session_id
         JOIN campers c ON c.organization_id = r.organization_id AND c.id = r.camper_id
         JOIN families f ON f.organization_id = r.organization_id AND f.id = r.family_id
         LEFT JOIN household_order_lines line
           ON line.organization_id = r.organization_id AND line.registration_id = r.id
         LEFT JOIN LATERAL (
           SELECT COALESCE(sum(payment.amount_cents), 0)::int AS paid_cents
           FROM registration_payments payment
           WHERE payment.organization_id = r.organization_id AND payment.registration_id = r.id
         ) payments ON true
         LEFT JOIN LATERAL (
           SELECT
             string_agg(concat_ws(' ', adult.first_name, adult.last_name), '; ' ORDER BY adult.account_owner DESC, adult.last_name, adult.first_name) AS names,
             string_agg(adult.email, '; ' ORDER BY adult.account_owner DESC, adult.last_name, adult.first_name) FILTER (WHERE adult.email IS NOT NULL) AS emails,
             string_agg(adult.phone, '; ' ORDER BY adult.account_owner DESC, adult.last_name, adult.first_name) FILTER (WHERE adult.phone IS NOT NULL) AS phones
           FROM adults adult
           WHERE adult.organization_id = r.organization_id
             AND adult.family_id = r.family_id
             AND adult.archived_at IS NULL
         ) adults ON true
         LEFT JOIN LATERAL (
           SELECT string_agg(
             concat_ws(' ', contact.first_name, contact.last_name) || ' (' || contact.phone || ')',
             '; ' ORDER BY contact.emergency_priority NULLS LAST, contact.last_name, contact.first_name
           ) AS emergency_contacts
           FROM contacts contact
           WHERE contact.organization_id = r.organization_id
             AND contact.family_id = r.family_id
             AND contact.emergency_contact
             AND contact.archived_at IS NULL
         ) contacts ON true
         LEFT JOIN LATERAL (
           SELECT string_agg(name, '; ' ORDER BY name) AS authorized_pickups
           FROM (
             SELECT concat_ws(' ', adult.first_name, adult.last_name) AS name
             FROM adults adult
             WHERE adult.organization_id = r.organization_id
               AND adult.family_id = r.family_id
               AND adult.authorized_pickup
               AND adult.archived_at IS NULL
             UNION
             SELECT concat_ws(' ', contact.first_name, contact.last_name) AS name
             FROM contacts contact
             WHERE contact.organization_id = r.organization_id
               AND contact.family_id = r.family_id
               AND contact.authorized_pickup
               AND contact.archived_at IS NULL
           ) pickup_names
         ) pickups ON true
         LEFT JOIN LATERAL (
           SELECT
             count(assignment.id)::int AS assigned_count,
             count(submission.id) FILTER (WHERE submission.status = 'SUBMITTED')::int AS submitted_count
           FROM form_assignments assignment
           LEFT JOIN form_submissions submission
             ON submission.organization_id = assignment.organization_id
             AND submission.assignment_id = assignment.id
             AND submission.registration_id = r.id
           WHERE assignment.organization_id = r.organization_id AND assignment.session_id = r.session_id
         ) forms ON true
         LEFT JOIN LATERAL (
           SELECT attendance_date, status, checked_in_at, checked_out_at, pickup_name, note
           FROM registration_attendance entry
           WHERE entry.organization_id = r.organization_id AND entry.registration_id = r.id
           ORDER BY attendance_date DESC, updated_at DESC
           LIMIT 1
         ) attendance ON true
         WHERE r.organization_id = $1
           AND (cardinality($2::uuid[]) = 0 OR r.session_id = ANY($2::uuid[]))
           AND ($3::date IS NULL OR s.starts_on >= $3::date)
           AND ($4::date IS NULL OR s.starts_on <= $4::date)
           AND ($5::text = 'ALL' OR r.status = $5::text)
         ORDER BY s.starts_on, lower(s.name), lower(c.last_name), lower(c.first_name), r.id`,
        [
          organizationId,
          filters.session_ids,
          filters.start_date,
          filters.end_date,
          filters.registration_status,
        ],
      );
      return result.rows.map(mapReportRow);
    });
  }

  async recordExport(
    context: OperationalReportContext,
    preset: OperationalReportPreset,
    format: Exclude<OperationalReportFormat, 'PRINT'>,
    filters: OperationalReportFiltersRecord,
    rowCount: number,
  ): Promise<void> {
    return this.withTenant(context.organizationId, async (client) => {
      await this.audit(client, context, 'report.operational_exported', context.organizationId, {
        filter_end_date: filters.end_date,
        filter_session_count: filters.session_ids.length,
        filter_start_date: filters.start_date,
        format,
        preset,
        registration_status: filters.registration_status,
        row_count: rowCount,
      });
    });
  }

  private async audit(
    client: PoolClient,
    context: OperationalReportContext,
    action: string,
    targetId: string | null,
    details: Record<string, unknown>,
  ): Promise<void> {
    await client.query(
      `INSERT INTO audit_events (
         organization_id, actor_id, action, target_type, target_id, outcome, request_id, details
       ) VALUES ($1, $2, $3, 'operational_report', $4, 'success', $5, $6::jsonb)`,
      [
        context.organizationId,
        context.actorId,
        action,
        targetId,
        context.requestId,
        JSON.stringify(details),
      ],
    );
  }
}
