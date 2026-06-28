import { PostgreSqlContainer, type StartedPostgreSqlContainer } from '@testcontainers/postgresql';
import { Pool } from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { CatalogConflictError, CatalogStore, type SessionDetailRecord } from './catalog-store.js';
import { createDatabaseClient, type DatabaseClient } from './client.js';
import { runMigrations } from './migrate.js';
import { seedCatalog } from './seed.js';

const organizationId = 'a60b272f-b028-4f1a-b666-3ef3cffd9827';
const otherOrganizationId = 'd193b5ee-818c-43e0-969d-26ea651ac38c';

describe('catalog store', () => {
  let container: StartedPostgreSqlContainer;
  let runtimeDatabase: DatabaseClient;
  let migrationUrl: string;

  beforeAll(async () => {
    container = await new PostgreSqlContainer('postgres:17-alpine').start();
    migrationUrl = container.getConnectionUri();
    const admin = new Pool({ connectionString: migrationUrl });
    await admin.query(`CREATE ROLE camp_app LOGIN PASSWORD 'camp-app-test' NOBYPASSRLS`);
    await admin.end();

    await runMigrations(migrationUrl);
    await seedCatalog(migrationUrl);

    const runtimeUrl = new URL(migrationUrl);
    runtimeUrl.username = 'camp_app';
    runtimeUrl.password = 'camp-app-test';
    runtimeDatabase = createDatabaseClient({ connectionString: runtimeUrl.toString() });
  });

  afterAll(async () => {
    await runtimeDatabase.close();
    await container.stop();
  });

  it('enforces tenant context for the runtime role', async () => {
    const store = new CatalogStore(runtimeDatabase);

    await expect(store.listSessions(organizationId)).resolves.toHaveLength(10);
    await expect(store.listSessions(otherOrganizationId)).resolves.toEqual([]);

    const direct = await runtimeDatabase.pool.query('SELECT id FROM sessions');
    expect(direct.rows).toEqual([]);
  });

  it('updates a session atomically and records audit metadata', async () => {
    const store = new CatalogStore(runtimeDatabase);
    const original = await store.getSession(organizationId, '28933fbb-470e-4ad6-9a74-600efe4232e3');
    expect(original).not.toBeNull();
    const movedSeason = await store.createSeason(
      {
        actorId: 'integration-admin',
        organizationId,
        requestId: 'catalog-season-move-setup',
      },
      {
        id: 'dfdc71f9-2045-4f67-937e-40b719692315',
        name: 'Summer 2029',
        year: 2029,
      },
    );

    const update = editable(original as SessionDetailRecord);
    update.name = 'Day Camp Opening Week';
    update.capacity = 118;
    update.season_id = movedSeason.id;

    const saved = await store.updateSession({
      actorId: 'integration-admin',
      organizationId,
      requestId: 'catalog-test-request',
      sessionId: original?.id ?? '',
      update,
    });

    expect(saved.name).toBe('Day Camp Opening Week');
    expect(saved.capacity).toBe(118);
    expect(saved.version).toBe((original?.version ?? 0) + 1);

    await expect(
      store.updateSession({
        actorId: 'integration-admin',
        organizationId,
        requestId: 'stale-request',
        sessionId: saved.id,
        update,
      }),
    ).rejects.toBeInstanceOf(CatalogConflictError);

    const admin = new Pool({ connectionString: migrationUrl });
    const audit = await admin.query<{
      action: string;
      actor_id: string;
      details: { changed_fields: string[] };
    }>(
      `SELECT action, actor_id, details
       FROM audit_events
       WHERE organization_id = $1 AND target_id = $2`,
      [organizationId, saved.id],
    );
    await admin.end();

    expect(audit.rows).toHaveLength(1);
    expect(audit.rows[0]).toMatchObject({
      action: 'session.updated',
      actor_id: 'integration-admin',
      details: { changed_fields: ['season_id', 'name', 'capacity'] },
    });
  });

  it('does not overwrite edits when the fixture is seeded again', async () => {
    await seedCatalog(migrationUrl);
    const session = await new CatalogStore(runtimeDatabase).getSession(
      organizationId,
      '28933fbb-470e-4ad6-9a74-600efe4232e3',
    );
    expect(session?.name).toBe('Day Camp Opening Week');
  });

  it('returns active camper registrations while only confirmed registrations consume capacity', async () => {
    const sessionId = '06c02070-2e63-4b7b-bd93-578e54fa1ea6';
    const familyId = '77fb7b7b-fcd7-4144-b45e-fb4a40773b9c';
    const camperId = '8c24be8b-1307-4c65-9793-74a2fc769a12';
    const waitlistedCamperId = 'e702e19c-3da9-426c-8ed7-8a0908128112';
    const registrationId = '20f3a0c5-cad9-4c1d-b77b-b4751805ad83';
    const waitlistedRegistrationId = 'a60e6122-a85a-4aaf-91d4-a45f7c9574f8';
    const admin = new Pool({ connectionString: migrationUrl });

    await admin.query(
      `INSERT INTO families (id, organization_id, family_name)
       VALUES ($1, $2, 'Roster Test Family')`,
      [familyId, organizationId],
    );
    await admin.query(
      `INSERT INTO campers (
         id, organization_id, family_id, first_name, last_name, birth_date,
         preferred_name, gender, school_grade, cabin_preference, accessibility_needs
       ) VALUES ($1, $2, $3, 'Riley', 'Roster', '2010-04-12', null, 'Female', '11', null, null)`,
      [camperId, organizationId, familyId],
    );
    await admin.query(
      `INSERT INTO campers (
         id, organization_id, family_id, first_name, last_name, birth_date,
         preferred_name, gender, school_grade, cabin_preference, accessibility_needs
       ) VALUES ($1, $2, $3, 'Sam', 'Roster', '2010-09-12', null, 'Male', '10', null, null)`,
      [waitlistedCamperId, organizationId, familyId],
    );
    await admin.query(
      `INSERT INTO registrations (
         id, organization_id, session_id, family_id, camper_id, status, registered_at
       ) VALUES ($1, $2, $3, $4, $5, 'CONFIRMED', '2027-01-16T15:00:00Z')`,
      [registrationId, organizationId, sessionId, familyId, camperId],
    );
    await admin.query(
      `INSERT INTO registrations (
         id, organization_id, session_id, family_id, camper_id, status, registered_at
       ) VALUES ($1, $2, $3, $4, $5, 'WAITLISTED', '2027-01-17T15:00:00Z')`,
      [waitlistedRegistrationId, organizationId, sessionId, familyId, waitlistedCamperId],
    );
    await admin.end();

    const store = new CatalogStore(runtimeDatabase);
    const session = await store.getSession(organizationId, sessionId);
    const summary = (await store.listSessions(organizationId)).find(({ id }) => id === sessionId);

    expect(summary).toMatchObject({
      available_count: 139,
      registered_count: 1,
      registered_female_count: 1,
      registered_male_count: 0,
      waitlisted_count: 1,
      waitlisted_female_count: 0,
      waitlisted_male_count: 1,
    });
    expect(session).toMatchObject({
      available_count: 139,
      registered_count: 1,
      registered_female_count: 1,
      registered_male_count: 0,
      registered_campers: [
        expect.objectContaining({
          camper_id: camperId,
          family_id: familyId,
          family_name: 'Roster Test Family',
          gender: 'Female',
          registration_id: registrationId,
          source: 'ADMIN',
          status: 'CONFIRMED',
        }),
        expect.objectContaining({
          camper_id: waitlistedCamperId,
          family_id: familyId,
          family_name: 'Roster Test Family',
          gender: 'Male',
          registration_id: waitlistedRegistrationId,
          source: 'ADMIN',
          status: 'WAITLISTED',
        }),
      ],
      waitlisted_count: 1,
      waitlisted_female_count: 0,
      waitlisted_male_count: 1,
    });
  });

  it('creates tenant-scoped programs and sessions with audit events', async () => {
    const store = new CatalogStore(runtimeDatabase);
    const programId = '90e02c14-b175-4ca1-93e5-1f6ddf27bd74';
    const seasonId = '32e8eca1-6a13-4a3e-86fb-4bedfae8f7fd';
    const sessionId = '19cacb53-2ce9-48d8-a951-664e09d36cd9';
    const context = {
      actorId: 'integration-admin',
      organizationId,
      requestId: 'catalog-create-request',
    };

    const season = await store.createSeason(context, {
      id: seasonId,
      name: 'Summer 2030',
      year: 2030,
    });
    const program = await store.createProgram(context, {
      code: 'TEEN',
      delivery_mode: 'OVERNIGHT',
      description: 'Leadership program for teens.',
      id: programId,
      name: 'Teen Leadership',
    });
    const session = await store.createSession(context, {
      age_as_of: 'SESSION_START',
      capacity: 24,
      code: 'TEEN-2030-01',
      deposit_cents: 5000,
      ends_on: '2030-07-09',
      id: sessionId,
      maximum_age: 17,
      minimum_age: 13,
      name: 'Teen Leadership Week 1',
      price_cents: 45000,
      program_id: programId,
      registration_closes_at: '2030-07-01T05:00:00Z',
      registration_opens_at: '2030-01-15T15:00:00Z',
      season_id: seasonId,
      starts_on: '2030-07-05',
      status: 'DRAFT',
      waitlist_enabled: true,
    });

    expect(season).toMatchObject({ id: seasonId, organization_id: organizationId, year: 2030 });
    expect(program).toMatchObject({ id: programId, organization_id: organizationId });
    expect(session).toMatchObject({
      id: sessionId,
      organization_id: organizationId,
      program_name: 'Teen Leadership',
      season_id: seasonId,
      version: 1,
    });
    await expect(store.getSession(otherOrganizationId, sessionId)).resolves.toBeNull();

    const admin = new Pool({ connectionString: migrationUrl });
    const audit = await admin.query<{ action: string }>(
      `SELECT action FROM audit_events WHERE target_id = ANY($1::uuid[]) ORDER BY action`,
      [[seasonId, programId, sessionId]],
    );
    await admin.end();
    expect(audit.rows).toEqual([
      { action: 'program.created' },
      { action: 'season.created' },
      { action: 'session.created' },
    ]);
  });
});

function editable(session: SessionDetailRecord) {
  return {
    age_as_of: session.age_as_of,
    capacity: session.capacity,
    deposit_cents: session.deposit_cents,
    ends_on: session.ends_on,
    maximum_age: session.maximum_age,
    minimum_age: session.minimum_age,
    name: session.name,
    price_cents: session.price_cents,
    program_id: session.program_id,
    registration_closes_at: session.registration_closes_at,
    registration_opens_at: session.registration_opens_at,
    season_id: session.season_id,
    starts_on: session.starts_on,
    status: session.status,
    version: session.version,
    waitlist_enabled: session.waitlist_enabled,
  };
}
