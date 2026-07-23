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
    maximumDeliveryAttempts: 5,
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
    const operationsStore = {
      listEnabledOrganizationIds: vi.fn().mockResolvedValue([organizationId]),
      recordCycleCompleted: vi.fn().mockResolvedValue(undefined),
      recordCycleStarted: vi.fn().mockResolvedValue(undefined),
    };
    const logger = { error: vi.fn(), info: vi.fn() };
    const worker = new WaitlistWorker(
      familyStore as never,
      notificationStore as never,
      operationsStore as never,
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
    expect(operationsStore.recordCycleCompleted).toHaveBeenCalledWith(
      organizationId,
      'test-waitlist-worker',
      expect.objectContaining({ delivered_count: 1, expired_offer_count: 1 }),
      null,
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
    const operationsStore = {
      listEnabledOrganizationIds: vi.fn().mockResolvedValue([organizationId]),
      recordCycleCompleted: vi.fn().mockResolvedValue(undefined),
      recordCycleStarted: vi.fn().mockResolvedValue(undefined),
    };
    const logger = { error: vi.fn(), info: vi.fn() };
    const worker = new WaitlistWorker(
      familyStore as never,
      notificationStore as never,
      operationsStore as never,
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
    expect(operationsStore.recordCycleCompleted).toHaveBeenCalledWith(
      organizationId,
      'test-waitlist-worker',
      expect.objectContaining({ delivery_failure_count: 1 }),
      null,
    );
  });

  it('records a degraded cycle when tenant automation fails', async () => {
    const familyStore = {
      processWaitlistAutomation: vi.fn().mockRejectedValue(new Error('database unavailable')),
    };
    const notificationStore = {
      claimPending: vi.fn().mockResolvedValue([]),
      markDelivered: vi.fn(),
      markFailed: vi.fn(),
    };
    const operationsStore = {
      listEnabledOrganizationIds: vi.fn().mockResolvedValue([organizationId]),
      recordCycleCompleted: vi.fn().mockResolvedValue(undefined),
      recordCycleStarted: vi.fn().mockResolvedValue(undefined),
    };
    const worker = new WaitlistWorker(
      familyStore as never,
      notificationStore as never,
      operationsStore as never,
      { send: vi.fn() },
      { error: vi.fn(), info: vi.fn() },
      workerOptions(),
    );

    await worker.runCycle();

    expect(operationsStore.recordCycleCompleted).toHaveBeenCalledWith(
      organizationId,
      'test-waitlist-worker',
      expect.any(Object),
      'waitlist_automation_failed',
    );
  });

  it('queues lifecycle campaigns for every tenant before claiming notifications', async () => {
    const familyStore = { processWaitlistAutomation: vi.fn() };
    const notificationStore = {
      claimPending: vi.fn().mockResolvedValue([]),
      markDelivered: vi.fn(),
      markFailed: vi.fn(),
    };
    const operationsStore = {
      listEnabledOrganizationIds: vi.fn().mockResolvedValue([]),
      recordCycleCompleted: vi.fn(),
      recordCycleStarted: vi.fn(),
    };
    const communicationsStore = {
      listOrganizationIds: vi.fn().mockResolvedValue([organizationId]),
      processDueCampaigns: vi.fn().mockResolvedValue(3),
    };
    const worker = new WaitlistWorker(
      familyStore as never,
      notificationStore as never,
      operationsStore as never,
      { send: vi.fn() },
      { error: vi.fn(), info: vi.fn() },
      workerOptions(),
      communicationsStore as never,
    );

    await expect(worker.runCycle()).resolves.toMatchObject({ communications_queued: 3 });
    expect(communicationsStore.processDueCampaigns).toHaveBeenCalledWith(organizationId);
    expect(familyStore.processWaitlistAutomation).not.toHaveBeenCalled();
    expect(notificationStore.claimPending).toHaveBeenCalledWith(
      organizationId,
      'test-waitlist-worker',
      25,
    );
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

  it('includes line adjustments, balance, and installments in household confirmations', () => {
    const orderNotification: NotificationOutboxRecord = {
      attempt_count: 1,
      id: 'c03f4f34-0f42-4f4e-960d-9ada1219146d',
      idempotency_key: 'order-confirmation:test-order',
      notification_type: 'ORDER_CONFIRMATION',
      recipient_email: 'parent@example.test',
      template_data: {
        amount_cents: 10_000,
        currency: 'USD',
        family_name: 'Adams Family',
        line_count: 1,
        order_summary: {
          assistance_cents: 2_000,
          automatic_discount_cents: 4_000,
          coupon_discount_cents: 1_000,
          gross_total_cents: 60_000,
          installments: [{ amount_cents: 21_500, due_on: '2027-03-01', status: 'SCHEDULED' }],
          lines: [
            {
              assistance_cents: 2_000,
              automatic_discount_cents: 4_000,
              camper_name: 'Amara Adams',
              coupon_discount_cents: 1_000,
              gross_price_cents: 60_000,
              net_price_cents: 53_000,
              outcome: 'CONFIRMED',
              session_name: 'Day Camp Week 1',
            },
          ],
          net_total_cents: 53_000,
          paid_cents: 10_000,
          remaining_balance_cents: 43_000,
        },
        portal_path: '/portal',
      },
    };

    const email = buildWaitlistEmail(orderNotification, 'http://localhost:3000');

    expect(email.text).toContain('Amara Adams — Day Camp Week 1 (confirmed)');
    expect(email.text).toContain('Automatic discount: -$40.00');
    expect(email.text).toContain('Amount paid: $100.00');
    expect(email.text).toContain('Remaining balance: $430.00');
    expect(email.text).toContain('2027-03-01: $215.00 (scheduled)');
  });

  it('renders lifecycle messages with a provider-independent portal link', () => {
    const lifecycle: NotificationOutboxRecord = {
      attempt_count: 1,
      id: '96181710-105f-4d9c-b552-53951c86bc48',
      idempotency_key: 'communication:campaign:registration:adult',
      notification_type: 'LIFECYCLE_MESSAGE',
      recipient_email: 'parent@example.test',
      template_data: {
        body: 'Hello Adams Family. Review forms at {{portal_url}}.',
        portal_path: '/portal/forms',
        subject: 'Forms due for Avery',
      },
    };

    const email = buildWaitlistEmail(lifecycle, 'https://camp.example');

    expect(email.subject).toBe('Forms due for Avery');
    expect(email.text).toContain('https://camp.example/portal/forms');
  });
});
