import { randomUUID } from 'node:crypto';

import type { RequestIdentity } from '@camp-registration/auth';
import type {
  CommunicationAudience,
  CommunicationAudiencePreview,
  CommunicationCampaign,
  CommunicationCampaignCreate,
  CommunicationsCenter,
  CommunicationTemplate,
  CommunicationTemplateInput,
  CommunicationTemplateUpdate,
} from '@camp-registration/contracts';
import type { CommunicationsStore } from '@camp-registration/database';

const staffRoles = new Set(['camp_staff', 'camp_admin', 'organization_admin']);
const authorRoles = new Set(['camp_admin', 'organization_admin']);
const supportedVariables = new Set([
  'balance_due',
  'camper_name',
  'family_name',
  'form_due_date',
  'portal_url',
  'session_name',
  'session_start_date',
]);

export class CommunicationsAuthorizationError extends Error {}
export class CommunicationsValidationError extends Error {
  constructor(
    readonly fieldErrors: Record<string, string>,
    message = 'Communication details are invalid',
  ) {
    super(message);
  }
}

export interface CommunicationsServiceApi {
  activateTemplate(
    templateId: string,
    version: number,
    requestId: string,
  ): Promise<CommunicationTemplate>;
  archiveTemplate(
    templateId: string,
    version: number,
    requestId: string,
  ): Promise<CommunicationTemplate>;
  cancelCampaign(campaignId: string, requestId: string): Promise<void>;
  createCampaign(
    campaign: CommunicationCampaignCreate,
    requestId: string,
  ): Promise<CommunicationCampaign>;
  createTemplate(
    template: CommunicationTemplateInput,
    requestId: string,
  ): Promise<CommunicationTemplate>;
  getCenter(): Promise<CommunicationsCenter>;
  previewAudience(audience: CommunicationAudience): Promise<CommunicationAudiencePreview>;
  replayDelivery(deliveryId: string, requestId: string): Promise<void>;
  updateTemplate(
    templateId: string,
    template: CommunicationTemplateUpdate,
    requestId: string,
  ): Promise<CommunicationTemplate>;
}

function normalizeTemplate(input: CommunicationTemplateInput): CommunicationTemplateInput {
  const normalized = {
    body: input.body.trim(),
    description: input.description.trim(),
    name: input.name.trim().replace(/\s+/g, ' '),
    subject: input.subject.trim().replace(/\s+/g, ' '),
  };
  const errors: Record<string, string> = {};
  if (!normalized.name) errors.name = 'Enter a template name.';
  if (!normalized.subject) errors.subject = 'Enter an email subject.';
  if (!normalized.body) errors.body = 'Enter an email message.';
  for (const [field, value] of [
    ['subject', normalized.subject],
    ['body', normalized.body],
  ] as const) {
    const variables = [...value.matchAll(/\{\{([^{}]+)\}\}/g)].map((match) => match[1]!.trim());
    const unsupported = variables.filter((variable) => !supportedVariables.has(variable));
    if (unsupported.length > 0) {
      errors[field] = `Unsupported variable: {{${unsupported[0]}}}.`;
    }
    const withoutVariables = value.replace(/\{\{[a-z_]+\}\}/g, '');
    if (withoutVariables.includes('{{') || withoutVariables.includes('}}')) {
      errors[field] = 'Use variables in the form {{family_name}}.';
    }
  }
  if (Object.keys(errors).length > 0) throw new CommunicationsValidationError(errors);
  return normalized;
}

function validateAudience(audience: CommunicationAudience): void {
  if (audience.audience_type !== 'BALANCE_DUE' && !audience.session_id) {
    throw new CommunicationsValidationError({ session_id: 'Choose a session for this audience.' });
  }
}

export class CommunicationsService implements CommunicationsServiceApi {
  private readonly membership;

  constructor(
    private readonly store: CommunicationsStore,
    private readonly identity: RequestIdentity,
    private readonly organizationId: string,
  ) {
    this.membership = identity.memberships.find(
      (membership) => membership.organizationId === organizationId,
    );
  }

