import { Type, type Static } from '@sinclair/typebox';

export const UuidSchema = Type.String({
  pattern: '^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$',
});

export const LocalDateSchema = Type.String({ pattern: '^\\d{4}-\\d{2}-\\d{2}$' });
export const UtcTimestampSchema = Type.String({
  pattern: '^\\d{4}-\\d{2}-\\d{2}T\\d{2}:\\d{2}:\\d{2}(?:\\.\\d{1,6})?Z$',
});

export const OrganizationFixtureSchema = Type.Object(
  {
    id: UuidSchema,
    slug: Type.String({ minLength: 1, pattern: '^[a-z0-9]+(?:-[a-z0-9]+)*$' }),
    name: Type.String({ minLength: 1 }),
    timezone: Type.String({ minLength: 1 }),
  },
  { additionalProperties: false },
);

export const SeasonFixtureSchema = Type.Object(
  {
    id: UuidSchema,
    organization_id: UuidSchema,
    name: Type.String({ minLength: 1 }),
    year: Type.Integer({ minimum: 2000, maximum: 2200 }),
  },
  { additionalProperties: false },
);

export const AgeAsOfSchema = Type.Union([
  Type.Literal('SESSION_START'),
  Type.Literal('SEASON_START'),
]);
export const GradeLevelSchema = Type.Integer({ minimum: 0, maximum: 12 });

export const ProgramFixtureSchema = Type.Object(
  {
    id: UuidSchema,
    organization_id: UuidSchema,
    code: Type.String({ minLength: 1, pattern: '^[A-Z0-9-]+$' }),
    name: Type.String({ minLength: 1 }),
    delivery_mode: Type.Union([Type.Literal('DAY'), Type.Literal('OVERNIGHT')]),
    description: Type.String({ minLength: 1 }),
    default_capacity: Type.Integer({ minimum: 1 }),
    default_minimum_age: Type.Integer({ minimum: 0, maximum: 21 }),
    default_maximum_age: Type.Integer({ minimum: 0, maximum: 21 }),
    default_minimum_grade: GradeLevelSchema,
    default_maximum_grade: GradeLevelSchema,
    default_age_as_of: AgeAsOfSchema,
    default_price_cents: Type.Integer({ minimum: 0 }),
    default_deposit_cents: Type.Integer({ minimum: 0 }),
    default_waitlist_enabled: Type.Boolean(),
  },
  { additionalProperties: false },
);

export const SessionStatusSchema = Type.Union([
  Type.Literal('DRAFT'),
  Type.Literal('PUBLISHED'),
  Type.Literal('CANCELLED'),
  Type.Literal('ARCHIVED'),
]);

export const RegistrationStatusSchema = Type.Union([
  Type.Literal('CONFIRMED'),
  Type.Literal('WAITLISTED'),
  Type.Literal('CANCELLED'),
]);
export const RegistrationSourceSchema = Type.Union([Type.Literal('ADMIN'), Type.Literal('PARENT')]);

export const RegisteredCamperSchema = Type.Object(
  {
    registration_id: UuidSchema,
    camper_id: UuidSchema,
    family_id: UuidSchema,
    family_name: Type.String({ minLength: 1 }),
    first_name: Type.String({ minLength: 1 }),
    last_name: Type.String({ minLength: 1 }),
    preferred_name: Type.Union([Type.String({ minLength: 1 }), Type.Null()]),
    gender: Type.Union([Type.Literal('Female'), Type.Literal('Male'), Type.Null()]),
    school_grade: Type.Union([Type.String({ minLength: 1 }), Type.Null()]),
    birth_date: LocalDateSchema,
    status: RegistrationStatusSchema,
    source: RegistrationSourceSchema,
    registered_at: UtcTimestampSchema,
  },
  { additionalProperties: false, $id: 'RegisteredCamper' },
);

export const SessionFixtureSchema = Type.Object(
  {
    id: UuidSchema,
    organization_id: UuidSchema,
    season_id: UuidSchema,
    program_id: UuidSchema,
    code: Type.String({ minLength: 1, pattern: '^[A-Z0-9-]+$' }),
    name: Type.String({ minLength: 1 }),
    starts_on: LocalDateSchema,
    ends_on: LocalDateSchema,
    registration_opens_at: UtcTimestampSchema,
    registration_closes_at: UtcTimestampSchema,
    capacity: Type.Integer({ minimum: 1 }),
    minimum_age: Type.Integer({ minimum: 0, maximum: 21 }),
    maximum_age: Type.Integer({ minimum: 0, maximum: 21 }),
    age_as_of: AgeAsOfSchema,
    currency: Type.Literal('USD'),
    price_cents: Type.Integer({ minimum: 0 }),
    deposit_cents: Type.Integer({ minimum: 0 }),
    waitlist_enabled: Type.Boolean(),
    status: SessionStatusSchema,
  },
  { additionalProperties: false },
);

