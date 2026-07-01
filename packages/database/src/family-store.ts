import type { PoolClient } from 'pg';

import type { DatabaseClient } from './client.js';

export type CamperGender = 'Female' | 'Male';
export type FamilyRegistrationStatus = 'CONFIRMED' | 'WAITLISTED' | 'CANCELLED';
export type FamilyRegistrationSource = 'ADMIN' | 'PARENT';

export interface FamilySummaryRecord {
  id: string;
  organization_id: string;
  family_name: string;
  adult_count: number;
  camper_count: number;
  contact_count: number;
  version: number;
  updated_at: string;
}

export interface AdultRecord {
  id: string;
  organization_id: string;
  family_id: string;
  identity_subject: string | null;
  first_name: string;
  last_name: string;
  birth_date: string | null;
  email: string | null;
  phone: string | null;
  account_owner: boolean;
  can_manage_family: boolean;
  can_register: boolean;
  can_make_payments: boolean;
  emergency_contact: boolean;
  authorized_pickup: boolean;
  receives_operational_communication: boolean;
  version: number;
  updated_at: string;
}

export interface CamperRecord {
  id: string;
  organization_id: string;
  family_id: string;
  adult_id: string | null;
  first_name: string;
  last_name: string;
  birth_date: string;
  email: string | null;
  preferred_name: string | null;
  gender: CamperGender | null;
  school_grade: string | null;
  cabin_preference: string | null;
  accessibility_needs: string | null;
  registrations: CamperSessionRegistrationRecord[];
  version: number;
  updated_at: string;
}

export interface CamperSessionRegistrationRecord {
  registration_id: string;
  session_id: string;
  session_code: string;
  session_name: string;
  program_name: string;
  starts_on: string;
  ends_on: string;
  status: FamilyRegistrationStatus;
  source: FamilyRegistrationSource;
  registered_at: string;
}

export interface ContactRecord {
  id: string;
  organization_id: string;
  family_id: string;
  first_name: string;
  last_name: string;
  birth_date: string | null;
  email: string | null;
  phone: string;
  relationship: string;
  emergency_contact: boolean;
  authorized_pickup: boolean;
  receives_operational_communication: boolean;
  emergency_priority: number | null;
  version: number;
  updated_at: string;
}

export interface FamilyDetailRecord extends FamilySummaryRecord {
  adults: AdultRecord[];
  campers: CamperRecord[];
  contacts: ContactRecord[];
}

export interface FamilyWriteContext {
  actorId: string;
  organizationId: string;
  requestId: string;
}

export interface CreateFamilyRecord {
  id: string;
  family_name: string;
}

export interface UpdateFamilyRecord {
  family_name: string;
  version: number;
}

export interface CreateAdultRecord {
  id: string;
  family_id: string;
  identity_subject: string | null;
  first_name: string;
  last_name: string;
  birth_date: string | null;
  email: string | null;
  email_normalized: string | null;
  phone: string | null;
  account_owner: boolean;
  can_manage_family: boolean;
  can_register: boolean;
  can_make_payments: boolean;
  emergency_contact: boolean;
  authorized_pickup: boolean;
  receives_operational_communication: boolean;
}

export interface UpdateAdultRecord extends Omit<
  CreateAdultRecord,
  'family_id' | 'id' | 'identity_subject'
> {
  version: number;
}

export interface CreateCamperRecord {
  id: string;
  family_id: string;
  adult_id: string | null;
  first_name: string;
  last_name: string;
  birth_date: string;
  email: string | null;
  email_normalized: string | null;
  preferred_name: string | null;
  gender: CamperGender | null;
  school_grade: string | null;
  cabin_preference: string | null;
  accessibility_needs: string | null;
}

export interface UpdateCamperRecord extends Omit<CreateCamperRecord, 'family_id' | 'id'> {
  version: number;
}

export interface CreateContactRecord {
  id: string;
  family_id: string;
  first_name: string;
  last_name: string;
  birth_date: string | null;
  email: string | null;
  email_normalized: string | null;
  phone: string;
  relationship: string;
  emergency_contact: boolean;
  authorized_pickup: boolean;
  receives_operational_communication: boolean;
  emergency_priority: number | null;
}

export interface UpdateContactRecord extends Omit<CreateContactRecord, 'family_id' | 'id'> {
  version: number;
}

export interface CreateRegistrationRecord {
  id: string;
  family_id: string;
  camper_id: string;
  session_id: string;
  source: FamilyRegistrationSource;
}

export interface FamilyRegistrationResultRecord {
  family: FamilyDetailRecord;
  registration: CamperSessionRegistrationRecord;
}

