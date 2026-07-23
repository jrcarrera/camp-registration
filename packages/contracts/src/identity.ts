import { Type, type Static } from '@sinclair/typebox';

import { UtcTimestampSchema, UuidSchema } from './catalog.js';

export const AccountIdSchema = Type.String({ minLength: 1, maxLength: 255 });
export const IdentityRoleSchema = Type.Union([
  Type.Literal('camp_staff'),
  Type.Literal('health_staff'),
  Type.Literal('camp_admin'),
  Type.Literal('organization_admin'),
]);
export const AuthIntentSchema = Type.Union([
  Type.Literal('SIGN_IN'),
  Type.Literal('JOIN_ORGANIZATION'),
  Type.Literal('ACCEPT_INVITATION'),
  Type.Literal('RECOVER_PASSWORD'),
]);
export const AuthStepSchema = Type.Union([
  Type.Literal('EMAIL_OTP'),
  Type.Literal('RECOVERY_CODE'),
  Type.Literal('PASSWORD'),
  Type.Literal('TOTP'),
  Type.Literal('SET_PASSWORD'),
  Type.Literal('ENROLL_TOTP'),
  Type.Literal('AUTHENTICATED'),
]);

export const PublicOrganizationSchema = Type.Object(
  {
    name: Type.String({ minLength: 1 }),
    self_service_signup_enabled: Type.Boolean(),
    slug: Type.String({ minLength: 1 }),
  },
  { additionalProperties: false, $id: 'PublicOrganization' },
);

export const AuthChallengeStartSchema = Type.Object(
  {
    email: Type.String({ format: 'email', maxLength: 320 }),
    intent: AuthIntentSchema,
    invitation_token: Type.Optional(Type.String({ minLength: 32, maxLength: 512 })),
    organization_slug: Type.Optional(Type.String({ minLength: 1, maxLength: 160 })),
  },
  { additionalProperties: false, $id: 'AuthChallengeStart' },
);

export const AuthChallengeResponseSchema = Type.Object(
  {
    response: Type.String({ minLength: 1, maxLength: 1024 }),
    step: AuthStepSchema,
  },
  { additionalProperties: false, $id: 'AuthChallengeResponse' },
);

export const AuthChallengeSchema = Type.Object(
  {
    challenge_id: Type.String({ minLength: 32 }),
    expires_at: UtcTimestampSchema,
    next_step: AuthStepSchema,
    setup_secret: Type.Optional(Type.String({ minLength: 1 })),
  },
  { additionalProperties: false, $id: 'AuthChallenge' },
);

export const AuthOrganizationAccessSchema = Type.Object(
  {
    name: Type.String({ minLength: 1 }),
    organization_id: UuidSchema,
    roles: Type.Array(Type.Union([Type.Literal('parent_guardian'), IdentityRoleSchema]), {
      uniqueItems: true,
    }),
    slug: Type.String({ minLength: 1 }),
  },
  { additionalProperties: false, $id: 'AuthOrganizationAccess' },
);

export const AuthSessionSchema = Type.Object(
  {
    account_id: AccountIdSchema,
    active_organization_id: Type.Union([UuidSchema, Type.Null()]),
    authentication_method: Type.Union([
      Type.Literal('EMAIL_OTP'),
      Type.Literal('PASSWORD_TOTP'),
      Type.Literal('LOCAL'),
    ]),
    email: Type.String({ format: 'email' }),
    email_verified: Type.Boolean(),
    expires_at: UtcTimestampSchema,
    mfa_verified: Type.Boolean(),
    organizations: Type.Array(AuthOrganizationAccessSchema),
    platform_role: Type.Union([Type.Literal('system_admin'), Type.Null()]),
    requires_mfa_setup: Type.Boolean(),
  },
  { additionalProperties: false, $id: 'AuthSession' },
);

export const AuthSessionListItemSchema = Type.Object(
  {
    created_at: UtcTimestampSchema,
    current: Type.Boolean(),
    expires_at: UtcTimestampSchema,
    id: UuidSchema,
    last_seen_at: UtcTimestampSchema,
    mfa_verified: Type.Boolean(),
    revoked_at: Type.Union([UtcTimestampSchema, Type.Null()]),
  },
  { additionalProperties: false, $id: 'AuthSessionListItem' },
);

export const AuthSessionListSchema = Type.Object(
  { sessions: Type.Array(AuthSessionListItemSchema) },
  { additionalProperties: false, $id: 'AuthSessionList' },
);

