import { randomUUID } from 'node:crypto';

import type { RequestIdentity } from '@camp-registration/auth';
import type {
  AdultCreate,
  AdultUpdate,
  CamperCreate,
  CamperUpdate,
  ContactCreate,
  ContactUpdate,
  FamilyCreate,
  FamilyDetail,
  FamilySummary,
  FamilyUpdate,
} from '@camp-registration/contracts';
import {
  FamilyConflictError,
  FamilyDuplicateError,
  FamilyNotFoundError,
  type CamperGender,
  type FamilyStore,
} from '@camp-registration/database';

const readRoles = new Set(['camp_staff', 'camp_admin', 'organization_admin']);
const editRoles = new Set(['camp_staff', 'camp_admin', 'organization_admin']);

export class FamilyAuthorizationError extends Error {}
export class FamilyValidationError extends Error {
  constructor(
    readonly fieldErrors: Record<string, string>,
    message = 'Family details are invalid',
  ) {
    super(message);
  }
}

export interface FamilyServiceApi {
  listFamilies(): Promise<FamilySummary[]>;
  getFamily(familyId: string): Promise<FamilyDetail>;
  createFamily(family: FamilyCreate, requestId: string): Promise<FamilyDetail>;
  updateFamily(familyId: string, update: FamilyUpdate, requestId: string): Promise<FamilyDetail>;
  createAdult(familyId: string, adult: AdultCreate, requestId: string): Promise<FamilyDetail>;
  updateAdult(
    familyId: string,
    adultId: string,
    adult: AdultUpdate,
    requestId: string,
  ): Promise<FamilyDetail>;
  createCamper(familyId: string, camper: CamperCreate, requestId: string): Promise<FamilyDetail>;
  updateCamper(
    familyId: string,
    camperId: string,
    camper: CamperUpdate,
    requestId: string,
  ): Promise<FamilyDetail>;
  createContact(familyId: string, contact: ContactCreate, requestId: string): Promise<FamilyDetail>;
  updateContact(
    familyId: string,
    contactId: string,
    contact: ContactUpdate,
    requestId: string,
  ): Promise<FamilyDetail>;
}

function trimmed(value: string): string {
  return value.trim().replace(/\s+/g, ' ');
}

function nullable(value: string | null | undefined): string | null {
  const normalized = value?.trim().replace(/\s+/g, ' ');
  return normalized ? normalized : null;
}

function nullableGender(
  value: CamperCreate['gender'] | CamperUpdate['gender'],
): CamperGender | null {
  return value ?? null;
}

function normalizedEmail(value: string | null): string | null {
  return value ? value.toLowerCase() : null;
}

function isRealDate(value: string): boolean {
  const parsed = new Date(`${value}T00:00:00Z`);
  return !Number.isNaN(parsed.valueOf()) && parsed.toISOString().startsWith(value);
}

function validateFamily(family: FamilyCreate | FamilyUpdate): void {
  const errors: Record<string, string> = {};
  if (!family.family_name.trim()) errors.family_name = 'Enter a family name.';
  if (Object.keys(errors).length > 0) throw new FamilyValidationError(errors);
}

function validateAdult(adult: AdultCreate | AdultUpdate): void {
  const errors: Record<string, string> = {};
  if (!adult.first_name.trim()) errors.first_name = 'Enter a first name.';
  if (!adult.last_name.trim()) errors.last_name = 'Enter a last name.';
  if (Object.keys(errors).length > 0) {
    throw new FamilyValidationError(errors, 'Adult details are invalid');
  }
}

function validateCamper(camper: CamperCreate | CamperUpdate): void {
  const errors: Record<string, string> = {};
  if (!camper.first_name.trim()) errors.first_name = 'Enter a first name.';
  if (!camper.last_name.trim()) errors.last_name = 'Enter a last name.';
  const realBirthDate = isRealDate(camper.birth_date);
  if (!realBirthDate) errors.birth_date = 'Enter a valid birth date.';
  if (realBirthDate && camper.birth_date > new Date().toISOString().slice(0, 10)) {
    errors.birth_date = 'Birth date cannot be in the future.';
  }
  if (
    camper.gender !== undefined &&
    camper.gender !== null &&
    !['Female', 'Male'].includes(camper.gender)
  ) {
    errors.gender = 'Select Female or Male.';
  }
  if (Object.keys(errors).length > 0) {
    throw new FamilyValidationError(errors, 'Camper details are invalid');
  }
}

