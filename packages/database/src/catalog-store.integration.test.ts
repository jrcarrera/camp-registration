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

    await expect(store.listSessions(organizationId)).resolves.toHaveLength(9);
    await expect(store.listSessions(otherOrganizationId)).resolves.toEqual([]);

    const direct = await runtimeDatabase.pool.query('SELECT id FROM sessions');
    expect(direct.rows).toEqual([]);
  });

  it('updates a session atomically and records audit metadata', async () => {
    const store = new CatalogStore(runtimeDatabase);
    const original = await store.getSession(organizationId, '28933fbb-470e-4ad6-9a74-600efe4232e3');
    expect(original).not.toBeNull();

    const update = editable(original as SessionDetailRecord);
    update.name = 'Day Camp Opening Week';
    update.capacity = 118;

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
      details: { changed_fields: ['name', 'capacity'] },
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

  it('creates tenant-scoped programs and sessions with audit events', async () => {
    const store = new CatalogStore(runtimeDatabase);
    const programId = '90e02c14-b175-4ca1-93e5-1f6ddf27bd74';
    const sessionId = '19cacb53-2ce9-48d8-a951-664e09d36cd9';
    const context = {
      actorId: 'integration-admin',
      organizationId,
      requestId: 'catalog-create-request',
    };

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
      code: 'TEEN-2027-01',
      deposit_cents: 5000,
      ends_on: '2027-07-09',
      id: sessionId,
      maximum_age: 17,
      minimum_age: 13,
      name: 'Teen Leadership Week 1',
      price_cents: 45000,
      program_id: programId,
      registration_closes_at: '2027-07-01T05:00:00Z',
      registration_opens_at: '2027-01-15T15:00:00Z',
      season_id: 'd5d8a8b7-c4ff-43be-a849-60cbd5914c85',
      starts_on: '2027-07-05',
      status: 'DRAFT',
      waitlist_enabled: true,
    });

    expect(program).toMatchObject({ id: programId, organization_id: organizationId });
    expect(session).toMatchObject({
      id: sessionId,
      organization_id: organizationId,
      program_name: 'Teen Leadership',
      version: 1,
    });
    await expect(store.getSession(otherOrganizationId, sessionId)).resolves.toBeNull();

    const admin = new Pool({ connectionString: migrationUrl });
    const audit = await admin.query<{ action: string }>(
      `SELECT action FROM audit_events WHERE target_id = ANY($1::uuid[]) ORDER BY action`,
      [[programId, sessionId]],
    );
    await admin.end();
    expect(audit.rows).toEqual([{ action: 'program.created' }, { action: 'session.created' }]);
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
    starts_on: session.starts_on,
    status: session.status,
    version: session.version,
    waitlist_enabled: session.waitlist_enabled,
  };
}
