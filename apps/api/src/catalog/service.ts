import { randomUUID } from 'node:crypto';

import type { RequestIdentity } from '@camp-registration/auth';
import type {
  CatalogContext,
  OrganizationFixture,
  OrganizationSettingsUpdate,
  ProgramCreate,
  ProgramFixture,
  ProgramUpdate,
  SeasonCreate,
  SeasonFixture,
  SessionAttendanceUpdate,
  SessionCreate,
  SessionDetail,
  SessionSummary,
  SessionUpdate,
} from '@camp-registration/contracts';
import {
  CatalogCapacityError,
  CatalogConflictError,
  CatalogDuplicateError,
  CatalogNotFoundError,
  CatalogReferenceError,
} from '@camp-registration/database';
import type { CatalogStore } from '@camp-registration/database';

const readRoles = new Set(['parent_guardian', 'camp_staff', 'camp_admin', 'organization_admin']);
const editRoles = new Set(['camp_admin', 'organization_admin']);
const attendanceRoles = new Set(['camp_staff', 'camp_admin', 'organization_admin']);

export class CatalogAuthorizationError extends Error {}
export class CatalogValidationError extends Error {
  constructor(
    readonly fieldErrors: Record<string, string>,
    message = 'Session details are invalid',
  ) {
    super(message);
  }
}

export interface CatalogServiceApi {
  getContext(): Promise<CatalogContext>;
  updateOrganizationSettings(
    settings: OrganizationSettingsUpdate,
    requestId: string,
  ): Promise<OrganizationFixture>;
  listSessions(): Promise<SessionSummary[]>;
  getSession(sessionId: string): Promise<SessionDetail>;
  createProgram(program: ProgramCreate, requestId: string): Promise<ProgramFixture>;
  updateProgram(
    programId: string,
    update: ProgramUpdate,
    requestId: string,
  ): Promise<ProgramFixture>;
  createSeason(season: SeasonCreate, requestId: string): Promise<SeasonFixture>;
  createSession(session: SessionCreate, requestId: string): Promise<SessionDetail>;
  updateSessionAttendance(
    sessionId: string,
    registrationId: string,
    update: SessionAttendanceUpdate,
    requestId: string,
  ): Promise<SessionDetail>;
  updateSession(
    sessionId: string,
    update: SessionUpdate,
    requestId: string,
  ): Promise<SessionDetail>;
}

function isRealDate(value: string): boolean {
  const parsed = new Date(`${value}T00:00:00Z`);
  return !Number.isNaN(parsed.valueOf()) && parsed.toISOString().startsWith(value);
}

function validateSessionTiming(update: SessionCreate | SessionUpdate): Record<string, string> {
  const errors: Record<string, string> = {};

  if (!isRealDate(update.starts_on)) errors.starts_on = 'Enter a valid start date.';
  if (!isRealDate(update.ends_on)) errors.ends_on = 'Enter a valid end date.';
  if (update.starts_on > update.ends_on)
    errors.ends_on = 'End date must be on or after start date.';
  if (Date.parse(update.registration_opens_at) >= Date.parse(update.registration_closes_at)) {
    errors.registration_closes_at = 'Registration must close after it opens.';
  }
  if (Date.parse(update.registration_closes_at) >= Date.parse(`${update.starts_on}T23:59:59Z`)) {
    errors.registration_closes_at = 'Registration must close before the session starts.';
  }
  if (!update.name.trim()) errors.name = 'Enter a session name.';

  return errors;
}

function validateSessionCreate(session: SessionCreate): void {
  const errors = validateSessionTiming(session);
  if (Object.keys(errors).length > 0) throw new CatalogValidationError(errors);
}

function validateSessionUpdate(update: SessionUpdate): void {
  const errors = validateSessionTiming(update);

  if (update.minimum_age > update.maximum_age) {
    errors.maximum_age = 'Maximum age must be at least the minimum age.';
  }
  if (update.deposit_cents > update.price_cents) {
    errors.deposit_cents = 'Deposit cannot exceed tuition.';
  }

  if (Object.keys(errors).length > 0) throw new CatalogValidationError(errors);
}

function validateProgram(program: ProgramCreate | ProgramUpdate): void {
  const errors: Record<string, string> = {};
  if (!program.name.trim()) errors.name = 'Enter a program name.';
  if (!program.description.trim()) errors.description = 'Enter a program description.';
  if (program.default_minimum_age > program.default_maximum_age) {
    errors.default_maximum_age = 'Maximum age must be at least the minimum age.';
  }
  if (program.default_minimum_grade > program.default_maximum_grade) {
    errors.default_maximum_grade = 'Maximum grade must be at least the minimum grade.';
  }
  if (program.default_deposit_cents > program.default_price_cents) {
    errors.default_deposit_cents = 'Deposit cannot exceed tuition.';
  }
  if (Object.keys(errors).length > 0) {
    throw new CatalogValidationError(errors, 'Program details are invalid');
  }
}

function validateSeason(season: SeasonCreate): void {
  const errors: Record<string, string> = {};
  if (!season.name.trim()) errors.name = 'Enter a season name.';
  if (Object.keys(errors).length > 0) {
    throw new CatalogValidationError(errors, 'Season details are invalid');
  }
}

function todayLocalDate(): string {
  return new Date().toISOString().slice(0, 10);
}

