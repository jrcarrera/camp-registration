import { readFile } from 'node:fs/promises';

import { PostgreSqlContainer, type StartedPostgreSqlContainer } from '@testcontainers/postgresql';
import { Pool } from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { runMigrations } from './migrate.js';
import { seedWinterFamilies } from './seed.js';

const organizationId = 'a60b272f-b028-4f1a-b666-3ef3cffd9827';
const highSchoolCampOneSessionId = '06c02070-2e63-4b7b-bd93-578e54fa1ea6';
const highSchoolWinterCampOneSessionId = '58bc426a-eb35-4e17-8f2b-7f2a2adc27ff';

interface WinterFamilyFixture {
  counts: {
    adults: number;
    campers: number;
    contacts: number;
    families: number;
    families_with_multiple_account_owners: number;
    high_school_camp_1_female_registrations: number;
    high_school_camp_1_male_registrations: number;
    high_school_camp_1_registrations: number;
    high_school_winter_camp_1_female_registrations: number;
    high_school_winter_camp_1_female_waitlist: number;
    high_school_winter_camp_1_male_registrations: number;
    high_school_winter_camp_1_male_waitlist: number;
    high_school_winter_camp_1_registrations: number;
    high_school_winter_camp_1_waitlist: number;
    high_school_campers: number;
  };
  families: Array<{
    id: string;
    adults: Array<{ account_owner: boolean; email: string | null }>;
    campers: Array<{ school_grade: string | null }>;
    contacts: Array<{
      authorized_pickup: boolean;
      emergency_contact: boolean;
      receives_operational_communication: boolean;
    }>;
  }>;
}

interface SeededCountRow {
  adults: number;
  campers: number;
  contacts: number;
  duplicate_family_email_count: number;
  families: number;
  high_school_camp_1_female_registrations: number;
  high_school_camp_1_invalid_grade_registrations: number;
  high_school_camp_1_male_registrations: number;
  high_school_camp_1_registrations: number;
  high_school_winter_camp_1_female_registrations: number;
  high_school_winter_camp_1_female_waitlist: number;
  high_school_winter_camp_1_invalid_grade_registrations: number;
  high_school_winter_camp_1_male_registrations: number;
  high_school_winter_camp_1_male_waitlist: number;
  high_school_winter_camp_1_non_hs1_registrations: number;
  high_school_winter_camp_1_registrations: number;
  high_school_winter_camp_1_waitlist: number;
  high_school_campers: number;
  invalid_contact_count: number;
  invalid_email_count: number;
  invalid_email_normalization_count: number;
  invalid_phone_count: number;
  multiple_owner_families: number;
}

