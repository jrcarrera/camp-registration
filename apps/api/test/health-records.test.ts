import type { HealthRecord } from '@camp-registration/contracts';
import { describe, expect, it, vi } from 'vitest';

import { buildApp } from '../src/app.js';
import type { HealthRecordServiceApi } from '../src/health-records/service.js';

const camperId = '0c3e5be4-2ff0-46d4-b58d-1f01f46e87bf';
const record: HealthRecord = {
  accessibility_needs: [],
  allergies: ['Peanuts'],
  camper_id: camperId,
  camper_name: 'Avery Winter',
  dietary_needs: [],
  document_references: [],
  emergency_instructions: 'Use epinephrine',
  family_id: '92cc853b-e2b6-4b1b-8684-0f4f6fcfc3a6',
  family_name: 'Winter Family 001',
  has_accessibility_needs: false,
  has_allergies: true,
  has_dietary_needs: false,
  has_emergency_instructions: true,
  has_medications: false,
  immunization_notes: '',
  immunization_status: 'CURRENT',
  medications: [],
  record_id: 'cf9104af-baa2-49f8-9289-e3bb0aa61103',
  review_message: '',
  review_status: 'SUBMITTED',
  reviewed_at: null,
  session_names: ['Winter Camp'],
  submitted_at: '2028-01-01T00:00:00.000Z',
  updated_at: '2028-01-01T00:00:00.000Z',
  version: 2,
};

function service(): HealthRecordServiceApi {
  return {
    exportRecords: vi.fn(async () => ({
      content: '\uFEFF"Camper","Allergies"\r\n"Avery Winter","Peanuts"\r\n',
      filename: 'restricted-health-records.csv',
      rowCount: 1,
    })),
    getCenter: vi.fn(async () => ({ records: [record] })),
    getRecord: vi.fn(async () => record),
    reviewRecord: vi.fn(
      async (): Promise<HealthRecord> => ({
        ...record,
        review_status: 'APPROVED',
      }),
    ),
    saveRecord: vi.fn(async () => record),
    submitRecord: vi.fn(async () => record),
  };
}

describe('restricted health routes', () => {
  it('publishes projections and audited record operations through validated contracts', async () => {
    const healthRecordService = service();
    const app = await buildApp({ healthRecordService });

    const center = await app.inject({ method: 'GET', url: '/v1/health-records' });
    const opened = await app.inject({
      method: 'GET',
      url: `/v1/health-records/campers/${camperId}`,
    });
    const reviewed = await app.inject({
      method: 'POST',
      payload: { review_message: 'Ready for camp.', status: 'APPROVED', version: 2 },
      url: `/v1/health-records/campers/${camperId}/review`,
    });

    expect(center.statusCode).toBe(200);
    expect(center.json().records[0]).not.toHaveProperty('allergies');
    expect(opened.statusCode).toBe(200);
    expect(opened.json().allergies).toEqual(['Peanuts']);
    expect(reviewed.statusCode).toBe(200);
    expect(reviewed.json().review_status).toBe('APPROVED');
    expect(healthRecordService.getRecord).toHaveBeenCalledWith(camperId, {}, expect.any(String));
    await app.close();
  });

  it('marks exports private and rejects malformed health payloads', async () => {
    const healthRecordService = service();
    const app = await buildApp({ healthRecordService });

    const exportResponse = await app.inject({ method: 'GET', url: '/v1/health-records/export' });
    const invalid = await app.inject({
      method: 'PUT',
      payload: { allergies: ['Peanuts'] },
      url: `/v1/health-records/campers/${camperId}`,
    });

    expect(exportResponse.statusCode).toBe(200);
    expect(exportResponse.headers['cache-control']).toBe('private, no-store');
    expect(exportResponse.headers['content-type']).toContain('text/csv');
    expect(invalid.statusCode).toBe(400);
    expect(healthRecordService.saveRecord).not.toHaveBeenCalled();
    await app.close();
  });
});
