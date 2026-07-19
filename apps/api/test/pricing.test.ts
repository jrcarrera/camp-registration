import type { PricingServiceApi } from '../src/pricing/service.js';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { buildApp } from '../src/app.js';

const familyId = 'a123e456-e89b-42d3-a456-426614174000';
const seasonId = 'b123e456-e89b-42d3-a456-426614174000';
const applicationId = 'c123e456-e89b-42d3-a456-426614174000';

const application = {
  approved_cents: null,
  camper_id: null,
  created_at: '2026-07-19T12:00:00.000Z',
  family_id: familyId,
  id: applicationId,
  internal_note: null,
  requested_cents: 5000,
  season_id: seasonId,
  statement: 'We are requesting assistance for camp this season.',
  status: 'SUBMITTED' as const,
  version: 1,
};

function service(): PricingServiceApi {
  return {
    createAddOn: vi.fn(),
    createAssistance: vi.fn(async () => application),
    createCoupon: vi.fn(),
    createDiscount: vi.fn(),
    createPaymentPlan: vi.fn(),
    deactivatePricingResource: vi.fn(),
    listAssistance: vi.fn(async () => [application]),
    listConfiguration: vi.fn(async () => ({
      add_ons: [],
      coupons: [],
      discount_rules: [],
      payment_plan_templates: [],
    })),
    listFamilyAssistance: vi.fn(async () => [application]),
    reviewAssistance: vi.fn(async () => ({
      ...application,
      approved_cents: 4000,
      status: 'APPROVED' as const,
      version: 2,
    })),
    updateAddOn: vi.fn(),
    updateAssistance: vi.fn(async () => application),
    updateCoupon: vi.fn(),
    updateDiscount: vi.fn(),
    updatePaymentPlan: vi.fn(),
    withdrawAssistance: vi.fn(async () => ({
      ...application,
      status: 'WITHDRAWN' as const,
      version: 2,
    })),
  };
}

describe('pricing and assistance routes', () => {
  const apps: Array<Awaited<ReturnType<typeof buildApp>>> = [];
  afterEach(async () => Promise.all(apps.splice(0).map((app) => app.close())));

  it('supports parent application submission and withdrawal', async () => {
    const pricingService = service();
    const app = await buildApp({ pricingService });
    apps.push(app);
    const created = await app.inject({
      method: 'POST',
      payload: {
        camper_id: null,
        requested_cents: 5000,
        season_id: seasonId,
        statement: application.statement,
        submit: true,
      },
      url: `/v1/families/${familyId}/financial-assistance`,
    });
    expect(created.statusCode).toBe(201);
    const withdrawn = await app.inject({
      method: 'POST',
      payload: { version: 1 },
      url: `/v1/families/${familyId}/financial-assistance/${applicationId}/withdraw`,
    });
    expect(withdrawn.statusCode).toBe(200);
    expect(withdrawn.json().status).toBe('WITHDRAWN');
  });

  it('validates payment plan percentages before calling the service', async () => {
    const pricingService = service();
    const app = await buildApp({ pricingService });
    apps.push(app);
    const response = await app.inject({
      method: 'POST',
      payload: {
        active: true,
        installments: [{ due_on: '2027-01-01', percentage_basis_points: 5000, sequence: 1 }],
        name: 'Invalid plan',
        season_id: seasonId,
      },
      url: '/v1/pricing/payment-plans',
    });
    expect(response.statusCode).toBe(400);
    expect(pricingService.createPaymentPlan).not.toHaveBeenCalled();
  });
});
