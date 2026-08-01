import { PostgreSqlContainer, type StartedPostgreSqlContainer } from '@testcontainers/postgresql';
import { Pool } from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { createDatabaseClient, type DatabaseClient } from './client.js';
import {
  MedicationAdministrationConflictError,
  MedicationAdministrationStore,
} from './medication-administration-store.js';
import { runMigrations } from './migrate.js';
import { seedWinterFamilies } from './seed.js';

const organizationId = 'a60b272f-b028-4f1a-b666-3ef3cffd9827';
const otherOrganizationId = 'd193b5ee-818c-43e0-969d-26ea651ac38c';
const orderId = '68e095b8-4243-4488-8c72-24d40243774f';
const administrationId = 'f8473162-0078-4ef0-96eb-bdb631a648ea';

describe('medication administration store', () => {
  let container: StartedPostgreSqlContainer;
  let database: DatabaseClient;
  let migrationUrl: string;
  let camperId: string;
  let sessionId: string;

  beforeAll(async () => {
    container = await new PostgreSqlContainer('postgres:17-alpine').start();
    migrationUrl = container.getConnectionUri();
    const admin = new Pool({ connectionString: migrationUrl });
    await admin.query(`CREATE ROLE camp_app LOGIN PASSWORD 'camp-app-test' NOBYPASSRLS`);
    await admin.end();
    await runMigrations(migrationUrl);
    await seedWinterFamilies(migrationUrl);

    const setup = new Pool({ connectionString: migrationUrl });
    const registration = await setup.query<{ camper_id: string; session_id: string }>(
      `SELECT camper_id, session_id
       FROM registrations
       WHERE organization_id = $1 AND status = 'CONFIRMED'
       LIMIT 1`,
      [organizationId],
    );
    camperId = registration.rows[0]!.camper_id;
    sessionId = registration.rows[0]!.session_id;
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

  it('stores medication details only as ciphertext and enforces tenant isolation', async () => {
    const store = new MedicationAdministrationStore(database);
    await store.createOrder(
      {
        actorId: 'medication-user',
        organizationId,
        requestId: 'medication-order-create',
      },
      {
        authentication_tag: Buffer.alloc(16, 8),
        camper_id: camperId,
        encrypted_payload: Buffer.from('opaque-order-ciphertext'),
        encryption_nonce: Buffer.alloc(12, 7),
        ends_on: '2028-01-07',
        id: orderId,
        key_version: 1,
        schedule_type: 'SCHEDULED',
        session_id: sessionId,
        starts_on: '2028-01-01',
      },
    );

    await expect(store.listOrders(otherOrganizationId, '2028-01-01')).resolves.toEqual([]);
    const candidates = await store.listCandidates(organizationId);
    expect(candidates).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ camper_id: camperId, session_id: sessionId }),
      ]),
    );
    const orders = await store.listOrders(organizationId, '2028-01-01');
    expect(orders).toHaveLength(1);

    const admin = new Pool({ connectionString: migrationUrl });
    const persisted = await admin.query<{ ciphertext: string; column_names: string[] }>(
      `SELECT encode(encrypted_payload, 'escape') AS ciphertext,
              ARRAY(
                SELECT column_name
                FROM information_schema.columns
                WHERE table_name = 'camper_medication_orders'
              )::text[] AS column_names
       FROM camper_medication_orders
       WHERE organization_id = $1 AND id = $2`,
      [organizationId, orderId],
    );
    await admin.end();
    expect(persisted.rows[0]!.ciphertext).not.toContain('Example medication');
    expect(persisted.rows[0]!.column_names).not.toContain('medication_name');
    expect(persisted.rows[0]!.column_names).not.toContain('dose');
    expect(persisted.rows[0]!.column_names).not.toContain('instructions');
    expect(persisted.rows[0]!.column_names).not.toContain('administration_times');
  });

  it('prevents duplicate scheduled doses and preserves append-only history', async () => {
    const store = new MedicationAdministrationStore(database);
    const context = {
      actorId: 'medication-user',
      organizationId,
      requestId: 'medication-administration-create',
    };
    const administration = {
      administered_at: '2028-01-01T14:01:00.000Z',
      authentication_tag: Buffer.alloc(16, 6),
      encrypted_payload: Buffer.from('opaque-administration-note'),
      encryption_nonce: Buffer.alloc(12, 5),
      id: administrationId,
      key_version: 1,
      outcome: 'GIVEN' as const,
      scheduled_for: '2028-01-01T14:00:00.000Z',
    };
    await store.recordAdministration(context, orderId, administration);
    await expect(
      store.recordAdministration({ ...context, requestId: 'duplicate-dose' }, orderId, {
        ...administration,
        id: '1c7b270f-8394-47fa-b992-ad627b614793',
      }),
    ).rejects.toBeInstanceOf(MedicationAdministrationConflictError);

    const recorded = await store.listAdministrations(
      organizationId,
      '2028-01-01T06:00:00.000Z',
      '2028-01-02T06:00:00.000Z',
    );
    expect(recorded).toHaveLength(1);
    expect(recorded[0]).toMatchObject({
      id: administrationId,
      order_id: orderId,
      outcome: 'GIVEN',
    });

    await expect(
      store.discontinue({ ...context, requestId: 'stale-discontinue' }, orderId, 2),
    ).rejects.toBeInstanceOf(MedicationAdministrationConflictError);
    await store.discontinue({ ...context, requestId: 'discontinue-order' }, orderId, 1);
    const discontinued = await store.getOrder(organizationId, orderId);
    expect(discontinued).toMatchObject({ status: 'DISCONTINUED', version: 2 });

    const admin = new Pool({ connectionString: migrationUrl });
    const audit = await admin.query<{ action: string; details: Record<string, unknown> }>(
      `SELECT action, details
       FROM audit_events
       WHERE actor_id = 'medication-user'
       ORDER BY occurred_at, id`,
    );
    await admin.end();
    expect(audit.rows.map((row) => row.action)).toEqual([
      'health.medication_order_created',
      'health.medication_administration_recorded',
      'health.medication_order_discontinued',
    ]);
    expect(JSON.stringify(audit.rows)).not.toContain('Example medication');
    expect(JSON.stringify(audit.rows)).not.toContain('opaque-administration-note');
  });
});
