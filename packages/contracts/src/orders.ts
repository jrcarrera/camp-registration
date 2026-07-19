import { Type, type Static } from '@sinclair/typebox';

import { LocalDateSchema, UtcTimestampSchema, UuidSchema } from './catalog.js';

export const OrderWaitlistModeSchema = Type.Union([
  Type.Literal('INDIVIDUAL'),
  Type.Literal('KEEP_TOGETHER'),
]);
export const OrderStatusSchema = Type.Union([
  Type.Literal('PAYMENT_PENDING'),
  Type.Literal('COMPLETED'),
  Type.Literal('PARTIAL'),
  Type.Literal('EXPIRED'),
  Type.Literal('CANCELLED'),
]);
export const OrderLineOutcomeSchema = Type.Union([
  Type.Literal('HELD'),
  Type.Literal('CONFIRMED'),
  Type.Literal('WAITLISTED'),
  Type.Literal('EXPIRED'),
  Type.Literal('CANCELLED'),
]);
export const OrderInstallmentStatusSchema = Type.Union([
  Type.Literal('SCHEDULED'),
  Type.Literal('DUE'),
  Type.Literal('OVERDUE'),
  Type.Literal('PAID'),
]);

export const OrderCartLineCreateSchema = Type.Object(
  {
    add_on_ids: Type.Optional(Type.Array(UuidSchema, { maxItems: 20, uniqueItems: true })),
    camper_id: UuidSchema,
    session_id: UuidSchema,
  },
  { additionalProperties: false, $id: 'OrderCartLineCreate' },
);

const OrderSelectionFields = {
  coupon_code: Type.Optional(
    Type.Union([Type.String({ minLength: 1, maxLength: 64 }), Type.Null()]),
  ),
  lines: Type.Array(OrderCartLineCreateSchema, { minItems: 1, maxItems: 20 }),
  payment_plan_template_id: Type.Optional(Type.Union([UuidSchema, Type.Null()])),
  waitlist_mode: OrderWaitlistModeSchema,
};

export const OrderQuoteCreateSchema = Type.Object(OrderSelectionFields, {
  additionalProperties: false,
  $id: 'OrderQuoteCreate',
});
export const HouseholdOrderCreateSchema = Type.Object(
  { ...OrderSelectionFields, idempotency_key: UuidSchema },
  { additionalProperties: false, $id: 'HouseholdOrderCreate' },
);

export const OrderQuoteLineSchema = Type.Object(
  {
    add_on_total_cents: Type.Integer({ minimum: 0 }),
    assistance_cents: Type.Integer({ minimum: 0 }),
    automatic_discount_cents: Type.Integer({ minimum: 0 }),
    camper_id: UuidSchema,
    camper_name: Type.String({ minLength: 1 }),
    coupon_discount_cents: Type.Integer({ minimum: 0 }),
    deposit_due_cents: Type.Integer({ minimum: 0 }),
    errors: Type.Array(Type.String({ minLength: 1 })),
    gross_price_cents: Type.Integer({ minimum: 0 }),
    net_price_cents: Type.Integer({ minimum: 0 }),
    outcome: Type.Union([
      Type.Literal('AVAILABLE'),
      Type.Literal('WAITLIST'),
      Type.Literal('INVALID'),
    ]),
    session_id: UuidSchema,
    session_name: Type.String({ minLength: 1 }),
  },
  { additionalProperties: false, $id: 'OrderQuoteLine' },
);

export const OrderTotalsSchema = Type.Object(
  {
    assistance_cents: Type.Integer({ minimum: 0 }),
    automatic_discount_cents: Type.Integer({ minimum: 0 }),
    coupon_discount_cents: Type.Integer({ minimum: 0 }),
    deposit_due_cents: Type.Integer({ minimum: 0 }),
    gross_total_cents: Type.Integer({ minimum: 0 }),
    net_total_cents: Type.Integer({ minimum: 0 }),
  },
  { additionalProperties: false, $id: 'OrderTotals' },
);

export const OrderQuoteSchema = Type.Object(
  {
    currency: Type.Literal('USD'),
    lines: Type.Array(OrderQuoteLineSchema),
    totals: OrderTotalsSchema,
    valid: Type.Boolean(),
  },
  { additionalProperties: false, $id: 'OrderQuote' },
);

