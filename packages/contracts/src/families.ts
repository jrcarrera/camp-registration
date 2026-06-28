import { Type, type Static } from '@sinclair/typebox';

import { LocalDateSchema, UtcTimestampSchema, UuidSchema } from './catalog.js';

const EmailSchema = Type.String({
  maxLength: 254,
  pattern: '^[^@\\s]+@[^@\\s]+\\.[^@\\s]+$',
});

const GenderSchema = Type.Union([Type.Literal('Female'), Type.Literal('Male')]);
const RegistrationStatusSchema = Type.Union([
  Type.Literal('CONFIRMED'),
  Type.Literal('WAITLISTED'),
  Type.Literal('CANCELLED'),
]);
const RegistrationSourceSchema = Type.Union([Type.Literal('ADMIN'), Type.Literal('PARENT')]);

export const CamperSessionRegistrationSchema = Type.Object(
  {
    registration_id: UuidSchema,
    session_id: UuidSchema,
    session_code: Type.String({ minLength: 1 }),
    session_name: Type.String({ minLength: 1 }),
    program_name: Type.String({ minLength: 1 }),
    starts_on: LocalDateSchema,
    ends_on: LocalDateSchema,
    status: RegistrationStatusSchema,
    source: RegistrationSourceSchema,
    registered_at: UtcTimestampSchema,
  },
  { additionalProperties: false, $id: 'CamperSessionRegistration' },
);

const FamilyRegistrationResultRegistrationSchema = Type.Object(
  {
    registration_id: UuidSchema,
    session_id: UuidSchema,
    session_code: Type.String({ minLength: 1 }),
    session_name: Type.String({ minLength: 1 }),
    program_name: Type.String({ minLength: 1 }),
    starts_on: LocalDateSchema,
    ends_on: LocalDateSchema,
    status: RegistrationStatusSchema,
    source: RegistrationSourceSchema,
    registered_at: UtcTimestampSchema,
  },
  { additionalProperties: false },
);

export const FamilySummarySchema = Type.Object(
  {
    id: UuidSchema,
    organization_id: UuidSchema,
    family_name: Type.String({ minLength: 1 }),
    adult_count: Type.Integer({ minimum: 0 }),
    camper_count: Type.Integer({ minimum: 0 }),
    contact_count: Type.Integer({ minimum: 0 }),
    version: Type.Integer({ minimum: 1 }),
    updated_at: UtcTimestampSchema,
  },
  { additionalProperties: false, $id: 'FamilySummary' },
);

export const AdultSchema = Type.Object(
  {
    id: UuidSchema,
    organization_id: UuidSchema,
    family_id: UuidSchema,
    identity_subject: Type.Union([Type.String({ minLength: 1 }), Type.Null()]),
    first_name: Type.String({ minLength: 1 }),
    last_name: Type.String({ minLength: 1 }),
    email: Type.Union([EmailSchema, Type.Null()]),
    phone: Type.Union([Type.String({ minLength: 1 }), Type.Null()]),
    account_owner: Type.Boolean(),
    can_manage_family: Type.Boolean(),
    can_register: Type.Boolean(),
    can_make_payments: Type.Boolean(),
    emergency_contact: Type.Boolean(),
    authorized_pickup: Type.Boolean(),
    receives_operational_communication: Type.Boolean(),
    version: Type.Integer({ minimum: 1 }),
    updated_at: UtcTimestampSchema,
  },
  { additionalProperties: false, $id: 'Adult' },
);

export const CamperSchema = Type.Object(
  {
    id: UuidSchema,
    organization_id: UuidSchema,
    family_id: UuidSchema,
    first_name: Type.String({ minLength: 1 }),
    last_name: Type.String({ minLength: 1 }),
    birth_date: LocalDateSchema,
    preferred_name: Type.Union([Type.String({ minLength: 1 }), Type.Null()]),
    gender: Type.Union([GenderSchema, Type.Null()]),
    school_grade: Type.Union([Type.String({ minLength: 1 }), Type.Null()]),
    cabin_preference: Type.Union([Type.String({ minLength: 1 }), Type.Null()]),
    accessibility_needs: Type.Union([Type.String({ minLength: 1 }), Type.Null()]),
    registrations: Type.Array(CamperSessionRegistrationSchema),
    version: Type.Integer({ minimum: 1 }),
    updated_at: UtcTimestampSchema,
  },
  { additionalProperties: false, $id: 'Camper' },
);

