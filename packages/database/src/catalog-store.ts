import { randomUUID } from 'node:crypto';

import type { PoolClient } from 'pg';

import type { DatabaseClient } from './client.js';

export type SessionStatus = 'DRAFT' | 'PUBLISHED' | 'CANCELLED' | 'ARCHIVED';
export type AgeAsOf = 'SESSION_START' | 'SEASON_START';
export type CatalogRegistrationStatus = 'CONFIRMED' | 'WAITLISTED' | 'CANCELLED';
export type CatalogRegistrationSource = 'ADMIN' | 'PARENT';
export type CatalogPaymentStatus = 'NOT_DUE' | 'DEPOSIT_DUE' | 'PARTIAL' | 'PAID';
export type CatalogAttendanceStatus = 'NOT_MARKED' | 'CHECKED_IN' | 'CHECKED_OUT' | 'ABSENT';
export type CatalogAttendanceAction = 'CHECK_IN' | 'CHECK_OUT' | 'MARK_ABSENT';
export type CatalogWaitlistOfferStatus =
  | 'PENDING'
  | 'ACCEPTED'
  | 'DECLINED'
  | 'EXPIRED'
  | 'CANCELLED';

export interface CatalogWaitlistOfferRecord {
  id: string;
  family_id: string;
  registration_id: string;
  session_id: string;
  status: CatalogWaitlistOfferStatus;
  offered_at: string;
  expires_at: string;
  responded_at: string | null;
}

export interface CatalogContextRecord {
  organization: { id: string; slug: string; name: string; timezone: string };
  seasons: Array<{ id: string; organization_id: string; name: string; year: number }>;
  programs: Array<{
    id: string;
    organization_id: string;
    code: string;
    name: string;
    delivery_mode: 'DAY' | 'OVERNIGHT';
    description: string;
    default_capacity: number;
    default_minimum_age: number;
    default_maximum_age: number;
    default_minimum_grade: number;
    default_maximum_grade: number;
    default_age_as_of: AgeAsOf;
    default_price_cents: number;
    default_deposit_cents: number;
    default_waitlist_enabled: boolean;
  }>;
}

export interface SessionSummaryRecord {
  id: string;
  organization_id: string;
  season_id: string;
  program_id: string;
  code: string;
  name: string;
  program_name: string;
  starts_on: string;
  ends_on: string;
  capacity: number;
  registered_count: number;
  registered_female_count: number;
  registered_male_count: number;
  waitlisted_count: number;
  waitlisted_female_count: number;
  waitlisted_male_count: number;
  active_hold_count: number;
  available_count: number;
  currency: 'USD';
  price_cents: number;
  status: SessionStatus;
  version: number;
  updated_at: string;
}

export interface SessionDetailRecord extends SessionSummaryRecord {
  registration_opens_at: string;
  registration_closes_at: string;
  minimum_age: number;
  maximum_age: number;
  minimum_grade: number;
  maximum_grade: number;
  age_as_of: AgeAsOf;
  deposit_cents: number;
  waitlist_enabled: boolean;
  organization_timezone: string;
  registered_campers: RegisteredCamperRecord[];
}

export interface RegisteredCamperRecord {
  amount_paid_cents: number;
  attendance_date: string | null;
  attendance_note: string | null;
  attendance_status: CatalogAttendanceStatus;
  authorized_pickup_names: string[];
  balance_due_cents: number;
  registration_id: string;
  camper_id: string;
  family_id: string;
  family_name: string;
  first_name: string;
  last_name: string;
  birth_date: string;
  preferred_name: string | null;
  gender: 'Female' | 'Male' | null;
  school_grade: string | null;
  status: CatalogRegistrationStatus;
  source: CatalogRegistrationSource;
  currency: 'USD';
  deposit_cents: number;
  deposit_due_cents: number;
  checked_in_at: string | null;
  checked_out_at: string | null;
  payment_status: CatalogPaymentStatus;
  pickup_name: string | null;
  price_cents: number;
  registered_at: string;
  waitlist_offer: CatalogWaitlistOfferRecord | null;
}

export interface UpdateSessionRecord {
  version: number;
  season_id: string;
  program_id: string;
  name: string;
  starts_on: string;
  ends_on: string;
  registration_opens_at: string;
  registration_closes_at: string;
  capacity: number;
  minimum_age: number;
  maximum_age: number;
  age_as_of: AgeAsOf;
  price_cents: number;
  deposit_cents: number;
  waitlist_enabled: boolean;
  status: SessionStatus;
}

export interface CreateSessionRecord {
  id: string;
  season_id: string;
  program_id: string;
  code: string;
  name: string;
  starts_on: string;
  ends_on: string;
  registration_opens_at: string;
  registration_closes_at: string;
  status: SessionStatus;
}

export interface CreateProgramRecord {
  id: string;
  code: string;
  name: string;
  delivery_mode: 'DAY' | 'OVERNIGHT';
  description: string;
  default_capacity: number;
  default_minimum_age: number;
  default_maximum_age: number;
  default_minimum_grade: number;
  default_maximum_grade: number;
  default_age_as_of: AgeAsOf;
  default_price_cents: number;
  default_deposit_cents: number;
  default_waitlist_enabled: boolean;
}

