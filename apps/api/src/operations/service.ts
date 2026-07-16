import type { RequestIdentity } from '@camp-registration/auth';
import type { WaitlistOperationsStatus } from '@camp-registration/contracts';
import type { WaitlistOperationsStore } from '@camp-registration/database';

const operationsRoles = new Set(['camp_staff', 'camp_admin', 'organization_admin']);

export class OperationsAuthorizationError extends Error {}

export interface OperationsServiceApi {
  getWaitlistStatus(): Promise<WaitlistOperationsStatus>;
}

export class OperationsService implements OperationsServiceApi {
  private readonly membership;

  constructor(
    private readonly store: Pick<WaitlistOperationsStore, 'getStatus'>,
    private readonly identity: RequestIdentity,
    private readonly organizationId: string,
    private readonly staleAfterSeconds = 120,
  ) {
    this.membership = identity.memberships.find(
      (membership) => membership.organizationId === organizationId,
    );
  }

  async getWaitlistStatus(): Promise<WaitlistOperationsStatus> {
    if (!this.membership?.roles.some((role) => operationsRoles.has(role))) {
      throw new OperationsAuthorizationError('Waitlist operations access is not permitted');
    }
    const status = await this.store.getStatus(this.organizationId, this.staleAfterSeconds);
    return {
      consecutive_failures: status.consecutive_failures,
      expired_offer_count: status.expired_offer_backlog_count,
      failed_delivery_count: status.failed_delivery_count,
      health: status.health,
      last_completed_at: status.last_completed_at,
      last_error_code: status.last_error_code,
      last_started_at: status.last_started_at,
      last_succeeded_at: status.last_succeeded_at,
      pending_delivery_count: status.pending_delivery_count,
      recent_cycle: {
        delivered_count: status.delivered_count,
        delivery_failure_count: status.delivery_failure_count,
        expired_offer_count: status.expired_offer_count,
        offers_created_count: status.offers_created_count,
        reminders_queued_count: status.reminders_queued_count,
        sessions_scanned_count: status.sessions_scanned_count,
      },
    };
  }
}
