import type { HouseholdOrder, OrderQuote } from '@camp-registration/contracts';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { buildApp } from '../src/app.js';
import type { OrderServiceApi } from '../src/orders/service.js';

const familyId = 'a123e456-e89b-42d3-a456-426614174000';
const camperId = 'b123e456-e89b-42d3-a456-426614174000';
const sessionId = 'c123e456-e89b-42d3-a456-426614174000';
const orderId = 'd123e456-e89b-42d3-a456-426614174000';

const quote: OrderQuote = {
  currency: 'USD',
  lines: [
    {
      add_on_total_cents: 1000,
      assistance_cents: 0,
      automatic_discount_cents: 0,
      camper_id: camperId,
      camper_name: 'Casey Camper',
      bunk_buddy_names: [],
      coupon_discount_cents: 0,
      deposit_due_cents: 2500,
      errors: [],
      gross_price_cents: 18500,
      net_price_cents: 18500,
      outcome: 'AVAILABLE',
      session_id: sessionId,
      session_name: 'Day Camp Week 1',
    },
  ],
  totals: {
    assistance_cents: 0,
    automatic_discount_cents: 0,
    coupon_discount_cents: 0,
    deposit_due_cents: 2500,
    gross_total_cents: 18500,
    net_total_cents: 18500,
  },
  valid: true,
};

const order: HouseholdOrder = {
  coupon_code: null,
  created_at: '2026-07-19T12:00:00.000Z',
  currency: 'USD',
  family_id: familyId,
  family_name: 'Camper Family',
  id: orderId,
  installments: [],
  lines: [
    {
      add_on_names: ['Lunch plan'],
      add_on_total_cents: 1000,
      adjustments: [],
      assistance_cents: 0,
      automatic_discount_cents: 0,
      camper_id: camperId,
      camper_name: 'Casey Camper',
      bunk_buddy_names: [],
      coupon_discount_cents: 0,
      deposit_due_cents: 2500,
      gross_price_cents: 18500,
      hold_expires_at: '2026-07-19T12:10:00.000Z',
      id: 'e123e456-e89b-42d3-a456-426614174000',
      net_price_cents: 18500,
      outcome: 'HELD',
      registration_id: null,
      session_id: sessionId,
      session_name: 'Day Camp Week 1',
    },
  ],
  payment_required: true,
  status: 'PAYMENT_PENDING',
  totals: quote.totals,
  waitlist_mode: 'INDIVIDUAL',
};

function service(): OrderServiceApi {
  return {
    createOrder: vi.fn(async () => order),
    getOrder: vi.fn(async () => order),
    listFamilyOrders: vi.fn(async () => [order]),
    listOrders: vi.fn(async () => [order]),
    quote: vi.fn(async () => quote),
  };
}

describe('household order routes', () => {
  const apps: Array<Awaited<ReturnType<typeof buildApp>>> = [];
  afterEach(async () => Promise.all(apps.splice(0).map((app) => app.close())));

  it('quotes without requiring a client price and submits with an idempotency key', async () => {
    const orderService = service();
    const app = await buildApp({ orderService });
    apps.push(app);
    const selection = {
      coupon_code: null,
      lines: [{ add_on_ids: [], camper_id: camperId, session_id: sessionId }],
      payment_plan_template_id: null,
      waitlist_mode: 'INDIVIDUAL',
    };
    const quoted = await app.inject({
      method: 'POST',
      payload: selection,
      url: `/v1/families/${familyId}/order-quotes`,
    });
    expect(quoted.statusCode).toBe(200);
    expect(quoted.json().totals.deposit_due_cents).toBe(2500);

    const submitted = await app.inject({
      method: 'POST',
      payload: { ...selection, idempotency_key: 'f123e456-e89b-42d3-a456-426614174000' },
      url: `/v1/families/${familyId}/orders`,
    });
    expect(submitted.statusCode).toBe(201);
    expect(submitted.json()).toMatchObject({ id: orderId, status: 'PAYMENT_PENDING' });
  });

  it('rejects carts larger than the 20-line contract limit', async () => {
    const orderService = service();
    const app = await buildApp({ orderService });
    apps.push(app);
    const line = { camper_id: camperId, session_id: sessionId };
    const response = await app.inject({
      method: 'POST',
      payload: { lines: Array.from({ length: 21 }, () => line), waitlist_mode: 'INDIVIDUAL' },
      url: `/v1/families/${familyId}/order-quotes`,
    });
    expect(response.statusCode).toBe(400);
    expect(orderService.quote).not.toHaveBeenCalled();
  });
});
