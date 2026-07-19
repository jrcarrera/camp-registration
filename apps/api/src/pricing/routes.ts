import {
  CouponSchema,
  CouponWriteSchema,
  DiscountRuleSchema,
  DiscountRuleWriteSchema,
  FinancialAssistanceApplicationSchema,
  FinancialAssistanceCreateSchema,
  FinancialAssistanceFamilyParamsSchema,
  FinancialAssistanceFamilyApplicationParamsSchema,
  FinancialAssistanceListResponseSchema,
  FinancialAssistanceParamsSchema,
  FinancialAssistanceReviewSchema,
  FinancialAssistanceUpdateSchema,
  FinancialAssistanceWithdrawSchema,
  PaymentPlanTemplateSchema,
  PaymentPlanTemplateWriteSchema,
  PricingConfigurationSchema,
  PricingResourceParamsSchema,
  ProblemResponseSchema,
  SessionAddOnParamsSchema,
  SessionAddOnSchema,
  SessionAddOnWriteSchema,
  SessionParamsSchema,
  type Coupon,
  type CouponWrite,
  type DiscountRule,
  type DiscountRuleWrite,
  type FinancialAssistanceApplication,
  type FinancialAssistanceCreate,
  type FinancialAssistanceReview,
  type FinancialAssistanceUpdate,
  type FinancialAssistanceWithdraw,
  type PaymentPlanTemplate,
  type PaymentPlanTemplateWrite,
  type PricingConfiguration,
  type ProblemResponse,
  type SessionAddOn,
  type SessionAddOnWrite,
} from '@camp-registration/contracts';
import {
  PricingConflictError,
  PricingNotFoundError,
  PricingValidationError,
} from '@camp-registration/database';
import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';

import { PricingAuthorizationError, type PricingServiceApi } from './service.js';

type Source =
  | PricingServiceApi
  | ((request: FastifyRequest) => PricingServiceApi | undefined)
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
    .send({ code: 'pricing_unavailable', message: 'Pricing dependencies are not configured.' });
}
function problem(reply: FastifyReply, error: unknown) {
  if (error instanceof PricingAuthorizationError)
    return reply.code(403).send({ code: 'forbidden', message: error.message });
  if (error instanceof PricingNotFoundError)
    return reply.code(404).send({ code: 'not_found', message: error.message });
  if (error instanceof PricingConflictError)
    return reply.code(409).send({ code: 'pricing_conflict', message: error.message });
  if (error instanceof PricingValidationError)
    return reply.code(400).send({ code: 'invalid_pricing', message: error.message });
  throw error;
}

