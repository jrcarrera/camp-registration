import {
  AccountRecoverySchema,
  AccountStatusUpdateSchema,
  AccountSummaryListSchema,
  AuthChallengeResponseSchema,
  AuthChallengeSchema,
  AuthChallengeStartSchema,
  AuthSessionListSchema,
  AuthSessionSchema,
  EmailChangeStartSchema,
  InvitationSchema,
  MembershipListSchema,
  MembershipSchema,
  MembershipUpdateSchema,
  OnboardingDecisionSchema,
  OnboardingMatchCandidateListSchema,
  OnboardingRequestCreateSchema,
  OnboardingRequestSchema,
  ProblemResponseSchema,
  PublicOrganizationSchema,
  SelectOrganizationSchema,
  WorkforceInvitationCreateSchema,
  type AccountRecovery,
  type AccountStatusUpdate,
  type AccountSummary,
  type AuthChallenge,
  type AuthChallengeResponse,
  type AuthChallengeStart,
  type AuthSession,
  type AuthSessionList,
  type EmailChangeStart,
  type Invitation,
  type Membership,
  type MembershipList,
  type MembershipUpdate,
  type OnboardingDecision,
  type OnboardingMatchCandidate,
  type OnboardingRequest,
  type OnboardingRequestCreate,
  type ProblemResponse,
  type PublicOrganization,
  type SelectOrganization,
  type WorkforceInvitationCreate,
} from '@camp-registration/contracts';
import { IdentityConflictError, IdentityNotFoundError } from '@camp-registration/database';
import { Type, type Static } from '@sinclair/typebox';
import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';

import {
  IdentityAuthenticationError,
  IdentityAuthorizationError,
  IdentityValidationError,
  type IdentityRequestContext,
  type IdentityService,
} from './service.js';

const ChallengeParamsSchema = Type.Object({ challengeId: Type.String({ minLength: 32 }) });
const OrganizationSlugParamsSchema = Type.Object({
  organizationSlug: Type.String({ minLength: 1 }),
});
const SessionParamsSchema = Type.Object({ sessionId: Type.String({ format: 'uuid' }) });
const OnboardingParamsSchema = Type.Object({ requestId: Type.String({ format: 'uuid' }) });
const FamilyAdultParamsSchema = Type.Object({
  adultId: Type.String({ format: 'uuid' }),
  familyId: Type.String({ format: 'uuid' }),
});
const InvitationParamsSchema = Type.Object({ invitationId: Type.String({ format: 'uuid' }) });
const MembershipParamsSchema = Type.Object({ membershipId: Type.String({ format: 'uuid' }) });
const AccountParamsSchema = Type.Object({
  accountId: Type.String({ minLength: 1, maxLength: 255 }),
});
const AccountSearchQuerySchema = Type.Object({
  email: Type.String({ format: 'email', maxLength: 320 }),
});
const OrganizationParamsSchema = Type.Object({ organizationId: Type.String({ format: 'uuid' }) });
const OrganizationAdministratorInvitationSchema = Type.Object({
  email: Type.String({ format: 'email', maxLength: 320 }),
});

type ChallengeParams = Static<typeof ChallengeParamsSchema>;
type OrganizationSlugParams = Static<typeof OrganizationSlugParamsSchema>;
type SessionParams = Static<typeof SessionParamsSchema>;
type OnboardingParams = Static<typeof OnboardingParamsSchema>;
type FamilyAdultParams = Static<typeof FamilyAdultParamsSchema>;
type InvitationParams = Static<typeof InvitationParamsSchema>;
type MembershipParams = Static<typeof MembershipParamsSchema>;
type AccountParams = Static<typeof AccountParamsSchema>;
type AccountSearchQuery = Static<typeof AccountSearchQuerySchema>;
type OrganizationParams = Static<typeof OrganizationParamsSchema>;
type OrganizationAdministratorInvitation = Static<typeof OrganizationAdministratorInvitationSchema>;

type ContextResolver = (request: FastifyRequest) => IdentityRequestContext | undefined;

const authenticationWindows = new Map<string, { count: number; resetAt: number }>();

