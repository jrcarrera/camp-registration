import swagger from '@fastify/swagger';
import swaggerUi from '@fastify/swagger-ui';
import type { TypeBoxTypeProvider } from '@fastify/type-provider-typebox';
import type { RequestIdentity } from '@camp-registration/auth';
import {
  HealthResponseSchema,
  ReadinessResponseSchema,
  UnavailableResponseSchema,
  type HealthResponse,
  type ReadinessResponse,
  type UnavailableResponse,
} from '@camp-registration/contracts';
import {
  CatalogStore,
  CommunicationsStore,
  FamilyStore,
  FormsStore,
  HousingStore,
  OrderStore,
  PaymentStore,
  PricingStore,
  WaitlistOperationsStore,
  type DatabaseClient,
} from '@camp-registration/database';
import Fastify, {
  type FastifyBaseLogger,
  type FastifyInstance,
  type FastifyRequest,
} from 'fastify';

import { registerCatalogRoutes } from './catalog/routes.js';
import { CatalogService, type CatalogServiceApi } from './catalog/service.js';
import { registerCommunicationsRoutes } from './communications/routes.js';
import { CommunicationsService, type CommunicationsServiceApi } from './communications/service.js';
import { registerFamilyRoutes } from './families/routes.js';
import { FamilyService, type FamilyServiceApi } from './families/service.js';
import { registerFormsRoutes } from './forms/routes.js';
import { FormsService, type FormsServiceApi } from './forms/service.js';
import { registerOperationsRoutes } from './operations/routes.js';
import { registerHousingRoutes } from './housing/routes.js';
import { HousingService, type HousingServiceApi } from './housing/service.js';
import { OperationsService, type OperationsServiceApi } from './operations/service.js';
import { registerOrderRoutes } from './orders/routes.js';
import { OrderService, type OrderServiceApi } from './orders/service.js';
import { registerPaymentRoutes } from './payments/routes.js';
import { type PaymentProvider } from './payments/provider.js';
import {
  PaymentService,
  PaymentWebhookService,
  type PaymentServiceApi,
} from './payments/service.js';
import { registerPricingRoutes } from './pricing/routes.js';
import { PricingService, type PricingServiceApi } from './pricing/service.js';
import { registerReportsRoutes } from './reports/routes.js';
import { ReportsService, type ReportsServiceApi } from './reports/service.js';

export interface BuildAppOptions {
  catalogService?: CatalogServiceApi;
  communicationsService?: CommunicationsServiceApi;
  database?: DatabaseClient;
  familyService?: FamilyServiceApi;
  formsService?: FormsServiceApi;
  housingService?: HousingServiceApi;
  identity?: RequestIdentity;
  logger?: boolean | FastifyBaseLogger;
  operationsService?: OperationsServiceApi;
  orderService?: OrderServiceApi;
  organizationId?: string;
  paymentProvider?: PaymentProvider;
  paymentService?: PaymentServiceApi;
  pricingService?: PricingServiceApi;
  reportsService?: ReportsServiceApi;
  requestContext?: (request: FastifyRequest) => RequestServiceContext | undefined;
}

export interface RequestServiceContext {
  identity: RequestIdentity;
  organizationId: string;
}