export function registerPricingRoutes(app: FastifyInstance, source: Source): void {
  app.get<{ Reply: PricingConfiguration | ProblemResponse }>(
    '/v1/pricing',
    { schema: { response: { 200: PricingConfigurationSchema, ...errors }, tags: ['pricing'] } },
    async (request, reply) => {
      const service = resolve(source, request);
      if (!service) return unavailable(reply);
      try {
        return await service.listConfiguration();
      } catch (error) {
        return problem(reply, error);
      }
    },
  );
  app.post<{
    Body: SessionAddOnWrite;
    Params: { sessionId: string };
    Reply: SessionAddOn | ProblemResponse;
  }>(
    '/v1/sessions/:sessionId/add-ons',
    {
      schema: {
        body: SessionAddOnWriteSchema,
        params: SessionParamsSchema,
        response: { 201: SessionAddOnSchema, ...errors },
        tags: ['pricing'],
      },
    },
    async (request, reply) => {
      const service = resolve(source, request);
      if (!service) return unavailable(reply);
      try {
        return reply
          .code(201)
          .send(await service.createAddOn(request.params.sessionId, request.body, request.id));
      } catch (error) {
        return problem(reply, error);
      }
    },
  );
  app.put<{
    Body: SessionAddOnWrite;
    Params: { sessionId: string; addOnId: string };
    Reply: SessionAddOn | ProblemResponse;
  }>(
    '/v1/sessions/:sessionId/add-ons/:addOnId',
    {
      schema: {
        body: SessionAddOnWriteSchema,
        params: SessionAddOnParamsSchema,
        response: { 200: SessionAddOnSchema, ...errors },
        tags: ['pricing'],
      },
    },
    async (request, reply) => {
      const service = resolve(source, request);
      if (!service) return unavailable(reply);
      try {
        return await service.updateAddOn(
          request.params.sessionId,
          request.params.addOnId,
          request.body,
          request.id,
        );
      } catch (error) {
        return problem(reply, error);
      }
    },
  );
  app.post<{ Body: DiscountRuleWrite; Reply: DiscountRule | ProblemResponse }>(
    '/v1/pricing/discount-rules',
    {
      schema: {
        body: DiscountRuleWriteSchema,
        response: { 201: DiscountRuleSchema, ...errors },
        tags: ['pricing'],
      },
    },
    async (request, reply) => {
      const service = resolve(source, request);
      if (!service) return unavailable(reply);
      try {
        return reply.code(201).send(await service.createDiscount(request.body, request.id));
      } catch (error) {
        return problem(reply, error);
      }
    },
  );
  app.put<{
    Body: DiscountRuleWrite;
    Params: { resourceId: string };
    Reply: DiscountRule | ProblemResponse;
  }>(
    '/v1/pricing/discount-rules/:resourceId',
    {
      schema: {
        body: DiscountRuleWriteSchema,
        params: PricingResourceParamsSchema,
        response: { 200: DiscountRuleSchema, ...errors },
        tags: ['pricing'],
      },
    },
    async (request, reply) => {
      const service = resolve(source, request);
      if (!service) return unavailable(reply);
      try {
        return await service.updateDiscount(request.params.resourceId, request.body, request.id);
      } catch (error) {
        return problem(reply, error);
      }
    },
  );
  app.delete<{ Params: { resourceId: string }; Reply: ProblemResponse | undefined }>(
    '/v1/pricing/discount-rules/:resourceId',
    { schema: { params: PricingResourceParamsSchema, response: { ...errors }, tags: ['pricing'] } },
    async (request, reply) => {
      const service = resolve(source, request);
      if (!service) return unavailable(reply);
      try {
        await service.deactivatePricingResource(
          'discount_rule',
          request.params.resourceId,
          request.id,
        );
        return reply.code(204).send(undefined);
      } catch (error) {
        return problem(reply, error);
      }
    },
  );
  app.post<{ Body: CouponWrite; Reply: Coupon | ProblemResponse }>(
    '/v1/pricing/coupons',
    {
      schema: {
        body: CouponWriteSchema,
        response: { 201: CouponSchema, ...errors },
        tags: ['pricing'],
      },
    },
    async (request, reply) => {
      const service = resolve(source, request);
      if (!service) return unavailable(reply);
      try {
        return reply.code(201).send(await service.createCoupon(request.body, request.id));
      } catch (error) {
        return problem(reply, error);
      }
    },
  );
  app.put<{ Body: CouponWrite; Params: { resourceId: string }; Reply: Coupon | ProblemResponse }>(
    '/v1/pricing/coupons/:resourceId',
    {
      schema: {
        body: CouponWriteSchema,
        params: PricingResourceParamsSchema,
        response: { 200: CouponSchema, ...errors },
        tags: ['pricing'],
      },
    },
    async (request, reply) => {
      const service = resolve(source, request);
      if (!service) return unavailable(reply);
      try {
        return await service.updateCoupon(request.params.resourceId, request.body, request.id);
      } catch (error) {
        return problem(reply, error);
      }
    },
  );
  app.delete<{ Params: { resourceId: string }; Reply: ProblemResponse | undefined }>(
    '/v1/pricing/coupons/:resourceId',
    { schema: { params: PricingResourceParamsSchema, response: { ...errors }, tags: ['pricing'] } },
    async (request, reply) => {
      const service = resolve(source, request);
      if (!service) return unavailable(reply);
      try {
        await service.deactivatePricingResource('coupon', request.params.resourceId, request.id);
        return reply.code(204).send(undefined);
      } catch (error) {
        return problem(reply, error);
      }
    },
  );
  app.post<{ Body: PaymentPlanTemplateWrite; Reply: PaymentPlanTemplate | ProblemResponse }>(
    '/v1/pricing/payment-plans',
    {
      schema: {
        body: PaymentPlanTemplateWriteSchema,
        response: { 201: PaymentPlanTemplateSchema, ...errors },
        tags: ['pricing'],
      },
    },
    async (request, reply) => {
      const service = resolve(source, request);
      if (!service) return unavailable(reply);
      try {
        return reply.code(201).send(await service.createPaymentPlan(request.body, request.id));
      } catch (error) {
        return problem(reply, error);
      }
    },
  );
  app.put<{
    Body: PaymentPlanTemplateWrite;
    Params: { resourceId: string };
    Reply: PaymentPlanTemplate | ProblemResponse;
  }>(
    '/v1/pricing/payment-plans/:resourceId',
    {
      schema: {
        body: PaymentPlanTemplateWriteSchema,
        params: PricingResourceParamsSchema,
        response: { 200: PaymentPlanTemplateSchema, ...errors },
        tags: ['pricing'],
      },
    },
    async (request, reply) => {
      const service = resolve(source, request);
      if (!service) return unavailable(reply);
      try {
        return await service.updatePaymentPlan(request.params.resourceId, request.body, request.id);
      } catch (error) {
        return problem(reply, error);
      }
    },
  );
  app.delete<{ Params: { resourceId: string }; Reply: ProblemResponse | undefined }>(
    '/v1/pricing/payment-plans/:resourceId',
    { schema: { params: PricingResourceParamsSchema, response: { ...errors }, tags: ['pricing'] } },
    async (request, reply) => {
      const service = resolve(source, request);
      if (!service) return unavailable(reply);
      try {
        await service.deactivatePricingResource(
          'payment_plan_template',
          request.params.resourceId,
          request.id,
        );
        return reply.code(204).send(undefined);
      } catch (error) {
        return problem(reply, error);
      }
    },
  );
  app.post<{
    Body: FinancialAssistanceCreate;
    Params: { familyId: string };
    Reply: FinancialAssistanceApplication | ProblemResponse;
  }>(
    '/v1/families/:familyId/financial-assistance',
    {
      schema: {
        body: FinancialAssistanceCreateSchema,
        params: FinancialAssistanceFamilyParamsSchema,
        response: { 201: FinancialAssistanceApplicationSchema, ...errors },
        tags: ['financial-assistance'],
      },
    },
    async (request, reply) => {
      const service = resolve(source, request);
      if (!service) return unavailable(reply);
      try {
        return reply
          .code(201)
          .send(await service.createAssistance(request.params.familyId, request.body, request.id));
      } catch (error) {
        return problem(reply, error);
      }
    },
  );
  app.get<{
    Params: { familyId: string };
    Reply: { applications: FinancialAssistanceApplication[] } | ProblemResponse;
  }>(
    '/v1/families/:familyId/financial-assistance',
    {
      schema: {
        params: FinancialAssistanceFamilyParamsSchema,
        response: { 200: FinancialAssistanceListResponseSchema, ...errors },
        tags: ['financial-assistance'],
      },
    },
    async (request, reply) => {
      const service = resolve(source, request);
      if (!service) return unavailable(reply);
      try {
        return { applications: await service.listFamilyAssistance(request.params.familyId) };
      } catch (error) {
        return problem(reply, error);
      }
    },
  );
  app.put<{
    Body: FinancialAssistanceUpdate;
    Params: { applicationId: string; familyId: string };
    Reply: FinancialAssistanceApplication | ProblemResponse;
  }>(
    '/v1/families/:familyId/financial-assistance/:applicationId',
    {
      schema: {
        body: FinancialAssistanceUpdateSchema,
        params: FinancialAssistanceFamilyApplicationParamsSchema,
        response: { 200: FinancialAssistanceApplicationSchema, ...errors },
        tags: ['financial-assistance'],
      },
    },
    async (request, reply) => {
      const service = resolve(source, request);
      if (!service) return unavailable(reply);
      try {
        return await service.updateAssistance(
          request.params.familyId,
          request.params.applicationId,
          request.body,
          request.id,
        );
      } catch (error) {
        return problem(reply, error);
      }
    },
  );
  app.post<{
    Body: FinancialAssistanceWithdraw;
    Params: { applicationId: string; familyId: string };
    Reply: FinancialAssistanceApplication | ProblemResponse;
  }>(
    '/v1/families/:familyId/financial-assistance/:applicationId/withdraw',
    {
      schema: {
        body: FinancialAssistanceWithdrawSchema,
        params: FinancialAssistanceFamilyApplicationParamsSchema,
        response: { 200: FinancialAssistanceApplicationSchema, ...errors },
        tags: ['financial-assistance'],
      },
    },
    async (request, reply) => {
      const service = resolve(source, request);
      if (!service) return unavailable(reply);
      try {
        return await service.withdrawAssistance(
          request.params.familyId,
          request.params.applicationId,
          request.body.version,
          request.id,
        );
      } catch (error) {
        return problem(reply, error);
      }
    },
  );
  app.get<{ Reply: { applications: FinancialAssistanceApplication[] } | ProblemResponse }>(
    '/v1/financial-assistance',
    {
      schema: {
        response: { 200: FinancialAssistanceListResponseSchema, ...errors },
        tags: ['financial-assistance'],
      },
    },
    async (request, reply) => {
      const service = resolve(source, request);
      if (!service) return unavailable(reply);
      try {
        return { applications: await service.listAssistance() };
      } catch (error) {
        return problem(reply, error);
      }
    },
  );
  app.post<{
    Body: FinancialAssistanceReview;
    Params: { applicationId: string };
    Reply: FinancialAssistanceApplication | ProblemResponse;
  }>(
    '/v1/financial-assistance/:applicationId/review',
    {
      schema: {
        body: FinancialAssistanceReviewSchema,
        params: FinancialAssistanceParamsSchema,
        response: { 200: FinancialAssistanceApplicationSchema, ...errors },
        tags: ['financial-assistance'],
      },
    },
    async (request, reply) => {
      const service = resolve(source, request);
      if (!service) return unavailable(reply);
      try {
        return await service.reviewAssistance(
          request.params.applicationId,
          request.body,
          request.id,
        );
      } catch (error) {
        return problem(reply, error);
      }
    },
  );
}
