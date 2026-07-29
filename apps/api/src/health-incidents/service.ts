import { randomUUID } from 'node:crypto';

import type { RequestIdentity } from '@camp-registration/auth';
import type {
  HealthIncident,
  HealthIncidentCenter,
  HealthIncidentCreate,
  HealthIncidentEntry,
  HealthIncidentGuardianNotificationCreate,
  HealthIncidentQuery,
  HealthIncidentResolve,
} from '@camp-registration/contracts';
import {
  HealthIncidentNotFoundError,
  type EncryptedHealthIncidentEntryRecord,
  type EncryptedHealthIncidentRecord,
  type HealthIncidentStore,
} from '@camp-registration/database';

import type { HealthEncryptionProvider } from '../health-records/encryption.js';

const authorizedRoles = new Set(['health_staff', 'camp_admin', 'organization_admin']);

interface IncidentPayload {
  care_given: string;
  guardian_notified_at: string | null;
  guardian_notified_to: string;
  location: string;
  summary: string;
}

interface EntryPayload {
  guardian_notified_at: string | null;
  guardian_notified_to: string;
  note: string;
}

export class HealthIncidentAuthorizationError extends Error {}
export class HealthIncidentEncryptionError extends Error {}
export class HealthIncidentInputError extends Error {}

export interface HealthIncidentServiceApi {
  addNote(
    incidentId: string,
    note: string,
    version: number,
    requestId: string,
  ): Promise<HealthIncident>;
  createIncident(input: HealthIncidentCreate, requestId: string): Promise<HealthIncident>;
  getCenter(query: HealthIncidentQuery, requestId: string): Promise<HealthIncidentCenter>;
  getIncident(incidentId: string, requestId: string): Promise<HealthIncident>;
  recordGuardianNotification(
    incidentId: string,
    input: HealthIncidentGuardianNotificationCreate,
    requestId: string,
  ): Promise<HealthIncident>;
  resolveIncident(
    incidentId: string,
    input: HealthIncidentResolve,
    requestId: string,
  ): Promise<HealthIncident>;
}

export class HealthIncidentService implements HealthIncidentServiceApi {
  private readonly membership;

  constructor(
    private readonly store: HealthIncidentStore,
    private readonly encryption: HealthEncryptionProvider,
    private readonly identity: RequestIdentity,
    private readonly organizationId: string,
  ) {
    this.membership = identity.memberships.find(
      (membership) => membership.organizationId === organizationId,
    );
  }

  private context(requestId: string) {
    return {
      actorId: this.identity.subject,
      organizationId: this.organizationId,
      requestId,
    };
  }

  private incidentSubject(camperId: string, incidentId: string): string {
    return `${camperId}:incident:${incidentId}`;
  }

  private entrySubject(camperId: string, incidentId: string, entryId: string): string {
    return `${this.incidentSubject(camperId, incidentId)}:entry:${entryId}`;
  }

  private async authorize(action: string, targetId: string, requestId: string): Promise<void> {
    const hasRole = this.membership?.roles.some((role) => authorizedRoles.has(role)) ?? false;
    if (hasRole && this.identity.mfaVerified) return;
    await this.store.recordAudit(this.context(requestId), action, targetId, 'denied', {
      mfa_verified: this.identity.mfaVerified,
    });
    throw new HealthIncidentAuthorizationError(
      'Incident records require health staff or administrator access with MFA',
    );
  }

  private decryptIncident(record: EncryptedHealthIncidentRecord): IncidentPayload {
    try {
      return this.encryption.decrypt<IncidentPayload>(
        this.organizationId,
        this.incidentSubject(record.camper_id, record.id),
        {
          authenticationTag: record.authentication_tag,
          ciphertext: record.encrypted_payload,
          keyVersion: record.key_version,
          nonce: record.encryption_nonce,
        },
      );
    } catch {
      throw new HealthIncidentEncryptionError('The protected incident could not be decrypted');
    }
  }

