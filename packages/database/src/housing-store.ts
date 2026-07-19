import { randomUUID } from 'node:crypto';

import type { PoolClient } from 'pg';

import type { DatabaseClient } from './client.js';
import type { FamilyWriteContext } from './family-store.js';

export class HousingNotFoundError extends Error {}
export class HousingConflictError extends Error {}
export class HousingValidationError extends Error {}

export interface HousingBuildingRecord {
  active: boolean;
  beds: HousingBedRecord[];
  code: string;
  description: string | null;
  id: string;
  name: string;
  version: number;
}
export interface HousingBedRecord {
  active: boolean;
  building_id: string;
  id: string;
  name: string;
  version: number;
}
export interface HousingCamperRecord {
  assignment_id: string | null;
  bed_id: string | null;
  birth_date: string;
  building_id: string | null;
  bunk_buddy_names: string[];
  camper_id: string;
  camper_name: string;
  registration_id: string;
}
export interface SessionHousingBuildingRecord {
  assigned_count: number;
  beds: HousingBedRecord[];
  building_id: string;
  closed_reason: string | null;
  code: string;
  id: string;
  name: string;
  status: 'OPEN' | 'CLOSED';
  version: number;
}
export interface SessionHousingRecord {
  buildings: SessionHousingBuildingRecord[];
  campers: HousingCamperRecord[];
  session_id: string;
  warnings: string[];
}

export class HousingStore {
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

  async listInventory(organizationId: string): Promise<{ buildings: HousingBuildingRecord[] }> {
    return this.withTenant(organizationId, (client) => this.inventory(client, organizationId));
  }

  async createBuilding(
    context: FamilyWriteContext,
    input: { active?: boolean; code: string; description?: string | null; name: string },
  ): Promise<HousingBuildingRecord> {
    return this.withTenant(context.organizationId, async (client) => {
      const id = randomUUID();
      try {
        await client.query(
          `INSERT INTO housing_buildings (id, organization_id, name, code, description, active)
           VALUES ($1,$2,$3,$4,$5,$6)`,
          [
            id,
            context.organizationId,
            input.name.trim(),
            input.code.trim().toUpperCase(),
            input.description?.trim() || null,
            input.active ?? true,
          ],
        );
      } catch (error) {
        if ((error as { code?: string }).code === '23505')
          throw new HousingConflictError('A building with this code already exists');
        throw error;
      }
      await this.audit(client, context, 'housing.building_created', 'housing_building', id, {});
      return (await this.building(client, context.organizationId, id))!;
    });
  }

  async updateBuilding(
    context: FamilyWriteContext,
    id: string,
    input: { active?: boolean; code: string; description?: string | null; name: string },
  ): Promise<HousingBuildingRecord> {
    return this.withTenant(context.organizationId, async (client) => {
      const result = await client.query(
        `UPDATE housing_buildings SET name=$3, code=$4, description=$5, active=$6,
           version=version+1, updated_at=transaction_timestamp()
         WHERE organization_id=$1 AND id=$2 RETURNING id`,
        [
          context.organizationId,
          id,
          input.name.trim(),
          input.code.trim().toUpperCase(),
          input.description?.trim() || null,
          input.active ?? true,
        ],
      );
      if (!result.rows[0]) throw new HousingNotFoundError('Building not found');
      await this.audit(client, context, 'housing.building_updated', 'housing_building', id, {});
      return (await this.building(client, context.organizationId, id))!;
    });
  }

  async createBed(
    context: FamilyWriteContext,
    buildingId: string,
    input: { active?: boolean; name: string },
  ): Promise<HousingBedRecord> {
    return this.withTenant(context.organizationId, async (client) => {
      const id = randomUUID();
      try {
        const result = await client.query<HousingBedRecord>(
          `INSERT INTO housing_beds (id, organization_id, building_id, name, active)
           SELECT $1,$2,b.id,$4,$5 FROM housing_buildings b
           WHERE b.organization_id=$2 AND b.id=$3
           RETURNING id, building_id, name, active, version`,
          [id, context.organizationId, buildingId, input.name.trim(), input.active ?? true],
        );
        if (!result.rows[0]) throw new HousingNotFoundError('Building not found');
        await this.audit(client, context, 'housing.bed_created', 'housing_bed', id, {
          building_id: buildingId,
        });
        return result.rows[0];
      } catch (error) {
        if ((error as { code?: string }).code === '23505')
          throw new HousingConflictError('This building already has a bed with that name');
        throw error;
      }
    });
  }

