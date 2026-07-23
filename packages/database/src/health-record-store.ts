import { randomUUID } from 'node:crypto';

import type { PoolClient } from 'pg';

import type { DatabaseClient } from './client.js';

export type HealthReviewStatus = 'DRAFT' | 'SUBMITTED' | 'NEEDS_CHANGES' | 'APPROVED';
export type ImmunizationStatus = 'UNKNOWN' | 'CURRENT' | 'INCOMPLETE' | 'EXEMPT';

export interface EncryptedHealthRecord {
  authentication_tag: Buffer;
  camper_id: string;
  encrypted_payload: Buffer;
  encryption_nonce: Buffer;
  family_id: string;
  id: string;
  immunization_status: ImmunizationStatus;
  key_version: number;
  review_status: HealthReviewStatus;
  reviewed_at: string | null;
  submitted_at: string | null;
  updated_at: string;
  version: number;
}

export interface HealthRecordSummaryRecord {
  camper_id: string;
  camper_name: string;
  family_id: string;
  family_name: string;
  has_accessibility_needs: boolean;
  has_allergies: boolean;
  has_dietary_needs: boolean;
  has_emergency_instructions: boolean;
  has_medications: boolean;
  immunization_status: ImmunizationStatus;
  record_id: string | null;
  review_status: HealthReviewStatus;
  session_names: string[];
  updated_at: string | null;
}

export interface HealthRecordWriteContext {
  actorId: string;
  organizationId: string;
  requestId: string;
}

export interface EncryptedHealthRecordWrite {
  authentication_tag: Buffer;
  encrypted_payload: Buffer;
  encryption_nonce: Buffer;
  has_accessibility_needs: boolean;
  has_allergies: boolean;
  has_dietary_needs: boolean;
  has_emergency_instructions: boolean;
  has_medications: boolean;
  immunization_status: ImmunizationStatus;
  key_version: number;
  version?: number;
}

interface EncryptedRow extends Omit<
  EncryptedHealthRecord,
  'reviewed_at' | 'submitted_at' | 'updated_at'
> {
  reviewed_at: Date | null;
  submitted_at: Date | null;
  updated_at: Date;
}

interface SummaryRow extends Omit<HealthRecordSummaryRecord, 'session_names' | 'updated_at'> {
  session_names: string[] | null;
  updated_at: Date | null;
}

export class HealthRecordConflictError extends Error {}
export class HealthRecordNotFoundError extends Error {}

function mapEncrypted(row: EncryptedRow): EncryptedHealthRecord {
  return {
    ...row,
    reviewed_at: row.reviewed_at?.toISOString() ?? null,
    submitted_at: row.submitted_at?.toISOString() ?? null,
    updated_at: row.updated_at.toISOString(),
  };
}

function mapSummary(row: SummaryRow): HealthRecordSummaryRecord {
  return {
    ...row,
    session_names: row.session_names ?? [],
    updated_at: row.updated_at?.toISOString() ?? null,
  };
}

export class HealthRecordStore {
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

  async adultIdentityCanManageCamper(
    organizationId: string,
    camperId: string,
    identitySubject: string,
  ): Promise<boolean> {
    return this.withTenant(organizationId, async (client) => {
      const result = await client.query<{ allowed: boolean }>(
        `SELECT EXISTS (
           SELECT 1
           FROM campers c
           JOIN adults a
             ON a.organization_id = c.organization_id
            AND a.family_id = c.family_id
            AND a.archived_at IS NULL
           WHERE c.organization_id = $1
             AND c.id = $2
             AND c.archived_at IS NULL
             AND a.identity_subject = $3
             AND (a.account_owner OR a.can_manage_family)
         ) AS allowed`,
        [organizationId, camperId, identitySubject],
      );
      return result.rows[0]?.allowed ?? false;
    });
  }