export const ContactSchema = Type.Object(
  {
    id: UuidSchema,
    organization_id: UuidSchema,
    family_id: UuidSchema,
    first_name: Type.String({ minLength: 1 }),
    last_name: Type.String({ minLength: 1 }),
    phone: Type.String({ minLength: 1 }),
    relationship: Type.String({ minLength: 1 }),
    emergency_contact: Type.Boolean(),
    authorized_pickup: Type.Boolean(),
    receives_operational_communication: Type.Boolean(),
    emergency_priority: Type.Union([Type.Integer({ minimum: 1 }), Type.Null()]),
    version: Type.Integer({ minimum: 1 }),
    updated_at: UtcTimestampSchema,
  },
  { additionalProperties: false, $id: 'Contact' },
);

export const FamilyDetailSchema = Type.Composite(
  [
    FamilySummarySchema,
    Type.Object(
      {
        adults: Type.Array(AdultSchema),
        campers: Type.Array(CamperSchema),
        contacts: Type.Array(ContactSchema),
      },
      { additionalProperties: false },
    ),
  ],
  { $id: 'FamilyDetail' },
);

export const FamilyListResponseSchema = Type.Object(
  {
    families: Type.Array(FamilySummarySchema),
  },
  { additionalProperties: false, $id: 'FamilyListResponse' },
);

export const FamilyRegistrationCreateSchema = Type.Object(
  {
    camper_id: UuidSchema,
    session_id: UuidSchema,
    source: RegistrationSourceSchema,
  },
  { additionalProperties: false, $id: 'FamilyRegistrationCreate' },
);

export const FamilyRegistrationResultSchema = Type.Object(
  {
    family: FamilyDetailSchema,
    registration: FamilyRegistrationResultRegistrationSchema,
  },
  { additionalProperties: false, $id: 'FamilyRegistrationResult' },
);

export const FamilyCreateSchema = Type.Object(
  {
    family_name: Type.String({ minLength: 1, maxLength: 160 }),
  },
  { additionalProperties: false, $id: 'FamilyCreate' },
);

export const FamilyUpdateSchema = Type.Object(
  {
    family_name: Type.String({ minLength: 1, maxLength: 160 }),
    version: Type.Integer({ minimum: 1 }),
  },
  { additionalProperties: false, $id: 'FamilyUpdate' },
);

export const AdultCreateSchema = Type.Object(
  {
    first_name: Type.String({ minLength: 1, maxLength: 100 }),
    last_name: Type.String({ minLength: 1, maxLength: 100 }),
    email: Type.Optional(Type.Union([EmailSchema, Type.Null()])),
    phone: Type.Optional(Type.Union([Type.String({ minLength: 1, maxLength: 40 }), Type.Null()])),
    account_owner: Type.Boolean(),
    can_manage_family: Type.Boolean(),
    can_register: Type.Boolean(),
    can_make_payments: Type.Boolean(),
    emergency_contact: Type.Boolean(),
    authorized_pickup: Type.Boolean(),
    receives_operational_communication: Type.Boolean(),
  },
  { additionalProperties: false, $id: 'AdultCreate' },
);

export const AdultUpdateSchema = Type.Composite(
  [
    AdultCreateSchema,
    Type.Object({ version: Type.Integer({ minimum: 1 }) }, { additionalProperties: false }),
  ],
  { $id: 'AdultUpdate' },
);