export class FamilyNotFoundError extends Error {}
export class FamilyConflictError extends Error {}
export class FamilyDuplicateError extends Error {}
export class FamilyRegistrationCapacityError extends Error {}
export class FamilyRegistrationDuplicateError extends Error {}
export class FamilyRegistrationEligibilityError extends Error {
  constructor(
    message: string,
    readonly fieldErrors: Record<string, string> = {},
  ) {
    super(message);
  }
}

interface Timestamped {
  updated_at: Date | string;
}

type FamilySummaryRow = Omit<FamilySummaryRecord, 'updated_at'> & Timestamped;
type AdultRow = Omit<AdultRecord, 'updated_at'> & Timestamped;
type CamperRow = Omit<CamperRecord, 'registrations' | 'updated_at'> & Timestamped;
type CamperSessionRegistrationRow = Omit<CamperSessionRegistrationRecord, 'registered_at'> &
  Timestamped & { camper_id: string };
type ContactRow = Omit<ContactRecord, 'updated_at'> & Timestamped;

interface RegistrationSessionRow {
  id: string;
  code: string;
  name: string;
  program_name: string;
  minimum_grade: number;
  maximum_grade: number;
  season_year: number;
  starts_on: string;
  status: 'DRAFT' | 'PUBLISHED' | 'CANCELLED' | 'ARCHIVED';
  registration_opens_at: Date | string;
  registration_closes_at: Date | string;
  capacity: number;
  minimum_age: number;
  maximum_age: number;
  age_as_of: 'SESSION_START' | 'SEASON_START';
  waitlist_enabled: boolean;
}

interface RegistrationCamperRow {
  id: string;
  family_id: string;
  adult_id: string | null;
  school_grade: string | null;
  age_years: number;
}

const familySummarySelect = `
  SELECT
    f.id,
    f.organization_id,
    f.family_name,
    f.version,
    f.updated_at,
    COALESCE(adults.adult_count, 0)::integer AS adult_count,
    COALESCE(campers.camper_count, 0)::integer AS camper_count,
    COALESCE(contacts.contact_count, 0)::integer AS contact_count
  FROM families f
  LEFT JOIN LATERAL (
    SELECT count(*)::integer AS adult_count
    FROM adults a
    WHERE a.organization_id = f.organization_id
      AND a.family_id = f.id
      AND a.archived_at IS NULL
  ) adults ON true
  LEFT JOIN LATERAL (
    SELECT count(*)::integer AS camper_count
    FROM campers c
    WHERE c.organization_id = f.organization_id
      AND c.family_id = f.id
      AND c.archived_at IS NULL
  ) campers ON true
  LEFT JOIN LATERAL (
    SELECT count(*)::integer AS contact_count
    FROM contacts c
    WHERE c.organization_id = f.organization_id
      AND c.family_id = f.id
      AND c.archived_at IS NULL
  ) contacts ON true
`;

function timestamp(value: Date | string): string {
  return value instanceof Date ? value.toISOString().replace('.000Z', 'Z') : value;
}

function mapFamilySummary(row: FamilySummaryRow): FamilySummaryRecord {
  return { ...row, updated_at: timestamp(row.updated_at) };
}

function mapAdult(row: AdultRow): AdultRecord {
  return { ...row, updated_at: timestamp(row.updated_at) };
}

function mapCamper(
  row: CamperRow,
  registrations: CamperSessionRegistrationRecord[] = [],
): CamperRecord {
  return { ...row, registrations, updated_at: timestamp(row.updated_at) };
}

function mapContact(row: ContactRow): ContactRecord {
  return { ...row, updated_at: timestamp(row.updated_at) };
}

function normalizedGrade(value: string | null): number | null {
  if (!value) return null;
  const normalized = value.trim().toLowerCase();
  if (!normalized) return null;

  const numeric = normalized.match(/\b(1[0-2]|[0-9])(?:st|nd|rd|th)?\b/);
  if (numeric?.[1]) return Number(numeric[1]);

  const aliases = new Map([
    ['k', 0],
    ['kindergarten', 0],
    ['first', 1],
    ['second', 2],
    ['third', 3],
    ['fourth', 4],
    ['fifth', 5],
    ['sixth', 6],
    ['seventh', 7],
    ['eighth', 8],
    ['freshman', 9],
    ['ninth', 9],
    ['sophomore', 10],
    ['tenth', 10],
    ['junior', 11],
    ['eleventh', 11],
    ['senior', 12],
    ['twelfth', 12],
  ]);
  return aliases.get(normalized) ?? null;
}

function formatGrade(grade: number): string {
  return grade === 0 ? 'K' : String(grade);
}