  async listSummaries(
    organizationId: string,
    identitySubject?: string,
    sessionId?: string,
  ): Promise<HealthRecordSummaryRecord[]> {
    return this.withTenant(organizationId, async (client) => {
      const values: string[] = [organizationId];
      const parentFilter = identitySubject
        ? `AND EXISTS (
             SELECT 1 FROM adults a
             WHERE a.organization_id = c.organization_id
               AND a.family_id = c.family_id
               AND a.identity_subject = $2
               AND a.archived_at IS NULL
               AND (a.account_owner OR a.can_manage_family)
           )`
        : '';
      if (identitySubject) values.push(identitySubject);
      const sessionFilter = sessionId
        ? `AND EXISTS (
             SELECT 1 FROM registrations session_registration
             WHERE session_registration.organization_id = c.organization_id
               AND session_registration.camper_id = c.id
               AND session_registration.session_id = $${values.length + 1}
               AND session_registration.status = 'CONFIRMED'
           )`
        : '';
      if (sessionId) values.push(sessionId);
      const result = await client.query<SummaryRow>(
        `SELECT
           c.id AS camper_id,
           concat_ws(' ', COALESCE(c.preferred_name, c.first_name), c.last_name) AS camper_name,
           f.id AS family_id,
           f.family_name,
           h.id AS record_id,
           COALESCE(h.review_status, 'DRAFT') AS review_status,
           COALESCE(h.immunization_status, 'UNKNOWN') AS immunization_status,
           COALESCE(h.has_allergies, false) AS has_allergies,
           COALESCE(h.has_medications, false) AS has_medications,
           COALESCE(h.has_dietary_needs, false) AS has_dietary_needs,
           COALESCE(h.has_accessibility_needs, false) AS has_accessibility_needs,
           COALESCE(h.has_emergency_instructions, false) AS has_emergency_instructions,
           h.updated_at,
           COALESCE(sessions.names, ARRAY[]::text[]) AS session_names
         FROM campers c
         JOIN families f ON f.organization_id = c.organization_id AND f.id = c.family_id
         LEFT JOIN camper_health_records h
           ON h.organization_id = c.organization_id AND h.camper_id = c.id
         LEFT JOIN LATERAL (
           SELECT array_agg(s.name ORDER BY s.starts_on, s.id) AS names
           FROM registrations r
           JOIN sessions s ON s.organization_id = r.organization_id AND s.id = r.session_id
           WHERE r.organization_id = c.organization_id
             AND r.camper_id = c.id
             AND r.status = 'CONFIRMED'
             AND s.status <> 'ARCHIVED'
         ) sessions ON true
         WHERE c.organization_id = $1
           AND c.archived_at IS NULL
           AND f.archived_at IS NULL
           ${parentFilter}
           ${sessionFilter}
         ORDER BY lower(f.family_name), lower(c.last_name), lower(c.first_name), c.id`,
        values,
      );
      return result.rows.map(mapSummary);
    });
  }

  async getEncrypted(
    organizationId: string,
    camperId: string,
  ): Promise<EncryptedHealthRecord | null> {
    return this.withTenant(organizationId, async (client) => {
      const result = await client.query<EncryptedRow>(
        `SELECT id, family_id, camper_id, encrypted_payload, encryption_nonce,
                authentication_tag, key_version, review_status, immunization_status,
                submitted_at, reviewed_at, version, updated_at
         FROM camper_health_records
         WHERE organization_id = $1 AND camper_id = $2`,
        [organizationId, camperId],
      );
      return result.rows[0] ? mapEncrypted(result.rows[0]) : null;
    });
  }

