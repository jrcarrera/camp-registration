import {
  HealthIncidentCenterSchema,
  HealthIncidentCreateSchema,
  HealthIncidentEntryCreateSchema,
  HealthIncidentGuardianNotificationCreateSchema,
  HealthIncidentParamsSchema,
  HealthIncidentQuerySchema,
  HealthIncidentResolveSchema,
  HealthIncidentSchema,
  ProblemResponseSchema,
  type HealthIncidentCreate,
  type HealthIncidentEntryCreate,
  type HealthIncidentGuardianNotificationCreate,
  type HealthIncidentParams,
  type HealthIncidentQuery,
  type HealthIncidentResolve,
} from '@camp-registration/contracts';
import {
  HealthIncidentConflictError,
  HealthIncidentNotFoundError,
  HealthIncidentValidationError,
} from '@camp-registration/database';
import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';

import {
  HealthIncidentAuthorizationError,
  HealthIncidentEncryptionError,
  HealthIncidentInputError,
  type HealthIncidentServiceApi,
} from './service.js';

type ServiceSource =
  | HealthIncidentServiceApi
  | ((request: FastifyRequest) => HealthIncidentServiceApi | undefined)
  | undefined;

function resolve(source: ServiceSource, request: FastifyRequest) {
  return typeof source === 'function' ? source(request) : source;
}

function unavailable(reply: FastifyReply) {
  return reply.code(503).send({
    code: 'health_incidents_unavailable',
    message: 'Restricted health incident dependencies are not configured.',
  });
}

function problem(reply: FastifyReply, error: unknown) {
  if (error instanceof HealthIncidentAuthorizationError) {
    return reply.code(403).send({ code: 'forbidden', message: error.message });
  }
  if (error instanceof HealthIncidentNotFoundError) {
    return reply.code(404).send({ code: 'not_found', message: error.message });
  }
  if (error instanceof HealthIncidentConflictError) {
    return reply.code(409).send({ code: 'health_incident_conflict', message: error.message });
  }
  if (error instanceof HealthIncidentValidationError || error instanceof HealthIncidentInputError) {
    return reply.code(400).send({ code: 'invalid_health_incident', message: error.message });
  }
  if (error instanceof HealthIncidentEncryptionError) {
    return reply.code(503).send({ code: 'health_incident_unavailable', message: error.message });
  }
  throw error;
}

