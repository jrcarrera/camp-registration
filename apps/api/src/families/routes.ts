import {
  AdultCreateSchema,
  AdultParamsSchema,
  AdultUpdateSchema,
  CamperCreateSchema,
  CamperParamsSchema,
  CamperUpdateSchema,
  ContactCreateSchema,
  ContactParamsSchema,
  ContactUpdateSchema,
  FamilyCreateSchema,
  FamilyDetailSchema,
  FamilyListResponseSchema,
  FamilyParamsSchema,
  FamilyRegistrationCreateSchema,
  FamilyRegistrationResultSchema,
  FamilyUpdateSchema,
  ProblemResponseSchema,
  type AdultCreate,
  type AdultParams,
  type AdultUpdate,
  type CamperCreate,
  type CamperParams,
  type CamperUpdate,
  type ContactCreate,
  type ContactParams,
  type ContactUpdate,
  type FamilyCreate,
  type FamilyDetail,
  type FamilyListResponse,
  type FamilyParams,
  type FamilyRegistrationCreate,
  type FamilyRegistrationResult,
  type FamilyUpdate,
  type ProblemResponse,
} from '@camp-registration/contracts';
import type { FastifyInstance, FastifyReply } from 'fastify';

import {
  FamilyAuthorizationError,
  FamilyConflictError,
  FamilyDuplicateError,
  FamilyNotFoundError,
  FamilyRegistrationCapacityError,
  FamilyRegistrationDuplicateError,
  FamilyRegistrationEligibilityError,
  FamilyValidationError,
  type FamilyServiceApi,
} from './service.js';