  private authorize(roles: Set<string>, message = 'Communications access is not permitted'): void {
    if (!this.membership?.roles.some((role) => roles.has(role))) {
      throw new CommunicationsAuthorizationError(message);
    }
  }

  private context(requestId: string) {
    return { actorId: this.identity.subject, organizationId: this.organizationId, requestId };
  }

  async getCenter(): Promise<CommunicationsCenter> {
    this.authorize(staffRoles);
    return this.store.getCenter(this.organizationId);
  }

  async createTemplate(
    template: CommunicationTemplateInput,
    requestId: string,
  ): Promise<CommunicationTemplate> {
    this.authorize(authorRoles, 'Only administrators can create communication templates');
    return this.store.createTemplate(this.context(requestId), {
      ...normalizeTemplate(template),
      id: randomUUID(),
    });
  }

  async updateTemplate(
    templateId: string,
    template: CommunicationTemplateUpdate,
    requestId: string,
  ): Promise<CommunicationTemplate> {
    this.authorize(authorRoles, 'Only administrators can edit communication templates');
    return this.store.updateTemplate(this.context(requestId), templateId, {
      ...normalizeTemplate(template),
      id: templateId,
      version: template.version,
    });
  }

  async activateTemplate(
    templateId: string,
    version: number,
    requestId: string,
  ): Promise<CommunicationTemplate> {
    this.authorize(authorRoles, 'Only administrators can activate communication templates');
    return this.store.setTemplateStatus(this.context(requestId), templateId, version, 'ACTIVE');
  }

  async archiveTemplate(
    templateId: string,
    version: number,
    requestId: string,
  ): Promise<CommunicationTemplate> {
    this.authorize(authorRoles, 'Only administrators can archive communication templates');
    return this.store.setTemplateStatus(this.context(requestId), templateId, version, 'ARCHIVED');
  }

  async previewAudience(audience: CommunicationAudience): Promise<CommunicationAudiencePreview> {
    this.authorize(staffRoles);
    validateAudience(audience);
    return {
      recipient_count: await this.store.countAudience(this.organizationId, {
        audienceType: audience.audience_type,
        sessionId: audience.session_id,
      }),
    };
  }

  async createCampaign(
    campaign: CommunicationCampaignCreate,
    requestId: string,
  ): Promise<CommunicationCampaign> {
    this.authorize(authorRoles, 'Only administrators can schedule communications');
    validateAudience(campaign);
    const name = campaign.name.trim().replace(/\s+/g, ' ');
    const scheduledFor = new Date(campaign.scheduled_for);
    const errors: Record<string, string> = {};
    if (!name) errors.name = 'Enter a campaign name.';
    if (scheduledFor.valueOf() < Date.now() - 5 * 60_000) {
      errors.scheduled_for = 'Choose a current or future delivery time.';
    }
    const center = await this.store.getCenter(this.organizationId);
    const template = center.templates.find((candidate) => candidate.id === campaign.template_id);
    if (!template) errors.template_id = 'Choose an available template.';
    else if (template.status !== 'ACTIVE') errors.template_id = 'Activate the template first.';
    else if (template.version !== campaign.template_version) {
      errors.template_id = 'The template changed; reload before scheduling.';
    }
    if (Object.keys(errors).length > 0) {
      throw new CommunicationsValidationError(errors, 'Campaign details are invalid');
    }
    return this.store.createCampaign(this.context(requestId), {
      audienceType: campaign.audience_type,
      bodySnapshot: template!.body,
      id: randomUUID(),
      name,
      scheduledFor: scheduledFor.toISOString(),
      sessionId: campaign.session_id,
      subjectSnapshot: template!.subject,
      templateId: template!.id,
      templateVersion: template!.version,
    });
  }

  async cancelCampaign(campaignId: string, requestId: string): Promise<void> {
    this.authorize(authorRoles, 'Only administrators can cancel communications');
    await this.store.cancelCampaign(this.context(requestId), campaignId);
  }

  async replayDelivery(deliveryId: string, requestId: string): Promise<void> {
    this.authorize(authorRoles, 'Only administrators can replay communications');
    await this.store.replayDelivery(this.context(requestId), deliveryId);
  }
}
