import type { PoolClient, QueryResult, QueryResultRow } from 'pg';

import type { DatabaseClient } from './client.js';

export type IdentityRole = 'camp_staff' | 'health_staff' | 'camp_admin' | 'organization_admin';

export interface PublicOrganizationRecord {
  id: string;
  name: string;
  self_service_signup_enabled: boolean;
  slug: string;
}

export interface OrganizationAccessRecord {
  name: string;
  organization_id: string;
  roles: Array<'parent_guardian' | IdentityRole>;
  slug: string;
}

export interface AccountRecord {
  email_normalized: string;
  email_verified: boolean;
  id: string;
  platform_role: 'system_admin' | null;
  primary_email: string;
  status: 'ACTIVE' | 'SUSPENDED';
}

export interface SessionRecord {
  absolute_expires_at: Date | string;
  account_id: string;
  active_organization_id: string | null;
  authentication_method: 'EMAIL_OTP' | 'PASSWORD_TOTP' | 'LOCAL';
  created_at: Date | string;
  id: string;
  idle_expires_at: Date | string;
  last_seen_at: Date | string;
  mfa_verified: boolean;
  requires_mfa_setup: boolean;
  revoked_at: Date | string | null;
}

export interface ResolvedSessionRecord extends SessionRecord {
  account: AccountRecord;
  organizations: OrganizationAccessRecord[];
}

export interface ChallengeRecord {
  attempt_count: number;
  completed_at: Date | string | null;
  email_normalized: string;
  expires_at: Date | string;
  id: string;
  intent: 'SIGN_IN' | 'JOIN_ORGANIZATION' | 'ACCEPT_INVITATION' | 'RECOVER_PASSWORD';
  invitation_token_hash: string | null;
  next_step:
    | 'EMAIL_OTP'
    | 'RECOVERY_CODE'
    | 'PASSWORD'
    | 'TOTP'
    | 'SET_PASSWORD'
    | 'ENROLL_TOTP'
    | 'AUTHENTICATED';
  organization_id: string | null;
  provider_state: string | null;
}

export interface OnboardingRecord {
  account_id: string;
  created_at: string;
  decision_reason: string | null;
  email: string;
  family_id: string | null;
  first_name: string;
  id: string;
  last_name: string;
  organization_id: string;
  phone: string | null;
  resolution: 'NEW_FAMILY' | 'MATCHED_ADULT' | null;
  status: 'PENDING' | 'APPROVED' | 'REJECTED';
  updated_at: string;
}

export interface InvitationRecord {
  adult_id: string | null;
  created_at: string;
  email_hint: string;
  expires_at: string;
  family_id: string | null;
  id: string;
  invitation_type: 'FAMILY_ADULT' | 'WORKFORCE';
  organization_id: string;
  roles: IdentityRole[];
  status: 'PENDING' | 'ACCEPTED' | 'REVOKED' | 'EXPIRED';
}

export interface InvitationManagementRecord {
  adult_id: string | null;
  email: string;
  expires_at: Date | string;
  family_id: string | null;
  id: string;
  invitation_type: 'FAMILY_ADULT' | 'WORKFORCE';
  roles: IdentityRole[];
  status: InvitationRecord['status'];
}

export interface MembershipRecord {
  account_id: string;
  email: string;
  id: string;
  organization_id: string;
  roles: IdentityRole[];
  status: 'ACTIVE' | 'DISABLED';
  version: number;
}

export interface IdentityWriteContext {
  actorId: string;
  organizationId: string;
  requestId: string;
}

export class IdentityConflictError extends Error {}
export class IdentityNotFoundError extends Error {}

function iso(value: Date | string): string {
  return value instanceof Date ? value.toISOString() : new Date(value).toISOString();
}

function emailHint(email: string): string {
  const [local = '', domain = ''] = email.split('@');
  return `${local.slice(0, 1)}***@${domain}`;
}

function mapOnboarding(
  row: Omit<OnboardingRecord, 'created_at' | 'updated_at'> & {
    created_at: Date | string;
    updated_at: Date | string;
  },
): OnboardingRecord {
  return {
    account_id: row.account_id,
    created_at: iso(row.created_at),
    decision_reason: row.decision_reason,
    email: row.email,
    family_id: row.family_id,
    first_name: row.first_name,
    id: row.id,
    last_name: row.last_name,
    organization_id: row.organization_id,
    phone: row.phone,
    resolution: row.resolution,
    status: row.status,
    updated_at: iso(row.updated_at),
  };
}

function mapInvitation(
  row: Omit<InvitationRecord, 'created_at' | 'email_hint' | 'expires_at'> & {
    created_at: Date | string;
    email: string;
    expires_at: Date | string;
  },
): InvitationRecord {
  const { email, ...rest } = row;
  return {
    ...rest,
    created_at: iso(row.created_at),
    email_hint: emailHint(email),
    expires_at: iso(row.expires_at),
  };
}

export class IdentityStore {
  constructor(private readonly database: DatabaseClient) {}