function formatGradeRange(minimumGrade: number, maximumGrade: number): string {
  return minimumGrade === maximumGrade
    ? formatGrade(minimumGrade)
    : `${formatGrade(minimumGrade)}-${formatGrade(maximumGrade)}`;
}

function registrationResultFromFamily(
  family: FamilyDetailRecord,
  registrationId: string,
): CamperSessionRegistrationRecord {
  for (const camper of family.campers) {
    const registration = camper.registrations.find(
      (candidate) => candidate.registration_id === registrationId,
    );
    if (registration) return registration;
  }
  throw new FamilyNotFoundError('Created registration not found');
}

function changedFields(current: object, update: object, fields: readonly string[]): string[] {
  const currentValues = current as Record<string, unknown>;
  const updateValues = update as Record<string, unknown>;
  return fields.filter((field) => currentValues[field] !== updateValues[field]).map(String);
}

export class FamilyStore {
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

  async listFamilies(organizationId: string): Promise<FamilySummaryRecord[]> {
    return this.withTenant(organizationId, async (client) => {
      const result = await client.query<FamilySummaryRow>(
        `${familySummarySelect}
         WHERE f.organization_id = $1 AND f.archived_at IS NULL
         ORDER BY lower(f.family_name), f.id`,
        [organizationId],
      );
      return result.rows.map(mapFamilySummary);
    });
  }

  async getFamily(organizationId: string, familyId: string): Promise<FamilyDetailRecord | null> {
    return this.withTenant(organizationId, (client) =>
      this.getFamilyInTenant(client, organizationId, familyId),
    );
  }

  async createFamily(
    context: FamilyWriteContext,
    family: CreateFamilyRecord,
  ): Promise<FamilyDetailRecord> {
    return this.withTenant(context.organizationId, async (client) => {
      await client.query(
        `INSERT INTO families (id, organization_id, family_name)
         VALUES ($1, $2, $3)`,
        [family.id, context.organizationId, family.family_name],
      );
      await this.insertAudit(client, context, 'family.created', 'family', family.id, {});
      return this.requireFamilyInTenant(client, context.organizationId, family.id);
    });
  }

  async updateFamily(
    context: FamilyWriteContext & { familyId: string; update: UpdateFamilyRecord },
  ): Promise<FamilyDetailRecord> {
    return this.withTenant(context.organizationId, async (client) => {
      const currentResult = await client.query<FamilySummaryRow>(
        `${familySummarySelect}
         WHERE f.organization_id = $1 AND f.id = $2 AND f.archived_at IS NULL
         FOR UPDATE OF f`,
        [context.organizationId, context.familyId],
      );
      const current = currentResult.rows[0] ? mapFamilySummary(currentResult.rows[0]) : null;
      if (!current) throw new FamilyNotFoundError('Family not found');
      if (current.version !== context.update.version) {
        throw new FamilyConflictError('Family was updated by another request');
      }

      await client.query(
        `UPDATE families
         SET family_name = $3,
             version = version + 1,
             updated_at = transaction_timestamp()
         WHERE organization_id = $1 AND id = $2`,
        [context.organizationId, context.familyId, context.update.family_name],
      );
      await this.insertAudit(client, context, 'family.updated', 'family', context.familyId, {
        changed_fields: changedFields(current, context.update, ['family_name']),
      });
      return this.requireFamilyInTenant(client, context.organizationId, context.familyId);
    });
  }

  async createAdult(
    context: FamilyWriteContext,
    adult: CreateAdultRecord,
  ): Promise<FamilyDetailRecord> {
    return this.withTenant(context.organizationId, async (client) => {
      await this.ensureFamilyExists(client, context.organizationId, adult.family_id);
      try {
        await client.query(
          `INSERT INTO adults (
             id, organization_id, family_id, identity_subject, first_name, last_name,
             birth_date, email, email_normalized, phone, account_owner, can_manage_family,
             can_register, can_make_payments, emergency_contact, authorized_pickup,
             receives_operational_communication
           ) VALUES (
             $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17
           )`,
          [
            adult.id,
            context.organizationId,
            adult.family_id,
            adult.identity_subject,
            adult.first_name,
            adult.last_name,
            adult.birth_date,
            adult.email,
            adult.email_normalized,
            adult.phone,
            adult.account_owner,
            adult.can_manage_family,
            adult.can_register,
            adult.can_make_payments,
            adult.emergency_contact,
            adult.authorized_pickup,
            adult.receives_operational_communication,
          ],
        );
      } catch (error) {
        this.mapUniqueViolation(error);
      }
      await this.insertAudit(client, context, 'adult.created', 'adult', adult.id, {
        account_owner: adult.account_owner,
      });
      return this.requireFamilyInTenant(client, context.organizationId, adult.family_id);
    });
  }

