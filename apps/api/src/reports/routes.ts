import {
  CsvReportSchema,
  ProblemResponseSchema,
  SessionReportParamsSchema,
  SessionReportQuerySchema,
  type ProblemResponse,
  type SessionReportParams,
  type SessionReportQuery,
} from '@camp-registration/contracts';
import type { FastifyInstance, FastifyRequest } from 'fastify';

import {
  CatalogNotFoundError,
  ReportsAuthorizationError,
  type ReportsServiceApi,
} from './service.js';

type ReportsServiceSource =
  | ReportsServiceApi
  | ((request: FastifyRequest) => ReportsServiceApi | undefined)
  | undefined;

function resolveReportsService(
  source: ReportsServiceSource,
  request: FastifyRequest,
): ReportsServiceApi | undefined {
  return typeof source === 'function' ? source(request) : source;
}

export function registerReportsRoutes(app: FastifyInstance, service: ReportsServiceSource): void {
  app.get<{
    Params: SessionReportParams;
    Querystring: SessionReportQuery;
    Reply: string | ProblemResponse;
  }>(
    '/v1/reports/sessions/:sessionId/export',
    {
      schema: {
        description: 'Download an audited, tenant-scoped operational session report as CSV.',
        params: SessionReportParamsSchema,
        querystring: SessionReportQuerySchema,
        response: {
          200: {
            content: { 'text/csv': { schema: CsvReportSchema } },
            description: 'A UTF-8 CSV file using the selected operational report preset.',
          },
          403: ProblemResponseSchema,
          404: ProblemResponseSchema,
          503: ProblemResponseSchema,
        },
        tags: ['reports', 'sessions'],
      },
    },
    async (request, reply) => {
      const reportsService = resolveReportsService(service, request);
      if (!reportsService) {
        return reply.code(503).send({
          code: 'reports_unavailable',
          message: 'Reporting dependencies are not configured.',
        });
      }
      try {
        const report = await reportsService.exportSessionReport(
          request.params.sessionId,
          request.query.preset,
          request.id,
        );
        return reply
          .header('cache-control', 'private, no-store')
          .header('content-disposition', `attachment; filename="${report.filename}"`)
          .header('x-report-row-count', String(report.rowCount))
          .type('text/csv; charset=utf-8')
          .serializer((payload) => String(payload))
          .send(report.content);
      } catch (error) {
        if (error instanceof ReportsAuthorizationError) {
          return reply.code(403).send({ code: 'forbidden', message: error.message });
        }
        if (error instanceof CatalogNotFoundError) {
          return reply.code(404).send({ code: 'not_found', message: error.message });
        }
        throw error;
      }
    },
  );
}
