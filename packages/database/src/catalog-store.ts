import type { PoolClient } from 'pg';

import type { DatabaseClient } from './client.js';

export type SessionStatus = 'DRAFT' | 'PUBLISHED' | 'CANCELLED' | 'ARCHIVED';
export type AgeAsOf = 'SESSION_START' | 'SEASON_START';
export type CatalogRegistrationStatus = 'CONFIRMED' | 'WAITLISTED' | 'CANCELLED';

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
  age_as_of: AgeAsOf;
  deposit_cents: number;
  waitlist_enabled: boolean;
  organization_timezone: string;
  registered_campers: RegisteredCamperRecord[];
}

export interface RegisteredCamperRecord {
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
  registered_at: string;
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

export interface CreateSessionRecord extends Omit<UpdateSessionRecord, 'version'> {
  id: string;
  season_id: string;
  code: string;
}

export interface CreateProgramRecord {
  id: string;
  code: string;
  name: string;
  delivery_mode: 'DAY' | 'OVERNIGHT';
  description: string;
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

type RegisteredCamperRow = Omit<RegisteredCamperRecord, 'registered_at'> & {
  registered_at: Date | string;
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
    0::integer AS active_hold_count,
    GREATEST(s.capacity - COALESCE(registration_counts.registered_count, 0), 0)::integer
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
      count(*) FILTER (WHERE r.status = 'WAITLISTED')::integer AS waitlisted_count,
      count(*) FILTER (WHERE r.status = 'WAITLISTED' AND c.gender = 'Female')::integer
        AS waitlisted_female_count,
      count(*) FILTER (WHERE r.status = 'WAITLISTED' AND c.gender = 'Male')::integer
        AS waitlisted_male_count
    FROM registrations r
    LEFT JOIN campers c
      ON c.organization_id = r.organization_id
     AND c.family_id = r.family_id
     AND c.id = r.camper_id
    WHERE r.organization_id = s.organization_id
      AND r.session_id = s.id
  ) registration_counts ON true
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
        `SELECT id, organization_id, code, name, delivery_mode, description
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

  async getSession(organizationId: string, sessionId: string): Promise<SessionDetailRecord | null> {
    return this.withTenant(organizationId, async (client) => {
      const result = await client.query<SessionRow>(
        `${sessionSelect}
         WHERE s.organization_id = $1 AND s.id = $2`,
        [organizationId, sessionId],
      );
      const session = result.rows[0];
      if (!session) return null;
      const registeredCampers = await this.listRegisteredCampers(client, organizationId, sessionId);
      return mapSession(session, registeredCampers);
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
             id, organization_id, code, name, delivery_mode, description
           ) VALUES ($1, $2, $3, $4, $5, $6)
           RETURNING id, organization_id, code, name, delivery_mode, description`,
          [
            program.id,
            context.organizationId,
            program.code,
            program.name,
            program.delivery_mode,
            program.description,
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
      const references = await client.query<{ season_exists: boolean; program_exists: boolean }>(
        `SELECT
           EXISTS (SELECT 1 FROM seasons WHERE organization_id = $1 AND id = $2) AS season_exists,
           EXISTS (SELECT 1 FROM programs WHERE organization_id = $1 AND id = $3) AS program_exists`,
        [context.organizationId, session.season_id, session.program_id],
      );
      if (!references.rows[0]?.season_exists) {
        throw new CatalogReferenceError('Season does not belong to this organization');
      }
      if (!references.rows[0]?.program_exists) {
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
            session.capacity,
            session.minimum_age,
            session.maximum_age,
            session.age_as_of,
            session.price_cents,
            session.deposit_cents,
            session.waitlist_enabled,
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
  ): Promise<RegisteredCamperRecord[]> {
    const result = await client.query<RegisteredCamperRow>(
      `SELECT
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
         r.registered_at
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
       WHERE r.organization_id = $1
         AND r.session_id = $2
         AND r.status IN ('CONFIRMED', 'WAITLISTED')
       ORDER BY
         CASE r.status WHEN 'CONFIRMED' THEN 0 WHEN 'WAITLISTED' THEN 1 ELSE 2 END,
         c.gender NULLS LAST,
         lower(c.last_name),
         lower(c.first_name),
         c.id`,
      [organizationId, sessionId],
    );

    return result.rows.map((row) => ({ ...row, registered_at: timestamp(row.registered_at) }));
  }
}