  async updateAdult(
    context: FamilyWriteContext & { adultId: string; familyId: string; update: UpdateAdultRecord },
  ): Promise<FamilyDetailRecord> {
    return this.withTenant(context.organizationId, async (client) => {
      const current = await this.getAdultForUpdate(
        client,
        context.organizationId,
        context.familyId,
        context.adultId,
      );
      if (current.version !== context.update.version) {
        throw new FamilyConflictError('Adult was updated by another request');
      }

      try {
        await client.query(
          `UPDATE adults
           SET first_name = $4,
               last_name = $5,
               birth_date = $6,
               email = $7,
               email_normalized = $8,
               phone = $9,
               account_owner = $10,
               can_manage_family = $11,
               can_register = $12,
               can_make_payments = $13,
               emergency_contact = $14,
               authorized_pickup = $15,
               receives_operational_communication = $16,
               version = version + 1,
               updated_at = transaction_timestamp()
           WHERE organization_id = $1 AND family_id = $2 AND id = $3`,
          [
            context.organizationId,
            context.familyId,
            context.adultId,
            context.update.first_name,
            context.update.last_name,
            context.update.birth_date,
            context.update.email,
            context.update.email_normalized,
            context.update.phone,
            context.update.account_owner,
            context.update.can_manage_family,
            context.update.can_register,
            context.update.can_make_payments,
            context.update.emergency_contact,
            context.update.authorized_pickup,
            context.update.receives_operational_communication,
          ],
        );
      } catch (error) {
        this.mapUniqueViolation(error);
      }

      await client.query(
        `UPDATE campers
         SET first_name = $4,
             last_name = $5,
             email = $6,
             email_normalized = $7,
             birth_date = COALESCE($8::date, birth_date),
             version = version + 1,
             updated_at = transaction_timestamp()
         WHERE organization_id = $1
           AND family_id = $2
           AND adult_id = $3
           AND archived_at IS NULL`,
        [
          context.organizationId,
          context.familyId,
          context.adultId,
          context.update.first_name,
          context.update.last_name,
          context.update.email,
          context.update.email_normalized,
          context.update.birth_date,
        ],
      );

      const fields = [
        'first_name',
        'last_name',
        'birth_date',
        'email',
        'phone',
        'account_owner',
        'can_manage_family',
        'can_register',
        'can_make_payments',
        'emergency_contact',
        'authorized_pickup',
        'receives_operational_communication',
      ] as const;
      await this.insertAudit(client, context, 'adult.updated', 'adult', context.adultId, {
        changed_fields: changedFields(current, context.update, fields),
      });
      return this.requireFamilyInTenant(client, context.organizationId, context.familyId);
    });
  }

  async createCamper(
    context: FamilyWriteContext,
    camper: CreateCamperRecord,
  ): Promise<FamilyDetailRecord> {
    return this.withTenant(context.organizationId, async (client) => {
      await this.ensureFamilyExists(client, context.organizationId, camper.family_id);
      try {
        await client.query(
          `INSERT INTO campers (
             id, organization_id, family_id, adult_id, first_name, last_name, birth_date,
             email, email_normalized, preferred_name, gender, school_grade,
             cabin_preference, accessibility_needs
           ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14)`,
          [
            camper.id,
            context.organizationId,
            camper.family_id,
            camper.adult_id,
            camper.first_name,
            camper.last_name,
            camper.birth_date,
            camper.email,
            camper.email_normalized,
            camper.preferred_name,
            camper.gender,
            camper.school_grade,
            camper.cabin_preference,
            camper.accessibility_needs,
          ],
        );
      } catch (error) {
        this.mapUniqueViolation(error);
      }
      await this.insertAudit(client, context, 'camper.created', 'camper', camper.id, {});
      return this.requireFamilyInTenant(client, context.organizationId, camper.family_id);
    });
  }

