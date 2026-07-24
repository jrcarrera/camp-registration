import { createHash, randomBytes, randomUUID } from 'node:crypto';

import type { RequestIdentity } from '@camp-registration/auth';
import type {
  AccountRecovery,
  AccountStatusUpdate,
  AccountSummary,
  AuthChallenge,
  AuthChallengeResponse,
  AuthChallengeStart,
  AuthSession,
  AuthSessionList,
  EmailChangeStart,
  Invitation,
  MembershipList,
  MembershipUpdate,
  OnboardingDecision,
  OnboardingMatchCandidate,
  OnboardingRequest,
  OnboardingRequestCreate,
  PublicOrganization,
  WorkforceInvitationCreate,
} from '@camp-registration/contracts';
import {
  IdentityConflictError,
  IdentityNotFoundError,
  type AccountRecord,
  type IdentityRole,
  type IdentityStore,
  type ResolvedSessionRecord,
} from '@camp-registration/database';

import type { AuthStateCipher } from './encryption.js';
import type { IdentityProvider, ProviderIdentity } from './provider.js';

const parentIdleMs = 12 * 60 * 60 * 1000;
const parentAbsoluteMs = 14 * 24 * 60 * 60 * 1000;
const workforceIdleMs = 30 * 60 * 1000;
const workforceAbsoluteMs = 12 * 60 * 60 * 1000;
const invitationLifetimeMs = 7 * 24 * 60 * 60 * 1000;
const challengeLifetimeMs = 10 * 60 * 1000;
const workforceRoles = new Set<IdentityRole>([
  'camp_staff',
  'health_staff',
  'finance_staff',
  'camp_admin',
  'organization_admin',
]);

interface StoredProviderState {
  accessToken?: string;
  accountId?: string;
  enrollmentState?: string;
  identity?: ProviderIdentity;
  previousEmail?: string;
  providerState?: string;
  purpose?: 'EMAIL_CHANGE';
  recoveryCode?: string;
}

export interface IdentityRequestContext {
  requestIdentity: RequestIdentity | undefined;
  session: ResolvedSessionRecord;
}

export interface AuthCompletion {
  challenge: AuthChallenge;
  cookieToken?: string;
  session?: AuthSession;
}

export class IdentityAuthorizationError extends Error {}
export class IdentityAuthenticationError extends Error {}
export class IdentityValidationError extends Error {
  constructor(
    readonly fieldErrors: Record<string, string>,
    message = 'Identity details are invalid',
  ) {
    super(message);
  }
}

function normalizeEmail(value: string): string {
  return value.trim().toLowerCase();
}

function secret(): string {
  return randomBytes(32).toString('base64url');
}

function hash(value: string): string {
  return createHash('sha256').update(value).digest('hex');
}

function encodedState(cipher: AuthStateCipher, value: StoredProviderState): string {
  return cipher.encrypt(JSON.stringify(value));
}

function decodedState(cipher: AuthStateCipher, value: string | null): StoredProviderState {
  if (!value) throw new IdentityAuthenticationError('Authentication challenge is invalid');
  return JSON.parse(cipher.decrypt(value)) as StoredProviderState;
}

function hasWorkforceRole(roles: readonly string[]): boolean {
  return roles.some((role) => workforceRoles.has(role as IdentityRole));
}

function mapSession(session: ResolvedSessionRecord): AuthSession {
  return {
    account_id: session.account.id,
    active_organization_id: session.active_organization_id,
    authentication_method: session.authentication_method,
    email: session.account.primary_email,
    email_verified: session.account.email_verified,
    expires_at: new Date(
      Math.min(
        new Date(session.idle_expires_at).valueOf(),
        new Date(session.absolute_expires_at).valueOf(),
      ),
    ).toISOString(),
    mfa_verified: session.mfa_verified,
    organizations: session.organizations,
    platform_role: session.account.platform_role,
    requires_mfa_setup: session.requires_mfa_setup,
  };
}

function requestIdentity(session: ResolvedSessionRecord): RequestIdentity | undefined {
  const active = session.organizations.find(
    (organization) => organization.organization_id === session.active_organization_id,
  );
  if (!active) return undefined;
  return {
    email: session.account.primary_email,
    emailVerified: session.account.email_verified,
    memberships: [
      {
        campIds: [],
        organizationId: active.organization_id,
        roles: active.roles,
      },
    ],
    mfaVerified: session.mfa_verified,
    subject: session.account.id,
  };
}

export class IdentityService {
  constructor(
    private readonly store: IdentityStore,
    private readonly provider: IdentityProvider,
    private readonly cipher: AuthStateCipher,
    private readonly publicAppBaseUrl: string,
  ) {}

  async getPublicOrganization(slug: string): Promise<PublicOrganization> {
    const organization = await this.store.getPublicOrganization(slug);
    if (!organization) throw new IdentityNotFoundError('Organization not found');
    return {
      name: organization.name,
      self_service_signup_enabled: organization.self_service_signup_enabled,
      slug: organization.slug,
    };
  }

