import { randomUUID } from 'node:crypto';

import type { RequestIdentity } from '@camp-registration/auth';
import type {
  CatalogContext,
  ProgramCreate,
  ProgramFixture,
  ProgramUpdate,
  SeasonCreate,
  SeasonFixture,
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
