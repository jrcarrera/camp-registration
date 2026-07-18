import type { RequestIdentity } from '@camp-registration/auth';
import type { FormTemplate } from '@camp-registration/contracts';
import { describe, expect, it, vi } from 'vitest';

import { buildApp } from '../src/app.js';
import { FormsService } from '../src/forms/service.js';

const organizationId = 'a60b272f-b028-4f1a-b666-3ef3cffd9827';
const templateId = '1349fffd-8f25-476c-a2d6-51efc6731648';
const assignmentId = '4955dd92-0ba1-4b53-9da9-0539d718c64e';
const registrationId = '0ec3e373-107b-4f71-98fb-95f9d4955e50';

const template: FormTemplate = {
  description: 'Review the policy and sign.',
  fields: [
    {
      id: 'policy_ack',
      label: 'I accept the participation policy.',
      options: [],
      required: true,
      type: 'ACKNOWLEDGEMENT',
    },
    {
      id: 'signature',
      label: 'Parent signature',
      options: [],
      required: true,
      type: 'SIGNATURE',
    },
  ],
  id: templateId,
  name: 'Participation waiver',
  published_versions: [],
  updated_at: '2026-07-18T12:00:00.000Z',
  version: 1,
};

function identity(role: 'camp_admin' | 'camp_staff' | 'parent_guardian'): RequestIdentity {
  return {
    email: 'operator@example.test',
    emailVerified: true,
    memberships: [{ campIds: [], organizationId, roles: [role] }],
    mfaVerified: true,
    subject: role === 'parent_guardian' ? 'parent-actor' : 'operator',
  };
}

describe('forms API', () => {
  it('creates a normalized reusable template for an administrator', async () => {
    const store = {
      createTemplate: vi.fn().mockImplementation(async (_context, created) => ({
        ...created,
        published_versions: [],
        updated_at: template.updated_at,
        version: 1,
      })),
      listParentObligations: vi.fn(),
      listTemplates: vi.fn(),
      publishTemplate: vi.fn(),
      saveParentSubmission: vi.fn(),
      updateTemplate: vi.fn(),
    };
    const service = new FormsService(store as never, identity('camp_admin'), organizationId);
    const app = await buildApp({ formsService: service });

    const response = await app.inject({
      method: 'POST',
      payload: {
        description: '  Review the policy and sign.  ',
        fields: template.fields,
        name: '  Participation   waiver ',
      },
      url: '/v1/forms',
    });

    expect(response.statusCode).toBe(201);
    expect(response.json()).toMatchObject({ name: 'Participation waiver', version: 1 });
    expect(store.createTemplate).toHaveBeenCalledWith(
      expect.objectContaining({ actorId: 'operator', organizationId }),
      expect.objectContaining({
        description: 'Review the policy and sign.',
        name: 'Participation waiver',
      }),
    );
    await app.close();
  });

  it('limits template authoring to administrators', async () => {
    const store = {
      createTemplate: vi.fn(),
      listParentObligations: vi.fn(),
      listTemplates: vi.fn(),
      publishTemplate: vi.fn(),
      saveParentSubmission: vi.fn(),
      updateTemplate: vi.fn(),
    };
    const service = new FormsService(store as never, identity('camp_staff'), organizationId);
    const app = await buildApp({ formsService: service });

    const response = await app.inject({
      method: 'POST',
      payload: { description: '', fields: template.fields, name: template.name },
      url: '/v1/forms',
    });

    expect(response.statusCode).toBe(403);
    expect(store.createTemplate).not.toHaveBeenCalled();
    await app.close();
  });

  it('validates required published fields before parent submission', async () => {
    const obligation = {
      assignment_id: assignmentId,
      camper_name: 'Alex Camper',
      description: template.description,
      due_at: null,
      fields: template.fields,
      form_name: template.name,
      form_version: 1,
      registration_id: registrationId,
      session_name: 'Pine Ridge',
      submission: null,
    };
    const store = {
      createTemplate: vi.fn(),
      listParentObligations: vi.fn().mockResolvedValue([obligation]),
      listTemplates: vi.fn(),
      publishTemplate: vi.fn(),
      saveParentSubmission: vi.fn(),
      updateTemplate: vi.fn(),
    };
    const service = new FormsService(store as never, identity('parent_guardian'), organizationId);
    const app = await buildApp({ formsService: service });

    const invalid = await app.inject({
      method: 'PUT',
      payload: { responses: {}, signer_name: null, submit: true, version: 0 },
      url: `/v1/portal/forms/${assignmentId}/registrations/${registrationId}`,
    });

    expect(invalid.statusCode).toBe(400);
    expect(invalid.json()).toMatchObject({
      code: 'invalid_form',
      field_errors: {
        policy_ack: 'This field is required.',
        signature: 'This field is required.',
        signer_name: 'Enter the signer’s full legal name.',
      },
    });
    expect(store.saveParentSubmission).not.toHaveBeenCalled();
    await app.close();
  });

  it('saves an auditable parent submission bound to the published obligation', async () => {
    const saved = {
      responses: { policy_ack: true, signature: 'Jordan Parent' },
      signer_name: 'Jordan Parent',
      status: 'SUBMITTED' as const,
      submitted_at: '2026-07-18T12:30:00.000Z',
      version: 1,
    };
    const store = {
      createTemplate: vi.fn(),
      listParentObligations: vi.fn().mockResolvedValue([
        {
          assignment_id: assignmentId,
          camper_name: 'Alex Camper',
          description: template.description,
          due_at: null,
          fields: template.fields,
          form_name: template.name,
          form_version: 1,
          registration_id: registrationId,
          session_name: 'Pine Ridge',
          submission: null,
        },
      ]),
      listTemplates: vi.fn(),
      publishTemplate: vi.fn(),
      saveParentSubmission: vi.fn().mockResolvedValue(saved),
      updateTemplate: vi.fn(),
    };
    const service = new FormsService(store as never, identity('parent_guardian'), organizationId);

    await expect(
      service.saveParentSubmission(
        assignmentId,
        registrationId,
        {
          responses: saved.responses,
          signer_name: '  Jordan   Parent ',
          submit: true,
          version: 0,
        },
        'request-id',
      ),
    ).resolves.toEqual(saved);
    expect(store.saveParentSubmission).toHaveBeenCalledWith(
      expect.objectContaining({ actorId: 'parent-actor', organizationId, requestId: 'request-id' }),
      assignmentId,
      registrationId,
      {
        responses: saved.responses,
        signerName: 'Jordan Parent',
        status: 'SUBMITTED',
        version: 0,
      },
    );
  });
});