  async updateBed(
    context: FamilyWriteContext,
    id: string,
    input: { active?: boolean; name: string },
  ): Promise<HousingBedRecord> {
    return this.withTenant(context.organizationId, async (client) => {
      const result = await client.query<HousingBedRecord>(
        `UPDATE housing_beds SET name=$3, active=$4, version=version+1,
           updated_at=transaction_timestamp() WHERE organization_id=$1 AND id=$2
         RETURNING id, building_id, name, active, version`,
        [context.organizationId, id, input.name.trim(), input.active ?? true],
      );
      if (!result.rows[0]) throw new HousingNotFoundError('Bed not found');
      await this.audit(client, context, 'housing.bed_updated', 'housing_bed', id, {});
      return result.rows[0];
    });
  }

  async getSession(organizationId: string, sessionId: string): Promise<SessionHousingRecord> {
    return this.withTenant(organizationId, (client) =>
      this.session(client, organizationId, sessionId),
    );
  }

  async configureSessionBuilding(
    context: FamilyWriteContext,
    sessionId: string,
    buildingId: string,
    input: { closed_reason?: string | null; status: 'OPEN' | 'CLOSED' },
  ): Promise<SessionHousingRecord> {
    return this.withTenant(context.organizationId, async (client) => {
      const session = await client.query(
        `SELECT id FROM sessions WHERE organization_id=$1 AND id=$2`,
        [context.organizationId, sessionId],
      );
      const building = await client.query(
        `SELECT id FROM housing_buildings WHERE organization_id=$1 AND id=$2 AND active`,
        [context.organizationId, buildingId],
      );
      if (!session.rows[0]) throw new HousingNotFoundError('Session not found');
      if (!building.rows[0]) throw new HousingNotFoundError('Active building not found');
      if (input.status === 'CLOSED') {
        const assigned = await client.query(
          `SELECT 1 FROM housing_assignments WHERE organization_id=$1 AND session_id=$2
           AND building_id=$3 LIMIT 1`,
          [context.organizationId, sessionId, buildingId],
        );
        if (assigned.rows[0])
          throw new HousingConflictError('Move assigned campers before closing this building');
      }
      const id = randomUUID();
      await client.query(
        `INSERT INTO session_housing_buildings (
           id, organization_id, session_id, building_id, status, closed_reason
         ) VALUES ($1,$2,$3,$4,$5,$6)
         ON CONFLICT (organization_id, session_id, building_id) DO UPDATE SET
           status=excluded.status, closed_reason=excluded.closed_reason,
           version=session_housing_buildings.version+1, updated_at=transaction_timestamp()`,
        [
          id,
          context.organizationId,
          sessionId,
          buildingId,
          input.status,
          input.status === 'CLOSED'
            ? input.closed_reason?.trim() || 'Closed by administrator'
            : null,
        ],
      );
      await this.audit(
        client,
        context,
        'housing.session_building_configured',
        'housing_building',
        buildingId,
        {
          session_id: sessionId,
          status: input.status,
        },
      );
      return this.session(client, context.organizationId, sessionId);
    });
  }

  async assign(
    context: FamilyWriteContext,
    sessionId: string,
    input: { bed_id: string; registration_id: string },
  ): Promise<SessionHousingRecord> {
    return this.withTenant(context.organizationId, async (client) => {
      await this.insertAssignment(
        client,
        context,
        sessionId,
        input.registration_id,
        input.bed_id,
        'MANUAL',
      );
      await this.audit(
        client,
        context,
        'housing.camper_assigned',
        'registration',
        input.registration_id,
        {
          bed_id: input.bed_id,
          session_id: sessionId,
        },
      );
      return this.session(client, context.organizationId, sessionId);
    });
  }