export const CamperCreateSchema = Type.Object(
  {
    first_name: Type.String({ minLength: 1, maxLength: 100 }),
    last_name: Type.String({ minLength: 1, maxLength: 100 }),
    birth_date: LocalDateSchema,
    preferred_name: Type.Optional(
      Type.Union([Type.String({ minLength: 1, maxLength: 100 }), Type.Null()]),
    ),
    gender: Type.Optional(Type.Union([GenderSchema, Type.Null()])),
    school_grade: Type.Optional(
      Type.Union([Type.String({ minLength: 1, maxLength: 40 }), Type.Null()]),
    ),
    cabin_preference: Type.Optional(
      Type.Union([Type.String({ minLength: 1, maxLength: 160 }), Type.Null()]),
    ),
    accessibility_needs: Type.Optional(
      Type.Union([Type.String({ minLength: 1, maxLength: 500 }), Type.Null()]),
    ),
  },
  { additionalProperties: false, $id: 'CamperCreate' },
);

export const CamperUpdateSchema = Type.Composite(
  [
    CamperCreateSchema,
    Type.Object({ version: Type.Integer({ minimum: 1 }) }, { additionalProperties: false }),
  ],
  { $id: 'CamperUpdate' },
);

export const ContactCreateSchema = Type.Object(
  {
    first_name: Type.String({ minLength: 1, maxLength: 100 }),
    last_name: Type.String({ minLength: 1, maxLength: 100 }),
    phone: Type.String({ minLength: 1, maxLength: 40 }),
    relationship: Type.String({ minLength: 1, maxLength: 80 }),
    emergency_contact: Type.Boolean(),
    authorized_pickup: Type.Boolean(),
    receives_operational_communication: Type.Boolean(),
    emergency_priority: Type.Optional(Type.Union([Type.Integer({ minimum: 1 }), Type.Null()])),
  },
  { additionalProperties: false, $id: 'ContactCreate' },
);

export const ContactUpdateSchema = Type.Composite(
  [
    ContactCreateSchema,
    Type.Object({ version: Type.Integer({ minimum: 1 }) }, { additionalProperties: false }),
  ],
  { $id: 'ContactUpdate' },
);

export const FamilyParamsSchema = Type.Object(
  { familyId: UuidSchema },
  { additionalProperties: false },
);

export const AdultParamsSchema = Type.Object(
  { adultId: UuidSchema, familyId: UuidSchema },
  { additionalProperties: false },
);

export const CamperParamsSchema = Type.Object(
  { camperId: UuidSchema, familyId: UuidSchema },
  { additionalProperties: false },
);

export const ContactParamsSchema = Type.Object(
  { contactId: UuidSchema, familyId: UuidSchema },
  { additionalProperties: false },
);

export type FamilySummary = Static<typeof FamilySummarySchema>;
export type Adult = Static<typeof AdultSchema>;
export type CamperSessionRegistration = Static<typeof CamperSessionRegistrationSchema>;
export type Camper = Static<typeof CamperSchema>;
export type Contact = Static<typeof ContactSchema>;
export type FamilyDetail = Static<typeof FamilyDetailSchema>;
export type FamilyListResponse = Static<typeof FamilyListResponseSchema>;
export type FamilyRegistrationCreate = Static<typeof FamilyRegistrationCreateSchema>;
export type FamilyRegistrationResult = Static<typeof FamilyRegistrationResultSchema>;
export type FamilyCreate = Static<typeof FamilyCreateSchema>;
export type FamilyUpdate = Static<typeof FamilyUpdateSchema>;
export type AdultCreate = Static<typeof AdultCreateSchema>;
export type AdultUpdate = Static<typeof AdultUpdateSchema>;
export type CamperCreate = Static<typeof CamperCreateSchema>;
export type CamperUpdate = Static<typeof CamperUpdateSchema>;
export type ContactCreate = Static<typeof ContactCreateSchema>;
export type ContactUpdate = Static<typeof ContactUpdateSchema>;
export type FamilyParams = Static<typeof FamilyParamsSchema>;
export type AdultParams = Static<typeof AdultParamsSchema>;
export type CamperParams = Static<typeof CamperParamsSchema>;
export type ContactParams = Static<typeof ContactParamsSchema>;
