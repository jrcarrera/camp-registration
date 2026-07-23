import {
  CommunicationAudiencePreviewSchema,
  CommunicationAudienceSchema,
  CommunicationCampaignCreateSchema,
  CommunicationCampaignParamsSchema,
  CommunicationCampaignSchema,
  CommunicationDeliveryParamsSchema,
  CommunicationsCenterSchema,
  CommunicationTemplateInputSchema,
  CommunicationTemplateParamsSchema,
  CommunicationTemplateSchema,
  CommunicationTemplateUpdateSchema,
  CommunicationVersionSchema,
  ProblemResponseSchema,
  type CommunicationAudience,
  type CommunicationAudiencePreview,
  type CommunicationCampaign,
  type CommunicationCampaignCreate,
  type CommunicationCampaignParams,
  type CommunicationDeliveryParams,
  type CommunicationsCenter,
  type CommunicationTemplate,
  type CommunicationTemplateInput,
  type CommunicationTemplateParams,
  type CommunicationTemplateUpdate,
  type CommunicationVersion,
  type ProblemResponse,
} from '@camp-registration/contracts';
import {
  CommunicationNotFoundError,
  CommunicationStateConflictError,
  CommunicationVersionConflictError,
} from '@camp-registration/database';
import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';

import {
  CommunicationsAuthorizationError,
  CommunicationsValidationError,
  type CommunicationsServiceApi,
} from './service.js';

type ServiceSource =
  | CommunicationsServiceApi
  | ((request: FastifyRequest) => CommunicationsServiceApi | undefined)
  | undefined;

function resolve(source: ServiceSource, request: FastifyRequest) {
  return typeof source === 'function' ? source(request) : source;
}

function unavailable(reply: FastifyReply) {
  return reply.code(503).send({
    code: 'communications_unavailable',
    message: 'Communications dependencies are not configured.',
  });
}

