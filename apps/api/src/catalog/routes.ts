import {
  CatalogContextSchema,
  ProblemResponseSchema,
  ProgramCreateSchema,
  ProgramFixtureSchema,
  ProgramParamsSchema,
  ProgramUpdateSchema,
  SeasonCreateSchema,
  SeasonFixtureSchema,
  SessionAttendanceUpdateSchema,
  SessionCreateSchema,
  SessionDetailSchema,
  SessionListResponseSchema,
  SessionParamsSchema,
  SessionRegistrationParamsSchema,
  SessionUpdateSchema,
  type CatalogContext,
  type ProgramCreate,
  type ProgramFixture,
  type ProgramParams,
  type ProgramUpdate,
  type ProblemResponse,
  type SeasonCreate,
  type SeasonFixture,
  type SessionAttendanceUpdate,
  type SessionDetail,
  type SessionCreate,
  type SessionListResponse,
  type SessionParams,
  type SessionRegistrationParams,
  type SessionUpdate,
} from '@camp-registration/contracts';
import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';

import {
  CatalogAuthorizationError,
  CatalogCapacityError,
  CatalogConflictError,
  CatalogDuplicateError,
  CatalogNotFoundError,
  CatalogReferenceError,
  CatalogValidationError,
  type CatalogServiceApi,
} from './service.js';

type CatalogServiceSource =
  | CatalogServiceApi
  | ((request: FastifyRequest) => CatalogServiceApi | undefined)
  | undefined;

function resolveCatalogService(
  source: CatalogServiceSource,
  request: FastifyRequest,
): CatalogServiceApi | undefined {
  return typeof source === 'function' ? source(request) : source;
}

function sendProblem(reply: FastifyReply, error: unknown) {
  if (error instanceof CatalogValidationError) {
    return reply.code(400).send({
      code: error.message.startsWith('Program')
        ? 'invalid_program'
        : error.message.startsWith('Season')
          ? 'invalid_season'
          : error.message.startsWith('Attendance')
            ? 'invalid_attendance'
            : 'invalid_session',
      field_errors: error.fieldErrors,
      message: error.message,
    });
  }
  if (error instanceof CatalogAuthorizationError) {
    return reply.code(403).send({ code: 'forbidden', message: error.message });
  }
  if (error instanceof CatalogNotFoundError) {
    return reply.code(404).send({ code: 'not_found', message: error.message });
  }
  if (error instanceof CatalogConflictError) {
    return reply.code(409).send({ code: 'version_conflict', message: error.message });
  }
  if (error instanceof CatalogDuplicateError) {
    const code = error.message.startsWith('A season') ? 'duplicate_season' : 'duplicate_code';
    return reply.code(409).send({ code, message: error.message });
  }
  if (error instanceof CatalogReferenceError) {
    const code = error.message.startsWith('Season')
      ? 'invalid_season'
      : error.message.startsWith('Program')
        ? 'invalid_program'
        : 'invalid_registration';
    return reply.code(400).send({ code, message: error.message });
  }
  if (error instanceof CatalogCapacityError) {
    return reply.code(409).send({ code: 'capacity_conflict', message: error.message });
  }
  throw error;
}

const errorResponses = {
  400: ProblemResponseSchema,
  403: ProblemResponseSchema,
  404: ProblemResponseSchema,
  409: ProblemResponseSchema,
  503: ProblemResponseSchema,
};

