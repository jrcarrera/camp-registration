import { Type, type Static } from '@sinclair/typebox';

import { UtcTimestampSchema, UuidSchema } from './catalog.js';

export const HealthIncidentTypeSchema = Type.Union([
  Type.Literal('INJURY'),
  Type.Literal('ILLNESS'),
  Type.Literal('SAFETY'),
  Type.Literal('BEHAVIORAL'),
  Type.Literal('OTHER'),
]);

export const HealthIncidentSeveritySchema = Type.Union([
  Type.Literal('MINOR'),
  Type.Literal('MODERATE'),
  Type.Literal('SERIOUS'),
]);

export const HealthIncidentStatusSchema = Type.Union([
  Type.Literal('OPEN'),
  Type.Literal('RESOLVED'),
]);

export const GuardianNotificationStatusSchema = Type.Union([
  Type.Literal('NOT_REQUIRED'),
  Type.Literal('PENDING'),
  Type.Literal('NOTIFIED'),
]);

export const HealthIncidentCandidateSchema = Type.Object(
  {
    camper_id: UuidSchema,
    camper_name: Type.String({ minLength: 1 }),
    family_name: Type.String({ minLength: 1 }),
    session_id: UuidSchema,
    session_name: Type.String({ minLength: 1 }),
  },
  { additionalProperties: false },
);

export const HealthIncidentSummarySchema = Type.Object(
  {
    camper_id: UuidSchema,
    camper_name: Type.String({ minLength: 1 }),
    created_at: UtcTimestampSchema,
    guardian_notification_status: GuardianNotificationStatusSchema,
    id: UuidSchema,
    incident_type: HealthIncidentTypeSchema,
    occurred_at: UtcTimestampSchema,
    resolved_at: Type.Union([UtcTimestampSchema, Type.Null()]),
    session_id: UuidSchema,
    session_name: Type.String({ minLength: 1 }),
    severity: HealthIncidentSeveritySchema,
    status: HealthIncidentStatusSchema,
    version: Type.Integer({ minimum: 1 }),
  },
  { additionalProperties: false, $id: 'HealthIncidentSummary' },
);

export const HealthIncidentEntrySchema = Type.Object(
  {
    created_at: UtcTimestampSchema,
    created_by: Type.String({ minLength: 1 }),
    entry_type: Type.Union([
      Type.Literal('FOLLOW_UP'),
      Type.Literal('GUARDIAN_NOTIFICATION'),
      Type.Literal('RESOLUTION'),
    ]),
    guardian_notified_at: Type.Union([UtcTimestampSchema, Type.Null()]),
    guardian_notified_to: Type.String({ maxLength: 200 }),
    id: UuidSchema,
    note: Type.String({ maxLength: 4000 }),
  },
  { additionalProperties: false },
);

export const HealthIncidentSchema = Type.Intersect(
  [
    HealthIncidentSummarySchema,
    Type.Object(
      {
        care_given: Type.String({ maxLength: 4000 }),
        entries: Type.Array(HealthIncidentEntrySchema),
        guardian_notified_at: Type.Union([UtcTimestampSchema, Type.Null()]),
        guardian_notified_to: Type.String({ maxLength: 200 }),
        location: Type.String({ minLength: 1, maxLength: 200 }),
        summary: Type.String({ minLength: 1, maxLength: 4000 }),
      },
      { additionalProperties: false },
    ),
  ],
  { $id: 'HealthIncident' },
);

export const HealthIncidentCenterSchema = Type.Object(
  {
    candidates: Type.Array(HealthIncidentCandidateSchema),
    incidents: Type.Array(HealthIncidentSummarySchema),
    timezone: Type.String({ minLength: 1 }),
  },
  { additionalProperties: false, $id: 'HealthIncidentCenter' },
);

export const HealthIncidentCreateSchema = Type.Object(
  {
    camper_id: UuidSchema,
    care_given: Type.String({ maxLength: 4000 }),
    guardian_notification_status: GuardianNotificationStatusSchema,
    guardian_notified_at: Type.Optional(Type.Union([UtcTimestampSchema, Type.Null()])),
    guardian_notified_to: Type.Optional(Type.String({ maxLength: 200 })),
    incident_type: HealthIncidentTypeSchema,
    location: Type.String({ minLength: 1, maxLength: 200 }),
    occurred_at: UtcTimestampSchema,
    session_id: UuidSchema,
    severity: HealthIncidentSeveritySchema,
    summary: Type.String({ minLength: 1, maxLength: 4000 }),
  },
  { additionalProperties: false, $id: 'HealthIncidentCreate' },
);

export const HealthIncidentEntryCreateSchema = Type.Object(
  {
    note: Type.String({ minLength: 1, maxLength: 4000 }),
    version: Type.Integer({ minimum: 1 }),
  },
  { additionalProperties: false, $id: 'HealthIncidentEntryCreate' },
);

export const HealthIncidentResolveSchema = Type.Object(
  {
    resolution: Type.String({ minLength: 1, maxLength: 4000 }),
    version: Type.Integer({ minimum: 1 }),
  },
  { additionalProperties: false, $id: 'HealthIncidentResolve' },
);

export const HealthIncidentGuardianNotificationCreateSchema = Type.Object(
  {
    guardian_notified_at: UtcTimestampSchema,
    guardian_notified_to: Type.String({ minLength: 1, maxLength: 200 }),
    note: Type.Optional(Type.String({ maxLength: 4000 })),
    version: Type.Integer({ minimum: 1 }),
  },
  { additionalProperties: false, $id: 'HealthIncidentGuardianNotificationCreate' },
);

export const HealthIncidentParamsSchema = Type.Object(
  { incidentId: UuidSchema },
  { additionalProperties: false },
);

export const HealthIncidentQuerySchema = Type.Object(
  {
    session_id: Type.Optional(UuidSchema),
    status: Type.Optional(HealthIncidentStatusSchema),
  },
  { additionalProperties: false },
);

export type GuardianNotificationStatus = Static<typeof GuardianNotificationStatusSchema>;
export type HealthIncident = Static<typeof HealthIncidentSchema>;
export type HealthIncidentCandidate = Static<typeof HealthIncidentCandidateSchema>;
export type HealthIncidentCenter = Static<typeof HealthIncidentCenterSchema>;
export type HealthIncidentCreate = Static<typeof HealthIncidentCreateSchema>;
export type HealthIncidentEntry = Static<typeof HealthIncidentEntrySchema>;
export type HealthIncidentEntryCreate = Static<typeof HealthIncidentEntryCreateSchema>;
export type HealthIncidentGuardianNotificationCreate = Static<
  typeof HealthIncidentGuardianNotificationCreateSchema
>;
export type HealthIncidentParams = Static<typeof HealthIncidentParamsSchema>;
export type HealthIncidentQuery = Static<typeof HealthIncidentQuerySchema>;
export type HealthIncidentResolve = Static<typeof HealthIncidentResolveSchema>;
export type HealthIncidentSeverity = Static<typeof HealthIncidentSeveritySchema>;
export type HealthIncidentStatus = Static<typeof HealthIncidentStatusSchema>;
export type HealthIncidentSummary = Static<typeof HealthIncidentSummarySchema>;
export type HealthIncidentType = Static<typeof HealthIncidentTypeSchema>;
