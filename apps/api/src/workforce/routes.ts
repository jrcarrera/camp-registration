import {
  ProblemResponseSchema,
  SessionParamsSchema,
  SessionWorkforceRosterSchema,
  WorkforceAccountLinkSchema,
  WorkforceAssignmentCreateSchema,
  WorkforceAssignmentParamsSchema,
  WorkforceAssignmentUpdateSchema,
  WorkforceListQuerySchema,
  WorkforceListResponseSchema,
  WorkforceProfileCreateSchema,
  WorkforceProfileDetailSchema,
  WorkforceProfileParamsSchema,
  WorkforceProfileUpdateSchema,
  type WorkforceAccountLink,
  type WorkforceAssignmentCreate,
  type WorkforceAssignmentUpdate,
  type WorkforceListQuery,
  type WorkforceProfileCreate,
  type WorkforceProfileParams,
  type WorkforceProfileUpdate,
} from '@camp-registration/contracts';
import {
  WorkforceConflictError,
  WorkforceNotFoundError,
  WorkforceValidationError,
} from '@camp-registration/database';
import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import {
  WorkforceAuthorizationError,
  WorkforceInputError,
  type WorkforceServiceApi,
} from './service.js';

type Source =
  | WorkforceServiceApi
  | ((request: FastifyRequest) => WorkforceServiceApi | undefined)
  | undefined;
const resolve = (source: Source, request: FastifyRequest) =>
  typeof source === 'function' ? source(request) : source;
const unavailable = (reply: FastifyReply) =>
  reply
    .code(503)
    .header('cache-control', 'private, no-store')
    .send({ code: 'workforce_unavailable', message: 'Workforce dependencies are not configured.' });