  async startEmailChange(
    context: IdentityRequestContext,
    input: EmailChangeStart,
    requestId: string,
  ): Promise<AuthChallenge> {
    const nextEmail = normalizeEmail(input.email);
    const currentEmail = context.session.account.email_normalized;
    if (nextEmail === currentEmail) {
      throw new IdentityValidationError({ email: 'Enter a different email address.' });
    }
    if (await this.store.findAccountByEmail(nextEmail)) {
      throw new IdentityConflictError('That email address is already in use');
    }

    await this.provider.setEmail(context.session.account.primary_email, nextEmail);
    let providerChallenge;
    try {
      providerChallenge = await this.provider.start(nextEmail, 'EMAIL_OTP');
    } catch {
      throw new IdentityAuthenticationError('Email verification could not be started');
    }
    const challengeToken = secret();
    const expiresAt = new Date(Date.now() + challengeLifetimeMs);
    await this.store.updateAccountEmail(context.session.account.id, nextEmail, false);
    await this.store.createChallenge({
      emailNormalized: nextEmail,
      expiresAt,
      id: randomUUID(),
      intent: 'SIGN_IN',
      invitationTokenHash: null,
      nextStep: 'EMAIL_OTP',
      organizationId: context.session.active_organization_id,
      providerState: encodedState(this.cipher, {
        accountId: context.session.account.id,
        previousEmail: currentEmail,
        providerState: providerChallenge.state,
        purpose: 'EMAIL_CHANGE',
      }),
      tokenHash: hash(challengeToken),
    });
    await this.store.recordIdentityAudit({
      action: 'identity.email_change_started',
      actorAccountId: context.session.account.id,
      details: {},
      outcome: 'SUCCESS',
      requestId,
      targetAccountId: context.session.account.id,
    });
    return {
      challenge_id: challengeToken,
      expires_at: expiresAt.toISOString(),
      next_step: 'EMAIL_OTP',
    };
  }

  async completeEmailChange(
    context: IdentityRequestContext,
    challengeToken: string,
    input: AuthChallengeResponse,
    requestId: string,
  ): Promise<AuthSession> {
    const challenge = await this.store.getChallenge(hash(challengeToken));
    if (
      !challenge ||
      challenge.completed_at ||
      new Date(challenge.expires_at).valueOf() <= Date.now() ||
      challenge.attempt_count >= 5 ||
      challenge.next_step !== 'EMAIL_OTP' ||
      input.step !== 'EMAIL_OTP'
    ) {
      throw new IdentityAuthenticationError('Email verification is invalid or expired');
    }
    const stored = decodedState(this.cipher, challenge.provider_state);
    if (
      stored.purpose !== 'EMAIL_CHANGE' ||
      stored.accountId !== context.session.account.id ||
      !stored.providerState
    ) {
      throw new IdentityAuthenticationError('Email verification is invalid');
    }
    let result;
    try {
      result = await this.provider.respond({
        email: challenge.email_normalized,
        response: input.response,
        state: stored.providerState,
        step: 'EMAIL_OTP',
      });
    } catch {
      await this.store.advanceChallenge(
        challenge.id,
        challenge.next_step,
        challenge.provider_state,
      );
      throw new IdentityAuthenticationError('Verification failed');
    }
    if (
      !result.identity?.emailVerified ||
      normalizeEmail(result.identity.email) !== challenge.email_normalized
    ) {
      throw new IdentityAuthenticationError('Email verification did not complete');
    }
    const account = await this.store.upsertProviderAccount({
      accountId: context.session.account.id,
      email: result.identity.email,
      emailNormalized: challenge.email_normalized,
      emailVerified: true,
      externalIdentityId: randomUUID(),
      issuer: result.identity.issuer,
      provider: result.identity.provider,
      providerSubject: result.identity.subject,
    });
    await this.store.advanceChallenge(challenge.id, 'AUTHENTICATED', null, true);
    await this.store.recordIdentityAudit({
      action: 'identity.email_changed',
      actorAccountId: account.id,
      details: {},
      outcome: 'SUCCESS',
      requestId,
      targetAccountId: account.id,
    });
    return mapSession({
      ...context.session,
      account,
    });
  }

