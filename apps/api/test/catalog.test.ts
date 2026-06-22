import type { RequestIdentity } from '@camp-registration/auth';
import type {
  CatalogContext,
  ProgramCreate,
  ProgramFixture,
  SessionCreate,
  SessionDetail,
  SessionSummary,
  SessionUpdate,
} from '@camp-registration/contracts';
import { CatalogConflictError, type CatalogStore } from '@camp-registration/database';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { buildApp } from '../src/app.js';
import { CatalogService, type CatalogServiceApi } from '../src/catalog/service.js';

const organizationId = 'a60b272f-b028-4f1a-b666-3ef3cffd9827';
const sessionId = '28933fbb-470e-4ad6-9a74-600efe4232e3';
const programId = 'c3fd9d60-2a3f-40bc-8d0e-bf6217c8f8f3';
const seasonId = 'd5d8a8b7-c4ff-43be-a849-60cbd5914c85';

const summary: SessionSummary = {
  active_hold_count: 0,
  available_count: 120,
  capacity: 120,
  code: 'DAY-2027-01',
  currency: 'USD',
  ends_on: '2027-06-11',
  id: sessionId,
  name: 'Day Camp Week 1',
  organization_id: organizationId,
  price_cents: 17500,
  program_id: programId,
  program_name: 'Day Camp',
  registered_count: 0,
  season_id: seasonId,
  starts_on: '2027-06-07',
  status: 'PUBLISHED',
  updated_at: '2026-06-21T12:00:00Z',
  version: 1,
};

const detail: SessionDetail = {
  ...summary,
  age_as_of: 'SESSION_START',
  deposit_cents: 2500,
  maximum_age: 11,
  minimum_age: 5,
  organization_timezone: 'America/Chicago',
  registration_closes_at: '2027-06-04T05:00:00Z',
  registration_opens_at: '2027-01-15T15:00:00Z',
  waitlist_enabled: true,
};

const context: CatalogContext = {
  organization: {
    id: organizationId,
    name: 'Test Camp',
    slug: 'test-camp',
    timezone: 'America/Chicago',
  },
  programs: [
    {
      code: 'DAY',
      delivery_mode: 'DAY',
      description: 'Monday-Friday day camp.',
      id: programId,
      name: 'Day Camp',
      organization_id: organizationId,
    },
  ],
  seasons: [
    {
      id: seasonId,
      name: 'Summer 2027',
      organization_id: organizationId,
      year: 2027,
    },
  ],
};

const update: SessionUpdate = {
  age_as_of: 'SESSION_START',
  capacity: 120,
  deposit_cents: 2500,
  ends_on: '2027-06-11',
  maximum_age: 11,
  minimum_age: 5,
  name: 'Day Camp Week 1',
  price_cents: 17500,
  program_id: programId,
  registration_closes_at: '2027-06-04T05:00:00Z',
  registration_opens_at: '2027-01-15T15:00:00Z',
  starts_on: '2027-06-07',
  status: 'PUBLISHED',
  version: 1,
  waitlist_enabled: true,
};

const programCreate: ProgramCreate = {
  code: 'TEEN',
  delivery_mode: 'OVERNIGHT',
  description: 'Leadership program for teens.',
  name: 'Teen Leadership',
};

const createdProgram: ProgramFixture = {
  ...programCreate,
  id: '90e02c14-b175-4ca1-93e5-1f6ddf27bd74',
  organization_id: organizationId,
};

const sessionCreate: SessionCreate = {
  age_as_of: 'SESSION_START',
  capacity: 24,
  code: 'TEEN-2027-01',
  deposit_cents: 5000,
  ends_on: '2027-07-09',
  maximum_age: 17,
  minimum_age: 13,
  name: 'Teen Leadership Week 1',
  price_cents: 45000,
  program_id: programId,
  registration_closes_at: '2027-07-01T05:00:00Z',
  registration_opens_at: '2027-01-15T15:00:00Z',
  season_id: seasonId,
  starts_on: '2027-07-05',
  status: 'DRAFT',
  waitlist_enabled: true,
};