function cleanOptionalText(value: string | null | undefined): string | null {
  const trimmed = value?.trim();
  return trimmed ? trimmed : null;
}

function validateSessionAttendance(update: SessionAttendanceUpdate): Record<string, string> {
  const errors: Record<string, string> = {};
  if (update.attendance_date && !isRealDate(update.attendance_date)) {
    errors.attendance_date = 'Enter a valid attendance date.';
  }
  if (update.action === 'CHECK_OUT' && !cleanOptionalText(update.pickup_name)) {
    errors.pickup_name = 'Enter who picked up the camper.';
  }
  return errors;
}

export class CatalogService implements CatalogServiceApi {
  private readonly membership;

  constructor(
    private readonly store: CatalogStore,
    private readonly identity: RequestIdentity,
    private readonly organizationId: string,
  ) {
    this.membership = identity.memberships.find(
      (membership) => membership.organizationId === organizationId,
    );
  }

  private authorize(allowedRoles: Set<string>): void {
    if (!this.membership?.roles.some((role) => allowedRoles.has(role))) {
      throw new CatalogAuthorizationError('Catalog access is not permitted');
    }
  }

  async getContext(): Promise<CatalogContext> {
    this.authorize(readRoles);
    return this.store.getContext(this.organizationId);
  }

  async updateOrganizationSettings(
    settings: OrganizationSettingsUpdate,
    requestId: string,
  ): Promise<OrganizationFixture> {
    this.authorize(editRoles);
    return this.store.updateOrganizationSettings({
      actorId: this.identity.subject,
      organizationId: this.organizationId,
      requestId,
      ...(Object.prototype.hasOwnProperty.call(settings, 'stripe_connected_account_id')
        ? { stripeConnectedAccountId: settings.stripe_connected_account_id ?? null }
        : {}),
      selfServiceSignupEnabled: settings.self_service_signup_enabled,
      waitlistOfferDurationHours: settings.waitlist_offer_duration_hours,
    });
  }

  async listSessions(): Promise<SessionSummary[]> {
    this.authorize(readRoles);
    return this.store.listSessions(this.organizationId);
  }

  async getSession(sessionId: string): Promise<SessionDetail> {
    this.authorize(readRoles);
    const session = await this.store.getSession(this.organizationId, sessionId);
    if (!session) throw new CatalogNotFoundError('Session not found');
    return session;
  }

  async createProgram(program: ProgramCreate, requestId: string): Promise<ProgramFixture> {
    this.authorize(editRoles);
    validateProgram(program);
    return this.store.createProgram(
      {
        actorId: this.identity.subject,
        organizationId: this.organizationId,
        requestId,
      },
      {
        ...program,
        description: program.description.trim(),
        id: randomUUID(),
        name: program.name.trim(),
      },
    );
  }

  async updateProgram(
    programId: string,
    update: ProgramUpdate,
    requestId: string,
  ): Promise<ProgramFixture> {
    this.authorize(editRoles);
    validateProgram(update);
    return this.store.updateProgram({
      actorId: this.identity.subject,
      organizationId: this.organizationId,
      programId,
      requestId,
      update: {
        ...update,
        description: update.description.trim(),
        name: update.name.trim(),
      },
    });
  }

  async createSeason(season: SeasonCreate, requestId: string): Promise<SeasonFixture> {
    this.authorize(editRoles);
    validateSeason(season);
    return this.store.createSeason(
      {
        actorId: this.identity.subject,
        organizationId: this.organizationId,
        requestId,
      },
      { ...season, id: randomUUID(), name: season.name.trim() },
    );
  }

  async createSession(session: SessionCreate, requestId: string): Promise<SessionDetail> {
    this.authorize(editRoles);
    validateSessionCreate(session);
    return this.store.createSession(
      {
        actorId: this.identity.subject,
        organizationId: this.organizationId,
        requestId,
      },
      { ...session, id: randomUUID(), name: session.name.trim() },
    );
  }

  async updateSessionAttendance(
    sessionId: string,
    registrationId: string,
    update: SessionAttendanceUpdate,
    requestId: string,
  ): Promise<SessionDetail> {
    this.authorize(attendanceRoles);
    const errors = validateSessionAttendance(update);
    if (Object.keys(errors).length > 0) {
      throw new CatalogValidationError(errors, 'Attendance details are invalid');
    }
    return this.store.updateSessionAttendance({
      actorId: this.identity.subject,
      organizationId: this.organizationId,
      registrationId,
      requestId,
      sessionId,
      update: {
        action: update.action,
        attendance_date: update.attendance_date ?? todayLocalDate(),
        note: cleanOptionalText(update.note),
        pickup_name: cleanOptionalText(update.pickup_name),
      },
    });
  }

  async updateSession(
    sessionId: string,
    update: SessionUpdate,
    requestId: string,
  ): Promise<SessionDetail> {
    this.authorize(editRoles);
    validateSessionUpdate(update);
    return this.store.updateSession({
      actorId: this.identity.subject,
      organizationId: this.organizationId,
      requestId,
      sessionId,
      update,
    });
  }
}

export {
  CatalogCapacityError,
  CatalogConflictError,
  CatalogDuplicateError,
  CatalogNotFoundError,
  CatalogReferenceError,
};