  async startAuthentication(input: AuthChallengeStart, requestId: string): Promise<AuthChallenge> {
    const emailNormalized = normalizeEmail(input.email);
    let organizationId: string | null = null;
    let invitationTokenHash: string | null = null;

    if (input.intent === 'JOIN_ORGANIZATION') {
      if (!input.organization_slug) {
        throw new IdentityValidationError({
          organization_slug: 'Choose the organization registration link.',
        });
      }
      const organization = await this.store.getPublicOrganization(input.organization_slug);
      if (!organization?.self_service_signup_enabled) {
        throw new IdentityNotFoundError('Organization signup is not available');
      }
      organizationId = organization.id;
      await this.provider.ensureUser(emailNormalized);
    } else if (input.intent === 'ACCEPT_INVITATION') {
      if (!input.invitation_token) {
        throw new IdentityValidationError({ invitation_token: 'Invitation token is required.' });
      }
      invitationTokenHash = hash(input.invitation_token);
      const invitation = await this.store.inspectInvitation(invitationTokenHash);
      if (!invitation || invitation.emailNormalized !== emailNormalized) {
        throw new IdentityNotFoundError('Invitation is not available');
      }
      organizationId = invitation.organizationId;
      await this.provider.ensureUser(emailNormalized);
    }

    const account = await this.store.findAccountByEmail(emailNormalized);
    const access = account ? await this.store.listOrganizationAccess(account.id) : [];
    const privileged =
      account?.platform_role === 'system_admin' ||
      access.some((organization) => hasWorkforceRole(organization.roles));
    if (account && input.intent === 'SIGN_IN') await this.provider.ensureUser(emailNormalized);
    let providerChallenge;
    try {
      if (input.intent === 'RECOVER_PASSWORD' && privileged) {
        const recovery = await this.provider.startPasswordRecovery(emailNormalized);
        providerChallenge = { nextStep: 'RECOVERY_CODE' as const, state: recovery.state };
      } else {
        providerChallenge = await this.provider.start(
          emailNormalized,
          privileged ? 'PASSWORD' : 'EMAIL_OTP',
        );
      }
    } catch {
      providerChallenge = {
        nextStep: privileged ? ('PASSWORD' as const) : ('EMAIL_OTP' as const),
        state: 'unavailable-account',
      };
    }
    const challengeToken = secret();
    const expiresAt = new Date(Date.now() + challengeLifetimeMs);
    await this.store.createChallenge({
      emailNormalized,
      expiresAt,
      id: randomUUID(),
      intent: input.intent,
      invitationTokenHash,
      nextStep: providerChallenge.nextStep,
      organizationId,
      providerState: encodedState(this.cipher, { providerState: providerChallenge.state }),
      tokenHash: hash(challengeToken),
    });
    await this.store.recordIdentityAudit({
      action: 'identity.authentication_started',
      details: { intent: input.intent },
      organizationId,
      outcome: 'SUCCESS',
      requestId,
    });
    return {
      challenge_id: challengeToken,
      expires_at: expiresAt.toISOString(),
      next_step: providerChallenge.nextStep,
    };
  }

