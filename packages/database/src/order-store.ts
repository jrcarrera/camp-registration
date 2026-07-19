import { randomUUID } from 'node:crypto';

import type { PoolClient } from 'pg';

import type { DatabaseClient } from './client.js';
import type { FamilyWriteContext } from './family-store.js';

export type OrderWaitlistMode = 'INDIVIDUAL' | 'KEEP_TOGETHER';
export type OrderStatus = 'PAYMENT_PENDING' | 'COMPLETED' | 'PARTIAL' | 'EXPIRED' | 'CANCELLED';
export type OrderLineOutcome = 'HELD' | 'CONFIRMED' | 'WAITLISTED' | 'EXPIRED' | 'CANCELLED';

export interface OrderLineInput {
  add_on_ids?: string[];
  bunk_buddy_names?: string[];
  camper_id: string;
  session_id: string;
}

export interface OrderSelectionInput {
  coupon_code?: string | null;
  lines: OrderLineInput[];
  payment_plan_template_id?: string | null;
  waitlist_mode: OrderWaitlistMode;
}

export interface OrderQuoteLineRecord {
  add_on_ids: string[];
  add_on_names: string[];
  add_on_total_cents: number;
  assistance_cents: number;
  automatic_discount_cents: number;
  base_price_cents: number;
  bunk_buddy_names: string[];
  camper_id: string;
  camper_name: string;
  coupon_discount_cents: number;
  deposit_due_cents: number;
  errors: string[];
  gross_price_cents: number;
  net_price_cents: number;
  outcome: 'AVAILABLE' | 'WAITLIST' | 'INVALID';
  season_id: string;
  session_id: string;
  session_name: string;
}

export interface OrderTotalsRecord {
  assistance_cents: number;
  automatic_discount_cents: number;
  coupon_discount_cents: number;
  deposit_due_cents: number;
  gross_total_cents: number;
  net_total_cents: number;
}

export interface OrderQuoteRecord {
  currency: 'USD';
  lines: OrderQuoteLineRecord[];
  paymentPlan: PaymentPlanTemplateRecord | null;
  selectedCoupon: { id: string; code: string } | null;
  selectedDiscount: { id: string; name: string } | null;
  totals: OrderTotalsRecord;
  valid: boolean;
}

export interface OrderAdjustmentRecord {
  amount_cents: number;
  label: string;
  type: 'AUTOMATIC_DISCOUNT' | 'COUPON' | 'ASSISTANCE';
}

export interface OrderInstallmentRecord {
  amount_cents: number;
  due_on: string;
  id: string;
  paid_at: string | null;
  sequence: number;
  status: 'SCHEDULED' | 'DUE' | 'OVERDUE' | 'PAID';
}

export interface HouseholdOrderLineRecord {
  add_on_names: string[];
  add_on_total_cents: number;
  adjustments: OrderAdjustmentRecord[];
  assistance_cents: number;
  automatic_discount_cents: number;
  bunk_buddy_names: string[];
  camper_id: string;
  camper_name: string;
  coupon_discount_cents: number;
  deposit_due_cents: number;
  gross_price_cents: number;
  hold_expires_at: string | null;
  id: string;
  net_price_cents: number;
  outcome: OrderLineOutcome;
  registration_id: string | null;
  session_id: string;
  session_name: string;
}

export interface HouseholdOrderRecord {
  coupon_code: string | null;
  created_at: string;
  currency: 'USD';
  family_id: string;
  family_name: string;
  id: string;
  installments: OrderInstallmentRecord[];
  lines: HouseholdOrderLineRecord[];
  payment_required: boolean;
  status: OrderStatus;
  totals: OrderTotalsRecord;
  waitlist_mode: OrderWaitlistMode;
}

interface SessionRow {
  age_as_of: 'SESSION_START' | 'SEASON_START';
  capacity: number;
  code: string;
  deposit_cents: number;
  maximum_age: number;
  maximum_grade: number;
  minimum_age: number;
  minimum_grade: number;
  name: string;
  price_cents: number;
  registration_closes_at: Date | string;
  registration_opens_at: Date | string;
  season_id: string;
  season_year: number;
  session_id: string;
  starts_on: string;
  status: string;
  waitlist_enabled: boolean;
}

interface CamperRow {
  birth_date: string;
  camper_id: string;
  first_name: string;
  last_name: string;
  school_grade: string | null;
}

interface AddOnRow {
  id: string;
  name: string;
  price_cents: number;
  required: boolean;
  session_id: string;
}

interface DiscountRuleRow {
  id: string;
  name: string;
  minimum_qualifying_lines: number;
  priority: number;
  rule_type: 'SIBLING' | 'MULTI_SESSION';
  season_id: string;
  value: number;
  value_type: 'FIXED' | 'PERCENT';
}

interface CouponRow {
  code: string;
  id: string;
  season_id: string;
  value: number;
  value_type: 'FIXED' | 'PERCENT';
}

interface AwardRow {
  available_cents: number;
  camper_id: string | null;
  id: string;
  season_id: string;
}

interface PaymentPlanTemplateRecord {
  id: string;
  installments: { due_on: string; percentage_basis_points: number; sequence: number }[];
  season_id: string;
}

export class OrderNotFoundError extends Error {}
export class OrderConflictError extends Error {}
export class OrderValidationError extends Error {
  constructor(
    message: string,
    readonly fieldErrors: Record<string, string> = {},
  ) {
    super(message);
  }
}

function iso(value: Date | string): string {
  return new Date(value).toISOString();
}

function normalizedGrade(value: string | null): number | null {
  if (!value) return null;
  const normalized = value.trim().toLowerCase();
  if (['k', 'kg', 'kindergarten'].includes(normalized)) return 0;
  const number = Number.parseInt(normalized.replace(/[^0-9]/g, ''), 10);
  return Number.isInteger(number) && number >= 0 && number <= 12 ? number : null;
}

