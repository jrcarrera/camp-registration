import { PostgreSqlContainer, type StartedPostgreSqlContainer } from '@testcontainers/postgresql';
import { Pool } from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { createDatabaseClient, type DatabaseClient } from './client.js';
import { HealthRecordConflictError, HealthRecordStore } from './health-record-store.js';
import { runMigrations } from './migrate.js';
import { seedWinterFamilies } from './seed.js';

const organizationId = 'a60b272f-b028-4f1a-b666-3ef3cffd9827';
const otherOrganizationId = 'd193b5ee-818c-43e0-969d-26ea651ac38c';

describe('health record store', () => {
  let container: StartedPostgreSqlContainer;
  let database: DatabaseClient;
  let migrationUrl: string;
  let camperId: string;
  let parentSubject: string;

  beforeAll(async () => {
    container = await new PostgreSqlContainer('postgres:17-alpine').start();
    migrationUrl = container.getConnectionUri();
    const admin = new Pool({ connectionString: migrationUrl });
    await admin.query(`CREATE ROLE camp_app LOGIN PASSWORD 'camp-app-test' NOBYPASSRLS`);
    await admin.end();
    await runMigrations(migrationUrl);
    await seedWinterFamilies(migrationUrl);

    const setup = new Pool({ connectionString: migrationUrl });
    const linked = await setup.query<{ camper_id: string; identity_subject: string }>(
      `SELECT c.id AS camper_id, a.identity_subject
       FROM campers c
       JOIN adults a ON a.organization_id = c.organization_id AND a.family_id = c.family_id
       WHERE c.organization_id = $1
         AND a.identity_subject IS NOT NULL
         AND (a.account_owner OR a.can_manage_family)
       LIMIT 1`,
      [organizationId],
    );
    camperId = linked.rows[0]!.camper_id;
    parentSubject = linked.rows[0]!.identity_subject;
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

  it('stores only ciphertext, enforces tenant isolation, and resolves parent ownership', async () => {
    const store = new HealthRecordStore(database);
    const saved = await store.upsert(
      {
        actorId: 'health-integration-user',
        organizationId,
        requestId: 'health-save',
      },
      camperId,
      {
        authentication_tag: Buffer.alloc(16, 8),
        encrypted_payload: Buffer.from('opaque-ciphertext-without-health-values'),
        encryption_nonce: Buffer.alloc(12, 7),
        has_accessibility_needs: false,
        has_allergies: true,
        has_dietary_needs: false,
        has_emergency_instructions: true,
        has_medications: true,
        immunization_status: 'CURRENT',
        key_version: 1,
      },
    );

    expect(saved.version).toBe(1);
    await expect(store.listSummaries(otherOrganizationId)).resolves.toEqual([]);
    await expect(
      store.adultIdentityCanManageCamper(organizationId, camperId, parentSubject),
    ).resolves.toBe(true);
    await expect(
      store.adultIdentityCanManageCamper(organizationId, camperId, 'unlinked-parent'),
    ).resolves.toBe(false);

    const admin = new Pool({ connectionString: migrationUrl });
    const persisted = await admin.query<{ ciphertext: string; column_names: string[] }>(
      `SELECT encode(encrypted_payload, 'escape') AS ciphertext,
              ARRAY(
                SELECT column_name
                FROM information_schema.columns
                WHERE table_name = 'camper_health_records'
              )::text[] AS column_names
       FROM camper_health_records
       WHERE organization_id = $1 AND camper_id = $2`,
      [organizationId, camperId],
    );
    await admin.end();
    expect(persisted.rows[0]!.ciphertext).not.toContain('Peanuts');
    expect(persisted.rows[0]!.column_names).not.toContain('allergies');
    expect(persisted.rows[0]!.column_names).not.toContain('medications');
  });

  it('uses optimistic concurrency and appends access audit events', async () => {
    const store = new HealthRecordStore(database);
    const current = await store.getEncrypted(organizationId, camperId);
    expect(current).not.toBeNull();
    await expect(
      store.setReviewState(
        {
          actorId: 'health-integration-user',
          organizationId,
          requestId: 'stale-health-review',
        },
        camperId,
        current!.version + 1,
        'APPROVED',
      ),
    ).rejects.toBeInstanceOf(HealthRecordConflictError);

    await store.recordAudit(
      {
        actorId: 'health-integration-user',
        organizationId,
        requestId: 'health-read',
      },
      'health.record_read',
      camperId,
      'success',
      { access_mode: 'health_staff' },
    );

    const admin = new Pool({ connectionString: migrationUrl });
    const audit = await admin.query<{ action: string; details: Record<string, unknown> }>(
      `SELECT action, details
       FROM audit_events
       WHERE actor_id = 'health-integration-user'
       ORDER BY occurred_at, id`,
    );
    await admin.end();
    expect(audit.rows.map((row) => row.action)).toEqual([
      'health.record_saved',
      'health.record_read',
    ]);
    expect(audit.rows[1]?.details).toEqual({ access_mode: 'health_staff' });
  });
});
