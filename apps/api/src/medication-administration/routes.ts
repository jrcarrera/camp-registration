import {
  MedicationAdministrationCenterSchema,
  MedicationAdministrationCreateSchema,
  MedicationAdministrationQuerySchema,
  MedicationAdministrationSchema,
  MedicationOrderCreateSchema,
  MedicationOrderDiscontinueSchema,
  MedicationOrderParamsSchema,
  MedicationOrderSchema,
  ProblemResponseSchema,
  type MedicationAdministrationCreate,
  type MedicationAdministrationQuery,
  type MedicationOrderCreate,
  type MedicationOrderDiscontinue,
  type MedicationOrderParams,
} from '@camp-registration/contracts';
import {
  MedicationAdministrationConflictError,
  MedicationAdministrationNotFoundError,
  MedicationAdministrationValidationError,
} from '@camp-registration/database';
import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';

import {
  MedicationAdministrationAuthorizationError,
  MedicationAdministrationEncryptionError,
  MedicationAdministrationInputError,
  type MedicationAdministrationServiceApi,
} from './service.js';

type ServiceSource =
  | MedicationAdministrationServiceApi
  | ((request: FastifyRequest) => MedicationAdministrationServiceApi | undefined)
  | undefined;

function resolve(source: ServiceSource, request: FastifyRequest) {
  return typeof source === 'function' ? source(request) : source;
}

function unavailable(reply: FastifyReply) {
  return reply.code(503).send({
    code: 'medication_administration_unavailable',
    message: 'Restricted medication administration dependencies are not configured.',
  });
}

function problem(reply: FastifyReply, error: unknown) {
  if (error instanceof MedicationAdministrationAuthorizationError) {
    return reply.code(403).send({ code: 'forbidden', message: error.message });
  }
  if (error instanceof MedicationAdministrationNotFoundError) {
    return reply.code(404).send({ code: 'not_found', message: error.message });
  }
  if (error instanceof MedicationAdministrationConflictError) {
    return reply
      .code(409)
      .send({ code: 'medication_administration_conflict', message: error.message });
  }
  if (
    error instanceof MedicationAdministrationValidationError ||
    error instanceof MedicationAdministrationInputError
  ) {
    return reply
      .code(400)
      .send({ code: 'invalid_medication_administration', message: error.message });
  }
  if (error instanceof MedicationAdministrationEncryptionError) {
    return reply
      .code(503)
      .send({ code: 'medication_administration_unavailable', message: error.message });
  }
  throw error;
}

export function registerMedicationAdministrationRoutes(
  app: FastifyInstance,
  source: ServiceSource,
): void {
  app.get<{ Querystring: MedicationAdministrationQuery }>(
    '/v1/medication-administration',
    {
      schema: {
        description:
          'List encrypted medication orders, scheduled doses, and append-only administration records for an authorized health round.',
        querystring: MedicationAdministrationQuerySchema,
        response: {
          200: MedicationAdministrationCenterSchema,
          400: ProblemResponseSchema,
          403: ProblemResponseSchema,
          503: ProblemResponseSchema,
        },
        tags: ['restricted medication administration'],
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

  app.post<{ Body: MedicationOrderCreate }>(
    '/v1/medication-administration/orders',
    {
      schema: {
        body: MedicationOrderCreateSchema,
        description:
          'Create an encrypted scheduled or as-needed medication order for a confirmed camper.',
        response: {
          200: MedicationOrderSchema,
          400: ProblemResponseSchema,
          403: ProblemResponseSchema,
          503: ProblemResponseSchema,
        },
        tags: ['restricted medication administration'],
      },
    },
    async (request, reply) => {
      const service = resolve(source, request);
      if (!service) return unavailable(reply);
      try {
        return reply
          .header('cache-control', 'private, no-store')
          .send(await service.createOrder(request.body, request.id));
      } catch (error) {
        return problem(reply, error);
      }
    },
  );

  app.post<{ Body: MedicationAdministrationCreate; Params: MedicationOrderParams }>(
    '/v1/medication-administration/orders/:orderId/administrations',
    {
      schema: {
        body: MedicationAdministrationCreateSchema,
        description:
          'Append an encrypted administration or exception record to an active medication order.',
        params: MedicationOrderParamsSchema,
        response: {
          200: MedicationAdministrationSchema,
          400: ProblemResponseSchema,
          403: ProblemResponseSchema,
          404: ProblemResponseSchema,
          409: ProblemResponseSchema,
          503: ProblemResponseSchema,
        },
        tags: ['restricted medication administration'],
      },
    },
    async (request, reply) => {
      const service = resolve(source, request);
      if (!service) return unavailable(reply);
      try {
        return reply
          .header('cache-control', 'private, no-store')
          .send(
            await service.recordAdministration(request.params.orderId, request.body, request.id),
          );
      } catch (error) {
        return problem(reply, error);
      }
    },
  );

  app.post<{ Body: MedicationOrderDiscontinue; Params: MedicationOrderParams }>(
    '/v1/medication-administration/orders/:orderId/discontinue',
    {
      schema: {
        body: MedicationOrderDiscontinueSchema,
        description:
          'Discontinue an active medication order while preserving its administration history.',
        params: MedicationOrderParamsSchema,
        response: {
          200: MedicationOrderSchema,
          400: ProblemResponseSchema,
          403: ProblemResponseSchema,
          404: ProblemResponseSchema,
          409: ProblemResponseSchema,
          503: ProblemResponseSchema,
        },
        tags: ['restricted medication administration'],
      },
    },
    async (request, reply) => {
      const service = resolve(source, request);
      if (!service) return unavailable(reply);
      try {
        return reply
          .header('cache-control', 'private, no-store')
          .send(
            await service.discontinueOrder(
              request.params.orderId,
              request.body.version,
              request.id,
            ),
          );
      } catch (error) {
        return problem(reply, error);
      }
    },
  );
}
