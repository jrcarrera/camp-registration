import { randomUUID } from 'node:crypto';

import type { PoolClient } from 'pg';

import type { DatabaseClient } from './client.js';
import type { FamilyWriteContext } from './family-store.js';
import type { OrderNotificationSummary } from './notification-store.js';

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
  installment_id: string | null;
  order_id: string | null;
  provider: PaymentProviderName;
  provider_reference: string | null;
  purpose: 'DEPOSIT' | 'INSTALLMENT' | 'BALANCE';
  receipt_url: string | null;
  registration_id: string | null;
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

export interface ExpiringOrderPaymentRecord {
  attempt_id: string;
  provider_account_id: string;
  provider_checkout_session_id: string;
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
  pa.order_id,
  pa.installment_id,
  pa.purpose,
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
  COALESCE(NULLIF(concat_ws(' ', c.first_name, c.last_name), ''), 'Household') AS camper_name,
  COALESCE(s.name, CASE WHEN pa.purpose = 'INSTALLMENT'
    THEN 'Household installment' ELSE 'Household order' END) AS session_name,
  recipient.email AS recipient_email
FROM payment_attempts pa
LEFT JOIN registrations r
  ON r.organization_id = pa.organization_id AND r.id = pa.registration_id
JOIN families f
  ON f.organization_id = pa.organization_id AND f.id = pa.family_id
LEFT JOIN campers c
  ON c.organization_id = pa.organization_id AND c.id = r.camper_id
LEFT JOIN sessions s
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
    installment_id: row.installment_id,
    order_id: row.order_id,
    provider: row.provider,
    provider_reference: row.provider_reference,
    purpose: row.purpose,
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

  async listOrganizations(): Promise<string[]> {
    const result = await this.database.pool.query<{ organization_id: string }>(
      'SELECT organization_id FROM list_waitlist_worker_organizations()',
    );
    return result.rows.map((row) => row.organization_id);
  }

  async listExpiringOrderPayments(organizationId: string): Promise<ExpiringOrderPaymentRecord[]> {
    return this.withTenant(organizationId, async (client) => {
      const result = await client.query<ExpiringOrderPaymentRecord>(
        `SELECT DISTINCT pa.id AS attempt_id, pa.provider_account_id,
                pa.provider_checkout_session_id
         FROM payment_attempts pa
         JOIN capacity_holds h
           ON h.organization_id=pa.organization_id AND h.order_id=pa.order_id
         WHERE pa.organization_id=$1 AND pa.status='PENDING'
           AND pa.order_id IS NOT NULL AND pa.purpose='DEPOSIT'
           AND pa.provider_checkout_session_id IS NOT NULL
           AND h.status='ACTIVE' AND h.expires_at <= transaction_timestamp()
         ORDER BY pa.id`,
        [organizationId],
      );
      return result.rows;
    });
  }

