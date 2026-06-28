import { PostgreSqlContainer, type StartedPostgreSqlContainer } from '@testcontainers/postgresql';
import { Pool } from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { createDatabaseClient, type DatabaseClient } from './client.js';
import {
  FamilyConflictError,
  FamilyRegistrationDuplicateError,
  FamilyRegistrationEligibilityError,
  FamilyStore,
} from './family-store.js';
import { runMigrations } from './migrate.js';
import { seedCatalog } from './seed.js';

const organizationId = 'a60b272f-b028-4f1a-b666-3ef3cffd9827';
const otherOrganizationId = 'd193b5ee-818c-43e0-969d-26ea651ac38c';

function checkoutFixtureDates() {
  const startYear = new Date().getUTCFullYear() + 2;
  return {
    birthDate: `${startYear - 16}-04-12`,
    closesAt: `${startYear}-06-01T00:00:00Z`,
    endsOn: `${startYear}-07-07`,
    opensAt: `${new Date().getUTCFullYear() - 1}-01-01T00:00:00Z`,
    startsOn: `${startYear}-07-01`,
  };
}

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

  it('permits multiple family owners in one family', async () => {
    const store = new FamilyStore(runtimeDatabase);
    const familyId = 'da5b93e5-2bb5-4a27-9a52-31983b280c5c';
    const firstAdultId = '8f30484e-38b5-42f8-b75f-f0df52a3338e';
    const secondAdultId = 'e0292f6e-7f4a-42ac-ad53-533b2d525844';
    const context = {
      actorId: 'integration-admin',
      organizationId,
      requestId: 'multiple-family-owners-test',
    };

    await store.createFamily(context, {
      family_name: 'Garcia Family',
      id: familyId,
    });
    await store.createAdult(context, {
      account_owner: true,
      authorized_pickup: true,
      can_make_payments: true,
      can_manage_family: true,
      can_register: true,
      email: 'first.owner@example.test',
      email_normalized: 'first.owner@example.test',
      emergency_contact: true,
      family_id: familyId,
      first_name: 'Alex',
      id: firstAdultId,
      identity_subject: null,
      last_name: 'Garcia',
      phone: '555-0110',
      receives_operational_communication: true,
    });

    const withSecondOwner = await store.createAdult(context, {
      account_owner: true,
      authorized_pickup: true,
      can_make_payments: true,
      can_manage_family: true,
      can_register: true,
      email: 'second.owner@example.test',
      email_normalized: 'second.owner@example.test',
      emergency_contact: true,
      family_id: familyId,
      first_name: 'Sam',
      id: secondAdultId,
      identity_subject: null,
      last_name: 'Garcia',
      phone: '555-0111',
      receives_operational_communication: true,
    });

    expect(withSecondOwner.adult_count).toBe(2);
    expect(withSecondOwner.adults).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ account_owner: true, id: firstAdultId }),
        expect.objectContaining({ account_owner: true, id: secondAdultId }),
      ]),
    );
  });

  it('creates confirmed and waitlisted registrations with source and duplicate checks', async () => {
    const store = new FamilyStore(runtimeDatabase);
    const dates = checkoutFixtureDates();
    const sessionId = '587a2aba-bbb5-4bed-908b-9360d763f1af';
    const firstFamilyId = '32d8392e-ff31-4918-9d7a-daf7ca25a89d';
    const secondFamilyId = '95044083-24b3-46c6-8ff3-cb42c8774243';
    const firstCamperId = '09282baa-9a96-464a-ab70-d1a75054f625';
    const secondCamperId = '9ba377e7-248b-4c0c-8d4f-5d7dbef27ca2';
    const firstRegistrationId = '8e85a2b8-51b4-4dc7-ab93-07b20f270c68';
    const secondRegistrationId = '4ab7de03-4512-4475-b3d2-97b48d9c91e8';
    const context = {
      actorId: 'integration-admin',
      organizationId,
      requestId: 'checkout-registration-test',
    };

    const admin = new Pool({ connectionString: migrationUrl });
    await admin.query(
      `INSERT INTO sessions (
         id, organization_id, season_id, program_id, code, name, starts_on, ends_on,
         registration_opens_at, registration_closes_at, capacity, minimum_age,
         maximum_age, age_as_of, currency, price_cents, deposit_cents,
         waitlist_enabled, status
       ) VALUES (
         $1, $2, 'd5d8a8b7-c4ff-43be-a849-60cbd5914c85',
         '6d75c29b-e424-4da6-8191-db70859382fd', 'HS-CHECKOUT-01',
         'High School Checkout Test', $3, $4, $5, $6, 1, 14, 18,
         'SESSION_START', 'USD', 52500, 10000, true, 'PUBLISHED'
       )`,
      [sessionId, organizationId, dates.startsOn, dates.endsOn, dates.opensAt, dates.closesAt],
    );
    await admin.end();

    await store.createFamily(context, {
      family_name: 'Checkout First Family',
      id: firstFamilyId,
    });
    await store.createCamper(context, {
      accessibility_needs: null,
      birth_date: dates.birthDate,
      cabin_preference: null,
      family_id: firstFamilyId,
      first_name: 'Jordan',
      gender: 'Female',
      id: firstCamperId,
      last_name: 'Checkout',
      preferred_name: null,
      school_grade: '10th',
    });
    await store.createFamily(context, {
      family_name: 'Checkout Second Family',
      id: secondFamilyId,
    });
    await store.createCamper(context, {
      accessibility_needs: null,
      birth_date: dates.birthDate,
      cabin_preference: null,
      family_id: secondFamilyId,
      first_name: 'Sam',
      gender: 'Male',
      id: secondCamperId,
      last_name: 'Checkout',
      preferred_name: null,
      school_grade: '11',
    });

    const confirmed = await store.createRegistration(context, {
      camper_id: firstCamperId,
      family_id: firstFamilyId,
      id: firstRegistrationId,
      session_id: sessionId,
      source: 'PARENT',
    });
    const waitlisted = await store.createRegistration(
      { ...context, requestId: 'checkout-waitlist-test' },
      {
        camper_id: secondCamperId,
        family_id: secondFamilyId,
        id: secondRegistrationId,
        session_id: sessionId,
        source: 'ADMIN',
      },
    );

    expect(confirmed.registration).toMatchObject({
      registration_id: firstRegistrationId,
      session_id: sessionId,
      source: 'PARENT',
      status: 'CONFIRMED',
    });
    expect(waitlisted.registration).toMatchObject({
      registration_id: secondRegistrationId,
      session_id: sessionId,
      source: 'ADMIN',
      status: 'WAITLISTED',
    });
    expect(confirmed.family.campers[0]?.registrations).toEqual([
      expect.objectContaining({ registration_id: firstRegistrationId, status: 'CONFIRMED' }),
    ]);

    await expect(
      store.createRegistration(
        { ...context, requestId: 'checkout-duplicate-test' },
        {
          camper_id: firstCamperId,
          family_id: firstFamilyId,
          id: 'e0ca33f8-5212-456b-a7fd-0a565c8cb098',
          session_id: sessionId,
          source: 'PARENT',
        },
      ),
    ).rejects.toBeInstanceOf(FamilyRegistrationDuplicateError);
  });

  it('rejects parent registration outside the registration window', async () => {
    const store = new FamilyStore(runtimeDatabase);
    const dates = checkoutFixtureDates();
    const sessionId = '1ba76de0-c7a6-4955-864e-2af9061f29cc';
    const familyId = '4038ba6c-f673-4b48-9bbd-8cc173f52209';
    const camperId = 'd64e9b0a-d651-4878-92be-f06cd14628fe';
    const context = {
      actorId: 'integration-admin',
      organizationId,
      requestId: 'checkout-window-test',
    };

    const admin = new Pool({ connectionString: migrationUrl });
    await admin.query(
      `INSERT INTO sessions (
         id, organization_id, season_id, program_id, code, name, starts_on, ends_on,
         registration_opens_at, registration_closes_at, capacity, minimum_age,
         maximum_age, age_as_of, currency, price_cents, deposit_cents,
         waitlist_enabled, status
       ) VALUES (
         $1, $2, 'd5d8a8b7-c4ff-43be-a849-60cbd5914c85',
         '6d75c29b-e424-4da6-8191-db70859382fd', 'HS-CHECKOUT-02',
         'High School Future Registration Test', $3, $4, $5, $6, 20, 14, 18,
         'SESSION_START', 'USD', 52500, 10000, true, 'PUBLISHED'
       )`,
      [
        sessionId,
        organizationId,
        dates.startsOn,
        dates.endsOn,
        `${new Date().getUTCFullYear() + 1}-01-01T00:00:00Z`,
        dates.closesAt,
      ],
    );
    await admin.end();

    await store.createFamily(context, { family_name: 'Window Family', id: familyId });
    await store.createCamper(context, {
      accessibility_needs: null,
      birth_date: dates.birthDate,
      cabin_preference: null,
      family_id: familyId,
      first_name: 'Avery',
      gender: 'Female',
      id: camperId,
      last_name: 'Window',
      preferred_name: null,
      school_grade: '10',
    });

    await expect(
      store.createRegistration(context, {
        camper_id: camperId,
        family_id: familyId,
        id: 'edc69343-4984-42a6-915a-b55e6a6feb0e',
        session_id: sessionId,
        source: 'PARENT',
      }),
    ).rejects.toBeInstanceOf(FamilyRegistrationEligibilityError);
  });

  it('returns active session registrations on camper records', async () => {
    const store = new FamilyStore(runtimeDatabase);
    const familyId = 'ccabdf2f-92a9-4e97-a9ff-a587d0fb2abc';
    const camperId = '74e880ed-4dfc-4b2f-81f7-16dec18fc11f';
    const registrationId = '99da279e-f0a8-4fda-b3cc-398cebd9e353';
    const waitlistedRegistrationId = 'd27fdc9b-0204-444e-81e5-b935d6f53619';
    const sessionId = '06c02070-2e63-4b7b-bd93-578e54fa1ea6';
    const winterSessionId = '58bc426a-eb35-4e17-8f2b-7f2a2adc27ff';
    const context = {
      actorId: 'integration-admin',
      organizationId,
      requestId: 'camper-registrations-test',
    };

    await store.createFamily(context, {
      family_name: 'Camper Links Family',
      id: familyId,
    });
    await store.createCamper(context, {
      accessibility_needs: null,
      birth_date: '2010-04-12',
      cabin_preference: null,
      family_id: familyId,
      first_name: 'Riley',
      gender: 'Female',
      id: camperId,
      last_name: 'Links',
      preferred_name: null,
      school_grade: '11',
    });

    const admin = new Pool({ connectionString: migrationUrl });
    await admin.query(
      `INSERT INTO registrations (
         id, organization_id, session_id, family_id, camper_id, status, registered_at
       ) VALUES ($1, $2, $3, $4, $5, 'CONFIRMED', '2027-01-16T15:00:00Z')`,
      [registrationId, organizationId, sessionId, familyId, camperId],
    );
    await admin.query(
      `INSERT INTO registrations (
         id, organization_id, session_id, family_id, camper_id, status, registered_at
       ) VALUES ($1, $2, $3, $4, $5, 'WAITLISTED', '2027-01-18T15:00:00Z')`,
      [waitlistedRegistrationId, organizationId, winterSessionId, familyId, camperId],
    );
    await admin.end();

    const family = await store.getFamily(organizationId, familyId);

    expect(family?.campers[0]).toMatchObject({
      id: camperId,
      registrations: [
        {
          ends_on: '2027-07-10',
          program_name: 'High School Camp',
          registered_at: '2027-01-16T15:00:00Z',
          registration_id: registrationId,
          session_code: 'HS-2027-01',
          session_id: sessionId,
          session_name: 'High School Camp 1',
          source: 'ADMIN',
          starts_on: '2027-07-04',
          status: 'CONFIRMED',
        },
        {
          ends_on: '2028-02-06',
          program_name: 'Winter Camp',
          registered_at: '2027-01-18T15:00:00Z',
          registration_id: waitlistedRegistrationId,
          session_code: 'WB-2027-01',
          session_id: winterSessionId,
          session_name: 'High School Winter Camp #1',
          source: 'ADMIN',
          starts_on: '2028-02-04',
          status: 'WAITLISTED',
        },
      ],
    });
  });
});
