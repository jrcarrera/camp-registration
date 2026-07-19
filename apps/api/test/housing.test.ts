import type { HousingServiceApi } from '../src/housing/service.js';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { buildApp } from '../src/app.js';

const sessionId = 'a123e456-e89b-42d3-a456-426614174000';
const buildingId = 'b123e456-e89b-42d3-a456-426614174000';
const emptySession = { buildings: [], campers: [], session_id: sessionId, warnings: [] };

function service(): HousingServiceApi {
  return {
    assign: vi.fn(async () => emptySession),
    autoAssign: vi.fn(async () => emptySession),
    configureSessionBuilding: vi.fn(async () => emptySession),
    createBed: vi.fn(),
    createBuilding: vi.fn(async () => ({
      active: true,
      beds: [],
      code: 'NORTH',
      description: null,
      id: buildingId,
      name: 'North Cabin',
      version: 1,
    })),
    getSession: vi.fn(async () => emptySession),
    listInventory: vi.fn(async () => ({ buildings: [] })),
    unassign: vi.fn(async () => emptySession),
    updateBed: vi.fn(),
    updateBuilding: vi.fn(),
  };
}

describe('housing routes', () => {
  const apps: Array<Awaited<ReturnType<typeof buildApp>>> = [];
  afterEach(async () => Promise.all(apps.splice(0).map((app) => app.close())));

  it('creates buildings and returns session housing', async () => {
    const housingService = service();
    const app = await buildApp({ housingService });
    apps.push(app);
    const created = await app.inject({
      method: 'POST',
      payload: { active: true, code: 'north', description: null, name: 'North Cabin' },
      url: '/v1/housing/buildings',
    });
    expect(created.statusCode).toBe(201);
    expect(created.json().code).toBe('NORTH');
    const session = await app.inject({ method: 'GET', url: `/v1/sessions/${sessionId}/housing` });
    expect(session.statusCode).toBe(200);
    expect(session.json()).toEqual(emptySession);
  });

  it('rejects malformed automatic assignment requests before the service', async () => {
    const housingService = service();
    const app = await buildApp({ housingService });
    apps.push(app);
    const response = await app.inject({
      method: 'POST',
      payload: { strategy: 'RANDOM' },
      url: `/v1/sessions/${sessionId}/housing/auto-assign`,
    });
    expect(response.statusCode).toBe(400);
    expect(housingService.autoAssign).not.toHaveBeenCalled();
  });
});
