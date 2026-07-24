import { Type, type Static } from '@sinclair/typebox';

import { UtcTimestampSchema, UuidSchema } from './catalog.js';

export const PaymentProviderSchema = Type.Union([Type.Literal('STRIPE'), Type.Literal('LOCAL')]);

export const PaymentAttemptStatusSchema = Type.Union([
  Type.Literal('PENDING'),
  Type.Literal('SUCCEEDED'),
  Type.Literal('FAILED'),
  Type.Literal('CANCELLED'),
]);
export const PaymentPurposeSchema = Type.Union([
  Type.Literal('DEPOSIT'),
  Type.Literal('INSTALLMENT'),
  Type.Literal('BALANCE'),
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
    installment_id: Type.Union([UuidSchema, Type.Null()]),
    order_id: Type.Union([UuidSchema, Type.Null()]),
    provider: PaymentProviderSchema,
    provider_reference: Type.Union([Type.String({ minLength: 1 }), Type.Null()]),
    purpose: PaymentPurposeSchema,
    receipt_url: Type.Union([Type.String({ minLength: 1 }), Type.Null()]),
    registration_id: Type.Union([UuidSchema, Type.Null()]),
    session_name: Type.String({ minLength: 1 }),
    status: PaymentAttemptStatusSchema,
  },
  { additionalProperties: false, $id: 'PaymentAttempt' },
);

export const PaymentAttemptListResponseSchema = Type.Object(
  { attempts: Type.Array(PaymentAttemptSchema) },
  { additionalProperties: false, $id: 'PaymentAttemptListResponse' },
);

export const PaymentAdjustmentTypeSchema = Type.Union([
  Type.Literal('CREDIT'),
  Type.Literal('CHARGE'),
  Type.Literal('REFUND'),
]);
export const PaymentAdjustmentStatusSchema = Type.Union([
  Type.Literal('PENDING'),
  Type.Literal('SUCCEEDED'),
  Type.Literal('FAILED'),
]);

export const PaymentAccountSchema = Type.Object(
  {
    balance_due_cents: Type.Integer({ minimum: 0 }),
    camper_name: Type.String({ minLength: 1 }),
    charge_cents: Type.Integer({ minimum: 0 }),
    credit_cents: Type.Integer({ minimum: 0 }),
    family_id: UuidSchema,
    family_name: Type.String({ minLength: 1 }),
    paid_cents: Type.Integer(),
    price_cents: Type.Integer({ minimum: 0 }),
    refundable_cents: Type.Integer({ minimum: 0 }),
    refund_sources: Type.Array(
      Type.Object(
        {
          amount_cents: Type.Integer({ minimum: 1 }),
          attempt_id: UuidSchema,
          completed_at: UtcTimestampSchema,
          provider: PaymentProviderSchema,
          refundable_cents: Type.Integer({ minimum: 1 }),
        },
        { additionalProperties: false },
      ),
    ),
    refunded_cents: Type.Integer({ minimum: 0 }),
    registration_id: UuidSchema,
    session_name: Type.String({ minLength: 1 }),
  },
  { additionalProperties: false, $id: 'PaymentAccount' },
);

export const PaymentAdjustmentSchema = Type.Object(
  {
    adjustment_type: PaymentAdjustmentTypeSchema,
    amount_cents: Type.Integer({ minimum: 1 }),
    completed_at: Type.Union([UtcTimestampSchema, Type.Null()]),
    created_at: UtcTimestampSchema,
    created_by: Type.String({ minLength: 1 }),
    currency: Type.Literal('USD'),
    family_id: UuidSchema,
    id: UuidSchema,
    payment_attempt_id: Type.Union([UuidSchema, Type.Null()]),
    provider: Type.Union([PaymentProviderSchema, Type.Null()]),
    provider_reference: Type.Union([Type.String({ minLength: 1 }), Type.Null()]),
    reason: Type.String({ minLength: 3, maxLength: 500 }),
    registration_id: UuidSchema,
    status: PaymentAdjustmentStatusSchema,
  },
  { additionalProperties: false, $id: 'PaymentAdjustment' },
);

export const PaymentAdjustmentCreateSchema = Type.Object(
  {
    adjustment_type: PaymentAdjustmentTypeSchema,
    amount_cents: Type.Integer({ minimum: 1, maximum: 10_000_000 }),
    idempotency_key: UuidSchema,
    payment_attempt_id: Type.Optional(Type.Union([UuidSchema, Type.Null()])),
    reason: Type.String({ minLength: 3, maxLength: 500 }),
    registration_id: UuidSchema,
  },
  { additionalProperties: false, $id: 'PaymentAdjustmentCreate' },
);

export const PaymentAdjustmentCenterSchema = Type.Object(
  {
    accounts: Type.Array(PaymentAccountSchema),
    adjustments: Type.Array(PaymentAdjustmentSchema),
  },
  { additionalProperties: false, $id: 'PaymentAdjustmentCenter' },
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
export type PaymentAccount = Static<typeof PaymentAccountSchema>;
export type PaymentAdjustment = Static<typeof PaymentAdjustmentSchema>;
export type PaymentAdjustmentCenter = Static<typeof PaymentAdjustmentCenterSchema>;
export type PaymentAdjustmentCreate = Static<typeof PaymentAdjustmentCreateSchema>;
export type PaymentAdjustmentStatus = Static<typeof PaymentAdjustmentStatusSchema>;
export type PaymentAdjustmentType = Static<typeof PaymentAdjustmentTypeSchema>;
export type PaymentAttempt = Static<typeof PaymentAttemptSchema>;
export type PaymentAttemptListResponse = Static<typeof PaymentAttemptListResponseSchema>;
export type PaymentAttemptParams = Static<typeof PaymentAttemptParamsSchema>;
export type PaymentCompletion = Static<typeof PaymentCompletionSchema>;
