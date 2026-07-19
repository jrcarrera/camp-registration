import { PostgreSqlContainer, type StartedPostgreSqlContainer } from '@testcontainers/postgresql';
import { Pool } from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { createDatabaseClient, type DatabaseClient } from './client.js';
import { HousingStore } from './housing-store.js';
import { runMigrations } from './migrate.js';
import { seedCatalog } from './seed.js';

const organizationId = 'a60b272f-b028-4f1a-b666-3ef3cffd9827';
const sessionId = '28933fbb-470e-4ad6-9a74-600efe4232e3';
const familyId = '31ee7ba0-5a25-4edf-9222-e68399280386';
const camperOneId = '41ee7ba0-5a25-4edf-9222-e68399280386';
const camperTwoId = '51ee7ba0-5a25-4edf-9222-e68399280386';
const registrationOneId = '61ee7ba0-5a25-4edf-9222-e68399280386';
const registrationTwoId = '71ee7ba0-5a25-4edf-9222-e68399280386';

describe('camper housing', () => {
  let container: StartedPostgreSqlContainer;
  let database: DatabaseClient;
  let runtimeUrl: string;
  const context = { actorId: 'housing-admin', organizationId, requestId: 'housing-test' };

  beforeAll(async () => {
    container = await new PostgreSqlContainer('postgres:17-alpine').start();
    const migrationUrl = container.getConnectionUri();
    const admin = new Pool({ connectionString: migrationUrl });
    await admin.query(`CREATE ROLE camp_app LOGIN PASSWORD 'camp-app-test' NOBYPASSRLS`);
    await admin.end();
    await runMigrations(migrationUrl);
    await seedCatalog(migrationUrl);
    const setup = new Pool({ connectionString: migrationUrl });
    await setup.query(
      `INSERT INTO families (id,organization_id,family_name) VALUES ($1,$2,'Housing Family')`,
      [familyId, organizationId],
    );
    await setup.query(
      `INSERT INTO campers (id,organization_id,family_id,first_name,last_name,birth_date)
       VALUES ($3,$2,$1,'Alex','Camper','2017-03-10'),($4,$2,$1,'Bailey','Camper','2017-04-10')`,
      [familyId, organizationId, camperOneId, camperTwoId],
    );
    await setup.query(
      `INSERT INTO registrations (
         id,organization_id,session_id,family_id,camper_id,status,source,currency,
         price_cents,deposit_cents,bunk_buddy_names
       ) VALUES ($4,$2,$6,$1,$3,'CONFIRMED','PARENT','USD',10000,1000,ARRAY['Bailey Camper']),
                ($5,$2,$6,$1,$7,'CONFIRMED','PARENT','USD',10000,1000,ARRAY['Alex Camper'])`,
      [
        familyId,
        organizationId,
        camperOneId,
        registrationOneId,
        registrationTwoId,
        sessionId,
        camperTwoId,
      ],
    );
    await setup.end();
    const url = new URL(migrationUrl);
    url.username = 'camp_app';
    url.password = 'camp-app-test';
    runtimeUrl = url.toString();
    database = createDatabaseClient({ connectionString: runtimeUrl });
  }, 120_000);

  afterAll(async () => {
    await database?.close();
    await container?.stop();
  });

  it('keeps housing tables hidden without a tenant context', async () => {
    const pool = new Pool({ connectionString: runtimeUrl });
    for (const table of [
      'housing_buildings',
      'housing_beds',
      'session_housing_buildings',
      'housing_assignments',
    ]) {
      const result = await pool.query(`SELECT count(*)::integer AS count FROM ${table}`);
      expect(result.rows[0].count).toBe(0);
    }
    await pool.end();
  });

  it('creates inventory and keeps buddy campers together during balanced assignment', async () => {
    const store = new HousingStore(database);
    const north = await store.createBuilding(context, { code: 'NORTH', name: 'North Cabin' });
    const south = await store.createBuilding(context, { code: 'SOUTH', name: 'South Cabin' });
    for (const building of [north, south]) {
      await store.createBed(context, building.id, { name: 'Bed 1' });
      await store.createBed(context, building.id, { name: 'Bed 2' });
      await store.configureSessionBuilding(context, sessionId, building.id, { status: 'OPEN' });
    }
    const result = await store.autoAssign(context, sessionId, 'BALANCED');
    expect(result.campers.every((camper) => camper.assignment_id)).toBe(true);
    expect(new Set(result.campers.map((camper) => camper.building_id)).size).toBe(1);
    expect(result.warnings).toEqual([]);
  });
});