  async expireOrderPayment(organizationId: string, attemptId: string): Promise<void> {
    await this.withTenant(organizationId, async (client) => {
      const attempt = await client.query<{ order_id: string; status: string }>(
        `SELECT order_id, status FROM payment_attempts
         WHERE organization_id=$1 AND id=$2 AND order_id IS NOT NULL FOR UPDATE`,
        [organizationId, attemptId],
      );
      const current = attempt.rows[0];
      if (!current || current.status !== 'PENDING') return;
      await client.query(
        `UPDATE payment_attempts SET status='CANCELLED', failure_code='order_hold_expired',
           completed_at=transaction_timestamp(), updated_at=transaction_timestamp()
         WHERE organization_id=$1 AND id=$2`,
        [organizationId, attemptId],
      );
      await client.query(
        `UPDATE capacity_holds SET status='RELEASED', updated_at=transaction_timestamp()
         WHERE organization_id=$1 AND order_id=$2 AND status IN ('ACTIVE','EXPIRING')`,
        [organizationId, current.order_id],
      );
      await client.query(
        `UPDATE household_order_lines SET outcome='EXPIRED', updated_at=transaction_timestamp()
         WHERE organization_id=$1 AND order_id=$2 AND outcome='HELD'`,
        [organizationId, current.order_id],
      );
      const released = await client.query<{ amount_cents: number; award_id: string }>(
        `UPDATE assistance_award_allocations
         SET status='RELEASED', updated_at=transaction_timestamp()
         WHERE organization_id=$1 AND order_id=$2 AND status='RESERVED'
         RETURNING award_id, amount_cents`,
        [organizationId, current.order_id],
      );
      for (const allocation of released.rows) {
        await client.query(
          `UPDATE financial_assistance_awards
           SET reserved_cents=reserved_cents-$3, updated_at=transaction_timestamp()
           WHERE organization_id=$1 AND id=$2`,
          [organizationId, allocation.award_id, allocation.amount_cents],
        );
      }
      const waitlisted = await client.query(
        `SELECT 1 FROM household_order_lines
         WHERE organization_id=$1 AND order_id=$2 AND outcome='WAITLISTED' LIMIT 1`,
        [organizationId, current.order_id],
      );
      await client.query(
        `UPDATE household_orders SET status=$3, updated_at=transaction_timestamp()
         WHERE organization_id=$1 AND id=$2`,
        [organizationId, current.order_id, waitlisted.rows[0] ? 'PARTIAL' : 'EXPIRED'],
      );
      if (!waitlisted.rows[0]) {
        await client.query(
          `DELETE FROM coupon_redemptions WHERE organization_id=$1 AND order_id=$2`,
          [organizationId, current.order_id],
        );
      }
      await client.query(
        `INSERT INTO audit_events (
           organization_id, actor_id, action, target_type, target_id, outcome,
           request_id, details
         ) VALUES ($1,'system:billing-worker','order.hold_expired','household_order',$2,
           'success',$3,'{}'::jsonb)`,
        [organizationId, current.order_id, `billing-expiry:${attemptId}`],
      );
    });
  }

