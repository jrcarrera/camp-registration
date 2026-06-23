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
import { CatalogStore, type DatabaseClient } from '@camp-registration/database';
import Fastify, { type FastifyBaseLogger, type FastifyInstance } from 'fastify';

import { registerCatalogRoutes } from './catalog/routes.js';
import { CatalogService, type CatalogServiceApi } from './catalog/service.js';

export interface BuildAppOptions {
  catalogService?: CatalogServiceApi;
  database?: DatabaseClient;
  identity?: RequestIdentity;
  logger?: boolean | FastifyBaseLogger;
  organizationId?: string;
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

  const catalogService =
    options.catalogService ??
    (options.database && options.identity && options.organizationId
      ? new CatalogService(
          new CatalogStore(options.database),
          options.identity,
          options.organizationId,
        )
      : undefined);
  registerCatalogRoutes(app, catalogService);

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
