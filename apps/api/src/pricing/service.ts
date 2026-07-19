import type { RequestIdentity } from '@camp-registration/auth';
import type {
  Coupon,
  CouponWrite,
  DiscountRule,
  DiscountRuleWrite,
  FinancialAssistanceApplication,
  FinancialAssistanceCreate,
  FinancialAssistanceReview,
  FinancialAssistanceUpdate,
  PaymentPlanTemplate,
  PaymentPlanTemplateWrite,
  PricingConfiguration,
  SessionAddOn,
  SessionAddOnWrite,
} from '@camp-registration/contracts';
import type { OrderStore, PricingStore } from '@camp-registration/database';

const adminRoles = new Set(['camp_admin', 'organization_admin']);
const staffRoles = new Set(['camp_staff', 'camp_admin', 'organization_admin']);
const parentRoles = new Set(['parent_guardian']);

export class PricingAuthorizationError extends Error {}

export interface PricingServiceApi {
  createAddOn(
    sessionId: string,
    input: SessionAddOnWrite,
    requestId: string,
  ): Promise<SessionAddOn>;
  createAssistance(
    familyId: string,
    input: FinancialAssistanceCreate,
    requestId: string,
  ): Promise<FinancialAssistanceApplication>;
  createCoupon(input: CouponWrite, requestId: string): Promise<Coupon>;
  createDiscount(input: DiscountRuleWrite, requestId: string): Promise<DiscountRule>;
  createPaymentPlan(
    input: PaymentPlanTemplateWrite,
    requestId: string,
  ): Promise<PaymentPlanTemplate>;
  deactivatePricingResource(
    type: 'discount_rule' | 'coupon' | 'payment_plan_template',
    id: string,
    requestId: string,
  ): Promise<void>;
  listAssistance(): Promise<FinancialAssistanceApplication[]>;
  listConfiguration(): Promise<PricingConfiguration>;
  listFamilyAssistance(familyId: string): Promise<FinancialAssistanceApplication[]>;
  reviewAssistance(
    applicationId: string,
    input: FinancialAssistanceReview,
    requestId: string,
  ): Promise<FinancialAssistanceApplication>;
  updateAssistance(
    familyId: string,
    applicationId: string,
    input: FinancialAssistanceUpdate,
    requestId: string,
  ): Promise<FinancialAssistanceApplication>;
  withdrawAssistance(
    familyId: string,
    applicationId: string,
    version: number,
    requestId: string,
  ): Promise<FinancialAssistanceApplication>;
  updateAddOn(
    sessionId: string,
    addOnId: string,
    input: SessionAddOnWrite,
    requestId: string,
  ): Promise<SessionAddOn>;
  updateCoupon(id: string, input: CouponWrite, requestId: string): Promise<Coupon>;
  updateDiscount(id: string, input: DiscountRuleWrite, requestId: string): Promise<DiscountRule>;
  updatePaymentPlan(
    id: string,
    input: PaymentPlanTemplateWrite,
    requestId: string,
  ): Promise<PaymentPlanTemplate>;
}