  private decryptEntry(
    incident: EncryptedHealthIncidentRecord,
    entry: EncryptedHealthIncidentEntryRecord,
  ): HealthIncidentEntry {
    try {
      const payload = this.encryption.decrypt<EntryPayload>(
        this.organizationId,
        this.entrySubject(incident.camper_id, incident.id, entry.id),
        {
          authenticationTag: entry.authentication_tag,
          ciphertext: entry.encrypted_payload,
          keyVersion: entry.key_version,
          nonce: entry.encryption_nonce,
        },
      );
      return {
        created_at: entry.created_at,
        created_by: entry.created_by,
        entry_type: entry.entry_type,
        guardian_notified_at: payload.guardian_notified_at,
        guardian_notified_to: payload.guardian_notified_to,
        id: entry.id,
        note: payload.note,
      };
    } catch {
      throw new HealthIncidentEncryptionError('A protected incident entry could not be decrypted');
    }
  }

  private async load(incidentId: string): Promise<HealthIncident> {
    const loaded = await this.store.getIncident(this.organizationId, incidentId);
    if (!loaded) throw new HealthIncidentNotFoundError('Health incident not found');
    const payload = this.decryptIncident(loaded.incident);
    const entries = loaded.entries.map((entry) => this.decryptEntry(loaded.incident, entry));
    const notification = entries.findLast((entry) => entry.entry_type === 'GUARDIAN_NOTIFICATION');
    return {
      ...loaded.incident,
      ...payload,
      ...(notification
        ? {
            guardian_notified_at: notification.guardian_notified_at,
            guardian_notified_to: notification.guardian_notified_to,
          }
        : {}),
      entries,
    };
  }

  async getCenter(query: HealthIncidentQuery, requestId: string): Promise<HealthIncidentCenter> {
    await this.authorize('health.incident_center_viewed', this.organizationId, requestId);
    const [candidates, incidents, timezone] = await Promise.all([
      this.store.listCandidates(this.organizationId),
      this.store.listIncidents(this.organizationId, {
        ...(query.session_id ? { sessionId: query.session_id } : {}),
        ...(query.status ? { status: query.status } : {}),
      }),
      this.store.getOrganizationTimezone(this.organizationId),
    ]);
    await this.store.recordAudit(
      this.context(requestId),
      'health.incident_center_viewed',
      this.organizationId,
      'success',
      {
        candidate_count: candidates.length,
        incident_count: incidents.length,
        session_filtered: Boolean(query.session_id),
        status_filter: query.status ?? null,
      },
    );
    return { candidates, incidents, timezone };
  }

  async getIncident(incidentId: string, requestId: string): Promise<HealthIncident> {
    await this.authorize('health.incident_read', incidentId, requestId);
    try {
      const incident = await this.load(incidentId);
      await this.store.recordAudit(
        this.context(requestId),
        'health.incident_read',
        incidentId,
        'success',
      );
      return incident;
    } catch (error) {
      if (error instanceof HealthIncidentEncryptionError) {
        await this.store.recordAudit(
          this.context(requestId),
          'health.incident_read',
          incidentId,
          'failure',
        );
      }
      throw error;
    }
  }