function ageOn(birthDate: string, onDate: string): number {
  const birth = new Date(`${birthDate}T00:00:00Z`);
  const on = new Date(`${onDate}T00:00:00Z`);
  let age = on.getUTCFullYear() - birth.getUTCFullYear();
  if (
    on.getUTCMonth() < birth.getUTCMonth() ||
    (on.getUTCMonth() === birth.getUTCMonth() && on.getUTCDate() < birth.getUTCDate())
  ) {
    age -= 1;
  }
  return age;
}

function discountAmount(base: number, rule: DiscountRuleRow): number {
  return Math.min(
    base,
    rule.value_type === 'FIXED' ? rule.value : Math.floor((base * rule.value) / 10000),
  );
}

function allocateFixed(total: number, weights: number[]): number[] {
  const weightTotal = weights.reduce((sum, value) => sum + value, 0);
  if (total <= 0 || weightTotal <= 0) return weights.map(() => 0);
  let remaining = Math.min(total, weightTotal);
  return weights.map((weight, index) => {
    if (index === weights.length - 1) return Math.min(weight, remaining);
    const amount = Math.min(weight, Math.floor((total * weight) / weightTotal));
    remaining -= amount;
    return amount;
  });
}

function totals(lines: OrderQuoteLineRecord[]): OrderTotalsRecord {
  return {
    assistance_cents: lines.reduce((sum, line) => sum + line.assistance_cents, 0),
    automatic_discount_cents: lines.reduce((sum, line) => sum + line.automatic_discount_cents, 0),
    coupon_discount_cents: lines.reduce((sum, line) => sum + line.coupon_discount_cents, 0),
    deposit_due_cents: lines.reduce((sum, line) => sum + line.deposit_due_cents, 0),
    gross_total_cents: lines.reduce((sum, line) => sum + line.gross_price_cents, 0),
    net_total_cents: lines.reduce((sum, line) => sum + line.net_price_cents, 0),
  };
}

export class OrderStore {
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

  async adultIdentityCanRegisterFamily(
    organizationId: string,
    familyId: string,
    subject: string,
  ): Promise<boolean> {
    return this.withTenant(organizationId, async (client) => {
      const result = await client.query(
        `SELECT 1 FROM adults
         WHERE organization_id = $1 AND family_id = $2 AND identity_subject = $3
           AND archived_at IS NULL AND (account_owner OR can_register)
         LIMIT 1`,
        [organizationId, familyId, subject],
      );
      return result.rowCount === 1;
    });
  }

  async quote(
    organizationId: string,
    familyId: string,
    input: OrderSelectionInput,
  ): Promise<OrderQuoteRecord> {
    return this.withTenant(organizationId, (client) =>
      this.buildQuote(client, organizationId, familyId, input, false),
    );
  }

