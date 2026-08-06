import type { PoolClient } from 'pg';

import type { DatabaseClient } from './client.js';

export type WorkforceType = 'STAFF' | 'VOLUNTEER';
export type WorkforceProfileStatus = 'PLANNED' | 'ACTIVE' | 'INACTIVE';
export type WorkforceAssignmentStatus = 'PLANNED' | 'CONFIRMED' | 'CANCELLED';

export interface WorkforceContext {
  actorId: string;
  organizationId: string;
  requestId: string;
}
export interface WorkforceProfileRecord {
  account_linked: boolean;
  assignment_count: number;
  current_session_names: string[];
  display_name: string;
  email: string;
  first_name: string;
  id: string;
  last_name: string;
  next_session_names: string[];
  phone: string | null;
  preferred_name: string | null;
  status: WorkforceProfileStatus;
  version: number;
  workforce_type: WorkforceType;
}
export interface WorkforceAssignmentRecord {
  created_at: string;
  ends_on: string;
  id: string;
  position_name: string;
  session_ends_on: string;
  session_id: string;
  session_name: string;
  session_starts_on: string;
  starts_on: string;
  status: WorkforceAssignmentStatus;
  updated_at: string;
  version: number;
}
export interface WorkforceDetailRecord extends WorkforceProfileRecord {
  assignments: WorkforceAssignmentRecord[];
}
export interface WorkforceRosterRecord {
  assignments: Array<{
    display_name: string;
    ends_on: string;
    position_name: string;
    starts_on: string;
    status: WorkforceAssignmentStatus;
    workforce_type: WorkforceType;
  }>;
  ends_on: string;
  session_id: string;
  session_name: string;
  starts_on: string;
}
export class WorkforceConflictError extends Error {}
export class WorkforceNotFoundError extends Error {}
export class WorkforceValidationError extends Error {}

const date = (value: Date | string): string =>
  value instanceof Date ? value.toISOString().slice(0, 10) : String(value).slice(0, 10);
const timestamp = (value: Date | string): string =>
  value instanceof Date ? value.toISOString() : new Date(value).toISOString();

export class WorkforceStore {
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

