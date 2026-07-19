import { randomUUID } from 'node:crypto';

import type { RequestIdentity } from '@camp-registration/auth';
import type {
  OnlinePaymentCheckout,
  PaymentAttempt,
  PaymentCompletion,
} from '@camp-registration/contracts';
import type { PaymentStore, ProviderPaymentEvent } from '@camp-registration/database';

import type { PaymentProvider } from './provider.js';

const staffRoles = new Set(['camp_staff', 'camp_admin', 'organization_admin']);
const parentRoles = new Set(['parent_guardian']);

export class PaymentAuthorizationError extends Error {}
export class PaymentProviderUnavailableError extends Error {}
export class PaymentValidationError extends Error {}
export class PaymentWebhookVerificationError extends Error {}

export interface PaymentServiceApi {
  completeLocalPayment(attemptId: string, requestId: string): Promise<PaymentCompletion>;
  createCheckout(
    familyId: string,
    registrationId: string,
    idempotencyKey: string,
    requestId: string,
  ): Promise<OnlinePaymentCheckout>;
  getAttempt(attemptId: string): Promise<PaymentAttempt>;
  listAttempts(): Promise<PaymentAttempt[]>;
}

export class PaymentWebhookService {
  constructor(
    private readonly store: PaymentStore,
    private readonly provider: PaymentProvider,
  ) {}

  async handle(rawBody: Buffer, signature: string) {
    if (!this.provider.verifyWebhook) {
      throw new PaymentProviderUnavailableError('Payment webhooks are not configured');
    }
    let event: ProviderPaymentEvent | null;
    try {
      event = this.provider.verifyWebhook(rawBody, signature);
    } catch {
      throw new PaymentWebhookVerificationError('Payment webhook signature is invalid');
    }
    return event ? this.store.applyProviderEvent(event) : null;
  }
}

export class PaymentService implements PaymentServiceApi {
  private readonly membership;

  constructor(
    private readonly store: PaymentStore,
    private readonly provider: PaymentProvider,
    private readonly identity: RequestIdentity,
    private readonly organizationId: string,
  ) {
    this.membership = identity.memberships.find(
      (membership) => membership.organizationId === organizationId,
    );
  }

  private hasRole(roles: Set<string>): boolean {
    return Boolean(this.membership?.roles.some((role) => roles.has(role)));
  }

  private authorizeStaff(): void {
    if (!this.hasRole(staffRoles)) {
      throw new PaymentAuthorizationError('Payment reconciliation access is not permitted');
    }
  }

  private async authorizeFamilyPayment(familyId: string): Promise<void> {
    if (this.hasRole(staffRoles)) return;
    if (!this.hasRole(parentRoles)) {
      throw new PaymentAuthorizationError('Online payment access is not permitted');
    }
    const allowed = await this.store.adultIdentityCanMakePayments(
      this.organizationId,
      familyId,
      this.identity.subject,
    );
    if (!allowed) throw new PaymentAuthorizationError('Online payment access is not permitted');
  }

  async createCheckout(
    familyId: string,
    registrationId: string,
    idempotencyKey: string,
    requestId: string,
  ): Promise<OnlinePaymentCheckout> {
    await this.authorizeFamilyPayment(familyId);
    const attempt = await this.store.prepareCheckout(
      {
        actorId: this.identity.subject,
        organizationId: this.organizationId,
        requestId,
      },
      {
        attemptId: randomUUID(),
        familyId,
        idempotencyKey,
        provider: this.provider.name,
        registrationId,
      },
    );
    if (attempt.checkout_url) {
      return {
        amount_cents: attempt.amount_cents,
        attempt_id: attempt.id,
        checkout_url: attempt.checkout_url,
        currency: attempt.currency,
        status: attempt.status,
      };
    }
    if (attempt.status !== 'PENDING') {
      throw new PaymentValidationError(
        'This checkout attempt cannot be resumed; start a new payment attempt',
      );
    }
    try {
      const hosted = await this.provider.createHostedCheckout({
        amountCents: attempt.amount_cents,
        attemptId: attempt.id,
        camperName: attempt.camper_name,
        currency: attempt.currency,
        customerEmail: attempt.recipient_email,
        familyId: attempt.family_id,
        organizationId: attempt.organization_id,
        providerAccountId: attempt.provider_account_id,
        registrationId: attempt.registration_id,
        sessionName: attempt.session_name,
      });
      const attached = await this.store.attachCheckout(this.organizationId, attempt.id, hosted);
      return {
        amount_cents: attached.amount_cents,
        attempt_id: attached.id,
        checkout_url: attached.checkout_url!,
        currency: attached.currency,
        status: attached.status,
      };
    } catch (error) {
      await this.store.markCheckoutFailed(this.organizationId, attempt.id);
      throw error;
    }
  }

  async listAttempts(): Promise<PaymentAttempt[]> {
    this.authorizeStaff();
    return this.store.listAttempts(this.organizationId);
  }

  async getAttempt(attemptId: string): Promise<PaymentAttempt> {
    const attempt = await this.store.getAttempt(this.organizationId, attemptId);
    await this.authorizeFamilyPayment(attempt.family_id);
    return attempt;
  }

  async completeLocalPayment(attemptId: string): Promise<PaymentCompletion> {
    if (this.provider.name !== 'LOCAL') {
      throw new PaymentProviderUnavailableError('Local payment simulation is disabled');
    }
    const attempt = await this.store.getAttempt(this.organizationId, attemptId);
    await this.authorizeFamilyPayment(attempt.family_id);
    if (!attempt.provider_checkout_session_id) {
      throw new PaymentValidationError('The local checkout has not been initialized');
    }
    const event: ProviderPaymentEvent = {
      amount_cents: attempt.amount_cents,
      attempt_id: attempt.id,
      currency: attempt.currency,
      event_id: `local:${attempt.id}:succeeded`,
      event_type: 'local.checkout.completed',
      failure_code: null,
      organization_id: this.organizationId,
      provider: 'LOCAL',
      provider_account_id: attempt.provider_account_id,
      provider_checkout_session_id: attempt.provider_checkout_session_id,
      provider_payment_intent_id: `local_pi_${attempt.id.replaceAll('-', '')}`,
      receipt_url: null,
      status: 'SUCCEEDED',
    };
    const result = await this.store.applyProviderEvent(event);
    const completed =
      result.attempt ?? (await this.store.getAttempt(this.organizationId, attemptId));
    return { attempt: completed };
  }
}
