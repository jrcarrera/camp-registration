import type { RequestIdentity } from '@camp-registration/auth';
import type { WaitlistOperationsStatus } from '@camp-registration/contracts';
import { describe, expect, it, vi } from 'vitest';

import { buildApp } from '../src/app.js';
import { OperationsService } from '../src/operations/service.js';

const organizationId = 'a60b272f-b028-4f1a-b666-3ef3cffd9827';

const record = {
  consecutive_failures: 0,
  delivered_count: 2,
  delivery_failure_count: 0,
  expired_offer_backlog_count: 0,
  expired_offer_count: 1,
  failed_delivery_count: 0,
  health: 'HEALTHY' as const,
  last_completed_at: '2026-07-15T18:00:00.000Z',
  last_error_code: null,
  last_started_at: '2026-07-15T17:59:59.000Z',
  last_succeeded_at: '2026-07-15T18:00:00.000Z',
  offers_created_count: 1,
  pending_delivery_count: 0,
  reminders_queued_count: 1,
  sessions_scanned_count: 3,
};

function identity(role: 'camp_staff' | 'parent_guardian'): RequestIdentity {
  return {
    email: 'operator@example.test',
    emailVerified: true,
    memberships: [{ campIds: [], organizationId, roles: [role] }],
    mfaVerified: true,
    subject: 'operator',
  };
}

describe('waitlist operations API', () => {
  it('returns tenant-scoped worker and delivery health to staff', async () => {
    const store = { getStatus: vi.fn().mockResolvedValue(record) };
    const service = new OperationsService(store as never, identity('camp_staff'), organizationId);
    const app = await buildApp({ operationsService: service });

    const response = await app.inject({ method: 'GET', url: '/v1/operations/waitlist' });

    expect(response.statusCode).toBe(200);
    expect(response.json<WaitlistOperationsStatus>()).toMatchObject({
      health: 'HEALTHY',
      recent_cycle: { delivered_count: 2, offers_created_count: 1 },
    });
    expect(store.getStatus).toHaveBeenCalledWith(organizationId, 120);
    await app.close();
  });

  it('denies parent access to worker operations', async () => {
    const service = new OperationsService(
      { getStatus: vi.fn().mockResolvedValue(record) } as never,
      identity('parent_guardian'),
      organizationId,
    );
    const app = await buildApp({ operationsService: service });

    const response = await app.inject({ method: 'GET', url: '/v1/operations/waitlist' });

    expect(response.statusCode).toBe(403);
    expect(response.json()).toMatchObject({ code: 'forbidden' });
    await app.close();
  });
});
