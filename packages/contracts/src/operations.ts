import { Type, type Static } from '@sinclair/typebox';

import { UtcTimestampSchema, UuidSchema } from './catalog.js';

export const WaitlistNotificationTypeSchema = Type.Union([
  Type.Literal('WAITLIST_OFFERED'),
  Type.Literal('WAITLIST_EXPIRING_SOON'),
  Type.Literal('WAITLIST_ACCEPTED'),
  Type.Literal('WAITLIST_DECLINED'),
  Type.Literal('WAITLIST_EXPIRED'),
  Type.Literal('WAITLIST_CANCELLED'),
]);

export const WaitlistNotificationIssueTypeSchema = Type.Union([
  Type.Literal('NO_ELIGIBLE_RECIPIENT'),
  Type.Literal('DELIVERY_FAILED'),
]);

export const WaitlistNotificationIssueSchema = Type.Object(
  {
    attempt_count: Type.Integer({ minimum: 0 }),
    camper_name: Type.String({ minLength: 1 }),
    family_name: Type.String({ minLength: 1 }),
    id: UuidSchema,
    issue_type: WaitlistNotificationIssueTypeSchema,
    notification_type: WaitlistNotificationTypeSchema,
    observed_at: UtcTimestampSchema,
    recipient_hint: Type.Union([Type.String({ minLength: 1 }), Type.Null()]),
    replay_count: Type.Integer({ minimum: 0 }),
    session_name: Type.String({ minLength: 1 }),
  },
  { additionalProperties: false, $id: 'WaitlistNotificationIssue' },
);

export const WaitlistNotificationReplayParamsSchema = Type.Object(
  {
    issueId: UuidSchema,
    issueType: Type.Union([Type.Literal('coverage'), Type.Literal('delivery')]),
  },
  { additionalProperties: false },
);

export const WaitlistNotificationReplayCreateSchema = Type.Object(
  {
    reason: Type.String({ minLength: 3, maxLength: 500 }),
  },
  { additionalProperties: false },
);

export const WaitlistNotificationReplayResultSchema = Type.Object(
  {
    issue_id: UuidSchema,
    issue_open: Type.Boolean(),
    issue_type: WaitlistNotificationIssueTypeSchema,
    queued_count: Type.Integer({ minimum: 0 }),
    replayed_at: UtcTimestampSchema,
  },
  { additionalProperties: false, $id: 'WaitlistNotificationReplayResult' },
);

export const WaitlistWorkerHealthSchema = Type.Union([
  Type.Literal('HEALTHY'),
  Type.Literal('DEGRADED'),
  Type.Literal('STALE'),
  Type.Literal('NOT_RUNNING'),
]);

export const WaitlistOperationsStatusSchema = Type.Object(
  {
    can_replay_notifications: Type.Boolean(),
    consecutive_failures: Type.Integer({ minimum: 0 }),
    expired_offer_count: Type.Integer({ minimum: 0 }),
    failed_delivery_count: Type.Integer({ minimum: 0 }),
    health: WaitlistWorkerHealthSchema,
    last_completed_at: Type.Union([UtcTimestampSchema, Type.Null()]),
    last_error_code: Type.Union([Type.String({ minLength: 1 }), Type.Null()]),
    last_started_at: Type.Union([UtcTimestampSchema, Type.Null()]),
    last_succeeded_at: Type.Union([UtcTimestampSchema, Type.Null()]),
    no_recipient_count: Type.Integer({ minimum: 0 }),
    notification_issues: Type.Array(WaitlistNotificationIssueSchema),
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
export type WaitlistNotificationIssue = Static<typeof WaitlistNotificationIssueSchema>;
export type WaitlistNotificationIssueType = Static<typeof WaitlistNotificationIssueTypeSchema>;
export type WaitlistNotificationReplayCreate = Static<
  typeof WaitlistNotificationReplayCreateSchema
>;
export type WaitlistNotificationReplayParams = Static<
  typeof WaitlistNotificationReplayParamsSchema
>;
export type WaitlistNotificationReplayResult = Static<
  typeof WaitlistNotificationReplayResultSchema
>;
export type WaitlistWorkerHealth = Static<typeof WaitlistWorkerHealthSchema>;
