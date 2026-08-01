import { Type, type Static } from '@sinclair/typebox';

import { UtcTimestampSchema, UuidSchema } from './catalog.js';

export const MedicationScheduleTypeSchema = Type.Union([
  Type.Literal('SCHEDULED'),
  Type.Literal('PRN'),
]);

export const MedicationOrderStatusSchema = Type.Union([
  Type.Literal('ACTIVE'),
  Type.Literal('DISCONTINUED'),
]);

export const MedicationAdministrationOutcomeSchema = Type.Union([
  Type.Literal('GIVEN'),
  Type.Literal('REFUSED'),
  Type.Literal('HELD'),
  Type.Literal('MISSED'),
]);

const LocalDateSchema = Type.String({ pattern: '^\\d{4}-\\d{2}-\\d{2}$' });
const LocalTimeSchema = Type.String({ pattern: '^(?:[01]\\d|2[0-3]):[0-5]\\d$' });

export const MedicationCandidateSchema = Type.Object(
  {
    camper_id: UuidSchema,
    camper_name: Type.String({ minLength: 1 }),
    family_name: Type.String({ minLength: 1 }),
    session_id: UuidSchema,
    session_name: Type.String({ minLength: 1 }),
  },
  { additionalProperties: false },
);

export const MedicationOrderSchema = Type.Object(
  {
    administration_times: Type.Array(LocalTimeSchema, { maxItems: 8 }),
    camper_id: UuidSchema,
    camper_name: Type.String({ minLength: 1 }),
    created_at: UtcTimestampSchema,
    discontinued_at: Type.Union([UtcTimestampSchema, Type.Null()]),
    dose: Type.String({ minLength: 1, maxLength: 200 }),
    ends_on: LocalDateSchema,
    id: UuidSchema,
    instructions: Type.String({ maxLength: 2000 }),
    medication_name: Type.String({ minLength: 1, maxLength: 200 }),
    schedule_type: MedicationScheduleTypeSchema,
    session_id: UuidSchema,
    session_name: Type.String({ minLength: 1 }),
    starts_on: LocalDateSchema,
    status: MedicationOrderStatusSchema,
    version: Type.Integer({ minimum: 1 }),
  },
  { additionalProperties: false, $id: 'MedicationOrder' },
);

export const MedicationAdministrationSchema = Type.Object(
  {
    administered_at: UtcTimestampSchema,
    administered_by: Type.String({ minLength: 1 }),
    id: UuidSchema,
    note: Type.String({ maxLength: 2000 }),
    order_id: UuidSchema,
    outcome: MedicationAdministrationOutcomeSchema,
    scheduled_for: Type.Union([UtcTimestampSchema, Type.Null()]),
  },
  { additionalProperties: false },
);

export const MedicationScheduledDoseSchema = Type.Object(
  {
    administration: Type.Union([MedicationAdministrationSchema, Type.Null()]),
    order_id: UuidSchema,
    scheduled_for: UtcTimestampSchema,
  },
  { additionalProperties: false },
);

export const MedicationAdministrationCenterSchema = Type.Object(
  {
    administrations: Type.Array(MedicationAdministrationSchema),
    candidates: Type.Array(MedicationCandidateSchema),
    date: LocalDateSchema,
    orders: Type.Array(MedicationOrderSchema),
    scheduled_doses: Type.Array(MedicationScheduledDoseSchema),
    timezone: Type.String({ minLength: 1 }),
  },
  { additionalProperties: false, $id: 'MedicationAdministrationCenter' },
);

export const MedicationOrderCreateSchema = Type.Object(
  {
    administration_times: Type.Array(LocalTimeSchema, { maxItems: 8 }),
    camper_id: UuidSchema,
    dose: Type.String({ minLength: 1, maxLength: 200 }),
    ends_on: LocalDateSchema,
    instructions: Type.String({ maxLength: 2000 }),
    medication_name: Type.String({ minLength: 1, maxLength: 200 }),
    schedule_type: MedicationScheduleTypeSchema,
    session_id: UuidSchema,
    starts_on: LocalDateSchema,
  },
  { additionalProperties: false, $id: 'MedicationOrderCreate' },
);

export const MedicationAdministrationCreateSchema = Type.Object(
  {
    administered_at: UtcTimestampSchema,
    note: Type.String({ maxLength: 2000 }),
    outcome: MedicationAdministrationOutcomeSchema,
    scheduled_for: Type.Optional(Type.Union([UtcTimestampSchema, Type.Null()])),
  },
  { additionalProperties: false, $id: 'MedicationAdministrationCreate' },
);

export const MedicationOrderDiscontinueSchema = Type.Object(
  { version: Type.Integer({ minimum: 1 }) },
  { additionalProperties: false, $id: 'MedicationOrderDiscontinue' },
);

export const MedicationOrderParamsSchema = Type.Object(
  { orderId: UuidSchema },
  { additionalProperties: false },
);

export const MedicationAdministrationQuerySchema = Type.Object(
  {
    date: Type.Optional(LocalDateSchema),
    session_id: Type.Optional(UuidSchema),
  },
  { additionalProperties: false },
);

export type MedicationAdministration = Static<typeof MedicationAdministrationSchema>;
export type MedicationAdministrationCenter = Static<typeof MedicationAdministrationCenterSchema>;
export type MedicationAdministrationCreate = Static<typeof MedicationAdministrationCreateSchema>;
export type MedicationAdministrationOutcome = Static<typeof MedicationAdministrationOutcomeSchema>;
export type MedicationAdministrationQuery = Static<typeof MedicationAdministrationQuerySchema>;
export type MedicationCandidate = Static<typeof MedicationCandidateSchema>;
export type MedicationOrder = Static<typeof MedicationOrderSchema>;
export type MedicationOrderCreate = Static<typeof MedicationOrderCreateSchema>;
export type MedicationOrderDiscontinue = Static<typeof MedicationOrderDiscontinueSchema>;
export type MedicationOrderParams = Static<typeof MedicationOrderParamsSchema>;
export type MedicationOrderStatus = Static<typeof MedicationOrderStatusSchema>;
export type MedicationScheduleType = Static<typeof MedicationScheduleTypeSchema>;
export type MedicationScheduledDose = Static<typeof MedicationScheduledDoseSchema>;
