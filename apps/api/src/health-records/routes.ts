import {
  HealthRecordAccessQuerySchema,
  HealthRecordCenterSchema,
  HealthRecordExportQuerySchema,
  HealthRecordInputSchema,
  HealthRecordParamsSchema,
  HealthRecordReviewSchema,
  HealthRecordSchema,
  HealthRecordSubmitSchema,
  ProblemResponseSchema,
  type HealthRecordAccessQuery,
  type HealthRecordExportQuery,
  type HealthRecordInput,
  type HealthRecordParams,
  type HealthRecordReview,
  type HealthRecordSubmit,
} from '@camp-registration/contracts';
import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';

import {
  HealthAuthorizationError,
  HealthEncryptionError,
  HealthValidationError,
  type HealthRecordServiceApi,
} from './service.js';
import { HealthRecordConflictError, HealthRecordNotFoundError } from '@camp-registration/database';

type ServiceSource =
  | HealthRecordServiceApi
  | ((request: FastifyRequest) => HealthRecordServiceApi | undefined)
  | undefined;

function resolve(source: ServiceSource, request: FastifyRequest) {
  return typeof source === 'function' ? source(request) : source;
}

function unavailable(reply: FastifyReply) {
  return reply.code(503).send({
    code: 'health_records_unavailable',
    message: 'Restricted health record dependencies are not configured.',
  });
}

function problem(reply: FastifyReply, error: unknown) {
  if (error instanceof HealthAuthorizationError) {
    return reply.code(403).send({ code: 'forbidden', message: error.message });
  }
  if (error instanceof HealthRecordNotFoundError) {
    return reply.code(404).send({ code: 'not_found', message: error.message });
  }
  if (error instanceof HealthRecordConflictError) {
    return reply.code(409).send({ code: 'health_record_conflict', message: error.message });
  }
  if (error instanceof HealthValidationError) {
    return reply.code(400).send({ code: 'invalid_health_record', message: error.message });
  }
  if (error instanceof HealthEncryptionError) {
    return reply.code(503).send({ code: 'health_record_unavailable', message: error.message });
  }
  throw error;
}

export function registerHealthRecordRoutes(app: FastifyInstance, source: ServiceSource): void {
  app.get(
    '/v1/health-records',
    {
      schema: {
        description:
          'List minimum operational health-readiness projections for authorized staff or a parent’s campers.',
        response: {
          200: HealthRecordCenterSchema,
          403: ProblemResponseSchema,
          503: ProblemResponseSchema,
        },
        tags: ['restricted health records'],
      },
    },
    async (request, reply) => {
      const service = resolve(source, request);
      if (!service) return unavailable(reply);
      try {
        return await service.getCenter(request.id);
      } catch (error) {
        return problem(reply, error);
      }
    },
  );

  app.get<{ Params: HealthRecordParams; Querystring: HealthRecordAccessQuery }>(
    '/v1/health-records/campers/:camperId',
    {
      schema: {
        description:
          'Decrypt one camper health record after object-level authorization and record the access.',
        params: HealthRecordParamsSchema,
        querystring: HealthRecordAccessQuerySchema,
        response: {
          200: HealthRecordSchema,
          403: ProblemResponseSchema,
          404: ProblemResponseSchema,
          503: ProblemResponseSchema,
        },
        tags: ['restricted health records'],
      },
    },
    async (request, reply) => {
      const service = resolve(source, request);
      if (!service) return unavailable(reply);
      try {
        return await service.getRecord(request.params.camperId, request.query, request.id);
      } catch (error) {
        return problem(reply, error);
      }
    },
  );

  app.put<{ Body: HealthRecordInput; Params: HealthRecordParams }>(
    '/v1/health-records/campers/:camperId',
    {
      schema: {
        body: HealthRecordInputSchema,
        description:
          'Create or replace an application-encrypted health record for an owned camper.',
        params: HealthRecordParamsSchema,
        response: {
          200: HealthRecordSchema,
          400: ProblemResponseSchema,
          403: ProblemResponseSchema,
          404: ProblemResponseSchema,
          409: ProblemResponseSchema,
          503: ProblemResponseSchema,
        },
        tags: ['restricted health records'],
      },
    },
    async (request, reply) => {
      const service = resolve(source, request);
      if (!service) return unavailable(reply);
      try {
        return await service.saveRecord(request.params.camperId, request.body, request.id);
      } catch (error) {
        return problem(reply, error);
      }
    },
  );

  app.post<{ Body: HealthRecordSubmit; Params: HealthRecordParams }>(
    '/v1/health-records/campers/:camperId/submit',
    {
      schema: {
        body: HealthRecordSubmitSchema,
        description: 'Submit a saved health record for staff pre-arrival review.',
        params: HealthRecordParamsSchema,
        response: {
          200: HealthRecordSchema,
          403: ProblemResponseSchema,
          404: ProblemResponseSchema,
          409: ProblemResponseSchema,
          503: ProblemResponseSchema,
        },
        tags: ['restricted health records'],
      },
    },
    async (request, reply) => {
      const service = resolve(source, request);
      if (!service) return unavailable(reply);
      try {
        return await service.submitRecord(
          request.params.camperId,
          request.body.version,
          request.id,
        );
      } catch (error) {
        return problem(reply, error);
      }
    },
  );

  app.post<{ Body: HealthRecordReview; Params: HealthRecordParams }>(
    '/v1/health-records/campers/:camperId/review',
    {
      schema: {
        body: HealthRecordReviewSchema,
        description: 'Approve a submitted health record or request parent changes.',
        params: HealthRecordParamsSchema,
        response: {
          200: HealthRecordSchema,
          403: ProblemResponseSchema,
          404: ProblemResponseSchema,
          409: ProblemResponseSchema,
          503: ProblemResponseSchema,
        },
        tags: ['restricted health records'],
      },
    },
    async (request, reply) => {
      const service = resolve(source, request);
      if (!service) return unavailable(reply);
      try {
        return await service.reviewRecord(request.params.camperId, request.body, request.id);
      } catch (error) {
        return problem(reply, error);
      }
    },
  );

  app.get<{ Querystring: HealthRecordExportQuery }>(
    '/v1/health-records/export',
    {
      schema: {
        description: 'Download a separately authorized and audited restricted health CSV.',
        querystring: HealthRecordExportQuerySchema,
        response: {
          200: {
            content: { 'text/csv': { schema: { type: 'string' } } },
            description: 'A private Restricted-data export.',
          },
          403: ProblemResponseSchema,
          503: ProblemResponseSchema,
        },
        tags: ['restricted health records'],
      },
    },
    async (request, reply) => {
      const service = resolve(source, request);
      if (!service) return unavailable(reply);
      try {
        const exportFile = await service.exportRecords(request.query.session_id, request.id);
        return reply
          .header('cache-control', 'private, no-store')
          .header('content-disposition', `attachment; filename="${exportFile.filename}"`)
          .header('x-record-count', String(exportFile.rowCount))
          .type('text/csv; charset=utf-8')
          .send(exportFile.content);
      } catch (error) {
        return problem(reply, error);
      }
    },
  );
}