export interface UpdateProgramRecord {
  name: string;
  delivery_mode: 'DAY' | 'OVERNIGHT';
  description: string;
  default_capacity: number;
  default_minimum_age: number;
  default_maximum_age: number;
  default_minimum_grade: number;
  default_maximum_grade: number;
  default_age_as_of: AgeAsOf;
  default_price_cents: number;
  default_deposit_cents: number;
  default_waitlist_enabled: boolean;
}

export interface CreateSeasonRecord {
  id: string;
  name: string;
  year: number;
}

export interface CreateCatalogContext {
  actorId: string;
  organizationId: string;
  requestId: string;
}

export interface UpdateSessionContext {
  actorId: string;
  organizationId: string;
  requestId: string;
  sessionId: string;
  update: UpdateSessionRecord;
}

export interface SessionAttendanceUpdateRecord {
  action: CatalogAttendanceAction;
  attendance_date: string;
  note: string | null;
  pickup_name: string | null;
}

export interface UpdateSessionAttendanceContext {
  actorId: string;
  organizationId: string;
  registrationId: string;
  requestId: string;
  sessionId: string;
  update: SessionAttendanceUpdateRecord;
}

export interface UpdateProgramContext {
  actorId: string;
  organizationId: string;
  programId: string;
  requestId: string;
  update: UpdateProgramRecord;
}

export class CatalogNotFoundError extends Error {}
export class CatalogConflictError extends Error {}
export class CatalogReferenceError extends Error {}
export class CatalogCapacityError extends Error {}
export class CatalogDuplicateError extends Error {}

interface SessionRow {
  id: string;
  organization_id: string;
  season_id: string;
  program_id: string;
  code: string;
  name: string;
  program_name: string;
  starts_on: string;
  ends_on: string;
  registration_opens_at: Date | string;
  registration_closes_at: Date | string;
  capacity: number;
  minimum_age: number;
  maximum_age: number;
  minimum_grade: number;
  maximum_grade: number;
  age_as_of: AgeAsOf;
  currency: 'USD';
  price_cents: number;
  deposit_cents: number;
  waitlist_enabled: boolean;
  status: SessionStatus;
  version: number;
  updated_at: Date | string;
  registered_count: number;
  registered_female_count: number;
  registered_male_count: number;
  waitlisted_count: number;
  waitlisted_female_count: number;
  waitlisted_male_count: number;
  active_hold_count: number;
  available_count: number;
  organization_timezone: string;
}

type RegisteredCamperRow = Omit<
  RegisteredCamperRecord,
  'attendance_date' | 'checked_in_at' | 'checked_out_at' | 'registered_at' | 'waitlist_offer'
> & {
  attendance_date: string | null;
  checked_in_at: Date | string | null;
  checked_out_at: Date | string | null;
  registered_at: Date | string;
  offer_expires_at: Date | string | null;
  offer_family_id: string | null;
  offer_id: string | null;
  offer_offered_at: Date | string | null;
  offer_registration_id: string | null;
  offer_responded_at: Date | string | null;
  offer_session_id: string | null;
  offer_status: CatalogWaitlistOfferStatus | null;
};

const sessionSelect = `
  SELECT
    s.id,
    s.organization_id,
    s.season_id,
    s.program_id,
    s.code,
    s.name,
    p.name AS program_name,
    s.starts_on::text,
    s.ends_on::text,
    s.registration_opens_at,
    s.registration_closes_at,
    s.capacity,
    s.minimum_age,
    s.maximum_age,
    p.default_minimum_grade AS minimum_grade,
    p.default_maximum_grade AS maximum_grade,
    s.age_as_of,
    s.currency,
    s.price_cents,
    s.deposit_cents,
    s.waitlist_enabled,
    s.status,
    s.version,
    s.updated_at,
    COALESCE(registration_counts.registered_count, 0)::integer AS registered_count,
    COALESCE(registration_counts.registered_female_count, 0)::integer AS registered_female_count,
    COALESCE(registration_counts.registered_male_count, 0)::integer AS registered_male_count,
    COALESCE(registration_counts.waitlisted_count, 0)::integer AS waitlisted_count,
    COALESCE(registration_counts.waitlisted_female_count, 0)::integer AS waitlisted_female_count,
    COALESCE(registration_counts.waitlisted_male_count, 0)::integer AS waitlisted_male_count,
    COALESCE(active_offers.active_hold_count, 0)::integer AS active_hold_count,
    GREATEST(
      s.capacity
        - COALESCE(registration_counts.registered_count, 0)
        - COALESCE(active_offers.active_hold_count, 0),
      0
    )::integer
      AS available_count,
    o.timezone AS organization_timezone
  FROM sessions s
  JOIN programs p
    ON p.organization_id = s.organization_id
   AND p.id = s.program_id
  JOIN organizations o ON o.id = s.organization_id
  LEFT JOIN LATERAL (
    SELECT
      count(*) FILTER (WHERE r.status = 'CONFIRMED')::integer AS registered_count,
      count(*) FILTER (WHERE r.status = 'CONFIRMED' AND c.gender = 'Female')::integer
        AS registered_female_count,
      count(*) FILTER (WHERE r.status = 'CONFIRMED' AND c.gender = 'Male')::integer
        AS registered_male_count,
      count(*) FILTER (
        WHERE r.status = 'WAITLISTED'
          AND NOT EXISTS (
            SELECT 1 FROM waitlist_offers expired_offer
            WHERE expired_offer.organization_id = r.organization_id
              AND expired_offer.registration_id = r.id
              AND expired_offer.status = 'PENDING'
              AND expired_offer.expires_at <= transaction_timestamp()
          )
      )::integer AS waitlisted_count,
      count(*) FILTER (
        WHERE r.status = 'WAITLISTED'
          AND c.gender = 'Female'
          AND NOT EXISTS (
            SELECT 1 FROM waitlist_offers expired_offer
            WHERE expired_offer.organization_id = r.organization_id
              AND expired_offer.registration_id = r.id
              AND expired_offer.status = 'PENDING'
              AND expired_offer.expires_at <= transaction_timestamp()
          )
      )::integer
        AS waitlisted_female_count,
      count(*) FILTER (
        WHERE r.status = 'WAITLISTED'
          AND c.gender = 'Male'
          AND NOT EXISTS (
            SELECT 1 FROM waitlist_offers expired_offer
            WHERE expired_offer.organization_id = r.organization_id
              AND expired_offer.registration_id = r.id
              AND expired_offer.status = 'PENDING'
              AND expired_offer.expires_at <= transaction_timestamp()
          )
      )::integer
        AS waitlisted_male_count
    FROM registrations r
    LEFT JOIN campers c
      ON c.organization_id = r.organization_id
     AND c.family_id = r.family_id
     AND c.id = r.camper_id
    WHERE r.organization_id = s.organization_id
      AND r.session_id = s.id
  ) registration_counts ON true
  LEFT JOIN LATERAL (
    SELECT count(*)::integer AS active_hold_count
    FROM waitlist_offers wo
    WHERE wo.organization_id = s.organization_id
      AND wo.session_id = s.id
      AND wo.status = 'PENDING'
      AND wo.expires_at > transaction_timestamp()
  ) active_offers ON true
`;

