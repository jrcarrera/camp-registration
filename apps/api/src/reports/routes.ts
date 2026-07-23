import {
  CsvReportSchema,
  OperationalReportCenterSchema,
  OperationalReportExportQuerySchema,
  OperationalReportPreviewSchema,
  OperationalReportRequestSchema,
  OperationalReportViewInputSchema,
  OperationalReportViewParamsSchema,
  OperationalReportViewSchema,
  OperationalReportViewUpdateSchema,
  ProblemResponseSchema,
  SessionReportParamsSchema,
  SessionReportQuerySchema,
  XlsxReportSchema,
  type OperationalReportExportQuery,
  type OperationalReportRequest,
  type OperationalReportViewInput,
  type OperationalReportViewParams,
  type OperationalReportViewUpdate,
  type ProblemResponse,
  type SessionReportParams,
  type SessionReportQuery,
} from '@camp-registration/contracts';
import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';

import {
  CatalogNotFoundError,
  OperationalReportConflictError,
  OperationalReportNotFoundError,
  ReportsAuthorizationError,
  ReportsUnavailableError,
  ReportsValidationError,
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

function problem(reply: FastifyReply, error: unknown) {
  if (error instanceof ReportsAuthorizationError) {
    return reply.code(403).send({ code: 'forbidden', message: error.message });
  }
  if (error instanceof CatalogNotFoundError || error instanceof OperationalReportNotFoundError) {
    return reply.code(404).send({ code: 'not_found', message: error.message });
  }
  if (error instanceof OperationalReportConflictError) {
    return reply.code(409).send({ code: 'report_conflict', message: error.message });
  }
  if (error instanceof ReportsValidationError) {
    return reply.code(400).send({ code: 'invalid_report', message: error.message });
  }
  if (error instanceof ReportsUnavailableError) {
    return reply.code(503).send({ code: 'reports_unavailable', message: error.message });
  }
  throw error;
}

function unavailable(reply: FastifyReply) {
  return reply.code(503).send({
    code: 'reports_unavailable',
    message: 'Reporting dependencies are not configured.',
  });
}

function filters(query: OperationalReportExportQuery) {
  const sessionIds = query.session_ids ? query.session_ids.split(',').filter(Boolean) : [];
  if (
    sessionIds.some(
      (id) =>
        !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(id),
    )
  ) {
    throw new ReportsValidationError('Session filters must contain valid identifiers');
  }
  return {
    end_date: query.end_date ?? null,
    registration_status: query.registration_status ?? ('ALL' as const),
    session_ids: sessionIds,
    start_date: query.start_date ?? null,
  };
}

export function registerReportsRoutes(app: FastifyInstance, service: ReportsServiceSource): void {
  app.get(
    '/v1/reports',
    {
      schema: {
        description: 'Load tenant-scoped saved operational report views.',
        response: {
          200: OperationalReportCenterSchema,
          403: ProblemResponseSchema,
          503: ProblemResponseSchema,
        },
        tags: ['reports'],
      },
    },
    async (request, reply) => {
      const reports = resolveReportsService(service, request);
      if (!reports) return unavailable(reply);
      try {
        return await reports.getCenter();
      } catch (error) {
        return problem(reply, error);
      }
    },
  );

  app.post<{ Body: OperationalReportRequest }>(
    '/v1/reports/preview',
    {
      schema: {
        body: OperationalReportRequestSchema,
        description: 'Preview a cross-session operational report without exporting it.',
        response: {
          200: OperationalReportPreviewSchema,
          400: ProblemResponseSchema,
          403: ProblemResponseSchema,
          503: ProblemResponseSchema,
        },
        tags: ['reports'],
      },
    },
    async (request, reply) => {
      const reports = resolveReportsService(service, request);
      if (!reports) return unavailable(reply);
      try {
        return await reports.previewReport(
          request.body.preset,
          request.body.filters,
          request.body.full,
        );
      } catch (error) {
        return problem(reply, error);
      }
    },
  );

  app.get<{ Querystring: OperationalReportExportQuery; Reply: Buffer | string | ProblemResponse }>(
    '/v1/reports/export',
    {
      schema: {
        description: 'Download an audited cross-session operational report as CSV or native XLSX.',
        querystring: OperationalReportExportQuerySchema,
        response: {
          200: {
            content: {
              'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': {
                schema: XlsxReportSchema,
              },
              'text/csv': { schema: CsvReportSchema },
            },
            description: 'A private operational report file.',
          },
          400: ProblemResponseSchema,
          403: ProblemResponseSchema,
          503: ProblemResponseSchema,
        },
        tags: ['reports'],
      },
    },
    async (request, reply) => {
      const reports = resolveReportsService(service, request);
      if (!reports) return unavailable(reply);
      try {
        const report = await reports.exportOperationalReport(
          request.query.preset,
          request.query.format,
          filters(request.query),
          request.id,
        );
        return reply
          .header('cache-control', 'private, no-store')
          .header('content-disposition', `attachment; filename="${report.filename}"`)
          .header('x-report-row-count', String(report.rowCount))
          .type(report.contentType)
          .send(report.content);
      } catch (error) {
        return problem(reply, error);
      }
    },
  );

  app.post<{ Body: OperationalReportViewInput }>(
    '/v1/reports/views',
    {
      schema: {
        body: OperationalReportViewInputSchema,
        description: 'Save a reusable operational report view.',
        response: {
          201: OperationalReportViewSchema,
          400: ProblemResponseSchema,
          403: ProblemResponseSchema,
          409: ProblemResponseSchema,
          503: ProblemResponseSchema,
        },
        tags: ['reports'],
      },
    },
    async (request, reply) => {
      const reports = resolveReportsService(service, request);
      if (!reports) return unavailable(reply);
      try {
        return reply.code(201).send(await reports.createView(request.body, request.id));
      } catch (error) {
        return problem(reply, error);
      }
    },
  );

  app.patch<{ Body: OperationalReportViewUpdate; Params: OperationalReportViewParams }>(
    '/v1/reports/views/:viewId',
    {
      schema: {
        body: OperationalReportViewUpdateSchema,
        description: 'Update an owned or administratively managed saved report view.',
        params: OperationalReportViewParamsSchema,
        response: {
          200: OperationalReportViewSchema,
          400: ProblemResponseSchema,
          403: ProblemResponseSchema,
          404: ProblemResponseSchema,
          409: ProblemResponseSchema,
          503: ProblemResponseSchema,
        },
        tags: ['reports'],
      },
    },
    async (request, reply) => {
      const reports = resolveReportsService(service, request);
      if (!reports) return unavailable(reply);
      try {
        return await reports.updateView(request.params.viewId, request.body, request.id);
      } catch (error) {
        return problem(reply, error);
      }
    },
  );

  app.delete<{ Params: OperationalReportViewParams }>(
    '/v1/reports/views/:viewId',
    {
      schema: {
        description: 'Delete an owned or administratively managed saved report view.',
        params: OperationalReportViewParamsSchema,
        response: {
          403: ProblemResponseSchema,
          404: ProblemResponseSchema,
          503: ProblemResponseSchema,
        },
        tags: ['reports'],
      },
    },
    async (request, reply) => {
      const reports = resolveReportsService(service, request);
      if (!reports) return unavailable(reply);
      try {
        await reports.deleteView(request.params.viewId, request.id);
        return reply.code(204).send();
      } catch (error) {
        return problem(reply, error);
      }
    },
  );

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
      const reports = resolveReportsService(service, request);
      if (!reports) return unavailable(reply);
      try {
        const report = await reports.exportSessionReport(
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
        return problem(reply, error);
      }
    },
  );
}
