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
  HealthRecordStore,
  OrderStore,
  PaymentStore,
  PricingStore,
  ReportingStore,
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
import { registerHealthRecordRoutes } from './health-records/routes.js';
import { HealthRecordService, type HealthRecordServiceApi } from './health-records/service.js';
import type { HealthEncryptionProvider } from './health-records/encryption.js';
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
import { registerIdentityRoutes } from './identity/routes.js';
import type { IdentityRequestContext, IdentityService } from './identity/service.js';

export interface BuildAppOptions {
  catalogService?: CatalogServiceApi;
  communicationsService?: CommunicationsServiceApi;
  database?: DatabaseClient;
  familyService?: FamilyServiceApi;
  formsService?: FormsServiceApi;
  housingService?: HousingServiceApi;
  healthEncryptionProvider?: HealthEncryptionProvider;
  healthRecordService?: HealthRecordServiceApi;
  identity?: RequestIdentity;
  identityService?: IdentityService;
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

  const identityContexts = new WeakMap<FastifyRequest, IdentityRequestContext>();
  if (options.identityService) {
    app.addHook('onRequest', async (request, reply) => {
      const origin = request.headers.origin;
      if (
        origin &&
        request.method !== 'GET' &&
        request.method !== 'HEAD' &&
        !request.url.startsWith('/v1/webhooks/')
      ) {
        const forwardedHost = request.headers['x-forwarded-host'];
        const requestHost =
          (Array.isArray(forwardedHost) ? forwardedHost[0] : forwardedHost) ?? request.headers.host;
        const forwardedProto = request.headers['x-forwarded-proto'];
        const protocol =
          (Array.isArray(forwardedProto) ? forwardedProto[0] : forwardedProto) ??
          (process.env.NODE_ENV === 'production' ? 'https' : 'http');
        if (!requestHost || new URL(origin).origin !== `${protocol}://${requestHost}`) {
          return reply.code(403).send({
            code: 'origin_not_allowed',
            message: 'The request origin is not allowed.',
          });
        }
      }
      const cookieHeader = request.headers.cookie;
      const sessionToken = cookieHeader
        ?.split(';')
        .map((part) => part.trim())
        .find((part) => part.startsWith('camp_session='))
        ?.slice('camp_session='.length);
      const context = await options.identityService!.resolveRequest(
        sessionToken ? decodeURIComponent(sessionToken) : undefined,
      );
      if (context) identityContexts.set(request, context);

      const path = request.url.split('?')[0] ?? request.url;
      const publicRequest =
        path === '/health' ||
        path === '/ready' ||
        path.startsWith('/docs') ||
        path.startsWith('/v1/webhooks/') ||
        (request.method === 'GET' && /^\/v1\/public\/organizations\/[^/]+$/.test(path)) ||
        (request.method === 'POST' &&
          (path === '/v1/auth/challenges' ||
            /^\/v1\/auth\/challenges\/[^/]+\/respond$/.test(path) ||
            path === '/v1/auth/logout'));
      if (publicRequest || (!context && options.requestContext?.(request))) return;
      if (context) {
        const accountLifecycleRequest =
          path.startsWith('/v1/auth/') ||
          path.startsWith('/v1/identity/') ||
          path.startsWith('/v1/system/') ||
          /^\/v1\/public\/organizations\/[^/]+\/onboarding$/.test(path);
        if (accountLifecycleRequest || context.requestIdentity) return;
        return reply.code(403).send({
          code: 'organization_access_required',
          message: 'Approved organization access is required.',
        });
      }
      return reply.code(401).send({
        code: 'authentication_required',
        message: 'Sign in to continue.',
      });
    });
  }

  const resolveRequestContext = (request: FastifyRequest): RequestServiceContext | undefined =>
    (() => {
      const identityContext = identityContexts.get(request);
      if (identityContext?.requestIdentity && identityContext.session.active_organization_id) {
        return {
          identity: identityContext.requestIdentity,
          organizationId: identityContext.session.active_organization_id,
        };
      }
      return undefined;
    })() ??
    options.requestContext?.(request) ??
    (options.identity && options.organizationId
      ? { identity: options.identity, organizationId: options.organizationId }
      : undefined);

  registerIdentityRoutes(app, options.identityService, (request) => {
    const sessionContext = identityContexts.get(request);
    if (sessionContext) return sessionContext;
    if (
      request.url.startsWith('/v1/auth/') ||
      request.url.startsWith('/v1/public/organizations/')
    ) {
      return undefined;
    }
    const local = options.requestContext?.(request);
    if (!local) return undefined;
    const membership = local.identity.memberships.find(
      (candidate) => candidate.organizationId === local.organizationId,
    );
    if (!membership) return undefined;
    const now = new Date().toISOString();
    return {
      requestIdentity: local.identity,
      session: {
        absolute_expires_at: new Date(Date.now() + 12 * 60 * 60 * 1000).toISOString(),
        account: {
          email_normalized: local.identity.email.toLowerCase(),
          email_verified: local.identity.emailVerified,
          id: local.identity.subject,
          platform_role: null,
          primary_email: local.identity.email,
          status: 'ACTIVE',
        },
        account_id: local.identity.subject,
        active_organization_id: local.organizationId,
        authentication_method: 'LOCAL',
        created_at: now,
        id: request.id,
        idle_expires_at: new Date(Date.now() + 30 * 60 * 1000).toISOString(),
        last_seen_at: now,
        mfa_verified: local.identity.mfaVerified,
        organizations: [
          {
            name: 'Local organization',
            organization_id: local.organizationId,
            roles: membership.roles.filter(
              (role): role is Exclude<(typeof membership.roles)[number], 'system_admin'> =>
                role !== 'system_admin',
            ),
            slug: 'local',
          },
        ],
        requires_mfa_setup: false,
        revoked_at: null,
      },
    };
  });

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

  const healthRecordStore = options.database ? new HealthRecordStore(options.database) : undefined;
  const healthRecordService =
    options.healthRecordService ??
    (healthRecordStore && options.healthEncryptionProvider
      ? (request: FastifyRequest) => {
          const context = resolveRequestContext(request);
          return context
            ? new HealthRecordService(
                healthRecordStore,
                options.healthEncryptionProvider!,
                context.identity,
                context.organizationId,
              )
            : undefined;
        }
      : undefined);
  registerHealthRecordRoutes(app, healthRecordService);

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
            ? new ReportsService(
                catalogStore,
                context.identity,
                context.organizationId,
                options.database ? new ReportingStore(options.database) : undefined,
              )
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