  async createOrder(
    context: FamilyWriteContext,
    familyId: string,
    input: OrderSelectionInput & { idempotency_key: string },
  ): Promise<HouseholdOrderRecord> {
    return this.withTenant(context.organizationId, async (client) => {
      const existing = await client.query<{ id: string }>(
        `SELECT id FROM household_orders
         WHERE organization_id = $1 AND idempotency_key = $2`,
        [context.organizationId, input.idempotency_key],
      );
      if (existing.rows[0]) {
        return this.getOrderInTenant(client, context.organizationId, existing.rows[0].id);
      }

      const quote = await this.buildQuote(client, context.organizationId, familyId, input, true);
      if (!quote.valid) {
        const fieldErrors: Record<string, string> = {};
        quote.lines.forEach((line, index) => {
          if (line.errors[0]) fieldErrors[`lines.${index}`] = line.errors.join(' ');
        });
        throw new OrderValidationError('The order changed or contains invalid lines', fieldErrors);
      }

      const orderId = randomUUID();
      const hasHeld = quote.lines.some((line) => line.outcome === 'AVAILABLE');
      const orderStatus: OrderStatus =
        hasHeld && quote.totals.deposit_due_cents > 0 ? 'PAYMENT_PENDING' : 'COMPLETED';
      await client.query(
        `INSERT INTO household_orders (
           id, organization_id, family_id, status, waitlist_mode, currency,
           gross_total_cents, automatic_discount_cents, coupon_discount_cents,
           assistance_cents, net_total_cents, deposit_due_cents, idempotency_key,
           created_by, coupon_id, coupon_code, payment_plan_template_id
         ) VALUES ($1, $2, $3, $4, $5, 'USD', $6, $7, $8, $9, $10, $11, $12, $13,
           $14, $15, $16)`,
        [
          orderId,
          context.organizationId,
          familyId,
          orderStatus,
          input.waitlist_mode,
          quote.totals.gross_total_cents,
          quote.totals.automatic_discount_cents,
          quote.totals.coupon_discount_cents,
          quote.totals.assistance_cents,
          quote.totals.net_total_cents,
          quote.totals.deposit_due_cents,
          input.idempotency_key,
          context.actorId,
          quote.selectedCoupon?.id ?? null,
          quote.selectedCoupon?.code ?? null,
          quote.paymentPlan?.id ?? null,
        ],
      );

      const waitlistGroupId =
        input.waitlist_mode === 'KEEP_TOGETHER' &&
        quote.lines.every((line) => line.outcome === 'WAITLIST')
          ? randomUUID()
          : null;
      for (const line of quote.lines) {
        const lineId = randomUUID();
        const outcome: OrderLineOutcome = line.outcome === 'AVAILABLE' ? 'HELD' : 'WAITLISTED';
        await client.query(
          `INSERT INTO household_order_lines (
             id, organization_id, order_id, family_id, camper_id, session_id, outcome,
             camper_name, session_name, base_price_cents, add_on_total_cents,
             gross_price_cents, automatic_discount_cents, coupon_discount_cents,
             assistance_cents, net_price_cents, deposit_due_cents, bunk_buddy_names
           ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18)`,
          [
            lineId,
            context.organizationId,
            orderId,
            familyId,
            line.camper_id,
            line.session_id,
            outcome,
            line.camper_name,
            line.session_name,
            line.base_price_cents,
            line.add_on_total_cents,
            line.gross_price_cents,
            line.automatic_discount_cents,
            line.coupon_discount_cents,
            line.assistance_cents,
            line.net_price_cents,
            line.deposit_due_cents,
            line.bunk_buddy_names,
          ],
        );
        for (let index = 0; index < line.add_on_ids.length; index += 1) {
          const addOnId = line.add_on_ids[index]!;
          await client.query(
            `INSERT INTO order_line_add_ons (
               id, organization_id, order_line_id, add_on_id, name, price_cents, required
             )
             SELECT $1, $2, $3, id, name, price_cents, required
             FROM session_add_ons WHERE organization_id = $2 AND id = $4`,
            [randomUUID(), context.organizationId, lineId, addOnId],
          );
        }
        await this.insertAdjustments(client, context.organizationId, orderId, lineId, line, quote);

        if (outcome === 'HELD') {
          await client.query(
            `INSERT INTO capacity_holds (
               id, organization_id, order_id, order_line_id, session_id, expires_at
             ) VALUES ($1, $2, $3, $4, $5, transaction_timestamp() + interval '10 minutes')`,
            [randomUUID(), context.organizationId, orderId, lineId, line.session_id],
          );
        } else {
          const registrationId = randomUUID();
          await client.query(
            `INSERT INTO registrations (
               id, organization_id, session_id, family_id, camper_id, status, source,
               currency, price_cents, deposit_cents, order_id, order_line_id, waitlist_group_id,
               bunk_buddy_names
             ) VALUES ($1,$2,$3,$4,$5,'WAITLISTED','PARENT','USD',$6,$7,$8,$9,$10,$11)`,
            [
              registrationId,
              context.organizationId,
              line.session_id,
              familyId,
              line.camper_id,
              line.gross_price_cents,
              Math.min(line.deposit_due_cents, line.net_price_cents),
              orderId,
              lineId,
              waitlistGroupId,
              line.bunk_buddy_names,
            ],
          );
          await client.query(
            `UPDATE household_order_lines SET registration_id = $3
             WHERE organization_id = $1 AND id = $2`,
            [context.organizationId, lineId, registrationId],
          );
          await this.insertCredits(
            client,
            context.organizationId,
            familyId,
            registrationId,
            line,
            context.actorId,
          );
        }
      }

      if (quote.selectedCoupon && quote.totals.coupon_discount_cents > 0) {
        await client.query(
          `INSERT INTO coupon_redemptions (
             id, organization_id, coupon_id, family_id, order_id, amount_cents
           ) VALUES ($1,$2,$3,$4,$5,$6)`,
          [
            randomUUID(),
            context.organizationId,
            quote.selectedCoupon.id,
            familyId,
            orderId,
            quote.totals.coupon_discount_cents,
          ],
        );
      }

      await this.reserveAssistance(client, context.organizationId, orderId, quote.lines);
      if (quote.paymentPlan && hasHeld) {
        const payableNet = quote.lines
          .filter((line) => line.outcome === 'AVAILABLE')
          .reduce((sum, line) => sum + line.net_price_cents, 0);
        await this.insertInstallments(
          client,
          context.organizationId,
          familyId,
          orderId,
          quote.paymentPlan,
          Math.max(payableNet - quote.totals.deposit_due_cents, 0),
        );
      }
      if (hasHeld && quote.totals.deposit_due_cents === 0) {
        await this.confirmNoPaymentOrder(client, context, orderId, familyId);
      }
      await this.insertAudit(client, context, 'order.created', 'household_order', orderId, {
        line_count: quote.lines.length,
        status: orderStatus,
        waitlist_mode: input.waitlist_mode,
      });
      return this.getOrderInTenant(client, context.organizationId, orderId);
    });
  }

  async getOrder(organizationId: string, orderId: string): Promise<HouseholdOrderRecord> {
    return this.withTenant(organizationId, (client) =>
      this.getOrderInTenant(client, organizationId, orderId),
    );
  }

  async listOrders(organizationId: string, familyId?: string): Promise<HouseholdOrderRecord[]> {
    return this.withTenant(organizationId, async (client) => {
      const result = await client.query<{ id: string }>(
        `SELECT id FROM household_orders
         WHERE organization_id = $1 AND ($2::uuid IS NULL OR family_id = $2)
         ORDER BY created_at DESC, id DESC`,
        [organizationId, familyId ?? null],
      );
      return Promise.all(
        result.rows.map((row) => this.getOrderInTenant(client, organizationId, row.id)),
      );
    });
  }

  async getInstallment(
    organizationId: string,
    installmentId: string,
  ): Promise<{ amount_cents: number; family_id: string; order_id: string; status: string }> {
    return this.withTenant(organizationId, async (client) => {
      const result = await client.query<{
        amount_cents: number;
        family_id: string;
        order_id: string;
        status: string;
      }>(
        `SELECT amount_cents, family_id, order_id, status
         FROM order_installments WHERE organization_id = $1 AND id = $2`,
        [organizationId, installmentId],
      );
      const row = result.rows[0];
      if (!row) throw new OrderNotFoundError('Installment not found');
      return row;
    });
  }

