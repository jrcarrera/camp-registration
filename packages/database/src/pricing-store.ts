import { randomUUID } from 'node:crypto';

import type { PoolClient } from 'pg';

import type { DatabaseClient } from './client.js';
import type { FamilyWriteContext } from './family-store.js';

export interface SessionAddOnRecord {
  active: boolean;
  description: string | null;
  id: string;
  name: string;
  price_cents: number;
  required: boolean;
  session_id: string;
  version: number;
}

export interface DiscountRuleRecord {
  active: boolean;
  id: string;
  minimum_qualifying_lines: number;
  name: string;
  priority: number;
  rule_type: 'SIBLING' | 'MULTI_SESSION';
  season_id: string;
  value: number;
  value_type: 'FIXED' | 'PERCENT';
  version: number;
}

export interface CouponRecord {
  active: boolean;
  code: string;
  ends_at: string | null;
  id: string;
  maximum_redemptions: number | null;
  season_id: string;
  starts_at: string | null;
  value: number;
  value_type: 'FIXED' | 'PERCENT';
  version: number;
}

export interface PaymentPlanTemplateRecord {
  active: boolean;
  id: string;
  installments: Array<{
    due_on: string;
    percentage_basis_points: number;
    sequence: number;
  }>;
  name: string;
  season_id: string;
  version: number;
}

export interface PricingConfigurationRecord {
  add_ons: SessionAddOnRecord[];
  coupons: CouponRecord[];
  discount_rules: DiscountRuleRecord[];
  payment_plan_templates: PaymentPlanTemplateRecord[];
}

export interface AssistanceApplicationRecord {
  approved_cents: number | null;
  camper_id: string | null;
  created_at: string;
  family_id: string;
  id: string;
  internal_note: string | null;
  requested_cents: number;
  season_id: string;
  statement: string;
  status: 'DRAFT' | 'SUBMITTED' | 'REVISION_REQUESTED' | 'APPROVED' | 'DENIED' | 'WITHDRAWN';
  version: number;
}

export class PricingNotFoundError extends Error {}
export class PricingConflictError extends Error {}
export class PricingValidationError extends Error {}

function iso(value: Date | string | null): string | null {
  return value ? new Date(value).toISOString() : null;
}

export class PricingStore {
  constructor(private readonly database: DatabaseClient) {}

