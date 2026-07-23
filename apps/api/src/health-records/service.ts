import type { RequestIdentity } from '@camp-registration/auth';
import type {
  HealthRecord,
  HealthRecordAccessQuery,
  HealthRecordCenter,
  HealthRecordInput,
  HealthRecordReview,
} from '@camp-registration/contracts';
import {
  HealthRecordConflictError,
  HealthRecordNotFoundError,
  type EncryptedHealthRecord,
  type HealthRecordStore,
  type HealthRecordSummaryRecord,
} from '@camp-registration/database';

import type { HealthEncryptionProvider } from './encryption.js';

const routineRoles = new Set(['health_staff', 'organization_admin']);
const centerRoles = new Set(['health_staff', 'camp_admin', 'organization_admin']);
const breakGlassRoles = new Set(['camp_admin', 'organization_admin']);
const parentRoles = new Set(['parent_guardian']);

interface HealthPayload extends Omit<HealthRecordInput, 'version'> {
  review_message: string;
}

export class HealthAuthorizationError extends Error {}
export class HealthValidationError extends Error {}
export class HealthEncryptionError extends Error {}

export interface HealthExport {
  content: string;
  filename: string;
  rowCount: number;
}

export interface HealthRecordServiceApi {
  exportRecords(sessionId: string | undefined, requestId: string): Promise<HealthExport>;
  getCenter(requestId: string): Promise<HealthRecordCenter>;
  getRecord(
    camperId: string,
    access: HealthRecordAccessQuery,
    requestId: string,
  ): Promise<HealthRecord>;
  reviewRecord(
    camperId: string,
    review: HealthRecordReview,
    requestId: string,
  ): Promise<HealthRecord>;
  saveRecord(camperId: string, input: HealthRecordInput, requestId: string): Promise<HealthRecord>;
  submitRecord(camperId: string, version: number, requestId: string): Promise<HealthRecord>;
}

function cleanList(values: string[]): string[] {
  return values.map((value) => value.trim()).filter(Boolean);
}

function clean(input: HealthRecordInput): HealthPayload {
  return {
    accessibility_needs: cleanList(input.accessibility_needs),
    allergies: cleanList(input.allergies),
    dietary_needs: cleanList(input.dietary_needs),
    document_references: input.document_references.map((document) => ({
      label: document.label.trim(),
      storage_reference: document.storage_reference.trim(),
      type: document.type,
    })),
    emergency_instructions: input.emergency_instructions.trim(),
    immunization_notes: input.immunization_notes.trim(),
    immunization_status: input.immunization_status,
    medications: cleanList(input.medications),
    review_message: '',
  };
}

function csvCell(value: string): string {
  const normalized = value.replace(/\r\n|\r|\n/g, ' ');
  const safe = '=+-@'.includes(normalized.trimStart().charAt(0)) ? `'${normalized}` : normalized;
  return `"${safe.replaceAll('"', '""')}"`;
}

export class HealthRecordService implements HealthRecordServiceApi {
  private readonly membership;

  constructor(
    private readonly store: HealthRecordStore,
    private readonly encryption: HealthEncryptionProvider,
    private readonly identity: RequestIdentity,
    private readonly organizationId: string,
  ) {
    this.membership = identity.memberships.find(
      (membership) => membership.organizationId === organizationId,
    );
  }

  private hasRole(roles: Set<string>): boolean {
    return Boolean(this.membership?.roles.some((role) => roles.has(role)));
  }

  private context(requestId: string) {
    return {
      actorId: this.identity.subject,
      organizationId: this.organizationId,
      requestId,
    };
  }

  private async deny(camperId: string, action: string, requestId: string): Promise<never> {
    await this.store.recordAudit(this.context(requestId), action, camperId, 'denied', {
      mfa_verified: this.identity.mfaVerified,
    });
    throw new HealthAuthorizationError('Restricted health record access is not permitted');
  }

  private requireMfa(): boolean {
    return this.identity.mfaVerified;
  }

  private async isParentOwner(camperId: string): Promise<boolean> {
    return (
      this.hasRole(parentRoles) &&
      (await this.store.adultIdentityCanManageCamper(
        this.organizationId,
        camperId,
        this.identity.subject,
      ))
    );
  }

