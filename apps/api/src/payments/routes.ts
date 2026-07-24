import {
  FamilyRegistrationParamsSchema,
  HouseholdOrderParamsSchema,
  InstallmentParamsSchema,
  OnlinePaymentCheckoutCreateSchema,
  OnlinePaymentCheckoutSchema,
  PaymentAttemptListResponseSchema,
  PaymentAttemptParamsSchema,
  PaymentAttemptSchema,
  PaymentAdjustmentCenterSchema,
  PaymentAdjustmentCreateSchema,
  PaymentAdjustmentSchema,
  PaymentCompletionSchema,
  ProblemResponseSchema,
  type FamilyRegistrationParams,
  type HouseholdOrderParams,
  type InstallmentParams,
  type OnlinePaymentCheckout,
  type OnlinePaymentCheckoutCreate,
  type PaymentAttempt,
  type PaymentAttemptListResponse,
  type PaymentAttemptParams,
  type PaymentAdjustment,
  type PaymentAdjustmentCenter,
  type PaymentAdjustmentCreate,
  type PaymentCompletion,
  type ProblemResponse,
} from '@camp-registration/contracts';
import {
  PaymentConfigurationError,
  PaymentEligibilityError,
  PaymentIdempotencyConflictError,
  PaymentNotFoundError,
} from '@camp-registration/database';
import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';

import {
  PaymentAuthorizationError,
  PaymentProviderUnavailableError,
  PaymentValidationError,
  PaymentWebhookVerificationError,
  type PaymentServiceApi,
  type PaymentWebhookService,
} from './service.js';

type PaymentServiceSource =
  | PaymentServiceApi
  | ((request: FastifyRequest) => PaymentServiceApi | undefined)
  | undefined;

function resolvePaymentService(
  source: PaymentServiceSource,
  request: FastifyRequest,
): PaymentServiceApi | undefined {
  return typeof source === 'function' ? source(request) : source;
}

function sendProblem(reply: FastifyReply, error: unknown) {
  if (error instanceof PaymentAuthorizationError) {
    return reply.code(403).send({ code: 'forbidden', message: error.message });
  }
  if (error instanceof PaymentNotFoundError) {
    return reply.code(404).send({ code: 'not_found', message: error.message });
  }
  if (
    error instanceof PaymentEligibilityError ||
    error instanceof PaymentValidationError ||
    error instanceof PaymentConfigurationError
  ) {
    return reply.code(400).send({ code: 'payment_unavailable', message: error.message });
  }
  if (error instanceof PaymentIdempotencyConflictError) {
    return reply.code(409).send({ code: 'idempotency_conflict', message: error.message });
  }
  if (error instanceof PaymentProviderUnavailableError) {
    return reply.code(503).send({ code: 'payment_provider_unavailable', message: error.message });
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
    code: 'payments_unavailable',
    message: 'Payment dependencies are not configured.',
  });
}