export const SelectOrganizationSchema = Type.Object(
  { organization_id: UuidSchema },
  { additionalProperties: false, $id: 'SelectOrganization' },
);
export const EmailChangeStartSchema = Type.Object(
  { email: Type.String({ format: 'email', maxLength: 320 }) },
  { additionalProperties: false, $id: 'EmailChangeStart' },
);

export const OnboardingStatusSchema = Type.Union([
  Type.Literal('PENDING'),
  Type.Literal('APPROVED'),
  Type.Literal('REJECTED'),
]);
export const OnboardingResolutionSchema = Type.Union([
  Type.Literal('NEW_FAMILY'),
  Type.Literal('MATCHED_ADULT'),
  Type.Null(),
]);
export const OnboardingRequestCreateSchema = Type.Object(
  {
    first_name: Type.String({ minLength: 1, maxLength: 100 }),
    last_name: Type.String({ minLength: 1, maxLength: 100 }),
    phone: Type.Optional(Type.Union([Type.String({ maxLength: 50 }), Type.Null()])),
  },
  { additionalProperties: false, $id: 'OnboardingRequestCreate' },
);
export const OnboardingRequestSchema = Type.Object(
  {
    account_id: AccountIdSchema,
    created_at: UtcTimestampSchema,
    decision_reason: Type.Union([Type.String(), Type.Null()]),
    email: Type.String({ format: 'email' }),
    family_id: Type.Union([UuidSchema, Type.Null()]),
    first_name: Type.String(),
    id: UuidSchema,
    last_name: Type.String(),
    organization_id: UuidSchema,
    phone: Type.Union([Type.String(), Type.Null()]),
    resolution: OnboardingResolutionSchema,
    status: OnboardingStatusSchema,
    updated_at: UtcTimestampSchema,
  },
  { additionalProperties: false, $id: 'OnboardingRequest' },
);
export const OnboardingRequestListSchema = Type.Object(
  { requests: Type.Array(OnboardingRequestSchema) },
  { additionalProperties: false, $id: 'OnboardingRequestList' },
);
export const OnboardingMatchCandidateSchema = Type.Object(
  {
    adult_id: UuidSchema,
    adult_name: Type.String(),
    family_id: UuidSchema,
    family_name: Type.String(),
  },
  { additionalProperties: false, $id: 'OnboardingMatchCandidate' },
);
export const OnboardingMatchCandidateListSchema = Type.Object(
  { matches: Type.Array(OnboardingMatchCandidateSchema) },
  { additionalProperties: false, $id: 'OnboardingMatchCandidateList' },
);
export const OnboardingDecisionSchema = Type.Object(
  {
    action: Type.Union([
      Type.Literal('APPROVE_NEW'),
      Type.Literal('APPROVE_MATCH'),
      Type.Literal('REJECT'),
      Type.Literal('REOPEN'),
    ]),
    adult_id: Type.Optional(UuidSchema),
    family_id: Type.Optional(UuidSchema),
    reason: Type.Optional(Type.String({ minLength: 3, maxLength: 500 })),
  },
  { additionalProperties: false, $id: 'OnboardingDecision' },
);

export const InvitationStatusSchema = Type.Union([
  Type.Literal('PENDING'),
  Type.Literal('ACCEPTED'),
  Type.Literal('REVOKED'),
  Type.Literal('EXPIRED'),
]);
export const InvitationTypeSchema = Type.Union([
  Type.Literal('FAMILY_ADULT'),
  Type.Literal('WORKFORCE'),
]);
export const InvitationSchema = Type.Object(
  {
    adult_id: Type.Union([UuidSchema, Type.Null()]),
    created_at: UtcTimestampSchema,
    email_hint: Type.String(),
    expires_at: UtcTimestampSchema,
    family_id: Type.Union([UuidSchema, Type.Null()]),
    id: UuidSchema,
    invitation_type: InvitationTypeSchema,
    organization_id: UuidSchema,
    roles: Type.Array(IdentityRoleSchema),
    status: InvitationStatusSchema,
  },
  { additionalProperties: false, $id: 'Invitation' },
);
export const InvitationListSchema = Type.Object(
  { invitations: Type.Array(InvitationSchema) },
  { additionalProperties: false, $id: 'InvitationList' },
);
export const InvitationAcceptSchema = Type.Object(
  { token: Type.String({ minLength: 32, maxLength: 512 }) },
  { additionalProperties: false, $id: 'InvitationAccept' },
);
export const WorkforceInvitationCreateSchema = Type.Object(
  {
    email: Type.String({ format: 'email', maxLength: 320 }),
    roles: Type.Array(IdentityRoleSchema, { minItems: 1, uniqueItems: true }),
  },
  { additionalProperties: false, $id: 'WorkforceInvitationCreate' },
);