function checkAuthenticationRateLimit(request: FastifyRequest, email?: string): void {
  const now = Date.now();
  const keys = [
    `ip:${request.ip}`,
    ...(email
      ? [`email:${createHash('sha256').update(email.trim().toLowerCase()).digest('hex')}`]
      : []),
  ];
  for (const key of keys) {
    const current = authenticationWindows.get(key);
    const window =
      !current || current.resetAt <= now ? { count: 0, resetAt: now + 10 * 60 * 1000 } : current;
    window.count += 1;
    authenticationWindows.set(key, window);
    if (window.count > 20) {
      throw new IdentityAuthenticationError('Try again later');
    }
  }
}

function unavailable(reply: FastifyReply) {
  return reply.code(503).send({
    code: 'identity_unavailable',
    message: 'Identity dependencies are not configured.',
  });
}

function requireContext(
  resolveContext: ContextResolver,
  request: FastifyRequest,
  reply: FastifyReply,
): IdentityRequestContext | undefined {
  const context = resolveContext(request);
  if (!context) {
    reply.code(401).send({
      code: 'authentication_required',
      message: 'Sign in to continue.',
    });
    return undefined;
  }
  return context;
}

function sendProblem(reply: FastifyReply, error: unknown) {
  if (error instanceof IdentityValidationError) {
    return reply.code(400).send({
      code: 'invalid_identity_details',
      field_errors: error.fieldErrors,
      message: error.message,
    });
  }
  if (error instanceof IdentityAuthenticationError) {
    return reply.code(401).send({ code: 'authentication_failed', message: error.message });
  }
  if (error instanceof IdentityAuthorizationError) {
    const code = error.message.toLowerCase().includes('account is disabled')
      ? 'account_disabled'
      : error.message.toLowerCase().includes('multi-factor')
        ? 'mfa_required'
        : error.message.toLowerCase().includes('organization')
          ? 'organization_access_required'
          : 'forbidden';
    return reply.code(403).send({ code, message: error.message });
  }
  if (error instanceof IdentityNotFoundError) {
    return reply.code(404).send({ code: 'not_found', message: error.message });
  }
  if (error instanceof IdentityConflictError) {
    return reply.code(409).send({ code: 'identity_conflict', message: error.message });
  }
  throw error;
}

function setSessionCookie(reply: FastifyReply, token: string, expiresAt: string): void {
  const secure = process.env.NODE_ENV === 'production' ? '; Secure' : '';
  reply.header(
    'set-cookie',
    `camp_session=${encodeURIComponent(token)}; Path=/; HttpOnly; SameSite=Lax; Expires=${new Date(expiresAt).toUTCString()}${secure}`,
  );
}

function clearSessionCookie(reply: FastifyReply): void {
  const secure = process.env.NODE_ENV === 'production' ? '; Secure' : '';
  reply.header('set-cookie', `camp_session=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0${secure}`);
}

const errorResponses = {
  400: ProblemResponseSchema,
  401: ProblemResponseSchema,
  403: ProblemResponseSchema,
  404: ProblemResponseSchema,
  409: ProblemResponseSchema,
  503: ProblemResponseSchema,
};

