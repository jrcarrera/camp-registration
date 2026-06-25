import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

import { Pool } from 'pg';

interface CatalogFixture {
  organizations: Array<{ id: string; slug: string; name: string; timezone: string }>;
  seasons: Array<{ id: string; organization_id: string; name: string; year: number }>;
  programs: Array<{
    id: string;
    organization_id: string;
    code: string;
    name: string;
    delivery_mode: string;
    description: string;
  }>;
  sessions: Array<{
    id: string;
    organization_id: string;
    season_id: string;
    program_id: string;
    code: string;
    name: string;
    starts_on: string;
    ends_on: string;
    registration_opens_at: string;
    registration_closes_at: string;
    capacity: number;
    minimum_age: number;
    maximum_age: number;
    age_as_of: string;
    currency: string;
    price_cents: number;
    deposit_cents: number;
    waitlist_enabled: boolean;
    status: string;
  }>;
}

interface FamilyLoadFixture {
  version: 1;
  organization_id: string;
  families: FamilyFixtureFamily[];
}

interface FamilyFixtureFamily {
  id: string;
  organization_id: string;
  family_name: string;
  adults: AdultFixture[];
  campers: CamperFixture[];
  contacts: ContactFixture[];
}

interface AdultFixture {
  id: string;
  identity_subject: string | null;
  first_name: string;
  last_name: string;
  email: string | null;
  phone: string | null;
  account_owner: boolean;
  can_manage_family: boolean;
  can_register: boolean;
  can_make_payments: boolean;
  emergency_contact: boolean;
  authorized_pickup: boolean;
  receives_operational_communication: boolean;
}

interface CamperFixture {
  id: string;
  first_name: string;
  last_name: string;
  birth_date: string;
  preferred_name: string | null;
  gender: 'Female' | 'Male' | null;
  school_grade: string | null;
  cabin_preference: string | null;
  accessibility_needs: string | null;
}

interface ContactFixture {
  id: string;
  first_name: string;
  last_name: string;
  phone: string;
  relationship: string;
  emergency_contact: boolean;
  authorized_pickup: boolean;
  receives_operational_communication: boolean;
  emergency_priority: number | null;
}

function normalizedEmail(email: string | null): string | null {
  return email ? email.toLowerCase() : null;
}

export async function seedCatalog(connectionString: string): Promise<void> {
  const fixture = JSON.parse(
    await readFile(new URL('../fixtures/2027-mvp-catalog.json', import.meta.url), 'utf8'),
  ) as CatalogFixture;
  const pool = new Pool({ connectionString, max: 1 });
  const client = await pool.connect();

  try {
    await client.query('BEGIN');

    for (const organization of fixture.organizations) {
      await client.query(
        `INSERT INTO organizations (id, slug, name, timezone)
         VALUES ($1, $2, $3, $4)
         ON CONFLICT (id) DO NOTHING`,
        [organization.id, organization.slug, organization.name, organization.timezone],
      );
    }

    for (const season of fixture.seasons) {
      await client.query(
        `INSERT INTO seasons (id, organization_id, name, year)
         VALUES ($1, $2, $3, $4)
         ON CONFLICT (id) DO NOTHING`,
        [season.id, season.organization_id, season.name, season.year],
      );
    }

    for (const program of fixture.programs) {
      await client.query(
        `INSERT INTO programs (id, organization_id, code, name, delivery_mode, description)
         VALUES ($1, $2, $3, $4, $5, $6)
         ON CONFLICT (id) DO NOTHING`,
        [
          program.id,
          program.organization_id,
          program.code,
          program.name,
          program.delivery_mode,
          program.description,
        ],
      );
    }

    for (const session of fixture.sessions) {
      await client.query(
        `INSERT INTO sessions (
           id, organization_id, season_id, program_id, code, name, starts_on, ends_on,
           registration_opens_at, registration_closes_at, capacity, minimum_age,
           maximum_age, age_as_of, currency, price_cents, deposit_cents,
           waitlist_enabled, status
         ) VALUES (
           $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15,
           $16, $17, $18, $19
         )
         ON CONFLICT (id) DO NOTHING`,
        [
          session.id,
          session.organization_id,
          session.season_id,
          session.program_id,
          session.code,
          session.name,
          session.starts_on,
          session.ends_on,
          session.registration_opens_at,
          session.registration_closes_at,
          session.capacity,
          session.minimum_age,
          session.maximum_age,
          session.age_as_of,
          session.currency,
          session.price_cents,
          session.deposit_cents,
          session.waitlist_enabled,
          session.status,
        ],
      );
    }

    await client.query('COMMIT');
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
    await pool.end();
  }
}

