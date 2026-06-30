import { readFile } from 'node:fs/promises';

import { Value } from '@sinclair/typebox/value';
import { describe, expect, it } from 'vitest';

import { CatalogFixtureSchema, type CatalogFixture } from '../src/catalog.js';

const fixtureUrl = new URL('../../database/fixtures/2027-mvp-catalog.json', import.meta.url);

async function readFixture(): Promise<unknown> {
  return JSON.parse(await readFile(fixtureUrl, 'utf8')) as unknown;
}

describe('2027 MVP catalog fixture', () => {
  it('matches the public catalog contract', async () => {
    const fixture = await readFixture();
    const errors = [...Value.Errors(CatalogFixtureSchema, fixture)].map((error) => ({
      message: error.message,
      path: error.path,
    }));

    expect(errors).toEqual([]);
  });

  it('has valid ownership, references, and business invariants', async () => {
    const fixture = (await readFixture()) as CatalogFixture;
    const organizationIds = new Set(fixture.organizations.map(({ id }) => id));
    const seasons = new Map(fixture.seasons.map((season) => [season.id, season]));
    const programs = new Map(fixture.programs.map((program) => [program.id, program]));
    const allIds = [
      ...fixture.organizations.map(({ id }) => id),
      ...fixture.seasons.map(({ id }) => id),
      ...fixture.programs.map(({ id }) => id),
      ...fixture.sessions.map(({ id }) => id),
    ];
    const sessionCodes = fixture.sessions.map(
      ({ organization_id, code }) => `${organization_id}:${code}`,
    );

    expect(new Set(allIds).size).toBe(allIds.length);
    expect(new Set(sessionCodes).size).toBe(sessionCodes.length);

    for (const season of fixture.seasons) {
      expect(organizationIds.has(season.organization_id)).toBe(true);
    }

    for (const program of fixture.programs) {
      expect(organizationIds.has(program.organization_id)).toBe(true);
      expect(program.default_minimum_age <= program.default_maximum_age).toBe(true);
      expect(program.default_minimum_grade <= program.default_maximum_grade).toBe(true);
      expect(program.default_deposit_cents <= program.default_price_cents).toBe(true);
    }

    for (const session of fixture.sessions) {
      const season = seasons.get(session.season_id);
      const program = programs.get(session.program_id);

      expect(organizationIds.has(session.organization_id)).toBe(true);
      expect(season?.organization_id).toBe(session.organization_id);
      expect(program?.organization_id).toBe(session.organization_id);
      expect(session.starts_on <= session.ends_on).toBe(true);
      expect(session.registration_opens_at < session.registration_closes_at).toBe(true);
      expect(session.registration_closes_at < `${session.starts_on}T23:59:59Z`).toBe(true);
      expect(session.minimum_age <= session.maximum_age).toBe(true);
      expect(session.deposit_cents <= session.price_cents).toBe(true);
    }

    expect(fixture.sessions).toHaveLength(10);
    expect(fixture.sessions.reduce((total, session) => total + session.capacity, 0)).toBe(1140);
  });
});