export const MembershipStatusSchema = Type.Union([
  Type.Literal('ACTIVE'),
  Type.Literal('DISABLED'),
]);
export const MembershipSchema = Type.Object(
  {
    account_id: AccountIdSchema,
    email: Type.String({ format: 'email' }),
    id: UuidSchema,
    organization_id: UuidSchema,
    roles: Type.Array(IdentityRoleSchema, { minItems: 1, uniqueItems: true }),
    status: MembershipStatusSchema,
    version: Type.Integer({ minimum: 1 }),
  },
  { additionalProperties: false, $id: 'Membership' },
);
export const MembershipListSchema = Type.Object(
  {
    invitations: Type.Array(InvitationSchema),
    memberships: Type.Array(MembershipSchema),
    onboarding_requests: Type.Array(OnboardingRequestSchema),
  },
  { additionalProperties: false, $id: 'MembershipList' },
);
export const MembershipUpdateSchema = Type.Object(
  {
    reason: Type.String({ minLength: 3, maxLength: 500 }),
    roles: Type.Array(IdentityRoleSchema, { minItems: 1, uniqueItems: true }),
    status: MembershipStatusSchema,
    version: Type.Integer({ minimum: 1 }),
  },
  { additionalProperties: false, $id: 'MembershipUpdate' },
);

export const AccountRecoverySchema = Type.Object(
  {
    email: Type.Optional(Type.String({ format: 'email', maxLength: 320 })),
    reason: Type.String({ minLength: 3, maxLength: 500 }),
    reset_mfa: Type.Boolean(),
  },
  { additionalProperties: false, $id: 'AccountRecovery' },
);
export const AccountStatusUpdateSchema = Type.Object(
  {
    reason: Type.String({ minLength: 3, maxLength: 500 }),
    status: Type.Union([Type.Literal('ACTIVE'), Type.Literal('SUSPENDED')]),
  },
  { additionalProperties: false, $id: 'AccountStatusUpdate' },
);
export const AccountSummarySchema = Type.Object(
  {
    email: Type.String({ format: 'email' }),
    email_verified: Type.Boolean(),
    id: AccountIdSchema,
    platform_role: Type.Union([Type.Literal('system_admin'), Type.Null()]),
    status: Type.Union([Type.Literal('ACTIVE'), Type.Literal('SUSPENDED')]),
  },
  { additionalProperties: false, $id: 'AccountSummary' },
);
export const AccountSummaryListSchema = Type.Object(
  { accounts: Type.Array(AccountSummarySchema) },
  { additionalProperties: false, $id: 'AccountSummaryList' },
);

export type AccountRecovery = Static<typeof AccountRecoverySchema>;
export type AccountStatusUpdate = Static<typeof AccountStatusUpdateSchema>;
export type AccountSummary = Static<typeof AccountSummarySchema>;
export type AuthChallenge = Static<typeof AuthChallengeSchema>;
export type AuthChallengeResponse = Static<typeof AuthChallengeResponseSchema>;
export type AuthChallengeStart = Static<typeof AuthChallengeStartSchema>;
export type AuthIntent = Static<typeof AuthIntentSchema>;
export type AuthSession = Static<typeof AuthSessionSchema>;
export type AuthSessionList = Static<typeof AuthSessionListSchema>;
export type EmailChangeStart = Static<typeof EmailChangeStartSchema>;
export type Invitation = Static<typeof InvitationSchema>;
export type InvitationAccept = Static<typeof InvitationAcceptSchema>;
export type IdentityRole = Static<typeof IdentityRoleSchema>;
export type Membership = Static<typeof MembershipSchema>;
export type MembershipList = Static<typeof MembershipListSchema>;
export type MembershipUpdate = Static<typeof MembershipUpdateSchema>;
export type OnboardingDecision = Static<typeof OnboardingDecisionSchema>;
export type OnboardingMatchCandidate = Static<typeof OnboardingMatchCandidateSchema>;
export type OnboardingRequest = Static<typeof OnboardingRequestSchema>;
export type OnboardingRequestCreate = Static<typeof OnboardingRequestCreateSchema>;
export type OnboardingRequestList = Static<typeof OnboardingRequestListSchema>;
export type PublicOrganization = Static<typeof PublicOrganizationSchema>;
export type SelectOrganization = Static<typeof SelectOrganizationSchema>;
export type WorkforceInvitationCreate = Static<typeof WorkforceInvitationCreateSchema>;