export async function seedWinterFamilies(connectionString: string): Promise<void> {
  await seedCatalog(connectionString);

  const fixture = JSON.parse(
    await readFile(new URL('../fixtures/2027-winter-families.json', import.meta.url), 'utf8'),
  ) as FamilyLoadFixture;

  await seedFamilyFixture(connectionString, fixture);
}

export async function seedFamilyFixture(
  connectionString: string,
  fixture: FamilyLoadFixture,
): Promise<void> {
  const pool = new Pool({ connectionString, max: 1 });
  const client = await pool.connect();

  try {
    await client.query('BEGIN');

    for (const family of fixture.families) {
      await client.query(
        `INSERT INTO families (id, organization_id, family_name)
         VALUES ($1, $2, $3)
         ON CONFLICT (id) DO NOTHING`,
        [family.id, family.organization_id, family.family_name],
      );

      for (const adult of family.adults) {
        await client.query(
          `INSERT INTO adults (
             id, organization_id, family_id, identity_subject, first_name, last_name,
             email, email_normalized, phone, account_owner, can_manage_family,
             can_register, can_make_payments, emergency_contact, authorized_pickup,
             receives_operational_communication
           ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16)
           ON CONFLICT (id) DO NOTHING`,
          [
            adult.id,
            family.organization_id,
            family.id,
            adult.identity_subject,
            adult.first_name,
            adult.last_name,
            adult.email,
            normalizedEmail(adult.email),
            adult.phone,
            adult.account_owner,
            adult.can_manage_family,
            adult.can_register,
            adult.can_make_payments,
            adult.emergency_contact,
            adult.authorized_pickup,
            adult.receives_operational_communication,
          ],
        );
      }

      for (const camper of family.campers) {
        await client.query(
          `INSERT INTO campers (
             id, organization_id, family_id, first_name, last_name, birth_date,
             preferred_name, gender, school_grade, cabin_preference, accessibility_needs
           ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
           ON CONFLICT (id) DO NOTHING`,
          [
            camper.id,
            family.organization_id,
            family.id,
            camper.first_name,
            camper.last_name,
            camper.birth_date,
            camper.preferred_name,
            camper.gender,
            camper.school_grade,
            camper.cabin_preference,
            camper.accessibility_needs,
          ],
        );
      }

      for (const contact of family.contacts) {
        await client.query(
          `INSERT INTO contacts (
             id, organization_id, family_id, first_name, last_name, phone, relationship,
             emergency_contact, authorized_pickup, receives_operational_communication,
             emergency_priority
           ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
           ON CONFLICT (id) DO NOTHING`,
          [
            contact.id,
            family.organization_id,
            family.id,
            contact.first_name,
            contact.last_name,
            contact.phone,
            contact.relationship,
            contact.emergency_contact,
            contact.authorized_pickup,
            contact.receives_operational_communication,
            contact.emergency_priority,
          ],
        );
      }
    }

    await client.query('COMMIT');
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
    await pool.end();
  }
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const connectionString = process.env.MIGRATION_DATABASE_URL;
  if (!connectionString) {
    throw new Error('MIGRATION_DATABASE_URL is required');
  }
  if (process.argv.includes('--winter-families')) {
    await seedWinterFamilies(connectionString);
  } else {
    await seedCatalog(connectionString);
  }
}
