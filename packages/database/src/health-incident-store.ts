import type { PoolClient } from 'pg';

import type { DatabaseClient } from './client.js';

export type HealthIncidentType = 'INJURY' | 'ILLNESS' | 'SAFETY' | 'BEHAVIORAL' | 'OTHER';
export type HealthIncidentSeverity = 'MINOR' | 'MODERATE' | 'SERIOUS';
export type HealthIncidentStatus = 'OPEN' | 'RESOLVED';
export type GuardianNotificationStatus = 'NOT_REQUIRED' | 'PENDING' | 'NOTIFIED';
export type HealthIncidentEntryType = 'FOLLOW_UP' | 'GUARDIAN_NOTIFICATION' | 'RESOLUTION';

export interface HealthIncidentContext {
  actorId: string;
  organizationId: string;
  requestId: string;
}

export interface HealthIncidentCandidateRecord {
  camper_id: string;
  camper_name: string;
  family_name: string;
  session_id: string;
  session_name: string;
}

export interface HealthIncidentSummaryRecord {
  camper_id: string;
  camper_name: string;
  created_at: string;
  guardian_notification_status: GuardianNotificationStatus;
  id: string;
  incident_type: HealthIncidentType;
  occurred_at: string;
  resolved_at: string | null;
  session_id: string;
  session_name: string;
  severity: HealthIncidentSeverity;
  status: HealthIncidentStatus;
  version: number;
}

export interface EncryptedHealthIncidentRecord extends HealthIncidentSummaryRecord {
  authentication_tag: Buffer;
  encrypted_payload: Buffer;
  encryption_nonce: Buffer;
  key_version: number;
}

export interface EncryptedHealthIncidentEntryRecord {
  authentication_tag: Buffer;
  created_at: string;
  created_by: string;
  encrypted_payload: Buffer;
  encryption_nonce: Buffer;
  entry_type: HealthIncidentEntryType;
  id: string;
  key_version: number;
}

export interface EncryptedHealthIncidentWrite {
  authentication_tag: Buffer;
  camper_id: string;
  encrypted_payload: Buffer;
  encryption_nonce: Buffer;
  guardian_notification_status: GuardianNotificationStatus;
  id: string;
  incident_type: HealthIncidentType;
  key_version: number;
  occurred_at: string;
  session_id: string;
  severity: HealthIncidentSeverity;
}

export interface EncryptedHealthIncidentEntryWrite {
  authentication_tag: Buffer;
  encrypted_payload: Buffer;
  encryption_nonce: Buffer;
  id: string;
  key_version: number;
}

interface IncidentRow extends Omit<
  EncryptedHealthIncidentRecord,
  'created_at' | 'occurred_at' | 'resolved_at'
> {
  created_at: Date;
  occurred_at: Date;
  resolved_at: Date | null;
}

interface SummaryRow extends Omit<
  HealthIncidentSummaryRecord,
  'created_at' | 'occurred_at' | 'resolved_at'
> {
  created_at: Date;
  occurred_at: Date;
  resolved_at: Date | null;
}

interface EntryRow extends Omit<EncryptedHealthIncidentEntryRecord, 'created_at'> {
  created_at: Date;
}

export class HealthIncidentConflictError extends Error {}
export class HealthIncidentNotFoundError extends Error {}
export class HealthIncidentValidationError extends Error {}

function mapSummary(row: SummaryRow): HealthIncidentSummaryRecord {
  return {
    ...row,
    created_at: row.created_at.toISOString(),
    occurred_at: row.occurred_at.toISOString(),
    resolved_at: row.resolved_at?.toISOString() ?? null,
  };
}

function mapIncident(row: IncidentRow): EncryptedHealthIncidentRecord {
  return {
    ...row,
    created_at: row.created_at.toISOString(),
    occurred_at: row.occurred_at.toISOString(),
    resolved_at: row.resolved_at?.toISOString() ?? null,
  };
}

