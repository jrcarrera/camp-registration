import { Type, type Static } from '@sinclair/typebox';

import { UtcTimestampSchema, UuidSchema } from './catalog.js';

export const PaymentProviderSchema = Type.Union([Type.Literal('STRIPE'), Type.Literal('LOCAL')]);

export const PaymentAttemptStatusSchema = Type.Union([
  Type.Literal('PENDING'),
  Type.Literal('SUCCEEDED'),
  Type.Literal('FAILED'),
  Type.Literal('CANCELLED'),
]);

export const OnlinePaymentCheckoutCreateSchema = Type.Object(
  { idempotency_key: UuidSchema },
  { additionalProperties: false, $id: 'OnlinePaymentCheckoutCreate' },
);

export const OnlinePaymentCheckoutSchema = Type.Object(
  {
    amount_cents: Type.Integer({ minimum: 1 }),
    attempt_id: UuidSchema,
    checkout_url: Type.String({ minLength: 1 }),
    currency: Type.Literal('USD'),
    status: PaymentAttemptStatusSchema,
  },
  { additionalProperties: false, $id: 'OnlinePaymentCheckout' },
);

export const PaymentAttemptSchema = Type.Object(
  {
    amount_cents: Type.Integer({ minimum: 1 }),
    camper_name: Type.String({ minLength: 1 }),
    completed_at: Type.Union([UtcTimestampSchema, Type.Null()]),
    created_at: UtcTimestampSchema,
    currency: Type.Literal('USD'),
    family_id: UuidSchema,
    family_name: Type.String({ minLength: 1 }),
    id: UuidSchema,
    provider: PaymentProviderSchema,
    provider_reference: Type.Union([Type.String({ minLength: 1 }), Type.Null()]),
    receipt_url: Type.Union([Type.String({ minLength: 1 }), Type.Null()]),
    registration_id: UuidSchema,
    session_name: Type.String({ minLength: 1 }),
    status: PaymentAttemptStatusSchema,
  },
  { additionalProperties: false, $id: 'PaymentAttempt' },
);

export const PaymentAttemptListResponseSchema = Type.Object(
  { attempts: Type.Array(PaymentAttemptSchema) },
  { additionalProperties: false, $id: 'PaymentAttemptListResponse' },
);

export const PaymentAttemptParamsSchema = Type.Object(
  { attemptId: UuidSchema },
  { additionalProperties: false },
);

export const PaymentCompletionSchema = Type.Object(
  { attempt: PaymentAttemptSchema },
  { additionalProperties: false, $id: 'PaymentCompletion' },
);

export type OnlinePaymentCheckoutCreate = Static<typeof OnlinePaymentCheckoutCreateSchema>;
export type OnlinePaymentCheckout = Static<typeof OnlinePaymentCheckoutSchema>;
export type PaymentAttempt = Static<typeof PaymentAttemptSchema>;
export type PaymentAttemptListResponse = Static<typeof PaymentAttemptListResponseSchema>;
export type PaymentAttemptParams = Static<typeof PaymentAttemptParamsSchema>;
export type PaymentCompletion = Static<typeof PaymentCompletionSchema>;
