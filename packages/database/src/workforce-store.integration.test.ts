import { PostgreSqlContainer, type StartedPostgreSqlContainer } from '@testcontainers/postgresql';
import { Pool } from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { createDatabaseClient, type DatabaseClient } from './client.js';
import {
  WorkforceConflictError,
  WorkforceStore,
  WorkforceValidationError,
} from './workforce-store.js';
import { runMigrations } from './migrate.js';
import { seedWinterFamilies } from './seed.js';

const organizationId = 'a60b272f-b028-4f1a-b666-3ef3cffd9827';
const otherOrganizationId = 'd193b5ee-818c-43e0-969d-26ea651ac38c';
const profileId = '68e095b8-4243-4488-8c72-24d40243774f';
const inactiveProfileId = 'f8473162-0078-4ef0-96eb-bdb631a648ea';
const assignmentId = '314b4f78-3ca2-420a-b2ad-53701e4b49b4';

describe('workforce store', () => {
  let container: StartedPostgreSqlContainer;
  let database: DatabaseClient;
  let migrationUrl: string;
  let session: { ends_on: string; id: string; starts_on: string };

  const context = (requestId: string) => ({
    actorId: 'workforce-test-admin',
    organizationId,
    requestId,
  });

  beforeAll(async () => {
    container = await new PostgreSqlContainer('postgres:17-alpine').start();
    migrationUrl = container.getConnectionUri();
    const admin = new Pool({ connectionString: migrationUrl });
    await admin.query(`CREATE ROLE camp_app LOGIN PASSWORD 'camp-app-test' NOBYPASSRLS`);
    await admin.end();
    await runMigrations(migrationUrl);
    await seedWinterFamilies(migrationUrl);

    const setup = new Pool({ connectionString: migrationUrl });
    const result = await setup.query<{ ends_on: Date; id: string; starts_on: Date }>(
      `SELECT id, starts_on, ends_on FROM sessions WHERE organization_id=$1 ORDER BY starts_on LIMIT 1`,
      [organizationId],
    );
    session = {
      ends_on: result.rows[0]!.ends_on.toISOString().slice(0, 10),
      id: result.rows[0]!.id,
      starts_on: result.rows[0]!.starts_on.toISOString().slice(0, 10),
    };
    await setup.end();

    const runtimeUrl = new URL(migrationUrl);
    runtimeUrl.username = 'camp_app';
    runtimeUrl.password = 'camp-app-test';
    database = createDatabaseClient({ connectionString: runtimeUrl.toString() });
  }, 120_000);

  afterAll(async () => {
    await database.close();
    await container.stop();
  });

  it('enforces tenant isolation, normalized-email uniqueness, and safe audits', async () => {
    const store = new WorkforceStore(database);
    await store.create(context('create-profile'), {
      email: 'Morgan.Lee@example.test',
      first_name: 'Morgan',
      id: profileId,
      last_name: 'Lee',
      phone: '555-0100',
      preferred_name: null,
      status: 'ACTIVE',
      workforce_type: 'STAFF',
    });
    expect(await store.get(otherOrganizationId, profileId)).toBeNull();
    await expect(
      store.create(context('duplicate-email'), {
        email: 'morgan.lee@example.test',
        first_name: 'Duplicate',
        id: '1c7b270f-8394-47fa-b992-ad627b614793',
        last_name: 'Profile',
        phone: null,
        preferred_name: null,
        status: 'ACTIVE',
        workforce_type: 'VOLUNTEER',
      }),
    ).rejects.toBeInstanceOf(WorkforceConflictError);

    const admin = new Pool({ connectionString: migrationUrl });
    const persisted = await admin.query<{
      details: Record<string, unknown>;
      email_normalized: string;
    }>(
      `SELECT email_normalized, details FROM workforce_profiles
       JOIN audit_events ON audit_events.target_id=workforce_profiles.id
       WHERE workforce_profiles.id=$1`,
      [profileId],
    );
    await admin.end();
    expect(persisted.rows[0]!.email_normalized).toBe('morgan.lee@example.test');
    expect(JSON.stringify(persisted.rows[0]!.details)).not.toContain('Morgan');
    expect(JSON.stringify(persisted.rows[0]!.details)).not.toContain('555-0100');

    const identityAdmin = new Pool({ connectionString: migrationUrl });
    await identityAdmin.query(
      `INSERT INTO user_accounts (id, primary_email, email_normalized, email_verified)
       VALUES ('workforce-linked-account', 'Morgan.Lee@example.test', 'morgan.lee@example.test', true)`,
    );
    await identityAdmin.query(
      `INSERT INTO organization_memberships (id, organization_id, account_id, roles, status)
       VALUES ('68e095b8-4243-4488-8c72-24d40243774e', $1, 'workforce-linked-account', ARRAY['camp_staff'], 'ACTIVE')`,
      [organizationId],
    );
    await identityAdmin.end();
    await store.linkAccount(context('link-account'), profileId, 1);
    expect(await store.get(organizationId, profileId)).toMatchObject({
      account_linked: true,
      version: 2,
    });
  });

  it('enforces assignment lifecycle/date/version rules without deletes', async () => {
    const store = new WorkforceStore(database);
    await store.createAssignment(context('create-assignment'), profileId, {
      ends_on: session.ends_on,
      id: assignmentId,
      position_name: 'Counselor',
      session_id: session.id,
      starts_on: session.starts_on,
      status: 'CONFIRMED',
    });
    await expect(
      store.createAssignment(context('duplicate-assignment'), profileId, {
        ends_on: session.ends_on,
        id: '9089074f-181a-48d7-bb33-d58547283bbd',
        position_name: 'Counselor',
        session_id: session.id,
        starts_on: session.starts_on,
        status: 'CONFIRMED',
      }),
    ).rejects.toBeInstanceOf(WorkforceConflictError);
    await expect(
      store.updateAssignment(context('stale-assignment'), profileId, assignmentId, 2, {
        ends_on: session.ends_on,
        position_name: 'Counselor',
        session_id: session.id,
        starts_on: session.starts_on,
        status: 'CANCELLED',
      }),
    ).rejects.toBeInstanceOf(WorkforceConflictError);
    await store.updateAssignment(context('cancel-assignment'), profileId, assignmentId, 1, {
      ends_on: session.ends_on,
      position_name: 'Counselor',
      session_id: session.id,
      starts_on: session.starts_on,
      status: 'CANCELLED',
    });
    expect((await store.get(organizationId, profileId))?.assignments[0]).toMatchObject({
      status: 'CANCELLED',
      version: 2,
    });

    await store.create(context('inactive-profile'), {
      email: 'inactive@example.test',
      first_name: 'Inactive',
      id: inactiveProfileId,
      last_name: 'Person',
      phone: null,
      preferred_name: null,
      status: 'INACTIVE',
      workforce_type: 'STAFF',
    });
    await expect(
      store.createAssignment(context('inactive-assignment'), inactiveProfileId, {
        ends_on: session.ends_on,
        id: 'cf9104af-baa2-49f8-9289-e3bb0aa61103',
        position_name: 'Counselor',
        session_id: session.id,
        starts_on: session.starts_on,
        status: 'PLANNED',
      }),
    ).rejects.toBeInstanceOf(WorkforceValidationError);
  });

  it('forces RLS and grants the runtime role no delete capability', async () => {
    const admin = new Pool({ connectionString: migrationUrl });
    const result = await admin.query<{
      force_row_security: boolean;
      has_delete: boolean;
      relrowsecurity: boolean;
    }>(
      `SELECT c.relrowsecurity, c.relforcerowsecurity AS force_row_security,
              has_table_privilege('camp_app', c.oid, 'DELETE') AS has_delete
       FROM pg_class c WHERE c.relname='workforce_profiles'`,
    );
    const indexes = await admin.query<{ indexdef: string }>(
      `SELECT indexdef FROM pg_indexes WHERE tablename='workforce_profiles'`,
    );
    await admin.end();
    expect(result.rows[0]).toEqual({
      force_row_security: true,
      has_delete: false,
      relrowsecurity: true,
    });
    expect(indexes.rows.map((row) => row.indexdef).join('\n')).toContain(
      'WHERE (account_id IS NOT NULL)',
    );
  });
});
