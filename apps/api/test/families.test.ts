import type {
  Adult,
  AdultCreate,
  AdultUpdate,
  Camper,
  CamperCreate,
  CamperUpdate,
  Contact,
  ContactCreate,
  ContactUpdate,
  FamilyCreate,
  FamilyDetail,
  FamilyRegistrationCreate,
  FamilyRegistrationResult,
  FamilySummary,
  FamilyUpdate,
} from '@camp-registration/contracts';
import type { RequestIdentity } from '@camp-registration/auth';
import { FamilyConflictError } from '@camp-registration/database';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { buildApp } from '../src/app.js';
import { FamilyService, type FamilyServiceApi } from '../src/families/service.js';

const organizationId = 'a60b272f-b028-4f1a-b666-3ef3cffd9827';
const familyId = '0f6dcf52-c873-44df-a597-9a0a51bf5067';
const adultId = '0742eb07-e15d-4651-a4d5-64a7782ed447';
const camperId = '519e28fd-7490-4dc4-a615-dc7569452a3c';
const contactId = 'aafce65f-6d8a-4b99-a558-9f99d8355881';

const summary: FamilySummary = {
  adult_count: 1,
  camper_count: 1,
  contact_count: 1,
  family_name: 'Smith Family',
  id: familyId,
  organization_id: organizationId,
  updated_at: '2026-06-23T12:00:00Z',
  version: 1,
};

const adult: Adult = {
  account_owner: true,
  authorized_pickup: true,
  can_make_payments: true,
  can_manage_family: true,
  can_register: true,
  email: 'parent@example.test',
  emergency_contact: true,
  family_id: familyId,
  first_name: 'Jordan',
  id: adultId,
  identity_subject: null,
  last_name: 'Smith',
  organization_id: organizationId,
  phone: '555-0100',
  receives_operational_communication: true,
  updated_at: '2026-06-23T12:00:00Z',
  version: 1,
};

const camper: Camper = {
  accessibility_needs: null,
  birth_date: '2017-03-08',
  cabin_preference: null,
  family_id: familyId,
  first_name: 'Avery',
  gender: 'Female',
  id: camperId,
  last_name: 'Smith',
  organization_id: organizationId,
  preferred_name: null,
  registrations: [],
  school_grade: '4',
  updated_at: '2026-06-23T12:00:00Z',
  version: 1,
};

const contact: Contact = {
  authorized_pickup: true,
  emergency_contact: true,
  emergency_priority: 1,
  family_id: familyId,
  first_name: 'Taylor',
  id: contactId,
  last_name: 'Jones',
  organization_id: organizationId,
  phone: '555-0199',
  receives_operational_communication: false,
  relationship: 'Aunt',
  updated_at: '2026-06-23T12:00:00Z',
  version: 1,
};

const detail: FamilyDetail = {
  ...summary,
  adults: [adult],
  campers: [camper],
  contacts: [contact],
};

const familyCreate: FamilyCreate = { family_name: 'Smith Family' };
const familyUpdate: FamilyUpdate = { family_name: 'Smith-Jones Family', version: 1 };
const adultCreate: AdultCreate = {
  account_owner: true,
  authorized_pickup: true,
  can_make_payments: true,
  can_manage_family: true,
  can_register: true,
  email: 'parent@example.test',
  emergency_contact: true,
  first_name: 'Jordan',
  last_name: 'Smith',
  phone: '555-0100',
  receives_operational_communication: true,
};
const adultUpdate: AdultUpdate = { ...adultCreate, version: 1 };
const camperCreate: CamperCreate = {
  birth_date: '2017-03-08',
  first_name: 'Avery',
  gender: 'Female',
  last_name: 'Smith',
  school_grade: '4',
};
const camperUpdate: CamperUpdate = { ...camperCreate, version: 1 };
const contactCreate: ContactCreate = {
  authorized_pickup: true,
  emergency_contact: true,
  emergency_priority: 1,
  first_name: 'Taylor',
  last_name: 'Jones',
  phone: '555-0199',
  receives_operational_communication: false,
  relationship: 'Aunt',
};
const contactUpdate: ContactUpdate = { ...contactCreate, version: 1 };
const registrationCreate: FamilyRegistrationCreate = {
  camper_id: camperId,
  session_id: '06c02070-2e63-4b7b-bd93-578e54fa1ea6',
  source: 'ADMIN',
};
const registrationResult: FamilyRegistrationResult = {
  family: {
    ...detail,
    campers: [
      {
        ...camper,
        registrations: [
          {
            ends_on: '2027-07-10',
            program_name: 'High School Camp',
            registered_at: '2026-06-27T12:00:00Z',
            registration_id: '20f3a0c5-cad9-4c1d-b77b-b4751805ad83',
            session_code: 'HS-2027-01',
            session_id: registrationCreate.session_id,
            session_name: 'High School Camp 1',
            source: 'ADMIN',
            starts_on: '2027-07-04',
            status: 'CONFIRMED',
          },
        ],
      },
    ],
  },
  registration: {
    ends_on: '2027-07-10',
    program_name: 'High School Camp',
    registered_at: '2026-06-27T12:00:00Z',
    registration_id: '20f3a0c5-cad9-4c1d-b77b-b4751805ad83',
    session_code: 'HS-2027-01',
    session_id: registrationCreate.session_id,
    session_name: 'High School Camp 1',
    source: 'ADMIN',
    starts_on: '2027-07-04',
    status: 'CONFIRMED',
  },
};

