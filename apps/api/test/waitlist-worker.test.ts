import type { NotificationOutboxRecord } from '@camp-registration/database';
import { describe, expect, it, vi } from 'vitest';

import { buildWaitlistEmail } from '../src/notifications/email.js';
import { WaitlistWorker } from '../src/waitlist/worker.js';

const organizationId = 'a60b272f-b028-4f1a-b666-3ef3cffd9827';
const notification: NotificationOutboxRecord = {
  attempt_count: 1,
  id: '0d13998e-d10a-42d6-b2d1-9a9fa0c6b756',
  idempotency_key: 'waitlist:ee38f527-ac85-4b18-954a-994e3a1d553f:WAITLIST_OFFERED:0:adult-id',
  notification_type: 'WAITLIST_OFFERED',
  recipient_email: 'parent@example.test',
  template_data: {
    camper_name: 'Avery Adams',
    expires_at: '2026-07-15T17:00:00Z',
    family_name: 'Adams Family',
    organization_timezone: 'America/Chicago',
    portal_path: '/portal',
    session_name: 'Day Camp Week 1',
  },
};

function workerOptions() {
  return {
    batchSize: 25,
    defaultOfferHours: 48,
    maximumDeliveryAttempts: 5,
    organizationIds: [organizationId],
    portalBaseUrl: 'http://localhost:3000',
    reminderLeadHours: 12,
    workerId: 'test-waitlist-worker',
  };
}

describe('waitlist worker', () => {
  it('runs automation and marks delivered outbox messages', async () => {
    const familyStore = {
      processWaitlistAutomation: vi.fn().mockResolvedValue({
        expired_offers: 1,
        offers_created: 1,
        reminders_queued: 1,
        sessions_scanned: 2,
      }),
    };
    const notificationStore = {
      claimPending: vi.fn().mockResolvedValue([notification]),
      markDelivered: vi.fn().mockResolvedValue(undefined),
      markFailed: vi.fn(),
    };
    const emailSender = { send: vi.fn().mockResolvedValue(undefined) };
    const logger = { error: vi.fn(), info: vi.fn() };
    const worker = new WaitlistWorker(
      familyStore as never,
      notificationStore as never,
      emailSender,
      logger,
      workerOptions(),
    );

    await expect(worker.runCycle()).resolves.toMatchObject({
      delivered: 1,
      failed: 0,
      waitlist: { expired_offers: 1, offers_created: 1, reminders_queued: 1 },
    });
    expect(familyStore.processWaitlistAutomation).toHaveBeenCalledWith(
      expect.objectContaining({ actorId: 'system:waitlist-worker', organizationId }),
      48,
      12,
    );
    expect(emailSender.send).toHaveBeenCalledWith(
      expect.objectContaining({
        subject: 'A seat is available: Day Camp Week 1',
        to: 'parent@example.test',
      }),
    );
    expect(notificationStore.markDelivered).toHaveBeenCalledWith(
      organizationId,
      'test-waitlist-worker',
      notification.id,
    );
  });

  it('releases failed deliveries for retry without logging recipient details', async () => {
    const familyStore = {
      processWaitlistAutomation: vi.fn().mockResolvedValue({
        expired_offers: 0,
        offers_created: 0,
        reminders_queued: 0,
        sessions_scanned: 0,
      }),
    };
    const notificationStore = {
      claimPending: vi.fn().mockResolvedValue([notification]),
      markDelivered: vi.fn(),
      markFailed: vi.fn().mockResolvedValue(undefined),
    };
    const emailSender = {
      send: vi.fn().mockRejectedValue(new Error('SMTP rejected parent@example.test')),
    };
    const logger = { error: vi.fn(), info: vi.fn() };
    const worker = new WaitlistWorker(
      familyStore as never,
      notificationStore as never,
      emailSender,
      logger,
      workerOptions(),
    );

    await expect(worker.runCycle()).resolves.toMatchObject({ delivered: 0, failed: 1 });
    expect(notificationStore.markFailed).toHaveBeenCalledWith(
      organizationId,
      'test-waitlist-worker',
      notification.id,
      'SMTP rejected [email]',
      5,
    );
    expect(JSON.stringify(logger.error.mock.calls)).not.toContain('parent@example.test');
  });
});

describe('waitlist email templates', () => {
  it('uses organization-local deadlines, portal links, and deterministic message ids', () => {
    const first = buildWaitlistEmail(notification, 'http://localhost:3000');
    const second = buildWaitlistEmail(notification, 'http://localhost:3000');

    expect(first.text).toContain('July 15, 2026 at 12:00 PM CDT');
    expect(first.text).toContain('http://localhost:3000/portal');
    expect(first.messageId).toBe(second.messageId);
  });
});
