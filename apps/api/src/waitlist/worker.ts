import { randomUUID } from 'node:crypto';

import type {
  FamilyStore,
  FamilyWriteContext,
  CommunicationsStore,
  NotificationOutboxRecord,
  NotificationStore,
  WaitlistAutomationResult,
  WaitlistOperationsStore,
} from '@camp-registration/database';

import { buildWaitlistEmail, type EmailSender } from '../notifications/email.js';

export interface WaitlistWorkerLogger {
  error(data: Record<string, unknown>, message: string): void;
  info(data: Record<string, unknown>, message: string): void;
}

export interface WaitlistWorkerOptions {
  batchSize: number;
  maximumDeliveryAttempts: number;
  portalBaseUrl: string;
  reminderLeadHours: number;
  workerId: string;
}

export interface WaitlistWorkerCycleResult {
  communications_queued: number;
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
    private readonly operationsStore: Pick<
      WaitlistOperationsStore,
      'listEnabledOrganizationIds' | 'recordCycleCompleted' | 'recordCycleStarted'
    >,
    private readonly emailSender: EmailSender,
    private readonly logger: WaitlistWorkerLogger,
    private readonly options: WaitlistWorkerOptions,
    private readonly communicationsStore?: Pick<
      CommunicationsStore,
      'listOrganizationIds' | 'processDueCampaigns'
    >,
  ) {}

  async runCycle(): Promise<WaitlistWorkerCycleResult> {
    const cycleId = randomUUID();
    const waitlistOrganizationIds = await this.operationsStore.listEnabledOrganizationIds();
    const communicationOrganizationIds = this.communicationsStore
      ? await this.communicationsStore.listOrganizationIds()
      : [];
    const organizationIds = [
      ...new Set([...waitlistOrganizationIds, ...communicationOrganizationIds]),
    ];
    const waitlistOrganizations = new Set(waitlistOrganizationIds);
    const total: WaitlistWorkerCycleResult = {
      communications_queued: 0,
      delivered: 0,
      failed: 0,
      organizations: organizationIds.length,
      waitlist: {
        expired_offers: 0,
        offers_created: 0,
        reminders_queued: 0,
        sessions_scanned: 0,
      },
    };

    for (const organizationId of organizationIds) {
      const context: FamilyWriteContext = {
        actorId: 'system:waitlist-worker',
        organizationId,
        requestId: `waitlist-worker:${cycleId}`,
      };
      const organizationMetrics = {
        delivered_count: 0,
        delivery_failure_count: 0,
        expired_offer_count: 0,
        offers_created_count: 0,
        reminders_queued_count: 0,
        sessions_scanned_count: 0,
      };
      let errorCode: string | null = null;
      if (waitlistOrganizations.has(organizationId)) {
        try {
          await this.operationsStore.recordCycleStarted(organizationId, this.options.workerId);
        } catch (error) {
          this.logger.error(
            {
              error_type: error instanceof Error ? error.name : 'UnknownError',
              organization_id: organizationId,
            },
            'waitlist worker heartbeat start failed',
          );
        }
        try {
          const waitlist = await this.familyStore.processWaitlistAutomation(
            context,
            this.options.reminderLeadHours,
          );
          total.waitlist.expired_offers += waitlist.expired_offers;
          total.waitlist.offers_created += waitlist.offers_created;
          total.waitlist.reminders_queued += waitlist.reminders_queued;
          total.waitlist.sessions_scanned += waitlist.sessions_scanned;
          organizationMetrics.expired_offer_count = waitlist.expired_offers;
          organizationMetrics.offers_created_count = waitlist.offers_created;
          organizationMetrics.reminders_queued_count = waitlist.reminders_queued;
          organizationMetrics.sessions_scanned_count = waitlist.sessions_scanned;
        } catch (error) {
          errorCode = 'waitlist_automation_failed';
          this.logger.error(
            {
              error_type: error instanceof Error ? error.name : 'UnknownError',
              organization_id: organizationId,
            },
            'waitlist automation failed',
          );
        }
      }

      if (this.communicationsStore) {
        try {
          total.communications_queued +=
            await this.communicationsStore.processDueCampaigns(organizationId);
        } catch (error) {
          errorCode = errorCode ? 'multiple_cycle_steps_failed' : 'communications_queue_failed';
          this.logger.error(
            {
              error_type: error instanceof Error ? error.name : 'UnknownError',
              organization_id: organizationId,
            },
            'lifecycle communication queue failed',
          );
        }
      }

      let messages: NotificationOutboxRecord[];
      try {
        messages = await this.notificationStore.claimPending(
          organizationId,
          this.options.workerId,
          this.options.batchSize,
        );
      } catch (error) {
        errorCode = errorCode ? 'multiple_cycle_steps_failed' : 'notification_claim_failed';
        this.logger.error(
          {
            error_type: error instanceof Error ? error.name : 'UnknownError',
            organization_id: organizationId,
          },
          'notification outbox claim failed',
        );
        messages = [];
      }
      for (const record of messages) {
        try {
          if (await this.deliver(organizationId, record)) {
            total.delivered += 1;
            organizationMetrics.delivered_count += 1;
          } else {
            total.failed += 1;
            organizationMetrics.delivery_failure_count += 1;
          }
        } catch (error) {
          errorCode = errorCode ? 'multiple_cycle_steps_failed' : 'notification_state_failed';
          this.logger.error(
            {
              error_type: error instanceof Error ? error.name : 'UnknownError',
              notification_id: record.id,
              organization_id: organizationId,
            },
            'waitlist notification state update failed',
          );
        }
      }
      if (waitlistOrganizations.has(organizationId)) {
        try {
          await this.operationsStore.recordCycleCompleted(
            organizationId,
            this.options.workerId,
            organizationMetrics,
            errorCode,
          );
        } catch (error) {
          this.logger.error(
            {
              error_type: error instanceof Error ? error.name : 'UnknownError',
              organization_id: organizationId,
            },
            'waitlist worker heartbeat completion failed',
          );
        }
      }
    }

    this.logger.info(
      {
        cycle_id: cycleId,
        communications_queued: total.communications_queued,
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
  ): Promise<boolean> {
    try {
      await this.emailSender.send(buildWaitlistEmail(record, this.options.portalBaseUrl));
      await this.notificationStore.markDelivered(organizationId, this.options.workerId, record.id);
      return true;
    } catch (error) {
      await this.notificationStore.markFailed(
        organizationId,
        this.options.workerId,
        record.id,
        safeDeliveryError(error),
        this.options.maximumDeliveryAttempts,
      );
      this.logger.error(
        {
          error_type: error instanceof Error ? error.name : 'UnknownError',
          notification_id: record.id,
          organization_id: organizationId,
        },
        'waitlist notification delivery failed',
      );
      return false;
    }
  }
}
