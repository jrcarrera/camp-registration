import { randomUUID } from 'node:crypto';

import type { PoolClient } from 'pg';

import type { DatabaseClient } from './client.js';
import type { FamilyWriteContext } from './family-store.js';

export type PaymentProviderName = 'STRIPE' | 'LOCAL';
export type PaymentAttemptStatus = 'PENDING' | 'SUCCEEDED' | 'FAILED' | 'CANCELLED';

export interface PaymentAttemptRecord {
  amount_cents: number;
  camper_name: string;
  completed_at: string | null;
  created_at: string;
  currency: 'USD';
  family_id: string;
  family_name: string;
  id: string;
  provider: PaymentProviderName;
  provider_reference: string | null;
  receipt_url: string | null;
  registration_id: string;
  session_name: string;
  status: PaymentAttemptStatus;
}

export interface PreparedPaymentAttempt extends PaymentAttemptRecord {
  checkout_url: string | null;
  organization_id: string;
  provider_account_id: string;
  provider_checkout_session_id: string | null;
  recipient_email: string | null;
}

export interface ProviderPaymentEvent {
  amount_cents: number;
  attempt_id: string;
  currency: 'USD';
  event_id: string;
  event_type: string;
  failure_code: string | null;
  organization_id: string;
  provider: PaymentProviderName;
  provider_account_id: string;
  provider_checkout_session_id: string;
  provider_payment_intent_id: string | null;
  receipt_url: string | null;
  status: PaymentAttemptStatus;
}

export interface PaymentEventResult {
  attempt: PaymentAttemptRecord | null;
  duplicate: boolean;
  outcome: 'APPLIED' | 'IGNORED' | 'REJECTED';
}

export class PaymentNotFoundError extends Error {}
export class PaymentEligibilityError extends Error {}
export class PaymentIdempotencyConflictError extends Error {}
export class PaymentConfigurationError extends Error {}

interface AttemptRow extends PaymentAttemptRecord {
  checkout_url: string | null;
  organization_id: string;
  provider_account_id: string;
  provider_checkout_session_id: string | null;
  recipient_email: string | null;
}

const attemptSelect = `SELECT
  pa.id,
  pa.organization_id,
  pa.family_id,
  pa.registration_id,
  pa.provider,
  pa.provider_account_id,
  pa.amount_cents,
  pa.currency,
  pa.status,
  pa.provider_checkout_session_id,
  pa.provider_payment_intent_id AS provider_reference,
  pa.checkout_url,
  pa.receipt_url,
  pa.created_at,
  pa.completed_at,
  f.family_name,
  concat_ws(' ', c.first_name, c.last_name) AS camper_name,
  s.name AS session_name,
  recipient.email AS recipient_email
FROM payment_attempts pa
JOIN registrations r
  ON r.organization_id = pa.organization_id AND r.id = pa.registration_id
JOIN families f
  ON f.organization_id = pa.organization_id AND f.id = pa.family_id
JOIN campers c
  ON c.organization_id = pa.organization_id AND c.id = r.camper_id
JOIN sessions s
  ON s.organization_id = pa.organization_id AND s.id = r.session_id
LEFT JOIN LATERAL (
  SELECT a.email
  FROM adults a
  WHERE a.organization_id = pa.organization_id
    AND a.family_id = pa.family_id
    AND a.archived_at IS NULL
    AND a.email IS NOT NULL
    AND (a.account_owner OR a.can_make_payments)
  ORDER BY a.account_owner DESC, a.created_at, a.id
  LIMIT 1
) recipient ON true`;

function publicAttempt(row: AttemptRow): PaymentAttemptRecord {
  return {
    amount_cents: row.amount_cents,
    camper_name: row.camper_name,
    completed_at: row.completed_at,
    created_at: row.created_at,
    currency: row.currency,
    family_id: row.family_id,
    family_name: row.family_name,
    id: row.id,
    provider: row.provider,
    provider_reference: row.provider_reference,
    receipt_url: row.receipt_url,
    registration_id: row.registration_id,
    session_name: row.session_name,
    status: row.status,
  };
}

export class PaymentStore {
  constructor(private readonly database: DatabaseClient) {}

