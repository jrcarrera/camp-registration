import { Type, type Static } from '@sinclair/typebox';

export const HealthResponseSchema = Type.Object(
  {
    service: Type.Literal('camp-registration-api'),
    status: Type.Literal('ok'),
    version: Type.String({ minLength: 1 }),
  },
  { $id: 'HealthResponse' },
);

export type HealthResponse = Static<typeof HealthResponseSchema>;

export const ReadinessResponseSchema = Type.Object(
  {
    database: Type.Union([Type.Literal('connected'), Type.Literal('not_configured')]),
    service: Type.Literal('camp-registration-api'),
    status: Type.Literal('ready'),
  },
  { $id: 'ReadinessResponse' },
);

export type ReadinessResponse = Static<typeof ReadinessResponseSchema>;

export const UnavailableResponseSchema = Type.Object(
  {
    database: Type.Literal('unavailable'),
    service: Type.Literal('camp-registration-api'),
    status: Type.Literal('not_ready'),
  },
  { $id: 'UnavailableResponse' },
);

export type UnavailableResponse = Static<typeof UnavailableResponseSchema>;
