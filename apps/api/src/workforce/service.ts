import { randomUUID } from 'node:crypto';

import type { RequestIdentity } from '@camp-registration/auth';
import type {
  SessionWorkforceRoster,
  WorkforceAssignmentCreate,
  WorkforceAssignmentUpdate,
  WorkforceListQuery,
  WorkforceListResponse,
  WorkforceProfileCreate,
  WorkforceProfileDetail,
  WorkforceProfileUpdate,
} from '@camp-registration/contracts';
import { WorkforceNotFoundError, type WorkforceStore } from '@camp-registration/database';

const adminRoles = new Set(['camp_admin', 'organization_admin']);
const rosterRoles = new Set(['camp_staff', 'camp_admin', 'organization_admin']);

export class WorkforceAuthorizationError extends Error {}
export class WorkforceInputError extends Error {}

export interface WorkforceServiceApi {
  createProfile(input: WorkforceProfileCreate, requestId: string): Promise<WorkforceProfileDetail>;
  createAssignment(
    profileId: string,
    input: WorkforceAssignmentCreate,
    requestId: string,
  ): Promise<WorkforceProfileDetail>;
  getProfile(profileId: string, requestId: string): Promise<WorkforceProfileDetail>;
  getSessionRoster(sessionId: string, requestId: string): Promise<SessionWorkforceRoster>;
  linkAccount(
    profileId: string,
    version: number,
    requestId: string,
  ): Promise<WorkforceProfileDetail>;
  listProfiles(query: WorkforceListQuery, requestId: string): Promise<WorkforceListResponse>;
  updateAssignment(
    profileId: string,
    assignmentId: string,
    input: WorkforceAssignmentUpdate,
    requestId: string,
  ): Promise<WorkforceProfileDetail>;
  updateProfile(
    profileId: string,
    input: WorkforceProfileUpdate,
    requestId: string,
  ): Promise<WorkforceProfileDetail>;
}

function clean(value: string | null | undefined, label: string, maximum: number): string | null {
  if (value === null || value === undefined) return null;
  const normalized = value.trim();
  if (!normalized || normalized.length > maximum)
    throw new WorkforceInputError(`${label} is required`);
  return normalized;
}

