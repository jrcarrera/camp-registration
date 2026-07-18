import {
  FormPublishCreateSchema,
  FormSubmissionSchema,
  FormTemplateCreateSchema,
  FormTemplateParamsSchema,
  FormTemplateSchema,
  FormTemplatesResponseSchema,
  FormTemplateUpdateSchema,
  ParentFormObligationsResponseSchema,
  ParentFormSubmissionParamsSchema,
  ParentFormSubmissionUpdateSchema,
  ProblemResponseSchema,
  type FormPublishCreate,
  type FormSubmission,
  type FormTemplate,
  type FormTemplateCreate,
  type FormTemplateParams,
  type FormTemplatesResponse,
  type FormTemplateUpdate,
  type ParentFormObligationsResponse,
  type ParentFormSubmissionParams,
  type ParentFormSubmissionUpdate,
  type ProblemResponse,
} from '@camp-registration/contracts';
import {
  FormObligationNotFoundError,
  FormSubmissionConflictError,
  FormTemplateNotFoundError,
  FormVersionConflictError,
} from '@camp-registration/database';
import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';

import { FormsAuthorizationError, FormsValidationError, type FormsServiceApi } from './service.js';

type FormsServiceSource =
  | FormsServiceApi
  | ((request: FastifyRequest) => FormsServiceApi | undefined)
  | undefined;

function resolveService(
  source: FormsServiceSource,
  request: FastifyRequest,
): FormsServiceApi | undefined {
  return typeof source === 'function' ? source(request) : source;
}

function unavailable(reply: FastifyReply) {
  return reply.code(503).send({
    code: 'forms_unavailable',
    message: 'Forms dependencies are not configured.',
  });
}

function sendProblem(reply: FastifyReply, error: unknown) {
  if (error instanceof FormsValidationError) {
    return reply.code(400).send({
      code: 'invalid_form',
      field_errors: error.fieldErrors,
      message: error.message,
    });
  }
  if (error instanceof FormsAuthorizationError) {
    return reply.code(403).send({ code: 'forbidden', message: error.message });
  }
  if (error instanceof FormTemplateNotFoundError || error instanceof FormObligationNotFoundError) {
    return reply.code(404).send({ code: 'not_found', message: error.message });
  }
  if (error instanceof FormVersionConflictError || error instanceof FormSubmissionConflictError) {
    return reply.code(409).send({ code: 'version_conflict', message: error.message });
  }
  throw error;
}

const errors = {
  400: ProblemResponseSchema,
  403: ProblemResponseSchema,
  404: ProblemResponseSchema,
  409: ProblemResponseSchema,
  503: ProblemResponseSchema,
};

export function registerFormsRoutes(app: FastifyInstance, source: FormsServiceSource): void {
  app.get<{ Reply: FormTemplatesResponse | ProblemResponse }>(
    '/v1/forms',
    {
      schema: {
        description: 'Reusable form templates, immutable versions, and completion totals.',
        response: { 200: FormTemplatesResponseSchema, ...errors },
        tags: ['forms'],
      },
    },
    async (request, reply) => {
      const service = resolveService(source, request);
      if (!service) return unavailable(reply);
      try {
        return { templates: await service.listTemplates() };
      } catch (error) {
        return sendProblem(reply, error);
      }
    },
  );

  app.post<{ Body: FormTemplateCreate; Reply: FormTemplate | ProblemResponse }>(
    '/v1/forms',
    {
      schema: {
        body: FormTemplateCreateSchema,
        description: 'Create a reusable form or waiver draft.',
        response: { 201: FormTemplateSchema, ...errors },
        tags: ['forms'],
      },
    },
    async (request, reply) => {
      const service = resolveService(source, request);
      if (!service) return unavailable(reply);
      try {
        return reply.code(201).send(await service.createTemplate(request.body, request.id));
      } catch (error) {
        return sendProblem(reply, error);
      }
    },
  );

  app.patch<{
    Body: FormTemplateUpdate;
    Params: FormTemplateParams;
    Reply: FormTemplate | ProblemResponse;
  }>(
    '/v1/forms/:templateId',
    {
      schema: {
        body: FormTemplateUpdateSchema,
        description: 'Revise the editable draft without changing published versions.',
        params: FormTemplateParamsSchema,
        response: { 200: FormTemplateSchema, ...errors },
        tags: ['forms'],
      },
    },
    async (request, reply) => {
      const service = resolveService(source, request);
      if (!service) return unavailable(reply);
      try {
        return await service.updateTemplate(request.params.templateId, request.body, request.id);
      } catch (error) {
        return sendProblem(reply, error);
      }
    },
  );

  app.post<{
    Body: FormPublishCreate;
    Params: FormTemplateParams;
    Reply: FormTemplate | ProblemResponse;
  }>(
    '/v1/forms/:templateId/publish',
    {
      schema: {
        body: FormPublishCreateSchema,
        description: 'Publish an immutable form version and assign it to selected sessions.',
        params: FormTemplateParamsSchema,
        response: { 201: FormTemplateSchema, ...errors },
        tags: ['forms'],
      },
    },
    async (request, reply) => {
      const service = resolveService(source, request);
      if (!service) return unavailable(reply);
      try {
        return reply
          .code(201)
          .send(await service.publishTemplate(request.params.templateId, request.body, request.id));
      } catch (error) {
        return sendProblem(reply, error);
      }
    },
  );

  app.get<{ Reply: ParentFormObligationsResponse | ProblemResponse }>(
    '/v1/portal/forms',
    {
      schema: {
        description: 'Published forms required for the parent’s confirmed registrations.',
        response: { 200: ParentFormObligationsResponseSchema, ...errors },
        tags: ['forms', 'parent-portal'],
      },
    },
    async (request, reply) => {
      const service = resolveService(source, request);
      if (!service) return unavailable(reply);
      try {
        return { obligations: await service.listParentObligations() };
      } catch (error) {
        return sendProblem(reply, error);
      }
    },
  );

  app.put<{
    Body: ParentFormSubmissionUpdate;
    Params: ParentFormSubmissionParams;
    Reply: FormSubmission | ProblemResponse;
  }>(
    '/v1/portal/forms/:assignmentId/registrations/:registrationId',
    {
      schema: {
        body: ParentFormSubmissionUpdateSchema,
        description: 'Save a draft or submit a version-bound parent form response.',
        params: ParentFormSubmissionParamsSchema,
        response: { 200: FormSubmissionSchema, ...errors },
        tags: ['forms', 'parent-portal'],
      },
    },
    async (request, reply) => {
      const service = resolveService(source, request);
      if (!service) return unavailable(reply);
      try {
        return await service.saveParentSubmission(
          request.params.assignmentId,
          request.params.registrationId,
          request.body,
          request.id,
        );
      } catch (error) {
        return sendProblem(reply, error);
      }
    },
  );
}
