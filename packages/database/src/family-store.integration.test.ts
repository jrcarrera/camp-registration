import { PostgreSqlContainer, type StartedPostgreSqlContainer } from '@testcontainers/postgresql';
import { Pool } from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { createDatabaseClient, type DatabaseClient } from './client.js';
import {
  FamilyConflictError,
  FamilyDuplicateError,
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
      birth_date: '1984-05-12',
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
      adult_id: null,
      birth_date: '2017-03-08',
      cabin_preference: null,
      email: 'avery.smith@example.test',
      email_normalized: 'avery.smith@example.test',
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
      birth_date: '1979-11-20',
      email: 'taylor.jones@example.test',
      email_normalized: 'taylor.jones@example.test',
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
      birth_date: null,
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
      birth_date: null,
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
      adult_id: null,
      birth_date: dates.birthDate,
      cabin_preference: null,
      email: null,
      email_normalized: null,
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
      adult_id: null,
      birth_date: dates.birthDate,
      cabin_preference: null,
      email: null,
      email_normalized: null,
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

    const cancelled = await store.cancelRegistration(
      { ...context, requestId: 'checkout-cancel-test' },
      firstFamilyId,
      firstRegistrationId,
    );
    const promoted = await store.promoteNextWaitlistRegistration(
      { ...context, requestId: 'checkout-promote-test' },
      sessionId,
    );

    expect(cancelled.registration).toMatchObject({
      registration_id: firstRegistrationId,
      status: 'CANCELLED',
    });
    expect(cancelled.family.campers[0]?.registrations).toEqual([]);
    expect(promoted.registration).toMatchObject({
      registration_id: secondRegistrationId,
      status: 'CONFIRMED',
    });
  });

  it('claims adult identity and lists only owned families for that identity', async () => {
    const store = new FamilyStore(runtimeDatabase);
    const familyId = 'b91b5297-0d8f-4990-bff5-63d80e2de08d';
    const adultId = '238c7a2d-7d20-4669-b1ac-34f58513a3c3';
    const context = {
      actorId: 'parent-identity-subject',
      organizationId,
      requestId: 'adult-identity-claim-test',
    };

    await store.createFamily(context, {
      family_name: 'Claimable Family',
      id: familyId,
    });
    await store.createAdult(context, {
      account_owner: true,
      authorized_pickup: true,
      birth_date: null,
      can_make_payments: true,
      can_manage_family: true,
      can_register: true,
      email: 'parent.claim@example.test',
      email_normalized: 'parent.claim@example.test',
      emergency_contact: true,
      family_id: familyId,
      first_name: 'Casey',
      id: adultId,
      identity_subject: null,
      last_name: 'Claim',
      phone: '555-0150',
      receives_operational_communication: true,
    });

    const claimed = await store.claimAdultIdentity(
      context,
      familyId,
      adultId,
      'parent.claim@example.test',
    );
    const ownedFamilies = await store.listFamiliesForAdultIdentity(organizationId, context.actorId);

    expect(claimed.adults[0]).toMatchObject({
      id: adultId,
      identity_subject: context.actorId,
    });
    expect(ownedFamilies).toEqual([
      expect.objectContaining({
        family_name: 'Claimable Family',
        id: familyId,
      }),
    ]);
    await expect(
      store.adultIdentityCanRegisterFamily(organizationId, familyId, context.actorId),
    ).resolves.toBe(true);
    await expect(
      store.adultIdentityCanRegisterFamily(organizationId, otherOrganizationId, context.actorId),
    ).resolves.toBe(false);
  });

  it('rolls back a new camper when atomic parent checkout cannot register', async () => {
    const store = new FamilyStore(runtimeDatabase);
    const dates = checkoutFixtureDates();
    const sessionId = 'f25dc597-4676-401b-84bc-8b1295f5de29';
    const familyId = '8df9f102-53eb-418e-a8e2-ef084cf90289';
    const camperId = 'e0c64d26-83a5-4315-8148-9ee321d3d122';
    const context = {
      actorId: 'parent-checkout-subject',
      organizationId,
      requestId: 'atomic-checkout-rollback-test',
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
         '6d75c29b-e424-4da6-8191-db70859382fd', 'HS-CHECKOUT-ROLLBACK',
         'High School Atomic Checkout Rollback', $3, $4, $5, $6, 20, 14, 18,
         'SESSION_START', 'USD', 52500, 10000, true, 'PUBLISHED'
       )`,
      [sessionId, organizationId, dates.startsOn, dates.endsOn, dates.opensAt, dates.closesAt],
    );
    await admin.end();

    await store.createFamily(context, { family_name: 'Atomic Checkout Family', id: familyId });

    await expect(
      store.createParentCheckout(context, {
        family_id: familyId,
        new_camper: {
          accessibility_needs: null,
          adult_id: null,
          birth_date: `${new Date(dates.startsOn).getUTCFullYear() - 9}-04-12`,
          cabin_preference: null,
          email: null,
          email_normalized: null,
          family_id: familyId,
          first_name: 'Avery',
          gender: 'Female',
          id: camperId,
          last_name: 'Rollback',
          preferred_name: null,
          school_grade: '4',
        },
        registration_id: 'b5cdfa77-1e8d-4817-825a-02191faec30f',
        selected_camper_id: null,
        session_id: sessionId,
      }),
    ).rejects.toBeInstanceOf(FamilyRegistrationEligibilityError);

    await expect(store.getFamily(organizationId, familyId)).resolves.toMatchObject({
      camper_count: 0,
      campers: [],
    });
  });

  it('applies grade eligibility from explicit program grade bounds', async () => {
    const store = new FamilyStore(runtimeDatabase);
    const dates = checkoutFixtureDates();
    const sessionId = '211983fc-2221-4f9c-9949-f77d0ac7f256';
    const programId = '4bb4487a-0670-41d4-b59b-e007b8ee773a';
    const eligibleFamilyId = '6aa4ab55-8877-45b7-a533-32eaaf38a3cc';
    const eligibleCamperId = 'd483fe70-4878-473c-b67d-6dd8662e448c';
    const ineligibleFamilyId = '54abaf22-68df-438d-8955-a6e963439c27';
    const ineligibleCamperId = '8639496f-0e3f-4524-8f70-094375c2b521';
    const context = {
      actorId: 'integration-admin',
      organizationId,
      requestId: 'checkout-jr-high-name-test',
    };

    const admin = new Pool({ connectionString: migrationUrl });
    await admin.query(
      `INSERT INTO programs (
         id, organization_id, code, name, delivery_mode, description, default_capacity,
         default_minimum_age, default_maximum_age, default_minimum_grade, default_maximum_grade,
         default_age_as_of, default_price_cents, default_deposit_cents, default_waitlist_enabled
       ) VALUES (
         $1, $2, 'WTR-CHECKOUT', 'Winter Checkout', 'OVERNIGHT',
         'Winter checkout test program.', 20, 5, 18, 6, 8, 'SESSION_START', 10000, 2000, true
       )`,
      [programId, organizationId],
    );
    await admin.query(
      `INSERT INTO sessions (
         id, organization_id, season_id, program_id, code, name, starts_on, ends_on,
         registration_opens_at, registration_closes_at, capacity, minimum_age,
         maximum_age, age_as_of, currency, price_cents, deposit_cents,
         waitlist_enabled, status
       ) VALUES (
         $1, $2, 'fc94ef27-1fa6-466b-b877-312c27d00a7c', $3, 'SB-CHECKOUT-01',
         'Winter Checkout', $4, $5, $6, $7, 20, 5, 18,
         'SESSION_START', 'USD', 10000, 2000, true, 'PUBLISHED'
       )`,
      [
        sessionId,
        organizationId,
        programId,
        dates.startsOn,
        dates.endsOn,
        dates.opensAt,
        dates.closesAt,
      ],
    );
    await admin.end();

    await store.createFamily(context, {
      family_name: 'Junior High Eligible Family',
      id: eligibleFamilyId,
    });
    await store.createCamper(context, {
      accessibility_needs: null,
      adult_id: null,
      birth_date: `${new Date(dates.startsOn).getUTCFullYear() - 12}-04-12`,
      cabin_preference: null,
      email: null,
      email_normalized: null,
      family_id: eligibleFamilyId,
      first_name: 'Riley',
      gender: 'Female',
      id: eligibleCamperId,
      last_name: 'Eligible',
      preferred_name: null,
      school_grade: '6th',
    });
    await store.createFamily(context, {
      family_name: 'Junior High Ineligible Family',
      id: ineligibleFamilyId,
    });
    await store.createCamper(context, {
      accessibility_needs: null,
      adult_id: null,
      birth_date: `${new Date(dates.startsOn).getUTCFullYear() - 12}-04-12`,
      cabin_preference: null,
      email: null,
      email_normalized: null,
      family_id: ineligibleFamilyId,
      first_name: 'Avery',
      gender: 'Male',
      id: ineligibleCamperId,
      last_name: 'Ineligible',
      preferred_name: null,
      school_grade: '4',
    });

    await expect(
      store.createRegistration(context, {
        camper_id: eligibleCamperId,
        family_id: eligibleFamilyId,
        id: '4c5de318-6365-4dc6-90d3-7af9195cd877',
        session_id: sessionId,
        source: 'PARENT',
      }),
    ).resolves.toMatchObject({
      registration: {
        session_id: sessionId,
        status: 'CONFIRMED',
      },
    });
    await expect(
      store.createRegistration(context, {
        camper_id: ineligibleCamperId,
        family_id: ineligibleFamilyId,
        id: '861a7876-e3f2-4edc-a75a-1b1fd15bff43',
        session_id: sessionId,
        source: 'PARENT',
      }),
    ).rejects.toBeInstanceOf(FamilyRegistrationEligibilityError);
  });

  it('registers adult-linked campers by age without requiring school grade', async () => {
    const store = new FamilyStore(runtimeDatabase);
    const dates = checkoutFixtureDates();
    const sessionId = '7b143604-3d83-4e02-ab0c-d3b8c8d35132';
    const familyId = '60ae5ff2-e6d6-4d29-9c67-8b12782723f7';
    const adultId = '388db955-6e22-4f58-a9c4-a0cda183fbdd';
    const camperId = 'be74c981-c9a8-44ad-875b-0eb6dfb55c54';
    const duplicateCamperId = '13f8a5b5-2e02-4b13-b47d-8f0fa02d316f';
    const registrationId = '1c841302-9324-48f8-ab20-06f5e4ad65e6';
    const adultBirthDate = `${new Date(dates.startsOn).getUTCFullYear() - 42}-04-12`;
    const context = {
      actorId: 'integration-admin',
      organizationId,
      requestId: 'adult-camper-registration-test',
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
         '6d75c29b-e424-4da6-8191-db70859382fd', 'FAM-CHECKOUT-01',
         'Family Camp Checkout Test', $3, $4, $5, $6, 20, 18, 99,
         'SESSION_START', 'USD', 52500, 10000, true, 'PUBLISHED'
       )`,
      [sessionId, organizationId, dates.startsOn, dates.endsOn, dates.opensAt, dates.closesAt],
    );
    await admin.end();

    await store.createFamily(context, { family_name: 'Adult Camper Family', id: familyId });
    await store.createAdult(context, {
      account_owner: true,
      authorized_pickup: true,
      birth_date: adultBirthDate,
      can_make_payments: true,
      can_manage_family: true,
      can_register: true,
      email: 'morgan.parent@example.test',
      email_normalized: 'morgan.parent@example.test',
      emergency_contact: true,
      family_id: familyId,
      first_name: 'Morgan',
      id: adultId,
      identity_subject: null,
      last_name: 'Parent',
      phone: '555-0142',
      receives_operational_communication: true,
    });
    await store.createCamper(context, {
      accessibility_needs: null,
      adult_id: adultId,
      birth_date: adultBirthDate,
      cabin_preference: null,
      email: 'morgan.parent@example.test',
      email_normalized: 'morgan.parent@example.test',
      family_id: familyId,
      first_name: 'Morgan',
      gender: null,
      id: camperId,
      last_name: 'Parent',
      preferred_name: null,
      school_grade: null,
    });

    await expect(
      store.createCamper(context, {
        accessibility_needs: null,
        adult_id: adultId,
        birth_date: adultBirthDate,
        cabin_preference: null,
        email: 'morgan.parent@example.test',
        email_normalized: 'morgan.parent@example.test',
        family_id: familyId,
        first_name: 'Morgan',
        gender: null,
        id: duplicateCamperId,
        last_name: 'Parent',
        preferred_name: null,
        school_grade: null,
      }),
    ).rejects.toBeInstanceOf(FamilyDuplicateError);

    await expect(
      store.createRegistration(context, {
        camper_id: camperId,
        family_id: familyId,
        id: registrationId,
        session_id: sessionId,
        source: 'PARENT',
      }),
    ).resolves.toMatchObject({
      family: {
        campers: [
          expect.objectContaining({
            adult_id: adultId,
            email: 'morgan.parent@example.test',
            school_grade: null,
          }),
        ],
      },
      registration: {
        registration_id: registrationId,
        session_id: sessionId,
        status: 'CONFIRMED',
      },
    });
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
      adult_id: null,
      birth_date: dates.birthDate,
      cabin_preference: null,
      email: null,
      email_normalized: null,
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
      adult_id: null,
      birth_date: '2010-04-12',
      cabin_preference: null,
      email: null,
      email_normalized: null,
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