  private async withIdentity<T>(operation: (client: PoolClient) => Promise<T>): Promise<T> {
    const client = await this.database.pool.connect();
    try {
      await client.query('BEGIN');
      await client.query(`SELECT set_config('app.identity_service', 'true', true)`);
      const result = await operation(client);
      await client.query('COMMIT');
      return result;
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }

  private async identityQuery<Row extends QueryResultRow>(
    text: string,
    values?: unknown[],
  ): Promise<QueryResult<Row>> {
    return this.withIdentity((client) => client.query<Row>(text, values));
  }

  private async withTenant<T>(
    organizationId: string,
    operation: (client: PoolClient) => Promise<T>,
  ): Promise<T> {
    const client = await this.database.pool.connect();
    try {
      await client.query('BEGIN');
      await client.query(`SELECT set_config('app.organization_id', $1, true)`, [organizationId]);
      await client.query(`SELECT set_config('app.identity_service', 'true', true)`);
      const result = await operation(client);
      await client.query('COMMIT');
      return result;
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }

  async getPublicOrganization(slug: string): Promise<PublicOrganizationRecord | null> {
    const result = await this.identityQuery<PublicOrganizationRecord>(
      `SELECT id, name, slug, self_service_signup_enabled
       FROM get_public_organization($1)`,
      [slug],
    );
    return result.rows[0] ?? null;
  }

  async accountOwnsFamily(
    organizationId: string,
    familyId: string,
    accountId: string,
  ): Promise<boolean> {
    return this.withTenant(organizationId, async (client) => {
      const result = await client.query(
        `SELECT 1
         FROM adults
         WHERE organization_id = $1
           AND family_id = $2
           AND identity_subject = $3
           AND account_owner
           AND archived_at IS NULL
         LIMIT 1`,
        [organizationId, familyId, accountId],
      );
      return result.rowCount === 1;
    });
  }

  async getAdultInvitationEmail(
    organizationId: string,
    familyId: string,
    adultId: string,
  ): Promise<string | null> {
    return this.withTenant(organizationId, async (client) => {
      const result = await client.query<{ email: string | null }>(
        `SELECT email
         FROM adults
         WHERE organization_id = $1
           AND family_id = $2
           AND id = $3
           AND archived_at IS NULL`,
        [organizationId, familyId, adultId],
      );
      return result.rows[0]?.email ?? null;
    });
  }

  async findAccountByEmail(emailNormalized: string): Promise<AccountRecord | null> {
    const result = await this.identityQuery<AccountRecord>(
      `SELECT id, primary_email, email_normalized, email_verified, status, platform_role
       FROM user_accounts
       WHERE email_normalized = $1`,
      [emailNormalized],
    );
    return result.rows[0] ?? null;
  }

  async findAccountById(accountId: string): Promise<AccountRecord | null> {
    const result = await this.identityQuery<AccountRecord>(
      `SELECT id, primary_email, email_normalized, email_verified, status, platform_role
       FROM user_accounts
       WHERE id = $1`,
      [accountId],
    );
    return result.rows[0] ?? null;
  }

  async searchAccountsByEmail(emailNormalized: string): Promise<AccountRecord[]> {
    const result = await this.identityQuery<AccountRecord>(
      `SELECT id, primary_email, email_normalized, email_verified, status, platform_role
       FROM user_accounts
       WHERE email_normalized = $1
       ORDER BY id
       LIMIT 20`,
      [emailNormalized],
    );
    return result.rows;
  }

  async upsertProviderAccount(input: {
    accountId: string;
    email: string;
    emailNormalized: string;
    emailVerified: boolean;
    externalIdentityId: string;
    issuer: string;
    provider: string;
    providerSubject: string;
  }): Promise<AccountRecord> {
    const client = await this.database.pool.connect();
    try {
      await client.query('BEGIN');
      await client.query(`SELECT set_config('app.identity_service', 'true', true)`);
      await client.query(
        `INSERT INTO user_accounts (
           id, primary_email, email_normalized, email_verified
         ) VALUES ($1, $2, $3, $4)
         ON CONFLICT (id) DO UPDATE
         SET primary_email = EXCLUDED.primary_email,
             email_normalized = EXCLUDED.email_normalized,
             email_verified = EXCLUDED.email_verified,
             updated_at = transaction_timestamp()`,
        [input.accountId, input.email, input.emailNormalized, input.emailVerified],
      );
      await client.query(
        `INSERT INTO external_identities (
           id, account_id, provider, issuer, provider_subject, email_snapshot
         ) VALUES ($1, $2, $3, $4, $5, $6)
         ON CONFLICT (provider, issuer, provider_subject) DO UPDATE
         SET email_snapshot = EXCLUDED.email_snapshot,
             updated_at = transaction_timestamp()`,
        [
          input.externalIdentityId,
          input.accountId,
          input.provider,
          input.issuer,
          input.providerSubject,
          input.email,
        ],
      );
      const result = await client.query<AccountRecord>(
        `SELECT id, primary_email, email_normalized, email_verified, status, platform_role
         FROM user_accounts WHERE id = $1`,
        [input.accountId],
      );
      await client.query('COMMIT');
      return result.rows[0]!;
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }

  async createChallenge(input: {
    emailNormalized: string;
    expiresAt: Date;
    id: string;
    intent: ChallengeRecord['intent'];
    invitationTokenHash: string | null;
    nextStep: ChallengeRecord['next_step'];
    organizationId: string | null;
    providerState: string | null;
    tokenHash: string;
  }): Promise<void> {
    await this.identityQuery(
      `INSERT INTO auth_challenges (
         id, token_hash, email_normalized, organization_id, intent, next_step,
         provider_state, invitation_token_hash, expires_at
       ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
      [
        input.id,
        input.tokenHash,
        input.emailNormalized,
        input.organizationId,
        input.intent,
        input.nextStep,
        input.providerState,
        input.invitationTokenHash,
        input.expiresAt,
      ],
    );
  }

  async getChallenge(tokenHash: string): Promise<ChallengeRecord | null> {
    const result = await this.identityQuery<ChallengeRecord>(
      `SELECT id, email_normalized, organization_id, intent, next_step, provider_state,
              invitation_token_hash, attempt_count, expires_at, completed_at
       FROM auth_challenges
       WHERE token_hash = $1`,
      [tokenHash],
    );
    return result.rows[0] ?? null;
  }

  async advanceChallenge(
    id: string,
    nextStep: ChallengeRecord['next_step'],
    providerState: string | null,
    complete = false,
  ): Promise<void> {
    await this.identityQuery(
      `UPDATE auth_challenges
       SET next_step = $2,
           provider_state = $3,
           attempt_count = attempt_count + 1,
           completed_at = CASE WHEN $4 THEN transaction_timestamp() ELSE completed_at END
       WHERE id = $1`,
      [id, nextStep, providerState, complete],
    );
  }

  async createSession(input: {
    absoluteExpiresAt: Date;
    accountId: string;
    activeOrganizationId: string | null;
    authenticationMethod: SessionRecord['authentication_method'];
    id: string;
    idleExpiresAt: Date;
    mfaVerified: boolean;
    requiresMfaSetup: boolean;
    tokenHash: string;
  }): Promise<void> {
    await this.identityQuery(
      `INSERT INTO auth_sessions (
         id, token_hash, account_id, active_organization_id, authentication_method,
         mfa_verified, requires_mfa_setup, idle_expires_at, absolute_expires_at
       ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
      [
        input.id,
        input.tokenHash,
        input.accountId,
        input.activeOrganizationId,
        input.authenticationMethod,
        input.mfaVerified,
        input.requiresMfaSetup,
        input.idleExpiresAt,
        input.absoluteExpiresAt,
      ],
    );
  }

  async listOrganizationAccess(accountId: string): Promise<OrganizationAccessRecord[]> {
    const result = await this.identityQuery<OrganizationAccessRecord>(
      `SELECT organization_id, name, slug, roles
       FROM list_identity_organization_access($1)`,
      [accountId],
    );
    return result.rows;
  }

  async resolveSession(tokenHash: string): Promise<ResolvedSessionRecord | null> {
    const result = await this.identityQuery<
      SessionRecord & {
        email_normalized: string;
        email_verified: boolean;
        platform_role: 'system_admin' | null;
        primary_email: string;
        status: 'ACTIVE' | 'SUSPENDED';
      }
    >(
      `SELECT
         sessions.id, sessions.account_id, sessions.active_organization_id,
         sessions.authentication_method, sessions.mfa_verified,
         sessions.requires_mfa_setup, sessions.created_at, sessions.last_seen_at,
         sessions.idle_expires_at, sessions.absolute_expires_at, sessions.revoked_at,
         accounts.primary_email, accounts.email_normalized, accounts.email_verified,
         accounts.status, accounts.platform_role
       FROM auth_sessions sessions
       JOIN user_accounts accounts ON accounts.id = sessions.account_id
       WHERE sessions.token_hash = $1`,
      [tokenHash],
    );
    const row = result.rows[0];
    if (!row) return null;
    const now = Date.now();
    if (
      row.revoked_at ||
      row.status !== 'ACTIVE' ||
      new Date(row.idle_expires_at).valueOf() <= now ||
      new Date(row.absolute_expires_at).valueOf() <= now
    ) {
      return null;
    }
    const organizations = await this.listOrganizationAccess(row.account_id);
    return {
      absolute_expires_at: iso(row.absolute_expires_at),
      account: {
        email_normalized: row.email_normalized,
        email_verified: row.email_verified,
        id: row.account_id,
        platform_role: row.platform_role,
        primary_email: row.primary_email,
        status: row.status,
      },
      account_id: row.account_id,
      active_organization_id: row.active_organization_id,
      authentication_method: row.authentication_method,
      created_at: iso(row.created_at),
      id: row.id,
      idle_expires_at: iso(row.idle_expires_at),
      last_seen_at: iso(row.last_seen_at),
      mfa_verified: row.mfa_verified,
      organizations,
      requires_mfa_setup: row.requires_mfa_setup,
      revoked_at: row.revoked_at ? iso(row.revoked_at) : null,
    };
  }

  async touchSession(id: string, idleExpiresAt: Date): Promise<void> {
    await this.identityQuery(
      `UPDATE auth_sessions
       SET last_seen_at = transaction_timestamp(), idle_expires_at = $2
       WHERE id = $1
         AND last_seen_at < transaction_timestamp() - interval '5 minutes'
         AND revoked_at IS NULL`,
      [id, idleExpiresAt],
    );
  }

  async selectOrganization(
    sessionId: string,
    accountId: string,
    organizationId: string,
  ): Promise<void> {
    const access = await this.listOrganizationAccess(accountId);
    if (!access.some((organization) => organization.organization_id === organizationId)) {
      throw new IdentityNotFoundError('Organization access is not available');
    }
    await this.identityQuery(
      `UPDATE auth_sessions
       SET active_organization_id = $3
       WHERE id = $1 AND account_id = $2 AND revoked_at IS NULL`,
      [sessionId, accountId, organizationId],
    );
  }

  async listSessions(accountId: string): Promise<SessionRecord[]> {
    const result = await this.identityQuery<SessionRecord>(
      `SELECT id, account_id, active_organization_id, authentication_method, mfa_verified,
              requires_mfa_setup, created_at, last_seen_at, idle_expires_at,
              absolute_expires_at, revoked_at
       FROM auth_sessions
       WHERE account_id = $1
       ORDER BY created_at DESC`,
      [accountId],
    );
    return result.rows.map((row) => ({
      ...row,
      absolute_expires_at: iso(row.absolute_expires_at),
      created_at: iso(row.created_at),
      idle_expires_at: iso(row.idle_expires_at),
      last_seen_at: iso(row.last_seen_at),
      revoked_at: row.revoked_at ? iso(row.revoked_at) : null,
    }));
  }

  async revokeSession(accountId: string, sessionId: string, reason: string): Promise<void> {
    await this.identityQuery(
      `UPDATE auth_sessions
       SET revoked_at = COALESCE(revoked_at, transaction_timestamp()), revoked_reason = $3
       WHERE id = $1 AND account_id = $2`,
      [sessionId, accountId, reason],
    );
  }

  async revokeAllSessions(accountId: string, reason: string): Promise<void> {
    await this.identityQuery(
      `UPDATE auth_sessions
       SET revoked_at = COALESCE(revoked_at, transaction_timestamp()), revoked_reason = $2
       WHERE account_id = $1`,
      [accountId, reason],
    );
  }

  async revokeOtherSessions(
    accountId: string,
    currentSessionId: string,
    reason: string,
  ): Promise<void> {
    await this.identityQuery(
      `UPDATE auth_sessions
       SET revoked_at = COALESCE(revoked_at, transaction_timestamp()), revoked_reason = $3
       WHERE account_id = $1 AND id <> $2 AND revoked_at IS NULL`,
      [accountId, currentSessionId, reason],
    );
  }

  async getOnboardingForAccount(
    organizationId: string,
    accountId: string,
  ): Promise<OnboardingRecord | null> {
    return this.withTenant(organizationId, async (client) => {
      const result = await client.query<OnboardingRecord>(
        `SELECT request.*, accounts.primary_email AS email
         FROM family_onboarding_requests request
         JOIN user_accounts accounts ON accounts.id = request.account_id
         WHERE request.organization_id = $1 AND request.account_id = $2`,
        [organizationId, accountId],
      );
      return result.rows[0] ? mapOnboarding(result.rows[0]) : null;
    });
  }

  async createOnboarding(input: {
    accountId: string;
    firstName: string;
    id: string;
    lastName: string;
    organizationId: string;
    phone: string | null;
  }): Promise<OnboardingRecord> {
    return this.withTenant(input.organizationId, async (client) => {
      await client.query(
        `INSERT INTO family_onboarding_requests (
           id, organization_id, account_id, first_name, last_name, phone
         ) VALUES ($1, $2, $3, $4, $5, $6)
         ON CONFLICT (organization_id, account_id) DO NOTHING`,
        [
          input.id,
          input.organizationId,
          input.accountId,
          input.firstName,
          input.lastName,
          input.phone,
        ],
      );
      const result = await client.query<OnboardingRecord>(
        `SELECT request.*, accounts.primary_email AS email
         FROM family_onboarding_requests request
         JOIN user_accounts accounts ON accounts.id = request.account_id
         WHERE request.organization_id = $1 AND request.account_id = $2`,
        [input.organizationId, input.accountId],
      );
      return mapOnboarding(result.rows[0]!);
    });
  }

  async listOnboarding(organizationId: string): Promise<OnboardingRecord[]> {
    return this.withTenant(organizationId, async (client) => {
      const result = await client.query<OnboardingRecord>(
        `SELECT request.*, accounts.primary_email AS email
         FROM family_onboarding_requests request
         JOIN user_accounts accounts ON accounts.id = request.account_id
         WHERE request.organization_id = $1
         ORDER BY
           CASE request.status WHEN 'PENDING' THEN 0 WHEN 'REJECTED' THEN 1 ELSE 2 END,
           request.created_at,
           request.id`,
        [organizationId],
      );
      return result.rows.map(mapOnboarding);
    });
  }

  async listUnclaimedAdultsByEmail(
    organizationId: string,
    emailNormalized: string,
  ): Promise<
    Array<{ adult_id: string; adult_name: string; family_id: string; family_name: string }>
  > {
    return this.withTenant(organizationId, async (client) => {
      const result = await client.query<{
        adult_id: string;
        adult_name: string;
        family_id: string;
        family_name: string;
      }>(
        `SELECT
           adult.id AS adult_id,
           concat_ws(' ', adult.first_name, adult.last_name) AS adult_name,
           family.id AS family_id,
           family.family_name
         FROM adults adult
         JOIN families family
           ON family.organization_id = adult.organization_id
          AND family.id = adult.family_id
         WHERE adult.organization_id = $1
           AND adult.email_normalized = $2
           AND adult.identity_subject IS NULL
           AND adult.archived_at IS NULL
           AND family.archived_at IS NULL
         ORDER BY family.family_name, adult.last_name, adult.first_name, adult.id`,
        [organizationId, emailNormalized],
      );
      return result.rows;
    });
  }

  async decideOnboarding(
    context: IdentityWriteContext,
    input: {
      action: 'APPROVE_NEW' | 'APPROVE_MATCH' | 'REJECT' | 'REOPEN';
      adultId?: string;
      familyId?: string;
      familyName?: string;
      newAdultId?: string;
      newFamilyId?: string;
      reason?: string;
      requestId: string;
    },
  ): Promise<OnboardingRecord> {
    return this.withTenant(context.organizationId, async (client) => {
      const locked = await client.query<OnboardingRecord>(
        `SELECT request.*, accounts.primary_email AS email
         FROM family_onboarding_requests request
         JOIN user_accounts accounts ON accounts.id = request.account_id
         WHERE request.organization_id = $1 AND request.id = $2
         FOR UPDATE OF request`,
        [context.organizationId, input.requestId],
      );
      const request = locked.rows[0];
      if (!request) throw new IdentityNotFoundError('Onboarding request not found');

      let status: OnboardingRecord['status'] = request.status;
      let resolution: OnboardingRecord['resolution'] = request.resolution;
      let familyId = request.family_id;
      let adultId: string | null = null;

      if (input.action === 'REOPEN') {
        if (request.status !== 'REJECTED') {
          throw new IdentityConflictError('Only rejected requests can be reopened');
        }
        status = 'PENDING';
        resolution = null;
        familyId = null;
      } else if (input.action === 'REJECT') {
        if (request.status !== 'PENDING') throw new IdentityConflictError('Request is not pending');
        if (!input.reason?.trim())
          throw new IdentityConflictError('A rejection reason is required');
        status = 'REJECTED';
        resolution = null;
        familyId = null;
      } else if (input.action === 'APPROVE_NEW') {
        if (request.status !== 'PENDING') throw new IdentityConflictError('Request is not pending');
        if (!input.newFamilyId || !input.newAdultId || !input.familyName) {
          throw new IdentityConflictError('New family identifiers are required');
        }
        familyId = input.newFamilyId;
        adultId = input.newAdultId;
        await client.query(
          `INSERT INTO families (id, organization_id, family_name)
           VALUES ($1, $2, $3)`,
          [familyId, context.organizationId, input.familyName],
        );
        await client.query(
          `INSERT INTO adults (
             id, organization_id, family_id, identity_subject, first_name, last_name,
             birth_date, email, email_normalized, phone, account_owner, can_manage_family,
             can_register, can_make_payments, emergency_contact, authorized_pickup,
             receives_operational_communication
           ) VALUES (
             $1, $2, $3, $4, $5, $6, NULL, $7, lower($7), $8,
             true, true, true, true, false, false, true
           )`,
          [
            adultId,
            context.organizationId,
            familyId,
            request.account_id,
            request.first_name,
            request.last_name,
            request.email,
            request.phone,
          ],
        );
        status = 'APPROVED';
        resolution = 'NEW_FAMILY';
      } else {
        if (request.status !== 'PENDING') throw new IdentityConflictError('Request is not pending');
        if (!input.familyId || !input.adultId) {
          throw new IdentityConflictError('A matching family and adult are required');
        }
        const candidate = await client.query<{
          email_normalized: string | null;
          identity_subject: string | null;
        }>(
          `SELECT email_normalized, identity_subject
           FROM adults
           WHERE organization_id = $1 AND family_id = $2 AND id = $3 AND archived_at IS NULL
           FOR UPDATE`,
          [context.organizationId, input.familyId, input.adultId],
        );
        const adult = candidate.rows[0];
        if (
          !adult ||
          adult.identity_subject ||
          adult.email_normalized !== request.email.toLowerCase()
        ) {
          throw new IdentityConflictError('The adult is not eligible for matching');
        }
        await client.query(
          `UPDATE adults
           SET identity_subject = $4, version = version + 1, updated_at = transaction_timestamp()
           WHERE organization_id = $1 AND family_id = $2 AND id = $3`,
          [context.organizationId, input.familyId, input.adultId, request.account_id],
        );
        familyId = input.familyId;
        adultId = input.adultId;
        status = 'APPROVED';
        resolution = 'MATCHED_ADULT';
      }

      await client.query(
        `UPDATE family_onboarding_requests
         SET status = $3,
             resolution = $4,
             family_id = $5,
             adult_id = $6,
             decision_reason = $7,
             resolved_by = CASE WHEN $3 = 'PENDING' THEN NULL ELSE $8 END,
             resolved_at = CASE WHEN $3 = 'PENDING' THEN NULL ELSE transaction_timestamp() END,
             updated_at = transaction_timestamp()
         WHERE organization_id = $1 AND id = $2`,
        [
          context.organizationId,
          input.requestId,
          status,
          resolution,
          familyId,
          adultId,
          input.reason?.trim() ?? null,
          context.actorId,
        ],
      );
      await this.insertTenantAudit(
        client,
        context,
        `onboarding.${input.action.toLowerCase()}`,
        'family_onboarding_request',
        input.requestId,
        {
          resolution,
        },
      );
      const updated = await client.query<OnboardingRecord>(
        `SELECT request.*, accounts.primary_email AS email
         FROM family_onboarding_requests request
         JOIN user_accounts accounts ON accounts.id = request.account_id
         WHERE request.organization_id = $1 AND request.id = $2`,
        [context.organizationId, input.requestId],
      );
      return mapOnboarding(updated.rows[0]!);
    });
  }

  async createInvitation(
    context: IdentityWriteContext,
    input: {
      adultId: string | null;
      email: string;
      expiresAt: Date;
      familyId: string | null;
      id: string;
      invitationType: 'FAMILY_ADULT' | 'WORKFORCE';
      roles: IdentityRole[];
      tokenHash: string;
      auditAction?: 'identity.invitation_created' | 'identity.invitation_resent';
    },
  ): Promise<InvitationRecord> {
    return this.withTenant(context.organizationId, async (client) => {
      if (input.invitationType === 'FAMILY_ADULT') {
        const result = await client.query<{
          email: string | null;
          identity_subject: string | null;
        }>(
          `SELECT email, identity_subject
           FROM adults
           WHERE organization_id = $1 AND family_id = $2 AND id = $3 AND archived_at IS NULL
           FOR UPDATE`,
          [context.organizationId, input.familyId, input.adultId],
        );
        const adult = result.rows[0];
        if (!adult?.email) throw new IdentityNotFoundError('Adult email is required');
        if (adult.identity_subject)
          throw new IdentityConflictError('Adult already has account access');
        input.email = adult.email;
      }
      await client.query(
        `UPDATE identity_invitations
         SET status = 'REVOKED', revoked_at = transaction_timestamp(),
             updated_at = transaction_timestamp()
         WHERE organization_id = $1
           AND status = 'PENDING'
           AND (
             ($2 = 'FAMILY_ADULT' AND adult_id = $3)
             OR ($2 = 'WORKFORCE' AND invitation_type = 'WORKFORCE' AND email_normalized = lower($4))
           )`,
        [context.organizationId, input.invitationType, input.adultId, input.email],
      );
      const created = await client.query<
        Omit<InvitationRecord, 'created_at' | 'email_hint' | 'expires_at'> & {
          created_at: Date | string;
          email: string;
          expires_at: Date | string;
        }
      >(
        `INSERT INTO identity_invitations (
           id, organization_id, invitation_type, family_id, adult_id, email,
           email_normalized, roles, token_hash, invited_by, expires_at
         ) VALUES ($1, $2, $3, $4, $5, $6, lower($6), $7, $8, $9, $10)
         RETURNING id, organization_id, invitation_type, family_id, adult_id,
                   email, roles, status, expires_at, created_at`,
        [
          input.id,
          context.organizationId,
          input.invitationType,
          input.familyId,
          input.adultId,
          input.email,
          input.roles,
          input.tokenHash,
          context.actorId,
          input.expiresAt,
        ],
      );
      await this.insertTenantAudit(
        client,
        context,
        input.auditAction ?? 'identity.invitation_created',
        'identity_invitation',
        input.id,
        {
          invitation_type: input.invitationType,
        },
      );
      return mapInvitation(created.rows[0]!);
    });
  }

  async enqueueIdentityEmail(input: {
    encryptedPayload: string;
    id: string;
    idempotencyKey: string;
    organizationId: string;
    recipientEmail: string;
  }): Promise<void> {
    await this.withTenant(input.organizationId, async (client) => {
      await client.query(
        `INSERT INTO notification_outbox (
           id, organization_id, family_id, session_id, registration_id,
           waitlist_offer_id, notification_type, recipient_email,
           template_data, idempotency_key
         ) VALUES (
           $1, $2, NULL, NULL, NULL, NULL, 'IDENTITY_MESSAGE', $3,
           $4::jsonb, $5
         )
         ON CONFLICT (organization_id, idempotency_key) DO NOTHING`,
        [
          input.id,
          input.organizationId,
          input.recipientEmail,
          JSON.stringify({ encrypted_payload: input.encryptedPayload }),
          input.idempotencyKey,
        ],
      );
    });
  }

  async listInvitations(organizationId: string): Promise<InvitationRecord[]> {
    return this.withTenant(organizationId, async (client) => {
      await client.query(
        `UPDATE identity_invitations
         SET status = 'EXPIRED', updated_at = transaction_timestamp()
         WHERE organization_id = $1 AND status = 'PENDING' AND expires_at <= transaction_timestamp()`,
        [organizationId],
      );
      const result = await client.query<
        Omit<InvitationRecord, 'created_at' | 'email_hint' | 'expires_at'> & {
          created_at: Date | string;
          email: string;
          expires_at: Date | string;
        }
      >(
        `SELECT id, organization_id, invitation_type, family_id, adult_id,
                email, roles, status, expires_at, created_at
         FROM identity_invitations
         WHERE organization_id = $1
         ORDER BY created_at DESC`,
        [organizationId],
      );
      return result.rows.map(mapInvitation);
    });
  }

  async getInvitationForManagement(
    organizationId: string,
    invitationId: string,
  ): Promise<InvitationManagementRecord | null> {
    return this.withTenant(organizationId, async (client) => {
      const result = await client.query<InvitationManagementRecord>(
        `SELECT id, invitation_type, family_id, adult_id, email, roles, status, expires_at
         FROM identity_invitations
         WHERE organization_id = $1 AND id = $2`,
        [organizationId, invitationId],
      );
      return result.rows[0] ?? null;
    });
  }

  async inspectInvitation(tokenHash: string): Promise<{
    emailNormalized: string;
    invitationType: 'FAMILY_ADULT' | 'WORKFORCE';
    organizationId: string;
  } | null> {
    const result = await this.identityQuery<{
      email_normalized: string;
      invitation_type: 'FAMILY_ADULT' | 'WORKFORCE';
      organization_id: string;
    }>(
      `SELECT email_normalized, invitation_type, organization_id
       FROM identity_invitations
       WHERE token_hash = $1 AND status = 'PENDING' AND expires_at > transaction_timestamp()`,
      [tokenHash],
    );
    const row = result.rows[0];
    return row
      ? {
          emailNormalized: row.email_normalized,
          invitationType: row.invitation_type,
          organizationId: row.organization_id,
        }
      : null;
  }

  async acceptInvitation(
    account: AccountRecord,
    tokenHash: string,
    requestId: string,
  ): Promise<string> {
    const inspected = await this.inspectInvitation(tokenHash);
    if (!inspected) throw new IdentityNotFoundError('Invitation is not available');
    if (inspected.emailNormalized !== account.email_normalized || !account.email_verified) {
      throw new IdentityNotFoundError('Invitation is not available');
    }
    return this.withTenant(inspected.organizationId, async (client) => {
      const result = await client.query<{
        adult_id: string | null;
        family_id: string | null;
        id: string;
        invitation_type: 'FAMILY_ADULT' | 'WORKFORCE';
        roles: IdentityRole[];
        status: InvitationRecord['status'];
      }>(
        `SELECT id, invitation_type, family_id, adult_id, roles, status
         FROM identity_invitations
         WHERE organization_id = $1 AND token_hash = $2
         FOR UPDATE`,
        [inspected.organizationId, tokenHash],
      );
      const invitation = result.rows[0];
      if (!invitation || invitation.status !== 'PENDING') {
        throw new IdentityNotFoundError('Invitation is not available');
      }
      if (invitation.invitation_type === 'FAMILY_ADULT') {
        const current = await client.query<{ identity_subject: string | null }>(
          `SELECT identity_subject FROM adults
           WHERE organization_id = $1 AND family_id = $2 AND id = $3
           FOR UPDATE`,
          [inspected.organizationId, invitation.family_id, invitation.adult_id],
        );
        const identitySubject = current.rows[0]?.identity_subject;
        if (identitySubject && identitySubject !== account.id) {
          throw new IdentityConflictError('Adult is already linked to another account');
        }
        await client.query(
          `UPDATE adults
           SET identity_subject = $4, version = version + 1, updated_at = transaction_timestamp()
           WHERE organization_id = $1 AND family_id = $2 AND id = $3`,
          [inspected.organizationId, invitation.family_id, invitation.adult_id, account.id],
        );
      } else {
        await client.query(
          `INSERT INTO organization_memberships (
             id, organization_id, account_id, roles
           ) VALUES (gen_random_uuid(), $1, $2, $3)
           ON CONFLICT (organization_id, account_id) DO UPDATE
           SET roles = EXCLUDED.roles,
               status = 'ACTIVE',
               version = organization_memberships.version + 1,
               updated_at = transaction_timestamp()`,
          [inspected.organizationId, account.id, invitation.roles],
        );
      }
      await client.query(
        `UPDATE identity_invitations
         SET status = 'ACCEPTED', accepted_by = $3,
             accepted_at = transaction_timestamp(), updated_at = transaction_timestamp()
         WHERE organization_id = $1 AND id = $2`,
        [inspected.organizationId, invitation.id, account.id],
      );
      await this.insertTenantAudit(
        client,
        {
          actorId: account.id,
          organizationId: inspected.organizationId,
          requestId,
        },
        'identity.invitation_accepted',
        'identity_invitation',
        invitation.id,
        { invitation_type: invitation.invitation_type },
      );
      return inspected.organizationId;
    });
  }

  async revokeInvitation(context: IdentityWriteContext, invitationId: string): Promise<void> {
    await this.withTenant(context.organizationId, async (client) => {
      const result = await client.query(
        `UPDATE identity_invitations
         SET status = 'REVOKED', revoked_at = transaction_timestamp(),
             updated_at = transaction_timestamp()
         WHERE organization_id = $1 AND id = $2 AND status = 'PENDING'`,
        [context.organizationId, invitationId],
      );
      if (result.rowCount === 0) throw new IdentityNotFoundError('Invitation not found');
      await this.insertTenantAudit(
        client,
        context,
        'identity.invitation_revoked',
        'identity_invitation',
        invitationId,
        {},
      );
    });
  }

  async listMemberships(organizationId: string): Promise<MembershipRecord[]> {
    return this.withTenant(organizationId, async (client) => {
      const result = await client.query<MembershipRecord>(
        `SELECT membership.id, membership.organization_id, membership.account_id,
                membership.roles, membership.status, membership.version,
                account.primary_email AS email
         FROM organization_memberships membership
         JOIN user_accounts account ON account.id = membership.account_id
         WHERE membership.organization_id = $1
         ORDER BY lower(account.primary_email), membership.id`,
        [organizationId],
      );
      return result.rows;
    });
  }

  async updateMembership(
    context: IdentityWriteContext,
    membershipId: string,
    input: {
      reason: string;
      roles: IdentityRole[];
      status: 'ACTIVE' | 'DISABLED';
      version: number;
    },
  ): Promise<MembershipRecord> {
    return this.withTenant(context.organizationId, async (client) => {
      const current = await client.query<MembershipRecord>(
        `SELECT membership.id, membership.organization_id, membership.account_id,
                membership.roles, membership.status, membership.version,
                account.primary_email AS email
         FROM organization_memberships membership
         JOIN user_accounts account ON account.id = membership.account_id
         WHERE membership.organization_id = $1 AND membership.id = $2
         FOR UPDATE OF membership`,
        [context.organizationId, membershipId],
      );
      const membership = current.rows[0];
      if (!membership) throw new IdentityNotFoundError('Membership not found');
      if (membership.version !== input.version) {
        throw new IdentityConflictError('Membership changed; reload and try again');
      }
      const updated = await client.query<MembershipRecord>(
        `UPDATE organization_memberships
         SET roles = $3, status = $4, version = version + 1,
             updated_at = transaction_timestamp()
         WHERE organization_id = $1 AND id = $2
         RETURNING id, organization_id, account_id, roles, status, version,
           (SELECT primary_email FROM user_accounts WHERE id = account_id) AS email`,
        [context.organizationId, membershipId, input.roles, input.status],
      );
      await this.insertTenantAudit(
        client,
        context,
        'identity.membership_updated',
        'organization_membership',
        membershipId,
        {
          reason: input.reason,
          roles: input.roles,
          status: input.status,
        },
      );
      return updated.rows[0]!;
    });
  }

  async setAccountStatus(input: {
    accountId: string;
    actorId: string;
    reason: string;
    requestId: string;
    status: 'ACTIVE' | 'SUSPENDED';
  }): Promise<void> {
    const client = await this.database.pool.connect();
    try {
      await client.query('BEGIN');
      await client.query(`SELECT set_config('app.identity_service', 'true', true)`);
      const result = await client.query(
        `UPDATE user_accounts
         SET status = $2, updated_at = transaction_timestamp()
         WHERE id = $1`,
        [input.accountId, input.status],
      );
      if (result.rowCount === 0) throw new IdentityNotFoundError('Account not found');
      if (input.status === 'SUSPENDED') {
        await client.query(
          `UPDATE auth_sessions
           SET revoked_at = COALESCE(revoked_at, transaction_timestamp()),
               revoked_reason = $2
           WHERE account_id = $1`,
          [input.accountId, input.reason],
        );
      }
      await client.query(
        `INSERT INTO identity_audit_events (
           actor_account_id, action, target_account_id, outcome, request_id, details
         ) VALUES ($1, $2, $3, 'SUCCESS', $4, $5::jsonb)`,
        [
          input.actorId,
          `identity.account_${input.status.toLowerCase()}`,
          input.accountId,
          input.requestId,
          JSON.stringify({ reason: input.reason }),
        ],
      );
      await client.query('COMMIT');
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }

  async updateAccountEmail(accountId: string, email: string, verified: boolean): Promise<void> {
    await this.identityQuery(
      `UPDATE user_accounts
       SET primary_email = $2, email_normalized = lower($2), email_verified = $3,
           updated_at = transaction_timestamp()
       WHERE id = $1`,
      [accountId, email, verified],
    );
  }

  async recordIdentityAudit(input: {
    action: string;
    actorAccountId?: string | null;
    details?: Record<string, unknown>;
    organizationId?: string | null;
    outcome: 'SUCCESS' | 'DENIED' | 'FAILED';
    requestId: string;
    targetAccountId?: string | null;
  }): Promise<void> {
    await this.identityQuery(
      `INSERT INTO identity_audit_events (
         organization_id, actor_account_id, action, target_account_id,
         outcome, request_id, details
       ) VALUES ($1, $2, $3, $4, $5, $6, $7::jsonb)`,
      [
        input.organizationId ?? null,
        input.actorAccountId ?? null,
        input.action,
        input.targetAccountId ?? null,
        input.outcome,
        input.requestId,
        JSON.stringify(input.details ?? {}),
      ],
    );
  }

  async bootstrapSystemAdmin(input: {
    accountId: string;
    email: string;
    externalIdentityId: string;
    issuer: string;
    provider: string;
    providerSubject: string;
  }): Promise<void> {
    const existing = await this.identityQuery(
      `SELECT 1 FROM user_accounts WHERE platform_role = 'system_admin' LIMIT 1`,
    );
    if (existing.rowCount) throw new IdentityConflictError('A system admin already exists');
    await this.upsertProviderAccount({
      accountId: input.accountId,
      email: input.email,
      emailNormalized: input.email.toLowerCase(),
      emailVerified: true,
      externalIdentityId: input.externalIdentityId,
      issuer: input.issuer,
      provider: input.provider,
      providerSubject: input.providerSubject,
    });
    await this.identityQuery(
      `UPDATE user_accounts SET platform_role = 'system_admin' WHERE id = $1`,
      [input.accountId],
    );
    await this.recordIdentityAudit({
      action: 'identity.system_admin_bootstrapped',
      actorAccountId: input.accountId,
      outcome: 'SUCCESS',
      requestId: 'operator-bootstrap',
      targetAccountId: input.accountId,
    });
  }

  private async insertTenantAudit(
    client: PoolClient,
    context: IdentityWriteContext,
    action: string,
    targetType: string,
    targetId: string,
    details: Record<string, unknown>,
  ): Promise<void> {
    await client.query(
      `INSERT INTO audit_events (
         organization_id, actor_id, action, target_type, target_id,
         outcome, request_id, details
       ) VALUES ($1, $2, $3, $4, $5, 'SUCCESS', $6, $7::jsonb)`,
      [
        context.organizationId,
        context.actorId,
        action,
        targetType,
        targetId,
        context.requestId,
        JSON.stringify(details),
      ],
    );
  }
}
