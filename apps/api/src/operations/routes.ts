import {
  ProblemResponseSchema,
  WaitlistOperationsStatusSchema,
  type ProblemResponse,
  type WaitlistOperationsStatus,
} from '@camp-registration/contracts';
import type { FastifyInstance, FastifyRequest } from 'fastify';

import { OperationsAuthorizationError, type OperationsServiceApi } from './service.js';

type OperationsServiceSource =
  | OperationsServiceApi
  | ((request: FastifyRequest) => OperationsServiceApi | undefined)
  | undefined;

function resolveOperationsService(
  source: OperationsServiceSource,
  request: FastifyRequest,
): OperationsServiceApi | undefined {
  return typeof source === 'function' ? source(request) : source;
}

export function registerOperationsRoutes(
  app: FastifyInstance,
  service: OperationsServiceSource,
): void {
  app.get<{ Reply: WaitlistOperationsStatus | ProblemResponse }>(
    '/v1/operations/waitlist',
    {
      schema: {
        description: 'Tenant-scoped waitlist automation and notification delivery health.',
        response: {
          200: WaitlistOperationsStatusSchema,
          403: ProblemResponseSchema,
          503: ProblemResponseSchema,
        },
        tags: ['operations', 'waitlist'],
      },
    },
    async (request, reply) => {
      const operationsService = resolveOperationsService(service, request);
      if (!operationsService) {
        return reply.code(503).send({
          code: 'operations_unavailable',
          message: 'Operations dependencies are not configured.',
        });
      }
      try {
        return await operationsService.getWaitlistStatus();
      } catch (error) {
        if (error instanceof OperationsAuthorizationError) {
          return reply.code(403).send({ code: 'forbidden', message: error.message });
        }
        throw error;
      }
    },
  );
}
