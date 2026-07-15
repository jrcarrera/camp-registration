import { randomUUID } from 'node:crypto';

import type {
  FamilyStore,
  FamilyWriteContext,
  NotificationOutboxRecord,
  NotificationStore,
  WaitlistAutomationResult,
} from '@camp-registration/database';

import { buildWaitlistEmail, type EmailSender } from '../notifications/email.js';

export interface WaitlistWorkerLogger {
  error(data: Record<string, unknown>, message: string): void;
  info(data: Record<string, unknown>, message: string): void;
}

export interface WaitlistWorkerOptions {
  batchSize: number;
  defaultOfferHours: number;
  maximumDeliveryAttempts: number;
  organizationIds: string[];
  portalBaseUrl: string;
  reminderLeadHours: number;
  workerId: string;
}

export interface WaitlistWorkerCycleResult {
  delivered: number;
  failed: number;
  organizations: number;
  waitlist: WaitlistAutomationResult;
}

function safeDeliveryError(error: unknown): string {
  const message = error instanceof Error ? error.message : 'Unknown delivery error';
  return message
    .replace(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi, '[email]')
    .replace(/\s+/g, ' ')
    .slice(0, 500);
}

export class WaitlistWorker {
  constructor(
    private readonly familyStore: Pick<FamilyStore, 'processWaitlistAutomation'>,
    private readonly notificationStore: Pick<
      NotificationStore,
      'claimPending' | 'markDelivered' | 'markFailed'
    >,
    private readonly emailSender: EmailSender,
    private readonly logger: WaitlistWorkerLogger,
    private readonly options: WaitlistWorkerOptions,
  ) {}

  async runCycle(): Promise<WaitlistWorkerCycleResult> {
    const cycleId = randomUUID();
    const total: WaitlistWorkerCycleResult = {
      delivered: 0,
      failed: 0,
      organizations: this.options.organizationIds.length,
      waitlist: {
        expired_offers: 0,
        offers_created: 0,
        reminders_queued: 0,
        sessions_scanned: 0,
      },
    };

    for (const organizationId of this.options.organizationIds) {
      const context: FamilyWriteContext = {
        actorId: 'system:waitlist-worker',
        organizationId,
        requestId: `waitlist-worker:${cycleId}`,
      };
      try {
        const waitlist = await this.familyStore.processWaitlistAutomation(
          context,
          this.options.defaultOfferHours,
          this.options.reminderLeadHours,
        );
        total.waitlist.expired_offers += waitlist.expired_offers;
        total.waitlist.offers_created += waitlist.offers_created;
        total.waitlist.reminders_queued += waitlist.reminders_queued;
        total.waitlist.sessions_scanned += waitlist.sessions_scanned;
      } catch (error) {
        this.logger.error(
          {
            error_type: error instanceof Error ? error.name : 'UnknownError',
            organization_id: organizationId,
          },
          'waitlist automation failed',
        );
      }

      let messages: NotificationOutboxRecord[];
      try {
        messages = await this.notificationStore.claimPending(
          organizationId,
          this.options.workerId,
          this.options.batchSize,
        );
      } catch (error) {
        this.logger.error(
          {
            error_type: error instanceof Error ? error.name : 'UnknownError',
            organization_id: organizationId,
          },
          'notification outbox claim failed',
        );
        continue;
      }
      for (const record of messages) {
        await this.deliver(organizationId, record, total);
      }
    }

    this.logger.info(
      {
        cycle_id: cycleId,
        delivered: total.delivered,
        expired_offers: total.waitlist.expired_offers,
        failed: total.failed,
        offers_created: total.waitlist.offers_created,
        organizations: total.organizations,
        reminders_queued: total.waitlist.reminders_queued,
        sessions_scanned: total.waitlist.sessions_scanned,
      },
      'waitlist worker cycle completed',
    );
    return total;
  }

  private async deliver(
    organizationId: string,
    record: NotificationOutboxRecord,
    total: WaitlistWorkerCycleResult,
  ): Promise<void> {
    try {
      await this.emailSender.send(buildWaitlistEmail(record, this.options.portalBaseUrl));
      await this.notificationStore.markDelivered(organizationId, this.options.workerId, record.id);
      total.delivered += 1;
    } catch (error) {
      await this.notificationStore.markFailed(
        organizationId,
        this.options.workerId,
        record.id,
        safeDeliveryError(error),
        this.options.maximumDeliveryAttempts,
      );
      total.failed += 1;
      this.logger.error(
        {
          error_type: error instanceof Error ? error.name : 'UnknownError',
          notification_id: record.id,
          organization_id: organizationId,
        },
        'waitlist notification delivery failed',
      );
    }
  }
}