  async respondToAuthentication(
    challengeToken: string,
    input: AuthChallengeResponse,
    requestId: string,
  ): Promise<AuthCompletion> {
    const challenge = await this.store.getChallenge(hash(challengeToken));
    if (
      !challenge ||
      challenge.completed_at ||
      new Date(challenge.expires_at).valueOf() <= Date.now() ||
      challenge.attempt_count >= 5 ||
      challenge.next_step !== input.step
    ) {
      throw new IdentityAuthenticationError('Authentication challenge is invalid or expired');
    }
    const stored = decodedState(this.cipher, challenge.provider_state);
    if (stored.purpose === 'EMAIL_CHANGE') {
      throw new IdentityAuthenticationError('Use the signed-in email verification flow');
    }

    if (input.step === 'SET_PASSWORD') {
      if (challenge.intent === 'RECOVER_PASSWORD') {
        if (!stored.providerState || !stored.recoveryCode) {
          throw new IdentityAuthenticationError('Recovery session is invalid');
        }
        await this.provider.completePasswordRecovery(
          challenge.email_normalized,
          stored.providerState,
          stored.recoveryCode,
          input.response,
        );
        const next = await this.provider.start(challenge.email_normalized, 'PASSWORD');
        await this.store.advanceChallenge(
          challenge.id,
          next.nextStep,
          encodedState(this.cipher, { providerState: next.state }),
        );
        return {
          challenge: {
            challenge_id: challengeToken,
            expires_at: new Date(challenge.expires_at).toISOString(),
            next_step: next.nextStep,
          },
        };
      }
      if (!stored.accessToken || !stored.identity) {
        throw new IdentityAuthenticationError('Setup session is invalid');
      }
      await this.provider.setInitialPassword(stored.identity.email, input.response);
      const enrollment = await this.provider.beginTotpEnrollment(stored.accessToken);
      const nextState = encodedState(this.cipher, {
        ...stored,
        enrollmentState: enrollment.state,
      });
      await this.store.advanceChallenge(challenge.id, 'ENROLL_TOTP', nextState);
      return {
        challenge: {
          challenge_id: challengeToken,
          expires_at: new Date(challenge.expires_at).toISOString(),
          next_step: 'ENROLL_TOTP',
          setup_secret: enrollment.secret,
        },
      };
    }

    if (input.step === 'RECOVERY_CODE') {
      await this.store.advanceChallenge(
        challenge.id,
        'SET_PASSWORD',
        encodedState(this.cipher, { ...stored, recoveryCode: input.response }),
      );
      return {
        challenge: {
          challenge_id: challengeToken,
          expires_at: new Date(challenge.expires_at).toISOString(),
          next_step: 'SET_PASSWORD',
        },
      };
    }

    if (input.step === 'ENROLL_TOTP') {
      if (!stored.accessToken || !stored.identity || !stored.accountId) {
        throw new IdentityAuthenticationError('Setup session is invalid');
      }
      await this.provider.verifyTotpEnrollment(
        stored.accessToken,
        input.response,
        stored.enrollmentState ?? '',
      );
      await this.store.advanceChallenge(challenge.id, 'AUTHENTICATED', null, true);
      return this.completeSession(
        challengeToken,
        stored.accountId,
        true,
        false,
        'PASSWORD_TOTP',
        challenge.organization_id,
        requestId,
      );
    }

    if (!stored.providerState) {
      throw new IdentityAuthenticationError('Authentication challenge is invalid');
    }
    let result;
    try {
      result = await this.provider.respond({
        email: challenge.email_normalized,
        response: input.response,
        state: stored.providerState,
        step: input.step as 'EMAIL_OTP' | 'PASSWORD' | 'TOTP',
      });
    } catch {
      await this.store.advanceChallenge(
        challenge.id,
        challenge.next_step,
        challenge.provider_state,
      );
      await this.store.recordIdentityAudit({
        action: 'identity.authentication_failed',
        organizationId: challenge.organization_id,
        outcome: 'DENIED',
        requestId,
      });
      throw new IdentityAuthenticationError('Verification failed');
    }
    if (result.nextStep && result.state) {
      await this.store.advanceChallenge(
        challenge.id,
        result.nextStep,
        encodedState(this.cipher, { providerState: result.state }),
      );
      return {
        challenge: {
          challenge_id: challengeToken,
          expires_at: new Date(challenge.expires_at).toISOString(),
          next_step: result.nextStep,
        },
      };
    }
    if (!result.identity) throw new IdentityAuthenticationError('Authentication did not complete');
    let account = await this.store.findAccountByEmail(normalizeEmail(result.identity.email));
    if (!account && challenge.intent === 'SIGN_IN') {
      throw new IdentityAuthenticationError('Sign-in details are invalid');
    }
    account = await this.store.upsertProviderAccount({
      accountId: account?.id ?? randomUUID(),
      email: result.identity.email,
      emailNormalized: normalizeEmail(result.identity.email),
      emailVerified: result.identity.emailVerified,
      externalIdentityId: randomUUID(),
      issuer: result.identity.issuer,
      provider: result.identity.provider,
      providerSubject: result.identity.subject,
    });
    if (account.status !== 'ACTIVE') {
      throw new IdentityAuthorizationError('Account is disabled');
    }

    if (challenge.invitation_token_hash) {
      await this.store.acceptInvitation(account, challenge.invitation_token_hash, requestId);
    }
    const access = await this.store.listOrganizationAccess(account.id);
    const privileged =
      account.platform_role === 'system_admin' ||
      access.some((organization) => hasWorkforceRole(organization.roles));
    if (privileged && input.step === 'EMAIL_OTP') {
      if (!result.accessToken) throw new IdentityAuthenticationError('Setup session is invalid');
      await this.store.advanceChallenge(
        challenge.id,
        'SET_PASSWORD',
        encodedState(this.cipher, {
          accessToken: result.accessToken,
          accountId: account.id,
          identity: result.identity,
        }),
      );
      return {
        challenge: {
          challenge_id: challengeToken,
          expires_at: new Date(challenge.expires_at).toISOString(),
          next_step: 'SET_PASSWORD',
        },
      };
    }
    if (privileged && input.step === 'PASSWORD') {
      if (!result.accessToken) throw new IdentityAuthenticationError('Setup session is invalid');
      const enrollment = await this.provider.beginTotpEnrollment(result.accessToken);
      await this.store.advanceChallenge(
        challenge.id,
        'ENROLL_TOTP',
        encodedState(this.cipher, {
          accessToken: result.accessToken,
          accountId: account.id,
          enrollmentState: enrollment.state,
          identity: result.identity,
        }),
      );
      return {
        challenge: {
          challenge_id: challengeToken,
          expires_at: new Date(challenge.expires_at).toISOString(),
          next_step: 'ENROLL_TOTP',
          setup_secret: enrollment.secret,
        },
      };
    }

    await this.store.advanceChallenge(challenge.id, 'AUTHENTICATED', null, true);
    return this.completeSession(
      challengeToken,
      account.id,
      input.step === 'TOTP',
      false,
      input.step === 'TOTP' ? 'PASSWORD_TOTP' : 'EMAIL_OTP',
      challenge.organization_id,
      requestId,
    );
  }

  async resolveRequest(
    cookieToken: string | undefined,
  ): Promise<IdentityRequestContext | undefined> {
    if (!cookieToken) return undefined;
    const session = await this.store.resolveSession(hash(cookieToken));
    if (!session) return undefined;
    const privileged =
      session.account.platform_role === 'system_admin' ||
      session.organizations.some((organization) => hasWorkforceRole(organization.roles));
    if (privileged && !session.mfa_verified) session.requires_mfa_setup = true;
    const idleMs = privileged ? workforceIdleMs : parentIdleMs;
    await this.store.touchSession(session.id, new Date(Date.now() + idleMs));
    return { requestIdentity: requestIdentity(session), session };
  }

