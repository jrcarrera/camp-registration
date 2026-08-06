import type { SessionWorkforceRoster, WorkforceProfileDetail } from '@camp-registration/contracts';
import { describe, expect, it, vi } from 'vitest';

import { buildApp } from '../src/app.js';
import type { WorkforceServiceApi } from '../src/workforce/service.js';

const profileId = '291622b0-9265-46a5-8dba-e2618e9fe9cf';
const sessionId = 'b30f1e1d-8de2-4d7b-ac3b-ae4e21d4bb41';
const detail: WorkforceProfileDetail = {
  account_linked: false,
  assignment_count: 0,
  assignments: [],
  current_session_names: [],
  display_name: 'Morgan Lee',
  email: 'morgan@example.test',
  first_name: 'Morgan',
  id: profileId,
  last_name: 'Lee',
  next_session_names: [],
  phone: null,
  preferred_name: null,
  status: 'ACTIVE',
  version: 1,
  workforce_type: 'STAFF',
};
const roster: SessionWorkforceRoster = {
  assignments: [
    {
      display_name: 'Morgan Lee',
      ends_on: '2027-06-11',
      position_name: 'Counselor',
      starts_on: '2027-06-07',
      status: 'CONFIRMED',
      workforce_type: 'STAFF',
    },
  ],
  ends_on: '2027-06-11',
  session_id: sessionId,
  session_name: 'Opening Week',
  starts_on: '2027-06-07',
};
function service(): WorkforceServiceApi {
  return {
    createAssignment: vi.fn(async () => detail),
    createProfile: vi.fn(async () => detail),
    getProfile: vi.fn(async () => detail),
    getSessionRoster: vi.fn(async () => roster),
    linkAccount: vi.fn(async () => detail),
    listProfiles: vi.fn(async () => ({
      page: 1,
      page_size: 50,
      profiles: [
        {
          ...detail,
          email: undefined as never,
          phone: undefined as never,
          account_linked: undefined as never,
        },
      ],
      summary: { active_staff: 1, active_volunteers: 0, unassigned_active: 1 },
      total: 1,
    })),
    updateAssignment: vi.fn(async () => detail),
    updateProfile: vi.fn(async () => detail),
  };
}
describe('workforce routes', () => {
  it('keeps administrator and staff roster responses private and validates commands', async () => {
    const workforceService = service();
    const app = await buildApp({ workforceService });
    const list = await app.inject({ method: 'GET', url: '/v1/workforce?page=1&page_size=50' });
    const rosterResponse = await app.inject({
      method: 'GET',
      url: `/v1/sessions/${sessionId}/workforce-roster`,
    });
    const invalid = await app.inject({
      method: 'POST',
      url: '/v1/workforce',
      payload: {
        email: 'morgan@example.test',
        first_name: 'Morgan',
        last_name: 'Lee',
        status: 'UNKNOWN',
        workforce_type: 'STAFF',
      },
    });
    const invalidProfileId = await app.inject({
      method: 'GET',
      url: '/v1/workforce/not-a-uuid',
    });
    const invalidRosterId = await app.inject({
      method: 'GET',
      url: '/v1/sessions/not-a-uuid/workforce-roster',
    });
    expect(list.statusCode).toBe(200);
    expect(list.headers['cache-control']).toBe('private, no-store');
    expect(rosterResponse.statusCode).toBe(200);
    expect(rosterResponse.headers['cache-control']).toBe('private, no-store');
    expect(rosterResponse.json().assignments[0]).not.toHaveProperty('email');
    expect(invalid.statusCode).toBe(400);
    expect(invalid.headers['cache-control']).toBe('private, no-store');
    expect(invalid.json()).toMatchObject({ code: 'invalid_workforce' });
    expect(invalidProfileId.statusCode).toBe(400);
    expect(invalidProfileId.headers['cache-control']).toBe('private, no-store');
    expect(invalidProfileId.json()).toMatchObject({ code: 'invalid_workforce' });
    expect(invalidRosterId.statusCode).toBe(400);
    expect(invalidRosterId.headers['cache-control']).toBe('private, no-store');
    expect(invalidRosterId.json()).toMatchObject({ code: 'invalid_workforce' });
    await app.close();
  });
});