function validateContact(contact: ContactCreate | ContactUpdate): void {
  const errors: Record<string, string> = {};
  if (!contact.first_name.trim()) errors.first_name = 'Enter a first name.';
  if (!contact.last_name.trim()) errors.last_name = 'Enter a last name.';
  if (!contact.phone.trim()) errors.phone = 'Enter a phone number.';
  if (!contact.relationship.trim()) errors.relationship = 'Enter a relationship.';
  if (
    !contact.emergency_contact &&
    !contact.authorized_pickup &&
    !contact.receives_operational_communication
  ) {
    errors.roles = 'Select at least one contact role.';
  }
  if (contact.emergency_priority !== null && contact.emergency_priority !== undefined) {
    if (!contact.emergency_contact) {
      errors.emergency_priority = 'Priority only applies to emergency contacts.';
    }
  }
  if (Object.keys(errors).length > 0) {
    throw new FamilyValidationError(errors, 'Contact details are invalid');
  }
}

export class FamilyService implements FamilyServiceApi {
  private readonly membership;

  constructor(
    private readonly store: FamilyStore,
    private readonly identity: RequestIdentity,
    private readonly organizationId: string,
  ) {
    this.membership = identity.memberships.find(
      (membership) => membership.organizationId === organizationId,
    );
  }

  private authorize(allowedRoles: Set<string>): void {
    if (!this.membership?.roles.some((role) => allowedRoles.has(role))) {
      throw new FamilyAuthorizationError('Family access is not permitted');
    }
  }

  private context(requestId: string) {
    return {
      actorId: this.identity.subject,
      organizationId: this.organizationId,
      requestId,
    };
  }

  async listFamilies(): Promise<FamilySummary[]> {
    this.authorize(readRoles);
    return this.store.listFamilies(this.organizationId);
  }

  async getFamily(familyId: string): Promise<FamilyDetail> {
    this.authorize(readRoles);
    const family = await this.store.getFamily(this.organizationId, familyId);
    if (!family) throw new FamilyNotFoundError('Family not found');
    return family;
  }

  async createFamily(family: FamilyCreate, requestId: string): Promise<FamilyDetail> {
    this.authorize(editRoles);
    validateFamily(family);
    return this.store.createFamily(this.context(requestId), {
      family_name: trimmed(family.family_name),
      id: randomUUID(),
    });
  }

  async updateFamily(
    familyId: string,
    update: FamilyUpdate,
    requestId: string,
  ): Promise<FamilyDetail> {
    this.authorize(editRoles);
    validateFamily(update);
    return this.store.updateFamily({
      ...this.context(requestId),
      familyId,
      update: { family_name: trimmed(update.family_name), version: update.version },
    });
  }

  async createAdult(
    familyId: string,
    adult: AdultCreate,
    requestId: string,
  ): Promise<FamilyDetail> {
    this.authorize(editRoles);
    validateAdult(adult);
    const email = nullable(adult.email);
    return this.store.createAdult(this.context(requestId), {
      account_owner: adult.account_owner,
      authorized_pickup: adult.authorized_pickup,
      can_make_payments: adult.can_make_payments,
      can_manage_family: adult.can_manage_family,
      can_register: adult.can_register,
      email,
      email_normalized: normalizedEmail(email),
      emergency_contact: adult.emergency_contact,
      family_id: familyId,
      first_name: trimmed(adult.first_name),
      id: randomUUID(),
      identity_subject: null,
      last_name: trimmed(adult.last_name),
      phone: nullable(adult.phone),
      receives_operational_communication: adult.receives_operational_communication,
    });
  }