function timestamp(value: Date | string): string {
  return value instanceof Date ? value.toISOString().replace('.000Z', 'Z') : value;
}

function mapSession(
  row: SessionRow,
  registeredCampers: RegisteredCamperRecord[] = [],
): SessionDetailRecord {
  return {
    ...row,
    registered_campers: registeredCampers,
    registration_opens_at: timestamp(row.registration_opens_at),
    registration_closes_at: timestamp(row.registration_closes_at),
    updated_at: timestamp(row.updated_at),
  };
}

function toSummary(session: SessionDetailRecord): SessionSummaryRecord {
  return {
    active_hold_count: session.active_hold_count,
    available_count: session.available_count,
    capacity: session.capacity,
    code: session.code,
    currency: session.currency,
    ends_on: session.ends_on,
    id: session.id,
    name: session.name,
    organization_id: session.organization_id,
    price_cents: session.price_cents,
    program_id: session.program_id,
    program_name: session.program_name,
    registered_count: session.registered_count,
    registered_female_count: session.registered_female_count,
    registered_male_count: session.registered_male_count,
    season_id: session.season_id,
    starts_on: session.starts_on,
    status: session.status,
    updated_at: session.updated_at,
    version: session.version,
    waitlisted_count: session.waitlisted_count,
    waitlisted_female_count: session.waitlisted_female_count,
    waitlisted_male_count: session.waitlisted_male_count,
  };
}

function mapRegisteredCamper(row: RegisteredCamperRow): RegisteredCamperRecord {
  return {
    ...row,
    attendance_date: row.attendance_date,
    authorized_pickup_names: row.authorized_pickup_names ?? [],
    checked_in_at: row.checked_in_at ? timestamp(row.checked_in_at) : null,
    checked_out_at: row.checked_out_at ? timestamp(row.checked_out_at) : null,
    registered_at: timestamp(row.registered_at),
    waitlist_offer:
      row.offer_id &&
      row.offer_family_id &&
      row.offer_registration_id &&
      row.offer_session_id &&
      row.offer_status &&
      row.offer_offered_at &&
      row.offer_expires_at
        ? {
            expires_at: timestamp(row.offer_expires_at),
            family_id: row.offer_family_id,
            id: row.offer_id,
            offered_at: timestamp(row.offer_offered_at),
            registration_id: row.offer_registration_id,
            responded_at: row.offer_responded_at ? timestamp(row.offer_responded_at) : null,
            session_id: row.offer_session_id,
            status: row.offer_status,
          }
        : null,
  };
}

export class CatalogStore {
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

  async getContext(organizationId: string): Promise<CatalogContextRecord> {
    return this.withTenant(organizationId, async (client) => {
      const organization = await client.query<CatalogContextRecord['organization']>(
        'SELECT id, slug, name, timezone FROM organizations WHERE id = $1',
        [organizationId],
      );
      if (!organization.rows[0]) {
        throw new CatalogNotFoundError('Organization not found');
      }

      const seasons = await client.query<CatalogContextRecord['seasons'][number]>(
        `SELECT id, organization_id, name, year
         FROM seasons
         WHERE organization_id = $1
         ORDER BY year DESC, name, id`,
        [organizationId],
      );
      const programs = await client.query<CatalogContextRecord['programs'][number]>(
        `SELECT
           id,
           organization_id,
           code,
           name,
           delivery_mode,
           description,
           default_capacity,
           default_minimum_age,
           default_maximum_age,
           default_minimum_grade,
           default_maximum_grade,
           default_age_as_of,
           default_price_cents,
           default_deposit_cents,
           default_waitlist_enabled
         FROM programs
         WHERE organization_id = $1
         ORDER BY name, id`,
        [organizationId],
      );

      return {
        organization: organization.rows[0],
        seasons: seasons.rows,
        programs: programs.rows,
      };
    });
  }

