import { PostgreSqlContainer, type StartedPostgreSqlContainer } from '@testcontainers/postgresql';
import { Pool } from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { createDatabaseClient, type DatabaseClient } from './client.js';
import { runMigrations } from './migrate.js';
import { PaymentStore } from './payment-store.js';
import { seedCatalog } from './seed.js';

const organizationId = 'a60b272f-b028-4f1a-b666-3ef3cffd9827';
const familyId = 'a123e456-e89b-42d3-a456-426614174000';
const camperId = 'b123e456-e89b-42d3-a456-426614174000';
const registrationId = 'c123e456-e89b-42d3-a456-426614174000';
const attemptId = 'd123e456-e89b-42d3-a456-426614174000';
const idempotencyKey = 'e123e456-e89b-42d3-a456-426614174000';
const sessionId = '28933fbb-470e-4ad6-9a74-600efe4232e3';

describe('payment store', () => {
  let container: StartedPostgreSqlContainer;
  let database: DatabaseClient;
  let migrationUrl: string;

  beforeAll(async () => {
    container = await new PostgreSqlContainer('postgres:17-alpine').start();
    migrationUrl = container.getConnectionUri();
    const admin = new Pool({ connectionString: migrationUrl });
    await admin.query(`CREATE ROLE camp_app LOGIN PASSWORD 'camp-app-test' NOBYPASSRLS`);
    await admin.end();
    await runMigrations(migrationUrl);
    await seedCatalog(migrationUrl);

    const setup = new Pool({ connectionString: migrationUrl });
    await setup.query(
      `INSERT INTO families (id, organization_id, family_name) VALUES ($1, $2, 'Payment Family')`,
      [familyId, organizationId],
    );
    await setup.query(
      `INSERT INTO adults (
         id, organization_id, family_id, identity_subject, first_name, last_name,
         email, email_normalized, account_owner, can_make_payments
       ) VALUES (
         'f123e456-e89b-42d3-a456-426614174000', $2, $1, 'payment-parent',
         'Pat', 'Parent', 'parent@example.test', 'parent@example.test', true, true
       )`,
      [familyId, organizationId],
    );
    await setup.query(
      `INSERT INTO campers (
         id, organization_id, family_id, first_name, last_name, birth_date
       ) VALUES ($3, $2, $1, 'Casey', 'Camper', '2018-04-12')`,
      [familyId, organizationId, camperId],
    );
    await setup.query(
      `INSERT INTO registrations (
         id, organization_id, session_id, family_id, camper_id, status, source,
         currency, price_cents, deposit_cents
       ) VALUES ($4, $2, $5, $1, $3, 'CONFIRMED', 'PARENT', 'USD', 17500, 2500)`,
      [familyId, organizationId, camperId, registrationId, sessionId],
    );
    await setup.end();

    const runtimeUrl = new URL(migrationUrl);
    runtimeUrl.username = 'camp_app';
    runtimeUrl.password = 'camp-app-test';
    database = createDatabaseClient({ connectionString: runtimeUrl.toString() });
  }, 120_000);

  afterAll(async () => {
    await database?.close();
    await container?.stop();
  });

  it('creates an idempotent deposit attempt and records one ledger payment', async () => {
    const store = new PaymentStore(database);
    const context = { actorId: 'payment-parent', organizationId, requestId: 'payment-test' };
    const prepared = await store.prepareCheckout(context, {
      attemptId,
      familyId,
      idempotencyKey,
      provider: 'LOCAL',
      registrationId,
    });
    expect(prepared).toMatchObject({ amount_cents: 2500, status: 'PENDING' });
    const repeated = await store.prepareCheckout(context, {
      attemptId: '0123e456-e89b-42d3-a456-426614174000',
      familyId,
      idempotencyKey,
      provider: 'LOCAL',
      registrationId,
    });
    expect(repeated.id).toBe(attemptId);

    const attached = await store.attachCheckout(organizationId, attemptId, {
      checkoutUrl: `http://localhost:3000/portal/payments/local/${attemptId}`,
      providerCheckoutSessionId: 'local_cs_payment_test',
    });
    expect(attached.checkout_url).toContain(attemptId);

    const event = {
      amount_cents: 2500,
      attempt_id: attemptId,
      currency: 'USD' as const,
      event_id: 'local:event:payment-test',
      event_type: 'local.checkout.completed',
      failure_code: null,
      organization_id: organizationId,
      provider: 'LOCAL' as const,
      provider_account_id: `local:${organizationId}`,
      provider_checkout_session_id: 'local_cs_payment_test',
      provider_payment_intent_id: 'local_pi_payment_test',
      receipt_url: null,
      status: 'SUCCEEDED' as const,
    };
    await expect(store.applyProviderEvent(event)).resolves.toMatchObject({
      duplicate: false,
      outcome: 'APPLIED',
    });
    await expect(store.applyProviderEvent(event)).resolves.toMatchObject({
      duplicate: true,
      outcome: 'IGNORED',
    });
    await expect(
      store.applyProviderEvent({
        ...event,
        event_id: 'local:event:late-failure',
        event_type: 'local.checkout.failed',
        status: 'FAILED',
      }),
    ).resolves.toMatchObject({ outcome: 'IGNORED' });

    const admin = new Pool({ connectionString: migrationUrl });
    const ledger = await admin.query(
      `SELECT amount_cents, method, payment_attempt_id, provider_reference
       FROM registration_payments WHERE payment_attempt_id = $1`,
      [attemptId],
    );
    const receipt = await admin.query(
      `SELECT notification_type, idempotency_key
       FROM notification_outbox WHERE idempotency_key = $1`,
      [`payment-receipt:${attemptId}`],
    );
    await admin.end();
    expect(ledger.rows).toEqual([
      {
        amount_cents: 2500,
        method: 'ONLINE_CARD',
        payment_attempt_id: attemptId,
        provider_reference: 'local_pi_payment_test',
      },
    ]);
    expect(receipt.rows).toEqual([
      { idempotency_key: `payment-receipt:${attemptId}`, notification_type: 'PAYMENT_RECEIPT' },
    ]);
  });
});