  async unassign(
    context: FamilyWriteContext,
    sessionId: string,
    assignmentId: string,
  ): Promise<SessionHousingRecord> {
    return this.withTenant(context.organizationId, async (client) => {
      const result = await client.query<{ registration_id: string }>(
        `DELETE FROM housing_assignments WHERE organization_id=$1 AND session_id=$2 AND id=$3
         RETURNING registration_id`,
        [context.organizationId, sessionId, assignmentId],
      );
      if (!result.rows[0]) throw new HousingNotFoundError('Housing assignment not found');
      await this.audit(
        client,
        context,
        'housing.camper_unassigned',
        'registration',
        result.rows[0].registration_id,
        {
          session_id: sessionId,
        },
      );
      return this.session(client, context.organizationId, sessionId);
    });
  }

  async autoAssign(
    context: FamilyWriteContext,
    sessionId: string,
    strategy: 'BALANCED' | 'CONSOLIDATE',
  ): Promise<SessionHousingRecord> {
    return this.withTenant(context.organizationId, async (client) => {
      await client.query(`SELECT id FROM sessions WHERE organization_id=$1 AND id=$2 FOR UPDATE`, [
        context.organizationId,
        sessionId,
      ]);
      const workspace = await this.session(client, context.organizationId, sessionId);
      const unassigned = workspace.campers.filter((camper) => !camper.assignment_id);
      const open = workspace.buildings.filter((building) => building.status === 'OPEN');
      const availableByBuilding = new Map(
        open.map((building) => [
          building.building_id,
          building.beds.filter(
            (bed) => bed.active && !workspace.campers.some((camper) => camper.bed_id === bed.id),
          ),
        ]),
      );
      const totalAvailable = [...availableByBuilding.values()].reduce(
        (sum, beds) => sum + beds.length,
        0,
      );
      if (unassigned.length > totalAvailable)
        throw new HousingValidationError(
          `Housing needs ${unassigned.length - totalAvailable} more open beds`,
        );

      const normalizedName = (name: string) => name.trim().toLocaleLowerCase();
      const byName = new Map(
        unassigned.map((camper) => [normalizedName(camper.camper_name), camper]),
      );
      const parent = new Map(
        unassigned.map((camper) => [camper.registration_id, camper.registration_id]),
      );
      const root = (id: string): string => {
        const value = parent.get(id)!;
        if (value === id) return id;
        const found = root(value);
        parent.set(id, found);
        return found;
      };
      for (const camper of unassigned) {
        for (const name of camper.bunk_buddy_names) {
          const buddy = byName.get(normalizedName(name));
          if (buddy) parent.set(root(buddy.registration_id), root(camper.registration_id));
        }
      }
      const groups = new Map<string, HousingCamperRecord[]>();
      for (const camper of unassigned) {
        const key = root(camper.registration_id);
        groups.set(key, [...(groups.get(key) ?? []), camper]);
      }
      const orderedGroups = [...groups.values()].sort(
        (left, right) =>
          right[0]!.birth_date.localeCompare(left[0]!.birth_date) ||
          left[0]!.registration_id.localeCompare(right[0]!.registration_id),
      );
      const selectedBuildings =
        strategy === 'CONSOLIDATE'
          ? [...open].sort(
              (a, b) =>
                (availableByBuilding.get(b.building_id)?.length ?? 0) -
                  (availableByBuilding.get(a.building_id)?.length ?? 0) ||
                a.building_id.localeCompare(b.building_id),
            )
          : open;
      let splitBuddyGroups = 0;

      for (const group of orderedGroups) {
        const pending = [group];
        while (pending.length) {
          const unit = pending.shift()!;
          const candidates = selectedBuildings
            .filter(
              (building) =>
                (availableByBuilding.get(building.building_id)?.length ?? 0) >= unit.length,
            )
            .sort((a, b) => {
              const aBeds = availableByBuilding.get(a.building_id)!.length;
              const bBeds = availableByBuilding.get(b.building_id)!.length;
              const aActive = a.beds.filter((bed) => bed.active).length;
              const bActive = b.beds.filter((bed) => bed.active).length;
              return strategy === 'BALANCED'
                ? a.assigned_count / Math.max(aActive, 1) -
                    b.assigned_count / Math.max(bActive, 1) ||
                    a.building_id.localeCompare(b.building_id)
                : bBeds - aBeds || a.building_id.localeCompare(b.building_id);
            });
          const target = candidates[0];
          if (!target && unit.length > 1) {
            splitBuddyGroups += 1;
            pending.unshift(...unit.map((camper) => [camper]));
            continue;
          }
          if (!target)
            throw new HousingValidationError('Housing capacity changed during assignment');
          for (const camper of unit) {
            const bed = availableByBuilding.get(target.building_id)!.shift()!;
            await this.insertAssignment(
              client,
              context,
              sessionId,
              camper.registration_id,
              bed.id,
              strategy === 'BALANCED' ? 'AUTO_BALANCED' : 'AUTO_CONSOLIDATED',
            );
            target.assigned_count += 1;
          }
        }
      }
      if (strategy === 'CONSOLIDATE') {
        await client.query(
          `UPDATE session_housing_buildings shb SET status='CLOSED',
             closed_reason='Closed by consolidated auto-assignment', version=version+1,
             updated_at=transaction_timestamp()
           WHERE shb.organization_id=$1 AND shb.session_id=$2 AND shb.status='OPEN'
             AND NOT EXISTS (SELECT 1 FROM housing_assignments ha WHERE ha.organization_id=$1
               AND ha.session_id=$2 AND ha.building_id=shb.building_id)`,
          [context.organizationId, sessionId],
        );
      }
      await this.audit(client, context, 'housing.auto_assigned', 'session', sessionId, {
        assigned_count: unassigned.length,
        strategy,
      });
      const result = await this.session(client, context.organizationId, sessionId);
      if (splitBuddyGroups > 0) {
        result.warnings.push(
          `${splitBuddyGroups} bunk buddy group(s) could not fit in one building and were split.`,
        );
      }
      return result;
    });
  }