export const OrderAdjustmentSchema = Type.Object(
  {
    amount_cents: Type.Integer({ minimum: 1 }),
    label: Type.String({ minLength: 1 }),
    type: Type.Union([
      Type.Literal('AUTOMATIC_DISCOUNT'),
      Type.Literal('COUPON'),
      Type.Literal('ASSISTANCE'),
    ]),
  },
  { additionalProperties: false, $id: 'OrderAdjustment' },
);

export const HouseholdOrderLineSchema = Type.Object(
  {
    add_on_names: Type.Array(Type.String({ minLength: 1 })),
    add_on_total_cents: Type.Integer({ minimum: 0 }),
    adjustments: Type.Array(OrderAdjustmentSchema),
    assistance_cents: Type.Integer({ minimum: 0 }),
    automatic_discount_cents: Type.Integer({ minimum: 0 }),
    camper_id: UuidSchema,
    camper_name: Type.String({ minLength: 1 }),
    coupon_discount_cents: Type.Integer({ minimum: 0 }),
    deposit_due_cents: Type.Integer({ minimum: 0 }),
    gross_price_cents: Type.Integer({ minimum: 0 }),
    hold_expires_at: Type.Union([UtcTimestampSchema, Type.Null()]),
    id: UuidSchema,
    net_price_cents: Type.Integer({ minimum: 0 }),
    outcome: OrderLineOutcomeSchema,
    registration_id: Type.Union([UuidSchema, Type.Null()]),
    session_id: UuidSchema,
    session_name: Type.String({ minLength: 1 }),
  },
  { additionalProperties: false, $id: 'HouseholdOrderLine' },
);

export const OrderInstallmentSchema = Type.Object(
  {
    amount_cents: Type.Integer({ minimum: 1 }),
    due_on: LocalDateSchema,
    id: UuidSchema,
    paid_at: Type.Union([UtcTimestampSchema, Type.Null()]),
    sequence: Type.Integer({ minimum: 1, maximum: 6 }),
    status: OrderInstallmentStatusSchema,
  },
  { additionalProperties: false, $id: 'OrderInstallment' },
);

export const HouseholdOrderSchema = Type.Object(
  {
    coupon_code: Type.Union([Type.String({ minLength: 1 }), Type.Null()]),
    created_at: UtcTimestampSchema,
    currency: Type.Literal('USD'),
    family_id: UuidSchema,
    family_name: Type.String({ minLength: 1 }),
    id: UuidSchema,
    installments: Type.Array(OrderInstallmentSchema),
    lines: Type.Array(HouseholdOrderLineSchema),
    payment_required: Type.Boolean(),
    status: OrderStatusSchema,
    totals: OrderTotalsSchema,
    waitlist_mode: OrderWaitlistModeSchema,
  },
  { additionalProperties: false, $id: 'HouseholdOrder' },
);

export const HouseholdOrderListResponseSchema = Type.Object(
  { orders: Type.Array(HouseholdOrderSchema) },
  { additionalProperties: false, $id: 'HouseholdOrderListResponse' },
);
export const HouseholdOrderParamsSchema = Type.Object(
  { familyId: UuidSchema, orderId: UuidSchema },
  { additionalProperties: false },
);
export const OrderParamsSchema = Type.Object(
  { orderId: UuidSchema },
  { additionalProperties: false },
);
export const InstallmentParamsSchema = Type.Object(
  { familyId: UuidSchema, installmentId: UuidSchema },
  { additionalProperties: false },
);

export type OrderCartLineCreate = Static<typeof OrderCartLineCreateSchema>;
export type OrderQuoteCreate = Static<typeof OrderQuoteCreateSchema>;
export type HouseholdOrderCreate = Static<typeof HouseholdOrderCreateSchema>;
export type OrderQuote = Static<typeof OrderQuoteSchema>;
export type HouseholdOrder = Static<typeof HouseholdOrderSchema>;
export type HouseholdOrderListResponse = Static<typeof HouseholdOrderListResponseSchema>;
export type HouseholdOrderLine = Static<typeof HouseholdOrderLineSchema>;
export type OrderInstallment = Static<typeof OrderInstallmentSchema>;
export type HouseholdOrderParams = Static<typeof HouseholdOrderParamsSchema>;
export type OrderParams = Static<typeof OrderParamsSchema>;
export type InstallmentParams = Static<typeof InstallmentParamsSchema>;
