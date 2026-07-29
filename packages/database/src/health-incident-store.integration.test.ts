import { PostgreSqlContainer, type StartedPostgreSqlContainer } from '@testcontainers/postgresql';
import { Pool } from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { createDatabaseClient, type DatabaseClient } from './client.js';
import { HealthIncidentConflictError, HealthIncidentStore } from './health-incident-store.js';
import { runMigrations } from './migrate.js';
import { seedWinterFamilies } from './seed.js';

const organizationId = 'a60b272f-b028-4f1a-b666-3ef3cffd9827';
const otherOrganizationId = 'd193b5ee-818c-43e0-969d-26ea651ac38c';
const incidentId = '68e095b8-4243-4488-8c72-24d40243774f';

describe('health incident store', () => {
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

  it('stores narrative fields only as ciphertext and enforces tenant isolation', async () => {
    const store = new HealthIncidentStore(database);
    await store.create(
      {
        actorId: 'health-incident-user',
        organizationId,
        requestId: 'incident-create',
      },
      {
        authentication_tag: Buffer.alloc(16, 8),
        camper_id: camperId,
        encrypted_payload: Buffer.from('opaque-ciphertext-without-narrative'),
        encryption_nonce: Buffer.alloc(12, 7),
        guardian_notification_status: 'PENDING',
        id: incidentId,
        incident_type: 'INJURY',
        key_version: 1,
        occurred_at: '2028-01-01T16:00:00.000Z',
        session_id: sessionId,
        severity: 'MINOR',
      },
    );

    await expect(store.listIncidents(otherOrganizationId)).resolves.toEqual([]);
    const candidates = await store.listCandidates(organizationId);
    await expect(store.getOrganizationTimezone(organizationId)).resolves.toBe('America/Chicago');
    expect(candidates).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ camper_id: camperId, session_id: sessionId }),
      ]),
    );
    const listed = await store.listIncidents(organizationId);
    expect(listed).toHaveLength(1);
    expect(listed[0]).not.toHaveProperty('encrypted_payload');

    const admin = new Pool({ connectionString: migrationUrl });
    const persisted = await admin.query<{ ciphertext: string; column_names: string[] }>(
      `SELECT encode(encrypted_payload, 'escape') AS ciphertext,
              ARRAY(
                SELECT column_name
                FROM information_schema.columns
                WHERE table_name = 'camper_health_incidents'
              )::text[] AS column_names
       FROM camper_health_incidents
       WHERE organization_id = $1 AND id = $2`,
      [organizationId, incidentId],
    );
    await admin.end();
    expect(persisted.rows[0]!.ciphertext).not.toContain('Small scrape');
    expect(persisted.rows[0]!.column_names).not.toContain('summary');
    expect(persisted.rows[0]!.column_names).not.toContain('care_given');
    expect(persisted.rows[0]!.column_names).not.toContain('location');
  });

  it('appends immutable entries, resolves atomically, and rejects stale versions', async () => {
    const store = new HealthIncidentStore(database);
    await store.appendEntry(
      {
        actorId: 'health-incident-user',
        organizationId,
        requestId: 'incident-follow-up',
      },
      incidentId,
      1,
      {
        authentication_tag: Buffer.alloc(16, 6),
        encrypted_payload: Buffer.from('opaque-follow-up'),
        encryption_nonce: Buffer.alloc(12, 5),
        id: 'f8473162-0078-4ef0-96eb-bdb631a648ea',
        key_version: 1,
      },
    );
    await expect(
      store.resolve(
        {
          actorId: 'health-incident-user',
          organizationId,
          requestId: 'stale-incident-resolution',
        },
        incidentId,
        1,
        {
          authentication_tag: Buffer.alloc(16, 4),
          encrypted_payload: Buffer.from('opaque-resolution'),
          encryption_nonce: Buffer.alloc(12, 3),
          id: '314b4f78-3ca2-420a-b2ad-53701e4b49b4',
          key_version: 1,
        },
      ),
    ).rejects.toBeInstanceOf(HealthIncidentConflictError);

    await store.recordGuardianNotification(
      {
        actorId: 'health-incident-user',
        organizationId,
        requestId: 'incident-guardian-notification',
      },
      incidentId,
      2,
      {
        authentication_tag: Buffer.alloc(16, 2),
        encrypted_payload: Buffer.from('opaque-guardian-notification'),
        encryption_nonce: Buffer.alloc(12, 1),
        id: '1c7b270f-8394-47fa-b992-ad627b614793',
        key_version: 1,
      },
    );

    await store.resolve(
      {
        actorId: 'health-incident-user',
        organizationId,
        requestId: 'incident-resolution',
      },
      incidentId,
      3,
      {
        authentication_tag: Buffer.alloc(16, 4),
        encrypted_payload: Buffer.from('opaque-resolution'),
        encryption_nonce: Buffer.alloc(12, 3),
        id: '314b4f78-3ca2-420a-b2ad-53701e4b49b4',
        key_version: 1,
      },
    );

    const loaded = await store.getIncident(organizationId, incidentId);
    expect(loaded?.incident.status).toBe('RESOLVED');
    expect(loaded?.incident.version).toBe(4);
    expect(loaded?.incident.guardian_notification_status).toBe('NOTIFIED');
    expect(loaded?.entries.map((entry) => entry.entry_type)).toEqual([
      'FOLLOW_UP',
      'GUARDIAN_NOTIFICATION',
      'RESOLUTION',
    ]);

    const admin = new Pool({ connectionString: migrationUrl });
    const audit = await admin.query<{ action: string; details: Record<string, unknown> }>(
      `SELECT action, details
       FROM audit_events
       WHERE actor_id = 'health-incident-user'
       ORDER BY occurred_at, id`,
    );
    await admin.end();
    expect(audit.rows.map((row) => row.action)).toEqual([
      'health.incident_created',
      'health.incident_note_added',
      'health.incident_guardian_notified',
      'health.incident_resolved',
    ]);
  });
});