  async createIncident(input: HealthIncidentCreate, requestId: string): Promise<HealthIncident> {
    await this.authorize('health.incident_created', input.camper_id, requestId);
    const guardianNotifiedTo = input.guardian_notified_to?.trim() ?? '';
    const guardianNotifiedAt = input.guardian_notified_at ?? null;
    if (
      input.guardian_notification_status === 'NOTIFIED' &&
      (!guardianNotifiedTo || !guardianNotifiedAt)
    ) {
      throw new HealthIncidentInputError(
        'A notified guardian and notification time are required when notification is complete',
      );
    }
    if (
      input.guardian_notification_status !== 'NOTIFIED' &&
      (guardianNotifiedTo || guardianNotifiedAt)
    ) {
      throw new HealthIncidentInputError(
        'Guardian notification details can only be recorded with Notified status',
      );
    }
    if (new Date(input.occurred_at).getTime() > Date.now() + 5 * 60_000) {
      throw new HealthIncidentInputError('Incident time cannot be in the future');
    }

    const id = randomUUID();
    const encrypted = this.encryption.encrypt(
      this.organizationId,
      this.incidentSubject(input.camper_id, id),
      {
        care_given: input.care_given.trim(),
        guardian_notified_at: guardianNotifiedAt,
        guardian_notified_to: guardianNotifiedTo,
        location: input.location.trim(),
        summary: input.summary.trim(),
      } satisfies IncidentPayload,
    );
    await this.store.create(this.context(requestId), {
      authentication_tag: encrypted.authenticationTag,
      camper_id: input.camper_id,
      encrypted_payload: encrypted.ciphertext,
      encryption_nonce: encrypted.nonce,
      guardian_notification_status: input.guardian_notification_status,
      id,
      incident_type: input.incident_type,
      key_version: encrypted.keyVersion,
      occurred_at: input.occurred_at,
      session_id: input.session_id,
      severity: input.severity,
    });
    return this.load(id);
  }

  async addNote(
    incidentId: string,
    note: string,
    version: number,
    requestId: string,
  ): Promise<HealthIncident> {
    await this.authorize('health.incident_note_added', incidentId, requestId);
    const current = await this.load(incidentId);
    const entryId = randomUUID();
    const encrypted = this.encryption.encrypt(
      this.organizationId,
      this.entrySubject(current.camper_id, incidentId, entryId),
      {
        guardian_notified_at: null,
        guardian_notified_to: '',
        note: note.trim(),
      } satisfies EntryPayload,
    );
    await this.store.appendEntry(this.context(requestId), incidentId, version, {
      authentication_tag: encrypted.authenticationTag,
      encrypted_payload: encrypted.ciphertext,
      encryption_nonce: encrypted.nonce,
      id: entryId,
      key_version: encrypted.keyVersion,
    });
    return this.load(incidentId);
  }

  async recordGuardianNotification(
    incidentId: string,
    input: HealthIncidentGuardianNotificationCreate,
    requestId: string,
  ): Promise<HealthIncident> {
    await this.authorize('health.incident_guardian_notified', incidentId, requestId);
    if (new Date(input.guardian_notified_at).getTime() > Date.now() + 5 * 60_000) {
      throw new HealthIncidentInputError('Guardian notification time cannot be in the future');
    }
    const current = await this.load(incidentId);
    const entryId = randomUUID();
    const encrypted = this.encryption.encrypt(
      this.organizationId,
      this.entrySubject(current.camper_id, incidentId, entryId),
      {
        guardian_notified_at: input.guardian_notified_at,
        guardian_notified_to: input.guardian_notified_to.trim(),
        note: input.note?.trim() ?? '',
      } satisfies EntryPayload,
    );
    await this.store.recordGuardianNotification(
      this.context(requestId),
      incidentId,
      input.version,
      {
        authentication_tag: encrypted.authenticationTag,
        encrypted_payload: encrypted.ciphertext,
        encryption_nonce: encrypted.nonce,
        id: entryId,
        key_version: encrypted.keyVersion,
      },
    );
    return this.load(incidentId);
  }

  async resolveIncident(
    incidentId: string,
    input: HealthIncidentResolve,
    requestId: string,
  ): Promise<HealthIncident> {
    await this.authorize('health.incident_resolved', incidentId, requestId);
    const current = await this.load(incidentId);
    const entryId = randomUUID();
    const encrypted = this.encryption.encrypt(
      this.organizationId,
      this.entrySubject(current.camper_id, incidentId, entryId),
      {
        guardian_notified_at: null,
        guardian_notified_to: '',
        note: input.resolution.trim(),
      } satisfies EntryPayload,
    );
    await this.store.resolve(this.context(requestId), incidentId, input.version, {
      authentication_tag: encrypted.authenticationTag,
      encrypted_payload: encrypted.ciphertext,
      encryption_nonce: encrypted.nonce,
      id: entryId,
      key_version: encrypted.keyVersion,
    });
    return this.load(incidentId);
  }
}
