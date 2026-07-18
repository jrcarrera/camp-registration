import { randomUUID } from 'node:crypto';

import type { RequestIdentity } from '@camp-registration/auth';
import type {
  FormField,
  FormPublishCreate,
  FormSubmission,
  FormTemplate,
  FormTemplateCreate,
  FormTemplateUpdate,
  ParentFormObligation,
  ParentFormSubmissionUpdate,
} from '@camp-registration/contracts';
import type { FormsStore } from '@camp-registration/database';

const staffReadRoles = new Set(['camp_staff', 'camp_admin', 'organization_admin']);
const authorRoles = new Set(['camp_admin', 'organization_admin']);
const parentRoles = new Set(['parent_guardian']);

export class FormsAuthorizationError extends Error {}
export class FormsValidationError extends Error {
  constructor(
    readonly fieldErrors: Record<string, string>,
    message = 'Form details are invalid',
  ) {
    super(message);
  }
}

export interface FormsServiceApi {
  listTemplates(): Promise<FormTemplate[]>;
  createTemplate(template: FormTemplateCreate, requestId: string): Promise<FormTemplate>;
  updateTemplate(
    templateId: string,
    update: FormTemplateUpdate,
    requestId: string,
  ): Promise<FormTemplate>;
  publishTemplate(
    templateId: string,
    publish: FormPublishCreate,
    requestId: string,
  ): Promise<FormTemplate>;
  listParentObligations(): Promise<ParentFormObligation[]>;
  saveParentSubmission(
    assignmentId: string,
    registrationId: string,
    update: ParentFormSubmissionUpdate,
    requestId: string,
  ): Promise<FormSubmission>;
}

function normalizeTemplate(template: FormTemplateCreate | FormTemplateUpdate): FormTemplateCreate {
  const errors: Record<string, string> = {};
  const name = template.name.trim().replace(/\s+/g, ' ');
  const description = template.description.trim();
  if (!name) errors.name = 'Enter a form name.';
  const seenIds = new Set<string>();
  const fields = template.fields.map((field, index) => {
    const id = field.id.trim().toLowerCase();
    const label = field.label.trim().replace(/\s+/g, ' ');
    const key = `fields.${index}`;
    if (!/^[a-z][a-z0-9_]{1,49}$/.test(id)) {
      errors[`${key}.id`] = 'Use 2–50 lowercase letters, numbers, or underscores.';
    } else if (seenIds.has(id)) {
      errors[`${key}.id`] = 'Field identifiers must be unique.';
    }
    seenIds.add(id);
    if (!label) errors[`${key}.label`] = 'Enter a field label.';
    const options = [...new Set(field.options.map((option) => option.trim()).filter(Boolean))];
    if (field.type === 'SINGLE_CHOICE' && options.length < 2) {
      errors[`${key}.options`] = 'Choice fields need at least two options.';
    }
    if (field.type !== 'SINGLE_CHOICE' && options.length > 0) {
      errors[`${key}.options`] = 'Only choice fields can have options.';
    }
    return { ...field, id, label, options };
  });
  if (fields.length === 0) errors.fields = 'Add at least one field.';
  if (Object.keys(errors).length > 0) throw new FormsValidationError(errors);
  return { description, fields, name };
}

function isRealDate(value: string): boolean {
  const parsed = new Date(`${value}T00:00:00Z`);
  return (
    /^\d{4}-\d{2}-\d{2}$/.test(value) &&
    !Number.isNaN(parsed.valueOf()) &&
    parsed.toISOString().startsWith(value)
  );
}

function validateSubmission(
  fields: FormField[],
  update: ParentFormSubmissionUpdate,
): { responses: Record<string, string | boolean>; signerName: string | null } {
  const errors: Record<string, string> = {};
  const knownFields = new Map(fields.map((field) => [field.id, field]));
  const responses: Record<string, string | boolean> = {};
  for (const [id, value] of Object.entries(update.responses)) {
    const field = knownFields.get(id);
    if (!field) {
      errors[id] = 'This field is not part of the published form.';
      continue;
    }
    if (field.type === 'ACKNOWLEDGEMENT') {
      if (typeof value !== 'boolean') errors[id] = 'Select the acknowledgement checkbox.';
      else responses[id] = value;
      continue;
    }
    if (typeof value !== 'string') {
      errors[id] = 'Enter a text value.';
      continue;
    }
    const normalized = value.trim();
    responses[id] = normalized;
    if (field.type === 'SIGNATURE' && normalized.length > 200) {
      errors[id] = 'Signature names must be 200 characters or fewer.';
    }
    if (field.type === 'SINGLE_CHOICE' && normalized && !field.options.includes(normalized)) {
      errors[id] = 'Select one of the available choices.';
    }
    if (field.type === 'DATE' && normalized && !isRealDate(normalized)) {
      errors[id] = 'Enter a valid date.';
    }
  }

  const signerName = update.signer_name?.trim().replace(/\s+/g, ' ') || null;
  if (update.submit) {
    for (const field of fields) {
      const value = responses[field.id];
      if (!field.required) continue;
      const complete =
        field.type === 'ACKNOWLEDGEMENT'
          ? value === true
          : typeof value === 'string' && value.length > 0;
      if (!complete) errors[field.id] = 'This field is required.';
    }
    const signatureValues = fields
      .filter((field) => field.type === 'SIGNATURE')
      .map((field) => responses[field.id])
      .filter((value): value is string => typeof value === 'string' && value.length > 0);
    if (
      (fields.some((field) => field.type === 'SIGNATURE' && field.required) ||
        signatureValues.length > 0) &&
      !signerName
    ) {
      errors.signer_name = 'Enter the signer’s full legal name.';
    }
    if (signerName && signatureValues.some((value) => value !== signerName)) {
      errors.signer_name = 'The signer name must match the typed signature.';
    }
  }
  if (Object.keys(errors).length > 0) {
    throw new FormsValidationError(errors, 'Form responses are invalid');
  }
  return { responses, signerName };
}

