import { Type, type Static } from '@sinclair/typebox';

import { UuidSchema } from './catalog.js';

export const SessionReportPresetSchema = Type.Union([
  Type.Literal('SESSION_ROSTER'),
  Type.Literal('CHECK_IN_SHEET'),
]);

export const OperationalReportPresetSchema = Type.Union([
  Type.Literal('SESSION_ROSTER'),
  Type.Literal('CHECK_IN_SHEET'),
  Type.Literal('CONTACT_LIST'),
  Type.Literal('BALANCE_DUE'),
  Type.Literal('WAITLIST'),
  Type.Literal('READINESS'),
  Type.Literal('ATTENDANCE'),
  Type.Literal('PICKUP_SHEET'),
  Type.Literal('CAMPER_LABELS'),
]);

export const OperationalReportExportFormatSchema = Type.Union([
  Type.Literal('CSV'),
  Type.Literal('XLSX'),
]);

export const OperationalReportDefaultFormatSchema = Type.Union([
  OperationalReportExportFormatSchema,
  Type.Literal('PRINT'),
]);

export const OperationalReportRegistrationStatusSchema = Type.Union([
  Type.Literal('ALL'),
  Type.Literal('CONFIRMED'),
  Type.Literal('WAITLISTED'),
  Type.Literal('CANCELLED'),
]);

export const OperationalReportFiltersSchema = Type.Object(
  {
    end_date: Type.Union([Type.String({ format: 'date' }), Type.Null()]),
    registration_status: OperationalReportRegistrationStatusSchema,
    session_ids: Type.Array(UuidSchema, { maxItems: 100, uniqueItems: true }),
    start_date: Type.Union([Type.String({ format: 'date' }), Type.Null()]),
  },
  { additionalProperties: false, $id: 'OperationalReportFilters' },
);

export const OperationalReportRequestSchema = Type.Object(
  {
    filters: OperationalReportFiltersSchema,
    full: Type.Optional(Type.Boolean()),
    preset: OperationalReportPresetSchema,
  },
  { additionalProperties: false, $id: 'OperationalReportRequest' },
);

export const OperationalReportExportQuerySchema = Type.Object(
  {
    end_date: Type.Optional(Type.String({ format: 'date' })),
    format: OperationalReportExportFormatSchema,
    preset: OperationalReportPresetSchema,
    registration_status: Type.Optional(OperationalReportRegistrationStatusSchema),
    session_ids: Type.Optional(Type.String({ maxLength: 3699 })),
    start_date: Type.Optional(Type.String({ format: 'date' })),
  },
  { additionalProperties: false, $id: 'OperationalReportExportQuery' },
);

export const OperationalReportColumnSchema = Type.Object(
  { key: Type.String(), label: Type.String() },
  { additionalProperties: false, $id: 'OperationalReportColumn' },
);

export const OperationalReportCellSchema = Type.Union([Type.String(), Type.Number(), Type.Null()]);

export const OperationalReportPreviewSchema = Type.Object(
  {
    columns: Type.Array(OperationalReportColumnSchema),
    preset: OperationalReportPresetSchema,
    row_count: Type.Integer({ minimum: 0 }),
    rows: Type.Array(Type.Record(Type.String(), OperationalReportCellSchema)),
    title: Type.String(),
    truncated: Type.Boolean(),
  },
  { additionalProperties: false, $id: 'OperationalReportPreview' },
);

export const OperationalReportViewSchema = Type.Object(
  {
    can_edit: Type.Boolean(),
    created_at: Type.String({ format: 'date-time' }),
    default_format: OperationalReportDefaultFormatSchema,
    filters: OperationalReportFiltersSchema,
    id: UuidSchema,
    name: Type.String(),
    preset: OperationalReportPresetSchema,
    updated_at: Type.String({ format: 'date-time' }),
    version: Type.Integer({ minimum: 1 }),
  },
  { additionalProperties: false, $id: 'OperationalReportView' },
);

export const OperationalReportCenterSchema = Type.Object(
  { saved_views: Type.Array(OperationalReportViewSchema) },
  { additionalProperties: false, $id: 'OperationalReportCenter' },
);

export const OperationalReportViewInputSchema = Type.Object(
  {
    default_format: OperationalReportDefaultFormatSchema,
    filters: OperationalReportFiltersSchema,
    name: Type.String({ maxLength: 120, minLength: 1 }),
    preset: OperationalReportPresetSchema,
  },
  { additionalProperties: false, $id: 'OperationalReportViewInput' },
);

export const OperationalReportViewUpdateSchema = Type.Object(
  {
    default_format: Type.Optional(OperationalReportDefaultFormatSchema),
    filters: Type.Optional(OperationalReportFiltersSchema),
    name: Type.Optional(Type.String({ maxLength: 120, minLength: 1 })),
    preset: Type.Optional(OperationalReportPresetSchema),
    version: Type.Integer({ minimum: 1 }),
  },
  { additionalProperties: false, $id: 'OperationalReportViewUpdate' },
);

export const OperationalReportViewParamsSchema = Type.Object(
  { viewId: UuidSchema },
  { additionalProperties: false, $id: 'OperationalReportViewParams' },
);

export const XlsxReportSchema = Type.String({ $id: 'XlsxReport', format: 'binary' });

export const SessionReportParamsSchema = Type.Object(
  { sessionId: UuidSchema },
  { additionalProperties: false, $id: 'SessionReportParams' },
);

export const SessionReportQuerySchema = Type.Object(
  { preset: SessionReportPresetSchema },
  { additionalProperties: false, $id: 'SessionReportQuery' },
);

export const CsvReportSchema = Type.String({ $id: 'CsvReport' });

export type SessionReportParams = Static<typeof SessionReportParamsSchema>;
export type SessionReportPreset = Static<typeof SessionReportPresetSchema>;
export type SessionReportQuery = Static<typeof SessionReportQuerySchema>;
export type OperationalReportCenter = Static<typeof OperationalReportCenterSchema>;
export type OperationalReportDefaultFormat = Static<typeof OperationalReportDefaultFormatSchema>;
export type OperationalReportExportFormat = Static<typeof OperationalReportExportFormatSchema>;
export type OperationalReportExportQuery = Static<typeof OperationalReportExportQuerySchema>;
export type OperationalReportFilters = Static<typeof OperationalReportFiltersSchema>;
export type OperationalReportPreset = Static<typeof OperationalReportPresetSchema>;
export type OperationalReportPreview = Static<typeof OperationalReportPreviewSchema>;
export type OperationalReportRequest = Static<typeof OperationalReportRequestSchema>;
export type OperationalReportView = Static<typeof OperationalReportViewSchema>;
export type OperationalReportViewInput = Static<typeof OperationalReportViewInputSchema>;
export type OperationalReportViewParams = Static<typeof OperationalReportViewParamsSchema>;
export type OperationalReportViewUpdate = Static<typeof OperationalReportViewUpdateSchema>;
