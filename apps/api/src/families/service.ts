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
  FamilyRegistrationCreate,
  FamilyRegistrationResult,
  FamilySummary,
  FamilyUpdate,
  ParentCheckoutCreate,
} from '@camp-registration/contracts';
import {
  FamilyConflictError,
  FamilyDuplicateError,
  FamilyNotFoundError,
  FamilyRegistrationCapacityError,
  FamilyRegistrationDuplicateError,
  FamilyRegistrationEligibilityError,
  type CamperGender,
  type FamilyStore,
} from '@camp-registration/database';

const readRoles = new Set(['camp_staff', 'camp_admin', 'organization_admin']);
const editRoles = new Set(['camp_staff', 'camp_admin', 'organization_admin']);
const parentRoles = new Set(['parent_guardian']);

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
  claimAdultIdentity(familyId: string, adultId: string, requestId: string): Promise<FamilyDetail>;
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
  createRegistration(
    familyId: string,
    registration: FamilyRegistrationCreate,
    requestId: string,
  ): Promise<FamilyRegistrationResult>;
  createParentCheckout(
    familyId: string,
    checkout: ParentCheckoutCreate,
    requestId: string,
  ): Promise<FamilyRegistrationResult>;
  cancelRegistration(
    familyId: string,
    registrationId: string,
    requestId: string,
  ): Promise<FamilyRegistrationResult>;
  promoteNextWaitlistRegistration(
    sessionId: string,
    requestId: string,
  ): Promise<FamilyRegistrationResult>;
}

function trimmed(value: string): string {
  return value.trim().replace(/\s+/g, ' ');
}

function nullable(value: string | null | undefined): string | null {
  const normalized = value?.trim().replace(/\s+/g, ' ');
  return normalized ? normalized : null;
}