  async upsert(
    context: HealthRecordWriteContext,
    camperId: string,
    record: EncryptedHealthRecordWrite,
  ): Promise<EncryptedHealthRecord> {
    return this.withTenant(context.organizationId, async (client) => {
      const camper = await client.query<{ family_id: string }>(
        `SELECT family_id FROM campers
         WHERE organization_id = $1 AND id = $2 AND archived_at IS NULL`,
        [context.organizationId, camperId],
      );
      const familyId = camper.rows[0]?.family_id;
      if (!familyId) throw new HealthRecordNotFoundError('Camper not found');
      const existing = await client.query<{ id: string; version: number }>(
        `SELECT id, version FROM camper_health_records
         WHERE organization_id = $1 AND camper_id = $2 FOR UPDATE`,
        [context.organizationId, camperId],
      );
      const current = existing.rows[0];
      if (current && record.version !== current.version) {
        throw new HealthRecordConflictError('Health record was updated by another request');
      }
      if (!current && record.version !== undefined) {
        throw new HealthRecordConflictError('Health record was updated by another request');
      }
      const id = current?.id ?? randomUUID();
      const result = current
        ? await client.query<EncryptedRow>(
            `UPDATE camper_health_records
             SET encrypted_payload = $4, encryption_nonce = $5, authentication_tag = $6,
                 key_version = $7, immunization_status = $8, has_allergies = $9,
                 has_medications = $10, has_dietary_needs = $11,
                 has_accessibility_needs = $12, has_emergency_instructions = $13,
                 review_status = 'DRAFT', submitted_at = NULL, reviewed_at = NULL,
                 reviewed_by = NULL, version = version + 1, updated_by = $14,
                 updated_at = transaction_timestamp()
             WHERE organization_id = $1 AND camper_id = $2 AND id = $3
             RETURNING id, family_id, camper_id, encrypted_payload, encryption_nonce,
                       authentication_tag, key_version, review_status, immunization_status,
                       submitted_at, reviewed_at, version, updated_at`,
            [
              context.organizationId,
              camperId,
              id,
              record.encrypted_payload,
              record.encryption_nonce,
              record.authentication_tag,
              record.key_version,
              record.immunization_status,
              record.has_allergies,
              record.has_medications,
              record.has_dietary_needs,
              record.has_accessibility_needs,
              record.has_emergency_instructions,
              context.actorId,
            ],
          )
        : await client.query<EncryptedRow>(
            `INSERT INTO camper_health_records (
               id, organization_id, family_id, camper_id, encrypted_payload, encryption_nonce,
               authentication_tag, key_version, immunization_status, has_allergies,
               has_medications, has_dietary_needs, has_accessibility_needs,
               has_emergency_instructions, created_by, updated_by
             ) VALUES (
               $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $15
             )
             RETURNING id, family_id, camper_id, encrypted_payload, encryption_nonce,
                       authentication_tag, key_version, review_status, immunization_status,
                       submitted_at, reviewed_at, version, updated_at`,
            [
              id,
              context.organizationId,
              familyId,
              camperId,
              record.encrypted_payload,
              record.encryption_nonce,
              record.authentication_tag,
              record.key_version,
              record.immunization_status,
              record.has_allergies,
              record.has_medications,
              record.has_dietary_needs,
              record.has_accessibility_needs,
              record.has_emergency_instructions,
              context.actorId,
            ],
          );
      await this.audit(client, context, 'health.record_saved', camperId, 'success', {
        created: !current,
      });
      return mapEncrypted(result.rows[0]!);
    });
  }

  async setReviewState(
    context: HealthRecordWriteContext,
    camperId: string,
    version: number,
    status: 'SUBMITTED' | 'APPROVED' | 'NEEDS_CHANGES',
  ): Promise<EncryptedHealthRecord> {
    return this.withTenant(context.organizationId, async (client) => {
      const result = await client.query<EncryptedRow>(
        `UPDATE camper_health_records
         SET review_status = $4,
             submitted_at = CASE WHEN $4 = 'SUBMITTED' THEN transaction_timestamp() ELSE submitted_at END,
             reviewed_at = CASE WHEN $4 IN ('APPROVED', 'NEEDS_CHANGES') THEN transaction_timestamp() ELSE NULL END,
             reviewed_by = CASE WHEN $4 IN ('APPROVED', 'NEEDS_CHANGES') THEN $5 ELSE NULL END,
             version = version + 1, updated_by = $5, updated_at = transaction_timestamp()
         WHERE organization_id = $1 AND camper_id = $2 AND version = $3
         RETURNING id, family_id, camper_id, encrypted_payload, encryption_nonce,
                   authentication_tag, key_version, review_status, immunization_status,
                   submitted_at, reviewed_at, version, updated_at`,
        [context.organizationId, camperId, version, status, context.actorId],
      );
      if (!result.rows[0]) {
        const exists = await client.query(
          `SELECT 1 FROM camper_health_records WHERE organization_id = $1 AND camper_id = $2`,
          [context.organizationId, camperId],
        );
        if (!exists.rows[0]) throw new HealthRecordNotFoundError('Health record not found');
        throw new HealthRecordConflictError('Health record was updated by another request');
      }
      await this.audit(
        client,
        context,
        `health.record_${status.toLowerCase()}`,
        camperId,
        'success',
        {
          status,
        },
      );
      return mapEncrypted(result.rows[0]);
    });
  }

  async recordAudit(
    context: HealthRecordWriteContext,
    action: string,
    camperId: string,
    outcome: 'success' | 'denied' | 'failure',
    details: Record<string, unknown> = {},
  ): Promise<void> {
    await this.withTenant(context.organizationId, (client) =>
      this.audit(client, context, action, camperId, outcome, details),
    );
  }

  private async audit(
    client: PoolClient,
    context: HealthRecordWriteContext,
    action: string,
    targetId: string,
    outcome: string,
    details: Record<string, unknown>,
  ): Promise<void> {
    await client.query(
      `INSERT INTO audit_events (
         organization_id, actor_id, action, target_type, target_id, outcome, request_id, details
       ) VALUES ($1, $2, $3, 'camper_health_record', $4, $5, $6, $7::jsonb)`,
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
