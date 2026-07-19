import {
  HousingAssignmentParamsSchema,
  HousingAssignmentWriteSchema,
  HousingAutoAssignSchema,
  HousingBedParamsSchema,
  HousingBedSchema,
  HousingBedWriteSchema,
  HousingBuildingParamsSchema,
  HousingBuildingSchema,
  HousingBuildingWriteSchema,
  HousingInventorySchema,
  ProblemResponseSchema,
  SessionHousingBuildingParamsSchema,
  SessionHousingBuildingWriteSchema,
  SessionHousingSchema,
  SessionParamsSchema,
  type HousingAssignmentWrite,
  type HousingAutoAssign,
  type HousingBedWrite,
  type HousingBuildingWrite,
  type HousingInventory,
  type ProblemResponse,
  type SessionHousing,
  type SessionHousingBuildingWrite,
} from '@camp-registration/contracts';
import {
  HousingConflictError,
  HousingNotFoundError,
  HousingValidationError,
} from '@camp-registration/database';
import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';

import { HousingAuthorizationError, type HousingServiceApi } from './service.js';

type Source =
  | HousingServiceApi
  | ((request: FastifyRequest) => HousingServiceApi | undefined)
  | undefined;
const resolve = (source: Source, request: FastifyRequest) =>
  typeof source === 'function' ? source(request) : source;
const errors = {
  400: ProblemResponseSchema,
  403: ProblemResponseSchema,
  404: ProblemResponseSchema,
  409: ProblemResponseSchema,
  503: ProblemResponseSchema,
};
function unavailable(reply: FastifyReply) {
  return reply
    .code(503)
    .send({ code: 'housing_unavailable', message: 'Housing dependencies are not configured.' });
}
function problem(reply: FastifyReply, error: unknown) {
  if (error instanceof HousingAuthorizationError)
    return reply.code(403).send({ code: 'forbidden', message: error.message });
  if (error instanceof HousingNotFoundError)
    return reply.code(404).send({ code: 'not_found', message: error.message });
  if (error instanceof HousingConflictError)
    return reply.code(409).send({ code: 'housing_conflict', message: error.message });
  if (error instanceof HousingValidationError)
    return reply.code(400).send({ code: 'invalid_housing', message: error.message });
  throw error;
}

