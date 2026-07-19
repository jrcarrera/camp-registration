import type { RequestIdentity } from '@camp-registration/auth';
import type {
  HousingAssignmentWrite,
  HousingAutoAssign,
  HousingBedWrite,
  HousingBuildingWrite,
  HousingInventory,
  SessionHousing,
  SessionHousingBuildingWrite,
} from '@camp-registration/contracts';
import type { HousingStore } from '@camp-registration/database';

const adminRoles = new Set(['camp_admin', 'organization_admin']);
const staffRoles = new Set(['camp_staff', 'camp_admin', 'organization_admin']);

export class HousingAuthorizationError extends Error {}

export interface HousingServiceApi {
  assign(
    sessionId: string,
    input: HousingAssignmentWrite,
    requestId: string,
  ): Promise<SessionHousing>;
  autoAssign(
    sessionId: string,
    input: HousingAutoAssign,
    requestId: string,
  ): Promise<SessionHousing>;
  configureSessionBuilding(
    sessionId: string,
    buildingId: string,
    input: SessionHousingBuildingWrite,
    requestId: string,
  ): Promise<SessionHousing>;
  createBed(
    buildingId: string,
    input: HousingBedWrite,
    requestId: string,
  ): Promise<HousingInventory['buildings'][number]['beds'][number]>;
  createBuilding(
    input: HousingBuildingWrite,
    requestId: string,
  ): Promise<HousingInventory['buildings'][number]>;
  getSession(sessionId: string): Promise<SessionHousing>;
  listInventory(): Promise<HousingInventory>;
  unassign(sessionId: string, assignmentId: string, requestId: string): Promise<SessionHousing>;
  updateBed(
    bedId: string,
    input: HousingBedWrite,
    requestId: string,
  ): Promise<HousingInventory['buildings'][number]['beds'][number]>;
  updateBuilding(
    buildingId: string,
    input: HousingBuildingWrite,
    requestId: string,
  ): Promise<HousingInventory['buildings'][number]>;
}

export class HousingService implements HousingServiceApi {
  private readonly membership;
  constructor(
    private readonly store: HousingStore,
    private readonly identity: RequestIdentity,
    private readonly organizationId: string,
  ) {
    this.membership = identity.memberships.find(
      (membership) => membership.organizationId === organizationId,
    );
  }
  private authorize(roles: Set<string>) {
    if (!this.membership?.roles.some((role) => roles.has(role)))
      throw new HousingAuthorizationError('Housing access is not permitted');
  }
  private context(requestId: string) {
    return { actorId: this.identity.subject, organizationId: this.organizationId, requestId };
  }
  async listInventory() {
    this.authorize(staffRoles);
    return this.store.listInventory(this.organizationId);
  }
  async createBuilding(input: HousingBuildingWrite, requestId: string) {
    this.authorize(adminRoles);
    return this.store.createBuilding(this.context(requestId), input);
  }
  async updateBuilding(id: string, input: HousingBuildingWrite, requestId: string) {
    this.authorize(adminRoles);
    return this.store.updateBuilding(this.context(requestId), id, input);
  }
  async createBed(id: string, input: HousingBedWrite, requestId: string) {
    this.authorize(adminRoles);
    return this.store.createBed(this.context(requestId), id, input);
  }
  async updateBed(id: string, input: HousingBedWrite, requestId: string) {
    this.authorize(adminRoles);
    return this.store.updateBed(this.context(requestId), id, input);
  }
  async getSession(sessionId: string) {
    this.authorize(staffRoles);
    return this.store.getSession(this.organizationId, sessionId);
  }
  async configureSessionBuilding(
    sessionId: string,
    buildingId: string,
    input: SessionHousingBuildingWrite,
    requestId: string,
  ) {
    this.authorize(adminRoles);
    return this.store.configureSessionBuilding(
      this.context(requestId),
      sessionId,
      buildingId,
      input,
    );
  }
  async assign(sessionId: string, input: HousingAssignmentWrite, requestId: string) {
    this.authorize(adminRoles);
    return this.store.assign(this.context(requestId), sessionId, input);
  }
  async unassign(sessionId: string, assignmentId: string, requestId: string) {
    this.authorize(adminRoles);
    return this.store.unassign(this.context(requestId), sessionId, assignmentId);
  }
  async autoAssign(sessionId: string, input: HousingAutoAssign, requestId: string) {
    this.authorize(adminRoles);
    return this.store.autoAssign(this.context(requestId), sessionId, input.strategy);
  }
}