  private async insertAssignment(
    client: PoolClient,
    context: FamilyWriteContext,
    sessionId: string,
    registrationId: string,
    bedId: string,
    method: 'MANUAL' | 'AUTO_BALANCED' | 'AUTO_CONSOLIDATED',
  ): Promise<void> {
    const target = await client.query<{ building_id: string; session_building_id: string }>(
      `SELECT hb.building_id, shb.id AS session_building_id
       FROM housing_beds hb JOIN session_housing_buildings shb
         ON shb.organization_id=hb.organization_id AND shb.building_id=hb.building_id
       WHERE hb.organization_id=$1 AND hb.id=$2 AND hb.active AND shb.session_id=$3
         AND shb.status='OPEN' FOR UPDATE OF hb, shb`,
      [context.organizationId, bedId, sessionId],
    );
    if (!target.rows[0])
      throw new HousingValidationError('Bed is not active in an open building for this session');
    const registration = await client.query(
      `SELECT 1 FROM registrations WHERE organization_id=$1 AND id=$2 AND session_id=$3
       AND status='CONFIRMED' FOR UPDATE`,
      [context.organizationId, registrationId, sessionId],
    );
    if (!registration.rows[0])
      throw new HousingValidationError('Only confirmed campers in this session can be housed');
    const overlapping = await client.query(
      `SELECT 1 FROM housing_assignments ha
       JOIN sessions assigned_session ON assigned_session.organization_id=ha.organization_id
         AND assigned_session.id=ha.session_id
       JOIN sessions target_session ON target_session.organization_id=ha.organization_id
         AND target_session.id=$3
       WHERE ha.organization_id=$1 AND ha.bed_id=$2 AND ha.session_id<>$3
         AND assigned_session.starts_on <= target_session.ends_on
         AND target_session.starts_on <= assigned_session.ends_on LIMIT 1`,
      [context.organizationId, bedId, sessionId],
    );
    if (overlapping.rows[0])
      throw new HousingConflictError('This bed is occupied during an overlapping session');
    try {
      await client.query(
        `INSERT INTO housing_assignments (
           id, organization_id, session_id, registration_id, building_id, bed_id,
           session_building_id, assignment_method, assigned_by
         ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)`,
        [
          randomUUID(),
          context.organizationId,
          sessionId,
          registrationId,
          target.rows[0].building_id,
          bedId,
          target.rows[0].session_building_id,
          method,
          context.actorId,
        ],
      );
    } catch (error) {
      if ((error as { code?: string }).code === '23505')
        throw new HousingConflictError('The camper or bed already has an assignment');
      throw error;
    }
  }