export class PricingService implements PricingServiceApi {
  private readonly membership;
  constructor(
    private readonly store: PricingStore,
    private readonly orderStore: OrderStore,
    private readonly identity: RequestIdentity,
    private readonly organizationId: string,
  ) {
    this.membership = identity.memberships.find(
      (membership) => membership.organizationId === organizationId,
    );
  }
  private hasRole(roles: Set<string>) {
    return Boolean(this.membership?.roles.some((role) => roles.has(role)));
  }
  private authorize(roles: Set<string>) {
    if (!this.hasRole(roles))
      throw new PricingAuthorizationError('Pricing access is not permitted');
  }
  private context(requestId: string) {
    return { actorId: this.identity.subject, organizationId: this.organizationId, requestId };
  }
  private async authorizeFamily(familyId: string) {
    if (this.hasRole(staffRoles)) return;
    if (
      !this.hasRole(parentRoles) ||
      !(await this.orderStore.adultIdentityCanRegisterFamily(
        this.organizationId,
        familyId,
        this.identity.subject,
      ))
    ) {
      throw new PricingAuthorizationError('Financial assistance access is not permitted');
    }
  }
  async listConfiguration() {
    this.authorize(new Set([...adminRoles, ...parentRoles]));
    return this.store.listConfiguration(this.organizationId);
  }
  async createAddOn(sessionId: string, input: SessionAddOnWrite, requestId: string) {
    this.authorize(adminRoles);
    return this.store.createAddOn(this.context(requestId), sessionId, input);
  }
  async updateAddOn(
    sessionId: string,
    addOnId: string,
    input: SessionAddOnWrite,
    requestId: string,
  ) {
    this.authorize(adminRoles);
    return this.store.updateAddOn(this.context(requestId), sessionId, addOnId, input);
  }
  async createDiscount(input: DiscountRuleWrite, requestId: string) {
    this.authorize(adminRoles);
    return this.store.createDiscount(this.context(requestId), input);
  }
  async createCoupon(input: CouponWrite, requestId: string) {
    this.authorize(adminRoles);
    return this.store.createCoupon(this.context(requestId), input);
  }
  async createPaymentPlan(input: PaymentPlanTemplateWrite, requestId: string) {
    this.authorize(adminRoles);
    return this.store.createPaymentPlan(this.context(requestId), input);
  }
  async updateDiscount(id: string, input: DiscountRuleWrite, requestId: string) {
    this.authorize(adminRoles);
    return this.store.updateDiscount(this.context(requestId), id, input);
  }
  async updateCoupon(id: string, input: CouponWrite, requestId: string) {
    this.authorize(adminRoles);
    return this.store.updateCoupon(this.context(requestId), id, input);
  }
  async updatePaymentPlan(id: string, input: PaymentPlanTemplateWrite, requestId: string) {
    this.authorize(adminRoles);
    return this.store.updatePaymentPlan(this.context(requestId), id, input);
  }
  async deactivatePricingResource(
    type: 'discount_rule' | 'coupon' | 'payment_plan_template',
    id: string,
    requestId: string,
  ) {
    this.authorize(adminRoles);
    return this.store.deactivateResource(this.context(requestId), type, id);
  }
  async createAssistance(familyId: string, input: FinancialAssistanceCreate, requestId: string) {
    await this.authorizeFamily(familyId);
    return this.redact(
      await this.store.createAssistanceApplication(this.context(requestId), familyId, input),
    );
  }
  async listFamilyAssistance(familyId: string) {
    await this.authorizeFamily(familyId);
    return (await this.store.listAssistance(this.organizationId, familyId)).map((item) =>
      this.redact(item),
    );
  }
  async updateAssistance(
    familyId: string,
    applicationId: string,
    input: FinancialAssistanceUpdate,
    requestId: string,
  ) {
    await this.authorizeFamily(familyId);
    return this.redact(
      await this.store.updateAssistanceApplication(
        this.context(requestId),
        familyId,
        applicationId,
        input,
      ),
    );
  }
  async withdrawAssistance(
    familyId: string,
    applicationId: string,
    version: number,
    requestId: string,
  ) {
    await this.authorizeFamily(familyId);
    return this.redact(
      await this.store.withdrawAssistanceApplication(
        this.context(requestId),
        familyId,
        applicationId,
        version,
      ),
    );
  }
  async listAssistance() {
    this.authorize(staffRoles);
    return this.store.listAssistance(this.organizationId);
  }
  async reviewAssistance(
    applicationId: string,
    input: FinancialAssistanceReview,
    requestId: string,
  ) {
    this.authorize(adminRoles);
    return this.store.reviewAssistance(this.context(requestId), applicationId, input);
  }
  private redact(application: FinancialAssistanceApplication): FinancialAssistanceApplication {
    return { ...application, internal_note: null };
  }
}
