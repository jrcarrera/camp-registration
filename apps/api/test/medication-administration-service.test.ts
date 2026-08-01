import type { RequestIdentity } from '@camp-registration/auth';
import type { MedicationAdministrationStore } from '@camp-registration/database';
import { describe, expect, it, vi } from 'vitest';

import { AesGcmHealthEncryptionProvider } from '../src/health-records/encryption.js';
import {
  MedicationAdministrationAuthorizationError,
  MedicationAdministrationInputError,
  MedicationAdministrationService,
} from '../src/medication-administration/service.js';

const organizationId = 'a60b272f-b028-4f1a-b666-3ef3cffd9827';
const camperId = '0c3e5be4-2ff0-46d4-b58d-1f01f46e87bf';
const sessionId = '2016ba2d-d2e7-497d-9049-e4ea25079b25';
const orderId = '9089074f-181a-48d7-bb33-d58547283bbd';
const encryption = new AesGcmHealthEncryptionProvider(new Map([[1, Buffer.alloc(32, 9)]]), 1);

function identity(role: 'health_staff' | 'camp_staff', mfaVerified = true): RequestIdentity {
  return {
    email: 'user@example.test',
    emailVerified: true,
    memberships: [{ campIds: [], organizationId, roles: [role] }],
    mfaVerified,
    subject: `${role}-subject`,
  };
}

function store() {
  const payload = encryption.encrypt(organizationId, `${camperId}:medication-order:${orderId}`, {
    administration_times: ['08:00'],
    dose: '5 mg',
    instructions: 'Give with breakfast.',
    medication_name: 'Example medication',
  });
  return {
    getOrder: vi.fn(async () => ({
      authentication_tag: payload.authenticationTag,
      camper_id: camperId,
      camper_name: 'Avery Winter',
      created_at: '2020-01-01T12:00:00.000Z',
      discontinued_at: null,
      encrypted_payload: payload.ciphertext,
      encryption_nonce: payload.nonce,
      ends_on: '2020-01-07',
      id: orderId,
      key_version: payload.keyVersion,
      schedule_type: 'SCHEDULED' as const,
      session_id: sessionId,
      session_name: 'Winter Camp',
      starts_on: '2020-01-01',
      status: 'ACTIVE' as const,
      version: 1,
    })),
    getOrganizationTimezone: vi.fn(async () => 'America/Chicago'),
    listAdministrations: vi.fn(async () => []),
    listCandidates: vi.fn(async () => []),
    listOrders: vi.fn(async () => []),
    recordAdministration: vi.fn(async (...args: [unknown, string, unknown]) => {
      void args;
    }),
    recordAudit: vi.fn(async () => undefined),
  };
}

describe('medication administration authorization and safety validation', () => {
  it('denies ordinary staff and records only safe denial metadata', async () => {
    const medicationStore = store();
    const service = new MedicationAdministrationService(
      medicationStore as unknown as MedicationAdministrationStore,
      encryption,
      identity('camp_staff'),
      organizationId,
    );

    await expect(service.getCenter({ date: '2020-01-01' }, 'denied-round')).rejects.toBeInstanceOf(
      MedicationAdministrationAuthorizationError,
    );
    expect(medicationStore.listOrders).not.toHaveBeenCalled();
    expect(medicationStore.recordAudit).toHaveBeenCalledWith(
      expect.objectContaining({ requestId: 'denied-round' }),
      'health.medication_administration_center_viewed',
      organizationId,
      'denied',
      { mfa_verified: true },
    );
  });

  it('encrypts notes and rejects a time outside the medication schedule', async () => {
    const medicationStore = store();
    const service = new MedicationAdministrationService(
      medicationStore as unknown as MedicationAdministrationStore,
      encryption,
      identity('health_staff'),
      organizationId,
    );

    await service.recordAdministration(
      orderId,
      {
        administered_at: '2020-01-01T14:01:00.000Z',
        note: 'Observed swallowing the dose.',
        outcome: 'GIVEN',
        scheduled_for: '2020-01-01T14:00:00.000Z',
      },
      'record-dose',
    );
    const persisted = medicationStore.recordAdministration.mock.calls[0]![2] as {
      encrypted_payload: Buffer;
      scheduled_for: string | null;
    };
    expect(persisted.encrypted_payload.toString('utf8')).not.toContain('Observed swallowing');
    expect(persisted.scheduled_for).toBe('2020-01-01T14:00:00.000Z');

    await expect(
      service.recordAdministration(
        orderId,
        {
          administered_at: '2020-01-01T15:01:00.000Z',
          note: '',
          outcome: 'GIVEN',
          scheduled_for: '2020-01-01T15:00:00.000Z',
        },
        'wrong-slot',
      ),
    ).rejects.toBeInstanceOf(MedicationAdministrationInputError);
    expect(medicationStore.recordAdministration).toHaveBeenCalledTimes(1);
  });

  it('requires MFA and a reason for every non-given outcome', async () => {
    const medicationStore = store();
    const noMfaService = new MedicationAdministrationService(
      medicationStore as unknown as MedicationAdministrationStore,
      encryption,
      identity('health_staff', false),
      organizationId,
    );
    await expect(
      noMfaService.getCenter({ date: '2020-01-01' }, 'missing-mfa'),
    ).rejects.toBeInstanceOf(MedicationAdministrationAuthorizationError);

    const service = new MedicationAdministrationService(
      medicationStore as unknown as MedicationAdministrationStore,
      encryption,
      identity('health_staff'),
      organizationId,
    );
    await expect(
      service.recordAdministration(
        orderId,
        {
          administered_at: '2020-01-01T14:01:00.000Z',
          note: '   ',
          outcome: 'HELD',
          scheduled_for: '2020-01-01T14:00:00.000Z',
        },
        'missing-note',
      ),
    ).rejects.toBeInstanceOf(MedicationAdministrationInputError);
  });
});