  async getSession(context: IdentityRequestContext): Promise<AuthSession> {
    return mapSession(context.session);
  }

  async listSessions(context: IdentityRequestContext): Promise<AuthSessionList> {
    const sessions = await this.store.listSessions(context.session.account.id);
    return {
      sessions: sessions.map((session) => ({
        created_at: new Date(session.created_at).toISOString(),
        current: session.id === context.session.id,
        expires_at: new Date(
          Math.min(
            new Date(session.idle_expires_at).valueOf(),
            new Date(session.absolute_expires_at).valueOf(),
          ),
        ).toISOString(),
        id: session.id,
        last_seen_at: new Date(session.last_seen_at).toISOString(),
        mfa_verified: session.mfa_verified,
        revoked_at: session.revoked_at ? new Date(session.revoked_at).toISOString() : null,
      })),
    };
  }

  async selectOrganization(context: IdentityRequestContext, organizationId: string): Promise<void> {
    await this.store.selectOrganization(
      context.session.id,
      context.session.account.id,
      organizationId,
    );
  }

  async revokeSession(
    context: IdentityRequestContext,
    sessionId: string,
    requestId: string,
  ): Promise<void> {
    await this.store.revokeSession(context.session.account.id, sessionId, 'User revoked session');
    await this.store.recordIdentityAudit({
      action: 'identity.session_revoked',
      actorAccountId: context.session.account.id,
      outcome: 'SUCCESS',
      requestId,
      targetAccountId: context.session.account.id,
    });
  }

  async revokeOtherSessions(context: IdentityRequestContext, requestId: string): Promise<void> {
    await this.store.revokeOtherSessions(
      context.session.account.id,
      context.session.id,
      'User revoked other sessions',
    );
    await this.store.recordIdentityAudit({
      action: 'identity.other_sessions_revoked',
      actorAccountId: context.session.account.id,
      outcome: 'SUCCESS',
      requestId,
      targetAccountId: context.session.account.id,
    });
  }

  async logout(context: IdentityRequestContext | undefined, requestId: string): Promise<void> {
    if (!context) return;
    await this.store.revokeSession(
      context.session.account.id,
      context.session.id,
      'User signed out',
    );
    await this.store.recordIdentityAudit({
      action: 'identity.logout',
      actorAccountId: context.session.account.id,
      outcome: 'SUCCESS',
      requestId,
      targetAccountId: context.session.account.id,
    });
  }

  async getOnboarding(
    context: IdentityRequestContext,
    organizationId: string,
  ): Promise<OnboardingRequest | null> {
    this.requireAccount(context);
    return this.store.getOnboardingForAccount(organizationId, context.session.account.id);
  }

  async createOnboarding(
    context: IdentityRequestContext,
    organizationSlug: string,
    input: OnboardingRequestCreate,
  ): Promise<OnboardingRequest> {
    const organization = await this.store.getPublicOrganization(organizationSlug);
    if (!organization?.self_service_signup_enabled) {
      throw new IdentityNotFoundError('Organization signup is not available');
    }
    const errors: Record<string, string> = {};
    const firstName = input.first_name.trim();
    const lastName = input.last_name.trim();
    if (!firstName) errors.first_name = 'Enter your first name.';
    if (!lastName) errors.last_name = 'Enter your last name.';
    if (Object.keys(errors).length) throw new IdentityValidationError(errors);
    return this.store.createOnboarding({
      accountId: context.session.account.id,
      firstName,
      id: randomUUID(),
      lastName,
      organizationId: organization.id,
      phone: input.phone?.trim() || null,
    });
  }

  async listAdministration(context: IdentityRequestContext): Promise<MembershipList> {
    const active = this.requireOrganizationAdmin(context);
    const [memberships, invitations, onboardingRequests] = await Promise.all([
      this.store.listMemberships(active.organizationId),
      this.store.listInvitations(active.organizationId),
      this.store.listOnboarding(active.organizationId),
    ]);
    return {
      invitations,
      memberships,
      onboarding_requests: onboardingRequests,
    };
  }

  async decideOnboarding(
    context: IdentityRequestContext,
    requestId: string,
    onboardingRequestId: string,
    decision: OnboardingDecision,
  ): Promise<OnboardingRequest> {
    const active = this.requireOrganizationAdmin(context);
    const storeDecision: Parameters<IdentityStore['decideOnboarding']>[1] = {
      action: decision.action,
      requestId: onboardingRequestId,
    };
    if (decision.adult_id) storeDecision.adultId = decision.adult_id;
    if (decision.family_id) storeDecision.familyId = decision.family_id;
    if (decision.reason) storeDecision.reason = decision.reason;
    if (decision.action === 'APPROVE_NEW') {
      storeDecision.familyName = `${
        (
          await this.store
            .listOnboarding(active.organizationId)
            .then((requests) => requests.find((candidate) => candidate.id === onboardingRequestId))
        )?.last_name ?? 'Camp'
      } Family`;
      storeDecision.newAdultId = randomUUID();
      storeDecision.newFamilyId = randomUUID();
    }
    return this.store.decideOnboarding(
      {
        actorId: context.session.account.id,
        organizationId: active.organizationId,
        requestId,
      },
      storeDecision,
    );
  }