  async advanceInstallmentNotifications(organizationId: string): Promise<number> {
    return this.withTenant(organizationId, async (client) => {
      const installments = await client.query<{
        amount_cents: number;
        due_on: string;
        family_id: string;
        family_name: string;
        id: string;
        order_id: string;
        recipient_email: string | null;
        registration_id: string;
        session_id: string;
      }>(
        `SELECT i.id, i.order_id, i.family_id, i.due_on::text, i.amount_cents,
                f.family_name, recipient.email AS recipient_email,
                reference.registration_id, reference.session_id
         FROM order_installments i
         JOIN families f ON f.organization_id=i.organization_id AND f.id=i.family_id
         JOIN LATERAL (
           SELECT r.id AS registration_id, r.session_id
           FROM registrations r
           WHERE r.organization_id=i.organization_id AND r.order_id=i.order_id
           ORDER BY r.registered_at,r.id LIMIT 1
         ) reference ON true
         LEFT JOIN LATERAL (
           SELECT a.email FROM adults a
           WHERE a.organization_id=i.organization_id AND a.family_id=i.family_id
             AND a.archived_at IS NULL AND a.email IS NOT NULL
             AND (a.account_owner OR a.can_make_payments)
           ORDER BY a.account_owner DESC,a.created_at,a.id LIMIT 1
         ) recipient ON true
         WHERE i.organization_id=$1 AND i.status<>'PAID'
           AND i.due_on IN (current_date, current_date + 7)
         ORDER BY i.due_on,i.id`,
        [organizationId],
      );
      let queued = 0;
      for (const installment of installments.rows) {
        if (!installment.recipient_email) continue;
        const notificationType =
          installment.due_on === new Date().toISOString().slice(0, 10)
            ? 'INSTALLMENT_DUE'
            : 'INSTALLMENT_DUE_SOON';
        const inserted = await client.query(
          `INSERT INTO notification_outbox (
             id, organization_id, family_id, session_id, registration_id,
             waitlist_offer_id, notification_type, recipient_email, template_data,
             idempotency_key
           ) VALUES ($1,$2,$3,$4,$5,NULL,$6,$7,$8::jsonb,$9)
           ON CONFLICT (organization_id,idempotency_key) DO NOTHING RETURNING id`,
          [
            randomUUID(),
            organizationId,
            installment.family_id,
            installment.session_id,
            installment.registration_id,
            notificationType,
            installment.recipient_email,
            JSON.stringify({
              amount_cents: installment.amount_cents,
              currency: 'USD',
              due_on: installment.due_on,
              family_name: installment.family_name,
              installment_id: installment.id,
              portal_path: '/portal',
            }),
            `${notificationType.toLowerCase()}:${installment.id}`,
          ],
        );
        queued += inserted.rowCount ?? 0;
      }
      await client.query(
        `UPDATE order_installments SET status=CASE
           WHEN due_on < current_date THEN 'OVERDUE'
           WHEN due_on = current_date THEN 'DUE'
           ELSE status END,
           updated_at=CASE WHEN due_on <= current_date THEN transaction_timestamp() ELSE updated_at END
         WHERE organization_id=$1 AND status<>'PAID'`,
        [organizationId],
      );
      return queued;
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

  async prepareOrderCheckout(
    context: FamilyWriteContext,
    input: {
      attemptId: string;
      familyId: string;
      idempotencyKey: string;
      orderId: string;
      provider: PaymentProviderName;
    },
  ): Promise<PreparedPaymentAttempt> {
    return this.withTenant(context.organizationId, async (client) => {
      const order = await client.query<{
        amount_cents: number;
        provider_account_id: string | null;
        status: string;
      }>(
        `SELECT o.status, o.deposit_due_cents AS amount_cents,
                org.stripe_connected_account_id AS provider_account_id
         FROM household_orders o
         JOIN organizations org ON org.id = o.organization_id
         WHERE o.organization_id = $1 AND o.family_id = $2 AND o.id = $3
         FOR UPDATE OF o`,
        [context.organizationId, input.familyId, input.orderId],
      );
      const current = order.rows[0];
      if (!current) throw new PaymentNotFoundError('Order not found');
      if (current.status !== 'PAYMENT_PENDING' || current.amount_cents <= 0) {
        throw new PaymentEligibilityError('This order does not have a deposit due');
      }
      const holds = await client.query<{ amount_cents: number; order_line_id: string }>(
        `SELECT l.id AS order_line_id, l.deposit_due_cents AS amount_cents
         FROM household_order_lines l
         JOIN capacity_holds h
           ON h.organization_id = l.organization_id AND h.order_line_id = l.id
         WHERE l.organization_id = $1 AND l.order_id = $2 AND l.outcome = 'HELD'
           AND h.status = 'ACTIVE' AND h.expires_at > transaction_timestamp()
         ORDER BY l.id FOR UPDATE OF l, h`,
        [context.organizationId, input.orderId],
      );
      const amount = holds.rows.reduce((sum, row) => sum + row.amount_cents, 0);
      if (amount !== current.amount_cents || holds.rows.length === 0) {
        throw new PaymentEligibilityError('The order hold expired; submit the cart again');
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
      const inserted = await client.query(
        `INSERT INTO payment_attempts (
           id, organization_id, family_id, registration_id, order_id, purpose,
           provider, provider_account_id, amount_cents, currency, idempotency_key, created_by
         ) VALUES ($1,$2,$3,NULL,$4,'DEPOSIT',$5,$6,$7,'USD',$8,$9)
         ON CONFLICT (organization_id, idempotency_key) DO NOTHING RETURNING id`,
        [
          input.attemptId,
          context.organizationId,
          input.familyId,
          input.orderId,
          input.provider,
          providerAccountId,
          amount,
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
        (attempt.order_id !== input.orderId ||
          attempt.purpose !== 'DEPOSIT' ||
          attempt.provider !== input.provider)
      ) {
        throw new PaymentIdempotencyConflictError(
          'The idempotency key was already used for another payment',
        );
      }
      if (inserted.rowCount === 1) {
        for (const hold of holds.rows) {
          if (hold.amount_cents <= 0) continue;
          await client.query(
            `INSERT INTO payment_attempt_allocations (
               id, organization_id, payment_attempt_id, order_line_id, amount_cents
             ) VALUES ($1,$2,$3,$4,$5)`,
            [
              randomUUID(),
              context.organizationId,
              attempt.id,
              hold.order_line_id,
              hold.amount_cents,
            ],
          );
        }
      }
      return attempt;
    });
  }

  async prepareInstallmentCheckout(
    context: FamilyWriteContext,
    input: {
      attemptId: string;
      familyId: string;
      idempotencyKey: string;
      installmentId: string;
      provider: PaymentProviderName;
    },
  ): Promise<PreparedPaymentAttempt> {
    return this.withTenant(context.organizationId, async (client) => {
      const installment = await client.query<{
        amount_cents: number;
        order_id: string;
        provider_account_id: string | null;
        status: string;
      }>(
        `SELECT i.amount_cents, i.order_id, i.status,
                org.stripe_connected_account_id AS provider_account_id
         FROM order_installments i
         JOIN organizations org ON org.id=i.organization_id
         WHERE i.organization_id=$1 AND i.family_id=$2 AND i.id=$3
         FOR UPDATE OF i`,
        [context.organizationId, input.familyId, input.installmentId],
      );
      const current = installment.rows[0];
      if (!current) throw new PaymentNotFoundError('Installment not found');
      if (current.status === 'PAID')
        throw new PaymentEligibilityError('Installment is already paid');
      const providerAccountId =
        input.provider === 'LOCAL'
          ? `local:${context.organizationId}`
          : current.provider_account_id;
      if (!providerAccountId)
        throw new PaymentConfigurationError(
          'Online payments are not configured for this organization',
        );
      const inserted = await client.query(
        `INSERT INTO payment_attempts (
           id, organization_id, family_id, registration_id, order_id, installment_id,
           purpose, provider, provider_account_id, amount_cents, currency,
           idempotency_key, created_by
         ) VALUES ($1,$2,$3,NULL,$4,$5,'INSTALLMENT',$6,$7,$8,'USD',$9,$10)
         ON CONFLICT (organization_id, idempotency_key) DO NOTHING RETURNING id`,
        [
          input.attemptId,
          context.organizationId,
          input.familyId,
          current.order_id,
          input.installmentId,
          input.provider,
          providerAccountId,
          current.amount_cents,
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
        (attempt.installment_id !== input.installmentId || attempt.provider !== input.provider)
      ) {
        throw new PaymentIdempotencyConflictError(
          'The idempotency key was already used for another payment',
        );
      }
      if (inserted.rowCount === 1) {
        const lines = await client.query<{ id: string; weight: number }>(
          `SELECT id, GREATEST(net_price_cents - deposit_due_cents, 0)::integer AS weight
           FROM household_order_lines
           WHERE organization_id=$1 AND order_id=$2 AND outcome='CONFIRMED'
           ORDER BY id`,
          [context.organizationId, current.order_id],
        );
        const totalWeight = lines.rows.reduce((sum, line) => sum + line.weight, 0);
        let remaining = current.amount_cents;
        for (let index = 0; index < lines.rows.length; index += 1) {
          const line = lines.rows[index]!;
          const amount =
            index === lines.rows.length - 1
              ? remaining
              : Math.min(
                  remaining,
                  Math.floor((current.amount_cents * line.weight) / Math.max(totalWeight, 1)),
                );
          remaining -= amount;
          if (amount <= 0) continue;
          await client.query(
            `INSERT INTO payment_attempt_allocations (
               id, organization_id, payment_attempt_id, order_line_id, amount_cents
             ) VALUES ($1,$2,$3,$4,$5)`,
            [randomUUID(), context.organizationId, attempt.id, line.id, amount],
          );
        }
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

  private async orderNotificationSummary(
    client: PoolClient,
    organizationId: string,
    orderId: string,
  ): Promise<OrderNotificationSummary> {
    const order = await client.query<{
      assistance_cents: number;
      automatic_discount_cents: number;
      coupon_discount_cents: number;
      gross_total_cents: number;
      net_total_cents: number;
    }>(
      `SELECT gross_total_cents, automatic_discount_cents, coupon_discount_cents,
              assistance_cents, net_total_cents
       FROM household_orders WHERE organization_id=$1 AND id=$2`,
      [organizationId, orderId],
    );
    const totals = order.rows[0];
    if (!totals) throw new PaymentNotFoundError('Household order not found');
    const lines = await client.query<OrderNotificationSummary['lines'][number]>(
      `SELECT camper_name, session_name, outcome, gross_price_cents,
              automatic_discount_cents, coupon_discount_cents, assistance_cents,
              net_price_cents
       FROM household_order_lines
       WHERE organization_id=$1 AND order_id=$2
       ORDER BY created_at,id`,
      [organizationId, orderId],
    );
    const installments = await client.query<OrderNotificationSummary['installments'][number]>(
      `SELECT due_on::text, amount_cents, status
       FROM order_installments
       WHERE organization_id=$1 AND order_id=$2
       ORDER BY sequence,id`,
      [organizationId, orderId],
    );
    const paid = await client.query<{ paid_cents: number }>(
      `SELECT COALESCE(sum(p.amount_cents),0)::integer AS paid_cents
       FROM registration_payments p
       JOIN registrations r
         ON r.organization_id=p.organization_id AND r.id=p.registration_id
       WHERE p.organization_id=$1 AND r.order_id=$2 AND p.method='ONLINE_CARD'`,
      [organizationId, orderId],
    );
    const paidCents = paid.rows[0]?.paid_cents ?? 0;
    return {
      assistance_cents: totals.assistance_cents,
      automatic_discount_cents: totals.automatic_discount_cents,
      coupon_discount_cents: totals.coupon_discount_cents,
      gross_total_cents: totals.gross_total_cents,
      installments: installments.rows,
      lines: lines.rows,
      net_total_cents: totals.net_total_cents,
      paid_cents: paidCents,
      remaining_balance_cents: Math.max(totals.net_total_cents - paidCents, 0),
    };
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
        if (attempt.order_id) {
          await this.applyOrderPaymentSuccess(client, attempt, event);
        } else if (attempt.registration_id) {
          await client.query(
            `INSERT INTO registration_payments (
               id, organization_id, family_id, registration_id, amount_cents, method,
               note, recorded_by, payment_attempt_id, provider, provider_reference, receipt_url
             ) VALUES ($1, $2, $3, $4, $5, 'ONLINE_CARD', $6, 'system:payment-webhook',
               $7, $8, $9, $10)
             ON CONFLICT (organization_id, payment_attempt_id, registration_id)
               WHERE payment_attempt_id IS NOT NULL DO NOTHING`,
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
        }
        if (attempt.recipient_email) {
          const orderSummary = attempt.order_id
            ? await this.orderNotificationSummary(client, event.organization_id, attempt.order_id)
            : undefined;
          const reference = await client.query<{ registration_id: string; session_id: string }>(
            `SELECT r.id AS registration_id, r.session_id
             FROM registrations r
             WHERE r.organization_id=$1 AND (
               r.id=$2 OR ($3::uuid IS NOT NULL AND r.order_id=$3)
             ) ORDER BY r.registered_at, r.id LIMIT 1`,
            [event.organization_id, attempt.registration_id, attempt.order_id],
          );
          const first = reference.rows[0];
          if (first) {
            await client.query(
              `INSERT INTO notification_outbox (
               id, organization_id, family_id, session_id, registration_id,
               waitlist_offer_id, notification_type, recipient_email, template_data,
               idempotency_key
             ) VALUES ($1,$2,$3,$4,$5,NULL,'PAYMENT_RECEIPT',$6,$7::jsonb,$8)
             ON CONFLICT (organization_id, idempotency_key) DO NOTHING`,
              [
                randomUUID(),
                event.organization_id,
                attempt.family_id,
                first.session_id,
                first.registration_id,
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
                  ...(orderSummary ? { order_summary: orderSummary } : {}),
                }),
                `payment-receipt:${attempt.id}`,
              ],
            );
            if (attempt.order_id && attempt.purpose === 'DEPOSIT') {
              await client.query(
                `INSERT INTO notification_outbox (
                 id, organization_id, family_id, session_id, registration_id,
                 waitlist_offer_id, notification_type, recipient_email, template_data,
                 idempotency_key
               ) VALUES ($1,$2,$3,$4,$5,NULL,'ORDER_CONFIRMATION',$6,$7::jsonb,$8)
               ON CONFLICT (organization_id,idempotency_key) DO NOTHING`,
                [
                  randomUUID(),
                  event.organization_id,
                  attempt.family_id,
                  first.session_id,
                  first.registration_id,
                  attempt.recipient_email,
                  JSON.stringify({
                    amount_cents: event.amount_cents,
                    currency: event.currency,
                    family_name: attempt.family_name,
                    line_count: orderSummary?.lines.length ?? 1,
                    order_summary: orderSummary,
                    portal_path: '/portal',
                  }),
                  `order-confirmation:${attempt.order_id}`,
                ],
              );
            }
          }
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

  private async applyOrderPaymentSuccess(
    client: PoolClient,
    attempt: AttemptRow,
    event: ProviderPaymentEvent,
  ): Promise<void> {
    const allocations = await client.query<{
      amount_cents: number;
      assistance_cents: number;
      automatic_discount_cents: number;
      base_price_cents: number;
      camper_id: string;
      coupon_discount_cents: number;
      deposit_due_cents: number;
      gross_price_cents: number;
      order_line_id: string;
      registration_id: string | null;
      session_id: string;
    }>(
      `SELECT a.order_line_id, a.amount_cents, l.camper_id, l.session_id,
              l.registration_id, l.base_price_cents, l.gross_price_cents,
              l.deposit_due_cents, l.automatic_discount_cents,
              l.coupon_discount_cents, l.assistance_cents
       FROM payment_attempt_allocations a
       JOIN household_order_lines l
         ON l.organization_id=a.organization_id AND l.id=a.order_line_id
       WHERE a.organization_id=$1 AND a.payment_attempt_id=$2
       ORDER BY l.id FOR UPDATE OF l`,
      [event.organization_id, attempt.id],
    );
    const allocationTotal = allocations.rows.reduce((sum, item) => sum + item.amount_cents, 0);
    if (allocationTotal !== event.amount_cents || allocations.rows.length === 0) {
      throw new PaymentEligibilityError('Payment allocation does not match the provider amount');
    }

    if (attempt.purpose === 'DEPOSIT') {
      const holds = await client.query<{ order_line_id: string }>(
        `SELECT order_line_id FROM capacity_holds
         WHERE organization_id=$1 AND order_id=$2 AND status IN ('ACTIVE','EXPIRING')
         ORDER BY order_line_id FOR UPDATE`,
        [event.organization_id, attempt.order_id],
      );
      const held = new Set(holds.rows.map((row) => row.order_line_id));
      if (allocations.rows.some((allocation) => !held.has(allocation.order_line_id))) {
        throw new PaymentEligibilityError('One or more order holds are no longer payable');
      }
      for (const allocation of allocations.rows) {
        const registrationId = allocation.registration_id ?? randomUUID();
        await client.query(
          `INSERT INTO registrations (
             id, organization_id, session_id, family_id, camper_id, status, source,
             currency, price_cents, deposit_cents, order_id, order_line_id, bunk_buddy_names
           ) SELECT $1,$2,$3,$4,$5,'CONFIRMED','PARENT','USD',$6,$7,$8,$9,l.bunk_buddy_names
             FROM household_order_lines l WHERE l.organization_id=$2 AND l.id=$9
           ON CONFLICT (organization_id, session_id, camper_id)
             WHERE status IN ('CONFIRMED','WAITLISTED') DO NOTHING`,
          [
            registrationId,
            event.organization_id,
            allocation.session_id,
            attempt.family_id,
            allocation.camper_id,
            allocation.gross_price_cents,
            allocation.deposit_due_cents,
            attempt.order_id,
            allocation.order_line_id,
          ],
        );
        const actual = await client.query<{ id: string }>(
          `SELECT id FROM registrations
           WHERE organization_id=$1 AND order_line_id=$2`,
          [event.organization_id, allocation.order_line_id],
        );
        const actualRegistrationId = actual.rows[0]?.id;
        if (!actualRegistrationId) {
          throw new PaymentEligibilityError('Order registration could not be confirmed');
        }
        await client.query(
          `UPDATE household_order_lines
           SET registration_id=$3, outcome='CONFIRMED', updated_at=transaction_timestamp()
           WHERE organization_id=$1 AND id=$2`,
          [event.organization_id, allocation.order_line_id, actualRegistrationId],
        );
        for (const [method, amount, note] of [
          [
            'DISCOUNT',
            allocation.automatic_discount_cents + allocation.coupon_discount_cents,
            'Order discounts',
          ],
          ['SCHOLARSHIP', allocation.assistance_cents, 'Financial assistance award'],
        ] as const) {
          if (amount <= 0) continue;
          await client.query(
            `INSERT INTO registration_payments (
               id, organization_id, family_id, registration_id, amount_cents,
               method, note, recorded_by
             ) VALUES ($1,$2,$3,$4,$5,$6,$7,'system:order-confirmation')`,
            [
              randomUUID(),
              event.organization_id,
              attempt.family_id,
              actualRegistrationId,
              amount,
              method,
              note,
            ],
          );
        }
        await this.insertAllocatedOnlinePayment(
          client,
          event,
          attempt,
          actualRegistrationId,
          allocation.amount_cents,
        );
      }
      await client.query(
        `UPDATE capacity_holds SET status='CONSUMED', updated_at=transaction_timestamp()
         WHERE organization_id=$1 AND order_id=$2 AND status IN ('ACTIVE','EXPIRING')`,
        [event.organization_id, attempt.order_id],
      );
      const awardAllocations = await client.query<{ amount_cents: number; award_id: string }>(
        `UPDATE assistance_award_allocations
         SET status='CONSUMED', updated_at=transaction_timestamp()
         WHERE organization_id=$1 AND order_id=$2 AND status='RESERVED'
         RETURNING award_id, amount_cents`,
        [event.organization_id, attempt.order_id],
      );
      for (const award of awardAllocations.rows) {
        await client.query(
          `UPDATE financial_assistance_awards
           SET reserved_cents=reserved_cents-$3, consumed_cents=consumed_cents+$3,
               status=CASE WHEN consumed_cents+$3>=amount_cents THEN 'EXHAUSTED' ELSE status END,
               updated_at=transaction_timestamp()
           WHERE organization_id=$1 AND id=$2`,
          [event.organization_id, award.award_id, award.amount_cents],
        );
      }
      await client.query(
        `UPDATE household_orders SET status='COMPLETED', updated_at=transaction_timestamp()
         WHERE organization_id=$1 AND id=$2 AND status='PAYMENT_PENDING'`,
        [event.organization_id, attempt.order_id],
      );
    } else if (attempt.purpose === 'INSTALLMENT' && attempt.installment_id) {
      for (const allocation of allocations.rows) {
        if (!allocation.registration_id) {
          throw new PaymentEligibilityError('Installment allocation is missing a registration');
        }
        await this.insertAllocatedOnlinePayment(
          client,
          event,
          attempt,
          allocation.registration_id,
          allocation.amount_cents,
        );
      }
      await client.query(
        `UPDATE order_installments
         SET status='PAID', paid_at=transaction_timestamp(), updated_at=transaction_timestamp()
         WHERE organization_id=$1 AND id=$2 AND status<>'PAID'`,
        [event.organization_id, attempt.installment_id],
      );
    }
  }

  private async insertAllocatedOnlinePayment(
    client: PoolClient,
    event: ProviderPaymentEvent,
    attempt: AttemptRow,
    registrationId: string,
    amountCents: number,
  ): Promise<void> {
    await client.query(
      `INSERT INTO registration_payments (
         id, organization_id, family_id, registration_id, amount_cents, method,
         note, recorded_by, payment_attempt_id, provider, provider_reference, receipt_url
       ) VALUES ($1,$2,$3,$4,$5,'ONLINE_CARD',$6,'system:payment-webhook',$7,$8,$9,$10)
       ON CONFLICT (organization_id, payment_attempt_id, registration_id)
         WHERE payment_attempt_id IS NOT NULL DO NOTHING`,
      [
        randomUUID(),
        event.organization_id,
        attempt.family_id,
        registrationId,
        amountCents,
        `${event.provider} hosted ${attempt.purpose.toLowerCase()} checkout`,
        attempt.id,
        event.provider,
        event.provider_payment_intent_id,
        event.receipt_url,
      ],
    );
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