  async updateAdult(
    familyId: string,
    adultId: string,
    adult: AdultUpdate,
    requestId: string,
  ): Promise<FamilyDetail> {
    this.authorize(editRoles);
    validateAdult(adult);
    const email = nullable(adult.email);
    return this.store.updateAdult({
      ...this.context(requestId),
      adultId,
      familyId,
      update: {
        account_owner: adult.account_owner,
        authorized_pickup: adult.authorized_pickup,
        can_make_payments: adult.can_make_payments,
        can_manage_family: adult.can_manage_family,
        can_register: adult.can_register,
        email,
        email_normalized: normalizedEmail(email),
        emergency_contact: adult.emergency_contact,
        first_name: trimmed(adult.first_name),
        last_name: trimmed(adult.last_name),
        phone: nullable(adult.phone),
        receives_operational_communication: adult.receives_operational_communication,
        version: adult.version,
      },
    });
  }

  async createCamper(
    familyId: string,
    camper: CamperCreate,
    requestId: string,
  ): Promise<FamilyDetail> {
    this.authorize(editRoles);
    validateCamper(camper);
    return this.store.createCamper(this.context(requestId), {
      accessibility_needs: nullable(camper.accessibility_needs),
      birth_date: camper.birth_date,
      cabin_preference: nullable(camper.cabin_preference),
      family_id: familyId,
      first_name: trimmed(camper.first_name),
      gender: nullableGender(camper.gender),
      id: randomUUID(),
      last_name: trimmed(camper.last_name),
      preferred_name: nullable(camper.preferred_name),
      school_grade: nullable(camper.school_grade),
    });
  }

  async updateCamper(
    familyId: string,
    camperId: string,
    camper: CamperUpdate,
    requestId: string,
  ): Promise<FamilyDetail> {
    this.authorize(editRoles);
    validateCamper(camper);
    return this.store.updateCamper({
      ...this.context(requestId),
      camperId,
      familyId,
      update: {
        accessibility_needs: nullable(camper.accessibility_needs),
        birth_date: camper.birth_date,
        cabin_preference: nullable(camper.cabin_preference),
        first_name: trimmed(camper.first_name),
        gender: nullableGender(camper.gender),
        last_name: trimmed(camper.last_name),
        preferred_name: nullable(camper.preferred_name),
        school_grade: nullable(camper.school_grade),
        version: camper.version,
      },
    });
  }

  async createContact(
    familyId: string,
    contact: ContactCreate,
    requestId: string,
  ): Promise<FamilyDetail> {
    this.authorize(editRoles);
    validateContact(contact);
    return this.store.createContact(this.context(requestId), {
      authorized_pickup: contact.authorized_pickup,
      emergency_contact: contact.emergency_contact,
      emergency_priority: contact.emergency_contact ? (contact.emergency_priority ?? null) : null,
      family_id: familyId,
      first_name: trimmed(contact.first_name),
      id: randomUUID(),
      last_name: trimmed(contact.last_name),
      phone: trimmed(contact.phone),
      receives_operational_communication: contact.receives_operational_communication,
      relationship: trimmed(contact.relationship),
    });
  }

  async updateContact(
    familyId: string,
    contactId: string,
    contact: ContactUpdate,
    requestId: string,
  ): Promise<FamilyDetail> {
    this.authorize(editRoles);
    validateContact(contact);
    return this.store.updateContact({
      ...this.context(requestId),
      contactId,
      familyId,
      update: {
        authorized_pickup: contact.authorized_pickup,
        emergency_contact: contact.emergency_contact,
        emergency_priority: contact.emergency_contact ? (contact.emergency_priority ?? null) : null,
        first_name: trimmed(contact.first_name),
        last_name: trimmed(contact.last_name),
        phone: trimmed(contact.phone),
        receives_operational_communication: contact.receives_operational_communication,
        relationship: trimmed(contact.relationship),
        version: contact.version,
      },
    });
  }
}

export { FamilyConflictError, FamilyDuplicateError, FamilyNotFoundError };