export function registerHealthIncidentRoutes(app: FastifyInstance, source: ServiceSource): void {
  app.get<{ Querystring: HealthIncidentQuery }>(
    '/v1/health-incidents',
    {
      schema: {
        description:
          'List restricted incident projections and confirmed camper/session choices for authorized health staff.',
        querystring: HealthIncidentQuerySchema,
        response: {
          200: HealthIncidentCenterSchema,
          403: ProblemResponseSchema,
          503: ProblemResponseSchema,
        },
        tags: ['restricted health incidents'],
      },
    },
    async (request, reply) => {
      const service = resolve(source, request);
      if (!service) return unavailable(reply);
      try {
        return reply
          .header('cache-control', 'private, no-store')
          .send(await service.getCenter(request.query, request.id));
      } catch (error) {
        return problem(reply, error);
      }
    },
  );

  app.post<{ Body: HealthIncidentCreate }>(
    '/v1/health-incidents',
    {
      schema: {
        body: HealthIncidentCreateSchema,
        description:
          'Create an immutable incident report with application-encrypted narrative details.',
        response: {
          200: HealthIncidentSchema,
          400: ProblemResponseSchema,
          403: ProblemResponseSchema,
          503: ProblemResponseSchema,
        },
        tags: ['restricted health incidents'],
      },
    },
    async (request, reply) => {
      const service = resolve(source, request);
      if (!service) return unavailable(reply);
      try {
        return reply
          .header('cache-control', 'private, no-store')
          .send(await service.createIncident(request.body, request.id));
      } catch (error) {
        return problem(reply, error);
      }
    },
  );

  app.get<{ Params: HealthIncidentParams }>(
    '/v1/health-incidents/:incidentId',
    {
      schema: {
        description: 'Decrypt one incident and its append-only timeline after authorization.',
        params: HealthIncidentParamsSchema,
        response: {
          200: HealthIncidentSchema,
          403: ProblemResponseSchema,
          404: ProblemResponseSchema,
          503: ProblemResponseSchema,
        },
        tags: ['restricted health incidents'],
      },
    },
    async (request, reply) => {
      const service = resolve(source, request);
      if (!service) return unavailable(reply);
      try {
        return reply
          .header('cache-control', 'private, no-store')
          .send(await service.getIncident(request.params.incidentId, request.id));
      } catch (error) {
        return problem(reply, error);
      }
    },
  );

  app.post<{ Body: HealthIncidentEntryCreate; Params: HealthIncidentParams }>(
    '/v1/health-incidents/:incidentId/notes',
    {
      schema: {
        body: HealthIncidentEntryCreateSchema,
        description: 'Append an encrypted follow-up note to an open incident.',
        params: HealthIncidentParamsSchema,
        response: {
          200: HealthIncidentSchema,
          400: ProblemResponseSchema,
          403: ProblemResponseSchema,
          404: ProblemResponseSchema,
          409: ProblemResponseSchema,
          503: ProblemResponseSchema,
        },
        tags: ['restricted health incidents'],
      },
    },
    async (request, reply) => {
      const service = resolve(source, request);
      if (!service) return unavailable(reply);
      try {
        return reply
          .header('cache-control', 'private, no-store')
          .send(
            await service.addNote(
              request.params.incidentId,
              request.body.note,
              request.body.version,
              request.id,
            ),
          );
      } catch (error) {
        return problem(reply, error);
      }
    },
  );

  app.post<{ Body: HealthIncidentResolve; Params: HealthIncidentParams }>(
    '/v1/health-incidents/:incidentId/resolve',
    {
      schema: {
        body: HealthIncidentResolveSchema,
        description: 'Resolve an open incident with an append-only encrypted resolution entry.',
        params: HealthIncidentParamsSchema,
        response: {
          200: HealthIncidentSchema,
          400: ProblemResponseSchema,
          403: ProblemResponseSchema,
          404: ProblemResponseSchema,
          409: ProblemResponseSchema,
          503: ProblemResponseSchema,
        },
        tags: ['restricted health incidents'],
      },
    },
    async (request, reply) => {
      const service = resolve(source, request);
      if (!service) return unavailable(reply);
      try {
        return reply
          .header('cache-control', 'private, no-store')
          .send(await service.resolveIncident(request.params.incidentId, request.body, request.id));
      } catch (error) {
        return problem(reply, error);
      }
    },
  );

  app.post<{
    Body: HealthIncidentGuardianNotificationCreate;
    Params: HealthIncidentParams;
  }>(
    '/v1/health-incidents/:incidentId/guardian-notifications',
    {
      schema: {
        body: HealthIncidentGuardianNotificationCreateSchema,
        description:
          'Append encrypted guardian notification details and update the operational notification state.',
        params: HealthIncidentParamsSchema,
        response: {
          200: HealthIncidentSchema,
          400: ProblemResponseSchema,
          403: ProblemResponseSchema,
          404: ProblemResponseSchema,
          409: ProblemResponseSchema,
          503: ProblemResponseSchema,
        },
        tags: ['restricted health incidents'],
      },
    },
    async (request, reply) => {
      const service = resolve(source, request);
      if (!service) return unavailable(reply);
      try {
        return reply
          .header('cache-control', 'private, no-store')
          .send(
            await service.recordGuardianNotification(
              request.params.incidentId,
              request.body,
              request.id,
            ),
          );
      } catch (error) {
        return problem(reply, error);
      }
    },
  );
}
