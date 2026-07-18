import { randomUUID } from 'node:crypto';

import { PostgreSqlContainer, type StartedPostgreSqlContainer } from '@testcontainers/postgresql';
import { Pool } from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { createDatabaseClient, type DatabaseClient } from './client.js';
import { FormsStore } from './forms-store.js';
import { runMigrations } from './migrate.js';
import { seedWinterFamilies } from './seed.js';

const organizationId = 'a60b272f-b028-4f1a-b666-3ef3cffd9827';

describe('forms store', () => {
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
    await seedWinterFamilies(migrationUrl);
    const runtimeUrl = new URL(migrationUrl);
    runtimeUrl.username = 'camp_app';
    runtimeUrl.password = 'camp-app-test';
    runtimeDatabase = createDatabaseClient({ connectionString: runtimeUrl.toString() });
  });

  afterAll(async () => {
    await runtimeDatabase.close();
    await container.stop();
  });

  it('publishes an immutable version and records a parent draft and signature', async () => {
    const admin = new Pool({ connectionString: migrationUrl });
    const target = await admin.query<{
      adult_id: string;
      registration_id: string;
      session_id: string;
    }>(
      `SELECT
         a.id AS adult_id,
         r.id AS registration_id,
         r.session_id
       FROM registrations r
       JOIN adults a
         ON a.organization_id = r.organization_id
        AND a.family_id = r.family_id
        AND a.can_manage_family
       WHERE r.organization_id = $1 AND r.status = 'CONFIRMED'
       ORDER BY r.registered_at
       LIMIT 1`,
      [organizationId],
    );
    const row = target.rows[0];
    expect(row).toBeDefined();
    const parentActorId = 'forms-integration-parent';
    await admin.query(
      `UPDATE adults SET identity_subject = $1 WHERE organization_id = $2 AND id = $3`,
      [parentActorId, organizationId, row!.adult_id],
    );
    await admin.end();

    const store = new FormsStore(runtimeDatabase);
    const templateId = randomUUID();
    const versionId = randomUUID();
    const assignmentId = randomUUID();
    const context = {
      actorId: 'integration-admin',
      organizationId,
      requestId: 'forms-integration-test',
    };
    const fields = [
      {
        id: 'policy_ack',
        label: 'I accept the participation policy.',
        options: [],
        required: true,
        type: 'ACKNOWLEDGEMENT' as const,
      },
      {
        id: 'signature',
        label: 'Parent signature',
        options: [],
        required: true,
        type: 'SIGNATURE' as const,
      },
    ];

    const created = await store.createTemplate(context, {
      description: 'Review and sign.',
      fields,
      id: templateId,
      name: 'Participation waiver',
    });
    await store.publishTemplate(context, templateId, created.version, versionId, [
      { dueAt: null, id: assignmentId, sessionId: row!.session_id },
    ]);

    const obligations = await store.listParentObligations(organizationId, parentActorId);
    const required = obligations.find(
      (item) =>
        item.assignment_id === assignmentId && item.registration_id === row!.registration_id,
    );
    expect(required).toMatchObject({
      form_name: 'Participation waiver',
      form_version: 1,
      submission: null,
    });

    const draft = await store.saveParentSubmission(
      { ...context, actorId: parentActorId, requestId: 'forms-draft-test' },
      assignmentId,
      row!.registration_id,
      {
        responses: { policy_ack: true },
        signerName: null,
        status: 'DRAFT',
        version: 0,
      },
    );
    expect(draft).toMatchObject({ status: 'DRAFT', version: 1 });

    const submitted = await store.saveParentSubmission(
      { ...context, actorId: parentActorId, requestId: 'forms-submit-test' },
      assignmentId,
      row!.registration_id,
      {
        responses: { policy_ack: true, signature: 'Jordan Parent' },
        signerName: 'Jordan Parent',
        status: 'SUBMITTED',
        version: 1,
      },
    );
    expect(submitted).toMatchObject({
      signer_name: 'Jordan Parent',
      status: 'SUBMITTED',
      version: 2,
    });
    expect(submitted.submitted_at).not.toBeNull();

    const templates = await store.listTemplates(organizationId);
    expect(templates[0]?.published_versions[0]?.assignments[0]).toMatchObject({
      completed_count: 1,
      id: assignmentId,
      total_count: expect.any(Number),
    });

    const audit = new Pool({ connectionString: migrationUrl });
    const events = await audit.query<{ action: string }>(
      `SELECT action FROM audit_events
       WHERE organization_id = $1
         AND request_id = ANY($2::text[])
       ORDER BY occurred_at, id`,
      [organizationId, ['forms-integration-test', 'forms-draft-test', 'forms-submit-test']],
    );
    await audit.end();
    expect(events.rows.map((event) => event.action)).toContain('form_version.published');
    expect(events.rows.map((event) => event.action)).toContain('form_submission.submitted');
  });
});
