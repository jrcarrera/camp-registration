import {
  ProblemResponseSchema,
  WaitlistNotificationReplayCreateSchema,
  WaitlistNotificationReplayParamsSchema,
  WaitlistNotificationReplayResultSchema,
  WaitlistOperationsStatusSchema,
  type ProblemResponse,
  type WaitlistNotificationReplayCreate,
  type WaitlistNotificationReplayParams,
  type WaitlistNotificationReplayResult,
  type WaitlistOperationsStatus,
} from '@camp-registration/contracts';
import { WaitlistNotificationIssueNotFoundError } from '@camp-registration/database';
import type { FastifyInstance, FastifyRequest } from 'fastify';

import {
  OperationsAuthorizationError,
  OperationsValidationError,
  type OperationsServiceApi,
} from './service.js';

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

  app.post<{
    Body: WaitlistNotificationReplayCreate;
    Params: WaitlistNotificationReplayParams;
    Reply: WaitlistNotificationReplayResult | ProblemResponse;
  }>(
    '/v1/operations/waitlist/notifications/:issueType/:issueId/replay',
    {
      schema: {
        body: WaitlistNotificationReplayCreateSchema,
        description:
          'Re-evaluate a missing-recipient notification or replay a terminal delivery failure.',
        params: WaitlistNotificationReplayParamsSchema,
        response: {
          200: WaitlistNotificationReplayResultSchema,
          400: ProblemResponseSchema,
          403: ProblemResponseSchema,
          404: ProblemResponseSchema,
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
        return await operationsService.replayWaitlistNotification(
          request.params.issueType,
          request.params.issueId,
          request.body.reason,
          request.id,
        );
      } catch (error) {
        if (error instanceof OperationsAuthorizationError) {
          return reply.code(403).send({ code: 'forbidden', message: error.message });
        }
        if (error instanceof OperationsValidationError) {
          return reply.code(400).send({ code: 'validation_error', message: error.message });
        }
        if (error instanceof WaitlistNotificationIssueNotFoundError) {
          return reply.code(404).send({
            code: 'notification_issue_not_found',
            message: error.message,
          });
        }
        throw error;
      }
    },
  );
}
