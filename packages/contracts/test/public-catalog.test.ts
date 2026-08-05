import { Value } from '@sinclair/typebox/value';
import { describe, expect, it } from 'vitest';

import { PublicCatalogSchema } from '../src/public-catalog.js';

const catalog = {
  organization: {
    brand_logo_url: null,
    brand_primary_color: '#166534',
    description: null,
    name: 'Test Camp',
    public_contact_email: null,
    public_website_url: null,
    self_service_signup_enabled: true,
    slug: 'test-camp',
    tagline: null,
  },
  programs: [
    {
      delivery_mode: 'DAY',
      description: 'A day program.',
      id: 'c3fd9d60-2a3f-40bc-8d0e-bf6217c8f8f3',
      name: 'Day Camp',
    },
  ],
  seasons: [{ name: 'Summer', year: 2027 }],
  sessions: [
    {
      availability: 'LIMITED',
      currency: 'USD',
      deposit_cents: 2500,
      ends_on: '2027-06-11',
      id: '28933fbb-470e-4ad6-9a74-600efe4232e3',
      maximum_age: 11,
      maximum_grade: 5,
      minimum_age: 5,
      minimum_grade: 0,
      name: 'Opening Week',
      price_cents: 17500,
      program_id: 'c3fd9d60-2a3f-40bc-8d0e-bf6217c8f8f3',
      registration_closes_at: '2027-06-04T05:00:00Z',
      registration_opens_at: '2027-01-15T15:00:00Z',
      registration_state: 'OPEN',
      season_year: 2027,
      starts_on: '2027-06-07',
    },
  ],
};

describe('public catalog contract', () => {
  it('accepts only the explicit public projection', () => {
    expect(Value.Check(PublicCatalogSchema, catalog)).toBe(true);
    expect(
      Value.Check(PublicCatalogSchema, {
        ...catalog,
        sessions: [{ ...catalog.sessions[0], registered_count: 1 }],
      }),
    ).toBe(false);
    expect(
      Value.Check(PublicCatalogSchema, {
        ...catalog,
        organization: { ...catalog.organization, organization_id: 'private-id' },
      }),
    ).toBe(false);
  });
});
