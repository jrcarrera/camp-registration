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
  FamilyRegistrationParamsSchema,
  FamilyRegistrationCreateSchema,
  FamilyRegistrationPaymentCreateSchema,
  FamilyRegistrationResultSchema,
  FamilyUpdateSchema,
  ParentCheckoutCreateSchema,
  ProblemResponseSchema,
  SessionParamsSchema,
  WaitlistOfferCreateSchema,
  WaitlistOfferParamsSchema,
  WaitlistOfferStaffActionCreateSchema,
  WaitlistQueueOrderResultSchema,
  WaitlistQueueOrderUpdateSchema,
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
  type FamilyRegistrationParams,
  type FamilyRegistrationCreate,
  type FamilyRegistrationPaymentCreate,
  type FamilyRegistrationResult,
  type FamilyUpdate,
  type ParentCheckoutCreate,
  type ProblemResponse,
  type SessionParams,
  type WaitlistOfferCreate,
  type WaitlistOfferParams,
  type WaitlistOfferStaffActionCreate,
  type WaitlistQueueOrderResult,
  type WaitlistQueueOrderUpdate,
} from '@camp-registration/contracts';
import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';

import {
  FamilyAuthorizationError,
  FamilyConflictError,
  FamilyDuplicateError,
  FamilyNotFoundError,
  FamilyRegistrationCapacityError,
  FamilyRegistrationDuplicateError,
  FamilyRegistrationEligibilityError,
  FamilyValidationError,
  FamilyWaitlistOfferConflictError,
  FamilyWaitlistOrderConflictError,
  type FamilyServiceApi,
} from './service.js';

type FamilyServiceSource =
  | FamilyServiceApi
  | ((request: FastifyRequest) => FamilyServiceApi | undefined)
  | undefined;