  private async buildQuote(
    client: PoolClient,
    organizationId: string,
    familyId: string,
    input: OrderSelectionInput,
    lock: boolean,
  ): Promise<OrderQuoteRecord> {
    if (input.lines.length < 1 || input.lines.length > 20) {
      throw new OrderValidationError('An order must contain between 1 and 20 lines');
    }
    const unique = new Set(input.lines.map((line) => `${line.camper_id}:${line.session_id}`));
    if (unique.size !== input.lines.length) {
      throw new OrderValidationError('Each camper and session may appear only once');
    }
    const family = await client.query(
      `SELECT 1 FROM families WHERE organization_id = $1 AND id = $2 AND archived_at IS NULL`,
      [organizationId, familyId],
    );
    if (!family.rows[0]) throw new OrderNotFoundError('Family not found');

    const sessionIds = [...new Set(input.lines.map((line) => line.session_id))].sort();
    const sessions = await client.query<SessionRow>(
      `SELECT s.id AS session_id, s.code, s.name, s.season_id, se.year AS season_year,
              s.starts_on::text, s.registration_opens_at, s.registration_closes_at,
              s.capacity, s.minimum_age, s.maximum_age, s.age_as_of, s.price_cents,
              s.deposit_cents, s.waitlist_enabled, s.status,
              p.default_minimum_grade AS minimum_grade,
              p.default_maximum_grade AS maximum_grade
       FROM sessions s
       JOIN seasons se ON se.organization_id = s.organization_id AND se.id = s.season_id
       JOIN programs p ON p.organization_id = s.organization_id AND p.id = s.program_id
       WHERE s.organization_id = $1 AND s.id = ANY($2::uuid[])
       ORDER BY s.id ${lock ? 'FOR UPDATE OF s' : ''}`,
      [organizationId, sessionIds],
    );
    const sessionMap = new Map(sessions.rows.map((row) => [row.session_id, row]));
    const camperIds = [...new Set(input.lines.map((line) => line.camper_id))];
    const campers = await client.query<CamperRow>(
      `SELECT id AS camper_id, first_name, last_name, birth_date::text, school_grade
       FROM campers WHERE organization_id = $1 AND family_id = $2
         AND id = ANY($3::uuid[]) AND archived_at IS NULL`,
      [organizationId, familyId, camperIds],
    );
    const camperMap = new Map(campers.rows.map((row) => [row.camper_id, row]));
    const nowResult = await client.query<{ now: Date }>('SELECT transaction_timestamp() AS now');
    const now = nowResult.rows[0]!.now;

    const usage = await client.query<{
      active_holds: number;
      active_offers: number;
      confirmed: number;
      session_id: string;
      waitlisted: number;
    }>(
      `SELECT s.id AS session_id,
        (SELECT count(*)::integer FROM registrations r
         WHERE r.organization_id = s.organization_id AND r.session_id = s.id
           AND r.status = 'CONFIRMED') AS confirmed,
        (SELECT count(*)::integer FROM waitlist_offers wo
         WHERE wo.organization_id = s.organization_id AND wo.session_id = s.id
           AND wo.status = 'PENDING' AND wo.expires_at > transaction_timestamp()) AS active_offers,
        (SELECT count(*)::integer FROM capacity_holds ch
         WHERE ch.organization_id = s.organization_id AND ch.session_id = s.id
           AND ch.status IN ('ACTIVE','EXPIRING')) AS active_holds,
        (SELECT count(*)::integer FROM registrations wr
         WHERE wr.organization_id = s.organization_id AND wr.session_id = s.id
           AND wr.status = 'WAITLISTED') AS waitlisted
       FROM sessions s WHERE s.organization_id = $1 AND s.id = ANY($2::uuid[])`,
      [organizationId, sessionIds],
    );
    const availableBySession = new Map(
      usage.rows.map((row) => [
        row.session_id,
        Math.max(
          (sessionMap.get(row.session_id)?.capacity ?? 0) -
            row.confirmed -
            row.active_offers -
            row.active_holds,
          0,
        ),
      ]),
    );
    const hasWaitlist = new Map(usage.rows.map((row) => [row.session_id, row.waitlisted > 0]));
    const duplicates = await client.query<{ camper_id: string; session_id: string }>(
      `SELECT camper_id, session_id FROM registrations
       WHERE organization_id = $1 AND family_id = $2
         AND camper_id = ANY($3::uuid[]) AND session_id = ANY($4::uuid[])
         AND status IN ('CONFIRMED','WAITLISTED')`,
      [organizationId, familyId, camperIds, sessionIds],
    );
    const duplicateSet = new Set(
      duplicates.rows.map((row) => `${row.camper_id}:${row.session_id}`),
    );
    const addOns = await client.query<AddOnRow>(
      `SELECT id, session_id, name, price_cents, required FROM session_add_ons
       WHERE organization_id = $1 AND session_id = ANY($2::uuid[]) AND active`,
      [organizationId, sessionIds],
    );
    const addOnsBySession = new Map<string, AddOnRow[]>();
    for (const row of addOns.rows) {
      addOnsBySession.set(row.session_id, [...(addOnsBySession.get(row.session_id) ?? []), row]);
    }

    const remainingBySession = new Map(availableBySession);
    const lines: OrderQuoteLineRecord[] = input.lines.map((inputLine) => {
      const session = sessionMap.get(inputLine.session_id);
      const camper = camperMap.get(inputLine.camper_id);
      const errors: string[] = [];
      if (!session) errors.push('Session was not found.');
      if (!camper) errors.push('Camper was not found in this family.');
      if (session && camper) {
        if (session.status !== 'PUBLISHED') errors.push('Session is not published.');
        if (
          now < new Date(session.registration_opens_at) ||
          now >= new Date(session.registration_closes_at)
        ) {
          errors.push('Registration is not open for this session.');
        }
        const ageDate =
          session.age_as_of === 'SEASON_START' ? `${session.season_year}-01-01` : session.starts_on;
        const age = ageOn(camper.birth_date, ageDate);
        if (age < session.minimum_age || age > session.maximum_age)
          errors.push('Camper is not age eligible.');
        const grade = normalizedGrade(camper.school_grade);
        if (grade === null || grade < session.minimum_grade || grade > session.maximum_grade) {
          errors.push('Camper is not grade eligible.');
        }
        if (duplicateSet.has(`${camper.camper_id}:${session.session_id}`)) {
          errors.push('Camper is already registered for this session.');
        }
      }
      const availableAddOns = session ? (addOnsBySession.get(session.session_id) ?? []) : [];
      const selectedIds = [...new Set(inputLine.add_on_ids ?? [])];
      const selected = availableAddOns.filter((addOn) => selectedIds.includes(addOn.id));
      if (selected.length !== selectedIds.length)
        errors.push('One or more add-ons are unavailable.');
      if (availableAddOns.some((addOn) => addOn.required && !selectedIds.includes(addOn.id))) {
        errors.push('Select every required add-on.');
      }
      const addOnTotal = selected.reduce((sum, addOn) => sum + addOn.price_cents, 0);
      let outcome: OrderQuoteLineRecord['outcome'] = errors.length ? 'INVALID' : 'AVAILABLE';
      if (!errors.length && session) {
        const remaining = remainingBySession.get(session.session_id) ?? 0;
        if (remaining <= 0 || hasWaitlist.get(session.session_id)) {
          outcome = session.waitlist_enabled ? 'WAITLIST' : 'INVALID';
          if (!session.waitlist_enabled) errors.push('Session is full and has no waitlist.');
        } else {
          remainingBySession.set(session.session_id, remaining - 1);
        }
      }
      const base = session?.price_cents ?? 0;
      return {
        add_on_ids: selected.map((addOn) => addOn.id),
        add_on_names: selected.map((addOn) => addOn.name),
        add_on_total_cents: addOnTotal,
        assistance_cents: 0,
        automatic_discount_cents: 0,
        base_price_cents: base,
        bunk_buddy_names: [
          ...new Set((inputLine.bunk_buddy_names ?? []).map((name) => name.trim()).filter(Boolean)),
        ].slice(0, 3),
        camper_id: inputLine.camper_id,
        camper_name: camper ? `${camper.first_name} ${camper.last_name}` : 'Unknown camper',
        coupon_discount_cents: 0,
        deposit_due_cents:
          outcome === 'AVAILABLE' ? Math.min(session?.deposit_cents ?? 0, base + addOnTotal) : 0,
        errors,
        gross_price_cents: base + addOnTotal,
        net_price_cents: base + addOnTotal,
        outcome,
        season_id: session?.season_id ?? '00000000-0000-0000-0000-000000000000',
        session_id: inputLine.session_id,
        session_name: session?.name ?? 'Unknown session',
      };
    });

    if (
      input.waitlist_mode === 'KEEP_TOGETHER' &&
      lines.some((line) => line.outcome === 'WAITLIST')
    ) {
      for (const line of lines) {
        if (line.outcome !== 'INVALID') {
          const session = sessionMap.get(line.session_id);
          if (!session?.waitlist_enabled) {
            line.outcome = 'INVALID';
            line.errors.push('Every session must support waitlisting to keep campers together.');
          } else {
            line.outcome = 'WAITLIST';
            line.deposit_due_cents = 0;
          }
        }
      }
    }

    const seasonIds = [...new Set(lines.map((line) => line.season_id))].filter(
      (id) => !id.startsWith('00000000'),
    );
    const rules = await client.query<DiscountRuleRow>(
      `SELECT id, season_id, name, rule_type, value_type, value,
              minimum_qualifying_lines, priority
       FROM discount_rules WHERE organization_id = $1 AND season_id = ANY($2::uuid[]) AND active`,
      [organizationId, seasonIds],
    );
    let selectedDiscount: OrderQuoteRecord['selectedDiscount'] = null;
    let bestAmounts = lines.map(() => 0);
    let bestTotal = 0;
    let bestPriority = Number.MAX_SAFE_INTEGER;
    for (const rule of rules.rows) {
      const eligible = new Set<number>();
      if (rule.rule_type === 'SIBLING') {
        const campersInSeason = [
          ...new Set(
            lines.filter((line) => line.season_id === rule.season_id).map((line) => line.camper_id),
          ),
        ].sort();
        if (campersInSeason.length >= rule.minimum_qualifying_lines) {
          const discountedCampers = new Set(campersInSeason.slice(1));
          lines.forEach((line, index) => {
            if (line.season_id === rule.season_id && discountedCampers.has(line.camper_id))
              eligible.add(index);
          });
        }
      } else {
        const byCamper = new Map<string, number[]>();
        lines.forEach((line, index) => {
          if (line.season_id === rule.season_id)
            byCamper.set(line.camper_id, [...(byCamper.get(line.camper_id) ?? []), index]);
        });
        for (const indexes of byCamper.values()) {
          if (indexes.length >= rule.minimum_qualifying_lines)
            indexes.slice(1).forEach((index) => eligible.add(index));
        }
      }
      const amounts = lines.map((line, index) =>
        eligible.has(index) ? discountAmount(line.base_price_cents, rule) : 0,
      );
      const total = amounts.reduce((sum, amount) => sum + amount, 0);
      if (total > bestTotal || (total === bestTotal && total > 0 && rule.priority < bestPriority)) {
        bestTotal = total;
        bestPriority = rule.priority;
        bestAmounts = amounts;
        selectedDiscount = { id: rule.id, name: rule.name };
      }
    }
    lines.forEach((line, index) => {
      line.automatic_discount_cents = bestAmounts[index] ?? 0;
      line.net_price_cents -= line.automatic_discount_cents;
    });

    let selectedCoupon: OrderQuoteRecord['selectedCoupon'] = null;
    if (input.coupon_code?.trim()) {
      const coupon = await client.query<CouponRow>(
        `SELECT c.id, c.code, c.season_id, c.value_type, c.value
         FROM coupons c
         WHERE c.organization_id = $1 AND c.code_normalized = upper(trim($2)) AND c.active
           AND (c.starts_at IS NULL OR c.starts_at <= transaction_timestamp())
           AND (c.ends_at IS NULL OR c.ends_at > transaction_timestamp())
           AND (c.maximum_redemptions IS NULL OR c.maximum_redemptions > (
             SELECT count(*) FROM coupon_redemptions cr
             WHERE cr.organization_id = c.organization_id AND cr.coupon_id = c.id
           ))
           AND NOT EXISTS (
             SELECT 1 FROM coupon_redemptions used
             WHERE used.organization_id = c.organization_id AND used.coupon_id = c.id
               AND used.family_id = $3
           )
         FOR UPDATE OF c`,
        [organizationId, input.coupon_code, familyId],
      );
      const current = coupon.rows[0];
      if (!current) {
        lines[0]?.errors.push('Coupon is invalid, expired, or already used.');
        if (lines[0]) lines[0].outcome = 'INVALID';
      } else {
        selectedCoupon = { id: current.id, code: current.code };
        const weights = lines.map((line) =>
          line.season_id === current.season_id
            ? Math.max(line.base_price_cents - line.automatic_discount_cents, 0)
            : 0,
        );
        const discount =
          current.value_type === 'FIXED'
            ? allocateFixed(current.value, weights)
            : weights.map((weight) => Math.floor((weight * current.value) / 10000));
        lines.forEach((line, index) => {
          line.coupon_discount_cents = Math.min(discount[index] ?? 0, line.net_price_cents);
          line.net_price_cents -= line.coupon_discount_cents;
        });
      }
    }

    const awards = await client.query<AwardRow>(
      `SELECT id, season_id, camper_id,
              (amount_cents - reserved_cents - consumed_cents)::integer AS available_cents
       FROM financial_assistance_awards
       WHERE organization_id = $1 AND family_id = $2 AND season_id = ANY($3::uuid[])
         AND status = 'ACTIVE' AND amount_cents > reserved_cents + consumed_cents
       ORDER BY camper_id NULLS LAST, created_at, id ${lock ? 'FOR UPDATE' : ''}`,
      [organizationId, familyId, seasonIds],
    );
    for (const award of awards.rows) {
      let remaining = award.available_cents;
      for (const line of lines) {
        if (
          remaining <= 0 ||
          line.outcome !== 'AVAILABLE' ||
          line.season_id !== award.season_id ||
          (award.camper_id && award.camper_id !== line.camper_id)
        )
          continue;
        const amount = Math.min(remaining, line.net_price_cents);
        line.assistance_cents += amount;
        line.net_price_cents -= amount;
        remaining -= amount;
      }
    }
    lines.forEach((line) => {
      const session = sessionMap.get(line.session_id);
      line.deposit_due_cents =
        line.outcome === 'AVAILABLE'
          ? Math.min(session?.deposit_cents ?? 0, line.net_price_cents)
          : 0;
    });

    let paymentPlan: PaymentPlanTemplateRecord | null = null;
    if (input.payment_plan_template_id) {
      const template = await client.query<{ id: string; season_id: string }>(
        `SELECT id, season_id FROM payment_plan_templates
         WHERE organization_id = $1 AND id = $2 AND active`,
        [organizationId, input.payment_plan_template_id],
      );
      const row = template.rows[0];
      if (!row || lines.some((line) => line.season_id !== row.season_id)) {
        lines[0]?.errors.push('Payment plan is unavailable for one or more sessions.');
        if (lines[0]) lines[0].outcome = 'INVALID';
      } else {
        const schedule = await client.query<{
          due_on: string;
          percentage_basis_points: number;
          sequence: number;
        }>(
          `SELECT sequence, due_on::text, percentage_basis_points
           FROM payment_plan_template_installments
           WHERE organization_id = $1 AND template_id = $2 ORDER BY sequence`,
          [organizationId, row.id],
        );
        const sum = schedule.rows.reduce((total, item) => total + item.percentage_basis_points, 0);
        if (
          schedule.rows.length < 2 ||
          schedule.rows.length > 6 ||
          sum !== 10000 ||
          schedule.rows.some((item) => new Date(`${item.due_on}T00:00:00Z`) <= now)
        ) {
          lines[0]?.errors.push('Payment plan schedule is no longer available.');
          if (lines[0]) lines[0].outcome = 'INVALID';
        } else {
          paymentPlan = { id: row.id, installments: schedule.rows, season_id: row.season_id };
        }
      }
    }

    return {
      currency: 'USD',
      lines,
      paymentPlan,
      selectedCoupon,
      selectedDiscount,
      totals: totals(lines),
      valid: lines.every((line) => line.errors.length === 0 && line.outcome !== 'INVALID'),
    };
  }