  async updateCamper(
    context: FamilyWriteContext & {
      camperId: string;
      familyId: string;
      update: UpdateCamperRecord;
    },
  ): Promise<FamilyDetailRecord> {
    return this.withTenant(context.organizationId, async (client) => {
      const current = await this.getCamperForUpdate(
        client,
        context.organizationId,
        context.familyId,
        context.camperId,
      );
      if (current.version !== context.update.version) {
        throw new FamilyConflictError('Camper was updated by another request');
      }

      try {
        await client.query(
          `UPDATE campers
           SET first_name = $4,
               last_name = $5,
               birth_date = $6,
               adult_id = $7,
               email = $8,
               email_normalized = $9,
               preferred_name = $10,
               gender = $11,
               school_grade = $12,
               cabin_preference = $13,
               accessibility_needs = $14,
               version = version + 1,
               updated_at = transaction_timestamp()
           WHERE organization_id = $1 AND family_id = $2 AND id = $3`,
          [
            context.organizationId,
            context.familyId,
            context.camperId,
            context.update.first_name,
            context.update.last_name,
            context.update.birth_date,
            context.update.adult_id,
            context.update.email,
            context.update.email_normalized,
            context.update.preferred_name,
            context.update.gender,
            context.update.school_grade,
            context.update.cabin_preference,
            context.update.accessibility_needs,
          ],
        );
      } catch (error) {
        this.mapUniqueViolation(error);
      }
      const fields = [
        'first_name',
        'last_name',
        'birth_date',
        'adult_id',
        'email',
        'preferred_name',
        'gender',
        'school_grade',
        'cabin_preference',
        'accessibility_needs',
      ] as const;
      await this.insertAudit(client, context, 'camper.updated', 'camper', context.camperId, {
        changed_fields: changedFields(current, context.update, fields),
      });
      return this.requireFamilyInTenant(client, context.organizationId, context.familyId);
    });
  }

  async createContact(
    context: FamilyWriteContext,
    contact: CreateContactRecord,
  ): Promise<FamilyDetailRecord> {
    return this.withTenant(context.organizationId, async (client) => {
      await this.ensureFamilyExists(client, context.organizationId, contact.family_id);
      await client.query(
        `INSERT INTO contacts (
           id, organization_id, family_id, first_name, last_name, birth_date, email,
           email_normalized, phone,
           relationship, emergency_contact, authorized_pickup,
           receives_operational_communication, emergency_priority
         ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14)`,
        [
          contact.id,
          context.organizationId,
          contact.family_id,
          contact.first_name,
          contact.last_name,
          contact.birth_date,
          contact.email,
          contact.email_normalized,
          contact.phone,
          contact.relationship,
          contact.emergency_contact,
          contact.authorized_pickup,
          contact.receives_operational_communication,
          contact.emergency_priority,
        ],
      );
      await this.insertAudit(client, context, 'contact.created', 'contact', contact.id, {
        authorized_pickup: contact.authorized_pickup,
        emergency_contact: contact.emergency_contact,
      });
      return this.requireFamilyInTenant(client, context.organizationId, contact.family_id);
    });
  }

  async updateContact(
    context: FamilyWriteContext & {
      contactId: string;
      familyId: string;
      update: UpdateContactRecord;
    },
  ): Promise<FamilyDetailRecord> {
    return this.withTenant(context.organizationId, async (client) => {
      const current = await this.getContactForUpdate(
        client,
        context.organizationId,
        context.familyId,
        context.contactId,
      );
      if (current.version !== context.update.version) {
        throw new FamilyConflictError('Contact was updated by another request');
      }

      await client.query(
        `UPDATE contacts
         SET first_name = $4,
             last_name = $5,
             birth_date = $6,
             email = $7,
             email_normalized = $8,
             phone = $9,
             relationship = $10,
             emergency_contact = $11,
             authorized_pickup = $12,
             receives_operational_communication = $13,
             emergency_priority = $14,
             version = version + 1,
             updated_at = transaction_timestamp()
         WHERE organization_id = $1 AND family_id = $2 AND id = $3`,
        [
          context.organizationId,
          context.familyId,
          context.contactId,
          context.update.first_name,
          context.update.last_name,
          context.update.birth_date,
          context.update.email,
          context.update.email_normalized,
          context.update.phone,
          context.update.relationship,
          context.update.emergency_contact,
          context.update.authorized_pickup,
          context.update.receives_operational_communication,
          context.update.emergency_priority,
        ],
      );
      const fields = [
        'first_name',
        'last_name',
        'birth_date',
        'email',
        'phone',
        'relationship',
        'emergency_contact',
        'authorized_pickup',
        'receives_operational_communication',
        'emergency_priority',
      ] as const;
      await this.insertAudit(client, context, 'contact.updated', 'contact', context.contactId, {
        changed_fields: changedFields(current, context.update, fields),
      });
      return this.requireFamilyInTenant(client, context.organizationId, context.familyId);
    });
  }