function resolveFamilyService(
  source: FamilyServiceSource,
  request: FastifyRequest,
): FamilyServiceApi | undefined {
  return typeof source === 'function' ? source(request) : source;
}

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
  if (error instanceof FamilyWaitlistOfferConflictError) {
    return reply.code(409).send({ code: 'waitlist_offer_conflict', message: error.message });
  }
  if (error instanceof FamilyWaitlistOrderConflictError) {
    return reply.code(409).send({ code: 'waitlist_order_conflict', message: error.message });
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

export function registerFamilyRoutes(app: FastifyInstance, service: FamilyServiceSource): void {
  app.get<{ Reply: FamilyListResponse | ProblemResponse }>(
    '/v1/families',
    {
      schema: {
        description: 'Families visible to the active organization.',
        response: { 200: FamilyListResponseSchema, ...errorResponses },
        tags: ['families'],
      },
    },
    async (request, reply) => {
      const familyService = resolveFamilyService(service, request);
      if (!familyService) return unavailable(reply);
      try {
        return { families: await familyService.listFamilies() };
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
      const familyService = resolveFamilyService(service, request);
      if (!familyService) return unavailable(reply);
      try {
        const family = await familyService.createFamily(request.body, request.id);
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
      const familyService = resolveFamilyService(service, request);
      if (!familyService) return unavailable(reply);
      try {
        return await familyService.getFamily(request.params.familyId);
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
      const familyService = resolveFamilyService(service, request);
      if (!familyService) return unavailable(reply);
      try {
        return await familyService.updateFamily(request.params.familyId, request.body, request.id);
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
      const familyService = resolveFamilyService(service, request);
      if (!familyService) return unavailable(reply);
      try {
        const family = await familyService.createAdult(
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
      const familyService = resolveFamilyService(service, request);
      if (!familyService) return unavailable(reply);
      try {
        return await familyService.updateAdult(
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

  app.post<{ Params: AdultParams; Reply: FamilyDetail | ProblemResponse }>(
    '/v1/families/:familyId/adults/:adultId/claim-identity',
    {
      schema: {
        description: 'Claim an adult record for the authenticated identity.',
        params: AdultParamsSchema,
        response: { 200: FamilyDetailSchema, ...errorResponses },
        tags: ['families'],
      },
    },
    async (request, reply) => {
      const familyService = resolveFamilyService(service, request);
      if (!familyService) return unavailable(reply);
      try {
        return await familyService.claimAdultIdentity(
          request.params.familyId,
          request.params.adultId,
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
      const familyService = resolveFamilyService(service, request);
      if (!familyService) return unavailable(reply);
      try {
        const family = await familyService.createCamper(
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
      const familyService = resolveFamilyService(service, request);
      if (!familyService) return unavailable(reply);
      try {
        return await familyService.updateCamper(
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
      const familyService = resolveFamilyService(service, request);
      if (!familyService) return unavailable(reply);
      try {
        const result = await familyService.createRegistration(
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

  app.post<{
    Body: ParentCheckoutCreate;
    Params: FamilyParams;
    Reply: FamilyRegistrationResult | ProblemResponse;
  }>(
    '/v1/families/:familyId/checkout',
    {
      schema: {
        body: ParentCheckoutCreateSchema,
        deprecated: true,
        description: 'Deprecated parent checkout. Use household order quote and submission APIs.',
        params: FamilyParamsSchema,
        response: {
          201: FamilyRegistrationResultSchema,
          410: ProblemResponseSchema,
          ...errorResponses,
        },
        tags: ['families', 'registrations'],
      },
    },
    async (request, reply) => {
      if (process.env.ALLOW_LEGACY_PARENT_CHECKOUT === 'true') {
        const familyService = resolveFamilyService(service, request);
        if (!familyService) return unavailable(reply);
        try {
          return reply
            .code(201)
            .send(
              await familyService.createParentCheckout(
                request.params.familyId,
                request.body,
                request.id,
              ),
            );
        } catch (error) {
          return sendProblem(reply, error);
        }
      }
      return reply.code(410).send({
        code: 'parent_checkout_migrated',
        message: 'Parent checkout has moved to the household cart.',
      });
    },
  );

  app.post<{
    Params: FamilyRegistrationParams;
    Reply: FamilyRegistrationResult | ProblemResponse;
  }>(
    '/v1/families/:familyId/registrations/:registrationId/cancel',
    {
      schema: {
        description: 'Cancel an active registration for this family.',
        params: FamilyRegistrationParamsSchema,
        response: { 200: FamilyRegistrationResultSchema, ...errorResponses },
        tags: ['families', 'registrations'],
      },
    },
    async (request, reply) => {
      const familyService = resolveFamilyService(service, request);
      if (!familyService) return unavailable(reply);
      try {
        return await familyService.cancelRegistration(
          request.params.familyId,
          request.params.registrationId,
          request.id,
        );
      } catch (error) {
        return sendProblem(reply, error);
      }
    },
  );

  app.post<{
    Body: FamilyRegistrationPaymentCreate;
    Params: FamilyRegistrationParams;
    Reply: FamilyRegistrationResult | ProblemResponse;
  }>(
    '/v1/families/:familyId/registrations/:registrationId/payments',
    {
      schema: {
        body: FamilyRegistrationPaymentCreateSchema,
        description: 'Record an offline payment or credit for a confirmed registration.',
        params: FamilyRegistrationParamsSchema,
        response: { 201: FamilyRegistrationResultSchema, ...errorResponses },
        tags: ['families', 'payments', 'registrations'],
      },
    },
    async (request, reply) => {
      const familyService = resolveFamilyService(service, request);
      if (!familyService) return unavailable(reply);
      try {
        const result = await familyService.recordRegistrationPayment(
          request.params.familyId,
          request.params.registrationId,
          request.body,
          request.id,
        );
        return reply.code(201).send(result);
      } catch (error) {
        return sendProblem(reply, error);
      }
    },
  );

  app.post<{
    Body: WaitlistOfferCreate;
    Params: SessionParams;
    Reply: FamilyRegistrationResult | ProblemResponse;
  }>(
    '/v1/sessions/:sessionId/waitlist/offers',
    {
      schema: {
        body: WaitlistOfferCreateSchema,
        description: 'Offer available capacity to the next waitlisted registration.',
        params: SessionParamsSchema,
        response: { 201: FamilyRegistrationResultSchema, ...errorResponses },
        tags: ['registrations', 'sessions', 'waitlist-offers'],
      },
    },
    async (request, reply) => {
      const familyService = resolveFamilyService(service, request);
      if (!familyService) return unavailable(reply);
      try {
        const result = await familyService.createNextWaitlistOffer(
          request.params.sessionId,
          request.body,
          request.id,
        );
        return reply.code(201).send(result);
      } catch (error) {
        return sendProblem(reply, error);
      }
    },
  );

  app.put<{
    Body: WaitlistQueueOrderUpdate;
    Params: SessionParams;
    Reply: WaitlistQueueOrderResult | ProblemResponse;
  }>(
    '/v1/sessions/:sessionId/waitlist/order',
    {
      schema: {
        body: WaitlistQueueOrderUpdateSchema,
        description: 'Replace the authoritative waitlist order for a session.',
        params: SessionParamsSchema,
        response: { 200: WaitlistQueueOrderResultSchema, ...errorResponses },
        tags: ['registrations', 'sessions', 'waitlist'],
      },
    },
    async (request, reply) => {
      const familyService = resolveFamilyService(service, request);
      if (!familyService) return unavailable(reply);
      try {
        return await familyService.reorderWaitlist(
          request.params.sessionId,
          request.body,
          request.id,
        );
      } catch (error) {
        return sendProblem(reply, error);
      }
    },
  );

  app.post<{
    Body: WaitlistOfferStaffActionCreate;
    Params: WaitlistOfferParams;
    Reply: FamilyRegistrationResult | ProblemResponse;
  }>(
    '/v1/sessions/:sessionId/waitlist/offers/:offerId/resend',
    {
      schema: {
        body: WaitlistOfferStaffActionCreateSchema,
        description: 'Queue another delivery of an active waitlist offer.',
        params: WaitlistOfferParamsSchema,
        response: { 200: FamilyRegistrationResultSchema, ...errorResponses },
        tags: ['registrations', 'sessions', 'waitlist-offers'],
      },
    },
    async (request, reply) => {
      const familyService = resolveFamilyService(service, request);
      if (!familyService) return unavailable(reply);
      try {
        return await familyService.manageWaitlistOffer(
          request.params.sessionId,
          request.params.offerId,
          'RESEND',
          request.body.reason?.trim() || null,
          request.id,
        );
      } catch (error) {
        return sendProblem(reply, error);
      }
    },
  );

  app.post<{
    Body: WaitlistOfferStaffActionCreate;
    Params: WaitlistOfferParams;
    Reply: FamilyRegistrationResult | ProblemResponse;
  }>(
    '/v1/sessions/:sessionId/waitlist/offers/:offerId/cancel',
    {
      schema: {
        body: WaitlistOfferStaffActionCreateSchema,
        description: 'Cancel an active waitlist offer and keep its registration in queue.',
        params: WaitlistOfferParamsSchema,
        response: { 200: FamilyRegistrationResultSchema, ...errorResponses },
        tags: ['registrations', 'sessions', 'waitlist-offers'],
      },
    },
    async (request, reply) => {
      const familyService = resolveFamilyService(service, request);
      if (!familyService) return unavailable(reply);
      try {
        return await familyService.manageWaitlistOffer(
          request.params.sessionId,
          request.params.offerId,
          'CANCEL',
          request.body.reason?.trim() || null,
          request.id,
        );
      } catch (error) {
        return sendProblem(reply, error);
      }
    },
  );

  app.post<{
    Body: WaitlistOfferStaffActionCreate;
    Params: WaitlistOfferParams;
    Reply: FamilyRegistrationResult | ProblemResponse;
  }>(
    '/v1/sessions/:sessionId/waitlist/offers/:offerId/skip',
    {
      schema: {
        body: WaitlistOfferStaffActionCreateSchema,
        description: 'Cancel an active offer and move its registration to the end of the queue.',
        params: WaitlistOfferParamsSchema,
        response: { 200: FamilyRegistrationResultSchema, ...errorResponses },
        tags: ['registrations', 'sessions', 'waitlist-offers'],
      },
    },
    async (request, reply) => {
      const familyService = resolveFamilyService(service, request);
      if (!familyService) return unavailable(reply);
      try {
        return await familyService.manageWaitlistOffer(
          request.params.sessionId,
          request.params.offerId,
          'SKIP',
          request.body.reason?.trim() || null,
          request.id,
        );
      } catch (error) {
        return sendProblem(reply, error);
      }
    },
  );

  app.post<{ Params: FamilyRegistrationParams; Reply: FamilyRegistrationResult | ProblemResponse }>(
    '/v1/families/:familyId/registrations/:registrationId/waitlist-offer/accept',
    {
      schema: {
        description: 'Accept an active waitlist offer for a family registration.',
        params: FamilyRegistrationParamsSchema,
        response: { 200: FamilyRegistrationResultSchema, ...errorResponses },
        tags: ['families', 'registrations', 'waitlist-offers'],
      },
    },
    async (request, reply) => {
      const familyService = resolveFamilyService(service, request);
      if (!familyService) return unavailable(reply);
      try {
        return await familyService.respondToWaitlistOffer(
          request.params.familyId,
          request.params.registrationId,
          'ACCEPT',
          request.id,
        );
      } catch (error) {
        return sendProblem(reply, error);
      }
    },
  );

  app.post<{ Params: FamilyRegistrationParams; Reply: FamilyRegistrationResult | ProblemResponse }>(
    '/v1/families/:familyId/registrations/:registrationId/waitlist-offer/decline',
    {
      schema: {
        description: 'Decline an active waitlist offer and release the waitlist registration.',
        params: FamilyRegistrationParamsSchema,
        response: { 200: FamilyRegistrationResultSchema, ...errorResponses },
        tags: ['families', 'registrations', 'waitlist-offers'],
      },
    },
    async (request, reply) => {
      const familyService = resolveFamilyService(service, request);
      if (!familyService) return unavailable(reply);
      try {
        return await familyService.respondToWaitlistOffer(
          request.params.familyId,
          request.params.registrationId,
          'DECLINE',
          request.id,
        );
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
      const familyService = resolveFamilyService(service, request);
      if (!familyService) return unavailable(reply);
      try {
        const family = await familyService.createContact(
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
      const familyService = resolveFamilyService(service, request);
      if (!familyService) return unavailable(reply);
      try {
        return await familyService.updateContact(
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