export function registerHousingRoutes(app: FastifyInstance, source: Source): void {
  app.get<{ Reply: HousingInventory | ProblemResponse }>(
    '/v1/housing',
    { schema: { response: { 200: HousingInventorySchema, ...errors }, tags: ['housing'] } },
    async (request, reply) => {
      const service = resolve(source, request);
      if (!service) return unavailable(reply);
      try {
        return await service.listInventory();
      } catch (error) {
        return problem(reply, error);
      }
    },
  );
  app.post<{
    Body: HousingBuildingWrite;
    Reply: HousingInventory['buildings'][number] | ProblemResponse;
  }>(
    '/v1/housing/buildings',
    {
      schema: {
        body: HousingBuildingWriteSchema,
        response: { 201: HousingBuildingSchema, ...errors },
        tags: ['housing'],
      },
    },
    async (request, reply) => {
      const service = resolve(source, request);
      if (!service) return unavailable(reply);
      try {
        return reply.code(201).send(await service.createBuilding(request.body, request.id));
      } catch (error) {
        return problem(reply, error);
      }
    },
  );
  app.put<{
    Body: HousingBuildingWrite;
    Params: { buildingId: string };
    Reply: HousingInventory['buildings'][number] | ProblemResponse;
  }>(
    '/v1/housing/buildings/:buildingId',
    {
      schema: {
        body: HousingBuildingWriteSchema,
        params: HousingBuildingParamsSchema,
        response: { 200: HousingBuildingSchema, ...errors },
        tags: ['housing'],
      },
    },
    async (request, reply) => {
      const service = resolve(source, request);
      if (!service) return unavailable(reply);
      try {
        return await service.updateBuilding(request.params.buildingId, request.body, request.id);
      } catch (error) {
        return problem(reply, error);
      }
    },
  );
  app.post<{
    Body: HousingBedWrite;
    Params: { buildingId: string };
    Reply: HousingInventory['buildings'][number]['beds'][number] | ProblemResponse;
  }>(
    '/v1/housing/buildings/:buildingId/beds',
    {
      schema: {
        body: HousingBedWriteSchema,
        params: HousingBuildingParamsSchema,
        response: { 201: HousingBedSchema, ...errors },
        tags: ['housing'],
      },
    },
    async (request, reply) => {
      const service = resolve(source, request);
      if (!service) return unavailable(reply);
      try {
        return reply
          .code(201)
          .send(await service.createBed(request.params.buildingId, request.body, request.id));
      } catch (error) {
        return problem(reply, error);
      }
    },
  );
  app.put<{
    Body: HousingBedWrite;
    Params: { bedId: string };
    Reply: HousingInventory['buildings'][number]['beds'][number] | ProblemResponse;
  }>(
    '/v1/housing/beds/:bedId',
    {
      schema: {
        body: HousingBedWriteSchema,
        params: HousingBedParamsSchema,
        response: { 200: HousingBedSchema, ...errors },
        tags: ['housing'],
      },
    },
    async (request, reply) => {
      const service = resolve(source, request);
      if (!service) return unavailable(reply);
      try {
        return await service.updateBed(request.params.bedId, request.body, request.id);
      } catch (error) {
        return problem(reply, error);
      }
    },
  );
  app.get<{ Params: { sessionId: string }; Reply: SessionHousing | ProblemResponse }>(
    '/v1/sessions/:sessionId/housing',
    {
      schema: {
        params: SessionParamsSchema,
        response: { 200: SessionHousingSchema, ...errors },
        tags: ['housing'],
      },
    },
    async (request, reply) => {
      const service = resolve(source, request);
      if (!service) return unavailable(reply);
      try {
        return await service.getSession(request.params.sessionId);
      } catch (error) {
        return problem(reply, error);
      }
    },
  );
  app.put<{
    Body: SessionHousingBuildingWrite;
    Params: { buildingId: string; sessionId: string };
    Reply: SessionHousing | ProblemResponse;
  }>(
    '/v1/sessions/:sessionId/housing/buildings/:buildingId',
    {
      schema: {
        body: SessionHousingBuildingWriteSchema,
        params: SessionHousingBuildingParamsSchema,
        response: { 200: SessionHousingSchema, ...errors },
        tags: ['housing'],
      },
    },
    async (request, reply) => {
      const service = resolve(source, request);
      if (!service) return unavailable(reply);
      try {
        return await service.configureSessionBuilding(
          request.params.sessionId,
          request.params.buildingId,
          request.body,
          request.id,
        );
      } catch (error) {
        return problem(reply, error);
      }
    },
  );
  app.post<{
    Body: HousingAssignmentWrite;
    Params: { sessionId: string };
    Reply: SessionHousing | ProblemResponse;
  }>(
    '/v1/sessions/:sessionId/housing/assignments',
    {
      schema: {
        body: HousingAssignmentWriteSchema,
        params: SessionParamsSchema,
        response: { 200: SessionHousingSchema, ...errors },
        tags: ['housing'],
      },
    },
    async (request, reply) => {
      const service = resolve(source, request);
      if (!service) return unavailable(reply);
      try {
        return await service.assign(request.params.sessionId, request.body, request.id);
      } catch (error) {
        return problem(reply, error);
      }
    },
  );
  app.delete<{
    Params: { assignmentId: string; sessionId: string };
    Reply: SessionHousing | ProblemResponse;
  }>(
    '/v1/sessions/:sessionId/housing/assignments/:assignmentId',
    {
      schema: {
        params: HousingAssignmentParamsSchema,
        response: { 200: SessionHousingSchema, ...errors },
        tags: ['housing'],
      },
    },
    async (request, reply) => {
      const service = resolve(source, request);
      if (!service) return unavailable(reply);
      try {
        return await service.unassign(
          request.params.sessionId,
          request.params.assignmentId,
          request.id,
        );
      } catch (error) {
        return problem(reply, error);
      }
    },
  );
  app.post<{
    Body: HousingAutoAssign;
    Params: { sessionId: string };
    Reply: SessionHousing | ProblemResponse;
  }>(
    '/v1/sessions/:sessionId/housing/auto-assign',
    {
      schema: {
        body: HousingAutoAssignSchema,
        params: SessionParamsSchema,
        response: { 200: SessionHousingSchema, ...errors },
        tags: ['housing'],
      },
    },
    async (request, reply) => {
      const service = resolve(source, request);
      if (!service) return unavailable(reply);
      try {
        return await service.autoAssign(request.params.sessionId, request.body, request.id);
      } catch (error) {
        return problem(reply, error);
      }
    },
  );
}