export async function buildApp(options: BuildAppOptions = {}): Promise<FastifyInstance> {
  const app = Fastify({
    logger: options.logger ?? false,
    requestIdHeader: 'x-request-id',
  }).withTypeProvider<TypeBoxTypeProvider>();

  await app.register(swagger, {
    openapi: {
      info: {
        description: 'API for camp registration and camp operations.',
        title: 'Camp Registration API',
        version: '0.0.0',
      },
      servers: [{ description: 'Local development', url: 'http://localhost:3001' }],
    },
  });
  await app.register(swaggerUi, {
    routePrefix: '/docs',
  });

  const resolveRequestContext = (request: FastifyRequest): RequestServiceContext | undefined =>
    options.requestContext?.(request) ??
    (options.identity && options.organizationId
      ? { identity: options.identity, organizationId: options.organizationId }
      : undefined);

  const catalogStore = options.database ? new CatalogStore(options.database) : undefined;
  const catalogService =
    options.catalogService ??
    (catalogStore
      ? (request: FastifyRequest) => {
          const context = resolveRequestContext(request);
          return context
            ? new CatalogService(catalogStore, context.identity, context.organizationId)
            : undefined;
        }
      : undefined);
  registerCatalogRoutes(app, catalogService);

  const communicationsStore = options.database
    ? new CommunicationsStore(options.database)
    : undefined;
  const communicationsService =
    options.communicationsService ??
    (communicationsStore
      ? (request: FastifyRequest) => {
          const context = resolveRequestContext(request);
          return context
            ? new CommunicationsService(
                communicationsStore,
                context.identity,
                context.organizationId,
              )
            : undefined;
        }
      : undefined);
  registerCommunicationsRoutes(app, communicationsService);

  const familyStore = options.database ? new FamilyStore(options.database) : undefined;
  const familyService =
    options.familyService ??
    (familyStore
      ? (request: FastifyRequest) => {
          const context = resolveRequestContext(request);
          return context
            ? new FamilyService(familyStore, context.identity, context.organizationId)
            : undefined;
        }
      : undefined);
  registerFamilyRoutes(app, familyService);

  const formsStore = options.database ? new FormsStore(options.database) : undefined;
  const formsService =
    options.formsService ??
    (formsStore
      ? (request: FastifyRequest) => {
          const context = resolveRequestContext(request);
          return context
            ? new FormsService(formsStore, context.identity, context.organizationId)
            : undefined;
        }
      : undefined);
  registerFormsRoutes(app, formsService);

  const housingStore = options.database ? new HousingStore(options.database) : undefined;
  const housingService =
    options.housingService ??
    (housingStore
      ? (request: FastifyRequest) => {
          const context = resolveRequestContext(request);
          return context
            ? new HousingService(housingStore, context.identity, context.organizationId)
            : undefined;
        }
      : undefined);
  registerHousingRoutes(app, housingService);

  const operationsStore = options.database
    ? new WaitlistOperationsStore(options.database)
    : undefined;
  const operationsService =
    options.operationsService ??
    (operationsStore
      ? (request: FastifyRequest) => {
          const context = resolveRequestContext(request);
          return context
            ? new OperationsService(operationsStore, context.identity, context.organizationId)
            : undefined;
        }
      : undefined);
  registerOperationsRoutes(app, operationsService);

  const orderStore = options.database ? new OrderStore(options.database) : undefined;
  const orderService =
    options.orderService ??
    (orderStore
      ? (request: FastifyRequest) => {
          const context = resolveRequestContext(request);
          return context
            ? new OrderService(orderStore, context.identity, context.organizationId)
            : undefined;
        }
      : undefined);
  registerOrderRoutes(app, orderService);

  const pricingStore = options.database ? new PricingStore(options.database) : undefined;
  const pricingService =
    options.pricingService ??
    (pricingStore && orderStore
      ? (request: FastifyRequest) => {
          const context = resolveRequestContext(request);
          return context
            ? new PricingService(pricingStore, orderStore, context.identity, context.organizationId)
            : undefined;
        }
      : undefined);
  registerPricingRoutes(app, pricingService);

  const reportsService =
    options.reportsService ??
    (catalogStore
      ? (request: FastifyRequest) => {
          const context = resolveRequestContext(request);
          return context
            ? new ReportsService(catalogStore, context.identity, context.organizationId)
            : undefined;
        }
      : undefined);
  registerReportsRoutes(app, reportsService);

  const paymentStore = options.database ? new PaymentStore(options.database) : undefined;
  const paymentService =
    options.paymentService ??
    (paymentStore && options.paymentProvider
      ? (request: FastifyRequest) => {
          const context = resolveRequestContext(request);
          return context
            ? new PaymentService(
                paymentStore,
                options.paymentProvider!,
                context.identity,
                context.organizationId,
              )
            : undefined;
        }
      : undefined);
  const paymentWebhookService =
    paymentStore && options.paymentProvider?.verifyWebhook
      ? new PaymentWebhookService(paymentStore, options.paymentProvider)
      : undefined;
  registerPaymentRoutes(app, paymentService, paymentWebhookService);

  app.get<{ Reply: HealthResponse }>(
    '/health',
    {
      schema: {
        description: 'Liveness check for the API process.',
        response: { 200: HealthResponseSchema },
        tags: ['system'],
      },
    },
    async () => ({
      service: 'camp-registration-api',
      status: 'ok',
      version: '0.0.0',
    }),
  );

  app.get<{ Reply: ReadinessResponse | UnavailableResponse }>(
    '/ready',
    {
      schema: {
        description: 'Readiness check for required API dependencies.',
        response: {
          200: ReadinessResponseSchema,
          503: UnavailableResponseSchema,
        },
        tags: ['system'],
      },
    },
    async (_request, reply) => {
      if (!options.database) {
        return {
          database: 'not_configured',
          service: 'camp-registration-api',
          status: 'ready',
        };
      }

      try {
        await options.database.check();
        return {
          database: 'connected',
          service: 'camp-registration-api',
          status: 'ready',
        };
      } catch {
        return reply.code(503).send({
          database: 'unavailable',
          service: 'camp-registration-api',
          status: 'not_ready',
        });
      }
    },
  );

  return app;
}