  private async withIdentityTenant<T>(
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

  async list(
    organizationId: string,
    query: {
      page: number;
      pageSize: number;
      search?: string;
      seasonId?: string;
      sessionId?: string;
      status?: WorkforceProfileStatus;
      workforceType?: WorkforceType;
    },
  ): Promise<{ profiles: WorkforceProfileRecord[]; total: number }> {
    return this.withTenant(organizationId, async (client) => {
      const values: unknown[] = [organizationId];
      const filter: string[] = ['p.organization_id = $1'];
      if (query.status) filter.push(`p.status = $${values.push(query.status)}`);
      if (query.workforceType)
        filter.push(`p.workforce_type = $${values.push(query.workforceType)}`);
      if (query.search) {
        const needle = `%${query.search.trim().toLowerCase()}%`;
        filter.push(
          `(p.email_normalized LIKE $${values.push(needle)} OR lower(p.first_name || ' ' || p.last_name) LIKE $${values.push(needle)})`,
        );
      }
      if (query.sessionId) {
        filter.push(
          `EXISTS (SELECT 1 FROM workforce_session_assignments filter_assignment WHERE filter_assignment.organization_id=p.organization_id AND filter_assignment.workforce_profile_id=p.id AND filter_assignment.session_id=$${values.push(query.sessionId)})`,
        );
      }
      if (query.seasonId) {
        filter.push(
          `EXISTS (SELECT 1 FROM workforce_session_assignments filter_assignment JOIN sessions filter_session ON filter_session.organization_id=filter_assignment.organization_id AND filter_session.id=filter_assignment.session_id WHERE filter_assignment.organization_id=p.organization_id AND filter_assignment.workforce_profile_id=p.id AND filter_session.season_id=$${values.push(query.seasonId)})`,
        );
      }
      const where = filter.join(' AND ');
      const count = await client.query<{ total: number }>(
        `SELECT count(*)::integer AS total FROM workforce_profiles p WHERE ${where}`,
        values,
      );
      const pageValues = [...values, query.pageSize, (query.page - 1) * query.pageSize];
      const result = await client.query<{
        account_id: string | null;
        assignment_count: number;
        current_session_names: string[] | null;
        email: string;
        first_name: string;
        id: string;
        last_name: string;
        next_session_names: string[] | null;
        phone: string | null;
        preferred_name: string | null;
        status: WorkforceProfileStatus;
        version: number;
        workforce_type: WorkforceType;
      }>(
        `SELECT p.*, count(a.id)::integer AS assignment_count,
          COALESCE(array_agg(DISTINCT s.name) FILTER (WHERE a.status='CONFIRMED' AND current_date BETWEEN a.starts_on AND a.ends_on), '{}') AS current_session_names,
          COALESCE(array_agg(DISTINCT s.name) FILTER (WHERE a.status IN ('PLANNED','CONFIRMED') AND a.starts_on > current_date), '{}') AS next_session_names
         FROM workforce_profiles p
         LEFT JOIN workforce_session_assignments a ON a.organization_id=p.organization_id AND a.workforce_profile_id=p.id
         LEFT JOIN sessions s ON s.organization_id=a.organization_id AND s.id=a.session_id
         WHERE ${where}
         GROUP BY p.id
         ORDER BY lower(p.last_name), lower(p.first_name), p.id
         LIMIT $${pageValues.length - 1} OFFSET $${pageValues.length}`,
        pageValues,
      );
      return {
        profiles: result.rows.map((row) => this.profile(row)),
        total: count.rows[0]?.total ?? 0,
      };
    });
  }

  async get(organizationId: string, profileId: string): Promise<WorkforceDetailRecord | null> {
    return this.withTenant(organizationId, async (client) => {
      const profile = await client.query<Parameters<WorkforceStore['profile']>[0]>(
        `SELECT p.*, 0::integer AS assignment_count, '{}'::text[] AS current_session_names, '{}'::text[] AS next_session_names
         FROM workforce_profiles p WHERE p.organization_id=$1 AND p.id=$2`,
        [organizationId, profileId],
      );
      if (!profile.rows[0]) return null;
      const assignments = await this.assignments(client, organizationId, profileId);
      const today = new Date().toISOString().slice(0, 10);
      const summary = this.profile(profile.rows[0]);
      return {
        ...summary,
        assignment_count: assignments.length,
        assignments,
        current_session_names: assignments
          .filter(
            (assignment) =>
              assignment.status === 'CONFIRMED' &&
              assignment.starts_on <= today &&
              assignment.ends_on >= today,
          )
          .map((assignment) => assignment.session_name),
        next_session_names: assignments
          .filter(
            (assignment) =>
              (assignment.status === 'PLANNED' || assignment.status === 'CONFIRMED') &&
              assignment.starts_on > today,
          )
          .map((assignment) => assignment.session_name),
      };
    });
  }

  async create(
    context: WorkforceContext,
    profile: Omit<
      WorkforceProfileRecord,
      | 'account_linked'
      | 'assignment_count'
      | 'current_session_names'
      | 'display_name'
      | 'id'
      | 'next_session_names'
      | 'version'
    > & { id: string },
  ): Promise<void> {
    await this.withTenant(context.organizationId, async (client) => {
      try {
        await client.query(
          `INSERT INTO workforce_profiles (id, organization_id, first_name, last_name, preferred_name, email, email_normalized, phone, workforce_type, status, created_by)
          VALUES ($1,$2,$3,$4,$5,$6,lower($6),$7,$8,$9,$10)`,
          [
            profile.id,
            context.organizationId,
            profile.first_name,
            profile.last_name,
            profile.preferred_name,
            profile.email,
            profile.phone,
            profile.workforce_type,
            profile.status,
            context.actorId,
          ],
        );
      } catch (error: unknown) {
        if ((error as { code?: string }).code === '23505')
          throw new WorkforceConflictError('A workforce profile already uses this email');
        throw error;
      }
      await this.audit(client, context, 'workforce.created', profile.id, 'success', {
        status: profile.status,
        workforce_type: profile.workforce_type,
      });
    });
  }

  async update(
    context: WorkforceContext,
    profileId: string,
    expectedVersion: number,
    input: Omit<
      WorkforceProfileRecord,
      | 'account_linked'
      | 'assignment_count'
      | 'current_session_names'
      | 'display_name'
      | 'id'
      | 'next_session_names'
      | 'version'
    >,
  ): Promise<void> {
    await this.withTenant(context.organizationId, async (client) => {
      const current = await this.lockProfile(client, context.organizationId, profileId);
      if (current.version !== expectedVersion)
        throw new WorkforceConflictError('The workforce profile was updated by another request');
      try {
        await client.query(
          `UPDATE workforce_profiles SET first_name=$3,last_name=$4,preferred_name=$5,email=$6,email_normalized=lower($6),phone=$7,workforce_type=$8,status=$9,account_id=CASE WHEN email_normalized=lower($6) THEN account_id ELSE NULL END,version=version+1,updated_at=transaction_timestamp() WHERE organization_id=$1 AND id=$2`,
          [
            context.organizationId,
            profileId,
            input.first_name,
            input.last_name,
            input.preferred_name,
            input.email,
            input.phone,
            input.workforce_type,
            input.status,
          ],
        );
      } catch (error: unknown) {
        if ((error as { code?: string }).code === '23505')
          throw new WorkforceConflictError('A workforce profile already uses this email');
        throw error;
      }
      await this.audit(client, context, 'workforce.updated', profileId, 'success', {
        changed_fields: [
          'first_name',
          'last_name',
          'preferred_name',
          'email',
          'phone',
          'workforce_type',
          'status',
        ],
      });
    });
  }

  async linkAccount(
    context: WorkforceContext,
    profileId: string,
    expectedVersion: number,
  ): Promise<void> {
    await this.withIdentityTenant(context.organizationId, async (client) => {
      const current = await this.lockProfile(client, context.organizationId, profileId);
      if (current.version !== expectedVersion)
        throw new WorkforceConflictError('The workforce profile was updated by another request');
      const account = await client.query<{ id: string }>(
        `SELECT account.id FROM user_accounts account JOIN organization_memberships membership ON membership.account_id=account.id AND membership.organization_id=$1 AND membership.status='ACTIVE' WHERE account.status='ACTIVE' AND account.email_normalized=$2 LIMIT 2`,
        [context.organizationId, current.email_normalized],
      );
      if (account.rows.length !== 1)
        throw new WorkforceValidationError(
          'No active organization membership matches this profile email',
        );
      const accountId = account.rows[0]!.id;
      try {
        await client.query(
          `UPDATE workforce_profiles SET account_id=$3,version=version+1,updated_at=transaction_timestamp() WHERE organization_id=$1 AND id=$2`,
          [context.organizationId, profileId, accountId],
        );
      } catch (error: unknown) {
        if ((error as { code?: string }).code === '23505')
          throw new WorkforceConflictError(
            'That account is already linked to another workforce profile',
          );
        throw error;
      }
      await this.audit(client, context, 'workforce.account_linked', profileId, 'success', {
        account_linked: true,
      });
    });
  }

  async createAssignment(
    context: WorkforceContext,
    profileId: string,
    input: {
      ends_on: string;
      id: string;
      position_name: string;
      session_id: string;
      starts_on: string;
      status: WorkforceAssignmentStatus;
    },
  ): Promise<void> {
    await this.withTenant(context.organizationId, async (client) => {
      await this.validateAssignment(
        client,
        context.organizationId,
        profileId,
        input.session_id,
        input.starts_on,
        input.ends_on,
        input.status,
      );
      try {
        await client.query(
          `INSERT INTO workforce_session_assignments (id,organization_id,workforce_profile_id,session_id,position_name,starts_on,ends_on,status,created_by) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)`,
          [
            input.id,
            context.organizationId,
            profileId,
            input.session_id,
            input.position_name,
            input.starts_on,
            input.ends_on,
            input.status,
            context.actorId,
          ],
        );
      } catch (error: unknown) {
        if ((error as { code?: string }).code === '23505')
          throw new WorkforceConflictError('An identical session assignment already exists');
        throw error;
      }
      await this.audit(client, context, 'workforce.assignment_created', input.id, 'success', {
        session_id: input.session_id,
        status: input.status,
      });
    });
  }

  async updateAssignment(
    context: WorkforceContext,
    profileId: string,
    assignmentId: string,
    expectedVersion: number,
    input: {
      ends_on: string;
      position_name: string;
      session_id: string;
      starts_on: string;
      status: WorkforceAssignmentStatus;
    },
  ): Promise<void> {
    await this.withTenant(context.organizationId, async (client) => {
      const found = await client.query<{ version: number }>(
        `SELECT version FROM workforce_session_assignments WHERE organization_id=$1 AND workforce_profile_id=$2 AND id=$3 FOR UPDATE`,
        [context.organizationId, profileId, assignmentId],
      );
      if (!found.rows[0]) throw new WorkforceNotFoundError('Workforce assignment not found');
      if (found.rows[0].version !== expectedVersion)
        throw new WorkforceConflictError('The workforce assignment was updated by another request');
      await this.validateAssignment(
        client,
        context.organizationId,
        profileId,
        input.session_id,
        input.starts_on,
        input.ends_on,
        input.status,
      );
      try {
        await client.query(
          `UPDATE workforce_session_assignments SET session_id=$4,position_name=$5,starts_on=$6,ends_on=$7,status=$8,version=version+1,updated_at=transaction_timestamp() WHERE organization_id=$1 AND workforce_profile_id=$2 AND id=$3`,
          [
            context.organizationId,
            profileId,
            assignmentId,
            input.session_id,
            input.position_name,
            input.starts_on,
            input.ends_on,
            input.status,
          ],
        );
      } catch (error: unknown) {
        if ((error as { code?: string }).code === '23505')
          throw new WorkforceConflictError('An identical session assignment already exists');
        throw error;
      }
      await this.audit(client, context, 'workforce.assignment_updated', assignmentId, 'success', {
        session_id: input.session_id,
        status: input.status,
      });
    });
  }

  async roster(organizationId: string, sessionId: string): Promise<WorkforceRosterRecord | null> {
    return this.withTenant(organizationId, async (client) => {
      const session = await client.query<{
        ends_on: Date | string;
        id: string;
        name: string;
        starts_on: Date | string;
      }>(`SELECT id,name,starts_on,ends_on FROM sessions WHERE organization_id=$1 AND id=$2`, [
        organizationId,
        sessionId,
      ]);
      if (!session.rows[0]) return null;
      const assignments = await client.query<
        WorkforceRosterRecord['assignments'][number] & {
          ends_on: Date | string;
          starts_on: Date | string;
        }
      >(
        `SELECT concat_ws(' ',COALESCE(p.preferred_name,p.first_name),p.last_name) AS display_name,p.workforce_type,a.position_name,a.starts_on,a.ends_on,a.status FROM workforce_session_assignments a JOIN workforce_profiles p ON p.organization_id=a.organization_id AND p.id=a.workforce_profile_id WHERE a.organization_id=$1 AND a.session_id=$2 AND a.status='CONFIRMED' AND current_date BETWEEN a.starts_on AND a.ends_on ORDER BY lower(p.last_name),lower(p.first_name),a.id`,
        [organizationId, sessionId],
      );
      return {
        assignments: assignments.rows.map((row) => ({
          ...row,
          starts_on: date(row.starts_on),
          ends_on: date(row.ends_on),
        })),
        session_id: session.rows[0].id,
        session_name: session.rows[0].name,
        starts_on: date(session.rows[0].starts_on),
        ends_on: date(session.rows[0].ends_on),
      };
    });
  }

  async recordAudit(
    context: WorkforceContext,
    action: string,
    targetId: string,
    outcome: 'success' | 'denied',
    details: Record<string, unknown> = {},
  ): Promise<void> {
    await this.withTenant(context.organizationId, (client) =>
      this.audit(client, context, action, targetId, outcome, details),
    );
  }

  private profile(row: {
    account_id: string | null;
    assignment_count: number;
    current_session_names: string[] | null;
    email: string;
    first_name: string;
    id: string;
    last_name: string;
    next_session_names: string[] | null;
    phone: string | null;
    preferred_name: string | null;
    status: WorkforceProfileStatus;
    version: number;
    workforce_type: WorkforceType;
  }): WorkforceProfileRecord {
    return {
      account_linked: row.account_id !== null,
      assignment_count: row.assignment_count,
      current_session_names: row.current_session_names ?? [],
      display_name: [row.preferred_name ?? row.first_name, row.last_name].join(' '),
      email: row.email,
      first_name: row.first_name,
      id: row.id,
      last_name: row.last_name,
      next_session_names: row.next_session_names ?? [],
      phone: row.phone,
      preferred_name: row.preferred_name,
      status: row.status,
      version: row.version,
      workforce_type: row.workforce_type,
    };
  }
  private async assignments(
    client: PoolClient,
    organizationId: string,
    profileId: string,
  ): Promise<WorkforceAssignmentRecord[]> {
    const result = await client.query<
      WorkforceAssignmentRecord & {
        created_at: Date | string;
        ends_on: Date | string;
        session_ends_on: Date | string;
        session_starts_on: Date | string;
        starts_on: Date | string;
        updated_at: Date | string;
      }
    >(
      `SELECT a.id,a.session_id,s.name AS session_name,s.starts_on AS session_starts_on,s.ends_on AS session_ends_on,a.position_name,a.starts_on,a.ends_on,a.status,a.version,a.created_at,a.updated_at FROM workforce_session_assignments a JOIN sessions s ON s.organization_id=a.organization_id AND s.id=a.session_id WHERE a.organization_id=$1 AND a.workforce_profile_id=$2 ORDER BY a.starts_on DESC,a.id`,
      [organizationId, profileId],
    );
    return result.rows.map((row) => ({
      ...row,
      created_at: timestamp(row.created_at),
      updated_at: timestamp(row.updated_at),
      starts_on: date(row.starts_on),
      ends_on: date(row.ends_on),
      session_starts_on: date(row.session_starts_on),
      session_ends_on: date(row.session_ends_on),
    }));
  }
  private async lockProfile(
    client: PoolClient,
    organizationId: string,
    profileId: string,
  ): Promise<{ email_normalized: string; status: WorkforceProfileStatus; version: number }> {
    const result = await client.query<{
      email_normalized: string;
      status: WorkforceProfileStatus;
      version: number;
    }>(
      `SELECT email_normalized,status,version FROM workforce_profiles WHERE organization_id=$1 AND id=$2 FOR UPDATE`,
      [organizationId, profileId],
    );
    if (!result.rows[0]) throw new WorkforceNotFoundError('Workforce profile not found');
    return result.rows[0];
  }
  private async validateAssignment(
    client: PoolClient,
    organizationId: string,
    profileId: string,
    sessionId: string,
    startsOn: string,
    endsOn: string,
    status: WorkforceAssignmentStatus,
  ): Promise<void> {
    const profile = await this.lockProfile(client, organizationId, profileId);
    if (profile.status === 'INACTIVE' && status !== 'CANCELLED')
      throw new WorkforceValidationError(
        'Inactive workforce profiles cannot receive planned or confirmed assignments',
      );
    const session = await client.query<{ ends_on: Date | string; starts_on: Date | string }>(
      `SELECT starts_on,ends_on FROM sessions WHERE organization_id=$1 AND id=$2`,
      [organizationId, sessionId],
    );
    if (!session.rows[0])
      throw new WorkforceValidationError(
        'The selected session is not available in this organization',
      );
    const begins = date(session.rows[0].starts_on),
      ends = date(session.rows[0].ends_on);
    if (startsOn > endsOn || startsOn < begins || endsOn > ends)
      throw new WorkforceValidationError(
        'Assignment dates must fall within the selected session dates',
      );
  }
  private async audit(
    client: PoolClient,
    context: WorkforceContext,
    action: string,
    targetId: string,
    outcome: string,
    details: Record<string, unknown>,
  ): Promise<void> {
    await client.query(
      `INSERT INTO audit_events (organization_id,actor_id,action,target_type,target_id,outcome,request_id,details) VALUES ($1,$2,$3,'workforce',$4,$5,$6,$7)`,
      [
        context.organizationId,
        context.actorId,
        action,
        targetId,
        outcome,
        context.requestId,
        details,
      ],
    );
  }
}