export function registerPaymentRoutes(
  app: FastifyInstance,
  service: PaymentServiceSource,
  webhookService?: PaymentWebhookService,
): void {
  app.post<{
    Body: OnlinePaymentCheckoutCreate;
    Params: FamilyRegistrationParams;
    Reply: OnlinePaymentCheckout | ProblemResponse;
  }>(
    '/v1/families/:familyId/registrations/:registrationId/online-payment',
    {
      schema: {
        body: OnlinePaymentCheckoutCreateSchema,
        description: 'Create a provider-hosted checkout for the remaining registration deposit.',
        params: FamilyRegistrationParamsSchema,
        response: { 201: OnlinePaymentCheckoutSchema, ...errorResponses },
        tags: ['payments', 'registrations'],
      },
    },
    async (request, reply) => {
      const paymentService = resolvePaymentService(service, request);
      if (!paymentService) return unavailable(reply);
      try {
        const checkout = await paymentService.createCheckout(
          request.params.familyId,
          request.params.registrationId,
          request.body.idempotency_key,
          request.id,
        );
        return reply.code(201).send(checkout);
      } catch (error) {
        return sendProblem(reply, error);
      }
    },
  );

  app.post<{
    Body: OnlinePaymentCheckoutCreate;
    Params: HouseholdOrderParams;
    Reply: OnlinePaymentCheckout | ProblemResponse;
  }>(
    '/v1/families/:familyId/orders/:orderId/online-payment',
    {
      schema: {
        body: OnlinePaymentCheckoutCreateSchema,
        description: 'Create one hosted checkout for the confirmed lines in a household order.',
        params: HouseholdOrderParamsSchema,
        response: { 201: OnlinePaymentCheckoutSchema, ...errorResponses },
        tags: ['orders', 'payments'],
      },
    },
    async (request, reply) => {
      const paymentService = resolvePaymentService(service, request);
      if (!paymentService) return unavailable(reply);
      try {
        const checkout = await paymentService.createOrderCheckout(
          request.params.familyId,
          request.params.orderId,
          request.body.idempotency_key,
          request.id,
        );
        return reply.code(201).send(checkout);
      } catch (error) {
        return sendProblem(reply, error);
      }
    },
  );

  app.post<{
    Body: OnlinePaymentCheckoutCreate;
    Params: InstallmentParams;
    Reply: OnlinePaymentCheckout | ProblemResponse;
  }>(
    '/v1/families/:familyId/installments/:installmentId/online-payment',
    {
      schema: {
        body: OnlinePaymentCheckoutCreateSchema,
        description: 'Create a hosted checkout for one scheduled household installment.',
        params: InstallmentParamsSchema,
        response: { 201: OnlinePaymentCheckoutSchema, ...errorResponses },
        tags: ['orders', 'payments'],
      },
    },
    async (request, reply) => {
      const paymentService = resolvePaymentService(service, request);
      if (!paymentService) return unavailable(reply);
      try {
        const checkout = await paymentService.createInstallmentCheckout(
          request.params.familyId,
          request.params.installmentId,
          request.body.idempotency_key,
          request.id,
        );
        return reply.code(201).send(checkout);
      } catch (error) {
        return sendProblem(reply, error);
      }
    },
  );

  app.get<{ Reply: PaymentAttemptListResponse | ProblemResponse }>(
    '/v1/payments',
    {
      schema: {
        description: 'List provider payment attempts for staff reconciliation.',
        response: { 200: PaymentAttemptListResponseSchema, ...errorResponses },
        tags: ['payments'],
      },
    },
    async (request, reply) => {
      const paymentService = resolvePaymentService(service, request);
      if (!paymentService) return unavailable(reply);
      try {
        return { attempts: await paymentService.listAttempts() };
      } catch (error) {
        return sendProblem(reply, error);
      }
    },
  );

  app.get<{ Reply: PaymentAdjustmentCenter | ProblemResponse }>(
    '/v1/payment-adjustments',
    {
      schema: {
        description: 'List finance accounts and their immutable adjustment history.',
        response: { 200: PaymentAdjustmentCenterSchema, ...errorResponses },
        tags: ['payments'],
      },
    },
    async (request, reply) => {
      const paymentService = resolvePaymentService(service, request);
      if (!paymentService) return unavailable(reply);
      try {
        return await paymentService.getAdjustmentCenter();
      } catch (error) {
        return sendProblem(reply, error);
      }
    },
  );

  app.post<{
    Body: PaymentAdjustmentCreate;
    Reply: PaymentAdjustment | ProblemResponse;
  }>(
    '/v1/payment-adjustments',
    {
      schema: {
        body: PaymentAdjustmentCreateSchema,
        description: 'Create an audited registration credit, charge, or provider-backed refund.',
        response: { 201: PaymentAdjustmentSchema, ...errorResponses },
        tags: ['payments'],
      },
    },
    async (request, reply) => {
      const paymentService = resolvePaymentService(service, request);
      if (!paymentService) return unavailable(reply);
      try {
        return reply
          .code(201)
          .send(await paymentService.createAdjustment(request.body, request.id));
      } catch (error) {
        return sendProblem(reply, error);
      }
    },
  );

  app.get<{
    Params: PaymentAttemptParams;
    Reply: PaymentAttempt | ProblemResponse;
  }>(
    '/v1/payments/:attemptId',
    {
      schema: {
        description: 'Get a payment attempt visible to the active identity.',
        params: PaymentAttemptParamsSchema,
        response: { 200: PaymentAttemptSchema, ...errorResponses },
        tags: ['payments'],
      },
    },
    async (request, reply) => {
      const paymentService = resolvePaymentService(service, request);
      if (!paymentService) return unavailable(reply);
      try {
        return await paymentService.getAttempt(request.params.attemptId);
      } catch (error) {
        return sendProblem(reply, error);
      }
    },
  );

  app.post<{
    Params: PaymentAttemptParams;
    Reply: PaymentCompletion | ProblemResponse;
  }>(
    '/v1/payments/local/:attemptId/complete',
    {
      schema: {
        description: 'Complete a local-development hosted checkout simulation.',
        params: PaymentAttemptParamsSchema,
        response: { 200: PaymentCompletionSchema, ...errorResponses },
        tags: ['payments'],
      },
    },
    async (request, reply) => {
      const paymentService = resolvePaymentService(service, request);
      if (!paymentService) return unavailable(reply);
      try {
        return await paymentService.completeLocalPayment(request.params.attemptId, request.id);
      } catch (error) {
        return sendProblem(reply, error);
      }
    },
  );

  app.register(async (webhookApp) => {
    webhookApp.removeContentTypeParser('application/json');
    webhookApp.addContentTypeParser(
      'application/json',
      { parseAs: 'buffer' },
      (_request, body, done) => done(null, body),
    );
    webhookApp.post('/v1/webhooks/stripe', async (request, reply) => {
      if (!webhookService) return unavailable(reply);
      const signatureValue = request.headers['stripe-signature'];
      const signature = Array.isArray(signatureValue) ? signatureValue[0] : signatureValue;
      if (!signature || !Buffer.isBuffer(request.body)) {
        return reply.code(400).send({
          code: 'invalid_webhook',
          message: 'A valid Stripe signature and raw request body are required.',
        });
      }
      try {
        await webhookService.handle(request.body, signature);
        return reply.code(200).send({ received: true });
      } catch (error) {
        if (error instanceof PaymentWebhookVerificationError) {
          return reply.code(400).send({
            code: 'invalid_webhook',
            message: 'The Stripe webhook could not be verified.',
          });
        }
        throw error;
      }
    });
  });
}
