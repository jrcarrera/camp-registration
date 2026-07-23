import type { RequestIdentity } from '@camp-registration/auth';
import type { HealthRecordStore } from '@camp-registration/database';
import { describe, expect, it, vi } from 'vitest';

import { AesGcmHealthEncryptionProvider } from '../src/health-records/encryption.js';
import { HealthAuthorizationError, HealthRecordService } from '../src/health-records/service.js';

const organizationId = 'a60b272f-b028-4f1a-b666-3ef3cffd9827';
const camperId = '0c3e5be4-2ff0-46d4-b58d-1f01f46e87bf';
const recordId = 'cf9104af-baa2-49f8-9289-e3bb0aa61103';
const encryption = new AesGcmHealthEncryptionProvider(new Map([[1, Buffer.alloc(32, 9)]]), 1);

function identity(role: 'camp_admin' | 'camp_staff' | 'parent_guardian'): RequestIdentity {
  return {
    email: 'user@example.test',
    emailVerified: true,
    memberships: [{ campIds: [], organizationId, roles: [role] }],
    mfaVerified: true,
    subject: `${role}-subject`,
  };
}

function store() {
  const payload = encryption.encrypt(organizationId, camperId, {
    accessibility_needs: [],
    allergies: ['Peanuts'],
    dietary_needs: [],
    document_references: [],
    emergency_instructions: 'Use epinephrine',
    immunization_notes: '',
    immunization_status: 'CURRENT',
    medications: [],
    review_message: '',
  });
  return {
    adultIdentityCanManageCamper: vi.fn(async () => false),
    getEncrypted: vi.fn(async () => ({
      authentication_tag: payload.authenticationTag,
      camper_id: camperId,
      encrypted_payload: payload.ciphertext,
      encryption_nonce: payload.nonce,
      family_id: '92cc853b-e2b6-4b1b-8684-0f4f6fcfc3a6',
      id: recordId,
      immunization_status: 'CURRENT' as const,
      key_version: payload.keyVersion,
      review_status: 'SUBMITTED' as const,
      reviewed_at: null,
      submitted_at: '2028-01-01T00:00:00.000Z',
      updated_at: '2028-01-01T00:00:00.000Z',
      version: 2,
    })),
    listSummaries: vi.fn(async () => [
      {
        camper_id: camperId,
        camper_name: 'Avery Winter',
        family_id: '92cc853b-e2b6-4b1b-8684-0f4f6fcfc3a6',
        family_name: 'Winter Family 001',
        has_accessibility_needs: false,
        has_allergies: true,
        has_dietary_needs: false,
        has_emergency_instructions: true,
        has_medications: false,
        immunization_status: 'CURRENT' as const,
        record_id: recordId,
        review_status: 'SUBMITTED' as const,
        session_names: ['Winter Camp'],
        updated_at: '2028-01-01T00:00:00.000Z',
      },
    ]),
    recordAudit: vi.fn(async () => undefined),
  };
}

describe('health record authorization and auditing', () => {
  it('denies ordinary camp staff and records the denied access', async () => {
    const healthStore = store();
    const service = new HealthRecordService(
      healthStore as unknown as HealthRecordStore,
      encryption,
      identity('camp_staff'),
      organizationId,
    );

    await expect(service.getRecord(camperId, {}, 'denied-read')).rejects.toBeInstanceOf(
      HealthAuthorizationError,
    );
    expect(healthStore.getEncrypted).not.toHaveBeenCalled();
    expect(healthStore.recordAudit).toHaveBeenCalledWith(
      expect.objectContaining({ requestId: 'denied-read' }),
      'health.record_read',
      camperId,
      'denied',
      expect.objectContaining({ mfa_verified: true }),
    );
  });

  it('requires a constrained reason and audits successful break-glass access', async () => {
    const healthStore = store();
    const service = new HealthRecordService(
      healthStore as unknown as HealthRecordStore,
      encryption,
      identity('camp_admin'),
      organizationId,
    );

    await expect(
      service.getRecord(camperId, { break_glass: true }, 'missing-reason'),
    ).rejects.toBeInstanceOf(HealthAuthorizationError);
    const opened = await service.getRecord(
      camperId,
      { break_glass: true, reason_code: 'EMERGENCY_CARE' },
      'break-glass',
    );

    expect(opened.allergies).toEqual(['Peanuts']);
    expect(healthStore.recordAudit).toHaveBeenLastCalledWith(
      expect.objectContaining({ requestId: 'break-glass' }),
      'health.record_break_glass',
      camperId,
      'success',
      {
        access_mode: 'break_glass',
        reason_code: 'EMERGENCY_CARE',
      },
    );
  });
});