  async createRegistration(
    context: FamilyWriteContext,
    registration: CreateRegistrationRecord,
  ): Promise<FamilyRegistrationResultRecord> {
    return this.withTenant(context.organizationId, async (client) => {
      await this.ensureFamilyExists(client, context.organizationId, registration.family_id);

      const session = await client.query<RegistrationSessionRow>(
        `SELECT
           s.id,
           s.code,
           s.name,
           p.name AS program_name,
           p.default_minimum_grade AS minimum_grade,
           p.default_maximum_grade AS maximum_grade,
           se.year AS season_year,
           s.starts_on::text,
           s.status,
           s.registration_opens_at,
           s.registration_closes_at,
           s.capacity,
           s.minimum_age,
           s.maximum_age,
           s.age_as_of,
           s.waitlist_enabled
         FROM sessions s
         JOIN programs p
           ON p.organization_id = s.organization_id
          AND p.id = s.program_id
         JOIN seasons se
           ON se.organization_id = s.organization_id
          AND se.id = s.season_id
         WHERE s.organization_id = $1 AND s.id = $2
         FOR UPDATE OF s`,
        [context.organizationId, registration.session_id],
      );
      const sessionRow = session.rows[0];
      if (!sessionRow) {
        throw new FamilyRegistrationEligibilityError('Session not found', {
          session_id: 'Select a valid session.',
        });
      }

      if (registration.source === 'PARENT') {
        if (sessionRow.status !== 'PUBLISHED') {
          throw new FamilyRegistrationEligibilityError('Session is not open for registration', {
            session_id: 'Select a published session.',
          });
        }
        const window = await client.query<{ is_open: boolean }>(
          `SELECT transaction_timestamp() >= $1::timestamptz
              AND transaction_timestamp() < $2::timestamptz AS is_open`,
          [sessionRow.registration_opens_at, sessionRow.registration_closes_at],
        );
        if (!window.rows[0]?.is_open) {
          throw new FamilyRegistrationEligibilityError(
            'Registration is not open for this session',
            {
              session_id: 'Select a session with open registration.',
            },
          );
        }
      } else if (['CANCELLED', 'ARCHIVED'].includes(sessionRow.status)) {
        throw new FamilyRegistrationEligibilityError('Session is not available for registration', {
          session_id: 'Select an active session.',
        });
      }

      const ageAsOfDate =
        sessionRow.age_as_of === 'SEASON_START'
          ? `${sessionRow.season_year}-01-01`
          : sessionRow.starts_on;
      const camper = await client.query<RegistrationCamperRow>(
        `SELECT
           c.id,
           c.family_id,
           c.adult_id,
           c.school_grade,
           date_part('year', age($4::date, c.birth_date))::integer AS age_years
         FROM campers c
         WHERE c.organization_id = $1
           AND c.family_id = $2
           AND c.id = $3
           AND c.archived_at IS NULL`,
        [context.organizationId, registration.family_id, registration.camper_id, ageAsOfDate],
      );
      const camperRow = camper.rows[0];
      if (!camperRow) {
        throw new FamilyRegistrationEligibilityError('Camper not found', {
          camper_id: 'Select a camper in this family.',
        });
      }
      if (
        camperRow.age_years < sessionRow.minimum_age ||
        camperRow.age_years > sessionRow.maximum_age
      ) {
        throw new FamilyRegistrationEligibilityError(
          'Camper is not age eligible for this session',
          {
            camper_id: `Camper must be age ${sessionRow.minimum_age}-${sessionRow.maximum_age}.`,
          },
        );
      }

      if (!camperRow.adult_id) {
        if (!camperRow.school_grade?.trim()) {
          throw new FamilyRegistrationEligibilityError(
            'Camper grade is required for registration',
            {
              camper_id: 'Set the camper school grade before registering.',
            },
          );
        }
        const grade = normalizedGrade(camperRow.school_grade);
        if (
          grade === null ||
          grade < sessionRow.minimum_grade ||
          grade > sessionRow.maximum_grade
        ) {
          throw new FamilyRegistrationEligibilityError(
            'Camper is not grade eligible for this session',
            {
              camper_id: `Camper must be in grade ${formatGradeRange(
                sessionRow.minimum_grade,
                sessionRow.maximum_grade,
              )}.`,
            },
          );
        }
      }

      const duplicate = await client.query(
        `SELECT id
         FROM registrations
         WHERE organization_id = $1
           AND session_id = $2
           AND family_id = $3
           AND camper_id = $4`,
        [
          context.organizationId,
          registration.session_id,
          registration.family_id,
          registration.camper_id,
        ],
      );
      if (duplicate.rows[0]) {
        throw new FamilyRegistrationDuplicateError('Camper is already registered for this session');
      }

      const confirmed = await client.query<{ count: number }>(
        `SELECT count(*)::integer
         FROM registrations
         WHERE organization_id = $1
           AND session_id = $2
           AND status = 'CONFIRMED'`,
        [context.organizationId, registration.session_id],
      );
      const confirmedCount = confirmed.rows[0]?.count ?? 0;
      const status: FamilyRegistrationStatus =
        confirmedCount < sessionRow.capacity
          ? 'CONFIRMED'
          : sessionRow.waitlist_enabled
            ? 'WAITLISTED'
            : 'CANCELLED';
      if (status === 'CANCELLED') {
        throw new FamilyRegistrationCapacityError('Session capacity is full');
      }

      try {
        await client.query(
          `INSERT INTO registrations (
             id, organization_id, session_id, family_id, camper_id, status, source
           ) VALUES ($1, $2, $3, $4, $5, $6, $7)`,
          [
            registration.id,
            context.organizationId,
            registration.session_id,
            registration.family_id,
            registration.camper_id,
            status,
            registration.source,
          ],
        );
      } catch (error) {
        if ((error as { code?: string }).code === '23505') {
          throw new FamilyRegistrationDuplicateError(
            'Camper is already registered for this session',
          );
        }
        throw error;
      }

      await this.insertAudit(
        client,
        context,
        'registration.created',
        'registration',
        registration.id,
        {
          camper_id: registration.camper_id,
          session_id: registration.session_id,
          source: registration.source,
          status,
        },
      );
      const family = await this.requireFamilyInTenant(
        client,
        context.organizationId,
        registration.family_id,
      );
      return {
        family,
        registration: registrationResultFromFamily(family, registration.id),
      };
    });
  }