export function registerCatalogRoutes(app: FastifyInstance, service: CatalogServiceSource): void {
  app.get<{ Reply: CatalogContext | ProblemResponse }>(
    '/v1/catalog',
    {
      schema: {
        description: 'Catalog organization, season, and program options.',
        response: { 200: CatalogContextSchema, ...errorResponses },
        tags: ['catalog'],
      },
    },
    async (request, reply) => {
      const catalogService = resolveCatalogService(service, request);
      if (!catalogService) {
        return reply.code(503).send({
          code: 'catalog_unavailable',
          message: 'Catalog dependencies are not configured.',
        });
      }
      try {
        return await catalogService.getContext();
      } catch (error) {
        return sendProblem(reply, error);
      }
    },
  );

  app.get<{ Reply: SessionListResponse | ProblemResponse }>(
    '/v1/sessions',
    {
      schema: {
        description: 'Sessions visible to the active organization.',
        response: { 200: SessionListResponseSchema, ...errorResponses },
        tags: ['sessions'],
      },
    },
    async (request, reply) => {
      const catalogService = resolveCatalogService(service, request);
      if (!catalogService) {
        return reply.code(503).send({
          code: 'catalog_unavailable',
          message: 'Catalog dependencies are not configured.',
        });
      }
      try {
        return { sessions: await catalogService.listSessions() };
      } catch (error) {
        return sendProblem(reply, error);
      }
    },
  );

  app.post<{ Body: SeasonCreate; Reply: SeasonFixture | ProblemResponse }>(
    '/v1/seasons',
    {
      schema: {
        body: SeasonCreateSchema,
        description: 'Create a season for the active organization.',
        response: { 201: SeasonFixtureSchema, ...errorResponses },
        tags: ['seasons'],
      },
    },
    async (request, reply) => {
      const catalogService = resolveCatalogService(service, request);
      if (!catalogService) {
        return reply.code(503).send({
          code: 'catalog_unavailable',
          message: 'Catalog dependencies are not configured.',
        });
      }
      try {
        const season = await catalogService.createSeason(request.body, request.id);
        return reply.code(201).send(season);
      } catch (error) {
        return sendProblem(reply, error);
      }
    },
  );

  app.post<{ Body: ProgramCreate; Reply: ProgramFixture | ProblemResponse }>(
    '/v1/programs',
    {
      schema: {
        body: ProgramCreateSchema,
        description: 'Create a program for the active organization.',
        response: { 201: ProgramFixtureSchema, ...errorResponses },
        tags: ['programs'],
      },
    },
    async (request, reply) => {
      const catalogService = resolveCatalogService(service, request);
      if (!catalogService) {
        return reply.code(503).send({
          code: 'catalog_unavailable',
          message: 'Catalog dependencies are not configured.',
        });
      }
      try {
        const program = await catalogService.createProgram(request.body, request.id);
        return reply.code(201).send(program);
      } catch (error) {
        return sendProblem(reply, error);
      }
    },
  );

  app.patch<{
    Body: ProgramUpdate;
    Params: ProgramParams;
    Reply: ProgramFixture | ProblemResponse;
  }>(
    '/v1/programs/:programId',
    {
      schema: {
        body: ProgramUpdateSchema,
        description: 'Update editable program defaults and metadata.',
        params: ProgramParamsSchema,
        response: { 200: ProgramFixtureSchema, ...errorResponses },
        tags: ['programs'],
      },
    },
    async (request, reply) => {
      const catalogService = resolveCatalogService(service, request);
      if (!catalogService) {
        return reply.code(503).send({
          code: 'catalog_unavailable',
          message: 'Catalog dependencies are not configured.',
        });
      }
      try {
        return await catalogService.updateProgram(
          request.params.programId,
          request.body,
          request.id,
        );
      } catch (error) {
        return sendProblem(reply, error);
      }
    },
  );

  app.post<{ Body: SessionCreate; Reply: SessionDetail | ProblemResponse }>(
    '/v1/sessions',
    {
      schema: {
        body: SessionCreateSchema,
        description: 'Create a session for the active organization.',
        response: { 201: SessionDetailSchema, ...errorResponses },
        tags: ['sessions'],
      },
    },
    async (request, reply) => {
      const catalogService = resolveCatalogService(service, request);
      if (!catalogService) {
        return reply.code(503).send({
          code: 'catalog_unavailable',
          message: 'Catalog dependencies are not configured.',
        });
      }
      try {
        const session = await catalogService.createSession(request.body, request.id);
        return reply.code(201).send(session);
      } catch (error) {
        return sendProblem(reply, error);
      }
    },
  );

  app.get<{ Params: SessionParams; Reply: SessionDetail | ProblemResponse }>(
    '/v1/sessions/:sessionId',
    {
      schema: {
        description: 'Session details for editing.',
        params: SessionParamsSchema,
        response: { 200: SessionDetailSchema, ...errorResponses },
        tags: ['sessions'],
      },
    },
    async (request, reply) => {
      const catalogService = resolveCatalogService(service, request);
      if (!catalogService) {
        return reply.code(503).send({
          code: 'catalog_unavailable',
          message: 'Catalog dependencies are not configured.',
        });
      }
      try {
        return await catalogService.getSession(request.params.sessionId);
      } catch (error) {
        return sendProblem(reply, error);
      }
    },
  );

  app.post<{
    Body: SessionAttendanceUpdate;
    Params: SessionRegistrationParams;
    Reply: SessionDetail | ProblemResponse;
  }>(
    '/v1/sessions/:sessionId/registrations/:registrationId/attendance',
    {
      schema: {
        body: SessionAttendanceUpdateSchema,
        description: 'Record daily attendance, check-in, check-out, or absence for a camper.',
        params: SessionRegistrationParamsSchema,
        response: { 200: SessionDetailSchema, ...errorResponses },
        tags: ['attendance', 'sessions'],
      },
    },
    async (request, reply) => {
      const catalogService = resolveCatalogService(service, request);
      if (!catalogService) {
        return reply.code(503).send({
          code: 'catalog_unavailable',
          message: 'Catalog dependencies are not configured.',
        });
      }
      try {
        return await catalogService.updateSessionAttendance(
          request.params.sessionId,
          request.params.registrationId,
          request.body,
          request.id,
        );
      } catch (error) {
        return sendProblem(reply, error);
      }
    },
  );

  app.patch<{
    Body: SessionUpdate;
    Params: SessionParams;
    Reply: SessionDetail | ProblemResponse;
  }>(
    '/v1/sessions/:sessionId',
    {
      schema: {
        body: SessionUpdateSchema,
        description: 'Update editable session configuration.',
        params: SessionParamsSchema,
        response: { 200: SessionDetailSchema, ...errorResponses },
        tags: ['sessions'],
      },
    },
    async (request, reply) => {
      const catalogService = resolveCatalogService(service, request);
      if (!catalogService) {
        return reply.code(503).send({
          code: 'catalog_unavailable',
          message: 'Catalog dependencies are not configured.',
        });
      }
      try {
        return await catalogService.updateSession(
          request.params.sessionId,
          request.body,
          request.id,
        );
      } catch (error) {
        return sendProblem(reply, error);
      }
    },
  );
}
