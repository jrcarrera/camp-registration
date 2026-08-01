import type { MedicationAdministration, MedicationOrder } from '@camp-registration/contracts';
import { describe, expect, it, vi } from 'vitest';

import { buildApp } from '../src/app.js';
import type { MedicationAdministrationServiceApi as Api } from '../src/medication-administration/service.js';

const orderId = '9089074f-181a-48d7-bb33-d58547283bbd';
const administrationId = 'cb318bab-3c95-40a9-85cd-b188d4c463ea';
const camperId = '0c3e5be4-2ff0-46d4-b58d-1f01f46e87bf';
const sessionId = '2016ba2d-d2e7-497d-9049-e4ea25079b25';

const order: MedicationOrder = {
  administration_times: ['08:00'],
  camper_id: camperId,
  camper_name: 'Avery Winter',
  created_at: '2028-01-01T12:00:00.000Z',
  discontinued_at: null,
  dose: '5 mg',
  ends_on: '2028-01-07',
  id: orderId,
  instructions: 'Give with breakfast.',
  medication_name: 'Example medication',
  schedule_type: 'SCHEDULED',
  session_id: sessionId,
  session_name: 'Winter Camp',
  starts_on: '2028-01-01',
  status: 'ACTIVE',
  version: 1,
};

const administration: MedicationAdministration = {
  administered_at: '2028-01-01T14:01:00.000Z',
  administered_by: 'health-user',
  id: administrationId,
  note: '',
  order_id: orderId,
  outcome: 'GIVEN',
  scheduled_for: '2028-01-01T14:00:00.000Z',
};

function service(): Api {
  return {
    createOrder: vi.fn(async () => order),
    discontinueOrder: vi.fn(
      async (): Promise<MedicationOrder> => ({
        ...order,
        discontinued_at: '2028-01-01T15:00:00.000Z',
        status: 'DISCONTINUED',
        version: 2,
      }),
    ),
    getCenter: vi.fn(async () => ({
      administrations: [],
      candidates: [
        {
          camper_id: camperId,
          camper_name: 'Avery Winter',
          family_name: 'Winter Family 001',
          session_id: sessionId,
          session_name: 'Winter Camp',
        },
      ],
      date: '2028-01-01',
      orders: [order],
      scheduled_doses: [
        {
          administration: null,
          order_id: orderId,
          scheduled_for: '2028-01-01T14:00:00.000Z',
        },
      ],
      timezone: 'America/Chicago',
    })),
    recordAdministration: vi.fn(async () => administration),
  };
}

describe('restricted medication administration routes', () => {
  it('keeps the daily round private and passes validated filters', async () => {
    const medicationAdministrationService = service();
    const app = await buildApp({ medicationAdministrationService });
    const response = await app.inject({
      method: 'GET',
      url: `/v1/medication-administration?date=2028-01-01&session_id=${sessionId}`,
    });

    expect(response.statusCode).toBe(200);
    expect(response.headers['cache-control']).toBe('private, no-store');
    expect(response.json().orders[0].medication_name).toBe('Example medication');
    expect(medicationAdministrationService.getCenter).toHaveBeenCalledWith(
      { date: '2028-01-01', session_id: sessionId },
      expect.any(String),
    );
    await app.close();
  });

  it('validates order, administration, and discontinuation commands', async () => {
    const medicationAdministrationService = service();
    const app = await buildApp({ medicationAdministrationService });
    const created = await app.inject({
      method: 'POST',
      payload: {
        administration_times: ['08:00'],
        camper_id: camperId,
        dose: '5 mg',
        ends_on: '2028-01-07',
        instructions: 'Give with breakfast.',
        medication_name: 'Example medication',
        schedule_type: 'SCHEDULED',
        session_id: sessionId,
        starts_on: '2028-01-01',
      },
      url: '/v1/medication-administration/orders',
    });
    const recorded = await app.inject({
      method: 'POST',
      payload: {
        administered_at: '2028-01-01T14:01:00.000Z',
        note: '',
        outcome: 'GIVEN',
        scheduled_for: '2028-01-01T14:00:00.000Z',
      },
      url: `/v1/medication-administration/orders/${orderId}/administrations`,
    });
    const discontinued = await app.inject({
      method: 'POST',
      payload: { version: 1 },
      url: `/v1/medication-administration/orders/${orderId}/discontinue`,
    });
    const invalid = await app.inject({
      method: 'POST',
      payload: {
        administered_at: 'not-a-time',
        note: '',
        outcome: 'UNKNOWN',
      },
      url: `/v1/medication-administration/orders/${orderId}/administrations`,
    });

    expect(created.statusCode).toBe(200);
    expect(recorded.statusCode).toBe(200);
    expect(recorded.json().outcome).toBe('GIVEN');
    expect(discontinued.statusCode).toBe(200);
    expect(discontinued.json().status).toBe('DISCONTINUED');
    expect(invalid.statusCode).toBe(400);
    expect(medicationAdministrationService.recordAdministration).toHaveBeenCalledTimes(1);
    await app.close();
  });
});
