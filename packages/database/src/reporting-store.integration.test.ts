import { PostgreSqlContainer, type StartedPostgreSqlContainer } from '@testcontainers/postgresql';
import { Pool } from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { createDatabaseClient, type DatabaseClient } from './client.js';
import { runMigrations } from './migrate.js';
import { OperationalReportConflictError, ReportingStore } from './reporting-store.js';
import { seedWinterFamilies } from './seed.js';

const organizationId = 'a60b272f-b028-4f1a-b666-3ef3cffd9827';
const otherOrganizationId = 'd193b5ee-818c-43e0-969d-26ea651ac38c';
const sessionId = '58bc426a-eb35-4e17-8f2b-7f2a2adc27ff';
const primarySeasonId = 'fc94ef27-1fa6-466b-b877-312c27d00a7c';
const comparisonSeasonId = 'd5d8a8b7-c4ff-43be-a849-60cbd5914c85';

describe('reporting store', () => {
  let container: StartedPostgreSqlContainer;
  let database: DatabaseClient;
  let migrationUrl: string;

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
    database = createDatabaseClient({ connectionString: runtimeUrl.toString() });
  }, 120_000);

  afterAll(async () => {
    await database.close();
    await container.stop();
  });

  it('returns cross-session operational projections without exposing another tenant', async () => {
    const store = new ReportingStore(database);
    const filters = {
      end_date: null,
      registration_status: 'ALL' as const,
      session_ids: [sessionId],
      start_date: null,
    };

    const rows = await store.listRows(organizationId, filters);
    const otherRows = await store.listRows(otherOrganizationId, filters);

    expect(rows.length).toBeGreaterThan(100);
    expect(rows.every((row) => row.session_id === sessionId)).toBe(true);
    expect(rows[0]).toMatchObject({
      adult_emails: expect.stringContaining('@example.test'),
      form_missing_count: 0,
      session_id: sessionId,
    });
    expect(rows[0]).not.toHaveProperty('accessibility_needs');
    expect(otherRows).toEqual([]);
  });

  it('compares tenant-owned season performance and audits the aggregate read', async () => {
    const admin = new Pool({ connectionString: migrationUrl });
    const registrations = await admin.query<{ family_id: string; id: string; season_id: string }>(
      `SELECT registration.id, registration.family_id, session.season_id
       FROM registrations registration
       JOIN sessions session
         ON session.organization_id = registration.organization_id
        AND session.id = registration.session_id
       WHERE registration.organization_id = $1
         AND registration.status = 'CONFIRMED'
         AND session.season_id = ANY($2::uuid[])
       ORDER BY session.season_id, registration.id`,
      [organizationId, [primarySeasonId, comparisonSeasonId]],
    );
    const primaryRegistration = registrations.rows.find(
      (registration) => registration.season_id === primarySeasonId,
    )!;
    const comparisonRegistration = registrations.rows.find(
      (registration) => registration.season_id === comparisonSeasonId,
    )!;
    await admin.query(
      `INSERT INTO registration_payments (
         id, organization_id, family_id, registration_id, amount_cents, method, recorded_by
       ) VALUES
         ('b6242709-291c-46ba-87ed-9320ab8ae401', $1, $2, $3, 25000, 'OFFLINE_CASH', 'test'),
         ('be2d48b7-4591-4f78-a94b-3206957a6164', $1, $4, $5, 10000, 'OFFLINE_CHECK', 'test')`,
      [
        organizationId,
        primaryRegistration.family_id,
        primaryRegistration.id,
        comparisonRegistration.family_id,
        comparisonRegistration.id,
      ],
    );

    const store = new ReportingStore(database);
    const comparison = await store.compareSeasons(
      {
        actorId: 'season-comparison-integration-user',
        organizationId,
        requestId: 'season-comparison-integration',
      },
      primarySeasonId,
      comparisonSeasonId,
    );
    await expect(store.listSeasonComparisonOptions(otherOrganizationId)).resolves.toEqual([]);
    await expect(store.listSeasonComparisonOptions(organizationId)).resolves.toEqual([
      { id: primarySeasonId, name: 'Winter 2028', year: 2028 },
      { id: comparisonSeasonId, name: 'Summer 2027', year: 2027 },
    ]);
    const primary = comparison.seasons.find((season) => season.season_id === primarySeasonId);
    const baseline = comparison.seasons.find((season) => season.season_id === comparisonSeasonId);

    expect(primary).toMatchObject({
      confirmed_registrations: 100,
      payments_collected_cents: 25000,
      refunds_cents: 0,
      waitlisted_registrations: 32,
    });
    expect(baseline).toMatchObject({ payments_collected_cents: 10000 });
    expect(comparison.returning_campers).toBeGreaterThan(0);

    const audit = await admin.query<{ action: string; details: Record<string, string> }>(
      `SELECT action, details
       FROM audit_events
       WHERE actor_id = 'season-comparison-integration-user'`,
    );
    await admin.end();
    expect(audit.rows).toEqual([
      {
        action: 'report.season_comparison_viewed',
        details: {
          comparison_season_id: comparisonSeasonId,
          primary_season_id: primarySeasonId,
        },
      },
    ]);
  });

  it('persists tenant-owned saved views and audits view and export activity', async () => {
    const store = new ReportingStore(database);
    const context = {
      actorId: 'reporting-integration-user',
      organizationId,
      requestId: 'report-view-create',
    };
    const input = {
      default_format: 'XLSX' as const,
      filters: {
        end_date: '2028-12-31',
        registration_status: 'CONFIRMED' as const,
        session_ids: [sessionId],
        start_date: '2028-01-01',
      },
      name: 'Next season readiness',
      preset: 'READINESS' as const,
    };

    const created = await store.createView(context, input);
    await expect(store.listViews(otherOrganizationId)).resolves.toEqual([]);
    await expect(
      store.updateView({ ...context, requestId: 'stale-report-view-update' }, created.id, {
        ...input,
        name: 'Stale update',
        version: created.version + 1,
      }),
    ).rejects.toBeInstanceOf(OperationalReportConflictError);

    const updated = await store.updateView(
      { ...context, requestId: 'report-view-update' },
      created.id,
      { ...input, name: 'Winter readiness', version: created.version },
    );
    await store.recordExport(
      { ...context, requestId: 'report-export' },
      'READINESS',
      'XLSX',
      input.filters,
      180,
    );
    await store.deleteView({ ...context, requestId: 'report-view-delete' }, created.id);

    expect(updated).toMatchObject({ name: 'Winter readiness', version: 2 });
    await expect(store.listViews(organizationId)).resolves.toEqual([]);

    const admin = new Pool({ connectionString: migrationUrl });
    const audit = await admin.query<{ action: string; details: Record<string, unknown> }>(
      `SELECT action, details
       FROM audit_events
       WHERE actor_id = 'reporting-integration-user'
       ORDER BY occurred_at, id`,
    );
    await admin.end();
    expect(audit.rows.map((row) => row.action)).toEqual([
      'report.view_created',
      'report.view_updated',
      'report.operational_exported',
      'report.view_deleted',
    ]);
    expect(audit.rows[2]?.details).toMatchObject({ format: 'XLSX', row_count: 180 });
  });
});