function mapEntry(row: EntryRow): EncryptedHealthIncidentEntryRecord {
  return { ...row, created_at: row.created_at.toISOString() };
}

export class HealthIncidentStore {
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

  async listCandidates(organizationId: string): Promise<HealthIncidentCandidateRecord[]> {
    return this.withTenant(organizationId, async (client) => {
      const result = await client.query<HealthIncidentCandidateRecord>(
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
         WHERE r.organization_id = $1
           AND r.status = 'CONFIRMED'
           AND s.status <> 'ARCHIVED'
         ORDER BY session_name, camper_name, camper_id`,
        [organizationId],
      );
      return result.rows;
    });
  }

  async getOrganizationTimezone(organizationId: string): Promise<string> {
    return this.withTenant(organizationId, async (client) => {
      const result = await client.query<{ timezone: string }>(
        `SELECT timezone FROM organizations WHERE id = $1`,
        [organizationId],
      );
      const timezone = result.rows[0]?.timezone;
      if (!timezone) throw new HealthIncidentNotFoundError('Organization not found');
      return timezone;
    });
  }

  async listIncidents(
    organizationId: string,
    filters: { sessionId?: string; status?: HealthIncidentStatus } = {},
  ): Promise<HealthIncidentSummaryRecord[]> {
    return this.withTenant(organizationId, async (client) => {
      const values: string[] = [organizationId];
      const sessionFilter = filters.sessionId
        ? `AND i.session_id = $${values.push(filters.sessionId)}`
        : '';
      const statusFilter = filters.status ? `AND i.status = $${values.push(filters.status)}` : '';
      const result = await client.query<SummaryRow>(
        `SELECT
           i.id,
           i.camper_id,
           concat_ws(' ', COALESCE(c.preferred_name, c.first_name), c.last_name) AS camper_name,
           i.session_id,
           s.name AS session_name,
           i.incident_type,
           i.severity,
           i.status,
           i.guardian_notification_status,
           i.occurred_at,
           i.created_at,
           i.resolved_at,
           i.version
         FROM camper_health_incidents i
         JOIN campers c
           ON c.organization_id = i.organization_id AND c.id = i.camper_id
         JOIN sessions s
           ON s.organization_id = i.organization_id AND s.id = i.session_id
         WHERE i.organization_id = $1
           ${sessionFilter}
           ${statusFilter}
         ORDER BY
           CASE i.status WHEN 'OPEN' THEN 0 ELSE 1 END,
           i.occurred_at DESC,
           i.id`,
        values,
      );
      return result.rows.map(mapSummary);
    });
  }

  async getIncident(
    organizationId: string,
    incidentId: string,
  ): Promise<{
    entries: EncryptedHealthIncidentEntryRecord[];
    incident: EncryptedHealthIncidentRecord;
  } | null> {
    return this.withTenant(organizationId, async (client) => {
      const incident = await this.selectIncident(client, organizationId, incidentId);
      if (!incident) return null;
      const entries = await client.query<EntryRow>(
        `SELECT id, entry_type, encrypted_payload, encryption_nonce, authentication_tag,
                key_version, created_by, created_at
         FROM camper_health_incident_entries
         WHERE organization_id = $1 AND incident_id = $2
         ORDER BY created_at, id`,
        [organizationId, incidentId],
      );
      return { entries: entries.rows.map(mapEntry), incident: mapIncident(incident) };
    });
  }

  async create(
    context: HealthIncidentContext,
    incident: EncryptedHealthIncidentWrite,
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
        [context.organizationId, incident.camper_id, incident.session_id],
      );
      const familyId = registration.rows[0]?.family_id;
      if (!familyId) {
        throw new HealthIncidentValidationError(
          'The camper must have a confirmed registration in the selected session',
        );
      }
      await client.query(
        `INSERT INTO camper_health_incidents (
           id, organization_id, family_id, camper_id, session_id, incident_type, severity,
           occurred_at, guardian_notification_status, encrypted_payload, encryption_nonce,
           authentication_tag, key_version, created_by
         ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14)`,
        [
          incident.id,
          context.organizationId,
          familyId,
          incident.camper_id,
          incident.session_id,
          incident.incident_type,
          incident.severity,
          incident.occurred_at,
          incident.guardian_notification_status,
          incident.encrypted_payload,
          incident.encryption_nonce,
          incident.authentication_tag,
          incident.key_version,
          context.actorId,
        ],
      );
      await this.audit(client, context, 'health.incident_created', incident.id, 'success', {
        incident_type: incident.incident_type,
        severity: incident.severity,
        session_id: incident.session_id,
      });
    });
  }

  async appendEntry(
    context: HealthIncidentContext,
    incidentId: string,
    expectedVersion: number,
    entry: EncryptedHealthIncidentEntryWrite,
  ): Promise<void> {
    await this.withTenant(context.organizationId, async (client) => {
      const current = await this.lockIncident(client, context.organizationId, incidentId);
      if (current.status !== 'OPEN') {
        throw new HealthIncidentValidationError(
          'Resolved incidents cannot receive follow-up notes',
        );
      }
      if (current.version !== expectedVersion) {
        throw new HealthIncidentConflictError('The incident was updated by another request');
      }
      await this.insertEntry(client, context, incidentId, current.camper_id, 'FOLLOW_UP', entry);
      await client.query(
        `UPDATE camper_health_incidents
         SET version = version + 1, updated_at = transaction_timestamp()
         WHERE organization_id = $1 AND id = $2`,
        [context.organizationId, incidentId],
      );
      await this.audit(client, context, 'health.incident_note_added', incidentId, 'success', {
        version: expectedVersion + 1,
      });
    });
  }

  async resolve(
    context: HealthIncidentContext,
    incidentId: string,
    expectedVersion: number,
    entry: EncryptedHealthIncidentEntryWrite,
  ): Promise<void> {
    await this.withTenant(context.organizationId, async (client) => {
      const current = await this.lockIncident(client, context.organizationId, incidentId);
      if (current.status !== 'OPEN') {
        throw new HealthIncidentValidationError('The incident is already resolved');
      }
      if (current.version !== expectedVersion) {
        throw new HealthIncidentConflictError('The incident was updated by another request');
      }
      if (current.guardian_notification_status === 'PENDING') {
        throw new HealthIncidentValidationError(
          'Complete or waive the guardian notification before resolving the incident',
        );
      }
      await this.insertEntry(client, context, incidentId, current.camper_id, 'RESOLUTION', entry);
      await client.query(
        `UPDATE camper_health_incidents
         SET status = 'RESOLVED', version = version + 1, resolved_by = $3,
             resolved_at = transaction_timestamp(), updated_at = transaction_timestamp()
         WHERE organization_id = $1 AND id = $2`,
        [context.organizationId, incidentId, context.actorId],
      );
      await this.audit(client, context, 'health.incident_resolved', incidentId, 'success', {
        version: expectedVersion + 1,
      });
    });
  }

  async recordGuardianNotification(
    context: HealthIncidentContext,
    incidentId: string,
    expectedVersion: number,
    entry: EncryptedHealthIncidentEntryWrite,
  ): Promise<void> {
    await this.withTenant(context.organizationId, async (client) => {
      const current = await this.lockIncident(client, context.organizationId, incidentId);
      if (current.status !== 'OPEN') {
        throw new HealthIncidentValidationError(
          'Resolved incidents cannot receive guardian notifications',
        );
      }
      if (current.guardian_notification_status !== 'PENDING') {
        throw new HealthIncidentValidationError(
          'Guardian notification is not pending for this incident',
        );
      }
      if (current.version !== expectedVersion) {
        throw new HealthIncidentConflictError('The incident was updated by another request');
      }
      await this.insertEntry(
        client,
        context,
        incidentId,
        current.camper_id,
        'GUARDIAN_NOTIFICATION',
        entry,
      );
      await client.query(
        `UPDATE camper_health_incidents
         SET guardian_notification_status = 'NOTIFIED', version = version + 1,
             updated_at = transaction_timestamp()
         WHERE organization_id = $1 AND id = $2`,
        [context.organizationId, incidentId],
      );
      await this.audit(
        client,
        context,
        'health.incident_guardian_notified',
        incidentId,
        'success',
        { version: expectedVersion + 1 },
      );
    });
  }

  async recordAudit(
    context: HealthIncidentContext,
    action: string,
    targetId: string,
    outcome: 'success' | 'denied' | 'failure',
    details: Record<string, unknown> = {},
  ): Promise<void> {
    await this.withTenant(context.organizationId, (client) =>
      this.audit(client, context, action, targetId, outcome, details),
    );
  }

  private async selectIncident(
    client: PoolClient,
    organizationId: string,
    incidentId: string,
  ): Promise<IncidentRow | undefined> {
    const result = await client.query<IncidentRow>(
      `SELECT
         i.id,
         i.camper_id,
         concat_ws(' ', COALESCE(c.preferred_name, c.first_name), c.last_name) AS camper_name,
         i.session_id,
         s.name AS session_name,
         i.incident_type,
         i.severity,
         i.status,
         i.guardian_notification_status,
         i.occurred_at,
         i.created_at,
         i.resolved_at,
         i.version,
         i.encrypted_payload,
         i.encryption_nonce,
         i.authentication_tag,
         i.key_version
       FROM camper_health_incidents i
       JOIN campers c
         ON c.organization_id = i.organization_id AND c.id = i.camper_id
       JOIN sessions s
         ON s.organization_id = i.organization_id AND s.id = i.session_id
       WHERE i.organization_id = $1 AND i.id = $2`,
      [organizationId, incidentId],
    );
    return result.rows[0];
  }

  private async lockIncident(
    client: PoolClient,
    organizationId: string,
    incidentId: string,
  ): Promise<{
    camper_id: string;
    guardian_notification_status: GuardianNotificationStatus;
    status: HealthIncidentStatus;
    version: number;
  }> {
    const result = await client.query<{
      camper_id: string;
      guardian_notification_status: GuardianNotificationStatus;
      status: HealthIncidentStatus;
      version: number;
    }>(
      `SELECT camper_id, guardian_notification_status, status, version
       FROM camper_health_incidents
       WHERE organization_id = $1 AND id = $2
       FOR UPDATE`,
      [organizationId, incidentId],
    );
    if (!result.rows[0]) throw new HealthIncidentNotFoundError('Health incident not found');
    return result.rows[0];
  }

  private async insertEntry(
    client: PoolClient,
    context: HealthIncidentContext,
    incidentId: string,
    camperId: string,
    entryType: HealthIncidentEntryType,
    entry: EncryptedHealthIncidentEntryWrite,
  ): Promise<void> {
    await client.query(
      `INSERT INTO camper_health_incident_entries (
         id, organization_id, incident_id, camper_id, entry_type, encrypted_payload,
         encryption_nonce, authentication_tag, key_version, created_by
       ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)`,
      [
        entry.id,
        context.organizationId,
        incidentId,
        camperId,
        entryType,
        entry.encrypted_payload,
        entry.encryption_nonce,
        entry.authentication_tag,
        entry.key_version,
        context.actorId,
      ],
    );
  }

  private async audit(
    client: PoolClient,
    context: HealthIncidentContext,
    action: string,
    targetId: string,
    outcome: string,
    details: Record<string, unknown>,
  ): Promise<void> {
    await client.query(
      `INSERT INTO audit_events (
         organization_id, actor_id, action, target_type, target_id, outcome, request_id, details
       ) VALUES ($1, $2, $3, 'camper_health_incident', $4, $5, $6, $7::jsonb)`,
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