function problem(reply: FastifyReply, error: unknown) {
  reply.header('cache-control', 'private, no-store');
  if (error instanceof WorkforceAuthorizationError)
    return reply.code(403).send({ code: 'forbidden', message: error.message });
  if (error instanceof WorkforceNotFoundError)
    return reply.code(404).send({ code: 'not_found', message: error.message });
  if (error instanceof WorkforceConflictError) {
    const code = error.message.includes('email')
      ? 'workforce_email_conflict'
      : error.message.includes('account')
        ? 'workforce_account_link_conflict'
        : error.message.includes('assignment') && error.message.includes('identical')
          ? 'workforce_assignment_conflict'
          : 'workforce_version_conflict';
    return reply.code(409).send({ code, message: error.message });
  }
  if (error instanceof WorkforceValidationError)
    return reply.code(400).send({ code: error.code, message: error.message });
  if (error instanceof WorkforceInputError)
    return reply.code(400).send({ code: 'invalid_workforce', message: error.message });
  throw error;
}
export function registerWorkforceRoutes(app: FastifyInstance, source: Source): void {
  app.addHook('onRequest', (request, reply, done) => {
    if (
      request.url.startsWith('/v1/workforce') ||
      /^\/v1\/sessions\/[^/]+\/workforce-roster(?:\?|$)/.test(request.url)
    ) {
      reply.header('cache-control', 'private, no-store');
    }
    done();
  });
  const admin = (
    method: 'get' | 'post' | 'patch',
    url: string,
    schema: object,
    handler: (service: WorkforceServiceApi, request: FastifyRequest) => Promise<unknown>,
  ) =>
    app[method](url, { attachValidation: true, schema }, async (request, reply) => {
      if (request.validationError)
        return problem(reply, new WorkforceInputError('Workforce request is invalid'));
      const service = resolve(source, request);
      if (!service) return unavailable(reply);
      try {
        return reply
          .header('cache-control', 'private, no-store')
          .send(await handler(service, request));
      } catch (error) {
        return problem(reply, error);
      }
    });
  admin(
    'get',
    '/v1/workforce',
    {
      querystring: WorkforceListQuerySchema,
      response: {
        200: WorkforceListResponseSchema,
        400: ProblemResponseSchema,
        403: ProblemResponseSchema,
        503: ProblemResponseSchema,
      },
      tags: ['workforce'],
    },
    (service, request) => service.listProfiles(request.query as WorkforceListQuery, request.id),
  );
  admin(
    'post',
    '/v1/workforce',
    {
      body: WorkforceProfileCreateSchema,
      response: {
        200: WorkforceProfileDetailSchema,
        400: ProblemResponseSchema,
        403: ProblemResponseSchema,
        409: ProblemResponseSchema,
        503: ProblemResponseSchema,
      },
      tags: ['workforce'],
    },
    (service, request) => service.createProfile(request.body as WorkforceProfileCreate, request.id),
  );
  admin(
    'get',
    '/v1/workforce/:profileId',
    {
      params: WorkforceProfileParamsSchema,
      response: {
        200: WorkforceProfileDetailSchema,
        400: ProblemResponseSchema,
        403: ProblemResponseSchema,
        404: ProblemResponseSchema,
        503: ProblemResponseSchema,
      },
      tags: ['workforce'],
    },
    (service, request) =>
      service.getProfile((request.params as WorkforceProfileParams).profileId, request.id),
  );
  admin(
    'patch',
    '/v1/workforce/:profileId',
    {
      params: WorkforceProfileParamsSchema,
      body: WorkforceProfileUpdateSchema,
      response: {
        200: WorkforceProfileDetailSchema,
        400: ProblemResponseSchema,
        403: ProblemResponseSchema,
        404: ProblemResponseSchema,
        409: ProblemResponseSchema,
        503: ProblemResponseSchema,
      },
      tags: ['workforce'],
    },
    (service, request) =>
      service.updateProfile(
        (request.params as WorkforceProfileParams).profileId,
        request.body as WorkforceProfileUpdate,
        request.id,
      ),
  );
  admin(
    'post',
    '/v1/workforce/:profileId/account-link',
    {
      params: WorkforceProfileParamsSchema,
      body: WorkforceAccountLinkSchema,
      response: {
        200: WorkforceProfileDetailSchema,
        400: ProblemResponseSchema,
        403: ProblemResponseSchema,
        404: ProblemResponseSchema,
        409: ProblemResponseSchema,
        503: ProblemResponseSchema,
      },
      tags: ['workforce'],
    },
    (service, request) =>
      service.linkAccount(
        (request.params as WorkforceProfileParams).profileId,
        (request.body as WorkforceAccountLink).version,
        request.id,
      ),
  );
  admin(
    'post',
    '/v1/workforce/:profileId/assignments',
    {
      params: WorkforceProfileParamsSchema,
      body: WorkforceAssignmentCreateSchema,
      response: {
        200: WorkforceProfileDetailSchema,
        400: ProblemResponseSchema,
        403: ProblemResponseSchema,
        404: ProblemResponseSchema,
        409: ProblemResponseSchema,
        503: ProblemResponseSchema,
      },
      tags: ['workforce'],
    },
    (service, request) =>
      service.createAssignment(
        (request.params as WorkforceProfileParams).profileId,
        request.body as WorkforceAssignmentCreate,
        request.id,
      ),
  );
  admin(
    'patch',
    '/v1/workforce/:profileId/assignments/:assignmentId',
    {
      params: WorkforceAssignmentParamsSchema,
      body: WorkforceAssignmentUpdateSchema,
      response: {
        200: WorkforceProfileDetailSchema,
        400: ProblemResponseSchema,
        403: ProblemResponseSchema,
        404: ProblemResponseSchema,
        409: ProblemResponseSchema,
        503: ProblemResponseSchema,
      },
      tags: ['workforce'],
    },
    (service, request) => {
      const p = request.params as { profileId: string; assignmentId: string };
      return service.updateAssignment(
        p.profileId,
        p.assignmentId,
        request.body as WorkforceAssignmentUpdate,
        request.id,
      );
    },
  );
  app.get(
    '/v1/sessions/:sessionId/workforce-roster',
    {
      attachValidation: true,
      schema: {
        params: SessionParamsSchema,
        response: {
          200: SessionWorkforceRosterSchema,
          400: ProblemResponseSchema,
          403: ProblemResponseSchema,
          404: ProblemResponseSchema,
          503: ProblemResponseSchema,
        },
        tags: ['workforce'],
      },
    },
    async (request, reply) => {
      if (request.validationError)
        return problem(reply, new WorkforceInputError('Workforce request is invalid'));
      const service = resolve(source, request);
      if (!service) return unavailable(reply);
      try {
        return reply
          .header('cache-control', 'private, no-store')
          .send(
            await service.getSessionRoster(
              (request.params as { sessionId: string }).sessionId,
              request.id,
            ),
          );
      } catch (error) {
        return problem(reply, error);
      }
    },
  );
}
