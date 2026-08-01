import type { PoolClient } from 'pg';

import type { DatabaseClient } from './client.js';

export type MedicationScheduleType = 'SCHEDULED' | 'PRN';
export type MedicationOrderStatus = 'ACTIVE' | 'DISCONTINUED';
export type MedicationAdministrationOutcome = 'GIVEN' | 'REFUSED' | 'HELD' | 'MISSED';

export interface MedicationAdministrationContext {
  actorId: string;
  organizationId: string;
  requestId: string;
}

export interface MedicationCandidateRecord {
  camper_id: string;
  camper_name: string;
  family_name: string;
  session_id: string;
  session_name: string;
}

export interface EncryptedMedicationOrderRecord {
  authentication_tag: Buffer;
  camper_id: string;
  camper_name: string;
  created_at: string;
  discontinued_at: string | null;
  encrypted_payload: Buffer;
  encryption_nonce: Buffer;
  ends_on: string;
  id: string;
  key_version: number;
  schedule_type: MedicationScheduleType;
  session_id: string;
  session_name: string;
  starts_on: string;
  status: MedicationOrderStatus;
  version: number;
}

export interface EncryptedMedicationAdministrationRecord {
  administered_at: string;
  administered_by: string;
  authentication_tag: Buffer;
  camper_id: string;
  encrypted_payload: Buffer;
  encryption_nonce: Buffer;
  id: string;
  key_version: number;
  order_id: string;
  outcome: MedicationAdministrationOutcome;
  scheduled_for: string | null;
}

export interface EncryptedMedicationOrderWrite {
  authentication_tag: Buffer;
  camper_id: string;
  encrypted_payload: Buffer;
  encryption_nonce: Buffer;
  ends_on: string;
  id: string;
  key_version: number;
  schedule_type: MedicationScheduleType;
  session_id: string;
  starts_on: string;
}

export interface EncryptedMedicationAdministrationWrite {
  administered_at: string;
  authentication_tag: Buffer;
  encrypted_payload: Buffer;
  encryption_nonce: Buffer;
  id: string;
  key_version: number;
  outcome: MedicationAdministrationOutcome;
  scheduled_for: string | null;
}

interface OrderRow extends Omit<
  EncryptedMedicationOrderRecord,
  'created_at' | 'discontinued_at' | 'ends_on' | 'starts_on'
> {
  created_at: Date;
  discontinued_at: Date | null;
  ends_on: string | Date;
  starts_on: string | Date;
}

interface AdministrationRow extends Omit<
  EncryptedMedicationAdministrationRecord,
  'administered_at' | 'scheduled_for'
> {
  administered_at: Date;
  scheduled_for: Date | null;
}

export class MedicationAdministrationConflictError extends Error {}
export class MedicationAdministrationNotFoundError extends Error {}
export class MedicationAdministrationValidationError extends Error {}

function localDate(value: string | Date): string {
  return typeof value === 'string' ? value : value.toISOString().slice(0, 10);
}

function mapOrder(row: OrderRow): EncryptedMedicationOrderRecord {
  return {
    ...row,
    created_at: row.created_at.toISOString(),
    discontinued_at: row.discontinued_at?.toISOString() ?? null,
    ends_on: localDate(row.ends_on),
    starts_on: localDate(row.starts_on),
  };
}

function mapAdministration(row: AdministrationRow): EncryptedMedicationAdministrationRecord {
  return {
    ...row,
    administered_at: row.administered_at.toISOString(),
    scheduled_for: row.scheduled_for?.toISOString() ?? null,
  };
}

export class MedicationAdministrationStore {
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

  async getOrganizationTimezone(organizationId: string): Promise<string> {
    return this.withTenant(organizationId, async (client) => {
      const result = await client.query<{ timezone: string }>(
        `SELECT timezone FROM organizations WHERE id = $1`,
        [organizationId],
      );
      const timezone = result.rows[0]?.timezone;
      if (!timezone) {
        throw new MedicationAdministrationNotFoundError('Organization not found');
      }
      return timezone;
    });
  }

  async listCandidates(organizationId: string): Promise<MedicationCandidateRecord[]> {
    return this.withTenant(organizationId, async (client) => {
      const result = await client.query<MedicationCandidateRecord>(
        `SELECT DISTINCT
           c.id AS camper_id,
           concat_ws(' ', COALESCE(c.preferred_name, c.first_name), c.last_name) AS camper_name,
           f.family_name,
           s.id AS session_id,
           s.name AS session_name
         FROM registrations r
         JOIN campers c
           ON c.organization_id = r.organization_id
          AND c.id = r.camper_id
          AND c.archived_at IS NULL
         JOIN families f
           ON f.organization_id = c.organization_id
          AND f.id = c.family_id
          AND f.archived_at IS NULL
         JOIN sessions s
           ON s.organization_id = r.organization_id
          AND s.id = r.session_id
          AND s.status <> 'ARCHIVED'
         WHERE r.organization_id = $1
           AND r.status = 'CONFIRMED'
         ORDER BY session_name, camper_name, camper_id`,
        [organizationId],
      );
      return result.rows;
    });
  }

