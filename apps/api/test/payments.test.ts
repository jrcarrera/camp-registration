import type { PaymentServiceApi } from '../src/payments/service.js';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { buildApp } from '../src/app.js';

const familyId = 'a123e456-e89b-42d3-a456-426614174000';
const registrationId = 'b123e456-e89b-42d3-a456-426614174000';
const attemptId = 'c123e456-e89b-42d3-a456-426614174000';
const idempotencyKey = 'd123e456-e89b-42d3-a456-426614174000';

function attempt() {
  return {
    amount_cents: 2500,
    camper_name: 'Casey Camper',
    completed_at: null,
    created_at: '2026-07-18T12:00:00.000Z',
    currency: 'USD' as const,
    family_id: familyId,
    family_name: 'Camper Family',
    id: attemptId,
    installment_id: null,
    order_id: null,
    provider: 'LOCAL' as const,
    provider_reference: null,
    purpose: 'DEPOSIT' as const,
    receipt_url: null,
    registration_id: registrationId,
    session_name: 'Day Camp Week 1',
    status: 'PENDING' as const,
  };
}

function paymentService(): PaymentServiceApi {
  return {
    completeLocalPayment: vi.fn(async () => ({
      attempt: {
        ...attempt(),
        completed_at: '2026-07-18T12:01:00.000Z',
        status: 'SUCCEEDED' as const,
      },
    })),
    createCheckout: vi.fn(async () => ({
      amount_cents: 2500,
      attempt_id: attemptId,
      checkout_url: `http://localhost:3000/portal/payments/local/${attemptId}`,
      currency: 'USD' as const,
      status: 'PENDING' as const,
    })),
    createInstallmentCheckout: vi.fn(async () => ({
      amount_cents: 2500,
      attempt_id: attemptId,
      checkout_url: `http://localhost:3000/portal/payments/local/${attemptId}`,
      currency: 'USD' as const,
      status: 'PENDING' as const,
    })),
    createOrderCheckout: vi.fn(async () => ({
      amount_cents: 2500,
      attempt_id: attemptId,
      checkout_url: `http://localhost:3000/portal/payments/local/${attemptId}`,
      currency: 'USD' as const,
      status: 'PENDING' as const,
    })),
    createAdjustment: vi.fn(async (input) => ({
      adjustment_type: input.adjustment_type,
      amount_cents: input.amount_cents,
      completed_at: '2026-07-18T12:02:00.000Z',
      created_at: '2026-07-18T12:02:00.000Z',
      created_by: 'finance-user',
      currency: 'USD' as const,
      family_id: familyId,
      id: 'e123e456-e89b-42d3-a456-426614174000',
      payment_attempt_id: input.payment_attempt_id ?? null,
      provider: input.adjustment_type === 'REFUND' ? ('LOCAL' as const) : null,
      provider_reference:
        input.adjustment_type === 'REFUND' ? 'local_re_e123e456e89b42d3a456426614174000' : null,
      reason: input.reason,
      registration_id: input.registration_id,
      status: 'SUCCEEDED' as const,
    })),
    getAdjustmentCenter: vi.fn(async () => ({
      accounts: [],
      adjustments: [],
    })),
    getAttempt: vi.fn(async () => attempt()),
    listAttempts: vi.fn(async () => [attempt()]),
  };
}

describe('payment routes', () => {
  const apps: Array<Awaited<ReturnType<typeof buildApp>>> = [];

  afterEach(async () => {
    await Promise.all(apps.splice(0).map((app) => app.close()));
  });

  it('starts a server-calculated hosted deposit checkout', async () => {
    const service = paymentService();
    const app = await buildApp({ paymentService: service });
    apps.push(app);
    const response = await app.inject({
      method: 'POST',
      payload: { idempotency_key: idempotencyKey },
      url: `/v1/families/${familyId}/registrations/${registrationId}/online-payment`,
    });

    expect(response.statusCode).toBe(201);
    expect(response.json()).toMatchObject({ amount_cents: 2500, attempt_id: attemptId });
    expect(service.createCheckout).toHaveBeenCalledWith(
      familyId,
      registrationId,
      idempotencyKey,
      expect.any(String),
    );
  });

  it('returns the staff reconciliation queue', async () => {
    const service = paymentService();
    const app = await buildApp({ paymentService: service });
    apps.push(app);
    const response = await app.inject({ method: 'GET', url: '/v1/payments' });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({ attempts: [attempt()] });
  });

  it('completes the local hosted-checkout adapter', async () => {
    const service = paymentService();
    const app = await buildApp({ paymentService: service });
    apps.push(app);
    const response = await app.inject({
      method: 'POST',
      url: `/v1/payments/local/${attemptId}/complete`,
    });

    expect(response.statusCode).toBe(200);
    expect(response.json().attempt.status).toBe('SUCCEEDED');
  });

  it('creates an audited finance adjustment', async () => {
    const service = paymentService();
    const app = await buildApp({ paymentService: service });
    apps.push(app);
    const response = await app.inject({
      method: 'POST',
      payload: {
        adjustment_type: 'CREDIT',
        amount_cents: 1000,
        idempotency_key: idempotencyKey,
        reason: 'Family service credit',
        registration_id: registrationId,
      },
      url: '/v1/payment-adjustments',
    });

    expect(response.statusCode).toBe(201);
    expect(response.json()).toMatchObject({
      adjustment_type: 'CREDIT',
      amount_cents: 1000,
      registration_id: registrationId,
    });
    expect(service.createAdjustment).toHaveBeenCalledWith(
      expect.objectContaining({ adjustment_type: 'CREDIT' }),
      expect.any(String),
    );
  });
});
