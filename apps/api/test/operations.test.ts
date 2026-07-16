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
  no_recipient_count: 1,
  offers_created_count: 1,
  pending_delivery_count: 0,
  reminders_queued_count: 1,
  sessions_scanned_count: 3,
};

const issues = [
  {
    attempt_count: 0,
    camper_name: 'Sam Checkout',
    family_name: 'Checkout Second Family',
    id: 'a65e4a31-c5c0-469e-9537-965b267d152c',
    issue_type: 'NO_ELIGIBLE_RECIPIENT' as const,
    notification_type: 'WAITLIST_OFFERED' as const,
    observed_at: '2026-07-15T18:00:00.000Z',
    recipient_hint: null,
    replay_count: 0,
    session_name: 'Pine Ridge',
  },
];

function identity(role: 'camp_admin' | 'camp_staff' | 'parent_guardian'): RequestIdentity {
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
    const store = {
      getStatus: vi.fn().mockResolvedValue(record),
      listNotificationIssues: vi.fn().mockResolvedValue(issues),
      replayNotificationIssue: vi.fn(),
    };
    const service = new OperationsService(store as never, identity('camp_staff'), organizationId);
    const app = await buildApp({ operationsService: service });

    const response = await app.inject({ method: 'GET', url: '/v1/operations/waitlist' });

    expect(response.statusCode).toBe(200);
    expect(response.json<WaitlistOperationsStatus>()).toMatchObject({
      can_replay_notifications: false,
      health: 'HEALTHY',
      no_recipient_count: 1,
      notification_issues: issues,
      recent_cycle: { delivered_count: 2, offers_created_count: 1 },
    });
    expect(store.getStatus).toHaveBeenCalledWith(organizationId, 120);
    expect(store.listNotificationIssues).toHaveBeenCalledWith(organizationId);
    await app.close();
  });

  it('denies parent access to worker operations', async () => {
    const service = new OperationsService(
      {
        getStatus: vi.fn().mockResolvedValue(record),
        listNotificationIssues: vi.fn().mockResolvedValue([]),
        replayNotificationIssue: vi.fn(),
      } as never,
      identity('parent_guardian'),
      organizationId,
    );
    const app = await buildApp({ operationsService: service });

    const response = await app.inject({ method: 'GET', url: '/v1/operations/waitlist' });

    expect(response.statusCode).toBe(403);
    expect(response.json()).toMatchObject({ code: 'forbidden' });
    await app.close();
  });

  it('allows administrators to replay a notification issue with audit context', async () => {
    const replayed = {
      issue_id: issues[0]!.id,
      issue_open: false,
      issue_type: 'NO_ELIGIBLE_RECIPIENT' as const,
      queued_count: 1,
      replayed_at: '2026-07-15T18:03:00.000Z',
    };
    const store = {
      getStatus: vi.fn().mockResolvedValue(record),
      listNotificationIssues: vi.fn().mockResolvedValue(issues),
      replayNotificationIssue: vi.fn().mockResolvedValue(replayed),
    };
    const service = new OperationsService(store as never, identity('camp_admin'), organizationId);
    const app = await buildApp({ operationsService: service });

    const response = await app.inject({
      method: 'POST',
      payload: { reason: 'Family contact preferences were corrected.' },
      url: `/v1/operations/waitlist/notifications/coverage/${issues[0]!.id}/replay`,
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual(replayed);
    expect(store.replayNotificationIssue).toHaveBeenCalledWith(
      {
        actorId: 'operator',
        organizationId,
        requestId: expect.any(String),
      },
      'NO_ELIGIBLE_RECIPIENT',
      issues[0]!.id,
      'Family contact preferences were corrected.',
    );
    await app.close();
  });

  it('denies notification replay to staff without administrator privileges', async () => {
    const store = {
      getStatus: vi.fn().mockResolvedValue(record),
      listNotificationIssues: vi.fn().mockResolvedValue(issues),
      replayNotificationIssue: vi.fn(),
    };
    const service = new OperationsService(store as never, identity('camp_staff'), organizationId);
    const app = await buildApp({ operationsService: service });

    const response = await app.inject({
      method: 'POST',
      payload: { reason: 'Retry requested by staff.' },
      url: `/v1/operations/waitlist/notifications/coverage/${issues[0]!.id}/replay`,
    });

    expect(response.statusCode).toBe(403);
    expect(response.json()).toMatchObject({ code: 'forbidden' });
    expect(store.replayNotificationIssue).not.toHaveBeenCalled();
    await app.close();
  });

  it('rejects a replay reason that is empty after normalization', async () => {
    const store = {
      getStatus: vi.fn().mockResolvedValue(record),
      listNotificationIssues: vi.fn().mockResolvedValue(issues),
      replayNotificationIssue: vi.fn(),
    };
    const service = new OperationsService(store as never, identity('camp_admin'), organizationId);

    await expect(
      service.replayWaitlistNotification('coverage', issues[0]!.id, '   ', 'request-id'),
    ).rejects.toThrow('Replay reason must be between 3 and 500 characters');
    expect(store.replayNotificationIssue).not.toHaveBeenCalled();
  });
});
