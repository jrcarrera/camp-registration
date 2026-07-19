import { PostgreSqlContainer, type StartedPostgreSqlContainer } from '@testcontainers/postgresql';
import { Pool } from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { createDatabaseClient, type DatabaseClient } from './client.js';
import { runMigrations } from './migrate.js';
import { OrderStore } from './order-store.js';
import { PaymentStore } from './payment-store.js';
import { PricingStore } from './pricing-store.js';
import { seedCatalog } from './seed.js';

const organizationId = 'a60b272f-b028-4f1a-b666-3ef3cffd9827';
const seasonId = 'd5d8a8b7-c4ff-43be-a849-60cbd5914c85';
const sessionId = '28933fbb-470e-4ad6-9a74-600efe4232e3';
const familyId = '4ad31c8e-b941-4a09-8553-213075b4ed21';
const camperOneId = 'ae4b96d4-59c7-4f93-9236-50e5bb30e552';
const camperTwoId = '2ea8ee5f-c7a4-45c0-a66b-30a7f6d87c7a';

describe('household orders and pricing policies', () => {
  let container: StartedPostgreSqlContainer;
  let database: DatabaseClient;
  let migrationUrl: string;
  let addOnId: string;
  let planId: string;

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
      `UPDATE sessions SET registration_opens_at=transaction_timestamp()-interval '1 day',
         registration_closes_at=transaction_timestamp()+interval '6 months'
       WHERE organization_id=$1 AND id=$2`,
      [organizationId, sessionId],
    );
    await setup.query(
      `INSERT INTO families (id,organization_id,family_name) VALUES ($1,$2,'Household Cart Family')`,
      [familyId, organizationId],
    );
    await setup.query(
      `INSERT INTO adults (
         id,organization_id,family_id,identity_subject,first_name,last_name,email,
         email_normalized,account_owner,can_register,can_make_payments
       ) VALUES ('a4d31c8e-b941-4a09-8553-213075b4ed21',$2,$1,'order-parent',
         'Morgan','Parent','order-parent@example.test','order-parent@example.test',true,true,true)`,
      [familyId, organizationId],
    );
    await setup.query(
      `INSERT INTO campers (
         id,organization_id,family_id,first_name,last_name,birth_date,school_grade
       ) VALUES ($3,$2,$1,'Alex','Camper','2018-03-10','3'),
                ($4,$2,$1,'Bailey','Camper','2018-05-10','3')`,
      [familyId, organizationId, camperOneId, camperTwoId],
    );
    await setup.end();

    const runtimeUrl = new URL(migrationUrl);
    runtimeUrl.username = 'camp_app';
    runtimeUrl.password = 'camp-app-test';
    database = createDatabaseClient({ connectionString: runtimeUrl.toString() });

    const pricing = new PricingStore(database);
    const context = { actorId: 'pricing-admin', organizationId, requestId: 'pricing-setup' };
    addOnId = (
      await pricing.createAddOn(context, sessionId, {
        active: true,
        description: 'Required lunch plan',
        name: 'Lunch plan',
        price_cents: 1000,
        required: true,
      })
    ).id;
    await pricing.createDiscount(context, {
      active: true,
      minimum_qualifying_lines: 2,
      name: 'Sibling 10%',
      priority: 10,
      rule_type: 'SIBLING',
      season_id: seasonId,
      value: 1000,
      value_type: 'PERCENT',
    });
    await pricing.createDiscount(context, {
      active: true,
      minimum_qualifying_lines: 2,
      name: 'Lower fixed sibling offer',
      priority: 1,
      rule_type: 'SIBLING',
      season_id: seasonId,
      value: 500,
      value_type: 'FIXED',
    });
    await pricing.createCoupon(context, {
      active: true,
      code: ' FAMILY5 ',
      ends_at: null,
      maximum_redemptions: 10,
      season_id: seasonId,
      starts_at: null,
      value: 500,
      value_type: 'PERCENT',
    });
    const application = await pricing.createAssistanceApplication(context, familyId, {
      camper_id: null,
      requested_cents: 3000,
      season_id: seasonId,
      statement: 'Our household is requesting help with camp tuition.',
      submit: true,
    });
    await pricing.reviewAssistance(context, application.id, {
      approved_cents: 3000,
      internal_note: 'Approved for this season.',
      status: 'APPROVED',
      version: application.version,
    });
    planId = (
      await pricing.createPaymentPlan(context, {
        active: true,
        installments: [
          { due_on: '2027-03-01', percentage_basis_points: 5000, sequence: 1 },
          { due_on: '2027-04-01', percentage_basis_points: 5000, sequence: 2 },
        ],
        name: 'Spring split',
        season_id: seasonId,
      })
    ).id;
  }, 120_000);

  afterAll(async () => {
    await database?.close();
    await container?.stop();
  });

  it('keeps every new tenant table hidden without tenant context', async () => {
    const tables = [
      'household_orders',
      'household_order_lines',
      'capacity_holds',
      'payment_attempt_allocations',
      'session_add_ons',
      'discount_rules',
      'coupons',
      'financial_assistance_applications',
      'financial_assistance_awards',
      'payment_plan_templates',
      'order_installments',
    ];
    for (const table of tables) {
      const result = await database.pool.query(`SELECT id FROM ${table}`);
      expect(result.rows, table).toEqual([]);
    }
  });

  it('quotes and submits a priced multi-camper order idempotently', async () => {
    const orders = new OrderStore(database);
    const selection = {
      coupon_code: 'family5',
      lines: [
        { add_on_ids: [addOnId], camper_id: camperOneId, session_id: sessionId },
        { add_on_ids: [addOnId], camper_id: camperTwoId, session_id: sessionId },
      ],
      payment_plan_template_id: planId,
      waitlist_mode: 'INDIVIDUAL' as const,
    };
    const before = await orders.quote(organizationId, familyId, selection);
    expect(before).toMatchObject({
      totals: {
        assistance_cents: 3000,
        automatic_discount_cents: 1750,
        coupon_discount_cents: 1662,
        deposit_due_cents: 5000,
        gross_total_cents: 37000,
        net_total_cents: 30588,
      },
      valid: true,
    });
    expect(before.lines.every((line) => line.outcome === 'AVAILABLE')).toBe(true);
    const noQuoteWrites = await orders.listOrders(organizationId, familyId);
    expect(noQuoteWrites).toEqual([]);

    const context = { actorId: 'order-parent', organizationId, requestId: 'order-submit' };
    const idempotencyKey = '24a73d31-3a8d-4400-9ef8-a5cdfefaa4b4';
    const order = await orders.createOrder(context, familyId, {
      ...selection,
      idempotency_key: idempotencyKey,
    });
    expect(order.status).toBe('PAYMENT_PENDING');
    expect(order.lines).toHaveLength(2);
    expect(order.lines.every((line) => line.outcome === 'HELD')).toBe(true);
    expect(order.lines.every((line) => line.add_on_names.includes('Lunch plan'))).toBe(true);
    expect(order.installments.map((item) => item.amount_cents)).toEqual([12794, 12794]);
    const replay = await orders.createOrder(context, familyId, {
      ...selection,
      idempotency_key: idempotencyKey,
    });
    expect(replay.id).toBe(order.id);
  });

  it('allocates one order payment across registrations exactly once', async () => {
    const order = (await new OrderStore(database).listOrders(organizationId, familyId))[0]!;
    const payments = new PaymentStore(database);
    const attemptId = 'f98bc64c-a79f-4fcf-9cf8-e37ced162ef8';
    const attempt = await payments.prepareOrderCheckout(
      { actorId: 'order-parent', organizationId, requestId: 'order-payment' },
      {
        attemptId,
        familyId,
        idempotencyKey: '21587ea2-50c8-4668-b5ec-acf0bdf3fd22',
        orderId: order.id,
        provider: 'LOCAL',
      },
    );
    expect(attempt.amount_cents).toBe(5000);
    await payments.attachCheckout(organizationId, attemptId, {
      checkoutUrl: `http://localhost:3000/portal/payments/local/${attemptId}`,
      providerCheckoutSessionId: 'local_cs_order_test',
    });
    const event = {
      amount_cents: 5000,
      attempt_id: attemptId,
      currency: 'USD' as const,
      event_id: 'local:event:order-paid',
      event_type: 'local.checkout.completed',
      failure_code: null,
      organization_id: organizationId,
      provider: 'LOCAL' as const,
      provider_account_id: `local:${organizationId}`,
      provider_checkout_session_id: 'local_cs_order_test',
      provider_payment_intent_id: 'local_pi_order_test',
      receipt_url: null,
      status: 'SUCCEEDED' as const,
    };
    await expect(payments.applyProviderEvent(event)).resolves.toMatchObject({ duplicate: false });
    await expect(payments.applyProviderEvent(event)).resolves.toMatchObject({ duplicate: true });

    const confirmed = await new OrderStore(database).getOrder(organizationId, order.id);
    expect(confirmed.status).toBe('COMPLETED');
    expect(confirmed.lines.every((line) => line.outcome === 'CONFIRMED')).toBe(true);
    const admin = new Pool({ connectionString: migrationUrl });
    const ledger = await admin.query(
      `SELECT registration_id,amount_cents FROM registration_payments
       WHERE payment_attempt_id=$1 ORDER BY registration_id`,
      [attemptId],
    );
    const notices = await admin.query(
      `SELECT notification_type,template_data FROM notification_outbox
       WHERE idempotency_key IN ($1,$2) ORDER BY notification_type`,
      [`payment-receipt:${attemptId}`, `order-confirmation:${order.id}`],
    );
    await admin.end();
    expect(ledger.rows).toHaveLength(2);
    expect(ledger.rows.reduce((sum, row) => sum + row.amount_cents, 0)).toBe(5000);
    expect(notices.rows.map((row) => row.notification_type).sort()).toEqual([
      'ORDER_CONFIRMATION',
      'PAYMENT_RECEIPT',
    ]);
    const confirmation = notices.rows.find((row) => row.notification_type === 'ORDER_CONFIRMATION');
    expect(confirmation.template_data.order_summary).toMatchObject({
      gross_total_cents: 37_000,
      paid_cents: 5_000,
      remaining_balance_cents: 25_588,
    });
    expect(confirmation.template_data.order_summary.lines).toHaveLength(2);
  });
});
