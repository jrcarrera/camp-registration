import {
  FamilyParamsSchema,
  HouseholdOrderCreateSchema,
  HouseholdOrderListResponseSchema,
  HouseholdOrderParamsSchema,
  HouseholdOrderSchema,
  OrderParamsSchema,
  OrderQuoteCreateSchema,
  OrderQuoteSchema,
  ProblemResponseSchema,
  type HouseholdOrder,
  type HouseholdOrderCreate,
  type HouseholdOrderParams,
  type OrderParams,
  type OrderQuote,
  type OrderQuoteCreate,
  type ProblemResponse,
} from '@camp-registration/contracts';
import {
  OrderConflictError,
  OrderNotFoundError,
  OrderValidationError,
} from '@camp-registration/database';
import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';

import { OrderAuthorizationError, type OrderServiceApi } from './service.js';

type Source =
  | OrderServiceApi
  | ((request: FastifyRequest) => OrderServiceApi | undefined)
  | undefined;
const resolve = (source: Source, request: FastifyRequest) =>
  typeof source === 'function' ? source(request) : source;

function unavailable(reply: FastifyReply) {
  return reply
    .code(503)
    .send({ code: 'orders_unavailable', message: 'Order dependencies are not configured.' });
}

function problem(reply: FastifyReply, error: unknown) {
  if (error instanceof OrderAuthorizationError)
    return reply.code(403).send({ code: 'forbidden', message: error.message });
  if (error instanceof OrderNotFoundError)
    return reply.code(404).send({ code: 'not_found', message: error.message });
  if (error instanceof OrderConflictError)
    return reply.code(409).send({ code: 'order_conflict', message: error.message });
  if (error instanceof OrderValidationError)
    return reply
      .code(400)
      .send({ code: 'invalid_order', message: error.message, field_errors: error.fieldErrors });
  throw error;
}

const errors = {
  400: ProblemResponseSchema,
  403: ProblemResponseSchema,
  404: ProblemResponseSchema,
  409: ProblemResponseSchema,
  503: ProblemResponseSchema,
};

export function registerOrderRoutes(app: FastifyInstance, source: Source): void {
  app.post<{
    Body: OrderQuoteCreate;
    Params: { familyId: string };
    Reply: OrderQuote | ProblemResponse;
  }>(
    '/v1/families/:familyId/order-quotes',
    {
      schema: {
        body: OrderQuoteCreateSchema,
        params: FamilyParamsSchema,
        response: { 200: OrderQuoteSchema, ...errors },
        tags: ['orders'],
      },
    },
    async (request, reply) => {
      const service = resolve(source, request);
      if (!service) return unavailable(reply);
      try {
        return await service.quote(request.params.familyId, request.body);
      } catch (error) {
        return problem(reply, error);
      }
    },
  );
  app.post<{
    Body: HouseholdOrderCreate;
    Params: { familyId: string };
    Reply: HouseholdOrder | ProblemResponse;
  }>(
    '/v1/families/:familyId/orders',
    {
      schema: {
        body: HouseholdOrderCreateSchema,
        params: FamilyParamsSchema,
        response: { 201: HouseholdOrderSchema, ...errors },
        tags: ['orders'],
      },
    },
    async (request, reply) => {
      const service = resolve(source, request);
      if (!service) return unavailable(reply);
      try {
        return reply
          .code(201)
          .send(await service.createOrder(request.params.familyId, request.body, request.id));
      } catch (error) {
        return problem(reply, error);
      }
    },
  );
  app.get<{ Params: { familyId: string }; Reply: { orders: HouseholdOrder[] } | ProblemResponse }>(
    '/v1/families/:familyId/orders',
    {
      schema: {
        params: FamilyParamsSchema,
        response: { 200: HouseholdOrderListResponseSchema, ...errors },
        tags: ['orders'],
      },
    },
    async (request, reply) => {
      const service = resolve(source, request);
      if (!service) return unavailable(reply);
      try {
        return { orders: await service.listFamilyOrders(request.params.familyId) };
      } catch (error) {
        return problem(reply, error);
      }
    },
  );
  app.get<{ Params: HouseholdOrderParams; Reply: HouseholdOrder | ProblemResponse }>(
    '/v1/families/:familyId/orders/:orderId',
    {
      schema: {
        params: HouseholdOrderParamsSchema,
        response: { 200: HouseholdOrderSchema, ...errors },
        tags: ['orders'],
      },
    },
    async (request, reply) => {
      const service = resolve(source, request);
      if (!service) return unavailable(reply);
      try {
        return await service.getOrder(request.params.orderId);
      } catch (error) {
        return problem(reply, error);
      }
    },
  );
  app.get<{ Reply: { orders: HouseholdOrder[] } | ProblemResponse }>(
    '/v1/orders',
    {
      schema: { response: { 200: HouseholdOrderListResponseSchema, ...errors }, tags: ['orders'] },
    },
    async (request, reply) => {
      const service = resolve(source, request);
      if (!service) return unavailable(reply);
      try {
        return { orders: await service.listOrders() };
      } catch (error) {
        return problem(reply, error);
      }
    },
  );
  app.get<{ Params: OrderParams; Reply: HouseholdOrder | ProblemResponse }>(
    '/v1/orders/:orderId',
    {
      schema: {
        params: OrderParamsSchema,
        response: { 200: HouseholdOrderSchema, ...errors },
        tags: ['orders'],
      },
    },
    async (request, reply) => {
      const service = resolve(source, request);
      if (!service) return unavailable(reply);
      try {
        return await service.getOrder(request.params.orderId);
      } catch (error) {
        return problem(reply, error);
      }
    },
  );
}