  private async authorizeRoutine(camperId: string, action: string, requestId: string) {
    if (this.hasRole(routineRoles) && this.requireMfa()) return 'staff' as const;
    if (await this.isParentOwner(camperId)) return 'parent' as const;
    return this.deny(camperId, action, requestId);
  }

  private decrypt(record: EncryptedHealthRecord): HealthPayload {
    try {
      return this.encryption.decrypt<HealthPayload>(this.organizationId, record.camper_id, {
        authenticationTag: record.authentication_tag,
        ciphertext: record.encrypted_payload,
        keyVersion: record.key_version,
        nonce: record.encryption_nonce,
      });
    } catch {
      throw new HealthEncryptionError('The protected health record could not be decrypted');
    }
  }

  private async fullRecord(
    encrypted: EncryptedHealthRecord,
    summary: HealthRecordSummaryRecord,
  ): Promise<HealthRecord> {
    const payload = this.decrypt(encrypted);
    return {
      ...summary,
      ...payload,
      reviewed_at: encrypted.reviewed_at,
      submitted_at: encrypted.submitted_at,
      version: encrypted.version,
    };
  }

  private async requireSummary(camperId: string): Promise<HealthRecordSummaryRecord> {
    const summaries = await this.store.listSummaries(this.organizationId);
    const summary = summaries.find((candidate) => candidate.camper_id === camperId);
    if (!summary) throw new HealthRecordNotFoundError('Camper not found');
    return summary;
  }

  async getCenter(requestId: string): Promise<HealthRecordCenter> {
    if (this.hasRole(parentRoles)) {
      return {
        records: await this.store.listSummaries(this.organizationId, this.identity.subject),
      };
    }
    if (!this.hasRole(centerRoles) || !this.requireMfa()) {
      return this.deny(this.organizationId, 'health.center_viewed', requestId);
    }
    const records = await this.store.listSummaries(this.organizationId);
    await this.store.recordAudit(
      this.context(requestId),
      'health.center_viewed',
      this.organizationId,
      'success',
      { record_count: records.length },
    );
    return { records };
  }

  async getRecord(
    camperId: string,
    access: HealthRecordAccessQuery,
    requestId: string,
  ): Promise<HealthRecord> {
    let accessMode: 'break_glass' | 'parent' | 'staff';
    if (access.break_glass) {
      if (!access.reason_code || !this.hasRole(breakGlassRoles) || !this.requireMfa()) {
        return this.deny(camperId, 'health.record_break_glass', requestId);
      }
      accessMode = 'break_glass';
    } else {
      accessMode = await this.authorizeRoutine(camperId, 'health.record_read', requestId);
    }
    const encrypted = await this.store.getEncrypted(this.organizationId, camperId);
    if (!encrypted) throw new HealthRecordNotFoundError('Health record not found');
    let record: HealthRecord;
    try {
      record = await this.fullRecord(encrypted, await this.requireSummary(camperId));
    } catch (error) {
      await this.store.recordAudit(
        this.context(requestId),
        accessMode === 'break_glass' ? 'health.record_break_glass' : 'health.record_read',
        camperId,
        'failure',
        { access_mode: accessMode },
      );
      throw error;
    }
    await this.store.recordAudit(
      this.context(requestId),
      accessMode === 'break_glass' ? 'health.record_break_glass' : 'health.record_read',
      camperId,
      'success',
      {
        access_mode: accessMode,
        ...(accessMode === 'break_glass' ? { reason_code: access.reason_code } : {}),
      },
    );
    return record;
  }

  async saveRecord(
    camperId: string,
    input: HealthRecordInput,
    requestId: string,
  ): Promise<HealthRecord> {
    await this.authorizeRoutine(camperId, 'health.record_write', requestId);
    const payload = clean(input);
    const encrypted = this.encryption.encrypt(this.organizationId, camperId, payload);
    const saved = await this.store.upsert(this.context(requestId), camperId, {
      authentication_tag: encrypted.authenticationTag,
      encrypted_payload: encrypted.ciphertext,
      encryption_nonce: encrypted.nonce,
      has_accessibility_needs: payload.accessibility_needs.length > 0,
      has_allergies: payload.allergies.length > 0,
      has_dietary_needs: payload.dietary_needs.length > 0,
      has_emergency_instructions: payload.emergency_instructions.length > 0,
      has_medications: payload.medications.length > 0,
      immunization_status: payload.immunization_status,
      key_version: encrypted.keyVersion,
      ...(input.version === undefined ? {} : { version: input.version }),
    });
    return this.fullRecord(saved, await this.requireSummary(camperId));
  }