  private async getFamilyInTenant(
    client: PoolClient,
    organizationId: string,
    familyId: string,
  ): Promise<FamilyDetailRecord | null> {
    const family = await client.query<FamilySummaryRow>(
      `${familySummarySelect}
       WHERE f.organization_id = $1 AND f.id = $2 AND f.archived_at IS NULL`,
      [organizationId, familyId],
    );
    const summary = family.rows[0] ? mapFamilySummary(family.rows[0]) : null;
    if (!summary) return null;

    const adults = await client.query<AdultRow>(
      `SELECT id, organization_id, family_id, identity_subject, first_name, last_name,
              birth_date::text, email, phone, account_owner, can_manage_family, can_register,
              can_make_payments, emergency_contact, authorized_pickup,
              receives_operational_communication, version, updated_at
       FROM adults
       WHERE organization_id = $1 AND family_id = $2 AND archived_at IS NULL
       ORDER BY account_owner DESC, lower(last_name), lower(first_name), id`,
      [organizationId, familyId],
    );
    const campers = await client.query<CamperRow>(
      `SELECT id, organization_id, family_id, adult_id, first_name, last_name, birth_date::text,
              email, preferred_name, gender, school_grade,
              cabin_preference, accessibility_needs, version, updated_at
       FROM campers
       WHERE organization_id = $1 AND family_id = $2 AND archived_at IS NULL
       ORDER BY lower(last_name), lower(first_name), birth_date, id`,
      [organizationId, familyId],
    );
    const contacts = await client.query<ContactRow>(
      `SELECT id, organization_id, family_id, first_name, last_name, birth_date::text,
              email, phone,
              relationship, emergency_contact, authorized_pickup,
              receives_operational_communication, emergency_priority, version, updated_at
       FROM contacts
       WHERE organization_id = $1 AND family_id = $2 AND archived_at IS NULL
       ORDER BY emergency_priority NULLS LAST, lower(last_name), lower(first_name), id`,
      [organizationId, familyId],
    );
    const camperRegistrations = await this.listCamperRegistrations(
      client,
      organizationId,
      familyId,
    );

    return {
      ...summary,
      adults: adults.rows.map(mapAdult),
      campers: campers.rows.map((camper) =>
        mapCamper(camper, camperRegistrations.get(camper.id) ?? []),
      ),
      contacts: contacts.rows.map(mapContact),
    };
  }

  private async requireFamilyInTenant(
    client: PoolClient,
    organizationId: string,
    familyId: string,
  ): Promise<FamilyDetailRecord> {
    const family = await this.getFamilyInTenant(client, organizationId, familyId);
    if (!family) throw new FamilyNotFoundError('Family not found');
    return family;
  }

  private async ensureFamilyExists(
    client: PoolClient,
    organizationId: string,
    familyId: string,
  ): Promise<void> {
    const result = await client.query(
      `SELECT id
       FROM families
       WHERE organization_id = $1 AND id = $2 AND archived_at IS NULL`,
      [organizationId, familyId],
    );
    if (!result.rows[0]) throw new FamilyNotFoundError('Family not found');
  }