  async listSessions(organizationId: string): Promise<SessionSummaryRecord[]> {
    return this.withTenant(organizationId, async (client) => {
      const result = await client.query<SessionRow>(
        `${sessionSelect}
         WHERE s.organization_id = $1
         ORDER BY s.starts_on, s.code, s.id`,
        [organizationId],
      );
      return result.rows.map((row) => mapSession(row)).map(toSummary);
    });
  }

  private async getSessionForClient(
    client: PoolClient,
    organizationId: string,
    sessionId: string,
    attendanceDate?: string,
  ): Promise<SessionDetailRecord | null> {
    const result = await client.query<SessionRow>(
      `${sessionSelect}
       WHERE s.organization_id = $1 AND s.id = $2`,
      [organizationId, sessionId],
    );
    const session = result.rows[0];
    if (!session) return null;
    const registeredCampers = await this.listRegisteredCampers(
      client,
      organizationId,
      sessionId,
      attendanceDate,
    );
    return mapSession(session, registeredCampers);
  }

  async getSession(organizationId: string, sessionId: string): Promise<SessionDetailRecord | null> {
    return this.withTenant(organizationId, async (client) => {
      return this.getSessionForClient(client, organizationId, sessionId);
    });
  }

  async createProgram(
    context: CreateCatalogContext,
    program: CreateProgramRecord,
  ): Promise<CatalogContextRecord['programs'][number]> {
    return this.withTenant(context.organizationId, async (client) => {
      try {
        const result = await client.query<CatalogContextRecord['programs'][number]>(
          `INSERT INTO programs (
             id,
             organization_id,
             code,
             name,
             delivery_mode,
             description,
             default_capacity,
             default_minimum_age,
             default_maximum_age,
             default_minimum_grade,
             default_maximum_grade,
             default_age_as_of,
             default_price_cents,
             default_deposit_cents,
             default_waitlist_enabled
           ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15)
           RETURNING
             id,
             organization_id,
             code,
             name,
             delivery_mode,
             description,
             default_capacity,
             default_minimum_age,
             default_maximum_age,
             default_minimum_grade,
             default_maximum_grade,
             default_age_as_of,
             default_price_cents,
             default_deposit_cents,
             default_waitlist_enabled`,
          [
            program.id,
            context.organizationId,
            program.code,
            program.name,
            program.delivery_mode,
            program.description,
            program.default_capacity,
            program.default_minimum_age,
            program.default_maximum_age,
            program.default_minimum_grade,
            program.default_maximum_grade,
            program.default_age_as_of,
            program.default_price_cents,
            program.default_deposit_cents,
            program.default_waitlist_enabled,
          ],
        );

        await client.query(
          `INSERT INTO audit_events (
             organization_id, actor_id, action, target_type, target_id, outcome,
             request_id, details
           ) VALUES ($1, $2, 'program.created', 'program', $3, 'success', $4, $5::jsonb)`,
          [
            context.organizationId,
            context.actorId,
            program.id,
            context.requestId,
            JSON.stringify({ code: program.code }),
          ],
        );
        return result.rows[0]!;
      } catch (error) {
        if ((error as { code?: string }).code === '23505') {
          throw new CatalogDuplicateError('A program with this code already exists');
        }
        throw error;
      }
    });
  }