  private async insertAdjustments(
    client: PoolClient,
    organizationId: string,
    orderId: string,
    lineId: string,
    line: OrderQuoteLineRecord,
    quote: OrderQuoteRecord,
  ): Promise<void> {
    const adjustments: Array<[OrderAdjustmentRecord['type'], string | null, string, number]> = [
      [
        'AUTOMATIC_DISCOUNT',
        quote.selectedDiscount?.id ?? null,
        quote.selectedDiscount?.name ?? 'Automatic discount',
        line.automatic_discount_cents,
      ],
      [
        'COUPON',
        quote.selectedCoupon?.id ?? null,
        quote.selectedCoupon ? `Coupon ${quote.selectedCoupon.code}` : 'Coupon',
        line.coupon_discount_cents,
      ],
      ['ASSISTANCE', null, 'Financial assistance', line.assistance_cents],
    ];
    for (const [type, sourceId, label, amount] of adjustments) {
      if (amount <= 0) continue;
      await client.query(
        `INSERT INTO order_adjustments (
           id, organization_id, order_id, order_line_id, adjustment_type, source_id, label, amount_cents
         ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8)`,
        [randomUUID(), organizationId, orderId, lineId, type, sourceId, label, amount],
      );
    }
  }

  private async confirmNoPaymentOrder(
    client: PoolClient,
    context: FamilyWriteContext,
    orderId: string,
    familyId: string,
  ): Promise<void> {
    const lines = await client.query<{
      assistance_cents: number;
      automatic_discount_cents: number;
      camper_id: string;
      coupon_discount_cents: number;
      deposit_due_cents: number;
      gross_price_cents: number;
      bunk_buddy_names: string[];
      id: string;
      session_id: string;
    }>(
      `SELECT id, camper_id, session_id, gross_price_cents, deposit_due_cents, bunk_buddy_names,
              automatic_discount_cents, coupon_discount_cents, assistance_cents
       FROM household_order_lines
       WHERE organization_id=$1 AND order_id=$2 AND outcome='HELD'
       ORDER BY id FOR UPDATE`,
      [context.organizationId, orderId],
    );
    for (const line of lines.rows) {
      const registrationId = randomUUID();
      await client.query(
        `INSERT INTO registrations (
           id, organization_id, session_id, family_id, camper_id, status, source,
           currency, price_cents, deposit_cents, order_id, order_line_id, bunk_buddy_names
         ) VALUES ($1,$2,$3,$4,$5,'CONFIRMED','PARENT','USD',$6,$7,$8,$9,$10)`,
        [
          registrationId,
          context.organizationId,
          line.session_id,
          familyId,
          line.camper_id,
          line.gross_price_cents,
          line.deposit_due_cents,
          orderId,
          line.id,
          line.bunk_buddy_names,
        ],
      );
      await client.query(
        `UPDATE household_order_lines SET registration_id=$3, outcome='CONFIRMED',
           updated_at=transaction_timestamp() WHERE organization_id=$1 AND id=$2`,
        [context.organizationId, line.id, registrationId],
      );
      await this.insertCredits(
        client,
        context.organizationId,
        familyId,
        registrationId,
        {
          automatic_discount_cents: line.automatic_discount_cents,
          coupon_discount_cents: line.coupon_discount_cents,
          assistance_cents: line.assistance_cents,
        } as OrderQuoteLineRecord,
        context.actorId,
      );
    }
    await client.query(
      `UPDATE capacity_holds SET status='CONSUMED', updated_at=transaction_timestamp()
       WHERE organization_id=$1 AND order_id=$2`,
      [context.organizationId, orderId],
    );
    const allocations = await client.query<{ amount_cents: number; award_id: string }>(
      `UPDATE assistance_award_allocations SET status='CONSUMED', updated_at=transaction_timestamp()
       WHERE organization_id=$1 AND order_id=$2 AND status='RESERVED'
       RETURNING award_id, amount_cents`,
      [context.organizationId, orderId],
    );
    for (const allocation of allocations.rows) {
      await client.query(
        `UPDATE financial_assistance_awards
         SET reserved_cents=reserved_cents-$3, consumed_cents=consumed_cents+$3,
             status=CASE WHEN consumed_cents+$3>=amount_cents THEN 'EXHAUSTED' ELSE status END,
             updated_at=transaction_timestamp()
         WHERE organization_id=$1 AND id=$2`,
        [context.organizationId, allocation.award_id, allocation.amount_cents],
      );
    }
  }

