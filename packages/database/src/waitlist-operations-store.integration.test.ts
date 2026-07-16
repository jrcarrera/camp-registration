import { PostgreSqlContainer, type StartedPostgreSqlContainer } from '@testcontainers/postgresql';
import { Pool } from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { createDatabaseClient, type DatabaseClient } from './client.js';
import { runMigrations } from './migrate.js';
import { seedCatalog } from './seed.js';
import { WaitlistOperationsStore } from './waitlist-operations-store.js';

const organizationId = 'a60b272f-b028-4f1a-b666-3ef3cffd9827';
const otherOrganizationId = 'd193b5ee-818c-43e0-969d-26ea651ac38c';

describe('waitlist operations store', () => {
  let container: StartedPostgreSqlContainer;
  let migrationUrl: string;
  let runtimeDatabase: DatabaseClient;

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

  it('discovers enabled tenants while keeping status records tenant-scoped', async () => {
    const admin = new Pool({ connectionString: migrationUrl });
    await admin.query(
      `INSERT INTO organizations (id, slug, name, timezone)
       VALUES ($1, 'second-camp', 'Second Camp', 'America/Denver')`,
      [otherOrganizationId],
    );
    await admin.end();
    const store = new WaitlistOperationsStore(runtimeDatabase);

    await expect(store.listEnabledOrganizationIds()).resolves.toEqual([
      organizationId,
      otherOrganizationId,
    ]);

    await store.recordCycleStarted(organizationId, 'worker:test');
    await store.recordCycleCompleted(
      organizationId,
      'worker:test',
      {
        delivered_count: 2,
        delivery_failure_count: 0,
        expired_offer_count: 1,
        offers_created_count: 1,
        reminders_queued_count: 1,
        sessions_scanned_count: 3,
      },
      null,
    );

    await expect(store.getStatus(organizationId, 300)).resolves.toMatchObject({
      delivered_count: 2,
      health: 'HEALTHY',
      last_completed_at: expect.any(String),
    });
    await expect(store.getStatus(otherOrganizationId, 300)).resolves.toMatchObject({
      health: 'NOT_RUNNING',
      last_completed_at: null,
    });

    await store.recordCycleStarted(organizationId, 'worker:test');
    await store.recordCycleCompleted(
      organizationId,
      'worker:test',
      {
        delivered_count: 0,
        delivery_failure_count: 0,
        expired_offer_count: 0,
        offers_created_count: 0,
        reminders_queued_count: 0,
        sessions_scanned_count: 0,
      },
      'waitlist_automation_failed',
    );
    await expect(store.getStatus(organizationId, 300)).resolves.toMatchObject({
      consecutive_failures: 1,
      health: 'DEGRADED',
      last_error_code: 'waitlist_automation_failed',
    });

    await expect(
      runtimeDatabase.pool.query('SELECT * FROM waitlist_worker_status'),
    ).resolves.toMatchObject({ rows: [] });
  });

  it('excludes organizations where waitlist automation is disabled', async () => {
    const admin = new Pool({ connectionString: migrationUrl });
    await admin.query(
      'UPDATE organizations SET waitlist_automation_enabled = false WHERE id = $1',
      [otherOrganizationId],
    );
    await admin.end();
    const store = new WaitlistOperationsStore(runtimeDatabase);

    await expect(store.listEnabledOrganizationIds()).resolves.toEqual([organizationId]);
  });
});