  async updateProgram(
    context: UpdateProgramContext,
  ): Promise<CatalogContextRecord['programs'][number]> {
    return this.withTenant(context.organizationId, async (client) => {
      const currentResult = await client.query<CatalogContextRecord['programs'][number]>(
        `SELECT
           id,
           organization_id,
           code,
           name,
           delivery_mode,
           description,
           default_capacity,
           default_minimum_age,
           default_maximum_age,
           default_minimum_grade,
           default_maximum_grade,
           default_age_as_of,
           default_price_cents,
           default_deposit_cents,
           default_waitlist_enabled
         FROM programs
         WHERE organization_id = $1 AND id = $2
         FOR UPDATE`,
        [context.organizationId, context.programId],
      );
      const current = currentResult.rows[0];
      if (!current) {
        throw new CatalogNotFoundError('Program not found');
      }

      const editableFields = [
        'name',
        'delivery_mode',
        'description',
        'default_capacity',
        'default_minimum_age',
        'default_maximum_age',
        'default_minimum_grade',
        'default_maximum_grade',
        'default_age_as_of',
        'default_price_cents',
        'default_deposit_cents',
        'default_waitlist_enabled',
      ] as const;
      const changedFields = editableFields.filter(
        (field) => current[field] !== context.update[field],
      );

      const result = await client.query<CatalogContextRecord['programs'][number]>(
        `UPDATE programs
         SET name = $3,
             delivery_mode = $4,
             description = $5,
             default_capacity = $6,
             default_minimum_age = $7,
             default_maximum_age = $8,
             default_minimum_grade = $9,
             default_maximum_grade = $10,
             default_age_as_of = $11,
             default_price_cents = $12,
             default_deposit_cents = $13,
             default_waitlist_enabled = $14,
             updated_at = transaction_timestamp()
         WHERE organization_id = $1 AND id = $2
         RETURNING
           id,
           organization_id,
           code,
           name,
           delivery_mode,
           description,
           default_capacity,
           default_minimum_age,
           default_maximum_age,
           default_minimum_grade,
           default_maximum_grade,
           default_age_as_of,
           default_price_cents,
           default_deposit_cents,
           default_waitlist_enabled`,
        [
          context.organizationId,
          context.programId,
          context.update.name,
          context.update.delivery_mode,
          context.update.description,
          context.update.default_capacity,
          context.update.default_minimum_age,
          context.update.default_maximum_age,
          context.update.default_minimum_grade,
          context.update.default_maximum_grade,
          context.update.default_age_as_of,
          context.update.default_price_cents,
          context.update.default_deposit_cents,
          context.update.default_waitlist_enabled,
        ],
      );

      await client.query(
        `INSERT INTO audit_events (
           organization_id, actor_id, action, target_type, target_id, outcome,
           request_id, details
         ) VALUES ($1, $2, 'program.updated', 'program', $3, 'success', $4, $5::jsonb)`,
        [
          context.organizationId,
          context.actorId,
          context.programId,
          context.requestId,
          JSON.stringify({ changed_fields: changedFields }),
        ],
      );

      const updated = result.rows[0];
      if (!updated) {
        throw new CatalogNotFoundError('Updated program not found');
      }
      return updated;
    });
  }

  async createSeason(
    context: CreateCatalogContext,
    season: CreateSeasonRecord,
  ): Promise<CatalogContextRecord['seasons'][number]> {
    return this.withTenant(context.organizationId, async (client) => {
      try {
        const result = await client.query<CatalogContextRecord['seasons'][number]>(
          `INSERT INTO seasons (
             id, organization_id, name, year
           ) VALUES ($1, $2, $3, $4)
           RETURNING id, organization_id, name, year`,
          [season.id, context.organizationId, season.name, season.year],
        );

        await client.query(
          `INSERT INTO audit_events (
             organization_id, actor_id, action, target_type, target_id, outcome,
             request_id, details
           ) VALUES ($1, $2, 'season.created', 'season', $3, 'success', $4, $5::jsonb)`,
          [
            context.organizationId,
            context.actorId,
            season.id,
            context.requestId,
            JSON.stringify({ year: season.year }),
          ],
        );
        return result.rows[0]!;
      } catch (error) {
        if ((error as { code?: string }).code === '23505') {
          throw new CatalogDuplicateError('A season with this year already exists');
        }
        throw error;
      }
    });
  }

  async createSession(
    context: CreateCatalogContext,
    session: CreateSessionRecord,
  ): Promise<SessionDetailRecord> {
    return this.withTenant(context.organizationId, async (client) => {
      const season = await client.query<{ exists: boolean }>(
        `SELECT EXISTS (
           SELECT 1 FROM seasons WHERE organization_id = $1 AND id = $2
         ) AS exists`,
        [context.organizationId, session.season_id],
      );
      if (!season.rows[0]?.exists) {
        throw new CatalogReferenceError('Season does not belong to this organization');
      }

      const program = await client.query<{
        default_age_as_of: AgeAsOf;
        default_capacity: number;
        default_deposit_cents: number;
        default_maximum_age: number;
        default_minimum_age: number;
        default_price_cents: number;
        default_waitlist_enabled: boolean;
      }>(
        `SELECT
           default_capacity,
           default_minimum_age,
           default_maximum_age,
           default_age_as_of,
           default_price_cents,
           default_deposit_cents,
           default_waitlist_enabled
         FROM programs
         WHERE organization_id = $1 AND id = $2`,
        [context.organizationId, session.program_id],
      );
      const programDefaults = program.rows[0];
      if (!programDefaults) {
        throw new CatalogReferenceError('Program does not belong to this organization');
      }

      try {
        await client.query(
          `INSERT INTO sessions (
             id, organization_id, season_id, program_id, code, name, starts_on, ends_on,
             registration_opens_at, registration_closes_at, capacity, minimum_age,
             maximum_age, age_as_of, currency, price_cents, deposit_cents,
             waitlist_enabled, status
           ) VALUES (
             $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14,
             'USD', $15, $16, $17, $18
           )`,
          [
            session.id,
            context.organizationId,
            session.season_id,
            session.program_id,
            session.code,
            session.name,
            session.starts_on,
            session.ends_on,
            session.registration_opens_at,
            session.registration_closes_at,
            programDefaults.default_capacity,
            programDefaults.default_minimum_age,
            programDefaults.default_maximum_age,
            programDefaults.default_age_as_of,
            programDefaults.default_price_cents,
            programDefaults.default_deposit_cents,
            programDefaults.default_waitlist_enabled,
            session.status,
          ],
        );
      } catch (error) {
        if ((error as { code?: string }).code === '23505') {
          throw new CatalogDuplicateError('A session with this code already exists');
        }
        throw error;
      }

      await client.query(
        `INSERT INTO audit_events (
           organization_id, actor_id, action, target_type, target_id, outcome,
           request_id, details
         ) VALUES ($1, $2, 'session.created', 'session', $3, 'success', $4, $5::jsonb)`,
        [
          context.organizationId,
          context.actorId,
          session.id,
          context.requestId,
          JSON.stringify({ code: session.code, status: session.status }),
        ],
      );

      const created = await client.query<SessionRow>(
        `${sessionSelect}
         WHERE s.organization_id = $1 AND s.id = $2`,
        [context.organizationId, session.id],
      );
      if (!created.rows[0]) throw new CatalogNotFoundError('Created session not found');
      return mapSession(created.rows[0]);
    });
  }

