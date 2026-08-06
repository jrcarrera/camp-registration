import { Type, type Static } from '@sinclair/typebox';

import { LocalDateSchema, UtcTimestampSchema, UuidSchema } from './catalog.js';

export const WorkforceTypeSchema = Type.Union([Type.Literal('STAFF'), Type.Literal('VOLUNTEER')]);
export const WorkforceProfileStatusSchema = Type.Union([
  Type.Literal('PLANNED'),
  Type.Literal('ACTIVE'),
  Type.Literal('INACTIVE'),
]);
export const WorkforceAssignmentStatusSchema = Type.Union([
  Type.Literal('PLANNED'),
  Type.Literal('CONFIRMED'),
  Type.Literal('CANCELLED'),
]);

const NameSchema = Type.String({ minLength: 1, maxLength: 100 });
const EmailSchema = Type.String({ minLength: 3, maxLength: 320, pattern: '^\\S+@\\S+\\.\\S+$' });
const PhoneSchema = Type.String({ minLength: 1, maxLength: 50 });
const PositionSchema = Type.String({ minLength: 1, maxLength: 100 });
const VersionSchema = Type.Integer({ minimum: 1 });

export const WorkforceAssignmentSchema = Type.Object(
  {
    created_at: UtcTimestampSchema,
    ends_on: LocalDateSchema,
    id: UuidSchema,
    position_name: PositionSchema,
    session_ends_on: LocalDateSchema,
    session_id: UuidSchema,
    session_name: NameSchema,
    session_starts_on: LocalDateSchema,
    starts_on: LocalDateSchema,
    status: WorkforceAssignmentStatusSchema,
    updated_at: UtcTimestampSchema,
    version: VersionSchema,
  },
  { additionalProperties: false },
);

export const WorkforceProfileSummarySchema = Type.Object(
  {
    assignment_count: Type.Integer({ minimum: 0 }),
    current_session_names: Type.Array(NameSchema, { maxItems: 20 }),
    display_name: NameSchema,
    first_name: NameSchema,
    id: UuidSchema,
    last_name: NameSchema,
    next_session_names: Type.Array(NameSchema, { maxItems: 20 }),
    preferred_name: Type.Union([NameSchema, Type.Null()]),
    status: WorkforceProfileStatusSchema,
    version: VersionSchema,
    workforce_type: WorkforceTypeSchema,
  },
  { additionalProperties: false },
);

export const WorkforceProfileDetailSchema = Type.Object(
  {
    account_linked: Type.Boolean(),
    assignment_count: Type.Integer({ minimum: 0 }),
    assignments: Type.Array(WorkforceAssignmentSchema, { maxItems: 500 }),
    current_session_names: Type.Array(NameSchema, { maxItems: 20 }),
    display_name: NameSchema,
    email: EmailSchema,
    first_name: NameSchema,
    id: UuidSchema,
    last_name: NameSchema,
    next_session_names: Type.Array(NameSchema, { maxItems: 20 }),
    phone: Type.Union([PhoneSchema, Type.Null()]),
    preferred_name: Type.Union([NameSchema, Type.Null()]),
    status: WorkforceProfileStatusSchema,
    version: VersionSchema,
    workforce_type: WorkforceTypeSchema,
  },
  { additionalProperties: false, $id: 'WorkforceProfileDetail' },
);

export const WorkforceProfileCreateSchema = Type.Object(
  {
    email: EmailSchema,
    first_name: NameSchema,
    last_name: NameSchema,
    phone: Type.Optional(Type.Union([PhoneSchema, Type.Null()])),
    preferred_name: Type.Optional(Type.Union([NameSchema, Type.Null()])),
    status: WorkforceProfileStatusSchema,
    workforce_type: WorkforceTypeSchema,
  },
  { additionalProperties: false, $id: 'WorkforceProfileCreate' },
);

export const WorkforceProfileUpdateSchema = Type.Object(
  {
    email: EmailSchema,
    first_name: NameSchema,
    last_name: NameSchema,
    phone: Type.Optional(Type.Union([PhoneSchema, Type.Null()])),
    preferred_name: Type.Optional(Type.Union([NameSchema, Type.Null()])),
    status: WorkforceProfileStatusSchema,
    version: VersionSchema,
    workforce_type: WorkforceTypeSchema,
  },
  { additionalProperties: false, $id: 'WorkforceProfileUpdate' },
);