  async listOnboardingMatches(
    context: IdentityRequestContext,
    onboardingRequestId: string,
  ): Promise<OnboardingMatchCandidate[]> {
    const active = this.requireOrganizationAdmin(context);
    const request = (await this.store.listOnboarding(active.organizationId)).find(
      (candidate) => candidate.id === onboardingRequestId,
    );
    if (!request) throw new IdentityNotFoundError('Onboarding request not found');
    return this.store.listUnclaimedAdultsByEmail(
      active.organizationId,
      normalizeEmail(request.email),
    );
  }

  async createFamilyInvitation(
    context: IdentityRequestContext,
    requestId: string,
    familyId: string,
    adultId: string,
  ): Promise<Invitation> {
    const active = this.requireActiveOrganization(context);
    const roles = active.roles;
    const admin = roles.includes('camp_admin') || roles.includes('organization_admin');
    const owner = await this.store.accountOwnsFamily(
      active.organizationId,
      familyId,
      context.session.account.id,
    );
    if (!admin && !owner)
      throw new IdentityAuthorizationError('Invitation access is not permitted');
    const recipientEmail = await this.store.getAdultInvitationEmail(
      active.organizationId,
      familyId,
      adultId,
    );
    if (!recipientEmail) throw new IdentityNotFoundError('Adult email is required');
    const token = secret();
    const invitation = await this.store.createInvitation(
      {
        actorId: context.session.account.id,
        organizationId: active.organizationId,
        requestId,
      },
      {
        adultId,
        email: recipientEmail,
        expiresAt: new Date(Date.now() + invitationLifetimeMs),
        familyId,
        id: randomUUID(),
        invitationType: 'FAMILY_ADULT',
        roles: [],
        tokenHash: hash(token),
      },
    );
    await this.sendInvitationEmail(
      active.organizationId,
      invitation,
      token,
      requestId,
      recipientEmail,
    );
    return invitation;
  }

  async createWorkforceInvitation(
    context: IdentityRequestContext,
    requestId: string,
    input: WorkforceInvitationCreate,
  ): Promise<Invitation> {
    const active = this.requireActiveOrganization(context);
    this.authorizeRoleGrant(active.roles, input.roles);
    const token = secret();
    const invitation = await this.store.createInvitation(
      {
        actorId: context.session.account.id,
        organizationId: active.organizationId,
        requestId,
      },
      {
        adultId: null,
        email: normalizeEmail(input.email),
        expiresAt: new Date(Date.now() + invitationLifetimeMs),
        familyId: null,
        id: randomUUID(),
        invitationType: 'WORKFORCE',
        roles: input.roles,
        tokenHash: hash(token),
      },
    );
    await this.provider.ensureUser(normalizeEmail(input.email));
    await this.sendInvitationEmail(
      active.organizationId,
      invitation,
      token,
      requestId,
      normalizeEmail(input.email),
    );
    return invitation;
  }

  async revokeInvitation(
    context: IdentityRequestContext,
    requestId: string,
    invitationId: string,
  ): Promise<void> {
    const active = this.requireActiveOrganization(context);
    const invitation = await this.store.getInvitationForManagement(
      active.organizationId,
      invitationId,
    );
    if (!invitation) throw new IdentityNotFoundError('Invitation not found');
    await this.authorizeInvitationManagement(context, active, invitation);
    await this.store.revokeInvitation(
      {
        actorId: context.session.account.id,
        organizationId: active.organizationId,
        requestId,
      },
      invitationId,
    );
  }

  async resendInvitation(
    context: IdentityRequestContext,
    requestId: string,
    invitationId: string,
  ): Promise<Invitation> {
    const active = this.requireActiveOrganization(context);
    const current = await this.store.getInvitationForManagement(
      active.organizationId,
      invitationId,
    );
    if (!current) throw new IdentityNotFoundError('Invitation not found');
    await this.authorizeInvitationManagement(context, active, current);
    const token = secret();
    const invitation = await this.store.createInvitation(
      {
        actorId: context.session.account.id,
        organizationId: active.organizationId,
        requestId,
      },
      {
        adultId: current.adult_id,
        auditAction: 'identity.invitation_resent',
        email: current.email,
        expiresAt: new Date(Date.now() + invitationLifetimeMs),
        familyId: current.family_id,
        id: randomUUID(),
        invitationType: current.invitation_type,
        roles: current.roles,
        tokenHash: hash(token),
      },
    );
    await this.sendInvitationEmail(
      active.organizationId,
      invitation,
      token,
      requestId,
      current.email,
    );
    return invitation;
  }