  private async getAdultForUpdate(
    client: PoolClient,
    organizationId: string,
    familyId: string,
    adultId: string,
  ): Promise<AdultRecord> {
    const result = await client.query<AdultRow>(
      `SELECT id, organization_id, family_id, identity_subject, first_name, last_name,
              birth_date::text, email, phone, account_owner, can_manage_family, can_register,
              can_make_payments, emergency_contact, authorized_pickup,
              receives_operational_communication, version, updated_at
       FROM adults
       WHERE organization_id = $1 AND family_id = $2 AND id = $3 AND archived_at IS NULL
       FOR UPDATE`,
      [organizationId, familyId, adultId],
    );
    if (!result.rows[0]) throw new FamilyNotFoundError('Adult not found');
    return mapAdult(result.rows[0]);
  }

  private async listCamperRegistrations(
    client: PoolClient,
    organizationId: string,
    familyId: string,
  ): Promise<Map<string, CamperSessionRegistrationRecord[]>> {
    const result = await client.query<CamperSessionRegistrationRow>(
      `SELECT
         r.camper_id,
         r.id AS registration_id,
         s.id AS session_id,
         s.code AS session_code,
         s.name AS session_name,
         p.name AS program_name,
         s.starts_on::text,
         s.ends_on::text,
         r.status,
         r.source,
         r.registered_at AS updated_at
       FROM registrations r
       JOIN sessions s
         ON s.organization_id = r.organization_id
        AND s.id = r.session_id
       JOIN programs p
         ON p.organization_id = s.organization_id
        AND p.id = s.program_id
       WHERE r.organization_id = $1
         AND r.family_id = $2
         AND r.status IN ('CONFIRMED', 'WAITLISTED')
       ORDER BY
         s.starts_on,
         CASE r.status WHEN 'CONFIRMED' THEN 0 WHEN 'WAITLISTED' THEN 1 ELSE 2 END,
         s.code,
         r.id`,
      [organizationId, familyId],
    );

    const registrations = new Map<string, CamperSessionRegistrationRecord[]>();
    for (const row of result.rows) {
      const camperRegistrations = registrations.get(row.camper_id) ?? [];
      camperRegistrations.push({
        ends_on: row.ends_on,
        program_name: row.program_name,
        registered_at: timestamp(row.updated_at),
        registration_id: row.registration_id,
        session_code: row.session_code,
        session_id: row.session_id,
        session_name: row.session_name,
        source: row.source,
        starts_on: row.starts_on,
        status: row.status,
      });
      registrations.set(row.camper_id, camperRegistrations);
    }
    return registrations;
  }

  private async getCamperForUpdate(
    client: PoolClient,
    organizationId: string,
    familyId: string,
    camperId: string,
  ): Promise<CamperRecord> {
    const result = await client.query<CamperRow>(
      `SELECT id, organization_id, family_id, adult_id, first_name, last_name, birth_date::text,
              email, preferred_name, gender, school_grade,
              cabin_preference, accessibility_needs, version, updated_at
       FROM campers
       WHERE organization_id = $1 AND family_id = $2 AND id = $3 AND archived_at IS NULL
       FOR UPDATE`,
      [organizationId, familyId, camperId],
    );
    if (!result.rows[0]) throw new FamilyNotFoundError('Camper not found');
    return mapCamper(result.rows[0]);
  }

  private async getContactForUpdate(
    client: PoolClient,
    organizationId: string,
    familyId: string,
    contactId: string,
  ): Promise<ContactRecord> {
    const result = await client.query<ContactRow>(
      `SELECT id, organization_id, family_id, first_name, last_name, birth_date::text,
              email, phone,
              relationship, emergency_contact, authorized_pickup,
              receives_operational_communication, emergency_priority, version, updated_at
       FROM contacts
       WHERE organization_id = $1 AND family_id = $2 AND id = $3 AND archived_at IS NULL
       FOR UPDATE`,
      [organizationId, familyId, contactId],
    );
    if (!result.rows[0]) throw new FamilyNotFoundError('Contact not found');
    return mapContact(result.rows[0]);
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
         organization_id, actor_id, action, target_type, target_id, outcome,
         request_id, details
       ) VALUES ($1, $2, $3, $4, $5, 'success', $6, $7::jsonb)`,
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

  private mapUniqueViolation(error: unknown): never {
    const pgError = error as { code?: string; constraint?: string };
    if (pgError.code === '23505') {
      if (pgError.constraint === 'adults_family_email_normalized_idx') {
        throw new FamilyDuplicateError('This adult email is already used in the family');
      }
      if (pgError.constraint === 'campers_family_adult_id_idx') {
        throw new FamilyDuplicateError('This adult is already linked to a camper profile');
      }
      throw new FamilyDuplicateError('Family record already exists');
    }
    throw error;
  }
}