export const WorkforceAccountLinkSchema = Type.Object(
  { version: VersionSchema },
  { additionalProperties: false, $id: 'WorkforceAccountLink' },
);

export const WorkforceAssignmentCreateSchema = Type.Object(
  {
    ends_on: LocalDateSchema,
    position_name: PositionSchema,
    session_id: UuidSchema,
    starts_on: LocalDateSchema,
    status: WorkforceAssignmentStatusSchema,
  },
  { additionalProperties: false, $id: 'WorkforceAssignmentCreate' },
);

export const WorkforceAssignmentUpdateSchema = Type.Object(
  {
    ends_on: LocalDateSchema,
    position_name: PositionSchema,
    session_id: UuidSchema,
    starts_on: LocalDateSchema,
    status: WorkforceAssignmentStatusSchema,
    version: VersionSchema,
  },
  { additionalProperties: false, $id: 'WorkforceAssignmentUpdate' },
);

export const WorkforceProfileParamsSchema = Type.Object(
  { profileId: UuidSchema },
  { additionalProperties: false },
);
export const WorkforceAssignmentParamsSchema = Type.Object(
  { assignmentId: UuidSchema, profileId: UuidSchema },
  { additionalProperties: false },
);
export const WorkforceListQuerySchema = Type.Object(
  {
    page: Type.Optional(Type.Integer({ default: 1, minimum: 1 })),
    page_size: Type.Optional(Type.Integer({ default: 50, maximum: 200, minimum: 1 })),
    search: Type.Optional(Type.String({ maxLength: 100, minLength: 1 })),
    season_id: Type.Optional(UuidSchema),
    session_id: Type.Optional(UuidSchema),
    status: Type.Optional(WorkforceProfileStatusSchema),
    workforce_type: Type.Optional(WorkforceTypeSchema),
  },
  { additionalProperties: false },
);
export const WorkforceListResponseSchema = Type.Object(
  {
    page: Type.Integer({ minimum: 1 }),
    page_size: Type.Integer({ minimum: 1, maximum: 200 }),
    profiles: Type.Array(WorkforceProfileSummarySchema),
    total: Type.Integer({ minimum: 0 }),
  },
  { additionalProperties: false, $id: 'WorkforceListResponse' },
);
export const SessionWorkforceRosterSchema = Type.Object(
  {
    assignments: Type.Array(
      Type.Object(
        {
          display_name: NameSchema,
          ends_on: LocalDateSchema,
          position_name: PositionSchema,
          starts_on: LocalDateSchema,
          status: WorkforceAssignmentStatusSchema,
          workforce_type: WorkforceTypeSchema,
        },
        { additionalProperties: false },
      ),
    ),
    ends_on: LocalDateSchema,
    session_id: UuidSchema,
    session_name: NameSchema,
    starts_on: LocalDateSchema,
  },
  { additionalProperties: false, $id: 'SessionWorkforceRoster' },
);

export type WorkforceAccountLink = Static<typeof WorkforceAccountLinkSchema>;
export type WorkforceAssignment = Static<typeof WorkforceAssignmentSchema>;
export type WorkforceAssignmentCreate = Static<typeof WorkforceAssignmentCreateSchema>;
export type WorkforceAssignmentUpdate = Static<typeof WorkforceAssignmentUpdateSchema>;
export type WorkforceListQuery = Static<typeof WorkforceListQuerySchema>;
export type WorkforceListResponse = Static<typeof WorkforceListResponseSchema>;
export type WorkforceProfileCreate = Static<typeof WorkforceProfileCreateSchema>;
export type WorkforceProfileDetail = Static<typeof WorkforceProfileDetailSchema>;
export type WorkforceProfileParams = Static<typeof WorkforceProfileParamsSchema>;
export type WorkforceProfileStatus = Static<typeof WorkforceProfileStatusSchema>;
export type WorkforceProfileSummary = Static<typeof WorkforceProfileSummarySchema>;
export type WorkforceProfileUpdate = Static<typeof WorkforceProfileUpdateSchema>;
export type WorkforceType = Static<typeof WorkforceTypeSchema>;
export type SessionWorkforceRoster = Static<typeof SessionWorkforceRosterSchema>;