  private async insertCredits(
    client: PoolClient,
    organizationId: string,
    familyId: string,
    registrationId: string,
    line: OrderQuoteLineRecord,
    actorId: string,
  ): Promise<void> {
    for (const [method, amount, note] of [
      ['DISCOUNT', line.automatic_discount_cents + line.coupon_discount_cents, 'Order discounts'],
      ['SCHOLARSHIP', line.assistance_cents, 'Financial assistance award'],
    ] as const) {
      if (amount <= 0) continue;
      await client.query(
        `INSERT INTO registration_payments (
           id, organization_id, family_id, registration_id, amount_cents,
           method, note, recorded_by
         ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8)`,
        [randomUUID(), organizationId, familyId, registrationId, amount, method, note, actorId],
      );
    }
  }

  private async reserveAssistance(
    client: PoolClient,
    organizationId: string,
    orderId: string,
    lines: OrderQuoteLineRecord[],
  ): Promise<void> {
    for (const line of lines) {
      if (line.assistance_cents <= 0 || line.outcome !== 'AVAILABLE') continue;
      const lineResult = await client.query<{ id: string }>(
        `SELECT id FROM household_order_lines
         WHERE organization_id = $1 AND order_id = $2 AND camper_id = $3 AND session_id = $4`,
        [organizationId, orderId, line.camper_id, line.session_id],
      );
      let remaining = line.assistance_cents;
      const awards = await client.query<AwardRow>(
        `SELECT id, season_id, camper_id,
                (amount_cents - reserved_cents - consumed_cents)::integer AS available_cents
         FROM financial_assistance_awards
         WHERE organization_id = $1 AND family_id = (
           SELECT family_id FROM household_orders WHERE organization_id = $1 AND id = $2
         ) AND season_id = $3 AND status = 'ACTIVE'
           AND (camper_id IS NULL OR camper_id = $4)
           AND amount_cents > reserved_cents + consumed_cents
         ORDER BY camper_id NULLS LAST, created_at, id FOR UPDATE`,
        [organizationId, orderId, line.season_id, line.camper_id],
      );
      for (const award of awards.rows) {
        if (remaining <= 0) break;
        const amount = Math.min(remaining, award.available_cents);
        await client.query(
          `INSERT INTO assistance_award_allocations (
             id, organization_id, award_id, order_id, order_line_id, amount_cents, status
           ) VALUES ($1,$2,$3,$4,$5,$6,'RESERVED')`,
          [randomUUID(), organizationId, award.id, orderId, lineResult.rows[0]!.id, amount],
        );
        await client.query(
          `UPDATE financial_assistance_awards
           SET reserved_cents = reserved_cents + $3, updated_at = transaction_timestamp()
           WHERE organization_id = $1 AND id = $2`,
          [organizationId, award.id, amount],
        );
        remaining -= amount;
      }
    }
  }