describe('family routes', () => {
  const applications: Awaited<ReturnType<typeof buildApp>>[] = [];

  afterEach(async () => {
    await Promise.all(applications.splice(0).map((app) => app.close()));
  });

  it('lists, reads, and writes family records through the documented API', async () => {
    const service = fakeService();
    const app = await buildApp({ familyService: service });
    applications.push(app);

    const listResponse = await app.inject({ method: 'GET', url: '/v1/families' });
    const detailResponse = await app.inject({ method: 'GET', url: `/v1/families/${familyId}` });
    const createResponse = await app.inject({
      headers: { 'x-request-id': 'family-create-route-test' },
      method: 'POST',
      payload: familyCreate,
      url: '/v1/families',
    });
    const updateResponse = await app.inject({
      headers: { 'x-request-id': 'family-update-route-test' },
      method: 'PATCH',
      payload: familyUpdate,
      url: `/v1/families/${familyId}`,
    });

    expect(listResponse.statusCode).toBe(200);
    expect(listResponse.json()).toEqual({ families: [summary] });
    expect(detailResponse.statusCode).toBe(200);
    expect(detailResponse.json()).toEqual(detail);
    expect(createResponse.statusCode).toBe(201);
    expect(createResponse.json()).toEqual(detail);
    expect(service.createFamily).toHaveBeenCalledWith(familyCreate, 'family-create-route-test');
    expect(updateResponse.statusCode).toBe(200);
    expect(service.updateFamily).toHaveBeenCalledWith(
      familyId,
      familyUpdate,
      'family-update-route-test',
    );
  });

  it('writes nested adult, camper, and contact records', async () => {
    const service = fakeService();
    const app = await buildApp({ familyService: service });
    applications.push(app);

    const adultResponse = await app.inject({
      headers: { 'x-request-id': 'adult-create-route-test' },
      method: 'POST',
      payload: adultCreate,
      url: `/v1/families/${familyId}/adults`,
    });
    const adultUpdateResponse = await app.inject({
      headers: { 'x-request-id': 'adult-update-route-test' },
      method: 'PATCH',
      payload: adultUpdate,
      url: `/v1/families/${familyId}/adults/${adultId}`,
    });
    const camperResponse = await app.inject({
      headers: { 'x-request-id': 'camper-create-route-test' },
      method: 'POST',
      payload: camperCreate,
      url: `/v1/families/${familyId}/campers`,
    });
    const camperUpdateResponse = await app.inject({
      headers: { 'x-request-id': 'camper-update-route-test' },
      method: 'PATCH',
      payload: camperUpdate,
      url: `/v1/families/${familyId}/campers/${camperId}`,
    });
    const contactResponse = await app.inject({
      headers: { 'x-request-id': 'contact-create-route-test' },
      method: 'POST',
      payload: contactCreate,
      url: `/v1/families/${familyId}/contacts`,
    });
    const contactUpdateResponse = await app.inject({
      headers: { 'x-request-id': 'contact-update-route-test' },
      method: 'PATCH',
      payload: contactUpdate,
      url: `/v1/families/${familyId}/contacts/${contactId}`,
    });

    expect(adultResponse.statusCode).toBe(201);
    expect(adultUpdateResponse.statusCode).toBe(200);
    expect(camperResponse.statusCode).toBe(201);
    expect(camperUpdateResponse.statusCode).toBe(200);
    expect(contactResponse.statusCode).toBe(201);
    expect(contactUpdateResponse.statusCode).toBe(200);
    expect(service.createAdult).toHaveBeenCalledWith(
      familyId,
      adultCreate,
      'adult-create-route-test',
    );
    expect(service.updateAdult).toHaveBeenCalledWith(
      familyId,
      adultId,
      adultUpdate,
      'adult-update-route-test',
    );
    expect(service.createCamper).toHaveBeenCalledWith(
      familyId,
      camperCreate,
      'camper-create-route-test',
    );
    expect(service.updateCamper).toHaveBeenCalledWith(
      familyId,
      camperId,
      camperUpdate,
      'camper-update-route-test',
    );
    expect(service.createContact).toHaveBeenCalledWith(
      familyId,
      contactCreate,
      'contact-create-route-test',
    );
    expect(service.updateContact).toHaveBeenCalledWith(
      familyId,
      contactId,
      contactUpdate,
      'contact-update-route-test',
    );
  });

  it('creates camper registrations through the family API', async () => {
    const service = fakeService();
    const app = await buildApp({ familyService: service });
    applications.push(app);

    const response = await app.inject({
      headers: { 'x-request-id': 'registration-create-route-test' },
      method: 'POST',
      payload: registrationCreate,
      url: `/v1/families/${familyId}/registrations`,
    });

    expect(response.statusCode).toBe(201);
    expect(response.json()).toEqual(registrationResult);
    expect(service.createRegistration).toHaveBeenCalledWith(
      familyId,
      registrationCreate,
      'registration-create-route-test',
    );
  });

  it('returns a stable conflict response', async () => {
    const service = fakeService();
    service.updateFamily = vi.fn().mockRejectedValue(new FamilyConflictError('Stale version'));
    const app = await buildApp({ familyService: service });
    applications.push(app);

    const response = await app.inject({
      method: 'PATCH',
      payload: familyUpdate,
      url: `/v1/families/${familyId}`,
    });

    expect(response.statusCode).toBe(409);
    expect(response.json()).toEqual({ code: 'version_conflict', message: 'Stale version' });
  });
});

