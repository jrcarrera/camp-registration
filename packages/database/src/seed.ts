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

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const connectionString = process.env.MIGRATION_DATABASE_URL;
  if (!connectionString) {
    throw new Error('MIGRATION_DATABASE_URL is required');
  }
  await seedCatalog(connectionString);
}