describe('catalog routes', () => {
  const applications: Awaited<ReturnType<typeof buildApp>>[] = [];

  afterEach(async () => {
    await Promise.all(applications.splice(0).map((app) => app.close()));
  });

  it('lists and reads sessions through the documented API', async () => {
    const service = fakeService();
    const app = await buildApp({ catalogService: service });
    applications.push(app);

    const catalogResponse = await app.inject({ method: 'GET', url: '/v1/catalog' });
    const listResponse = await app.inject({ method: 'GET', url: '/v1/sessions' });
    const detailResponse = await app.inject({ method: 'GET', url: `/v1/sessions/${sessionId}` });

    expect(catalogResponse.statusCode).toBe(200);
    expect(catalogResponse.json()).toEqual(context);
    expect(listResponse.statusCode).toBe(200);
    expect(listResponse.json()).toEqual({ sessions: [summary] });
    expect(detailResponse.statusCode).toBe(200);
    expect(detailResponse.json()).toEqual(detail);
  });

  it('updates a session and passes the request id to the service', async () => {
    const service = fakeService();
    const app = await buildApp({ catalogService: service });
    applications.push(app);

    const response = await app.inject({
      headers: { 'x-request-id': 'session-update-test' },
      method: 'PATCH',
      payload: update,
      url: `/v1/sessions/${sessionId}`,
    });

    expect(response.statusCode).toBe(200);
    expect(service.updateSession).toHaveBeenCalledWith(sessionId, update, 'session-update-test');
  });

  it('creates programs and sessions through POST endpoints', async () => {
    const service = fakeService();
    const app = await buildApp({ catalogService: service });
    applications.push(app);

    const programResponse = await app.inject({
      headers: { 'x-request-id': 'program-create-test' },
      method: 'POST',
      payload: programCreate,
      url: '/v1/programs',
    });
    const sessionResponse = await app.inject({
      headers: { 'x-request-id': 'session-create-test' },
      method: 'POST',
      payload: sessionCreate,
      url: '/v1/sessions',
    });

    expect(programResponse.statusCode).toBe(201);
    expect(programResponse.json()).toEqual(createdProgram);
    expect(service.createProgram).toHaveBeenCalledWith(programCreate, 'program-create-test');
    expect(sessionResponse.statusCode).toBe(201);
    expect(service.createSession).toHaveBeenCalledWith(sessionCreate, 'session-create-test');
  });

  it('returns a stable conflict response', async () => {
    const service = fakeService();
    service.updateSession = vi.fn().mockRejectedValue(new CatalogConflictError('Stale version'));
    const app = await buildApp({ catalogService: service });
    applications.push(app);

    const response = await app.inject({
      method: 'PATCH',
      payload: update,
      url: `/v1/sessions/${sessionId}`,
    });

    expect(response.statusCode).toBe(409);
    expect(response.json()).toEqual({ code: 'version_conflict', message: 'Stale version' });
  });
});

describe('catalog service validation', () => {
  it('rejects invalid money and date ranges before persistence', async () => {
    const store = {
      updateSession: vi.fn(),
    } as unknown as CatalogStore;
    const service = new CatalogService(store, localIdentity, organizationId);

    await expect(
      service.updateSession(
        sessionId,
        {
          ...update,
          deposit_cents: 20000,
          ends_on: '2027-06-01',
        },
        'validation-test',
      ),
    ).rejects.toMatchObject({
      fieldErrors: {
        deposit_cents: 'Deposit cannot exceed tuition.',
        ends_on: 'End date must be on or after start date.',
      },
    });
    expect(store.updateSession).not.toHaveBeenCalled();
  });
});

const localIdentity: RequestIdentity = {
  email: 'admin@local.camp.test',
  emailVerified: true,
  memberships: [
    {
      campIds: [],
      organizationId,
      roles: ['organization_admin'],
    },
  ],
  mfaVerified: true,
  subject: 'local-admin',
};

function fakeService(): CatalogServiceApi & {
  createProgram: ReturnType<typeof vi.fn<CatalogServiceApi['createProgram']>>;
  createSession: ReturnType<typeof vi.fn<CatalogServiceApi['createSession']>>;
  updateSession: ReturnType<typeof vi.fn<CatalogServiceApi['updateSession']>>;
} {
  return {
    createProgram: vi.fn().mockResolvedValue(createdProgram),
    createSession: vi.fn().mockResolvedValue({
      ...detail,
      ...sessionCreate,
      available_count: sessionCreate.capacity,
      id: '19cacb53-2ce9-48d8-a951-664e09d36cd9',
      program_name: detail.program_name,
      updated_at: detail.updated_at,
      version: 1,
    }),
    getContext: vi.fn().mockResolvedValue(context),
    getSession: vi.fn().mockResolvedValue(detail),
    listSessions: vi.fn().mockResolvedValue([summary]),
    updateSession: vi.fn().mockResolvedValue({ ...detail, version: 2 }),
  };
}
