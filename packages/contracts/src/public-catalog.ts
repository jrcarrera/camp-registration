import { Type, type Static } from '@sinclair/typebox';

import { LocalDateSchema, UtcTimestampSchema, UuidSchema } from './catalog.js';

const NullableUrlSchema = Type.Union([
  Type.String({ format: 'uri', maxLength: 2048 }),
  Type.Null(),
]);

export const PublicCatalogOrganizationSchema = Type.Object(
  {
    brand_logo_url: NullableUrlSchema,
    brand_primary_color: Type.String({ pattern: '^#[0-9A-Fa-f]{6}$' }),
    description: Type.Union([Type.String({ minLength: 1, maxLength: 1500 }), Type.Null()]),
    name: Type.String({ minLength: 1 }),
    public_contact_email: Type.Union([
      Type.String({ format: 'email', maxLength: 320 }),
      Type.Null(),
    ]),
    public_website_url: NullableUrlSchema,
    self_service_signup_enabled: Type.Boolean(),
    slug: Type.String({ minLength: 1, maxLength: 160 }),
    tagline: Type.Union([Type.String({ minLength: 1, maxLength: 120 }), Type.Null()]),
  },
  { additionalProperties: false },
);

export const PublicCatalogSeasonSchema = Type.Object(
  { name: Type.String({ minLength: 1 }), year: Type.Integer({ minimum: 2000, maximum: 2200 }) },
  { additionalProperties: false },
);
export const PublicCatalogProgramSchema = Type.Object(
  {
    delivery_mode: Type.Union([Type.Literal('DAY'), Type.Literal('OVERNIGHT')]),
    description: Type.String({ minLength: 1 }),
    id: UuidSchema,
    name: Type.String({ minLength: 1 }),
  },
  { additionalProperties: false },
);
export const PublicRegistrationStateSchema = Type.Union([
  Type.Literal('NOT_YET_OPEN'),
  Type.Literal('OPEN'),
  Type.Literal('CLOSED'),
]);
export const PublicAvailabilitySchema = Type.Union([
  Type.Literal('OPEN'),
  Type.Literal('LIMITED'),
  Type.Literal('WAITLIST'),
  Type.Literal('FULL'),
]);
export const PublicCatalogSessionSchema = Type.Object(
  {
    availability: PublicAvailabilitySchema,
    currency: Type.Literal('USD'),
    deposit_cents: Type.Integer({ minimum: 0 }),
    ends_on: LocalDateSchema,
    id: UuidSchema,
    maximum_age: Type.Integer({ minimum: 0, maximum: 120 }),
    maximum_grade: Type.Integer({ minimum: 0, maximum: 12 }),
    minimum_age: Type.Integer({ minimum: 0, maximum: 120 }),
    minimum_grade: Type.Integer({ minimum: 0, maximum: 12 }),
    name: Type.String({ minLength: 1 }),
    price_cents: Type.Integer({ minimum: 0 }),
    program_id: UuidSchema,
    registration_closes_at: UtcTimestampSchema,
    registration_opens_at: UtcTimestampSchema,
    registration_state: PublicRegistrationStateSchema,
    season_year: Type.Integer({ minimum: 2000, maximum: 2200 }),
    starts_on: LocalDateSchema,
  },
  { additionalProperties: false },
);
export const PublicCatalogSchema = Type.Object(
  {
    organization: PublicCatalogOrganizationSchema,
    programs: Type.Array(PublicCatalogProgramSchema),
    seasons: Type.Array(PublicCatalogSeasonSchema),
    sessions: Type.Array(PublicCatalogSessionSchema),
  },
  { additionalProperties: false, $id: 'PublicCatalog' },
);

export type PublicCatalog = Static<typeof PublicCatalogSchema>;
export type PublicCatalogOrganization = Static<typeof PublicCatalogOrganizationSchema>;
