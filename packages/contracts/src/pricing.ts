import { Type, type Static } from '@sinclair/typebox';

import { LocalDateSchema, UtcTimestampSchema, UuidSchema } from './catalog.js';

export const PricingValueTypeSchema = Type.Union([Type.Literal('FIXED'), Type.Literal('PERCENT')]);

export const SessionAddOnSchema = Type.Object(
  {
    active: Type.Boolean(),
    description: Type.Union([Type.String({ minLength: 1 }), Type.Null()]),
    id: UuidSchema,
    name: Type.String({ minLength: 1 }),
    price_cents: Type.Integer({ minimum: 0 }),
    required: Type.Boolean(),
    session_id: UuidSchema,
    version: Type.Integer({ minimum: 1 }),
  },
  { additionalProperties: false, $id: 'SessionAddOn' },
);
export const SessionAddOnWriteSchema = Type.Object(
  {
    active: Type.Boolean(),
    description: Type.Optional(Type.Union([Type.String({ maxLength: 500 }), Type.Null()])),
    name: Type.String({ minLength: 1, maxLength: 120 }),
    price_cents: Type.Integer({ minimum: 0, maximum: 10000000 }),
    required: Type.Boolean(),
  },
  { additionalProperties: false, $id: 'SessionAddOnWrite' },
);

export const DiscountRuleSchema = Type.Object(
  {
    active: Type.Boolean(),
    id: UuidSchema,
    minimum_qualifying_lines: Type.Integer({ minimum: 2, maximum: 20 }),
    name: Type.String({ minLength: 1 }),
    priority: Type.Integer(),
    rule_type: Type.Union([Type.Literal('SIBLING'), Type.Literal('MULTI_SESSION')]),
    season_id: UuidSchema,
    value: Type.Integer({ minimum: 1 }),
    value_type: PricingValueTypeSchema,
    version: Type.Integer({ minimum: 1 }),
  },
  { additionalProperties: false, $id: 'DiscountRule' },
);
export const DiscountRuleWriteSchema = Type.Omit(DiscountRuleSchema, ['id', 'version'], {
  $id: 'DiscountRuleWrite',
});

export const CouponSchema = Type.Object(
  {
    active: Type.Boolean(),
    code: Type.String({ minLength: 1 }),
    ends_at: Type.Union([UtcTimestampSchema, Type.Null()]),
    id: UuidSchema,
    maximum_redemptions: Type.Union([Type.Integer({ minimum: 1 }), Type.Null()]),
    season_id: UuidSchema,
    starts_at: Type.Union([UtcTimestampSchema, Type.Null()]),
    value: Type.Integer({ minimum: 1 }),
    value_type: PricingValueTypeSchema,
    version: Type.Integer({ minimum: 1 }),
  },
  { additionalProperties: false, $id: 'Coupon' },
);
export const CouponWriteSchema = Type.Omit(CouponSchema, ['id', 'version'], {
  $id: 'CouponWrite',
});

export const PaymentPlanTemplateInstallmentSchema = Type.Object(
  {
    due_on: LocalDateSchema,
    percentage_basis_points: Type.Integer({ minimum: 1, maximum: 10000 }),
    sequence: Type.Integer({ minimum: 1, maximum: 6 }),
  },
  { additionalProperties: false, $id: 'PaymentPlanTemplateInstallment' },
);
export const PaymentPlanTemplateSchema = Type.Object(
  {
    active: Type.Boolean(),
    id: UuidSchema,
    installments: Type.Array(PaymentPlanTemplateInstallmentSchema, {
      minItems: 2,
      maxItems: 6,
    }),
    name: Type.String({ minLength: 1 }),
    season_id: UuidSchema,
    version: Type.Integer({ minimum: 1 }),
  },
  { additionalProperties: false, $id: 'PaymentPlanTemplate' },
);
export const PaymentPlanTemplateWriteSchema = Type.Omit(
  PaymentPlanTemplateSchema,
  ['id', 'version'],
  {
    $id: 'PaymentPlanTemplateWrite',
  },
);

export const PricingConfigurationSchema = Type.Object(
  {
    add_ons: Type.Array(SessionAddOnSchema),
    coupons: Type.Array(CouponSchema),
    discount_rules: Type.Array(DiscountRuleSchema),
    payment_plan_templates: Type.Array(PaymentPlanTemplateSchema),
  },
  { additionalProperties: false, $id: 'PricingConfiguration' },
);