  async updateSessionAttendance(
    context: UpdateSessionAttendanceContext,
  ): Promise<SessionDetailRecord> {
    return this.withTenant(context.organizationId, async (client) => {
      const registrationResult = await client.query<{
        family_id: string;
        id: string;
        status: CatalogRegistrationStatus;
      }>(
        `SELECT id, family_id, status
         FROM registrations
         WHERE organization_id = $1 AND session_id = $2 AND id = $3
         FOR UPDATE`,
        [context.organizationId, context.sessionId, context.registrationId],
      );
      const registration = registrationResult.rows[0];
      if (!registration) {
        throw new CatalogNotFoundError('Registration not found');
      }
      if (registration.status !== 'CONFIRMED') {
        throw new CatalogReferenceError('Only confirmed registrations can be checked in or out');
      }

      const {
        action,
        attendance_date: attendanceDate,
        note,
        pickup_name: pickupName,
      } = context.update;
      let status: Exclude<CatalogAttendanceStatus, 'NOT_MARKED'>;

      if (action === 'CHECK_IN') {
        status = 'CHECKED_IN';
        await client.query(
          `INSERT INTO registration_attendance (
             id,
             organization_id,
             session_id,
             family_id,
             registration_id,
             attendance_date,
             status,
             checked_in_at,
             note,
             recorded_by
           ) VALUES (
             $1, $2, $3, $4, $5, $6::date, 'CHECKED_IN',
             transaction_timestamp(), $7, $8
           )
           ON CONFLICT (organization_id, registration_id, attendance_date)
           DO UPDATE SET
             status = 'CHECKED_IN',
             checked_in_at = COALESCE(registration_attendance.checked_in_at, transaction_timestamp()),
             checked_out_at = NULL,
             pickup_name = NULL,
             note = EXCLUDED.note,
             recorded_by = EXCLUDED.recorded_by,
             updated_at = transaction_timestamp()`,
          [
            randomUUID(),
            context.organizationId,
            context.sessionId,
            registration.family_id,
            context.registrationId,
            attendanceDate,
            note,
            context.actorId,
          ],
        );
      } else if (action === 'CHECK_OUT') {
        status = 'CHECKED_OUT';
        if (!pickupName) {
          throw new CatalogReferenceError('Pickup name is required for checkout');
        }
        const authorizedPickup = await client.query<{ authorized: boolean }>(
          `SELECT EXISTS (
             SELECT 1
             FROM adults a
             WHERE a.organization_id = $1
               AND a.family_id = $2
               AND a.authorized_pickup
               AND a.archived_at IS NULL
               AND a.first_name || ' ' || a.last_name = $3
             UNION ALL
             SELECT 1
             FROM contacts c
             WHERE c.organization_id = $1
               AND c.family_id = $2
               AND c.authorized_pickup
               AND c.archived_at IS NULL
               AND c.first_name || ' ' || c.last_name = $3
           ) AS authorized`,
          [context.organizationId, registration.family_id, pickupName],
        );
        if (!authorizedPickup.rows[0]?.authorized) {
          throw new CatalogReferenceError('Pickup person is not authorized for this family');
        }
        const checkout = await client.query<{ id: string }>(
          `UPDATE registration_attendance
           SET status = 'CHECKED_OUT',
               checked_out_at = transaction_timestamp(),
               pickup_name = $5,
               note = $6,
               recorded_by = $7,
               updated_at = transaction_timestamp()
           WHERE organization_id = $1
             AND session_id = $2
             AND registration_id = $3
             AND attendance_date = $4::date
             AND status = 'CHECKED_IN'
           RETURNING id`,
          [
            context.organizationId,
            context.sessionId,
            context.registrationId,
            attendanceDate,
            pickupName,
            note,
            context.actorId,
          ],
        );
        if (!checkout.rows[0]) {
          throw new CatalogReferenceError('Camper must be checked in before checkout');
        }
      } else {
        status = 'ABSENT';
        await client.query(
          `INSERT INTO registration_attendance (
             id,
             organization_id,
             session_id,
             family_id,
             registration_id,
             attendance_date,
             status,
             note,
             recorded_by
           ) VALUES ($1, $2, $3, $4, $5, $6::date, 'ABSENT', $7, $8)
           ON CONFLICT (organization_id, registration_id, attendance_date)
           DO UPDATE SET
             status = 'ABSENT',
             checked_in_at = NULL,
             checked_out_at = NULL,
             pickup_name = NULL,
             note = EXCLUDED.note,
             recorded_by = EXCLUDED.recorded_by,
             updated_at = transaction_timestamp()`,
          [
            randomUUID(),
            context.organizationId,
            context.sessionId,
            registration.family_id,
            context.registrationId,
            attendanceDate,
            note,
            context.actorId,
          ],
        );
      }

      await client.query(
        `INSERT INTO audit_events (
           organization_id, actor_id, action, target_type, target_id, outcome,
           request_id, details
         ) VALUES ($1, $2, 'attendance.updated', 'registration', $3, 'success', $4, $5::jsonb)`,
        [
          context.organizationId,
          context.actorId,
          context.registrationId,
          context.requestId,
          JSON.stringify({
            action,
            attendance_date: attendanceDate,
            session_id: context.sessionId,
            status,
          }),
        ],
      );

      const updated = await this.getSessionForClient(
        client,
        context.organizationId,
        context.sessionId,
        attendanceDate,
      );
      if (!updated) {
        throw new CatalogNotFoundError('Updated session not found');
      }
      return updated;
    });
  }

