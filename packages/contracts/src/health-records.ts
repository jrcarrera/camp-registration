import { Type, type Static } from '@sinclair/typebox';

import { UtcTimestampSchema, UuidSchema } from './catalog.js';

export const HealthReviewStatusSchema = Type.Union([
  Type.Literal('DRAFT'),
  Type.Literal('SUBMITTED'),
  Type.Literal('NEEDS_CHANGES'),
  Type.Literal('APPROVED'),
]);

export const ImmunizationStatusSchema = Type.Union([
  Type.Literal('UNKNOWN'),
  Type.Literal('CURRENT'),
  Type.Literal('INCOMPLETE'),
  Type.Literal('EXEMPT'),
]);

const HealthTextListSchema = Type.Array(Type.String({ minLength: 1, maxLength: 500 }), {
  maxItems: 50,
});

export const HealthDocumentReferenceSchema = Type.Object(
  {
    label: Type.String({ minLength: 1, maxLength: 160 }),
    storage_reference: Type.String({ minLength: 1, maxLength: 500 }),
    type: Type.Union([
      Type.Literal('IMMUNIZATION'),
      Type.Literal('CARE_PLAN'),
      Type.Literal('MEDICATION_ORDER'),
      Type.Literal('OTHER'),
    ]),
  },
  { additionalProperties: false, $id: 'HealthDocumentReference' },
);

export const HealthRecordInputSchema = Type.Object(
  {
    accessibility_needs: HealthTextListSchema,
    allergies: HealthTextListSchema,
    dietary_needs: HealthTextListSchema,
    document_references: Type.Array(HealthDocumentReferenceSchema, { maxItems: 25 }),
    emergency_instructions: Type.String({ maxLength: 5000 }),
    immunization_notes: Type.String({ maxLength: 5000 }),
    immunization_status: ImmunizationStatusSchema,
    medications: HealthTextListSchema,
    version: Type.Optional(Type.Integer({ minimum: 1 })),
  },
  { additionalProperties: false, $id: 'HealthRecordInput' },
);

export const HealthRecordSummarySchema = Type.Object(
  {
    camper_id: UuidSchema,
    camper_name: Type.String(),
    family_id: UuidSchema,
    family_name: Type.String(),
    has_accessibility_needs: Type.Boolean(),
    has_allergies: Type.Boolean(),
    has_dietary_needs: Type.Boolean(),
    has_emergency_instructions: Type.Boolean(),
    has_medications: Type.Boolean(),
    immunization_status: ImmunizationStatusSchema,
    record_id: Type.Union([UuidSchema, Type.Null()]),
    review_status: HealthReviewStatusSchema,
    session_names: Type.Array(Type.String()),
    updated_at: Type.Union([UtcTimestampSchema, Type.Null()]),
  },
  { additionalProperties: false, $id: 'HealthRecordSummary' },
);

export const HealthRecordSchema = Type.Intersect(
  [
    HealthRecordSummarySchema,
    Type.Object({
      accessibility_needs: HealthTextListSchema,
      allergies: HealthTextListSchema,
      dietary_needs: HealthTextListSchema,
      document_references: Type.Array(HealthDocumentReferenceSchema),
      emergency_instructions: Type.String(),
      immunization_notes: Type.String(),
      medications: HealthTextListSchema,
      review_message: Type.String(),
      reviewed_at: Type.Union([UtcTimestampSchema, Type.Null()]),
      submitted_at: Type.Union([UtcTimestampSchema, Type.Null()]),
      version: Type.Integer({ minimum: 1 }),
    }),
  ],
  { $id: 'HealthRecord' },
);

export const HealthRecordCenterSchema = Type.Object(
  { records: Type.Array(HealthRecordSummarySchema) },
  { additionalProperties: false, $id: 'HealthRecordCenter' },
);

export const HealthRecordParamsSchema = Type.Object(
  { camperId: UuidSchema },
  { additionalProperties: false },
);

export const HealthRecordAccessQuerySchema = Type.Object(
  {
    break_glass: Type.Optional(Type.Boolean()),
    reason_code: Type.Optional(
      Type.Union([
        Type.Literal('EMERGENCY_CARE'),
        Type.Literal('CONTINUITY_OF_CARE'),
        Type.Literal('AUDIT_INVESTIGATION'),
      ]),
    ),
  },
  { additionalProperties: false },
);

export const HealthRecordReviewSchema = Type.Object(
  {
    review_message: Type.String({ maxLength: 1000 }),
    status: Type.Union([Type.Literal('APPROVED'), Type.Literal('NEEDS_CHANGES')]),
    version: Type.Integer({ minimum: 1 }),
  },
  { additionalProperties: false, $id: 'HealthRecordReview' },
);

export const HealthRecordSubmitSchema = Type.Object(
  { version: Type.Integer({ minimum: 1 }) },
  { additionalProperties: false, $id: 'HealthRecordSubmit' },
);

export const HealthRecordExportQuerySchema = Type.Object(
  { session_id: Type.Optional(UuidSchema) },
  { additionalProperties: false },
);

export type HealthDocumentReference = Static<typeof HealthDocumentReferenceSchema>;
export type HealthRecord = Static<typeof HealthRecordSchema>;
export type HealthRecordAccessQuery = Static<typeof HealthRecordAccessQuerySchema>;
export type HealthRecordCenter = Static<typeof HealthRecordCenterSchema>;
export type HealthRecordExportQuery = Static<typeof HealthRecordExportQuerySchema>;
export type HealthRecordInput = Static<typeof HealthRecordInputSchema>;
export type HealthRecordParams = Static<typeof HealthRecordParamsSchema>;
export type HealthRecordReview = Static<typeof HealthRecordReviewSchema>;
export type HealthRecordSubmit = Static<typeof HealthRecordSubmitSchema>;
export type HealthRecordSummary = Static<typeof HealthRecordSummarySchema>;
export type HealthReviewStatus = Static<typeof HealthReviewStatusSchema>;
export type ImmunizationStatus = Static<typeof ImmunizationStatusSchema>;
