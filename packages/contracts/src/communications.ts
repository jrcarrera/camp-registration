import { Type, type Static } from '@sinclair/typebox';

import { UtcTimestampSchema, UuidSchema } from './catalog.js';

export const CommunicationTemplateStatusSchema = Type.Union([
  Type.Literal('DRAFT'),
  Type.Literal('ACTIVE'),
  Type.Literal('ARCHIVED'),
]);

export const CommunicationAudienceTypeSchema = Type.Union([
  Type.Literal('SESSION_CONFIRMED'),
  Type.Literal('SESSION_WAITLISTED'),
  Type.Literal('MISSING_FORMS'),
  Type.Literal('BALANCE_DUE'),
]);

export const CommunicationTemplateInputSchema = Type.Object(
  {
    body: Type.String({ minLength: 1, maxLength: 10000 }),
    description: Type.String({ maxLength: 1000 }),
    name: Type.String({ minLength: 1, maxLength: 160 }),
    subject: Type.String({ minLength: 1, maxLength: 200 }),
  },
  { additionalProperties: false, $id: 'CommunicationTemplateInput' },
);

export const CommunicationTemplateUpdateSchema = Type.Object(
  {
    body: Type.String({ minLength: 1, maxLength: 10000 }),
    description: Type.String({ maxLength: 1000 }),
    name: Type.String({ minLength: 1, maxLength: 160 }),
    subject: Type.String({ minLength: 1, maxLength: 200 }),
    version: Type.Integer({ minimum: 1 }),
  },
  { additionalProperties: false, $id: 'CommunicationTemplateUpdate' },
);

export const CommunicationTemplateSchema = Type.Object(
  {
    body: Type.String(),
    description: Type.String(),
    id: UuidSchema,
    name: Type.String(),
    status: CommunicationTemplateStatusSchema,
    subject: Type.String(),
    updated_at: UtcTimestampSchema,
    version: Type.Integer({ minimum: 1 }),
  },
  { additionalProperties: false, $id: 'CommunicationTemplate' },
);

export const CommunicationAudienceSchema = Type.Object(
  {
    audience_type: CommunicationAudienceTypeSchema,
    session_id: Type.Union([UuidSchema, Type.Null()]),
  },
  { additionalProperties: false, $id: 'CommunicationAudience' },
);

export const CommunicationAudiencePreviewSchema = Type.Object(
  { recipient_count: Type.Integer({ minimum: 0 }) },
  { additionalProperties: false, $id: 'CommunicationAudiencePreview' },
);

export const CommunicationCampaignCreateSchema = Type.Object(
  {
    audience_type: CommunicationAudienceTypeSchema,
    name: Type.String({ minLength: 1, maxLength: 160 }),
    scheduled_for: UtcTimestampSchema,
    session_id: Type.Union([UuidSchema, Type.Null()]),
    template_id: UuidSchema,
    template_version: Type.Integer({ minimum: 1 }),
  },
  { additionalProperties: false, $id: 'CommunicationCampaignCreate' },
);

export const CommunicationCampaignStatusSchema = Type.Union([
  Type.Literal('SCHEDULED'),
  Type.Literal('QUEUED'),
  Type.Literal('CANCELLED'),
]);

export const CommunicationCampaignSchema = Type.Object(
  {
    audience_type: CommunicationAudienceTypeSchema,
    created_at: UtcTimestampSchema,
    delivered_count: Type.Integer({ minimum: 0 }),
    failed_count: Type.Integer({ minimum: 0 }),
    id: UuidSchema,
    name: Type.String(),
    pending_count: Type.Integer({ minimum: 0 }),
    queued_at: Type.Union([UtcTimestampSchema, Type.Null()]),
    recipient_count: Type.Integer({ minimum: 0 }),
    scheduled_for: UtcTimestampSchema,
    session_id: Type.Union([UuidSchema, Type.Null()]),
    session_name: Type.Union([Type.String(), Type.Null()]),
    status: CommunicationCampaignStatusSchema,
    template_id: UuidSchema,
    template_name: Type.String(),
    template_version: Type.Integer({ minimum: 1 }),
  },
  { additionalProperties: false, $id: 'CommunicationCampaign' },
);

export const CommunicationDeliveryStatusSchema = Type.Union([
  Type.Literal('PENDING'),
  Type.Literal('PROCESSING'),
  Type.Literal('DELIVERED'),
  Type.Literal('FAILED'),
]);

export const CommunicationDeliverySchema = Type.Object(
  {
    attempt_count: Type.Integer({ minimum: 0 }),
    campaign_id: UuidSchema,
    campaign_name: Type.String(),
    created_at: UtcTimestampSchema,
    delivered_at: Type.Union([UtcTimestampSchema, Type.Null()]),
    id: UuidSchema,
    last_error: Type.Union([Type.String(), Type.Null()]),
    recipient_hint: Type.String(),
    status: CommunicationDeliveryStatusSchema,
  },
  { additionalProperties: false, $id: 'CommunicationDelivery' },
);

export const CommunicationsCenterSchema = Type.Object(
  {
    campaigns: Type.Array(CommunicationCampaignSchema),
    deliveries: Type.Array(CommunicationDeliverySchema),
    templates: Type.Array(CommunicationTemplateSchema),
  },
  { additionalProperties: false, $id: 'CommunicationsCenter' },
);

export const CommunicationTemplateParamsSchema = Type.Object(
  { templateId: UuidSchema },
  { additionalProperties: false },
);
export const CommunicationCampaignParamsSchema = Type.Object(
  { campaignId: UuidSchema },
  { additionalProperties: false },
);
export const CommunicationDeliveryParamsSchema = Type.Object(
  { deliveryId: UuidSchema },
  { additionalProperties: false },
);
export const CommunicationVersionSchema = Type.Object(
  { version: Type.Integer({ minimum: 1 }) },
  { additionalProperties: false, $id: 'CommunicationVersion' },
);

export type CommunicationAudience = Static<typeof CommunicationAudienceSchema>;
export type CommunicationAudiencePreview = Static<typeof CommunicationAudiencePreviewSchema>;
export type CommunicationAudienceType = Static<typeof CommunicationAudienceTypeSchema>;
export type CommunicationCampaign = Static<typeof CommunicationCampaignSchema>;
export type CommunicationCampaignCreate = Static<typeof CommunicationCampaignCreateSchema>;
export type CommunicationCampaignParams = Static<typeof CommunicationCampaignParamsSchema>;
export type CommunicationDelivery = Static<typeof CommunicationDeliverySchema>;
export type CommunicationDeliveryParams = Static<typeof CommunicationDeliveryParamsSchema>;
export type CommunicationsCenter = Static<typeof CommunicationsCenterSchema>;
export type CommunicationTemplate = Static<typeof CommunicationTemplateSchema>;
export type CommunicationTemplateInput = Static<typeof CommunicationTemplateInputSchema>;
export type CommunicationTemplateParams = Static<typeof CommunicationTemplateParamsSchema>;
export type CommunicationTemplateUpdate = Static<typeof CommunicationTemplateUpdateSchema>;
export type CommunicationVersion = Static<typeof CommunicationVersionSchema>;
