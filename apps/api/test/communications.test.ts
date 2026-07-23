import type { RequestIdentity } from '@camp-registration/auth';
import type { CommunicationCampaign, CommunicationTemplate } from '@camp-registration/contracts';
import { describe, expect, it, vi } from 'vitest';

import { buildApp } from '../src/app.js';
import { CommunicationsService } from '../src/communications/service.js';

const organizationId = 'a60b272f-b028-4f1a-b666-3ef3cffd9827';
const templateId = '1349fffd-8f25-476c-a2d6-51efc6731648';
const sessionId = '28933fbb-470e-4ad6-b2d1-9a9fa0c6b756';

function identity(role: 'camp_admin' | 'camp_staff' | 'parent_guardian'): RequestIdentity {
  return {
    email: 'operator@example.test',
    emailVerified: true,
    memberships: [{ campIds: [], organizationId, roles: [role] }],
    mfaVerified: true,
    subject: 'communications-operator',
  };
}

const template: CommunicationTemplate = {
  body: 'Hello {{family_name}}, review {{camper_name}} at {{portal_url}}.',
  description: 'Pre-arrival reminder',
  id: templateId,
  name: 'Arrival reminder',
  status: 'ACTIVE',
  subject: 'Arrival details for {{camper_name}}',
  updated_at: '2026-07-22T12:00:00.000Z',
  version: 2,
};

const campaign: CommunicationCampaign = {
  audience_type: 'SESSION_CONFIRMED',
  created_at: '2026-07-22T12:00:00.000Z',
  delivered_count: 0,
  failed_count: 0,
  id: '7424b89f-e72c-4e97-8d19-4f4f5fc58f68',
  name: 'Pine Ridge arrival',
  pending_count: 0,
  queued_at: null,
  recipient_count: 0,
  scheduled_for: '2027-06-10T15:00:00.000Z',
  session_id: sessionId,
  session_name: 'Pine Ridge',
  status: 'SCHEDULED',
  template_id: templateId,
  template_name: template.name,
  template_version: template.version,
};

function store() {
  return {
    cancelCampaign: vi.fn(),
    countAudience: vi.fn().mockResolvedValue(12),
    createCampaign: vi.fn().mockResolvedValue(campaign),
    createTemplate: vi.fn().mockImplementation(async (_context, input) => ({
      ...input,
      status: 'DRAFT',
      updated_at: template.updated_at,
      version: 1,
    })),
    getCenter: vi.fn().mockResolvedValue({ campaigns: [], deliveries: [], templates: [template] }),
    replayDelivery: vi.fn(),
    setTemplateStatus: vi.fn(),
    updateTemplate: vi.fn(),
  };
}

describe('lifecycle communications API', () => {
  it('creates normalized templates and rejects unknown merge variables', async () => {
    const database = store();
    const service = new CommunicationsService(
      database as never,
      identity('camp_admin'),
      organizationId,
    );
    const app = await buildApp({ communicationsService: service });

    const created = await app.inject({
      method: 'POST',
      payload: {
        body: ' Hello {{family_name}} ',
        description: '  Readiness follow-up ',
        name: '  Readiness   reminder ',
        subject: ' Forms for {{camper_name}} ',
      },
      url: '/v1/communications/templates',
    });
    expect(created.statusCode).toBe(201);
    expect(created.json()).toMatchObject({ name: 'Readiness reminder', status: 'DRAFT' });

    const invalid = await app.inject({
      method: 'POST',
      payload: {
        body: 'Hello {{secret_field}}',
        description: '',
        name: 'Unsafe template',
        subject: 'Hello',
      },
      url: '/v1/communications/templates',
    });
    expect(invalid.statusCode).toBe(400);
    expect(invalid.json()).toMatchObject({ code: 'invalid_communication' });
    await app.close();
  });

  it('previews a tenant audience and schedules an immutable template snapshot', async () => {
    const database = store();
    const service = new CommunicationsService(
      database as never,
      identity('camp_admin'),
      organizationId,
    );
    const app = await buildApp({ communicationsService: service });

    const preview = await app.inject({
      method: 'POST',
      payload: { audience_type: 'SESSION_CONFIRMED', session_id: sessionId },
      url: '/v1/communications/audience-preview',
    });
    expect(preview.statusCode).toBe(200);
    expect(preview.json()).toEqual({ recipient_count: 12 });

    const response = await app.inject({
      method: 'POST',
      payload: {
        audience_type: 'SESSION_CONFIRMED',
        name: 'Pine Ridge arrival',
        scheduled_for: '2027-06-10T15:00:00.000Z',
        session_id: sessionId,
        template_id: templateId,
        template_version: template.version,
      },
      url: '/v1/communications/campaigns',
    });
    expect(response.statusCode, response.body).toBe(201);
    expect(database.createCampaign).toHaveBeenCalledWith(
      expect.objectContaining({ actorId: 'communications-operator', organizationId }),
      expect.objectContaining({
        bodySnapshot: template.body,
        subjectSnapshot: template.subject,
      }),
    );
    await app.close();
  });

  it('permits staff reads but denies staff template authoring', async () => {
    const database = store();
    const service = new CommunicationsService(
      database as never,
      identity('camp_staff'),
      organizationId,
    );
    const app = await buildApp({ communicationsService: service });

    expect((await app.inject({ method: 'GET', url: '/v1/communications' })).statusCode).toBe(200);
    const response = await app.inject({
      method: 'POST',
      payload: { body: 'Hello', description: '', name: 'Draft', subject: 'Subject' },
      url: '/v1/communications/templates',
    });
    expect(response.statusCode).toBe(403);
    expect(database.createTemplate).not.toHaveBeenCalled();
    await app.close();
  });
});