export const CatalogFixtureSchema = Type.Object(
  {
    version: Type.Literal(1),
    organizations: Type.Array(OrganizationFixtureSchema, { minItems: 1 }),
    seasons: Type.Array(SeasonFixtureSchema, { minItems: 1 }),
    programs: Type.Array(ProgramFixtureSchema, { minItems: 1 }),
    sessions: Type.Array(SessionFixtureSchema, { minItems: 1 }),
  },
  { additionalProperties: false, $id: 'CatalogFixture' },
);

export type OrganizationFixture = Static<typeof OrganizationFixtureSchema>;
export type SeasonFixture = Static<typeof SeasonFixtureSchema>;
export type ProgramFixture = Static<typeof ProgramFixtureSchema>;
export type SessionFixture = Static<typeof SessionFixtureSchema>;
export type CatalogFixture = Static<typeof CatalogFixtureSchema>;

export const CatalogContextSchema = Type.Object(
  {
    organization: OrganizationFixtureSchema,
    seasons: Type.Array(SeasonFixtureSchema),
    programs: Type.Array(ProgramFixtureSchema),
  },
  { additionalProperties: false, $id: 'CatalogContext' },
);

export const SessionSummarySchema = Type.Object(
  {
    id: UuidSchema,
    organization_id: UuidSchema,
    season_id: UuidSchema,
    program_id: UuidSchema,
    code: Type.String({ minLength: 1 }),
    name: Type.String({ minLength: 1 }),
    program_name: Type.String({ minLength: 1 }),
    starts_on: LocalDateSchema,
    ends_on: LocalDateSchema,
    capacity: Type.Integer({ minimum: 1 }),
    registered_count: Type.Integer({ minimum: 0 }),
    registered_female_count: Type.Integer({ minimum: 0 }),
    registered_male_count: Type.Integer({ minimum: 0 }),
    waitlisted_count: Type.Integer({ minimum: 0 }),
    waitlisted_female_count: Type.Integer({ minimum: 0 }),
    waitlisted_male_count: Type.Integer({ minimum: 0 }),
    active_hold_count: Type.Integer({ minimum: 0 }),
    available_count: Type.Integer({ minimum: 0 }),
    currency: Type.Literal('USD'),
    price_cents: Type.Integer({ minimum: 0 }),
    status: SessionStatusSchema,
    version: Type.Integer({ minimum: 1 }),
    updated_at: UtcTimestampSchema,
  },
  { additionalProperties: false, $id: 'SessionSummary' },
);

export const SessionDetailSchema = Type.Composite(
  [
    SessionSummarySchema,
    Type.Object(
      {
        registration_opens_at: UtcTimestampSchema,
        registration_closes_at: UtcTimestampSchema,
        minimum_age: Type.Integer({ minimum: 0, maximum: 21 }),
        maximum_age: Type.Integer({ minimum: 0, maximum: 21 }),
        minimum_grade: GradeLevelSchema,
        maximum_grade: GradeLevelSchema,
        age_as_of: AgeAsOfSchema,
        deposit_cents: Type.Integer({ minimum: 0 }),
        waitlist_enabled: Type.Boolean(),
        organization_timezone: Type.String({ minLength: 1 }),
        registered_campers: Type.Array(RegisteredCamperSchema),
      },
      { additionalProperties: false },
    ),
  ],
  { $id: 'SessionDetail' },
);

export const SessionListResponseSchema = Type.Object(
  {
    sessions: Type.Array(SessionSummarySchema),
  },
  { additionalProperties: false, $id: 'SessionListResponse' },
);

export const SessionUpdateSchema = Type.Object(
  {
    version: Type.Integer({ minimum: 1 }),
    season_id: UuidSchema,
    program_id: UuidSchema,
    name: Type.String({ minLength: 1, maxLength: 160 }),
    starts_on: LocalDateSchema,
    ends_on: LocalDateSchema,
    registration_opens_at: UtcTimestampSchema,
    registration_closes_at: UtcTimestampSchema,
    capacity: Type.Integer({ minimum: 1 }),
    minimum_age: Type.Integer({ minimum: 0, maximum: 21 }),
    maximum_age: Type.Integer({ minimum: 0, maximum: 21 }),
    age_as_of: AgeAsOfSchema,
    price_cents: Type.Integer({ minimum: 0 }),
    deposit_cents: Type.Integer({ minimum: 0 }),
    waitlist_enabled: Type.Boolean(),
    status: SessionStatusSchema,
  },
  { additionalProperties: false, $id: 'SessionUpdate' },
);

