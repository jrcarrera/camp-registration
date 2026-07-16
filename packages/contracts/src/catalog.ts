import { Type, type Static } from '@sinclair/typebox';

export const UuidSchema = Type.String({
  pattern: '^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$',
});

export const LocalDateSchema = Type.String({ pattern: '^\\d{4}-\\d{2}-\\d{2}$' });
export const UtcTimestampSchema = Type.String({
  pattern: '^\\d{4}-\\d{2}-\\d{2}T\\d{2}:\\d{2}:\\d{2}(?:\\.\\d{1,6})?Z$',
});

export const WaitlistOfferDurationHoursSchema = Type.Union([
  Type.Literal(24),
  Type.Literal(48),
  Type.Literal(72),
  Type.Literal(168),
]);

export const OrganizationFixtureSchema = Type.Object(
  {
    id: UuidSchema,
    slug: Type.String({ minLength: 1, pattern: '^[a-z0-9]+(?:-[a-z0-9]+)*$' }),
    name: Type.String({ minLength: 1 }),
    timezone: Type.String({ minLength: 1 }),
    waitlist_offer_duration_hours: WaitlistOfferDurationHoursSchema,
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
    default_minimum_age: Type.Integer({ minimum: 0, maximum: 120 }),
    default_maximum_age: Type.Integer({ minimum: 0, maximum: 120 }),
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
export const PaymentStatusSchema = Type.Union([
  Type.Literal('NOT_DUE'),
  Type.Literal('DEPOSIT_DUE'),
  Type.Literal('PARTIAL'),
  Type.Literal('PAID'),
]);
export const AttendanceStatusSchema = Type.Union([
  Type.Literal('NOT_MARKED'),
  Type.Literal('CHECKED_IN'),
  Type.Literal('CHECKED_OUT'),
  Type.Literal('ABSENT'),
]);
export const AttendanceActionSchema = Type.Union([
  Type.Literal('CHECK_IN'),
  Type.Literal('CHECK_OUT'),
  Type.Literal('MARK_ABSENT'),
]);

export const WaitlistOfferStatusSchema = Type.Union([
  Type.Literal('PENDING'),
  Type.Literal('ACCEPTED'),
  Type.Literal('DECLINED'),
  Type.Literal('EXPIRED'),
  Type.Literal('CANCELLED'),
]);

export const WaitlistOfferSchema = Type.Object(
  {
    id: UuidSchema,
    family_id: UuidSchema,
    registration_id: UuidSchema,
    session_id: UuidSchema,
    status: WaitlistOfferStatusSchema,
    offered_at: UtcTimestampSchema,
    expires_at: UtcTimestampSchema,
    responded_at: Type.Union([UtcTimestampSchema, Type.Null()]),
  },
  { additionalProperties: false },
);

export const WaitlistOfferCreateSchema = Type.Object(
  {
    expires_in_hours: Type.Optional(Type.Integer({ minimum: 1, maximum: 168 })),
  },
  { additionalProperties: false, $id: 'WaitlistOfferCreate' },
);

export const OrganizationSettingsUpdateSchema = Type.Object(
  {
    waitlist_offer_duration_hours: WaitlistOfferDurationHoursSchema,
  },
  { additionalProperties: false, $id: 'OrganizationSettingsUpdate' },
);

export const WaitlistOfferParamsSchema = Type.Object(
  {
    offerId: UuidSchema,
    sessionId: UuidSchema,
  },
  { additionalProperties: false, $id: 'WaitlistOfferParams' },
);

export const WaitlistOfferStaffActionCreateSchema = Type.Object(
  {
    reason: Type.Optional(Type.String({ minLength: 3, maxLength: 500 })),
  },
  { additionalProperties: false, $id: 'WaitlistOfferStaffActionCreate' },
);

export const WaitlistQueueOrderUpdateSchema = Type.Object(
  {
    expected_registration_ids: Type.Array(UuidSchema, {
      maxItems: 500,
      minItems: 1,
      uniqueItems: true,
    }),
    reason: Type.String({ maxLength: 500, minLength: 3 }),
    registration_ids: Type.Array(UuidSchema, {
      maxItems: 500,
      minItems: 1,
      uniqueItems: true,
    }),
  },
  { additionalProperties: false, $id: 'WaitlistQueueOrderUpdate' },
);

export const WaitlistQueueOrderResultSchema = Type.Object(
  {
    registration_ids: Type.Array(UuidSchema, { minItems: 1, uniqueItems: true }),
    session_id: UuidSchema,
    updated_at: UtcTimestampSchema,
  },
  { additionalProperties: false, $id: 'WaitlistQueueOrderResult' },
);

export const RegisteredCamperSchema = Type.Object(
  {
    amount_paid_cents: Type.Integer({ minimum: 0 }),
    attendance_date: Type.Union([LocalDateSchema, Type.Null()]),
    attendance_note: Type.Union([Type.String({ minLength: 1 }), Type.Null()]),
    attendance_status: AttendanceStatusSchema,
    authorized_pickup_names: Type.Array(Type.String({ minLength: 1 })),
    balance_due_cents: Type.Integer({ minimum: 0 }),
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
    currency: Type.Literal('USD'),
    deposit_cents: Type.Integer({ minimum: 0 }),
    deposit_due_cents: Type.Integer({ minimum: 0 }),
    checked_in_at: Type.Union([UtcTimestampSchema, Type.Null()]),
    checked_out_at: Type.Union([UtcTimestampSchema, Type.Null()]),
    payment_status: PaymentStatusSchema,
    pickup_name: Type.Union([Type.String({ minLength: 1 }), Type.Null()]),
    price_cents: Type.Integer({ minimum: 0 }),
    registered_at: UtcTimestampSchema,
    waitlist_position: Type.Optional(Type.Union([Type.Integer({ minimum: 1 }), Type.Null()])),
    waitlist_offer: Type.Optional(Type.Union([WaitlistOfferSchema, Type.Null()])),
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
    minimum_age: Type.Integer({ minimum: 0, maximum: 120 }),
    maximum_age: Type.Integer({ minimum: 0, maximum: 120 }),
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
        minimum_age: Type.Integer({ minimum: 0, maximum: 120 }),
        maximum_age: Type.Integer({ minimum: 0, maximum: 120 }),
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
    minimum_age: Type.Integer({ minimum: 0, maximum: 120 }),
    maximum_age: Type.Integer({ minimum: 0, maximum: 120 }),
    age_as_of: AgeAsOfSchema,
    price_cents: Type.Integer({ minimum: 0 }),
    deposit_cents: Type.Integer({ minimum: 0 }),
    waitlist_enabled: Type.Boolean(),
    status: SessionStatusSchema,
  },
  { additionalProperties: false, $id: 'SessionUpdate' },
);

export const SessionAttendanceUpdateSchema = Type.Object(
  {
    action: AttendanceActionSchema,
    attendance_date: Type.Optional(LocalDateSchema),
    note: Type.Optional(Type.Union([Type.String({ minLength: 1, maxLength: 500 }), Type.Null()])),
    pickup_name: Type.Optional(
      Type.Union([Type.String({ minLength: 1, maxLength: 160 }), Type.Null()]),
    ),
  },
  { additionalProperties: false, $id: 'SessionAttendanceUpdate' },
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
    default_minimum_age: Type.Integer({ minimum: 0, maximum: 120 }),
    default_maximum_age: Type.Integer({ minimum: 0, maximum: 120 }),
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
    default_minimum_age: Type.Integer({ minimum: 0, maximum: 120 }),
    default_maximum_age: Type.Integer({ minimum: 0, maximum: 120 }),
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

export const SessionRegistrationParamsSchema = Type.Object(
  { registrationId: UuidSchema, sessionId: UuidSchema },
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
export type OrganizationSettingsUpdate = Static<typeof OrganizationSettingsUpdateSchema>;
export type RegistrationStatus = Static<typeof RegistrationStatusSchema>;
export type RegistrationSource = Static<typeof RegistrationSourceSchema>;
export type AttendanceAction = Static<typeof AttendanceActionSchema>;
export type AttendanceStatus = Static<typeof AttendanceStatusSchema>;
export type WaitlistOffer = Static<typeof WaitlistOfferSchema>;
export type WaitlistOfferDurationHours = Static<typeof WaitlistOfferDurationHoursSchema>;
export type WaitlistOfferCreate = Static<typeof WaitlistOfferCreateSchema>;
export type WaitlistOfferParams = Static<typeof WaitlistOfferParamsSchema>;
export type WaitlistOfferStaffActionCreate = Static<typeof WaitlistOfferStaffActionCreateSchema>;
export type WaitlistQueueOrderUpdate = Static<typeof WaitlistQueueOrderUpdateSchema>;
export type WaitlistQueueOrderResult = Static<typeof WaitlistQueueOrderResultSchema>;
export type RegisteredCamper = Static<typeof RegisteredCamperSchema>;
export type SessionSummary = Static<typeof SessionSummarySchema>;
export type SessionDetail = Static<typeof SessionDetailSchema>;
export type SessionListResponse = Static<typeof SessionListResponseSchema>;
export type SessionUpdate = Static<typeof SessionUpdateSchema>;
export type SessionAttendanceUpdate = Static<typeof SessionAttendanceUpdateSchema>;
export type SessionCreate = Static<typeof SessionCreateSchema>;
export type SeasonCreate = Static<typeof SeasonCreateSchema>;
export type ProgramCreate = Static<typeof ProgramCreateSchema>;
export type ProgramUpdate = Static<typeof ProgramUpdateSchema>;
export type ProgramParams = Static<typeof ProgramParamsSchema>;
export type SessionRegistrationParams = Static<typeof SessionRegistrationParamsSchema>;
export type SessionParams = Static<typeof SessionParamsSchema>;
export type ProblemResponse = Static<typeof ProblemResponseSchema>;
