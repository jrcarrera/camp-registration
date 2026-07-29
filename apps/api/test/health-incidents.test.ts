import type { HealthIncident } from '@camp-registration/contracts';
import { describe, expect, it, vi } from 'vitest';

import { buildApp } from '../src/app.js';
import type { HealthIncidentServiceApi as Api } from '../src/health-incidents/service.js';

const incidentId = '9089074f-181a-48d7-bb33-d58547283bbd';
const camperId = '0c3e5be4-2ff0-46d4-b58d-1f01f46e87bf';
const sessionId = '2016ba2d-d2e7-497d-9049-e4ea25079b25';

const incident: HealthIncident = {
  camper_id: camperId,
  camper_name: 'Avery Winter',
  care_given: 'Ice pack applied.',
  created_at: '2028-01-01T16:10:00.000Z',
  entries: [],
  guardian_notification_status: 'NOTIFIED',
  guardian_notified_at: '2028-01-01T16:15:00.000Z',
  guardian_notified_to: 'Jordan Winter',
  id: incidentId,
  incident_type: 'INJURY',
  location: 'Archery range',
  occurred_at: '2028-01-01T16:00:00.000Z',
  resolved_at: null,
  session_id: sessionId,
  session_name: 'Winter Camp',
  severity: 'MINOR',
  status: 'OPEN',
  summary: 'Small scrape on left knee.',
  version: 1,
};

function service(): Api {
  return {
    addNote: vi.fn(async () => ({ ...incident, version: 2 })),
    createIncident: vi.fn(async () => incident),
    getCenter: vi.fn(async () => ({
      candidates: [
        {
          camper_id: camperId,
          camper_name: 'Avery Winter',
          family_name: 'Winter Family 001',
          session_id: sessionId,
          session_name: 'Winter Camp',
        },
      ],
      incidents: [incident],
      timezone: 'America/Chicago',
    })),
    getIncident: vi.fn(async () => incident),
    recordGuardianNotification: vi.fn(
      async (): Promise<HealthIncident> => ({
        ...incident,
        guardian_notification_status: 'NOTIFIED',
        version: 2,
      }),
    ),
    resolveIncident: vi.fn(
      async (): Promise<HealthIncident> => ({
        ...incident,
        entries: [
          {
            created_at: '2028-01-01T17:00:00.000Z',
            created_by: 'health-user',
            entry_type: 'RESOLUTION',
            guardian_notified_at: null,
            guardian_notified_to: '',
            id: 'cb318bab-3c95-40a9-85cd-b188d4c463ea',
            note: 'Returned to activity.',
          },
        ],
        resolved_at: '2028-01-01T17:00:00.000Z',
        status: 'RESOLVED',
        version: 2,
      }),
    ),
  };
}

describe('restricted health incident routes', () => {
  it('keeps list projections private and decrypts one authorized incident', async () => {
    const healthIncidentService = service();
    const app = await buildApp({ healthIncidentService });

    const center = await app.inject({ method: 'GET', url: '/v1/health-incidents?status=OPEN' });
    const detail = await app.inject({
      method: 'GET',
      url: `/v1/health-incidents/${incidentId}`,
    });

    expect(center.statusCode).toBe(200);
    expect(center.headers['cache-control']).toBe('private, no-store');
    expect(center.json().incidents[0]).not.toHaveProperty('summary');
    expect(detail.statusCode).toBe(200);
    expect(detail.json().summary).toBe('Small scrape on left knee.');
    expect(healthIncidentService.getCenter).toHaveBeenCalledWith(
      { status: 'OPEN' },
      expect.any(String),
    );
    await app.close();
  });

  it('validates create, follow-up, and resolution commands', async () => {
    const healthIncidentService = service();
    const app = await buildApp({ healthIncidentService });

    const created = await app.inject({
      method: 'POST',
      payload: {
        camper_id: camperId,
        care_given: 'Ice pack applied.',
        guardian_notification_status: 'NOTIFIED',
        guardian_notified_at: '2028-01-01T16:15:00.000Z',
        guardian_notified_to: 'Jordan Winter',
        incident_type: 'INJURY',
        location: 'Archery range',
        occurred_at: '2028-01-01T16:00:00.000Z',
        session_id: sessionId,
        severity: 'MINOR',
        summary: 'Small scrape on left knee.',
      },
      url: '/v1/health-incidents',
    });
    const note = await app.inject({
      method: 'POST',
      payload: { note: 'Camper is comfortable.', version: 1 },
      url: `/v1/health-incidents/${incidentId}/notes`,
    });
    const resolved = await app.inject({
      method: 'POST',
      payload: { resolution: 'Returned to activity.', version: 1 },
      url: `/v1/health-incidents/${incidentId}/resolve`,
    });
    const notified = await app.inject({
      method: 'POST',
      payload: {
        guardian_notified_at: '2028-01-01T16:15:00.000Z',
        guardian_notified_to: 'Jordan Winter',
        version: 1,
      },
      url: `/v1/health-incidents/${incidentId}/guardian-notifications`,
    });
    const invalid = await app.inject({
      method: 'POST',
      payload: { note: '', version: 0 },
      url: `/v1/health-incidents/${incidentId}/notes`,
    });

    expect(created.statusCode).toBe(200);
    expect(note.statusCode).toBe(200);
    expect(resolved.statusCode).toBe(200);
    expect(notified.statusCode).toBe(200);
    expect(resolved.json().status).toBe('RESOLVED');
    expect(invalid.statusCode).toBe(400);
    expect(healthIncidentService.addNote).toHaveBeenCalledTimes(1);
    await app.close();
  });
});