export const SessionCreateSchema = Type.Object(
  {
    season_id: UuidSchema,
    program_id: UuidSchema,
    code: Type.String({ minLength: 1, maxLength: 64, pattern: '^[A-Z0-9-]+$' }),
    name: Type.String({ minLength: 1, maxLength: 160 }),
    starts_on: LocalDateSchema,
    ends_on: LocalDateSchema,
    registration_opens_at: UtcTimestampSchema,
    registration_closes_at: UtcTimestampSchema,
    status: SessionStatusSchema,
  },
  { additionalProperties: false, $id: 'SessionCreate' },
);

export const SeasonCreateSchema = Type.Object(
  {
    name: Type.String({ minLength: 1, maxLength: 160 }),
    year: Type.Integer({ minimum: 2000, maximum: 2200 }),
  },
  { additionalProperties: false, $id: 'SeasonCreate' },
);

export const ProgramCreateSchema = Type.Object(
  {
    code: Type.String({ minLength: 1, maxLength: 64, pattern: '^[A-Z0-9-]+$' }),
    name: Type.String({ minLength: 1, maxLength: 160 }),
    delivery_mode: Type.Union([Type.Literal('DAY'), Type.Literal('OVERNIGHT')]),
    description: Type.String({ minLength: 1, maxLength: 1000 }),
    default_capacity: Type.Integer({ minimum: 1 }),
    default_minimum_age: Type.Integer({ minimum: 0, maximum: 21 }),
    default_maximum_age: Type.Integer({ minimum: 0, maximum: 21 }),
    default_minimum_grade: GradeLevelSchema,
    default_maximum_grade: GradeLevelSchema,
    default_age_as_of: AgeAsOfSchema,
    default_price_cents: Type.Integer({ minimum: 0 }),
    default_deposit_cents: Type.Integer({ minimum: 0 }),
    default_waitlist_enabled: Type.Boolean(),
  },
  { additionalProperties: false, $id: 'ProgramCreate' },
);

export const ProgramUpdateSchema = Type.Object(
  {
    name: Type.String({ minLength: 1, maxLength: 160 }),
    delivery_mode: Type.Union([Type.Literal('DAY'), Type.Literal('OVERNIGHT')]),
    description: Type.String({ minLength: 1, maxLength: 1000 }),
    default_capacity: Type.Integer({ minimum: 1 }),
    default_minimum_age: Type.Integer({ minimum: 0, maximum: 21 }),
    default_maximum_age: Type.Integer({ minimum: 0, maximum: 21 }),
    default_minimum_grade: GradeLevelSchema,
    default_maximum_grade: GradeLevelSchema,
    default_age_as_of: AgeAsOfSchema,
    default_price_cents: Type.Integer({ minimum: 0 }),
    default_deposit_cents: Type.Integer({ minimum: 0 }),
    default_waitlist_enabled: Type.Boolean(),
  },
  { additionalProperties: false, $id: 'ProgramUpdate' },
);

export const ProgramParamsSchema = Type.Object(
  { programId: UuidSchema },
  { additionalProperties: false },
);

export const SessionParamsSchema = Type.Object(
  { sessionId: UuidSchema },
  { additionalProperties: false },
);

export const ProblemResponseSchema = Type.Object(
  {
    code: Type.String({ minLength: 1 }),
    message: Type.String({ minLength: 1 }),
    field_errors: Type.Optional(Type.Record(Type.String(), Type.String())),
  },
  { additionalProperties: false, $id: 'ProblemResponse' },
);

export type CatalogContext = Static<typeof CatalogContextSchema>;
export type RegistrationStatus = Static<typeof RegistrationStatusSchema>;
export type RegistrationSource = Static<typeof RegistrationSourceSchema>;
export type RegisteredCamper = Static<typeof RegisteredCamperSchema>;
export type SessionSummary = Static<typeof SessionSummarySchema>;
export type SessionDetail = Static<typeof SessionDetailSchema>;
export type SessionListResponse = Static<typeof SessionListResponseSchema>;
export type SessionUpdate = Static<typeof SessionUpdateSchema>;
export type SessionCreate = Static<typeof SessionCreateSchema>;
export type SeasonCreate = Static<typeof SeasonCreateSchema>;
export type ProgramCreate = Static<typeof ProgramCreateSchema>;
export type ProgramUpdate = Static<typeof ProgramUpdateSchema>;
export type ProgramParams = Static<typeof ProgramParamsSchema>;
export type SessionParams = Static<typeof SessionParamsSchema>;
export type ProblemResponse = Static<typeof ProblemResponseSchema>;
