import { Type, type Static } from '@sinclair/typebox';

import { UtcTimestampSchema } from './catalog.js';

export const WaitlistWorkerHealthSchema = Type.Union([
  Type.Literal('HEALTHY'),
  Type.Literal('DEGRADED'),
  Type.Literal('STALE'),
  Type.Literal('NOT_RUNNING'),
]);

export const WaitlistOperationsStatusSchema = Type.Object(
  {
    consecutive_failures: Type.Integer({ minimum: 0 }),
    expired_offer_count: Type.Integer({ minimum: 0 }),
    failed_delivery_count: Type.Integer({ minimum: 0 }),
    health: WaitlistWorkerHealthSchema,
    last_completed_at: Type.Union([UtcTimestampSchema, Type.Null()]),
    last_error_code: Type.Union([Type.String({ minLength: 1 }), Type.Null()]),
    last_started_at: Type.Union([UtcTimestampSchema, Type.Null()]),
    last_succeeded_at: Type.Union([UtcTimestampSchema, Type.Null()]),
    pending_delivery_count: Type.Integer({ minimum: 0 }),
    recent_cycle: Type.Object(
      {
        delivered_count: Type.Integer({ minimum: 0 }),
        delivery_failure_count: Type.Integer({ minimum: 0 }),
        expired_offer_count: Type.Integer({ minimum: 0 }),
        offers_created_count: Type.Integer({ minimum: 0 }),
        reminders_queued_count: Type.Integer({ minimum: 0 }),
        sessions_scanned_count: Type.Integer({ minimum: 0 }),
      },
      { additionalProperties: false },
    ),
  },
  { additionalProperties: false, $id: 'WaitlistOperationsStatus' },
);

export type WaitlistOperationsStatus = Static<typeof WaitlistOperationsStatusSchema>;
export type WaitlistWorkerHealth = Static<typeof WaitlistWorkerHealthSchema>;