  async submitRecord(camperId: string, version: number, requestId: string): Promise<HealthRecord> {
    await this.authorizeRoutine(camperId, 'health.record_submit', requestId);
    const saved = await this.store.setReviewState(
      this.context(requestId),
      camperId,
      version,
      'SUBMITTED',
    );
    return this.fullRecord(saved, await this.requireSummary(camperId));
  }

  async reviewRecord(
    camperId: string,
    review: HealthRecordReview,
    requestId: string,
  ): Promise<HealthRecord> {
    if (!this.hasRole(routineRoles) || !this.requireMfa()) {
      return this.deny(camperId, 'health.record_review', requestId);
    }
    const current = await this.store.getEncrypted(this.organizationId, camperId);
    if (!current) throw new HealthRecordNotFoundError('Health record not found');
    if (current.version !== review.version) {
      throw new HealthRecordConflictError('Health record was updated by another request');
    }
    if (current.review_status !== 'SUBMITTED') {
      throw new HealthValidationError('Only submitted health records can be reviewed');
    }
    let payload: HealthPayload;
    try {
      payload = this.decrypt(current);
    } catch (error) {
      await this.store.recordAudit(
        this.context(requestId),
        'health.record_review',
        camperId,
        'failure',
      );
      throw error;
    }
    payload.review_message = review.review_message.trim();
    const encrypted = this.encryption.encrypt(this.organizationId, camperId, payload);
    const savedPayload = await this.store.upsert(this.context(requestId), camperId, {
      authentication_tag: encrypted.authenticationTag,
      encrypted_payload: encrypted.ciphertext,
      encryption_nonce: encrypted.nonce,
      has_accessibility_needs: payload.accessibility_needs.length > 0,
      has_allergies: payload.allergies.length > 0,
      has_dietary_needs: payload.dietary_needs.length > 0,
      has_emergency_instructions: payload.emergency_instructions.length > 0,
      has_medications: payload.medications.length > 0,
      immunization_status: payload.immunization_status,
      key_version: encrypted.keyVersion,
      version: review.version,
    });
    const reviewed = await this.store.setReviewState(
      this.context(requestId),
      camperId,
      savedPayload.version,
      review.status,
    );
    return this.fullRecord(reviewed, await this.requireSummary(camperId));
  }

  async exportRecords(sessionId: string | undefined, requestId: string): Promise<HealthExport> {
    if (!this.hasRole(routineRoles) || !this.requireMfa()) {
      return this.deny(this.organizationId, 'health.records_exported', requestId);
    }
    const summaries = (
      await this.store.listSummaries(this.organizationId, undefined, sessionId)
    ).filter((summary) => summary.record_id);
    const rows = [
      [
        'Camper',
        'Family',
        'Allergies',
        'Medications',
        'Dietary needs',
        'Accessibility needs',
        'Emergency instructions',
        'Immunization status',
      ],
    ];
    for (const summary of summaries) {
      const encrypted = await this.store.getEncrypted(this.organizationId, summary.camper_id);
      if (!encrypted) continue;
      let payload: HealthPayload;
      try {
        payload = this.decrypt(encrypted);
      } catch (error) {
        await this.store.recordAudit(
          this.context(requestId),
          'health.record_exported',
          summary.camper_id,
          'failure',
        );
        throw error;
      }
      rows.push([
        summary.camper_name,
        summary.family_name,
        payload.allergies.join('; '),
        payload.medications.join('; '),
        payload.dietary_needs.join('; '),
        payload.accessibility_needs.join('; '),
        payload.emergency_instructions,
        payload.immunization_status,
      ]);
      await this.store.recordAudit(
        this.context(requestId),
        'health.record_exported',
        summary.camper_id,
        'success',
        { session_filtered: Boolean(sessionId) },
      );
    }
    const content = `\uFEFF${rows.map((row) => row.map(csvCell).join(',')).join('\r\n')}\r\n`;
    await this.store.recordAudit(
      this.context(requestId),
      'health.records_exported',
      this.organizationId,
      'success',
      { row_count: rows.length - 1, session_filtered: Boolean(sessionId) },
    );
    return {
      content,
      filename: `restricted-health-records-${new Date().toISOString().slice(0, 10)}.csv`,
      rowCount: rows.length - 1,
    };
  }
}