  private async inventory(client: PoolClient, organizationId: string) {
    const [buildings, beds] = await Promise.all([
      client.query<Omit<HousingBuildingRecord, 'beds'>>(
        `SELECT id,name,code,description,active,version FROM housing_buildings
         WHERE organization_id=$1 ORDER BY active DESC,name,id`,
        [organizationId],
      ),
      client.query<HousingBedRecord>(
        `SELECT id,building_id,name,active,version FROM housing_beds
         WHERE organization_id=$1 ORDER BY building_id,name,id`,
        [organizationId],
      ),
    ]);
    return {
      buildings: buildings.rows.map((building) => ({
        ...building,
        beds: beds.rows.filter((bed) => bed.building_id === building.id),
      })),
    };
  }

  private async building(client: PoolClient, organizationId: string, id: string) {
    return (
      (await this.inventory(client, organizationId)).buildings.find(
        (building) => building.id === id,
      ) ?? null
    );
  }

  private async session(
    client: PoolClient,
    organizationId: string,
    sessionId: string,
  ): Promise<SessionHousingRecord> {
    const exists = await client.query(
      `SELECT id FROM sessions WHERE organization_id=$1 AND id=$2`,
      [organizationId, sessionId],
    );
    if (!exists.rows[0]) throw new HousingNotFoundError('Session not found');
    const buildings = await client.query<Omit<SessionHousingBuildingRecord, 'beds'>>(
      `SELECT shb.id, shb.building_id, hb.name, hb.code, shb.status, shb.closed_reason,
           shb.version, count(ha.id)::integer AS assigned_count
         FROM session_housing_buildings shb JOIN housing_buildings hb
           ON hb.organization_id=shb.organization_id AND hb.id=shb.building_id
         LEFT JOIN housing_assignments ha ON ha.organization_id=shb.organization_id
           AND ha.session_id=shb.session_id AND ha.building_id=shb.building_id
         WHERE shb.organization_id=$1 AND shb.session_id=$2
         GROUP BY shb.id,hb.name,hb.code ORDER BY hb.name,shb.building_id`,
      [organizationId, sessionId],
    );
    const beds = await client.query<HousingBedRecord>(
      `SELECT bed.id,bed.building_id,bed.name,bed.active,bed.version FROM housing_beds bed
         JOIN session_housing_buildings shb ON shb.organization_id=bed.organization_id
           AND shb.building_id=bed.building_id AND shb.session_id=$2
         WHERE bed.organization_id=$1 ORDER BY bed.building_id,bed.name,bed.id`,
      [organizationId, sessionId],
    );
    const campers = await client.query<HousingCamperRecord>(
      `SELECT r.id AS registration_id,r.camper_id,c.birth_date::text AS birth_date,
           concat(c.first_name,' ',c.last_name) AS camper_name,r.bunk_buddy_names,
           ha.id AS assignment_id,ha.building_id,ha.bed_id
         FROM registrations r JOIN campers c ON c.organization_id=r.organization_id AND c.id=r.camper_id
         LEFT JOIN housing_assignments ha ON ha.organization_id=r.organization_id
           AND ha.registration_id=r.id AND ha.session_id=r.session_id
         WHERE r.organization_id=$1 AND r.session_id=$2 AND r.status='CONFIRMED'
         ORDER BY c.birth_date DESC,c.last_name,c.first_name,r.id`,
      [organizationId, sessionId],
    );
    const warnings: string[] = [];
    const unmatched = campers.rows
      .flatMap((camper) => camper.bunk_buddy_names)
      .filter(
        (name) =>
          !campers.rows.some(
            (candidate) => candidate.camper_name.toLocaleLowerCase() === name.toLocaleLowerCase(),
          ),
      );
    if (unmatched.length)
      warnings.push(
        `${new Set(unmatched).size} bunk buddy request(s) do not match a confirmed camper in this session.`,
      );
    return {
      buildings: buildings.rows.map((building) => ({
        ...building,
        beds: beds.rows.filter((bed) => bed.building_id === building.building_id),
      })),
      campers: campers.rows,
      session_id: sessionId,
      warnings,
    };
  }

  private async audit(
    client: PoolClient,
    context: FamilyWriteContext,
    action: string,
    targetType: string,
    targetId: string,
    details: Record<string, unknown>,
  ) {
    await client.query(
      `INSERT INTO audit_events (
         organization_id, actor_id, action, target_type, target_id, outcome, request_id, details
       ) VALUES ($1,$2,$3,$4,$5,'SUCCEEDED',$6,$7::jsonb)`,
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
