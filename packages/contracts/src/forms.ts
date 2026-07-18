import { Type, type Static } from '@sinclair/typebox';

import { UtcTimestampSchema, UuidSchema } from './catalog.js';

export const FormFieldTypeSchema = Type.Union([
  Type.Literal('TEXT'),
  Type.Literal('SINGLE_CHOICE'),
  Type.Literal('DATE'),
  Type.Literal('ACKNOWLEDGEMENT'),
  Type.Literal('SIGNATURE'),
]);

export const FormFieldSchema = Type.Object(
  {
    id: Type.String({ minLength: 2, maxLength: 50, pattern: '^[a-z][a-z0-9_]*$' }),
    label: Type.String({ minLength: 1, maxLength: 300 }),
    options: Type.Array(Type.String({ minLength: 1, maxLength: 200 }), { maxItems: 25 }),
    required: Type.Boolean(),
    type: FormFieldTypeSchema,
  },
  { additionalProperties: false, $id: 'FormField' },
);

export const FormTemplateCreateSchema = Type.Object(
  {
    description: Type.String({ maxLength: 2000 }),
    fields: Type.Array(FormFieldSchema, { minItems: 1, maxItems: 50 }),
    name: Type.String({ minLength: 1, maxLength: 200 }),
  },
  { additionalProperties: false, $id: 'FormTemplateCreate' },
);

export const FormTemplateUpdateSchema = Type.Intersect(
  [FormTemplateCreateSchema, Type.Object({ version: Type.Integer({ minimum: 1 }) })],
  { $id: 'FormTemplateUpdate' },
);

export const FormTemplateParamsSchema = Type.Object(
  { templateId: UuidSchema },
  { additionalProperties: false },
);

export const FormPublishCreateSchema = Type.Object(
  {
    due_at: Type.Union([UtcTimestampSchema, Type.Null()]),
    session_ids: Type.Array(UuidSchema, { minItems: 1, maxItems: 100 }),
    version: Type.Integer({ minimum: 1 }),
  },
  { additionalProperties: false, $id: 'FormPublishCreate' },
);

export const FormAssignmentSummarySchema = Type.Object(
  {
    completed_count: Type.Integer({ minimum: 0 }),
    due_at: Type.Union([UtcTimestampSchema, Type.Null()]),
    id: UuidSchema,
    session_id: UuidSchema,
    session_name: Type.String({ minLength: 1 }),
    total_count: Type.Integer({ minimum: 0 }),
  },
  { additionalProperties: false },
);

export const FormPublishedVersionSchema = Type.Object(
  {
    assignments: Type.Array(FormAssignmentSummarySchema),
    id: UuidSchema,
    published_at: UtcTimestampSchema,
    version_number: Type.Integer({ minimum: 1 }),
  },
  { additionalProperties: false },
);

export const FormTemplateSchema = Type.Object(
  {
    description: Type.String(),
    fields: Type.Array(FormFieldSchema),
    id: UuidSchema,
    name: Type.String({ minLength: 1 }),
    published_versions: Type.Array(FormPublishedVersionSchema),
    updated_at: UtcTimestampSchema,
    version: Type.Integer({ minimum: 1 }),
  },
  { additionalProperties: false, $id: 'FormTemplate' },
);

export const FormTemplatesResponseSchema = Type.Object(
  { templates: Type.Array(FormTemplateSchema) },
  { additionalProperties: false, $id: 'FormTemplatesResponse' },
);

// Boolean comes first so Fastify/Ajv does not coerce acknowledgement values to strings.
export const FormResponseValueSchema = Type.Union([
  Type.Boolean(),
  Type.String({ maxLength: 10000 }),
]);
export const FormResponsesSchema = Type.Record(Type.String(), FormResponseValueSchema);

export const FormSubmissionSchema = Type.Object(
  {
    responses: FormResponsesSchema,
    signer_name: Type.Union([Type.String({ minLength: 1 }), Type.Null()]),
    status: Type.Union([Type.Literal('DRAFT'), Type.Literal('SUBMITTED')]),
    submitted_at: Type.Union([UtcTimestampSchema, Type.Null()]),
    version: Type.Integer({ minimum: 1 }),
  },
  { additionalProperties: false },
);

export const ParentFormObligationSchema = Type.Object(
  {
    assignment_id: UuidSchema,
    camper_name: Type.String({ minLength: 1 }),
    description: Type.String(),
    due_at: Type.Union([UtcTimestampSchema, Type.Null()]),
    fields: Type.Array(FormFieldSchema),
    form_name: Type.String({ minLength: 1 }),
    form_version: Type.Integer({ minimum: 1 }),
    registration_id: UuidSchema,
    session_name: Type.String({ minLength: 1 }),
    submission: Type.Union([FormSubmissionSchema, Type.Null()]),
  },
  { additionalProperties: false, $id: 'ParentFormObligation' },
);

export const ParentFormObligationsResponseSchema = Type.Object(
  { obligations: Type.Array(ParentFormObligationSchema) },
  { additionalProperties: false, $id: 'ParentFormObligationsResponse' },
);

export const ParentFormSubmissionParamsSchema = Type.Object(
  { assignmentId: UuidSchema, registrationId: UuidSchema },
  { additionalProperties: false },
);

export const ParentFormSubmissionUpdateSchema = Type.Object(
  {
    responses: FormResponsesSchema,
    signer_name: Type.Union([Type.String({ maxLength: 200 }), Type.Null()]),
    submit: Type.Boolean(),
    version: Type.Integer({ minimum: 0 }),
  },
  { additionalProperties: false, $id: 'ParentFormSubmissionUpdate' },
);

export type FormField = Static<typeof FormFieldSchema>;
export type FormFieldType = Static<typeof FormFieldTypeSchema>;
export type FormPublishCreate = Static<typeof FormPublishCreateSchema>;
export type FormSubmission = Static<typeof FormSubmissionSchema>;
export type FormTemplate = Static<typeof FormTemplateSchema>;
export type FormTemplateCreate = Static<typeof FormTemplateCreateSchema>;
export type FormTemplateParams = Static<typeof FormTemplateParamsSchema>;
export type FormTemplatesResponse = Static<typeof FormTemplatesResponseSchema>;
export type FormTemplateUpdate = Static<typeof FormTemplateUpdateSchema>;
export type ParentFormObligation = Static<typeof ParentFormObligationSchema>;
export type ParentFormObligationsResponse = Static<typeof ParentFormObligationsResponseSchema>;
export type ParentFormSubmissionParams = Static<typeof ParentFormSubmissionParamsSchema>;
export type ParentFormSubmissionUpdate = Static<typeof ParentFormSubmissionUpdateSchema>;
