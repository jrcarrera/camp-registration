import { Type, type Static } from '@sinclair/typebox';

import { UuidSchema } from './catalog.js';

export const SessionReportPresetSchema = Type.Union([
  Type.Literal('SESSION_ROSTER'),
  Type.Literal('CHECK_IN_SHEET'),
]);

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