  async updateSession(context: UpdateSessionContext): Promise<SessionDetailRecord> {
    return this.withTenant(context.organizationId, async (client) => {
      const currentResult = await client.query<SessionRow>(
        `${sessionSelect}
         WHERE s.organization_id = $1 AND s.id = $2
         FOR UPDATE OF s`,
        [context.organizationId, context.sessionId],
      );
      const currentRow = currentResult.rows[0];
      if (!currentRow) {
        throw new CatalogNotFoundError('Session not found');
      }
      if (currentRow.version !== context.update.version) {
        throw new CatalogConflictError('Session was updated by another request');
      }

      const references = await client.query<{ season_exists: boolean; program_exists: boolean }>(
        `SELECT
           EXISTS (SELECT 1 FROM seasons WHERE organization_id = $1 AND id = $2) AS season_exists,
           EXISTS (SELECT 1 FROM programs WHERE organization_id = $1 AND id = $3) AS program_exists`,
        [context.organizationId, context.update.season_id, context.update.program_id],
      );
      if (!references.rows[0]?.season_exists) {
        throw new CatalogReferenceError('Season does not belong to this organization');
      }
      if (!references.rows[0]?.program_exists) {
        throw new CatalogReferenceError('Program does not belong to this organization');
      }

      const requiredCapacity = currentRow.registered_count + currentRow.active_hold_count;
      if (context.update.season_id !== currentRow.season_id && requiredCapacity > 0) {
        throw new CatalogCapacityError(
          'Sessions with registrations or active holds cannot be moved between seasons',
        );
      }
      if (context.update.capacity < requiredCapacity) {
        throw new CatalogCapacityError('Capacity cannot be below registrations and active holds');
      }

      const editableFields = [
        'season_id',
        'program_id',
        'name',
        'starts_on',
        'ends_on',
        'registration_opens_at',
        'registration_closes_at',
        'capacity',
        'minimum_age',
        'maximum_age',
        'age_as_of',
        'price_cents',
        'deposit_cents',
        'waitlist_enabled',
        'status',
      ] as const;
      const current = mapSession(currentRow);
      const changedFields = editableFields.filter(
        (field) => current[field] !== context.update[field],
      );

      await client.query(
        `UPDATE sessions
         SET season_id = $3,
             program_id = $4,
             name = $5,
             starts_on = $6,
             ends_on = $7,
             registration_opens_at = $8,
             registration_closes_at = $9,
             capacity = $10,
             minimum_age = $11,
             maximum_age = $12,
             age_as_of = $13,
             price_cents = $14,
             deposit_cents = $15,
             waitlist_enabled = $16,
             status = $17,
             version = version + 1,
             updated_at = transaction_timestamp()
         WHERE organization_id = $1 AND id = $2`,
        [
          context.organizationId,
          context.sessionId,
          context.update.season_id,
          context.update.program_id,
          context.update.name,
          context.update.starts_on,
          context.update.ends_on,
          context.update.registration_opens_at,
          context.update.registration_closes_at,
          context.update.capacity,
          context.update.minimum_age,
          context.update.maximum_age,
          context.update.age_as_of,
          context.update.price_cents,
          context.update.deposit_cents,
          context.update.waitlist_enabled,
          context.update.status,
        ],
      );

      await client.query(
        `INSERT INTO audit_events (
           organization_id, actor_id, action, target_type, target_id, outcome,
           request_id, details
         ) VALUES ($1, $2, 'session.updated', 'session', $3, 'success', $4, $5::jsonb)`,
        [
          context.organizationId,
          context.actorId,
          context.sessionId,
          context.requestId,
          JSON.stringify({ changed_fields: changedFields }),
        ],
      );

      const updated = await client.query<SessionRow>(
        `${sessionSelect}
         WHERE s.organization_id = $1 AND s.id = $2`,
        [context.organizationId, context.sessionId],
      );
      if (!updated.rows[0]) {
        throw new CatalogNotFoundError('Updated session not found');
      }
      return mapSession(updated.rows[0]);
    });
  }