  async listOrders(
    organizationId: string,
    date: string,
    sessionId?: string,
  ): Promise<EncryptedMedicationOrderRecord[]> {
    return this.withTenant(organizationId, async (client) => {
      const values = sessionId ? [organizationId, date, sessionId] : [organizationId, date];
      const sessionFilter = sessionId ? 'AND o.session_id = $3' : '';
      const result = await client.query<OrderRow>(
        `SELECT
           o.id,
           o.camper_id,
           concat_ws(' ', COALESCE(c.preferred_name, c.first_name), c.last_name) AS camper_name,
           o.session_id,
           s.name AS session_name,
           o.schedule_type,
           o.status,
           o.starts_on,
           o.ends_on,
           o.encrypted_payload,
           o.encryption_nonce,
           o.authentication_tag,
           o.key_version,
           o.version,
           o.created_at,
           o.discontinued_at
         FROM camper_medication_orders o
         JOIN campers c
           ON c.organization_id = o.organization_id AND c.id = o.camper_id
         JOIN sessions s
           ON s.organization_id = o.organization_id AND s.id = o.session_id
         WHERE o.organization_id = $1
           AND o.starts_on <= $2::date
           AND o.ends_on >= $2::date
           ${sessionFilter}
         ORDER BY camper_name, session_name, o.created_at, o.id`,
        values,
      );
      return result.rows.map(mapOrder);
    });
  }

  async getOrder(
    organizationId: string,
    orderId: string,
  ): Promise<EncryptedMedicationOrderRecord | null> {
    return this.withTenant(organizationId, async (client) => {
      const row = await this.selectOrder(client, organizationId, orderId);
      return row ? mapOrder(row) : null;
    });
  }

  async listAdministrations(
    organizationId: string,
    startsAt: string,
    endsAt: string,
    sessionId?: string,
  ): Promise<EncryptedMedicationAdministrationRecord[]> {
    return this.withTenant(organizationId, async (client) => {
      const values = sessionId
        ? [organizationId, startsAt, endsAt, sessionId]
        : [organizationId, startsAt, endsAt];
      const sessionFilter = sessionId ? 'AND o.session_id = $4' : '';
      const result = await client.query<AdministrationRow>(
        `SELECT
           a.id,
           a.order_id,
           a.camper_id,
           a.outcome,
           a.scheduled_for,
           a.administered_at,
           a.encrypted_payload,
           a.encryption_nonce,
           a.authentication_tag,
           a.key_version,
           a.administered_by
         FROM camper_medication_administrations a
         JOIN camper_medication_orders o
           ON o.organization_id = a.organization_id AND o.id = a.order_id
         WHERE a.organization_id = $1
           AND (
             (a.scheduled_for >= $2::timestamptz AND a.scheduled_for < $3::timestamptz)
             OR
             (a.scheduled_for IS NULL
              AND a.administered_at >= $2::timestamptz
              AND a.administered_at < $3::timestamptz)
           )
           ${sessionFilter}
         ORDER BY COALESCE(a.scheduled_for, a.administered_at), a.id`,
        values,
      );
      return result.rows.map(mapAdministration);
    });
  }

  async createOrder(
    context: MedicationAdministrationContext,
    order: EncryptedMedicationOrderWrite,
  ): Promise<void> {
    await this.withTenant(context.organizationId, async (client) => {
      const registration = await client.query<{ family_id: string }>(
        `SELECT c.family_id
         FROM registrations r
         JOIN campers c
           ON c.organization_id = r.organization_id
          AND c.id = r.camper_id
          AND c.archived_at IS NULL
         JOIN sessions s
           ON s.organization_id = r.organization_id
          AND s.id = r.session_id
          AND s.status <> 'ARCHIVED'
         WHERE r.organization_id = $1
           AND r.camper_id = $2
           AND r.session_id = $3
           AND r.status = 'CONFIRMED'
         LIMIT 1`,
        [context.organizationId, order.camper_id, order.session_id],
      );
      const familyId = registration.rows[0]?.family_id;
      if (!familyId) {
        throw new MedicationAdministrationValidationError(
          'The camper must have a confirmed registration in the selected session',
        );
      }
      await client.query(
        `INSERT INTO camper_medication_orders (
           id, organization_id, family_id, camper_id, session_id, schedule_type,
           starts_on, ends_on, encrypted_payload, encryption_nonce, authentication_tag,
           key_version, created_by
         ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)`,
        [
          order.id,
          context.organizationId,
          familyId,
          order.camper_id,
          order.session_id,
          order.schedule_type,
          order.starts_on,
          order.ends_on,
          order.encrypted_payload,
          order.encryption_nonce,
          order.authentication_tag,
          order.key_version,
          context.actorId,
        ],
      );
      await this.audit(client, context, 'health.medication_order_created', order.id, 'success', {
        schedule_type: order.schedule_type,
        session_id: order.session_id,
      });
    });
  }

