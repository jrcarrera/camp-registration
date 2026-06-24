import { PostgreSqlContainer, type StartedPostgreSqlContainer } from '@testcontainers/postgresql';
import { Pool } from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { createDatabaseClient, type DatabaseClient } from './client.js';
import { FamilyConflictError, FamilyStore } from './family-store.js';
import { runMigrations } from './migrate.js';
import { seedCatalog } from './seed.js';

const organizationId = 'a60b272f-b028-4f1a-b666-3ef3cffd9827';
const otherOrganizationId = 'd193b5ee-818c-43e0-969d-26ea651ac38c';

describe('family store', () => {
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
    const store = new FamilyStore(runtimeDatabase);

    await expect(store.listFamilies(organizationId)).resolves.toEqual([]);
    await expect(store.listFamilies(otherOrganizationId)).resolves.toEqual([]);

    const direct = await runtimeDatabase.pool.query('SELECT id FROM families');
    expect(direct.rows).toEqual([]);
  });

  it('creates and updates family records with audit events', async () => {
    const store = new FamilyStore(runtimeDatabase);
    const familyId = '0f6dcf52-c873-44df-a597-9a0a51bf5067';
    const adultId = '0742eb07-e15d-4651-a4d5-64a7782ed447';
    const camperId = '519e28fd-7490-4dc4-a615-dc7569452a3c';
    const contactId = 'aafce65f-6d8a-4b99-a558-9f99d8355881';
    const context = {
      actorId: 'integration-admin',
      organizationId,
      requestId: 'family-create-test',
    };

    const created = await store.createFamily(context, {
      family_name: 'Smith Family',
      id: familyId,
    });
    expect(created).toMatchObject({
      adult_count: 0,
      camper_count: 0,
      contact_count: 0,
      family_name: 'Smith Family',
      id: familyId,
      organization_id: organizationId,
      version: 1,
    });

    const withAdult = await store.createAdult(context, {
      account_owner: true,
      authorized_pickup: true,
      can_make_payments: true,
      can_manage_family: true,
      can_register: true,
      email: 'parent@example.test',
      email_normalized: 'parent@example.test',
      emergency_contact: true,
      family_id: familyId,
      first_name: 'Jordan',
      id: adultId,
      identity_subject: null,
      last_name: 'Smith',
      phone: '555-0100',
      receives_operational_communication: true,
    });
    expect(withAdult.adults).toHaveLength(1);
    expect(withAdult.adult_count).toBe(1);
    expect(withAdult.adults[0]).toMatchObject({
      account_owner: true,
      email: 'parent@example.test',
      identity_subject: null,
    });

    const withCamper = await store.createCamper(context, {
      accessibility_needs: null,
      birth_date: '2017-03-08',
      cabin_preference: null,
      family_id: familyId,
      first_name: 'Avery',
      gender: 'Female',
      id: camperId,
      last_name: 'Smith',
      preferred_name: null,
      school_grade: '4',
    });
    expect(withCamper.campers[0]).toMatchObject({
      birth_date: '2017-03-08',
      first_name: 'Avery',
    });
    expect(withCamper.campers[0]).not.toHaveProperty('medical_notes');

    const withContact = await store.createContact(context, {
      authorized_pickup: true,
      emergency_contact: true,
      emergency_priority: 1,
      family_id: familyId,
      first_name: 'Taylor',
      id: contactId,
      last_name: 'Jones',
      phone: '555-0199',
      receives_operational_communication: false,
      relationship: 'Aunt',
    });
    expect(withContact.contact_count).toBe(1);

    const renamed = await store.updateFamily({
      ...context,
      familyId,
      requestId: 'family-update-test',
      update: { family_name: 'Smith-Jones Family', version: created.version },
    });
    expect(renamed.family_name).toBe('Smith-Jones Family');
    expect(renamed.version).toBe(2);

    await expect(
      store.updateFamily({
        ...context,
        familyId,
        requestId: 'stale-family-update-test',
        update: { family_name: 'Stale Family', version: created.version },
      }),
    ).rejects.toBeInstanceOf(FamilyConflictError);

    await expect(store.getFamily(otherOrganizationId, familyId)).resolves.toBeNull();

    const admin = new Pool({ connectionString: migrationUrl });
    const audit = await admin.query<{ action: string; details: { changed_fields?: string[] } }>(
      `SELECT action, details
       FROM audit_events
       WHERE organization_id = $1 AND target_id = ANY($2::uuid[])
       ORDER BY id`,
      [organizationId, [familyId, adultId, camperId, contactId]],
    );
    await admin.end();

    expect(audit.rows).toEqual([
      { action: 'family.created', details: {} },
      { action: 'adult.created', details: { account_owner: true } },
      { action: 'camper.created', details: {} },
      {
        action: 'contact.created',
        details: { authorized_pickup: true, emergency_contact: true },
      },
      { action: 'family.updated', details: { changed_fields: ['family_name'] } },
    ]);
  });
});