export const AssistanceStatusSchema = Type.Union([
  Type.Literal('DRAFT'),
  Type.Literal('SUBMITTED'),
  Type.Literal('REVISION_REQUESTED'),
  Type.Literal('APPROVED'),
  Type.Literal('DENIED'),
  Type.Literal('WITHDRAWN'),
]);
export const FinancialAssistanceApplicationSchema = Type.Object(
  {
    approved_cents: Type.Union([Type.Integer({ minimum: 1 }), Type.Null()]),
    camper_id: Type.Union([UuidSchema, Type.Null()]),
    created_at: UtcTimestampSchema,
    family_id: UuidSchema,
    id: UuidSchema,
    internal_note: Type.Union([Type.String({ minLength: 1 }), Type.Null()]),
    requested_cents: Type.Integer({ minimum: 1 }),
    season_id: UuidSchema,
    statement: Type.String({ minLength: 1 }),
    status: AssistanceStatusSchema,
    version: Type.Integer({ minimum: 1 }),
  },
  { additionalProperties: false, $id: 'FinancialAssistanceApplication' },
);
export const FinancialAssistanceCreateSchema = Type.Object(
  {
    camper_id: Type.Optional(Type.Union([UuidSchema, Type.Null()])),
    requested_cents: Type.Integer({ minimum: 1, maximum: 10000000 }),
    season_id: UuidSchema,
    statement: Type.String({ minLength: 10, maxLength: 4000 }),
    submit: Type.Boolean(),
  },
  { additionalProperties: false, $id: 'FinancialAssistanceCreate' },
);
export const FinancialAssistanceUpdateSchema = Type.Object(
  {
    camper_id: Type.Optional(Type.Union([UuidSchema, Type.Null()])),
    requested_cents: Type.Integer({ minimum: 1, maximum: 10000000 }),
    statement: Type.String({ minLength: 10, maxLength: 4000 }),
    submit: Type.Boolean(),
    version: Type.Integer({ minimum: 1 }),
  },
  { additionalProperties: false, $id: 'FinancialAssistanceUpdate' },
);
export const FinancialAssistanceWithdrawSchema = Type.Object(
  { version: Type.Integer({ minimum: 1 }) },
  { additionalProperties: false, $id: 'FinancialAssistanceWithdraw' },
);
export const FinancialAssistanceReviewSchema = Type.Object(
  {
    approved_cents: Type.Optional(Type.Integer({ minimum: 1, maximum: 10000000 })),
    internal_note: Type.Optional(Type.Union([Type.String({ maxLength: 2000 }), Type.Null()])),
    status: Type.Union([
      Type.Literal('REVISION_REQUESTED'),
      Type.Literal('APPROVED'),
      Type.Literal('DENIED'),
    ]),
    version: Type.Integer({ minimum: 1 }),
  },
  { additionalProperties: false, $id: 'FinancialAssistanceReview' },
);
export const FinancialAssistanceListResponseSchema = Type.Object(
  { applications: Type.Array(FinancialAssistanceApplicationSchema) },
  { additionalProperties: false, $id: 'FinancialAssistanceListResponse' },
);
export const FinancialAssistanceParamsSchema = Type.Object(
  { applicationId: UuidSchema },
  { additionalProperties: false },
);
export const SessionAddOnParamsSchema = Type.Object(
  { addOnId: UuidSchema, sessionId: UuidSchema },
  { additionalProperties: false },
);
export const PricingResourceParamsSchema = Type.Object(
  { resourceId: UuidSchema },
  { additionalProperties: false },
);
export const FinancialAssistanceFamilyParamsSchema = Type.Object(
  { familyId: UuidSchema },
  { additionalProperties: false },
);
export const FinancialAssistanceFamilyApplicationParamsSchema = Type.Object(
  { applicationId: UuidSchema, familyId: UuidSchema },
  { additionalProperties: false },
);

export type SessionAddOn = Static<typeof SessionAddOnSchema>;
export type SessionAddOnWrite = Static<typeof SessionAddOnWriteSchema>;
export type DiscountRule = Static<typeof DiscountRuleSchema>;
export type DiscountRuleWrite = Static<typeof DiscountRuleWriteSchema>;
export type Coupon = Static<typeof CouponSchema>;
export type CouponWrite = Static<typeof CouponWriteSchema>;
export type PaymentPlanTemplate = Static<typeof PaymentPlanTemplateSchema>;
export type PaymentPlanTemplateWrite = Static<typeof PaymentPlanTemplateWriteSchema>;
export type PricingConfiguration = Static<typeof PricingConfigurationSchema>;
export type FinancialAssistanceApplication = Static<typeof FinancialAssistanceApplicationSchema>;
export type FinancialAssistanceListResponse = Static<typeof FinancialAssistanceListResponseSchema>;
export type FinancialAssistanceCreate = Static<typeof FinancialAssistanceCreateSchema>;
export type FinancialAssistanceUpdate = Static<typeof FinancialAssistanceUpdateSchema>;
export type FinancialAssistanceWithdraw = Static<typeof FinancialAssistanceWithdrawSchema>;
export type FinancialAssistanceReview = Static<typeof FinancialAssistanceReviewSchema>;