export class FormsService implements FormsServiceApi {
  private readonly membership;

  constructor(
    private readonly store: FormsStore,
    private readonly identity: RequestIdentity,
    private readonly organizationId: string,
  ) {
    this.membership = identity.memberships.find(
      (membership) => membership.organizationId === organizationId,
    );
  }

  private authorize(roles: Set<string>, message = 'Forms access is not permitted'): void {
    if (!this.membership?.roles.some((role) => roles.has(role))) {
      throw new FormsAuthorizationError(message);
    }
  }

  private context(requestId: string) {
    return {
      actorId: this.identity.subject,
      organizationId: this.organizationId,
      requestId,
    };
  }

  async listTemplates(): Promise<FormTemplate[]> {
    this.authorize(staffReadRoles);
    return this.store.listTemplates(this.organizationId);
  }

  async createTemplate(template: FormTemplateCreate, requestId: string): Promise<FormTemplate> {
    this.authorize(authorRoles, 'Only administrators can create form templates');
    const normalized = normalizeTemplate(template);
    return this.store.createTemplate(this.context(requestId), {
      ...normalized,
      id: randomUUID(),
    });
  }

  async updateTemplate(
    templateId: string,
    update: FormTemplateUpdate,
    requestId: string,
  ): Promise<FormTemplate> {
    this.authorize(authorRoles, 'Only administrators can edit form templates');
    const normalized = normalizeTemplate(update);
    const result = await this.store.updateTemplate(this.context(requestId), templateId, {
      ...normalized,
      version: update.version,
    });
    const templates = await this.store.listTemplates(this.organizationId);
    return templates.find((template) => template.id === result.id) ?? result;
  }

  async publishTemplate(
    templateId: string,
    publish: FormPublishCreate,
    requestId: string,
  ): Promise<FormTemplate> {
    this.authorize(authorRoles, 'Only administrators can publish forms');
    const sessionIds = [...new Set(publish.session_ids)];
    const errors: Record<string, string> = {};
    if (sessionIds.length !== publish.session_ids.length) {
      errors.session_ids = 'Select each session only once.';
    }
    if (publish.due_at && new Date(publish.due_at).valueOf() <= Date.now()) {
      errors.due_at = 'Choose a due date in the future.';
    }
    if (Object.keys(errors).length > 0) {
      throw new FormsValidationError(errors, 'Publishing details are invalid');
    }
    await this.store.publishTemplate(
      this.context(requestId),
      templateId,
      publish.version,
      randomUUID(),
      sessionIds.map((sessionId) => ({
        dueAt: publish.due_at,
        id: randomUUID(),
        sessionId,
      })),
    );
    const templates = await this.store.listTemplates(this.organizationId);
    const template = templates.find((candidate) => candidate.id === templateId);
    if (!template) throw new Error('Published form template could not be reloaded');
    return template;
  }

  async listParentObligations(): Promise<ParentFormObligation[]> {
    this.authorize(parentRoles, 'Parent form access is not permitted');
    return this.store.listParentObligations(this.organizationId, this.identity.subject);
  }

  async saveParentSubmission(
    assignmentId: string,
    registrationId: string,
    update: ParentFormSubmissionUpdate,
    requestId: string,
  ): Promise<FormSubmission> {
    this.authorize(parentRoles, 'Parent form access is not permitted');
    const obligations = await this.store.listParentObligations(
      this.organizationId,
      this.identity.subject,
    );
    const obligation = obligations.find(
      (candidate) =>
        candidate.assignment_id === assignmentId && candidate.registration_id === registrationId,
    );
    if (!obligation) throw new FormsAuthorizationError('Required form access is not permitted');
    const normalized = validateSubmission(obligation.fields, update);
    return this.store.saveParentSubmission(this.context(requestId), assignmentId, registrationId, {
      ...normalized,
      status: update.submit ? 'SUBMITTED' : 'DRAFT',
      version: update.version,
    });
  }
}