  private async insertInstallments(
    client: PoolClient,
    organizationId: string,
    familyId: string,
    orderId: string,
    template: PaymentPlanTemplateRecord,
    balance: number,
  ): Promise<void> {
    if (balance <= 0) return;
    let allocated = 0;
    for (let index = 0; index < template.installments.length; index += 1) {
      const item = template.installments[index]!;
      const amount =
        index === template.installments.length - 1
          ? balance - allocated
          : Math.floor((balance * item.percentage_basis_points) / 10000);
      if (amount <= 0) continue;
      allocated += amount;
      await client.query(
        `INSERT INTO order_installments (
           id, organization_id, order_id, family_id, sequence, due_on, amount_cents
         ) VALUES ($1,$2,$3,$4,$5,$6,$7)`,
        [randomUUID(), organizationId, orderId, familyId, item.sequence, item.due_on, amount],
      );
    }
  }

  private async getOrderInTenant(
    client: PoolClient,
    organizationId: string,
    orderId: string,
  ): Promise<HouseholdOrderRecord> {
    const order = await client.query<{
      assistance_cents: number;
      automatic_discount_cents: number;
      coupon_code: string | null;
      coupon_discount_cents: number;
      created_at: Date | string;
      deposit_due_cents: number;
      family_id: string;
      family_name: string;
      gross_total_cents: number;
      id: string;
      net_total_cents: number;
      status: OrderStatus;
      waitlist_mode: OrderWaitlistMode;
    }>(
      `SELECT o.*, f.family_name FROM household_orders o
       JOIN families f ON f.organization_id = o.organization_id AND f.id = o.family_id
       WHERE o.organization_id = $1 AND o.id = $2`,
      [organizationId, orderId],
    );
    const row = order.rows[0];
    if (!row) throw new OrderNotFoundError('Order not found');
    const lines = await client.query<{
      add_on_names: string[];
      add_on_total_cents: number;
      assistance_cents: number;
      automatic_discount_cents: number;
      camper_id: string;
      camper_name: string;
      bunk_buddy_names: string[];
      coupon_discount_cents: number;
      deposit_due_cents: number;
      gross_price_cents: number;
      hold_expires_at: Date | string | null;
      id: string;
      net_price_cents: number;
      outcome: OrderLineOutcome;
      registration_id: string | null;
      session_id: string;
      session_name: string;
    }>(
      `SELECT l.id, l.camper_id, l.session_id, l.registration_id, l.outcome,
              l.camper_name, l.session_name, l.bunk_buddy_names, l.add_on_total_cents, l.gross_price_cents,
              l.automatic_discount_cents, l.coupon_discount_cents, l.assistance_cents,
              l.net_price_cents, l.deposit_due_cents, h.expires_at AS hold_expires_at,
              COALESCE((SELECT array_agg(a.name ORDER BY a.name, a.id)
                        FROM order_line_add_ons a
                        WHERE a.organization_id = l.organization_id AND a.order_line_id = l.id),
                       ARRAY[]::text[]) AS add_on_names
       FROM household_order_lines l
       LEFT JOIN capacity_holds h
         ON h.organization_id = l.organization_id AND h.order_line_id = l.id
       WHERE l.organization_id = $1 AND l.order_id = $2
       ORDER BY l.created_at, l.id`,
      [organizationId, orderId],
    );
    const adjustments = await client.query<{
      adjustment_type: OrderAdjustmentRecord['type'];
      amount_cents: number;
      label: string;
      order_line_id: string;
    }>(
      `SELECT order_line_id, adjustment_type, label, amount_cents
       FROM order_adjustments WHERE organization_id = $1 AND order_id = $2
       ORDER BY created_at, id`,
      [organizationId, orderId],
    );
    const installments = await client.query<{
      amount_cents: number;
      due_on: string;
      id: string;
      paid_at: Date | string | null;
      sequence: number;
      status: OrderInstallmentRecord['status'];
    }>(
      `SELECT id, sequence, due_on::text, amount_cents,
              CASE
                WHEN status = 'PAID' THEN 'PAID'
                WHEN due_on < current_date THEN 'OVERDUE'
                WHEN due_on = current_date THEN 'DUE'
                ELSE 'SCHEDULED'
              END AS status,
              paid_at
       FROM order_installments WHERE organization_id = $1 AND order_id = $2
       ORDER BY sequence`,
      [organizationId, orderId],
    );
    return {
      coupon_code: row.coupon_code,
      created_at: iso(row.created_at),
      currency: 'USD',
      family_id: row.family_id,
      family_name: row.family_name,
      id: row.id,
      installments: installments.rows.map((item) => ({
        ...item,
        paid_at: item.paid_at ? iso(item.paid_at) : null,
      })),
      lines: lines.rows.map((line) => ({
        ...line,
        adjustments: adjustments.rows
          .filter((item) => item.order_line_id === line.id)
          .map((item) => ({
            amount_cents: item.amount_cents,
            label: item.label,
            type: item.adjustment_type,
          })),
        hold_expires_at: line.hold_expires_at ? iso(line.hold_expires_at) : null,
      })),
      payment_required: row.status === 'PAYMENT_PENDING' && row.deposit_due_cents > 0,
      status: row.status,
      totals: {
        assistance_cents: row.assistance_cents,
        automatic_discount_cents: row.automatic_discount_cents,
        coupon_discount_cents: row.coupon_discount_cents,
        deposit_due_cents: row.deposit_due_cents,
        gross_total_cents: row.gross_total_cents,
        net_total_cents: row.net_total_cents,
      },
      waitlist_mode: row.waitlist_mode,
    };
  }

  private async insertAudit(
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
