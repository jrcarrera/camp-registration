import type { RequestIdentity } from '@camp-registration/auth';
import type { WorkforceStore } from '@camp-registration/database';
import { describe, expect, it, vi } from 'vitest';

import { WorkforceAuthorizationError, WorkforceService } from '../src/workforce/service.js';

const organizationId = 'a60b272f-b028-4f1a-b666-3ef3cffd9827';
const sessionId = 'b30f1e1d-8de2-4d7b-ac3b-ae4e21d4bb41';

function identity(
  role: 'camp_admin' | 'camp_staff' | 'parent_guardian' | 'health_staff' | 'finance_staff',
  mfaVerified = true,
): RequestIdentity {
  return {
    email: 'user@example.test',
    emailVerified: true,
    memberships: [{ campIds: [], organizationId, roles: [role] }],
    mfaVerified,
    subject: `${role}-subject`,
  };
}

function store() {
  return {
    get: vi.fn(async () => null),
    list: vi.fn(async () => ({
      profiles: [],
      summary: { active_staff: 0, active_volunteers: 0, unassigned_active: 0 },
      total: 0,
    })),
    recordAudit: vi.fn(async () => undefined),
    roster: vi.fn(async () => ({
      assignments: [
        {
          display_name: 'Morgan Lee',
          ends_on: '2028-01-07',
          position_name: 'Counselor',
          starts_on: '2028-01-01',
          status: 'CONFIRMED' as const,
          workforce_type: 'STAFF' as const,
        },
      ],
      ends_on: '2028-01-07',
      session_id: sessionId,
      session_name: 'Winter Camp',
      starts_on: '2028-01-01',
    })),
  };
}

describe('workforce service authorization and audit minimization', () => {
  it('requires an MFA-verified administrator for profile administration', async () => {
    for (const [role, mfa] of [
      ['parent_guardian', true],
      ['camp_staff', true],
      ['health_staff', true],
      ['finance_staff', true],
      ['camp_admin', false],
    ] as const) {
      const workforceStore = store();
      const service = new WorkforceService(
        workforceStore as unknown as WorkforceStore,
        identity(role, mfa),
        organizationId,
      );
      await expect(service.listProfiles({}, `deny-${role}-${mfa}`)).rejects.toBeInstanceOf(
        WorkforceAuthorizationError,
      );
      expect(workforceStore.list).not.toHaveBeenCalled();
      expect(workforceStore.recordAudit).toHaveBeenCalledWith(
        expect.objectContaining({ organizationId }),
        'workforce.listed',
        organizationId,
        'denied',
        { mfa_verified: mfa },
      );
    }
  });

  it('permits camp staff only to read the contact-free session roster', async () => {
    const workforceStore = store();
    const service = new WorkforceService(
      workforceStore as unknown as WorkforceStore,
      identity('camp_staff'),
      organizationId,
    );
    const roster = await service.getSessionRoster(sessionId, 'staff-roster');
    expect(roster.assignments[0]).not.toHaveProperty('email');
    expect(roster.assignments[0]).not.toHaveProperty('phone');
    expect(roster.assignments[0]).not.toHaveProperty('account_id');
    expect(workforceStore.recordAudit).toHaveBeenLastCalledWith(
      expect.objectContaining({ requestId: 'staff-roster' }),
      'workforce.roster_viewed',
      sessionId,
      'success',
      { result_count: 1 },
    );
  });

  it('uses bounded pagination and does not audit raw search or contact data', async () => {
    const workforceStore = store();
    const service = new WorkforceService(
      workforceStore as unknown as WorkforceStore,
      identity('camp_admin'),
      organizationId,
    );
    await service.listProfiles({ page: 2, page_size: 50, search: ' Morgan@example.test ' }, 'list');
    expect(workforceStore.list).toHaveBeenCalledWith(
      organizationId,
      expect.objectContaining({ page: 2, pageSize: 50, search: ' Morgan@example.test ' }),
    );
    const auditDetails = (workforceStore.recordAudit.mock.calls as unknown[][]).at(-1)?.[4];
    expect(auditDetails).toEqual({ filter_present: true, result_count: 0 });
    expect(JSON.stringify(auditDetails)).not.toContain('Morgan');
  });
});