describe('family service validation', () => {
  it('rejects invalid camper and contact input before persistence', async () => {
    const store = {
      createCamper: vi.fn(),
      createContact: vi.fn(),
    };
    const service = new FamilyService(store as never, localIdentity, organizationId);

    await expect(
      service.createCamper(
        familyId,
        { birth_date: '2026-99-99', first_name: '', last_name: 'Smith' },
        'invalid-camper-test',
      ),
    ).rejects.toMatchObject({
      fieldErrors: {
        birth_date: 'Enter a valid birth date.',
        first_name: 'Enter a first name.',
      },
    });
    await expect(
      service.createContact(
        familyId,
        {
          authorized_pickup: false,
          emergency_contact: false,
          first_name: 'Taylor',
          last_name: 'Jones',
          phone: '555-0199',
          receives_operational_communication: false,
          relationship: 'Aunt',
        },
        'invalid-contact-test',
      ),
    ).rejects.toMatchObject({
      fieldErrors: { roles: 'Select at least one contact role.' },
    });
    expect(store.createCamper).not.toHaveBeenCalled();
    expect(store.createContact).not.toHaveBeenCalled();
  });
});

const localIdentity: RequestIdentity = {
  email: 'admin@local.camp.test',
  emailVerified: true,
  memberships: [
    {
      campIds: [],
      organizationId,
      roles: ['organization_admin'],
    },
  ],
  mfaVerified: true,
  subject: 'local-admin',
};

function fakeService(): FamilyServiceApi & {
  createAdult: ReturnType<typeof vi.fn<FamilyServiceApi['createAdult']>>;
  createCamper: ReturnType<typeof vi.fn<FamilyServiceApi['createCamper']>>;
  createContact: ReturnType<typeof vi.fn<FamilyServiceApi['createContact']>>;
  createFamily: ReturnType<typeof vi.fn<FamilyServiceApi['createFamily']>>;
  createRegistration: ReturnType<typeof vi.fn<FamilyServiceApi['createRegistration']>>;
  updateAdult: ReturnType<typeof vi.fn<FamilyServiceApi['updateAdult']>>;
  updateCamper: ReturnType<typeof vi.fn<FamilyServiceApi['updateCamper']>>;
  updateContact: ReturnType<typeof vi.fn<FamilyServiceApi['updateContact']>>;
  updateFamily: ReturnType<typeof vi.fn<FamilyServiceApi['updateFamily']>>;
} {
  return {
    createAdult: vi.fn().mockResolvedValue(detail),
    createCamper: vi.fn().mockResolvedValue(detail),
    createContact: vi.fn().mockResolvedValue(detail),
    createFamily: vi.fn().mockResolvedValue(detail),
    createRegistration: vi.fn().mockResolvedValue(registrationResult),
    getFamily: vi.fn().mockResolvedValue(detail),
    listFamilies: vi.fn().mockResolvedValue([summary]),
    updateAdult: vi.fn().mockResolvedValue(detail),
    updateCamper: vi.fn().mockResolvedValue(detail),
    updateContact: vi.fn().mockResolvedValue(detail),
    updateFamily: vi.fn().mockResolvedValue({ ...detail, family_name: familyUpdate.family_name }),
  };
}