  private async listRegisteredCampers(
    client: PoolClient,
    organizationId: string,
    sessionId: string,
    attendanceDate?: string,
  ): Promise<RegisteredCamperRecord[]> {
    const result = await client.query<RegisteredCamperRow>(
      `SELECT
         COALESCE(payments.amount_paid_cents, 0)::integer AS amount_paid_cents,
         attendance.attendance_date::text AS attendance_date,
         attendance.note AS attendance_note,
         COALESCE(attendance.status, 'NOT_MARKED') AS attendance_status,
         COALESCE(pickup_people.authorized_pickup_names, ARRAY[]::text[]) AS authorized_pickup_names,
         CASE WHEN r.status = 'CONFIRMED'
           THEN GREATEST(r.price_cents - COALESCE(payments.amount_paid_cents, 0), 0)::integer
           ELSE 0
         END AS balance_due_cents,
         r.id AS registration_id,
         c.id AS camper_id,
         c.family_id,
         f.family_name,
         c.first_name,
         c.last_name,
         c.birth_date::text,
         c.preferred_name,
         c.gender,
         c.school_grade,
         r.status,
         r.source,
         r.currency,
         r.deposit_cents,
         CASE WHEN r.status = 'CONFIRMED'
           THEN GREATEST(r.deposit_cents - COALESCE(payments.amount_paid_cents, 0), 0)::integer
           ELSE 0
         END AS deposit_due_cents,
         attendance.checked_in_at,
         attendance.checked_out_at,
         CASE
           WHEN r.status <> 'CONFIRMED' THEN 'NOT_DUE'
           WHEN COALESCE(payments.amount_paid_cents, 0) >= r.price_cents THEN 'PAID'
           WHEN COALESCE(payments.amount_paid_cents, 0) >= r.deposit_cents THEN 'PARTIAL'
           ELSE 'DEPOSIT_DUE'
         END AS payment_status,
         attendance.pickup_name,
         r.price_cents,
         r.registered_at,
         offer.id AS offer_id,
         offer.family_id AS offer_family_id,
         offer.registration_id AS offer_registration_id,
         offer.session_id AS offer_session_id,
         CASE
           WHEN offer.status = 'PENDING' AND offer.expires_at <= transaction_timestamp()
             THEN 'EXPIRED'
           ELSE offer.status
         END AS offer_status,
         offer.offered_at AS offer_offered_at,
         offer.expires_at AS offer_expires_at,
         offer.responded_at AS offer_responded_at
       FROM registrations r
       JOIN campers c
         ON c.organization_id = r.organization_id
        AND c.family_id = r.family_id
        AND c.id = r.camper_id
        AND c.archived_at IS NULL
       JOIN families f
         ON f.organization_id = c.organization_id
        AND f.id = c.family_id
        AND f.archived_at IS NULL
       LEFT JOIN LATERAL (
         SELECT COALESCE(sum(rp.amount_cents), 0)::integer AS amount_paid_cents
         FROM registration_payments rp
         WHERE rp.organization_id = r.organization_id
           AND rp.registration_id = r.id
       ) payments ON true
       LEFT JOIN LATERAL (
         SELECT wo.id, wo.family_id, wo.registration_id, wo.session_id, wo.status,
                wo.offered_at, wo.expires_at, wo.responded_at
         FROM waitlist_offers wo
         WHERE wo.organization_id = r.organization_id
           AND wo.registration_id = r.id
         ORDER BY wo.offered_at DESC, wo.id DESC
         LIMIT 1
       ) offer ON true
       LEFT JOIN LATERAL (
         SELECT
           ra.attendance_date,
           ra.status,
           ra.checked_in_at,
           ra.checked_out_at,
           ra.pickup_name,
           ra.note
         FROM registration_attendance ra
         WHERE ra.organization_id = r.organization_id
           AND ra.registration_id = r.id
           AND ra.attendance_date = COALESCE($3::date, CURRENT_DATE)
         LIMIT 1
       ) attendance ON true
       LEFT JOIN LATERAL (
         SELECT COALESCE(array_agg(name ORDER BY sort_name, name), ARRAY[]::text[])
           AS authorized_pickup_names
         FROM (
           SELECT a.first_name || ' ' || a.last_name AS name,
                  lower(a.last_name || ' ' || a.first_name) AS sort_name
           FROM adults a
           WHERE a.organization_id = c.organization_id
             AND a.family_id = c.family_id
             AND a.authorized_pickup
             AND a.archived_at IS NULL
           UNION
           SELECT contacts.first_name || ' ' || contacts.last_name AS name,
                  lower(contacts.last_name || ' ' || contacts.first_name) AS sort_name
           FROM contacts
           WHERE contacts.organization_id = c.organization_id
             AND contacts.family_id = c.family_id
             AND contacts.authorized_pickup
             AND contacts.archived_at IS NULL
         ) names
       ) pickup_people ON true
       WHERE r.organization_id = $1
         AND r.session_id = $2
         AND r.status IN ('CONFIRMED', 'WAITLISTED')
         AND NOT (
           r.status = 'WAITLISTED'
           AND COALESCE(
             offer.status = 'PENDING' AND offer.expires_at <= transaction_timestamp(),
             false
           )
         )
       ORDER BY
         CASE r.status WHEN 'CONFIRMED' THEN 0 WHEN 'WAITLISTED' THEN 1 ELSE 2 END,
         c.gender NULLS LAST,
         lower(c.last_name),
         lower(c.first_name),
         c.id`,
      [organizationId, sessionId, attendanceDate ?? null],
    );

    return result.rows.map(mapRegisteredCamper);
  }
}