  async updateMembership(
    context: IdentityRequestContext,
    requestId: string,
    membershipId: string,
    input: MembershipUpdate,
  ) {
    const active = this.requireActiveOrganization(context);
    const memberships = await this.store.listMemberships(active.organizationId);
    const target = memberships.find((membership) => membership.id === membershipId);
    if (!target) throw new IdentityNotFoundError('Membership not found');
    if (target.account_id === context.session.account.id) {
      throw new IdentityAuthorizationError('You cannot change your own role or status');
    }
    this.authorizeRoleGrant(active.roles, input.roles);
    if (
      target.roles.includes('organization_admin') &&
      input.status === 'DISABLED' &&
      memberships.filter(
        (membership) =>
          membership.status === 'ACTIVE' && membership.roles.includes('organization_admin'),
      ).length <= 1
    ) {
      throw new IdentityConflictError('The last organization administrator cannot be disabled');
    }
    return this.store.updateMembership(
      {
        actorId: context.session.account.id,
        organizationId: active.organizationId,
        requestId,
      },
      membershipId,
      input,
    );
  }

  async updateAccountStatus(
    context: IdentityRequestContext,
    requestId: string,
    accountId: string,
    input: AccountStatusUpdate,
  ): Promise<void> {
    this.requireSystemAdmin(context);
    if (accountId === context.session.account.id) {
      throw new IdentityAuthorizationError('System administrators cannot suspend themselves');
    }
    const target = await this.store.findAccountById(accountId);
    if (!target) throw new IdentityNotFoundError('Account not found');
    if (input.status === 'SUSPENDED') {
      await this.provider.disableUser(target.primary_email);
      await this.provider.globalSignOut(target.primary_email);
    } else {
      await this.provider.enableUser(target.primary_email);
    }
    await this.store.setAccountStatus({
      accountId: target.id,
      actorId: context.session.account.id,
      reason: input.reason,
      requestId,
      status: input.status,
    });
  }

  async searchAccounts(context: IdentityRequestContext, email: string): Promise<AccountSummary[]> {
    this.requireSystemAdmin(context);
    return (await this.store.searchAccountsByEmail(normalizeEmail(email))).map((account) => ({
      email: account.primary_email,
      email_verified: account.email_verified,
      id: account.id,
      platform_role: account.platform_role,
      status: account.status,
    }));
  }

  async createOrganizationAdminInvitation(
    context: IdentityRequestContext,
    requestId: string,
    organizationId: string,
    email: string,
  ): Promise<Invitation> {
    this.requireSystemAdmin(context);
    const normalized = normalizeEmail(email);
    const token = secret();
    const invitation = await this.store.createInvitation(
      {
        actorId: context.session.account.id,
        organizationId,
        requestId,
      },
      {
        adultId: null,
        email: normalized,
        expiresAt: new Date(Date.now() + invitationLifetimeMs),
        familyId: null,
        id: randomUUID(),
        invitationType: 'WORKFORCE',
        roles: ['organization_admin'],
        tokenHash: hash(token),
      },
    );
    await this.provider.ensureUser(normalized);
    await this.sendInvitationEmail(organizationId, invitation, token, requestId, normalized);
    return invitation;
  }

  async recoverAccount(
    context: IdentityRequestContext,
    requestId: string,
    accountId: string,
    input: AccountRecovery,
  ): Promise<void> {
    this.requireSystemAdmin(context);
    if (accountId === context.session.account.id) {
      throw new IdentityAuthorizationError('System administrators cannot recover themselves');
    }
    const target = await this.store.findAccountById(accountId);
    if (!target) throw new IdentityNotFoundError('Account not found');
    if (input.reset_mfa) {
      await this.provider.resetMfa(target.primary_email);
    }
    if (input.email) {
      await this.provider.setEmail(target.primary_email, input.email);
      await this.store.updateAccountEmail(accountId, input.email, false);
    }
    await this.provider.globalSignOut(target.primary_email);
    await this.store.revokeAllSessions(accountId, input.reason);
    await this.store.recordIdentityAudit({
      action: 'identity.exceptional_recovery',
      actorAccountId: context.session.account.id,
      details: { email_changed: Boolean(input.email), mfa_reset: input.reset_mfa },
      outcome: 'SUCCESS',
      requestId,
      targetAccountId: accountId,
    });
  }

