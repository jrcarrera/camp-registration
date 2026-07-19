import { Type, type Static } from '@sinclair/typebox';

import { LocalDateSchema, UuidSchema } from './catalog.js';

export const HousingBuildingStatusSchema = Type.Union([
  Type.Literal('OPEN'),
  Type.Literal('CLOSED'),
]);
export const HousingAssignmentMethodSchema = Type.Union([
  Type.Literal('MANUAL'),
  Type.Literal('AUTO_BALANCED'),
  Type.Literal('AUTO_CONSOLIDATED'),
]);
export const HousingStrategySchema = Type.Union([
  Type.Literal('BALANCED'),
  Type.Literal('CONSOLIDATE'),
]);

export const HousingBuildingWriteSchema = Type.Object(
  {
    active: Type.Optional(Type.Boolean()),
    code: Type.String({ minLength: 1, maxLength: 32 }),
    description: Type.Optional(Type.Union([Type.String({ maxLength: 500 }), Type.Null()])),
    name: Type.String({ minLength: 1, maxLength: 120 }),
  },
  { additionalProperties: false, $id: 'HousingBuildingWrite' },
);

export const HousingBedWriteSchema = Type.Object(
  {
    active: Type.Optional(Type.Boolean()),
    name: Type.String({ minLength: 1, maxLength: 80 }),
  },
  { additionalProperties: false, $id: 'HousingBedWrite' },
);

export const HousingBedSchema = Type.Object(
  {
    active: Type.Boolean(),
    building_id: UuidSchema,
    id: UuidSchema,
    name: Type.String(),
    version: Type.Integer({ minimum: 1 }),
  },
  { additionalProperties: false, $id: 'HousingBed' },
);

export const HousingBuildingSchema = Type.Object(
  {
    active: Type.Boolean(),
    beds: Type.Array(HousingBedSchema),
    code: Type.String(),
    description: Type.Union([Type.String(), Type.Null()]),
    id: UuidSchema,
    name: Type.String(),
    version: Type.Integer({ minimum: 1 }),
  },
  { additionalProperties: false, $id: 'HousingBuilding' },
);

export const HousingInventorySchema = Type.Object(
  { buildings: Type.Array(HousingBuildingSchema) },
  { additionalProperties: false, $id: 'HousingInventory' },
);

export const SessionHousingBuildingWriteSchema = Type.Object(
  {
    closed_reason: Type.Optional(Type.Union([Type.String({ maxLength: 500 }), Type.Null()])),
    status: HousingBuildingStatusSchema,
  },
  { additionalProperties: false, $id: 'SessionHousingBuildingWrite' },
);

export const HousingAssignmentWriteSchema = Type.Object(
  { bed_id: UuidSchema, registration_id: UuidSchema },
  { additionalProperties: false, $id: 'HousingAssignmentWrite' },
);

export const HousingAutoAssignSchema = Type.Object(
  { strategy: HousingStrategySchema },
  { additionalProperties: false, $id: 'HousingAutoAssign' },
);

export const HousingCamperSchema = Type.Object(
  {
    assignment_id: Type.Union([UuidSchema, Type.Null()]),
    bed_id: Type.Union([UuidSchema, Type.Null()]),
    birth_date: LocalDateSchema,
    building_id: Type.Union([UuidSchema, Type.Null()]),
    bunk_buddy_names: Type.Array(Type.String()),
    camper_id: UuidSchema,
    camper_name: Type.String(),
    registration_id: UuidSchema,
  },
  { additionalProperties: false, $id: 'HousingCamper' },
);

export const SessionHousingBuildingSchema = Type.Object(
  {
    assigned_count: Type.Integer({ minimum: 0 }),
    beds: Type.Array(HousingBedSchema),
    building_id: UuidSchema,
    closed_reason: Type.Union([Type.String(), Type.Null()]),
    code: Type.String(),
    id: UuidSchema,
    name: Type.String(),
    status: HousingBuildingStatusSchema,
    version: Type.Integer({ minimum: 1 }),
  },
  { additionalProperties: false, $id: 'SessionHousingBuilding' },
);

export const SessionHousingSchema = Type.Object(
  {
    buildings: Type.Array(SessionHousingBuildingSchema),
    campers: Type.Array(HousingCamperSchema),
    session_id: UuidSchema,
    warnings: Type.Array(Type.String()),
  },
  { additionalProperties: false, $id: 'SessionHousing' },
);

export const HousingResourceParamsSchema = Type.Object(
  { resourceId: UuidSchema },
  { additionalProperties: false, $id: 'HousingResourceParams' },
);
export const HousingBuildingParamsSchema = Type.Object(
  { buildingId: UuidSchema },
  { additionalProperties: false, $id: 'HousingBuildingParams' },
);
export const HousingBedParamsSchema = Type.Object(
  { bedId: UuidSchema },
  { additionalProperties: false, $id: 'HousingBedParams' },
);
export const SessionHousingBuildingParamsSchema = Type.Object(
  { buildingId: UuidSchema, sessionId: UuidSchema },
  { additionalProperties: false, $id: 'SessionHousingBuildingParams' },
);
export const HousingAssignmentParamsSchema = Type.Object(
  { assignmentId: UuidSchema, sessionId: UuidSchema },
  { additionalProperties: false, $id: 'HousingAssignmentParams' },
);

export type HousingBuildingWrite = Static<typeof HousingBuildingWriteSchema>;
export type HousingBedWrite = Static<typeof HousingBedWriteSchema>;
export type HousingInventory = Static<typeof HousingInventorySchema>;
export type SessionHousingBuildingWrite = Static<typeof SessionHousingBuildingWriteSchema>;
export type HousingAssignmentWrite = Static<typeof HousingAssignmentWriteSchema>;
export type HousingAutoAssign = Static<typeof HousingAutoAssignSchema>;
export type SessionHousing = Static<typeof SessionHousingSchema>;