function nullableDate(value: string | null | undefined): string | null {
  const normalized = value?.trim();
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

function normalizedCamperRecord(familyId: string, camper: CamperCreate, id: string) {
  const email = nullable(camper.email);
  return {
    accessibility_needs: nullable(camper.accessibility_needs),
    adult_id: camper.adult_id ?? null,
    birth_date: camper.birth_date,
    cabin_preference: nullable(camper.cabin_preference),
    email,
    email_normalized: normalizedEmail(email),
    family_id: familyId,
    first_name: trimmed(camper.first_name),
    gender: nullableGender(camper.gender),
    id,
    last_name: trimmed(camper.last_name),
    preferred_name: nullable(camper.preferred_name),
    school_grade: nullable(camper.school_grade),
  };
}

function isRealDate(value: string): boolean {
  const parsed = new Date(`${value}T00:00:00Z`);
  return !Number.isNaN(parsed.valueOf()) && parsed.toISOString().startsWith(value);
}

function validateNullableBirthDate(
  value: string | null | undefined,
  errors: Record<string, string>,
): void {
  const birthDate = nullableDate(value);
  if (!birthDate) return;
  const realBirthDate = isRealDate(birthDate);
  if (!realBirthDate) {
    errors.birth_date = 'Enter a valid birth date.';
    return;
  }
  if (birthDate > new Date().toISOString().slice(0, 10)) {
    errors.birth_date = 'Birth date cannot be in the future.';
  }
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
  validateNullableBirthDate(adult.birth_date, errors);
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
  validateNullableBirthDate(contact.birth_date, errors);
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

  private hasRole(allowedRoles: Set<string>): boolean {
    return Boolean(this.membership?.roles.some((role) => allowedRoles.has(role)));
  }

  private async authorizeFamilyRead(familyId: string): Promise<void> {
    if (this.hasRole(readRoles)) return;
    this.authorize(parentRoles);
    const allowed = await this.store.adultIdentityCanAccessFamily(
      this.organizationId,
      familyId,
      this.identity.subject,
    );
    if (!allowed) throw new FamilyAuthorizationError('Family access is not permitted');
  }

  private async authorizeParentRegistration(familyId: string): Promise<void> {
    if (this.hasRole(editRoles)) return;
    this.authorize(parentRoles);
    const allowed = await this.store.adultIdentityCanRegisterFamily(
      this.organizationId,
      familyId,
      this.identity.subject,
    );
    if (!allowed) throw new FamilyAuthorizationError('Family registration is not permitted');
  }

  private async authorizeFamilyManage(familyId: string): Promise<void> {
    if (this.hasRole(editRoles)) return;
    this.authorize(parentRoles);
    const allowed = await this.store.adultIdentityCanManageFamily(
      this.organizationId,
      familyId,
      this.identity.subject,
    );
    if (!allowed) throw new FamilyAuthorizationError('Family management is not permitted');
  }

  private authorizeRegistration(source: FamilyRegistrationCreate['source']): void {
    if (source === 'ADMIN') {
      this.authorize(editRoles);
      return;
    }
    if (!this.hasRole(editRoles)) this.authorize(parentRoles);
  }

  private context(requestId: string) {
    return {
      actorId: this.identity.subject,
      organizationId: this.organizationId,
      requestId,
    };
  }

  async listFamilies(): Promise<FamilySummary[]> {
    if (!this.hasRole(readRoles)) {
      this.authorize(parentRoles);
      return this.store.listFamiliesForAdultIdentity(this.organizationId, this.identity.subject);
    }
    return this.store.listFamilies(this.organizationId);
  }

  async getFamily(familyId: string): Promise<FamilyDetail> {
    await this.authorizeFamilyRead(familyId);
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

  async claimAdultIdentity(
    familyId: string,
    adultId: string,
    requestId: string,
  ): Promise<FamilyDetail> {
    this.authorize(parentRoles);
    if (!this.identity.emailVerified) {
      throw new FamilyAuthorizationError('Verified email is required to claim family access');
    }
    return this.store.claimAdultIdentity(
      this.context(requestId),
      familyId,
      adultId,
      this.identity.email.toLowerCase(),
    );
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
      birth_date: nullableDate(adult.birth_date),
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
        birth_date: nullableDate(adult.birth_date),
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
    await this.authorizeFamilyManage(familyId);
    validateCamper(camper);
    return this.store.createCamper(
      this.context(requestId),
      normalizedCamperRecord(familyId, camper, randomUUID()),
    );
  }

  async updateCamper(
    familyId: string,
    camperId: string,
    camper: CamperUpdate,
    requestId: string,
  ): Promise<FamilyDetail> {
    await this.authorizeFamilyManage(familyId);
    validateCamper(camper);
    const email = nullable(camper.email);
    return this.store.updateCamper({
      ...this.context(requestId),
      camperId,
      familyId,
      update: {
        accessibility_needs: nullable(camper.accessibility_needs),
        adult_id: camper.adult_id ?? null,
        birth_date: camper.birth_date,
        cabin_preference: nullable(camper.cabin_preference),
        email,
        email_normalized: normalizedEmail(email),
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
    await this.authorizeFamilyManage(familyId);
    validateContact(contact);
    const email = nullable(contact.email);
    return this.store.createContact(this.context(requestId), {
      authorized_pickup: contact.authorized_pickup,
      birth_date: nullableDate(contact.birth_date),
      email,
      email_normalized: normalizedEmail(email),
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
    await this.authorizeFamilyManage(familyId);
    validateContact(contact);
    const email = nullable(contact.email);
    return this.store.updateContact({
      ...this.context(requestId),
      contactId,
      familyId,
      update: {
        authorized_pickup: contact.authorized_pickup,
        birth_date: nullableDate(contact.birth_date),
        email,
        email_normalized: normalizedEmail(email),
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

  async createRegistration(
    familyId: string,
    registration: FamilyRegistrationCreate,
    requestId: string,
  ): Promise<FamilyRegistrationResult> {
    this.authorizeRegistration(registration.source);
    if (registration.source === 'PARENT') await this.authorizeParentRegistration(familyId);
    return this.store.createRegistration(this.context(requestId), {
      camper_id: registration.camper_id,
      family_id: familyId,
      id: randomUUID(),
      session_id: registration.session_id,
      source: registration.source,
    });
  }

  async createParentCheckout(
    familyId: string,
    checkout: ParentCheckoutCreate,
    requestId: string,
  ): Promise<FamilyRegistrationResult> {
    await this.authorizeParentRegistration(familyId);
    const hasExistingCamper = Boolean(checkout.existing_camper_id);
    const hasNewCamper = Boolean(checkout.new_camper);
    if (hasExistingCamper === hasNewCamper) {
      throw new FamilyValidationError(
        { camper_id: 'Select an existing camper or enter a new camper.' },
        'Registration checkout is invalid',
      );
    }

    let newCamper = null;
    if (checkout.new_camper) {
      validateCamper(checkout.new_camper);
      newCamper = normalizedCamperRecord(familyId, checkout.new_camper, randomUUID());
    }

    return this.store.createParentCheckout(this.context(requestId), {
      family_id: familyId,
      new_camper: newCamper,
      registration_id: randomUUID(),
      selected_camper_id: checkout.existing_camper_id ?? null,
      session_id: checkout.session_id,
    });
  }

  async cancelRegistration(
    familyId: string,
    registrationId: string,
    requestId: string,
  ): Promise<FamilyRegistrationResult> {
    await this.authorizeParentRegistration(familyId);
    return this.store.cancelRegistration(this.context(requestId), familyId, registrationId);
  }

  async promoteNextWaitlistRegistration(
    sessionId: string,
    requestId: string,
  ): Promise<FamilyRegistrationResult> {
    this.authorize(editRoles);
    return this.store.promoteNextWaitlistRegistration(this.context(requestId), sessionId);
  }
}

export { FamilyConflictError, FamilyDuplicateError, FamilyNotFoundError };
export {
  FamilyRegistrationCapacityError,
  FamilyRegistrationDuplicateError,
  FamilyRegistrationEligibilityError,
};