  private async completeSession(
    challengeToken: string,
    accountId: string,
    mfaVerified: boolean,
    requiresMfaSetup: boolean,
    method: 'EMAIL_OTP' | 'PASSWORD_TOTP',
    preferredOrganizationId: string | null,
    requestId: string,
  ): Promise<AuthCompletion> {
    const [access, account] = await Promise.all([
      this.store.listOrganizationAccess(accountId),
      this.store.findAccountById(accountId),
    ]);
    const privileged =
      account?.platform_role === 'system_admin' ||
      access.some((organization) => hasWorkforceRole(organization.roles));
    const idleMs = privileged ? workforceIdleMs : parentIdleMs;
    const absoluteMs = privileged ? workforceAbsoluteMs : parentAbsoluteMs;
    const cookieToken = secret();
    const sessionId = randomUUID();
    const activeOrganizationId =
      (preferredOrganizationId &&
      access.some((organization) => organization.organization_id === preferredOrganizationId)
        ? preferredOrganizationId
        : access[0]?.organization_id) ?? preferredOrganizationId;
    await this.store.createSession({
      absoluteExpiresAt: new Date(Date.now() + absoluteMs),
      accountId,
      activeOrganizationId,
      authenticationMethod: method,
      id: sessionId,
      idleExpiresAt: new Date(Date.now() + idleMs),
      mfaVerified,
      requiresMfaSetup: requiresMfaSetup || (privileged && !mfaVerified),
      tokenHash: hash(cookieToken),
    });
    const session = await this.store.resolveSession(hash(cookieToken));
    if (!session) throw new IdentityAuthenticationError('Session could not be created');
    await this.store.recordIdentityAudit({
      action: 'identity.login',
      actorAccountId: accountId,
      organizationId: activeOrganizationId,
      outcome: 'SUCCESS',
      requestId,
      targetAccountId: accountId,
    });
    return {
      challenge: {
        challenge_id: challengeToken,
        expires_at: new Date(session.absolute_expires_at).toISOString(),
        next_step: 'AUTHENTICATED',
      },
      cookieToken,
      session: mapSession(session),
    };
  }

  private requireAccount(context: IdentityRequestContext): AccountRecord {
    if (context.session.account.status !== 'ACTIVE') {
      throw new IdentityAuthorizationError('Account is disabled');
    }
    return context.session.account;
  }

  private requireActiveOrganization(context: IdentityRequestContext) {
    this.requireAccount(context);
    const active = context.session.organizations.find(
      (organization) => organization.organization_id === context.session.active_organization_id,
    );
    if (!active) throw new IdentityAuthorizationError('Organization access is required');
    if (hasWorkforceRole(active.roles) && !context.session.mfa_verified) {
      throw new IdentityAuthorizationError('Multi-factor authentication is required');
    }
    return {
      organizationId: active.organization_id,
      roles: active.roles,
    };
  }

  private requireOrganizationAdmin(context: IdentityRequestContext) {
    const active = this.requireActiveOrganization(context);
    if (!active.roles.some((role) => role === 'camp_admin' || role === 'organization_admin')) {
      throw new IdentityAuthorizationError('Administrator access is required');
    }
    return active;
  }

  private requireSystemAdmin(context: IdentityRequestContext): void {
    this.requireAccount(context);
    if (context.session.account.platform_role !== 'system_admin' || !context.session.mfa_verified) {
      throw new IdentityAuthorizationError('System administrator access is required');
    }
  }

  private authorizeRoleGrant(
    actorRoles: readonly string[],
    requestedRoles: readonly IdentityRole[],
  ): void {
    const organizationAdmin = actorRoles.includes('organization_admin');
    const campAdmin = actorRoles.includes('camp_admin');
    if (!organizationAdmin && !campAdmin) {
      throw new IdentityAuthorizationError('Role administration is not permitted');
    }
    if (!organizationAdmin && requestedRoles.includes('camp_admin')) {
      throw new IdentityAuthorizationError('Camp administrators cannot grant that role');
    }
    if (requestedRoles.includes('organization_admin')) {
      throw new IdentityAuthorizationError('Only system administrators manage organization admins');
    }
  }

  private async authorizeInvitationManagement(
    context: IdentityRequestContext,
    active: { organizationId: string; roles: readonly string[] },
    invitation: {
      family_id: string | null;
      invitation_type: 'FAMILY_ADULT' | 'WORKFORCE';
    },
  ): Promise<void> {
    const admin =
      active.roles.includes('camp_admin') || active.roles.includes('organization_admin');
    if (invitation.invitation_type === 'WORKFORCE') {
      if (!admin) throw new IdentityAuthorizationError('Invitation access is not permitted');
      return;
    }
    const owner =
      invitation.family_id &&
      (await this.store.accountOwnsFamily(
        active.organizationId,
        invitation.family_id,
        context.session.account.id,
      ));
    if (!admin && !owner) {
      throw new IdentityAuthorizationError('Invitation access is not permitted');
    }
  }

  private async sendInvitationEmail(
    organizationId: string,
    invitation: Invitation,
    token: string,
    requestId: string,
    recipientEmail: string,
  ): Promise<void> {
    const url = `${this.publicAppBaseUrl.replace(/\/$/, '')}/accept-invite#token=${encodeURIComponent(token)}`;
    const encryptedPayload = this.cipher.encrypt(
      JSON.stringify({
        body: `You were invited to Camp Registration.\n\nAccept the invitation: ${url}\n\nThis link expires ${new Date(invitation.expires_at).toLocaleString('en-US')}.`,
        subject: 'Your Camp Registration invitation',
      }),
    );
    await this.store.enqueueIdentityEmail({
      encryptedPayload,
      id: randomUUID(),
      idempotencyKey: `identity-invitation:${invitation.id}:${requestId}`,
      organizationId,
      recipientEmail,
    });
  }
}
