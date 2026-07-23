import { randomUUID } from 'node:crypto';

import { PostgreSqlContainer, type StartedPostgreSqlContainer } from '@testcontainers/postgresql';
import { Pool } from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { createDatabaseClient, type DatabaseClient } from './client.js';
import { CommunicationsStore } from './communications-store.js';
import { runMigrations } from './migrate.js';
import { seedWinterFamilies } from './seed.js';

const organizationId = 'a60b272f-b028-4f1a-b666-3ef3cffd9827';

describe('communications store', () => {
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

  it('snapshots, queues, audits, and tenant-scopes an operational campaign', async () => {
    const store = new CommunicationsStore(runtimeDatabase);
    const context = {
      actorId: 'communications-integration-admin',
      organizationId,
      requestId: 'communications-integration-test',
    };
    const templateId = randomUUID();
    const campaignId = randomUUID();
    const created = await store.createTemplate(context, {
      body: 'Hello {{family_name}}, {{camper_name}} has a balance of {{balance_due}}. {{portal_url}}',
      description: 'Outstanding balance follow-up',
      id: templateId,
      name: 'Balance reminder',
      subject: 'Balance reminder for {{camper_name}}',
    });
    const active = await store.setTemplateStatus(context, templateId, created.version, 'ACTIVE');
    expect(active.status).toBe('ACTIVE');

    const recipientSetup = new Pool({ connectionString: migrationUrl });
    const target = await recipientSetup.query<{ session_id: string }>(
      `SELECT session_id FROM registrations
       WHERE organization_id = $1 AND status = 'CONFIRMED'
       ORDER BY registered_at LIMIT 1`,
      [organizationId],
    );
    await recipientSetup.query(
      `UPDATE adults
       SET receives_operational_communication = true
       WHERE organization_id = $1 AND email IS NOT NULL AND (account_owner OR can_register)`,
      [organizationId],
    );
    await recipientSetup.end();

    const audience = {
      audienceType: 'SESSION_CONFIRMED' as const,
      sessionId: target.rows[0]!.session_id,
    };
    const count = await store.countAudience(organizationId, audience);
    expect(count).toBeGreaterThan(0);

    await store.createCampaign(context, {
      ...audience,
      bodySnapshot: active.body,
      id: campaignId,
      name: 'All balances due',
      scheduledFor: new Date(Date.now() - 60_000).toISOString(),
      subjectSnapshot: active.subject,
      templateId,
      templateVersion: active.version,
    });
    await expect(store.processDueCampaigns(organizationId)).resolves.toBe(count);

    const center = await store.getCenter(organizationId);
    expect(center.campaigns[0]).toMatchObject({
      id: campaignId,
      pending_count: count,
      recipient_count: count,
      status: 'QUEUED',
    });
    expect(center.deliveries).toHaveLength(Math.min(count, 100));
    expect(center.deliveries[0]?.recipient_hint).toMatch(/^\*\*\*@/);

    const admin = new Pool({ connectionString: migrationUrl });
    const persisted = await admin.query<{
      action: string;
      body: string;
      subject: string;
    }>(
      `SELECT audit.action,
              outbox.template_data->>'body' AS body,
              outbox.template_data->>'subject' AS subject
       FROM notification_outbox outbox
       JOIN audit_events audit
         ON audit.organization_id = outbox.organization_id
        AND audit.target_id = outbox.communication_campaign_id
        AND audit.action = 'communication.campaign_queued'
       WHERE outbox.organization_id = $1 AND outbox.communication_campaign_id = $2
       LIMIT 1`,
      [organizationId, campaignId],
    );
    await admin.end();
    expect(persisted.rows[0]).toMatchObject({ action: 'communication.campaign_queued' });
    expect(persisted.rows[0]?.body).not.toContain('{{family_name}}');
    expect(persisted.rows[0]?.subject).not.toContain('{{camper_name}}');

    await expect(
      store.countAudience('00000000-0000-0000-0000-000000000000', audience),
    ).resolves.toBe(0);
  });
});