  private async withTenant<T>(
    organizationId: string,
    operation: (client: PoolClient) => Promise<T>,
  ): Promise<T> {
    const client = await this.database.pool.connect();
    try {
      await client.query('BEGIN');
      await client.query(`SELECT set_config('app.organization_id', $1, true)`, [organizationId]);
      const result = await operation(client);
      await client.query('COMMIT');
      return result;
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }

  async adultIdentityCanMakePayments(
    organizationId: string,
    familyId: string,
    identitySubject: string,
  ): Promise<boolean> {
    return this.withTenant(organizationId, async (client) => {
      const result = await client.query(
        `SELECT 1
         FROM adults
         WHERE organization_id = $1
           AND family_id = $2
           AND identity_subject = $3
           AND archived_at IS NULL
           AND (account_owner OR can_make_payments)
         LIMIT 1`,
        [organizationId, familyId, identitySubject],
      );
      return result.rowCount === 1;
    });
  }

  async prepareCheckout(
    context: FamilyWriteContext,
    input: {
      attemptId: string;
      familyId: string;
      idempotencyKey: string;
      provider: PaymentProviderName;
      registrationId: string;
    },
  ): Promise<PreparedPaymentAttempt> {
    return this.withTenant(context.organizationId, async (client) => {
      const registration = await client.query<{
        balance_due_cents: number;
        deposit_due_cents: number;
        provider_account_id: string | null;
        status: string;
      }>(
        `SELECT
           r.status,
           GREATEST(r.price_cents - COALESCE(payments.amount_paid_cents, 0), 0)::integer
             AS balance_due_cents,
           GREATEST(r.deposit_cents - COALESCE(payments.amount_paid_cents, 0), 0)::integer
             AS deposit_due_cents,
           o.stripe_connected_account_id AS provider_account_id
         FROM registrations r
         JOIN organizations o ON o.id = r.organization_id
         LEFT JOIN LATERAL (
           SELECT COALESCE(sum(rp.amount_cents), 0)::integer AS amount_paid_cents
           FROM registration_payments rp
           WHERE rp.organization_id = r.organization_id
             AND rp.registration_id = r.id
         ) payments ON true
         WHERE r.organization_id = $1 AND r.family_id = $2 AND r.id = $3
         FOR UPDATE OF r`,
        [context.organizationId, input.familyId, input.registrationId],
      );
      const current = registration.rows[0];
      if (!current) throw new PaymentNotFoundError('Registration not found');
      if (current.status !== 'CONFIRMED') {
        throw new PaymentEligibilityError('Only confirmed registrations can accept payments');
      }
      const amountCents = Math.min(current.deposit_due_cents, current.balance_due_cents);
      if (amountCents <= 0) {
        throw new PaymentEligibilityError('This registration does not have a deposit due');
      }
      const providerAccountId =
        input.provider === 'LOCAL'
          ? `local:${context.organizationId}`
          : current.provider_account_id;
      if (!providerAccountId) {
        throw new PaymentConfigurationError(
          'Online payments are not configured for this organization',
        );
      }

      const inserted = await client.query<{ id: string }>(
        `INSERT INTO payment_attempts (
           id, organization_id, family_id, registration_id, provider,
           provider_account_id, amount_cents, currency, idempotency_key, created_by
         ) VALUES ($1, $2, $3, $4, $5, $6, $7, 'USD', $8, $9)
         ON CONFLICT (organization_id, idempotency_key) DO NOTHING
         RETURNING id`,
        [
          input.attemptId,
          context.organizationId,
          input.familyId,
          input.registrationId,
          input.provider,
          providerAccountId,
          amountCents,
          input.idempotencyKey,
          context.actorId,
        ],
      );
      const attempt = await this.requireAttemptByIdempotencyKey(
        client,
        context.organizationId,
        input.idempotencyKey,
      );
      if (
        inserted.rowCount === 0 &&
        (attempt.family_id !== input.familyId ||
          attempt.registration_id !== input.registrationId ||
          attempt.provider !== input.provider)
      ) {
        throw new PaymentIdempotencyConflictError(
          'The idempotency key was already used for another payment',
        );
      }
      return attempt;
    });
  }

  async attachCheckout(
    organizationId: string,
    attemptId: string,
    checkout: { checkoutUrl: string; providerCheckoutSessionId: string },
  ): Promise<PreparedPaymentAttempt> {
    return this.withTenant(organizationId, async (client) => {
      await client.query(
        `UPDATE payment_attempts
         SET provider_checkout_session_id = $3,
             checkout_url = $4,
             updated_at = transaction_timestamp()
         WHERE organization_id = $1 AND id = $2 AND status = 'PENDING'`,
        [organizationId, attemptId, checkout.providerCheckoutSessionId, checkout.checkoutUrl],
      );
      return this.requireAttempt(client, organizationId, attemptId);
    });
  }

  async markCheckoutFailed(organizationId: string, attemptId: string): Promise<void> {
    await this.withTenant(organizationId, async (client) => {
      await client.query(
        `UPDATE payment_attempts
         SET status = 'FAILED', failure_code = 'checkout_creation_failed',
             completed_at = transaction_timestamp(), updated_at = transaction_timestamp()
         WHERE organization_id = $1 AND id = $2
           AND status = 'PENDING' AND provider_checkout_session_id IS NULL`,
        [organizationId, attemptId],
      );
    });
  }

  async getAttempt(organizationId: string, attemptId: string): Promise<PreparedPaymentAttempt> {
    return this.withTenant(organizationId, (client) =>
      this.requireAttempt(client, organizationId, attemptId),
    );
  }

  async listAttempts(organizationId: string): Promise<PaymentAttemptRecord[]> {
    return this.withTenant(organizationId, async (client) => {
      const result = await client.query<AttemptRow>(
        `${attemptSelect}
         WHERE pa.organization_id = $1
         ORDER BY pa.created_at DESC, pa.id DESC`,
        [organizationId],
      );
      return result.rows.map(publicAttempt);
    });
  }

  async applyProviderEvent(event: ProviderPaymentEvent): Promise<PaymentEventResult> {
    return this.withTenant(event.organization_id, async (client) => {
      const insertedEvent = await client.query<{ id: string }>(
        `INSERT INTO payment_webhook_events (
           id, organization_id, payment_attempt_id, provider, provider_event_id, event_type
         ) VALUES ($1, $2, $3, $4, $5, $6)
         ON CONFLICT (provider, provider_event_id) DO NOTHING
         RETURNING id`,
        [
          randomUUID(),
          event.organization_id,
          event.attempt_id,
          event.provider,
          event.event_id,
          event.event_type,
        ],
      );
      if (insertedEvent.rowCount === 0) {
        return { attempt: null, duplicate: true, outcome: 'IGNORED' };
      }

      const attempt = await this.requireAttempt(
        client,
        event.organization_id,
        event.attempt_id,
        true,
      );
      const valid =
        attempt.provider === event.provider &&
        attempt.provider_account_id === event.provider_account_id &&
        attempt.provider_checkout_session_id === event.provider_checkout_session_id &&
        attempt.amount_cents === event.amount_cents &&
        attempt.currency === event.currency;
      if (!valid) {
        await this.finishEvent(client, event, 'REJECTED');
        return { attempt: publicAttempt(attempt), duplicate: false, outcome: 'REJECTED' };
      }

      if (attempt.status === 'SUCCEEDED' && event.status !== 'SUCCEEDED') {
        await this.finishEvent(client, event, 'IGNORED');
        return { attempt: publicAttempt(attempt), duplicate: false, outcome: 'IGNORED' };
      }
      if (attempt.status === event.status) {
        await this.finishEvent(client, event, 'IGNORED');
        return { attempt: publicAttempt(attempt), duplicate: false, outcome: 'IGNORED' };
      }

      if (event.status === 'SUCCEEDED') {
        await client.query(
          `INSERT INTO registration_payments (
             id, organization_id, family_id, registration_id, amount_cents, method,
             note, recorded_by, payment_attempt_id, provider, provider_reference, receipt_url
           ) VALUES ($1, $2, $3, $4, $5, 'ONLINE_CARD', $6, 'system:payment-webhook',
             $7, $8, $9, $10)
           ON CONFLICT (organization_id, payment_attempt_id) WHERE payment_attempt_id IS NOT NULL
           DO NOTHING`,
          [
            randomUUID(),
            event.organization_id,
            attempt.family_id,
            attempt.registration_id,
            event.amount_cents,
            `${event.provider} hosted checkout`,
            attempt.id,
            event.provider,
            event.provider_payment_intent_id,
            event.receipt_url,
          ],
        );
        if (attempt.recipient_email) {
          await client.query(
            `INSERT INTO notification_outbox (
               id, organization_id, family_id, session_id, registration_id,
               waitlist_offer_id, notification_type, recipient_email, template_data,
               idempotency_key
             )
             SELECT $1, pa.organization_id, pa.family_id, r.session_id, pa.registration_id,
                    NULL, 'PAYMENT_RECEIPT', $2, $3::jsonb, $4
             FROM payment_attempts pa
             JOIN registrations r
               ON r.organization_id = pa.organization_id AND r.id = pa.registration_id
             WHERE pa.organization_id = $5 AND pa.id = $6
             ON CONFLICT (organization_id, idempotency_key) DO NOTHING`,
            [
              randomUUID(),
              attempt.recipient_email,
              JSON.stringify({
                amount_cents: event.amount_cents,
                camper_name: attempt.camper_name,
                currency: event.currency,
                family_name: attempt.family_name,
                portal_path: '/portal',
                provider_reference: event.provider_payment_intent_id,
                receipt_url: event.receipt_url,
                session_name: attempt.session_name,
              }),
              `payment-receipt:${attempt.id}`,
              event.organization_id,
              attempt.id,
            ],
          );
        }
      }

      await client.query(
        `UPDATE payment_attempts
         SET status = $3,
             provider_payment_intent_id = COALESCE($4, provider_payment_intent_id),
             receipt_url = COALESCE($5, receipt_url),
             failure_code = $6,
             completed_at = CASE WHEN $3 = 'PENDING' THEN NULL ELSE transaction_timestamp() END,
             updated_at = transaction_timestamp()
         WHERE organization_id = $1 AND id = $2`,
        [
          event.organization_id,
          attempt.id,
          event.status,
          event.provider_payment_intent_id,
          event.receipt_url,
          event.failure_code,
        ],
      );
      await client.query(
        `INSERT INTO audit_events (
           organization_id, actor_id, action, target_type, target_id, outcome,
           request_id, details
         ) VALUES ($1, 'system:payment-webhook', 'payment.attempt_reconciled',
           'payment_attempt', $2, 'success', $3, $4::jsonb)`,
        [
          event.organization_id,
          attempt.id,
          `payment-event:${event.event_id}`,
          JSON.stringify({ event_type: event.event_type, status: event.status }),
        ],
      );
      await this.finishEvent(client, event, 'APPLIED');
      return {
        attempt: publicAttempt(
          await this.requireAttempt(client, event.organization_id, attempt.id),
        ),
        duplicate: false,
        outcome: 'APPLIED',
      };
    });
  }

  private async requireAttempt(
    client: PoolClient,
    organizationId: string,
    attemptId: string,
    forUpdate = false,
  ): Promise<AttemptRow> {
    const result = await client.query<AttemptRow>(
      `${attemptSelect}
       WHERE pa.organization_id = $1 AND pa.id = $2
       ${forUpdate ? 'FOR UPDATE OF pa' : ''}`,
      [organizationId, attemptId],
    );
    const attempt = result.rows[0];
    if (!attempt) throw new PaymentNotFoundError('Payment attempt not found');
    return attempt;
  }

  private async requireAttemptByIdempotencyKey(
    client: PoolClient,
    organizationId: string,
    idempotencyKey: string,
  ): Promise<AttemptRow> {
    const result = await client.query<AttemptRow>(
      `${attemptSelect}
       WHERE pa.organization_id = $1 AND pa.idempotency_key = $2`,
      [organizationId, idempotencyKey],
    );
    const attempt = result.rows[0];
    if (!attempt) throw new PaymentNotFoundError('Payment attempt not found');
    return attempt;
  }

  private async finishEvent(
    client: PoolClient,
    event: ProviderPaymentEvent,
    outcome: PaymentEventResult['outcome'],
  ): Promise<void> {
    await client.query(
      `UPDATE payment_webhook_events
       SET outcome = $4, processed_at = transaction_timestamp()
       WHERE organization_id = $1 AND provider = $2 AND provider_event_id = $3`,
      [event.organization_id, event.provider, event.event_id, outcome],
    );
  }
}