  private async withTenant<T>(
    organizationId: string,
    operation: (client: PoolClient) => Promise<T>,
  ): Promise<T> {
    const client = await this.database.pool.connect();
    try {
      await client.query('BEGIN');
      await client.query(`SELECT set_config('app.organization_id', $1, true)`, [organizationId]);
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

  async listConfiguration(organizationId: string): Promise<PricingConfigurationRecord> {
    return this.withTenant(organizationId, (client) =>
      this.listConfigurationInTenant(client, organizationId),
    );
  }

  async createAddOn(
    context: FamilyWriteContext,
    sessionId: string,
    input: Omit<SessionAddOnRecord, 'description' | 'id' | 'session_id' | 'version'> & {
      description?: string | null;
    },
  ): Promise<SessionAddOnRecord> {
    return this.withTenant(context.organizationId, async (client) => {
      const id = randomUUID();
      const result = await client.query<SessionAddOnRecord>(
        `INSERT INTO session_add_ons (
           id, organization_id, session_id, name, description, price_cents, required, active
         ) SELECT $1,$2,s.id,$4,$5,$6,$7,$8
           FROM sessions s WHERE s.organization_id = $2 AND s.id = $3
         RETURNING id, session_id, name, description, price_cents, required, active, version`,
        [
          id,
          context.organizationId,
          sessionId,
          input.name.trim(),
          input.description?.trim() || null,
          input.price_cents,
          input.required,
          input.active,
        ],
      );
      if (!result.rows[0]) throw new PricingNotFoundError('Session not found');
      await this.audit(client, context, 'pricing.add_on_created', 'session_add_on', id, {});
      return result.rows[0];
    });
  }

  async updateAddOn(
    context: FamilyWriteContext,
    sessionId: string,
    addOnId: string,
    input: Omit<SessionAddOnRecord, 'description' | 'id' | 'session_id' | 'version'> & {
      description?: string | null;
    },
  ): Promise<SessionAddOnRecord> {
    return this.withTenant(context.organizationId, async (client) => {
      const result = await client.query<SessionAddOnRecord>(
        `UPDATE session_add_ons SET name=$4, description=$5, price_cents=$6,
           required=$7, active=$8, version=version+1, updated_at=transaction_timestamp()
         WHERE organization_id=$1 AND session_id=$2 AND id=$3
         RETURNING id, session_id, name, description, price_cents, required, active, version`,
        [
          context.organizationId,
          sessionId,
          addOnId,
          input.name.trim(),
          input.description?.trim() || null,
          input.price_cents,
          input.required,
          input.active,
        ],
      );
      if (!result.rows[0]) throw new PricingNotFoundError('Add-on not found');
      await this.audit(client, context, 'pricing.add_on_updated', 'session_add_on', addOnId, {});
      return result.rows[0];
    });
  }

  async createDiscount(
    context: FamilyWriteContext,
    input: Omit<DiscountRuleRecord, 'id' | 'version'>,
  ): Promise<DiscountRuleRecord> {
    return this.withTenant(context.organizationId, async (client) => {
      const id = randomUUID();
      const result = await client.query<DiscountRuleRecord>(
        `INSERT INTO discount_rules (
           id, organization_id, season_id, name, rule_type, value_type, value,
           minimum_qualifying_lines, priority, active
         ) SELECT $1,$2,se.id,$4,$5,$6,$7,$8,$9,$10
           FROM seasons se WHERE se.organization_id=$2 AND se.id=$3
         RETURNING id, season_id, name, rule_type, value_type, value,
                   minimum_qualifying_lines, priority, active, version`,
        [
          id,
          context.organizationId,
          input.season_id,
          input.name.trim(),
          input.rule_type,
          input.value_type,
          input.value,
          input.minimum_qualifying_lines,
          input.priority,
          input.active,
        ],
      );
      if (!result.rows[0]) throw new PricingNotFoundError('Season not found');
      await this.audit(client, context, 'pricing.discount_created', 'discount_rule', id, {});
      return result.rows[0];
    });
  }

  async updateDiscount(
    context: FamilyWriteContext,
    discountId: string,
    input: Omit<DiscountRuleRecord, 'id' | 'version'>,
  ): Promise<DiscountRuleRecord> {
    return this.withTenant(context.organizationId, async (client) => {
      const result = await client.query<DiscountRuleRecord>(
        `UPDATE discount_rules d SET season_id=$3,name=$4,rule_type=$5,value_type=$6,
           value=$7,minimum_qualifying_lines=$8,priority=$9,active=$10,
           version=version+1,updated_at=transaction_timestamp()
         WHERE d.organization_id=$1 AND d.id=$2 AND EXISTS (
           SELECT 1 FROM seasons se WHERE se.organization_id=$1 AND se.id=$3
         )
         RETURNING id,season_id,name,rule_type,value_type,value,
                   minimum_qualifying_lines,priority,active,version`,
        [
          context.organizationId,
          discountId,
          input.season_id,
          input.name.trim(),
          input.rule_type,
          input.value_type,
          input.value,
          input.minimum_qualifying_lines,
          input.priority,
          input.active,
        ],
      );
      if (!result.rows[0]) throw new PricingNotFoundError('Discount rule not found');
      await this.audit(
        client,
        context,
        'pricing.discount_updated',
        'discount_rule',
        discountId,
        {},
      );
      return result.rows[0];
    });
  }

  async createCoupon(
    context: FamilyWriteContext,
    input: Omit<CouponRecord, 'id' | 'version'>,
  ): Promise<CouponRecord> {
    return this.withTenant(context.organizationId, async (client) => {
      const id = randomUUID();
      try {
        const result = await client.query<{
          active: boolean;
          code: string;
          ends_at: Date | string | null;
          id: string;
          maximum_redemptions: number | null;
          season_id: string;
          starts_at: Date | string | null;
          value: number;
          value_type: 'FIXED' | 'PERCENT';
          version: number;
        }>(
          `INSERT INTO coupons (
             id, organization_id, season_id, code, code_normalized, value_type, value,
             starts_at, ends_at, maximum_redemptions, active
           ) SELECT $1,$2,se.id,$4,upper(trim($4)),$5,$6,$7,$8,$9,$10
             FROM seasons se WHERE se.organization_id=$2 AND se.id=$3
           RETURNING id, season_id, code, value_type, value, starts_at, ends_at,
                     maximum_redemptions, active, version`,
          [
            id,
            context.organizationId,
            input.season_id,
            input.code.trim(),
            input.value_type,
            input.value,
            input.starts_at,
            input.ends_at,
            input.maximum_redemptions,
            input.active,
          ],
        );
        if (!result.rows[0]) throw new PricingNotFoundError('Season not found');
        await this.audit(client, context, 'pricing.coupon_created', 'coupon', id, {});
        return {
          ...result.rows[0],
          starts_at: iso(result.rows[0].starts_at),
          ends_at: iso(result.rows[0].ends_at),
        };
      } catch (error) {
        if ((error as { code?: string }).code === '23505')
          throw new PricingConflictError('Coupon code already exists');
        throw error;
      }
    });
  }

  async updateCoupon(
    context: FamilyWriteContext,
    couponId: string,
    input: Omit<CouponRecord, 'id' | 'version'>,
  ): Promise<CouponRecord> {
    return this.withTenant(context.organizationId, async (client) => {
      try {
        const result = await client.query<
          CouponRecord & { ends_at: Date | string | null; starts_at: Date | string | null }
        >(
          `UPDATE coupons c SET season_id=$3,code=$4,code_normalized=upper(trim($4)),
             value_type=$5,value=$6,starts_at=$7,ends_at=$8,maximum_redemptions=$9,
             active=$10,version=version+1,updated_at=transaction_timestamp()
           WHERE c.organization_id=$1 AND c.id=$2 AND EXISTS (
             SELECT 1 FROM seasons se WHERE se.organization_id=$1 AND se.id=$3
           )
           RETURNING id,season_id,code,value_type,value,starts_at,ends_at,
                     maximum_redemptions,active,version`,
          [
            context.organizationId,
            couponId,
            input.season_id,
            input.code.trim(),
            input.value_type,
            input.value,
            input.starts_at,
            input.ends_at,
            input.maximum_redemptions,
            input.active,
          ],
        );
        if (!result.rows[0]) throw new PricingNotFoundError('Coupon not found');
        await this.audit(client, context, 'pricing.coupon_updated', 'coupon', couponId, {});
        return {
          ...result.rows[0],
          starts_at: iso(result.rows[0].starts_at),
          ends_at: iso(result.rows[0].ends_at),
        };
      } catch (error) {
        if ((error as { code?: string }).code === '23505')
          throw new PricingConflictError('Coupon code already exists');
        throw error;
      }
    });
  }

  async createPaymentPlan(
    context: FamilyWriteContext,
    input: Omit<PaymentPlanTemplateRecord, 'id' | 'version'>,
  ): Promise<PaymentPlanTemplateRecord> {
    const sum = input.installments.reduce((total, item) => total + item.percentage_basis_points, 0);
    if (input.installments.length < 2 || input.installments.length > 6 || sum !== 10000) {
      throw new PricingValidationError('Payment plan must contain 2-6 installments totaling 100%');
    }
    const sorted = [...input.installments].sort((a, b) => a.sequence - b.sequence);
    if (sorted.some((item, index) => item.sequence !== index + 1)) {
      throw new PricingValidationError('Payment plan installment sequence must be contiguous');
    }
    return this.withTenant(context.organizationId, async (client) => {
      const id = randomUUID();
      const inserted = await client.query(
        `INSERT INTO payment_plan_templates (
           id, organization_id, season_id, name, active
         ) SELECT $1,$2,se.id,$4,$5 FROM seasons se
           WHERE se.organization_id=$2 AND se.id=$3 RETURNING id`,
        [id, context.organizationId, input.season_id, input.name.trim(), input.active],
      );
      if (!inserted.rows[0]) throw new PricingNotFoundError('Season not found');
      for (const item of sorted) {
        await client.query(
          `INSERT INTO payment_plan_template_installments (
             id, organization_id, template_id, sequence, due_on, percentage_basis_points
           ) VALUES ($1,$2,$3,$4,$5,$6)`,
          [
            randomUUID(),
            context.organizationId,
            id,
            item.sequence,
            item.due_on,
            item.percentage_basis_points,
          ],
        );
      }
      await this.audit(
        client,
        context,
        'pricing.payment_plan_created',
        'payment_plan_template',
        id,
        {},
      );
      return { ...input, id, installments: sorted, version: 1 };
    });
  }

  async updatePaymentPlan(
    context: FamilyWriteContext,
    planId: string,
    input: Omit<PaymentPlanTemplateRecord, 'id' | 'version'>,
  ): Promise<PaymentPlanTemplateRecord> {
    const sum = input.installments.reduce((total, item) => total + item.percentage_basis_points, 0);
    const sorted = [...input.installments].sort((a, b) => a.sequence - b.sequence);
    if (
      sorted.length < 2 ||
      sorted.length > 6 ||
      sum !== 10000 ||
      sorted.some((item, index) => item.sequence !== index + 1)
    ) {
      throw new PricingValidationError(
        'Payment plan must contain 2-6 contiguous installments totaling 100%',
      );
    }
    return this.withTenant(context.organizationId, async (client) => {
      const updated = await client.query<{ version: number }>(
        `UPDATE payment_plan_templates p SET season_id=$3,name=$4,active=$5,
           version=version+1,updated_at=transaction_timestamp()
         WHERE p.organization_id=$1 AND p.id=$2 AND EXISTS (
           SELECT 1 FROM seasons se WHERE se.organization_id=$1 AND se.id=$3
         ) RETURNING version`,
        [context.organizationId, planId, input.season_id, input.name.trim(), input.active],
      );
      if (!updated.rows[0]) throw new PricingNotFoundError('Payment plan not found');
      await client.query(
        `DELETE FROM payment_plan_template_installments
         WHERE organization_id=$1 AND template_id=$2`,
        [context.organizationId, planId],
      );
      for (const item of sorted) {
        await client.query(
          `INSERT INTO payment_plan_template_installments (
             id,organization_id,template_id,sequence,due_on,percentage_basis_points
           ) VALUES ($1,$2,$3,$4,$5,$6)`,
          [
            randomUUID(),
            context.organizationId,
            planId,
            item.sequence,
            item.due_on,
            item.percentage_basis_points,
          ],
        );
      }
      await this.audit(
        client,
        context,
        'pricing.payment_plan_updated',
        'payment_plan_template',
        planId,
        {},
      );
      return { ...input, id: planId, installments: sorted, version: updated.rows[0].version };
    });
  }

  async deactivateResource(
    context: FamilyWriteContext,
    type: 'discount_rule' | 'coupon' | 'payment_plan_template',
    id: string,
  ): Promise<void> {
    const table =
      type === 'discount_rule'
        ? 'discount_rules'
        : type === 'coupon'
          ? 'coupons'
          : 'payment_plan_templates';
    return this.withTenant(context.organizationId, async (client) => {
      const result = await client.query(
        `UPDATE ${table} SET active=false,version=version+1,updated_at=transaction_timestamp()
         WHERE organization_id=$1 AND id=$2 RETURNING id`,
        [context.organizationId, id],
      );
      if (!result.rows[0]) throw new PricingNotFoundError('Pricing resource not found');
      await this.audit(client, context, `pricing.${type}_deactivated`, type, id, {});
    });
  }

  async createAssistanceApplication(
    context: FamilyWriteContext,
    familyId: string,
    input: {
      camper_id?: string | null;
      requested_cents: number;
      season_id: string;
      statement: string;
      submit: boolean;
    },
  ): Promise<AssistanceApplicationRecord> {
    return this.withTenant(context.organizationId, async (client) => {
      const id = randomUUID();
      const result = await client.query(
        `INSERT INTO financial_assistance_applications (
           id, organization_id, family_id, season_id, camper_id, status,
           requested_cents, statement, submitted_at, created_by
         ) SELECT $1,$2,f.id,se.id,$5,$6,$7,$8,
                  CASE WHEN $6='SUBMITTED' THEN transaction_timestamp() ELSE NULL END,$9
           FROM families f CROSS JOIN seasons se
           WHERE f.organization_id=$2 AND f.id=$3 AND f.archived_at IS NULL
             AND se.organization_id=$2 AND se.id=$4
             AND ($5::uuid IS NULL OR EXISTS (
               SELECT 1 FROM campers c WHERE c.organization_id=$2 AND c.family_id=$3 AND c.id=$5
             ))
         RETURNING id`,
        [
          id,
          context.organizationId,
          familyId,
          input.season_id,
          input.camper_id ?? null,
          input.submit ? 'SUBMITTED' : 'DRAFT',
          input.requested_cents,
          input.statement.trim(),
          context.actorId,
        ],
      );
      if (!result.rows[0]) throw new PricingNotFoundError('Family, camper, or season not found');
      await this.audit(
        client,
        context,
        'assistance.application_created',
        'financial_assistance_application',
        id,
        { status: input.submit ? 'SUBMITTED' : 'DRAFT' },
      );
      return this.getAssistanceInTenant(client, context.organizationId, id);
    });
  }

  async listAssistance(
    organizationId: string,
    familyId?: string,
  ): Promise<AssistanceApplicationRecord[]> {
    return this.withTenant(organizationId, async (client) => {
      const result = await client.query<{ id: string }>(
        `SELECT id FROM financial_assistance_applications
         WHERE organization_id=$1 AND ($2::uuid IS NULL OR family_id=$2)
         ORDER BY created_at DESC, id DESC`,
        [organizationId, familyId ?? null],
      );
      return Promise.all(
        result.rows.map((row) => this.getAssistanceInTenant(client, organizationId, row.id)),
      );
    });
  }

  async updateAssistanceApplication(
    context: FamilyWriteContext,
    familyId: string,
    applicationId: string,
    input: {
      camper_id?: string | null;
      requested_cents: number;
      statement: string;
      submit: boolean;
      version: number;
    },
  ): Promise<AssistanceApplicationRecord> {
    return this.withTenant(context.organizationId, async (client) => {
      const result = await client.query(
        `UPDATE financial_assistance_applications a
         SET camper_id=$5, requested_cents=$6, statement=$7,
             status=CASE WHEN $8 THEN 'SUBMITTED' ELSE 'DRAFT' END,
             submitted_at=CASE WHEN $8 THEN transaction_timestamp() ELSE NULL END,
             internal_note=NULL, version=version+1, updated_at=transaction_timestamp()
         WHERE a.organization_id=$1 AND a.family_id=$2 AND a.id=$3 AND a.version=$4
           AND a.status IN ('DRAFT','REVISION_REQUESTED')
           AND ($5::uuid IS NULL OR EXISTS (
             SELECT 1 FROM campers c
             WHERE c.organization_id=$1 AND c.family_id=$2 AND c.id=$5
           ))
         RETURNING a.id`,
        [
          context.organizationId,
          familyId,
          applicationId,
          input.version,
          input.camper_id ?? null,
          input.requested_cents,
          input.statement.trim(),
          input.submit,
        ],
      );
      if (!result.rows[0]) {
        throw new PricingConflictError('Application changed or can no longer be edited');
      }
      await this.audit(
        client,
        context,
        'assistance.application_updated',
        'financial_assistance_application',
        applicationId,
        { status: input.submit ? 'SUBMITTED' : 'DRAFT' },
      );
      return this.getAssistanceInTenant(client, context.organizationId, applicationId);
    });
  }

  async withdrawAssistanceApplication(
    context: FamilyWriteContext,
    familyId: string,
    applicationId: string,
    version: number,
  ): Promise<AssistanceApplicationRecord> {
    return this.withTenant(context.organizationId, async (client) => {
      const result = await client.query(
        `UPDATE financial_assistance_applications
         SET status='WITHDRAWN', version=version+1, updated_at=transaction_timestamp()
         WHERE organization_id=$1 AND family_id=$2 AND id=$3 AND version=$4
           AND status IN ('DRAFT','SUBMITTED','REVISION_REQUESTED')
         RETURNING id`,
        [context.organizationId, familyId, applicationId, version],
      );
      if (!result.rows[0]) {
        throw new PricingConflictError('Application changed or can no longer be withdrawn');
      }
      await this.audit(
        client,
        context,
        'assistance.application_withdrawn',
        'financial_assistance_application',
        applicationId,
        {},
      );
      return this.getAssistanceInTenant(client, context.organizationId, applicationId);
    });
  }

  async reviewAssistance(
    context: FamilyWriteContext,
    applicationId: string,
    input: {
      approved_cents?: number;
      internal_note?: string | null;
      status: 'REVISION_REQUESTED' | 'APPROVED' | 'DENIED';
      version: number;
    },
  ): Promise<AssistanceApplicationRecord> {
    if (input.status === 'APPROVED' && !input.approved_cents) {
      throw new PricingValidationError('Approved amount is required');
    }
    return this.withTenant(context.organizationId, async (client) => {
      const current = await client.query<{
        camper_id: string | null;
        family_id: string;
        season_id: string;
      }>(
        `SELECT family_id, season_id, camper_id FROM financial_assistance_applications
         WHERE organization_id=$1 AND id=$2 AND version=$3 AND status IN ('SUBMITTED','REVISION_REQUESTED')
         FOR UPDATE`,
        [context.organizationId, applicationId, input.version],
      );
      const row = current.rows[0];
      if (!row) throw new PricingConflictError('Application changed or cannot be reviewed');
      await client.query(
        `UPDATE financial_assistance_applications SET status=$3, internal_note=$4,
           reviewed_at=transaction_timestamp(), reviewed_by=$5, version=version+1,
           updated_at=transaction_timestamp()
         WHERE organization_id=$1 AND id=$2`,
        [
          context.organizationId,
          applicationId,
          input.status,
          input.internal_note?.trim() || null,
          context.actorId,
        ],
      );
      if (input.status === 'APPROVED') {
        await client.query(
          `INSERT INTO financial_assistance_awards (
             id, organization_id, application_id, family_id, season_id, camper_id,
             amount_cents, created_by
           ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8)`,
          [
            randomUUID(),
            context.organizationId,
            applicationId,
            row.family_id,
            row.season_id,
            row.camper_id,
            input.approved_cents,
            context.actorId,
          ],
        );
      }
      await this.audit(
        client,
        context,
        'assistance.application_reviewed',
        'financial_assistance_application',
        applicationId,
        { status: input.status },
      );
      return this.getAssistanceInTenant(client, context.organizationId, applicationId);
    });
  }

  private async listConfigurationInTenant(
    client: PoolClient,
    organizationId: string,
  ): Promise<PricingConfigurationRecord> {
    const [addOns, discounts, coupons, plans, installments] = await Promise.all([
      client.query<SessionAddOnRecord>(
        `SELECT id, session_id, name, description, price_cents, required, active, version FROM session_add_ons WHERE organization_id=$1 ORDER BY name,id`,
        [organizationId],
      ),
      client.query<DiscountRuleRecord>(
        `SELECT id, season_id, name, rule_type, value_type, value, minimum_qualifying_lines, priority, active, version FROM discount_rules WHERE organization_id=$1 ORDER BY priority,name,id`,
        [organizationId],
      ),
      client.query<{
        active: boolean;
        code: string;
        ends_at: Date | string | null;
        id: string;
        maximum_redemptions: number | null;
        season_id: string;
        starts_at: Date | string | null;
        value: number;
        value_type: 'FIXED' | 'PERCENT';
        version: number;
      }>(
        `SELECT id, season_id, code, value_type, value, starts_at, ends_at, maximum_redemptions, active, version FROM coupons WHERE organization_id=$1 ORDER BY code,id`,
        [organizationId],
      ),
      client.query<Omit<PaymentPlanTemplateRecord, 'installments'>>(
        `SELECT id, season_id, name, active, version FROM payment_plan_templates WHERE organization_id=$1 ORDER BY name,id`,
        [organizationId],
      ),
      client.query<{
        due_on: string;
        percentage_basis_points: number;
        sequence: number;
        template_id: string;
      }>(
        `SELECT template_id, sequence, due_on::text, percentage_basis_points FROM payment_plan_template_installments WHERE organization_id=$1 ORDER BY template_id,sequence`,
        [organizationId],
      ),
    ]);
    return {
      add_ons: addOns.rows,
      coupons: coupons.rows.map((row) => ({
        ...row,
        starts_at: iso(row.starts_at),
        ends_at: iso(row.ends_at),
      })),
      discount_rules: discounts.rows,
      payment_plan_templates: plans.rows.map((plan) => ({
        ...plan,
        installments: installments.rows
          .filter((item) => item.template_id === plan.id)
          .map((item) => ({
            due_on: item.due_on,
            percentage_basis_points: item.percentage_basis_points,
            sequence: item.sequence,
          })),
      })),
    };
  }

  private async getAssistanceInTenant(
    client: PoolClient,
    organizationId: string,
    applicationId: string,
  ): Promise<AssistanceApplicationRecord> {
    const result = await client.query<{
      approved_cents: number | null;
      camper_id: string | null;
      created_at: Date | string;
      family_id: string;
      id: string;
      internal_note: string | null;
      requested_cents: number;
      season_id: string;
      statement: string;
      status: AssistanceApplicationRecord['status'];
      version: number;
    }>(
      `SELECT a.id, a.family_id, a.season_id, a.camper_id, a.status,
              a.requested_cents, a.statement, a.internal_note, a.version, a.created_at,
              award.amount_cents AS approved_cents
       FROM financial_assistance_applications a
       LEFT JOIN financial_assistance_awards award
         ON award.organization_id=a.organization_id AND award.application_id=a.id
       WHERE a.organization_id=$1 AND a.id=$2`,
      [organizationId, applicationId],
    );
    const row = result.rows[0];
    if (!row) throw new PricingNotFoundError('Application not found');
    return { ...row, created_at: iso(row.created_at)! };
  }

  private async audit(
    client: PoolClient,
    context: FamilyWriteContext,
    action: string,
    targetType: string,
    targetId: string,
    details: Record<string, unknown>,
  ): Promise<void> {
    await client.query(
      `INSERT INTO audit_events (
         organization_id, actor_id, action, target_type, target_id, outcome, request_id, details
       ) VALUES ($1,$2,$3,$4,$5,'success',$6,$7::jsonb)`,
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