export function registerIdentityRoutes(
  app: FastifyInstance,
  service: IdentityService | undefined,
  resolveContext: ContextResolver,
): void {
  app.get<{ Params: OrganizationSlugParams; Reply: PublicOrganization | ProblemResponse }>(
    '/v1/public/organizations/:organizationSlug',
    {
      schema: {
        params: OrganizationSlugParamsSchema,
        response: { 200: PublicOrganizationSchema, ...errorResponses },
        tags: ['identity', 'public'],
      },
    },
    async (request, reply) => {
      if (!service) return unavailable(reply);
      try {
        return await service.getPublicOrganization(request.params.organizationSlug);
      } catch (error) {
        return sendProblem(reply, error);
      }
    },
  );

  app.post<{ Body: AuthChallengeStart; Reply: AuthChallenge | ProblemResponse }>(
    '/v1/auth/challenges',
    {
      schema: {
        body: AuthChallengeStartSchema,
        response: { 201: AuthChallengeSchema, ...errorResponses },
        tags: ['identity'],
      },
    },
    async (request, reply) => {
      if (!service) return unavailable(reply);
      try {
        checkAuthenticationRateLimit(request, request.body.email);
        return reply.code(201).send(await service.startAuthentication(request.body, request.id));
      } catch (error) {
        return sendProblem(reply, error);
      }
    },
  );

  app.post<{
    Body: AuthChallengeResponse;
    Params: ChallengeParams;
    Reply: AuthChallenge | AuthSession | ProblemResponse;
  }>(
    '/v1/auth/challenges/:challengeId/respond',
    {
      schema: {
        body: AuthChallengeResponseSchema,
        params: ChallengeParamsSchema,
        response: {
          200: Type.Union([AuthChallengeSchema, AuthSessionSchema]),
          ...errorResponses,
        },
        tags: ['identity'],
      },
    },
    async (request, reply) => {
      if (!service) return unavailable(reply);
      try {
        checkAuthenticationRateLimit(request);
        const completion = await service.respondToAuthentication(
          request.params.challengeId,
          request.body,
          request.id,
        );
        if (completion.cookieToken && completion.session) {
          setSessionCookie(reply, completion.cookieToken, completion.session.expires_at);
          return completion.session;
        }
        return completion.challenge;
      } catch (error) {
        return sendProblem(reply, error);
      }
    },
  );

  app.get<{
    Params: OnboardingParams;
    Reply: { matches: OnboardingMatchCandidate[] } | ProblemResponse;
  }>(
    '/v1/identity/onboarding/:requestId/matches',
    {
      schema: {
        params: OnboardingParamsSchema,
        response: { 200: OnboardingMatchCandidateListSchema, ...errorResponses },
        tags: ['identity', 'onboarding'],
      },
    },
    async (request, reply) => {
      if (!service) return unavailable(reply);
      const context = requireContext(resolveContext, request, reply);
      if (!context) return;
      try {
        return { matches: await service.listOnboardingMatches(context, request.params.requestId) };
      } catch (error) {
        return sendProblem(reply, error);
      }
    },
  );

  app.get<{ Reply: AuthSession | ProblemResponse }>(
    '/v1/auth/session',
    {
      schema: { response: { 200: AuthSessionSchema, ...errorResponses }, tags: ['identity'] },
    },
    async (request, reply) => {
      if (!service) return unavailable(reply);
      const context = requireContext(resolveContext, request, reply);
      if (!context) return;
      return service.getSession(context);
    },
  );

  app.get<{ Reply: AuthSessionList | ProblemResponse }>(
    '/v1/auth/sessions',
    {
      schema: { response: { 200: AuthSessionListSchema, ...errorResponses }, tags: ['identity'] },
    },
    async (request, reply) => {
      if (!service) return unavailable(reply);
      const context = requireContext(resolveContext, request, reply);
      if (!context) return;
      return service.listSessions(context);
    },
  );

  app.post<{ Body: SelectOrganization; Reply: AuthSession | ProblemResponse }>(
    '/v1/auth/session/organization',
    {
      schema: {
        body: SelectOrganizationSchema,
        response: { 200: AuthSessionSchema, ...errorResponses },
        tags: ['identity'],
      },
    },
    async (request, reply) => {
      if (!service) return unavailable(reply);
      const context = requireContext(resolveContext, request, reply);
      if (!context) return;
      try {
        await service.selectOrganization(context, request.body.organization_id);
        return service.getSession({
          ...context,
          session: {
            ...context.session,
            active_organization_id: request.body.organization_id,
          },
        });
      } catch (error) {
        return sendProblem(reply, error);
      }
    },
  );

  app.post<{ Body: EmailChangeStart; Reply: AuthChallenge | ProblemResponse }>(
    '/v1/auth/email-change',
    {
      schema: {
        body: EmailChangeStartSchema,
        response: { 201: AuthChallengeSchema, ...errorResponses },
        tags: ['identity'],
      },
    },
    async (request, reply) => {
      if (!service) return unavailable(reply);
      const context = requireContext(resolveContext, request, reply);
      if (!context) return;
      try {
        checkAuthenticationRateLimit(request, request.body.email);
        return reply
          .code(201)
          .send(await service.startEmailChange(context, request.body, request.id));
      } catch (error) {
        return sendProblem(reply, error);
      }
    },
  );

  app.post<{
    Body: AuthChallengeResponse;
    Params: ChallengeParams;
    Reply: AuthSession | ProblemResponse;
  }>(
    '/v1/auth/email-change/:challengeId/respond',
    {
      schema: {
        body: AuthChallengeResponseSchema,
        params: ChallengeParamsSchema,
        response: { 200: AuthSessionSchema, ...errorResponses },
        tags: ['identity'],
      },
    },
    async (request, reply) => {
      if (!service) return unavailable(reply);
      const context = requireContext(resolveContext, request, reply);
      if (!context) return;
      try {
        checkAuthenticationRateLimit(request);
        return await service.completeEmailChange(
          context,
          request.params.challengeId,
          request.body,
          request.id,
        );
      } catch (error) {
        return sendProblem(reply, error);
      }
    },
  );

  app.delete<{ Params: SessionParams; Reply: void | ProblemResponse }>(
    '/v1/auth/sessions/:sessionId',
    {
      schema: {
        params: SessionParamsSchema,
        response: { 204: Type.Null(), ...errorResponses },
        tags: ['identity'],
      },
    },
    async (request, reply) => {
      if (!service) return unavailable(reply);
      const context = requireContext(resolveContext, request, reply);
      if (!context) return;
      try {
        await service.revokeSession(context, request.params.sessionId, request.id);
        return reply.code(204).send();
      } catch (error) {
        return sendProblem(reply, error);
      }
    },
  );

  app.delete<{ Reply: void | ProblemResponse }>(
    '/v1/auth/sessions',
    {
      schema: { response: { 204: Type.Null(), ...errorResponses }, tags: ['identity'] },
    },
    async (request, reply) => {
      if (!service) return unavailable(reply);
      const context = requireContext(resolveContext, request, reply);
      if (!context) return;
      try {
        await service.revokeOtherSessions(context, request.id);
        return reply.code(204).send();
      } catch (error) {
        return sendProblem(reply, error);
      }
    },
  );

  app.post<{ Reply: void | ProblemResponse }>(
    '/v1/auth/logout',
    {
      schema: { response: { 204: Type.Null(), ...errorResponses }, tags: ['identity'] },
    },
    async (request, reply) => {
      if (!service) return unavailable(reply);
      await service.logout(resolveContext(request), request.id);
      clearSessionCookie(reply);
      return reply.code(204).send();
    },
  );

  app.get<{
    Params: OrganizationSlugParams;
    Reply: OnboardingRequest | null | ProblemResponse;
  }>(
    '/v1/public/organizations/:organizationSlug/onboarding',
    {
      schema: {
        params: OrganizationSlugParamsSchema,
        response: {
          200: Type.Union([OnboardingRequestSchema, Type.Null()]),
          ...errorResponses,
        },
        tags: ['identity', 'onboarding'],
      },
    },
    async (request, reply) => {
      if (!service) return unavailable(reply);
      const context = requireContext(resolveContext, request, reply);
      if (!context) return;
      const organization = await service.getPublicOrganization(request.params.organizationSlug);
      const access = context.session.organizations.find(
        (candidate) => candidate.slug === organization.slug,
      );
      const organizationId = access?.organization_id ?? context.session.active_organization_id;
      if (!organizationId) return null;
      return service.getOnboarding(context, organizationId);
    },
  );

  app.post<{
    Body: OnboardingRequestCreate;
    Params: OrganizationSlugParams;
    Reply: OnboardingRequest | ProblemResponse;
  }>(
    '/v1/public/organizations/:organizationSlug/onboarding',
    {
      schema: {
        body: OnboardingRequestCreateSchema,
        params: OrganizationSlugParamsSchema,
        response: { 201: OnboardingRequestSchema, ...errorResponses },
        tags: ['identity', 'onboarding'],
      },
    },
    async (request, reply) => {
      if (!service) return unavailable(reply);
      const context = requireContext(resolveContext, request, reply);
      if (!context) return;
      try {
        return reply
          .code(201)
          .send(
            await service.createOnboarding(context, request.params.organizationSlug, request.body),
          );
      } catch (error) {
        return sendProblem(reply, error);
      }
    },
  );

  app.get<{ Reply: MembershipList | ProblemResponse }>(
    '/v1/identity/administration',
    {
      schema: { response: { 200: MembershipListSchema, ...errorResponses }, tags: ['identity'] },
    },
    async (request, reply) => {
      if (!service) return unavailable(reply);
      const context = requireContext(resolveContext, request, reply);
      if (!context) return;
      try {
        return await service.listAdministration(context);
      } catch (error) {
        return sendProblem(reply, error);
      }
    },
  );

  app.post<{
    Body: OnboardingDecision;
    Params: OnboardingParams;
    Reply: OnboardingRequest | ProblemResponse;
  }>(
    '/v1/identity/onboarding/:requestId/decision',
    {
      schema: {
        body: OnboardingDecisionSchema,
        params: OnboardingParamsSchema,
        response: { 200: OnboardingRequestSchema, ...errorResponses },
        tags: ['identity', 'onboarding'],
      },
    },
    async (request, reply) => {
      if (!service) return unavailable(reply);
      const context = requireContext(resolveContext, request, reply);
      if (!context) return;
      try {
        return await service.decideOnboarding(
          context,
          request.id,
          request.params.requestId,
          request.body,
        );
      } catch (error) {
        return sendProblem(reply, error);
      }
    },
  );

  app.post<{ Params: FamilyAdultParams; Reply: Invitation | ProblemResponse }>(
    '/v1/families/:familyId/adults/:adultId/invitations',
    {
      schema: {
        params: FamilyAdultParamsSchema,
        response: { 201: InvitationSchema, ...errorResponses },
        tags: ['families', 'identity'],
      },
    },
    async (request, reply) => {
      if (!service) return unavailable(reply);
      const context = requireContext(resolveContext, request, reply);
      if (!context) return;
      try {
        return reply
          .code(201)
          .send(
            await service.createFamilyInvitation(
              context,
              request.id,
              request.params.familyId,
              request.params.adultId,
            ),
          );
      } catch (error) {
        return sendProblem(reply, error);
      }
    },
  );

  app.post<{ Body: WorkforceInvitationCreate; Reply: Invitation | ProblemResponse }>(
    '/v1/identity/workforce-invitations',
    {
      schema: {
        body: WorkforceInvitationCreateSchema,
        response: { 201: InvitationSchema, ...errorResponses },
        tags: ['identity'],
      },
    },
    async (request, reply) => {
      if (!service) return unavailable(reply);
      const context = requireContext(resolveContext, request, reply);
      if (!context) return;
      try {
        return reply
          .code(201)
          .send(await service.createWorkforceInvitation(context, request.id, request.body));
      } catch (error) {
        return sendProblem(reply, error);
      }
    },
  );

  app.delete<{ Params: InvitationParams; Reply: void | ProblemResponse }>(
    '/v1/identity/invitations/:invitationId',
    {
      schema: {
        params: InvitationParamsSchema,
        response: { 204: Type.Null(), ...errorResponses },
        tags: ['identity'],
      },
    },
    async (request, reply) => {
      if (!service) return unavailable(reply);
      const context = requireContext(resolveContext, request, reply);
      if (!context) return;
      try {
        await service.revokeInvitation(context, request.id, request.params.invitationId);
        return reply.code(204).send();
      } catch (error) {
        return sendProblem(reply, error);
      }
    },
  );

  app.post<{ Params: InvitationParams; Reply: Invitation | ProblemResponse }>(
    '/v1/identity/invitations/:invitationId/resend',
    {
      schema: {
        params: InvitationParamsSchema,
        response: { 201: InvitationSchema, ...errorResponses },
        tags: ['identity'],
      },
    },
    async (request, reply) => {
      if (!service) return unavailable(reply);
      const context = requireContext(resolveContext, request, reply);
      if (!context) return;
      try {
        return reply
          .code(201)
          .send(await service.resendInvitation(context, request.id, request.params.invitationId));
      } catch (error) {
        return sendProblem(reply, error);
      }
    },
  );

  app.patch<{
    Body: MembershipUpdate;
    Params: MembershipParams;
    Reply: Membership | ProblemResponse;
  }>(
    '/v1/identity/memberships/:membershipId',
    {
      schema: {
        body: MembershipUpdateSchema,
        params: MembershipParamsSchema,
        response: { 200: MembershipSchema, ...errorResponses },
        tags: ['identity'],
      },
    },
    async (request, reply) => {
      if (!service) return unavailable(reply);
      const context = requireContext(resolveContext, request, reply);
      if (!context) return;
      try {
        return await service.updateMembership(
          context,
          request.id,
          request.params.membershipId,
          request.body,
        );
      } catch (error) {
        return sendProblem(reply, error);
      }
    },
  );

  app.patch<{ Body: AccountStatusUpdate; Params: AccountParams; Reply: void | ProblemResponse }>(
    '/v1/system/accounts/:accountId/status',
    {
      schema: {
        body: AccountStatusUpdateSchema,
        params: AccountParamsSchema,
        response: { 204: Type.Null(), ...errorResponses },
        tags: ['identity', 'system'],
      },
    },
    async (request, reply) => {
      if (!service) return unavailable(reply);
      const context = requireContext(resolveContext, request, reply);
      if (!context) return;
      try {
        await service.updateAccountStatus(
          context,
          request.id,
          request.params.accountId,
          request.body,
        );
        return reply.code(204).send();
      } catch (error) {
        return sendProblem(reply, error);
      }
    },
  );

  app.get<{
    Querystring: AccountSearchQuery;
    Reply: { accounts: AccountSummary[] } | ProblemResponse;
  }>(
    '/v1/system/accounts',
    {
      schema: {
        querystring: AccountSearchQuerySchema,
        response: { 200: AccountSummaryListSchema, ...errorResponses },
        tags: ['identity', 'system'],
      },
    },
    async (request, reply) => {
      if (!service) return unavailable(reply);
      const context = requireContext(resolveContext, request, reply);
      if (!context) return;
      try {
        return { accounts: await service.searchAccounts(context, request.query.email) };
      } catch (error) {
        return sendProblem(reply, error);
      }
    },
  );

  app.post<{
    Body: OrganizationAdministratorInvitation;
    Params: OrganizationParams;
    Reply: Invitation | ProblemResponse;
  }>(
    '/v1/system/organizations/:organizationId/administrator-invitations',
    {
      schema: {
        body: OrganizationAdministratorInvitationSchema,
        params: OrganizationParamsSchema,
        response: { 201: InvitationSchema, ...errorResponses },
        tags: ['identity', 'system'],
      },
    },
    async (request, reply) => {
      if (!service) return unavailable(reply);
      const context = requireContext(resolveContext, request, reply);
      if (!context) return;
      try {
        return reply
          .code(201)
          .send(
            await service.createOrganizationAdminInvitation(
              context,
              request.id,
              request.params.organizationId,
              request.body.email,
            ),
          );
      } catch (error) {
        return sendProblem(reply, error);
      }
    },
  );

  app.post<{ Body: AccountRecovery; Params: AccountParams; Reply: void | ProblemResponse }>(
    '/v1/system/accounts/:accountId/recovery',
    {
      schema: {
        body: AccountRecoverySchema,
        params: AccountParamsSchema,
        response: { 204: Type.Null(), ...errorResponses },
        tags: ['identity', 'system'],
      },
    },
    async (request, reply) => {
      if (!service) return unavailable(reply);
      const context = requireContext(resolveContext, request, reply);
      if (!context) return;
      try {
        await service.recoverAccount(context, request.id, request.params.accountId, request.body);
        return reply.code(204).send();
      } catch (error) {
        return sendProblem(reply, error);
      }
    },
  );
}
import { createHash } from 'node:crypto';