describe('winter family fixture', () => {
  let container: StartedPostgreSqlContainer;
  let fixture: WinterFamilyFixture;
  let migrationUrl: string;

  beforeAll(async () => {
    fixture = JSON.parse(
      await readFile(new URL('../fixtures/2027-winter-families.json', import.meta.url), 'utf8'),
    ) as WinterFamilyFixture;

    container = await new PostgreSqlContainer('postgres:17-alpine').start();
    migrationUrl = container.getConnectionUri();
    const admin = new Pool({ connectionString: migrationUrl });
    await admin.query(`CREATE ROLE camp_app LOGIN PASSWORD 'camp-app-test' NOBYPASSRLS`);
    await admin.end();

    await runMigrations(migrationUrl);
  });

  afterAll(async () => {
    await container.stop();
  });

  it('contains enough synthetic high-school campers for a 200-seat session', () => {
    const familyIds = new Set(fixture.families.map((family) => family.id));
    const highSchoolCampers = fixture.families.flatMap((family) =>
      family.campers.filter((camper) =>
        ['9', '10', '11', '12'].includes(camper.school_grade ?? ''),
      ),
    );

    expect(fixture.counts.families).toBe(140);
    expect(fixture.counts.high_school_campers).toBe(200);
    expect(highSchoolCampers).toHaveLength(200);
    expect(familyIds.size).toBe(fixture.families.length);
    expect(
      fixture.families.every((family) => family.adults.some((adult) => adult.account_owner)),
    ).toBe(true);
    expect(
      fixture.families.every((family) =>
        family.contacts.every(
          (contact) =>
            contact.emergency_contact ||
            contact.authorized_pickup ||
            contact.receives_operational_communication,
        ),
      ),
    ).toBe(true);
  });

  it('seeds into PostgreSQL idempotently without violating family constraints', async () => {
    await seedWinterFamilies(migrationUrl);
    await seedWinterFamilies(migrationUrl);

    const admin = new Pool({ connectionString: migrationUrl });
    const result = await admin.query<SeededCountRow>(
      `SELECT
         (SELECT count(*)::integer FROM families WHERE organization_id = $1) AS families,
         (SELECT count(*)::integer FROM adults WHERE organization_id = $1) AS adults,
         (SELECT count(*)::integer FROM campers WHERE organization_id = $1) AS campers,
         (SELECT count(*)::integer FROM contacts WHERE organization_id = $1) AS contacts,
         (
           SELECT count(*)::integer
           FROM campers
           WHERE organization_id = $1 AND school_grade IN ('9', '10', '11', '12')
         ) AS high_school_campers,
         (
           SELECT count(*)::integer
           FROM registrations
           WHERE organization_id = $1 AND session_id = $2 AND status = 'CONFIRMED'
         ) AS high_school_camp_1_registrations,
         (
           SELECT count(*)::integer
           FROM registrations r
           JOIN campers c
             ON c.organization_id = r.organization_id
            AND c.family_id = r.family_id
            AND c.id = r.camper_id
           WHERE r.organization_id = $1
             AND r.session_id = $2
             AND r.status = 'CONFIRMED'
             AND c.gender = 'Female'
         ) AS high_school_camp_1_female_registrations,
         (
           SELECT count(*)::integer
           FROM registrations r
           JOIN campers c
             ON c.organization_id = r.organization_id
            AND c.family_id = r.family_id
            AND c.id = r.camper_id
           WHERE r.organization_id = $1
             AND r.session_id = $2
             AND r.status = 'CONFIRMED'
             AND c.gender = 'Male'
         ) AS high_school_camp_1_male_registrations,
         (
           SELECT count(*)::integer
           FROM registrations r
           JOIN campers c
             ON c.organization_id = r.organization_id
            AND c.family_id = r.family_id
            AND c.id = r.camper_id
           WHERE r.organization_id = $1
             AND r.session_id = $2
             AND r.status = 'CONFIRMED'
             AND c.school_grade NOT IN ('9', '10', '11', '12')
         ) AS high_school_camp_1_invalid_grade_registrations,
         (
           SELECT count(*)::integer
           FROM registrations
           WHERE organization_id = $1 AND session_id = $3 AND status = 'CONFIRMED'
         ) AS high_school_winter_camp_1_registrations,
         (
           SELECT count(*)::integer
           FROM registrations r
           JOIN campers c
             ON c.organization_id = r.organization_id
            AND c.family_id = r.family_id
            AND c.id = r.camper_id
           WHERE r.organization_id = $1
             AND r.session_id = $3
             AND r.status = 'CONFIRMED'
             AND c.gender = 'Female'
         ) AS high_school_winter_camp_1_female_registrations,
         (
           SELECT count(*)::integer
           FROM registrations r
           JOIN campers c
             ON c.organization_id = r.organization_id
            AND c.family_id = r.family_id
            AND c.id = r.camper_id
           WHERE r.organization_id = $1
             AND r.session_id = $3
             AND r.status = 'CONFIRMED'
             AND c.gender = 'Male'
         ) AS high_school_winter_camp_1_male_registrations,
         (
           SELECT count(*)::integer
           FROM registrations
           WHERE organization_id = $1 AND session_id = $3 AND status = 'WAITLISTED'
         ) AS high_school_winter_camp_1_waitlist,
         (
           SELECT count(*)::integer
           FROM registrations r
           JOIN campers c
             ON c.organization_id = r.organization_id
            AND c.family_id = r.family_id
            AND c.id = r.camper_id
           WHERE r.organization_id = $1
             AND r.session_id = $3
             AND r.status = 'WAITLISTED'
             AND c.gender = 'Female'
         ) AS high_school_winter_camp_1_female_waitlist,
         (
           SELECT count(*)::integer
           FROM registrations r
           JOIN campers c
             ON c.organization_id = r.organization_id
            AND c.family_id = r.family_id
            AND c.id = r.camper_id
           WHERE r.organization_id = $1
             AND r.session_id = $3
             AND r.status = 'WAITLISTED'
             AND c.gender = 'Male'
         ) AS high_school_winter_camp_1_male_waitlist,
         (
           SELECT count(*)::integer
           FROM registrations r
           JOIN campers c
             ON c.organization_id = r.organization_id
            AND c.family_id = r.family_id
            AND c.id = r.camper_id
           WHERE r.organization_id = $1
             AND r.session_id = $3
             AND r.status IN ('CONFIRMED', 'WAITLISTED')
             AND c.school_grade NOT IN ('9', '10', '11', '12')
         ) AS high_school_winter_camp_1_invalid_grade_registrations,
         (
           SELECT count(*)::integer
           FROM registrations winter
           WHERE winter.organization_id = $1
             AND winter.session_id = $3
             AND winter.status IN ('CONFIRMED', 'WAITLISTED')
             AND NOT EXISTS (
               SELECT 1
               FROM registrations summer
               WHERE summer.organization_id = winter.organization_id
                 AND summer.session_id = $2
                 AND summer.family_id = winter.family_id
                 AND summer.camper_id = winter.camper_id
                 AND summer.status = 'CONFIRMED'
             )
         ) AS high_school_winter_camp_1_non_hs1_registrations,
         (
           SELECT count(*)::integer
           FROM (
             SELECT family_id
             FROM adults
             WHERE organization_id = $1 AND account_owner
             GROUP BY family_id
             HAVING count(*) > 1
           ) owner_families
         ) AS multiple_owner_families,
         (
           SELECT count(*)::integer
           FROM contacts
           WHERE organization_id = $1
             AND NOT (
               emergency_contact
               OR authorized_pickup
               OR receives_operational_communication
             )
         ) AS invalid_contact_count,
         (
           SELECT count(*)::integer
           FROM (
             SELECT phone FROM adults WHERE organization_id = $1 AND phone IS NOT NULL
             UNION ALL
             SELECT phone FROM contacts WHERE organization_id = $1
           ) phones
           WHERE phone !~ '^\\+1-[2-9][0-9]{2}-555-01[0-9]{2}$'
         ) AS invalid_phone_count,
         (
           SELECT count(*)::integer
           FROM adults
           WHERE organization_id = $1
             AND email IS NOT NULL
             AND email !~ '^[^@\\s]+@example\\.test$'
         ) AS invalid_email_count,
         (
           SELECT count(*)::integer
           FROM adults
           WHERE organization_id = $1
             AND email IS NOT NULL
             AND email_normalized <> lower(email)
         ) AS invalid_email_normalization_count,
         (
           SELECT count(*)::integer
           FROM (
             SELECT family_id, email_normalized
             FROM adults
             WHERE organization_id = $1 AND email_normalized IS NOT NULL
             GROUP BY family_id, email_normalized
             HAVING count(*) > 1
           ) duplicate_emails
         ) AS duplicate_family_email_count`,
      [organizationId, highSchoolCampOneSessionId, highSchoolWinterCampOneSessionId],
    );
    await admin.end();

    expect(result.rows[0]).toEqual({
      adults: fixture.counts.adults,
      campers: fixture.counts.campers,
      contacts: fixture.counts.contacts,
      duplicate_family_email_count: 0,
      families: fixture.counts.families,
      high_school_camp_1_female_registrations:
        fixture.counts.high_school_camp_1_female_registrations,
      high_school_camp_1_invalid_grade_registrations: 0,
      high_school_camp_1_male_registrations: fixture.counts.high_school_camp_1_male_registrations,
      high_school_camp_1_registrations: fixture.counts.high_school_camp_1_registrations,
      high_school_winter_camp_1_female_registrations:
        fixture.counts.high_school_winter_camp_1_female_registrations,
      high_school_winter_camp_1_female_waitlist:
        fixture.counts.high_school_winter_camp_1_female_waitlist,
      high_school_winter_camp_1_invalid_grade_registrations: 0,
      high_school_winter_camp_1_male_registrations:
        fixture.counts.high_school_winter_camp_1_male_registrations,
      high_school_winter_camp_1_male_waitlist:
        fixture.counts.high_school_winter_camp_1_male_waitlist,
      high_school_winter_camp_1_non_hs1_registrations: 0,
      high_school_winter_camp_1_registrations:
        fixture.counts.high_school_winter_camp_1_registrations,
      high_school_winter_camp_1_waitlist: fixture.counts.high_school_winter_camp_1_waitlist,
      high_school_campers: fixture.counts.high_school_campers,
      invalid_contact_count: 0,
      invalid_email_count: 0,
      invalid_email_normalization_count: 0,
      invalid_phone_count: 0,
      multiple_owner_families: fixture.counts.families_with_multiple_account_owners,
    });
  });
});