function problem(reply: FastifyReply, error: unknown) {
  if (error instanceof CommunicationsValidationError) {
    return reply.code(400).send({
      code: 'invalid_communication',
      field_errors: error.fieldErrors,
      message: error.message,
    });
  }
  if (error instanceof CommunicationsAuthorizationError) {
    return reply.code(403).send({ code: 'forbidden', message: error.message });
  }
  if (error instanceof CommunicationNotFoundError) {
    return reply.code(404).send({ code: 'not_found', message: error.message });
  }
  if (
    error instanceof CommunicationVersionConflictError ||
    error instanceof CommunicationStateConflictError
  ) {
    return reply.code(409).send({ code: 'communication_conflict', message: error.message });
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

export function registerCommunicationsRoutes(app: FastifyInstance, source: ServiceSource): void {
  app.get<{ Reply: CommunicationsCenter | ProblemResponse }>(
    '/v1/communications',
    {
      schema: {
        description: 'Staff communication templates, scheduled campaigns, and delivery history.',
        response: { 200: CommunicationsCenterSchema, ...errors },
        tags: ['communications'],
      },
    },
    async (request, reply) => {
      const service = resolve(source, request);
      if (!service) return unavailable(reply);
      try {
        return await service.getCenter();
      } catch (error) {
        return problem(reply, error);
      }
    },
  );

  app.post<{ Body: CommunicationTemplateInput; Reply: CommunicationTemplate | ProblemResponse }>(
    '/v1/communications/templates',
    {
      schema: {
        body: CommunicationTemplateInputSchema,
        description: 'Create a reusable lifecycle email template draft.',
        response: { 201: CommunicationTemplateSchema, ...errors },
        tags: ['communications'],
      },
    },
    async (request, reply) => {
      const service = resolve(source, request);
      if (!service) return unavailable(reply);
      try {
        return reply.code(201).send(await service.createTemplate(request.body, request.id));
      } catch (error) {
        return problem(reply, error);
      }
    },
  );

  app.patch<{
    Body: CommunicationTemplateUpdate;
    Params: CommunicationTemplateParams;
    Reply: CommunicationTemplate | ProblemResponse;
  }>(
    '/v1/communications/templates/:templateId',
    {
      schema: {
        body: CommunicationTemplateUpdateSchema,
        params: CommunicationTemplateParamsSchema,
        response: { 200: CommunicationTemplateSchema, ...errors },
        tags: ['communications'],
      },
    },
    async (request, reply) => {
      const service = resolve(source, request);
      if (!service) return unavailable(reply);
      try {
        return await service.updateTemplate(request.params.templateId, request.body, request.id);
      } catch (error) {
        return problem(reply, error);
      }
    },
  );

  for (const action of ['activate', 'archive'] as const) {
    app.post<{
      Body: CommunicationVersion;
      Params: CommunicationTemplateParams;
      Reply: CommunicationTemplate | ProblemResponse;
    }>(
      `/v1/communications/templates/:templateId/${action}`,
      {
        schema: {
          body: CommunicationVersionSchema,
          params: CommunicationTemplateParamsSchema,
          response: { 200: CommunicationTemplateSchema, ...errors },
          tags: ['communications'],
        },
      },
      async (request, reply) => {
        const service = resolve(source, request);
        if (!service) return unavailable(reply);
        try {
          return action === 'activate'
            ? await service.activateTemplate(
                request.params.templateId,
                request.body.version,
                request.id,
              )
            : await service.archiveTemplate(
                request.params.templateId,
                request.body.version,
                request.id,
              );
        } catch (error) {
          return problem(reply, error);
        }
      },
    );
  }

  app.post<{ Body: CommunicationAudience; Reply: CommunicationAudiencePreview | ProblemResponse }>(
    '/v1/communications/audience-preview',
    {
      schema: {
        body: CommunicationAudienceSchema,
        response: { 200: CommunicationAudiencePreviewSchema, ...errors },
        tags: ['communications'],
      },
    },
    async (request, reply) => {
      const service = resolve(source, request);
      if (!service) return unavailable(reply);
      try {
        return await service.previewAudience(request.body);
      } catch (error) {
        return problem(reply, error);
      }
    },
  );

  app.post<{ Body: CommunicationCampaignCreate; Reply: CommunicationCampaign | ProblemResponse }>(
    '/v1/communications/campaigns',
    {
      schema: {
        body: CommunicationCampaignCreateSchema,
        response: { 201: CommunicationCampaignSchema, ...errors },
        tags: ['communications'],
      },
    },
    async (request, reply) => {
      const service = resolve(source, request);
      if (!service) return unavailable(reply);
      try {
        return reply.code(201).send(await service.createCampaign(request.body, request.id));
      } catch (error) {
        return problem(reply, error);
      }
    },
  );

  app.post<{ Params: CommunicationCampaignParams; Reply: void | ProblemResponse }>(
    '/v1/communications/campaigns/:campaignId/cancel',
    {
      schema: {
        params: CommunicationCampaignParamsSchema,
        response: { 204: { type: 'null' }, ...errors },
        tags: ['communications'],
      },
    },
    async (request, reply) => {
      const service = resolve(source, request);
      if (!service) return unavailable(reply);
      try {
        await service.cancelCampaign(request.params.campaignId, request.id);
        return reply.code(204).send();
      } catch (error) {
        return problem(reply, error);
      }
    },
  );

  app.post<{ Params: CommunicationDeliveryParams; Reply: void | ProblemResponse }>(
    '/v1/communications/deliveries/:deliveryId/replay',
    {
      schema: {
        params: CommunicationDeliveryParamsSchema,
        response: { 204: { type: 'null' }, ...errors },
        tags: ['communications'],
      },
    },
    async (request, reply) => {
      const service = resolve(source, request);
      if (!service) return unavailable(reply);
      try {
        await service.replayDelivery(request.params.deliveryId, request.id);
        return reply.code(204).send();
      } catch (error) {
        return problem(reply, error);
      }
    },
  );
}