export class WorkforceService implements WorkforceServiceApi {
  private readonly membership;
  constructor(
    private readonly store: WorkforceStore,
    private readonly identity: RequestIdentity,
    private readonly organizationId: string,
  ) {
    this.membership = identity.memberships.find(
      (membership) => membership.organizationId === organizationId,
    );
  }
  private context(requestId: string) {
    return { actorId: this.identity.subject, organizationId: this.organizationId, requestId };
  }
  private async authorizeAdmin(action: string, targetId: string, requestId: string): Promise<void> {
    if (this.identity.mfaVerified && this.membership?.roles.some((role) => adminRoles.has(role)))
      return;
    await this.store.recordAudit(this.context(requestId), action, targetId, 'denied', {
      mfa_verified: this.identity.mfaVerified,
    });
    throw new WorkforceAuthorizationError(
      'Workforce administration requires camp or organization administrator access with MFA',
    );
  }
  private async authorizeRoster(sessionId: string, requestId: string): Promise<void> {
    if (this.membership?.roles.some((role) => rosterRoles.has(role))) return;
    await this.store.recordAudit(
      this.context(requestId),
      'workforce.roster_viewed',
      sessionId,
      'denied',
    );
    throw new WorkforceAuthorizationError(
      'Session workforce rosters require camp staff or administrator access',
    );
  }
  private async detail(profileId: string): Promise<WorkforceProfileDetail> {
    const value = await this.store.get(this.organizationId, profileId);
    if (!value) throw new WorkforceNotFoundError('Workforce profile not found');
    return value;
  }
  async listProfiles(query: WorkforceListQuery, requestId: string): Promise<WorkforceListResponse> {
    await this.authorizeAdmin('workforce.listed', this.organizationId, requestId);
    const page = query.page ?? 1,
      pageSize = query.page_size ?? 50;
    const result = await this.store.list(this.organizationId, {
      page,
      pageSize,
      ...(query.search ? { search: query.search } : {}),
      ...(query.season_id ? { seasonId: query.season_id } : {}),
      ...(query.session_id ? { sessionId: query.session_id } : {}),
      ...(query.status ? { status: query.status } : {}),
      ...(query.workforce_type ? { workforceType: query.workforce_type } : {}),
    });
    await this.store.recordAudit(
      this.context(requestId),
      'workforce.listed',
      this.organizationId,
      'success',
      {
        filter_present: Boolean(
          query.search ||
          query.season_id ||
          query.session_id ||
          query.status ||
          query.workforce_type,
        ),
        result_count: result.profiles.length,
      },
    );
    return {
      page,
      page_size: pageSize,
      profiles: result.profiles.map((profile) => ({
        assignment_count: profile.assignment_count,
        current_session_names: profile.current_session_names,
        display_name: profile.display_name,
        first_name: profile.first_name,
        id: profile.id,
        last_name: profile.last_name,
        next_session_names: profile.next_session_names,
        preferred_name: profile.preferred_name,
        status: profile.status,
        version: profile.version,
        workforce_type: profile.workforce_type,
      })),
      total: result.total,
    };
  }
  async getProfile(profileId: string, requestId: string): Promise<WorkforceProfileDetail> {
    await this.authorizeAdmin('workforce.read', profileId, requestId);
    const profile = await this.detail(profileId);
    await this.store.recordAudit(this.context(requestId), 'workforce.read', profileId, 'success');
    return profile;
  }
  async createProfile(
    input: WorkforceProfileCreate,
    requestId: string,
  ): Promise<WorkforceProfileDetail> {
    await this.authorizeAdmin('workforce.created', this.organizationId, requestId);
    const id = randomUUID();
    await this.store.create(this.context(requestId), {
      id,
      first_name: clean(input.first_name, 'First name', 100)!,
      last_name: clean(input.last_name, 'Last name', 100)!,
      preferred_name: clean(input.preferred_name, 'Preferred name', 100),
      email: clean(input.email, 'Email', 320)!.toLowerCase(),
      phone: clean(input.phone, 'Phone', 50),
      status: input.status,
      workforce_type: input.workforce_type,
    });
    return this.detail(id);
  }
  async updateProfile(
    profileId: string,
    input: WorkforceProfileUpdate,
    requestId: string,
  ): Promise<WorkforceProfileDetail> {
    await this.authorizeAdmin('workforce.updated', profileId, requestId);
    await this.store.update(this.context(requestId), profileId, input.version, {
      first_name: clean(input.first_name, 'First name', 100)!,
      last_name: clean(input.last_name, 'Last name', 100)!,
      preferred_name: clean(input.preferred_name, 'Preferred name', 100),
      email: clean(input.email, 'Email', 320)!.toLowerCase(),
      phone: clean(input.phone, 'Phone', 50),
      status: input.status,
      workforce_type: input.workforce_type,
    });
    return this.detail(profileId);
  }
  async linkAccount(
    profileId: string,
    version: number,
    requestId: string,
  ): Promise<WorkforceProfileDetail> {
    await this.authorizeAdmin('workforce.account_linked', profileId, requestId);
    await this.store.linkAccount(this.context(requestId), profileId, version);
    return this.detail(profileId);
  }
  async createAssignment(
    profileId: string,
    input: WorkforceAssignmentCreate,
    requestId: string,
  ): Promise<WorkforceProfileDetail> {
    await this.authorizeAdmin('workforce.assignment_created', profileId, requestId);
    await this.store.createAssignment(this.context(requestId), profileId, {
      ...input,
      id: randomUUID(),
      position_name: clean(input.position_name, 'Position', 100)!,
    });
    return this.detail(profileId);
  }
  async updateAssignment(
    profileId: string,
    assignmentId: string,
    input: WorkforceAssignmentUpdate,
    requestId: string,
  ): Promise<WorkforceProfileDetail> {
    await this.authorizeAdmin('workforce.assignment_updated', assignmentId, requestId);
    await this.store.updateAssignment(
      this.context(requestId),
      profileId,
      assignmentId,
      input.version,
      { ...input, position_name: clean(input.position_name, 'Position', 100)! },
    );
    return this.detail(profileId);
  }
  async getSessionRoster(sessionId: string, requestId: string): Promise<SessionWorkforceRoster> {
    await this.authorizeRoster(sessionId, requestId);
    const roster = await this.store.roster(this.organizationId, sessionId);
    if (!roster) throw new WorkforceNotFoundError('Session not found');
    await this.store.recordAudit(
      this.context(requestId),
      'workforce.roster_viewed',
      sessionId,
      'success',
      { result_count: roster.assignments.length },
    );
    return roster;
  }
}