function sendProblem(reply: FastifyReply, error: unknown) {
  if (error instanceof FamilyValidationError) {
    return reply.code(400).send({
      code: 'invalid_family',
      field_errors: error.fieldErrors,
      message: error.message,
    });
  }
  if (error instanceof FamilyAuthorizationError) {
    return reply.code(403).send({ code: 'forbidden', message: error.message });
  }
  if (error instanceof FamilyNotFoundError) {
    return reply.code(404).send({ code: 'not_found', message: error.message });
  }
  if (error instanceof FamilyConflictError) {
    return reply.code(409).send({ code: 'version_conflict', message: error.message });
  }
  if (error instanceof FamilyDuplicateError) {
    return reply.code(409).send({ code: 'duplicate_family_record', message: error.message });
  }
  if (error instanceof FamilyRegistrationEligibilityError) {
    return reply.code(400).send({
      code: 'invalid_registration',
      field_errors: error.fieldErrors,
      message: error.message,
    });
  }
  if (error instanceof FamilyRegistrationDuplicateError) {
    return reply.code(409).send({ code: 'duplicate_registration', message: error.message });
  }
  if (error instanceof FamilyRegistrationCapacityError) {
    return reply.code(409).send({ code: 'capacity_full', message: error.message });
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

function unavailable(reply: FastifyReply) {
  return reply.code(503).send({
    code: 'families_unavailable',
    message: 'Family dependencies are not configured.',
  });
}

export function registerFamilyRoutes(
  app: FastifyInstance,
  service: FamilyServiceApi | undefined,
): void {
  app.get<{ Reply: FamilyListResponse | ProblemResponse }>(
    '/v1/families',
    {
      schema: {
        description: 'Families visible to the active organization.',
        response: { 200: FamilyListResponseSchema, ...errorResponses },
        tags: ['families'],
      },
    },
    async (_request, reply) => {
      if (!service) return unavailable(reply);
      try {
        return { families: await service.listFamilies() };
      } catch (error) {
        return sendProblem(reply, error);
      }
    },
  );

  app.post<{ Body: FamilyCreate; Reply: FamilyDetail | ProblemResponse }>(
    '/v1/families',
    {
      schema: {
        body: FamilyCreateSchema,
        description: 'Create a family record for the active organization.',
        response: { 201: FamilyDetailSchema, ...errorResponses },
        tags: ['families'],
      },
    },
    async (request, reply) => {
      if (!service) return unavailable(reply);
      try {
        const family = await service.createFamily(request.body, request.id);
        return reply.code(201).send(family);
      } catch (error) {
        return sendProblem(reply, error);
      }
    },
  );

  app.get<{ Params: FamilyParams; Reply: FamilyDetail | ProblemResponse }>(
    '/v1/families/:familyId',
    {
      schema: {
        description: 'Family detail with adults, campers, and contacts.',
        params: FamilyParamsSchema,
        response: { 200: FamilyDetailSchema, ...errorResponses },
        tags: ['families'],
      },
    },
    async (request, reply) => {
      if (!service) return unavailable(reply);
      try {
        return await service.getFamily(request.params.familyId);
      } catch (error) {
        return sendProblem(reply, error);
      }
    },
  );

  app.patch<{ Body: FamilyUpdate; Params: FamilyParams; Reply: FamilyDetail | ProblemResponse }>(
    '/v1/families/:familyId',
    {
      schema: {
        body: FamilyUpdateSchema,
        description: 'Update family-level details.',
        params: FamilyParamsSchema,
        response: { 200: FamilyDetailSchema, ...errorResponses },
        tags: ['families'],
      },
    },
    async (request, reply) => {
      if (!service) return unavailable(reply);
      try {
        return await service.updateFamily(request.params.familyId, request.body, request.id);
      } catch (error) {
        return sendProblem(reply, error);
      }
    },
  );

  app.post<{ Body: AdultCreate; Params: FamilyParams; Reply: FamilyDetail | ProblemResponse }>(
    '/v1/families/:familyId/adults',
    {
      schema: {
        body: AdultCreateSchema,
        description: 'Add an adult to a family.',
        params: FamilyParamsSchema,
        response: { 201: FamilyDetailSchema, ...errorResponses },
        tags: ['families'],
      },
    },
    async (request, reply) => {
      if (!service) return unavailable(reply);
      try {
        const family = await service.createAdult(request.params.familyId, request.body, request.id);
        return reply.code(201).send(family);
      } catch (error) {
        return sendProblem(reply, error);
      }
    },
  );

  app.patch<{ Body: AdultUpdate; Params: AdultParams; Reply: FamilyDetail | ProblemResponse }>(
    '/v1/families/:familyId/adults/:adultId',
    {
      schema: {
        body: AdultUpdateSchema,
        description: 'Update an adult in a family.',
        params: AdultParamsSchema,
        response: { 200: FamilyDetailSchema, ...errorResponses },
        tags: ['families'],
      },
    },
    async (request, reply) => {
      if (!service) return unavailable(reply);
      try {
        return await service.updateAdult(
          request.params.familyId,
          request.params.adultId,
          request.body,
          request.id,
        );
      } catch (error) {
        return sendProblem(reply, error);
      }
    },
  );

  app.post<{ Body: CamperCreate; Params: FamilyParams; Reply: FamilyDetail | ProblemResponse }>(
    '/v1/families/:familyId/campers',
    {
      schema: {
        body: CamperCreateSchema,
        description: 'Add a camper to a family.',
        params: FamilyParamsSchema,
        response: { 201: FamilyDetailSchema, ...errorResponses },
        tags: ['families'],
      },
    },
    async (request, reply) => {
      if (!service) return unavailable(reply);
      try {
        const family = await service.createCamper(
          request.params.familyId,
          request.body,
          request.id,
        );
        return reply.code(201).send(family);
      } catch (error) {
        return sendProblem(reply, error);
      }
    },
  );

  app.patch<{ Body: CamperUpdate; Params: CamperParams; Reply: FamilyDetail | ProblemResponse }>(
    '/v1/families/:familyId/campers/:camperId',
    {
      schema: {
        body: CamperUpdateSchema,
        description: 'Update a camper in a family.',
        params: CamperParamsSchema,
        response: { 200: FamilyDetailSchema, ...errorResponses },
        tags: ['families'],
      },
    },
    async (request, reply) => {
      if (!service) return unavailable(reply);
      try {
        return await service.updateCamper(
          request.params.familyId,
          request.params.camperId,
          request.body,
          request.id,
        );
      } catch (error) {
        return sendProblem(reply, error);
      }
    },
  );

  app.post<{
    Body: FamilyRegistrationCreate;
    Params: FamilyParams;
    Reply: FamilyRegistrationResult | ProblemResponse;
  }>(
    '/v1/families/:familyId/registrations',
    {
      schema: {
        body: FamilyRegistrationCreateSchema,
        description: 'Register a camper in a session for this family.',
        params: FamilyParamsSchema,
        response: { 201: FamilyRegistrationResultSchema, ...errorResponses },
        tags: ['families', 'registrations'],
      },
    },
    async (request, reply) => {
      if (!service) return unavailable(reply);
      try {
        const result = await service.createRegistration(
          request.params.familyId,
          request.body,
          request.id,
        );
        return reply.code(201).send(result);
      } catch (error) {
        return sendProblem(reply, error);
      }
    },
  );

  app.post<{ Body: ContactCreate; Params: FamilyParams; Reply: FamilyDetail | ProblemResponse }>(
    '/v1/families/:familyId/contacts',
    {
      schema: {
        body: ContactCreateSchema,
        description: 'Add a contact to a family.',
        params: FamilyParamsSchema,
        response: { 201: FamilyDetailSchema, ...errorResponses },
        tags: ['families'],
      },
    },
    async (request, reply) => {
      if (!service) return unavailable(reply);
      try {
        const family = await service.createContact(
          request.params.familyId,
          request.body,
          request.id,
        );
        return reply.code(201).send(family);
      } catch (error) {
        return sendProblem(reply, error);
      }
    },
  );

  app.patch<{ Body: ContactUpdate; Params: ContactParams; Reply: FamilyDetail | ProblemResponse }>(
    '/v1/families/:familyId/contacts/:contactId',
    {
      schema: {
        body: ContactUpdateSchema,
        description: 'Update a contact in a family.',
        params: ContactParamsSchema,
        response: { 200: FamilyDetailSchema, ...errorResponses },
        tags: ['families'],
      },
    },
    async (request, reply) => {
      if (!service) return unavailable(reply);
      try {
        return await service.updateContact(
          request.params.familyId,
          request.params.contactId,
          request.body,
          request.id,
        );
      } catch (error) {
        return sendProblem(reply, error);
      }
    },
  );
}