  async recordAdministration(
    context: MedicationAdministrationContext,
    orderId: string,
    administration: EncryptedMedicationAdministrationWrite,
  ): Promise<void> {
    await this.withTenant(context.organizationId, async (client) => {
      const order = await this.lockOrder(client, context.organizationId, orderId);
      if (order.status !== 'ACTIVE') {
        throw new MedicationAdministrationValidationError(
          'Discontinued medication orders cannot receive administrations',
        );
      }
      try {
        await client.query(
          `INSERT INTO camper_medication_administrations (
             id, organization_id, order_id, camper_id, outcome, scheduled_for,
             administered_at, encrypted_payload, encryption_nonce, authentication_tag,
             key_version, administered_by
           ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)`,
          [
            administration.id,
            context.organizationId,
            orderId,
            order.camper_id,
            administration.outcome,
            administration.scheduled_for,
            administration.administered_at,
            administration.encrypted_payload,
            administration.encryption_nonce,
            administration.authentication_tag,
            administration.key_version,
            context.actorId,
          ],
        );
      } catch (error) {
        if ((error as { code?: string }).code === '23505') {
          throw new MedicationAdministrationConflictError(
            'This scheduled dose already has an administration record',
          );
        }
        throw error;
      }
      await this.audit(
        client,
        context,
        'health.medication_administration_recorded',
        administration.id,
        'success',
        {
          order_id: orderId,
          outcome: administration.outcome,
          scheduled: Boolean(administration.scheduled_for),
        },
      );
    });
  }

  async discontinue(
    context: MedicationAdministrationContext,
    orderId: string,
    expectedVersion: number,
  ): Promise<void> {
    await this.withTenant(context.organizationId, async (client) => {
      const order = await this.lockOrder(client, context.organizationId, orderId);
      if (order.status !== 'ACTIVE') {
        throw new MedicationAdministrationValidationError(
          'The medication order is already discontinued',
        );
      }
      if (order.version !== expectedVersion) {
        throw new MedicationAdministrationConflictError(
          'The medication order was updated by another request',
        );
      }
      await client.query(
        `UPDATE camper_medication_orders
         SET status = 'DISCONTINUED', version = version + 1, discontinued_by = $3,
             discontinued_at = transaction_timestamp(), updated_at = transaction_timestamp()
         WHERE organization_id = $1 AND id = $2`,
        [context.organizationId, orderId, context.actorId],
      );
      await this.audit(
        client,
        context,
        'health.medication_order_discontinued',
        orderId,
        'success',
        { version: expectedVersion + 1 },
      );
    });
  }

  async recordAudit(
    context: MedicationAdministrationContext,
    action: string,
    targetId: string,
    outcome: 'success' | 'denied' | 'failure',
    details: Record<string, unknown> = {},
  ): Promise<void> {
    await this.withTenant(context.organizationId, (client) =>
      this.audit(client, context, action, targetId, outcome, details),
    );
  }

  private async selectOrder(
    client: PoolClient,
    organizationId: string,
    orderId: string,
  ): Promise<OrderRow | undefined> {
    const result = await client.query<OrderRow>(
      `SELECT
         o.id,
         o.camper_id,
         concat_ws(' ', COALESCE(c.preferred_name, c.first_name), c.last_name) AS camper_name,
         o.session_id,
         s.name AS session_name,
         o.schedule_type,
         o.status,
         o.starts_on,
         o.ends_on,
         o.encrypted_payload,
         o.encryption_nonce,
         o.authentication_tag,
         o.key_version,
         o.version,
         o.created_at,
         o.discontinued_at
       FROM camper_medication_orders o
       JOIN campers c
         ON c.organization_id = o.organization_id AND c.id = o.camper_id
       JOIN sessions s
         ON s.organization_id = o.organization_id AND s.id = o.session_id
       WHERE o.organization_id = $1 AND o.id = $2`,
      [organizationId, orderId],
    );
    return result.rows[0];
  }

  private async lockOrder(
    client: PoolClient,
    organizationId: string,
    orderId: string,
  ): Promise<{
    camper_id: string;
    status: MedicationOrderStatus;
    version: number;
  }> {
    const result = await client.query<{
      camper_id: string;
      status: MedicationOrderStatus;
      version: number;
    }>(
      `SELECT camper_id, status, version
       FROM camper_medication_orders
       WHERE organization_id = $1 AND id = $2
       FOR UPDATE`,
      [organizationId, orderId],
    );
    if (!result.rows[0]) {
      throw new MedicationAdministrationNotFoundError('Medication order not found');
    }
    return result.rows[0];
  }

  private async audit(
    client: PoolClient,
    context: MedicationAdministrationContext,
    action: string,
    targetId: string,
    outcome: string,
    details: Record<string, unknown>,
  ): Promise<void> {
    await client.query(
      `INSERT INTO audit_events (
         organization_id, actor_id, action, target_type, target_id, outcome, request_id, details
       ) VALUES ($1, $2, $3, 'camper_medication_order', $4, $5, $6, $7::jsonb)`,
      [
        context.organizationId,
        context.actorId,
        action,
        targetId,
        outcome,
        context.requestId,
        JSON.stringify(details),
      ],
    );
  }
}
