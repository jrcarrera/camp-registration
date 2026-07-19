import type { RequestIdentity } from '@camp-registration/auth';
import type {
  HouseholdOrder,
  HouseholdOrderCreate,
  OrderQuote,
  OrderQuoteCreate,
} from '@camp-registration/contracts';
import type { OrderStore } from '@camp-registration/database';

const staffRoles = new Set(['camp_staff', 'camp_admin', 'organization_admin']);
const parentRoles = new Set(['parent_guardian']);

export class OrderAuthorizationError extends Error {}

export interface OrderServiceApi {
  createOrder(
    familyId: string,
    input: HouseholdOrderCreate,
    requestId: string,
  ): Promise<HouseholdOrder>;
  getOrder(orderId: string): Promise<HouseholdOrder>;
  listFamilyOrders(familyId: string): Promise<HouseholdOrder[]>;
  listOrders(): Promise<HouseholdOrder[]>;
  quote(familyId: string, input: OrderQuoteCreate): Promise<OrderQuote>;
}

export class OrderService implements OrderServiceApi {
  private readonly membership;

  constructor(
    private readonly store: OrderStore,
    private readonly identity: RequestIdentity,
    private readonly organizationId: string,
  ) {
    this.membership = identity.memberships.find(
      (membership) => membership.organizationId === organizationId,
    );
  }

  private hasRole(roles: Set<string>): boolean {
    return Boolean(this.membership?.roles.some((role) => roles.has(role)));
  }

  private authorizeStaff(): void {
    if (!this.hasRole(staffRoles))
      throw new OrderAuthorizationError('Order access is not permitted');
  }

  private async authorizeFamily(familyId: string): Promise<void> {
    if (this.hasRole(staffRoles)) return;
    if (!this.hasRole(parentRoles))
      throw new OrderAuthorizationError('Order access is not permitted');
    const allowed = await this.store.adultIdentityCanRegisterFamily(
      this.organizationId,
      familyId,
      this.identity.subject,
    );
    if (!allowed) throw new OrderAuthorizationError('Order access is not permitted');
  }

  async quote(familyId: string, input: OrderQuoteCreate): Promise<OrderQuote> {
    await this.authorizeFamily(familyId);
    const quote = await this.store.quote(this.organizationId, familyId, input);
    return {
      currency: quote.currency,
      lines: quote.lines,
      totals: quote.totals,
      valid: quote.valid,
    };
  }

  async createOrder(
    familyId: string,
    input: HouseholdOrderCreate,
    requestId: string,
  ): Promise<HouseholdOrder> {
    await this.authorizeFamily(familyId);
    return this.store.createOrder(
      { actorId: this.identity.subject, organizationId: this.organizationId, requestId },
      familyId,
      input,
    );
  }

  async listFamilyOrders(familyId: string): Promise<HouseholdOrder[]> {
    await this.authorizeFamily(familyId);
    return this.store.listOrders(this.organizationId, familyId);
  }

  async listOrders(): Promise<HouseholdOrder[]> {
    this.authorizeStaff();
    return this.store.listOrders(this.organizationId);
  }

  async getOrder(orderId: string): Promise<HouseholdOrder> {
    const order = await this.store.getOrder(this.organizationId, orderId);
    await this.authorizeFamily(order.family_id);
    return order;
  }
}
