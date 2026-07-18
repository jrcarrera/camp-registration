import { randomUUID } from 'node:crypto';

import type { PoolClient } from 'pg';

import type { DatabaseClient } from './client.js';

export interface FormFieldRecord {
  id: string;
  label: string;
  options: string[];
  required: boolean;
  type: 'TEXT' | 'SINGLE_CHOICE' | 'DATE' | 'ACKNOWLEDGEMENT' | 'SIGNATURE';
}

export interface FormAssignmentSummaryRecord {
  completed_count: number;
  due_at: string | null;
  id: string;
  session_id: string;
  session_name: string;
  total_count: number;
}

export interface FormPublishedVersionRecord {
  assignments: FormAssignmentSummaryRecord[];
  id: string;
  published_at: string;
  version_number: number;
}

export interface FormTemplateRecord {
  description: string;
  fields: FormFieldRecord[];
  id: string;
  name: string;
  published_versions: FormPublishedVersionRecord[];
  updated_at: string;
  version: number;
}

export interface FormSubmissionRecord {
  responses: Record<string, string | boolean>;
  signer_name: string | null;
  status: 'DRAFT' | 'SUBMITTED';
  submitted_at: string | null;
  version: number;
}

export interface ParentFormObligationRecord {
  assignment_id: string;
  camper_name: string;
  description: string;
  due_at: string | null;
  fields: FormFieldRecord[];
  form_name: string;
  form_version: number;
  registration_id: string;
  session_name: string;
  submission: FormSubmissionRecord | null;
}

export interface FormsWriteContext {
  actorId: string;
  organizationId: string;
  requestId: string;
}

export class FormTemplateNotFoundError extends Error {}
export class FormVersionConflictError extends Error {}
export class FormObligationNotFoundError extends Error {}
export class FormSubmissionConflictError extends Error {}

interface TemplateRow {
  description: string;
  draft_fields: FormFieldRecord[];
  id: string;
  name: string;
  updated_at: Date;
  version: number;
}

interface VersionAssignmentRow {
  assignment_id: string | null;
  completed_count: number;
  due_at: Date | null;
  id: string;
  published_at: Date;
  session_id: string | null;
  session_name: string | null;
  template_id: string;
  total_count: number;
  version_number: number;
}

interface ObligationRow {
  assignment_id: string;
  camper_name: string;
  description: string;
  due_at: Date | null;
  fields: FormFieldRecord[];
  form_name: string;
  form_version: number;
  registration_id: string;
  responses: Record<string, string | boolean> | null;
  session_name: string;
  signer_name: string | null;
  status: 'DRAFT' | 'SUBMITTED' | null;
  submission_version: number | null;
  submitted_at: Date | null;
}

function obligation(row: ObligationRow): ParentFormObligationRecord {
  return {
    assignment_id: row.assignment_id,
    camper_name: row.camper_name,
    description: row.description,
    due_at: row.due_at?.toISOString() ?? null,
    fields: row.fields,
    form_name: row.form_name,
    form_version: row.form_version,
    registration_id: row.registration_id,
    session_name: row.session_name,
    submission: row.status
      ? {
          responses: row.responses ?? {},
          signer_name: row.signer_name,
          status: row.status,
          submitted_at: row.submitted_at?.toISOString() ?? null,
          version: row.submission_version ?? 1,
        }
      : null,
  };
}

export class FormsStore {
  constructor(private readonly database: DatabaseClient) {}

  private async withTenant<T>(
    organizationId: string,
    operation: (client: PoolClient) => Promise<T>,
  ): Promise<T> {
    const client = await this.database.pool.connect();
    try {
      await client.query('BEGIN');
      await client.query(`SELECT set_config('app.organization_id', $1, true)`, [organizationId]);
      const result = await operation(client);
      await client.query('COMMIT');
      return result;
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }

  async listTemplates(organizationId: string): Promise<FormTemplateRecord[]> {
    return this.withTenant(organizationId, async (client) => {
      const [templates, versions] = await Promise.all([
        client.query<TemplateRow>(
          `SELECT id, name, description, draft_fields, version, updated_at
           FROM form_templates
           WHERE organization_id = $1
           ORDER BY name, id`,
          [organizationId],
        ),
        client.query<VersionAssignmentRow>(
          `SELECT
             fv.id,
             fv.template_id,
             fv.version_number,
             fv.published_at,
             fa.id AS assignment_id,
             fa.session_id,
             fa.due_at,
             s.name AS session_name,
             count(DISTINCT r.id) FILTER (WHERE r.status = 'CONFIRMED')::integer AS total_count,
             count(DISTINCT fs.registration_id) FILTER (WHERE fs.status = 'SUBMITTED')::integer
               AS completed_count
           FROM form_versions fv
           LEFT JOIN form_assignments fa
             ON fa.organization_id = fv.organization_id AND fa.form_version_id = fv.id
           LEFT JOIN sessions s
             ON s.organization_id = fa.organization_id AND s.id = fa.session_id
           LEFT JOIN registrations r
             ON r.organization_id = fa.organization_id AND r.session_id = fa.session_id
           LEFT JOIN form_submissions fs
             ON fs.organization_id = fa.organization_id
            AND fs.assignment_id = fa.id
            AND fs.registration_id = r.id
           WHERE fv.organization_id = $1
           GROUP BY fv.id, fa.id, s.name
           ORDER BY fv.template_id, fv.version_number DESC, s.name, fa.id`,
          [organizationId],
        ),
      ]);

      const versionsByTemplate = new Map<string, Map<string, FormPublishedVersionRecord>>();
      for (const row of versions.rows) {
        let templateVersions = versionsByTemplate.get(row.template_id);
        if (!templateVersions) {
          templateVersions = new Map();
          versionsByTemplate.set(row.template_id, templateVersions);
        }
        let version = templateVersions.get(row.id);
        if (!version) {
          version = {
            assignments: [],
            id: row.id,
            published_at: row.published_at.toISOString(),
            version_number: row.version_number,
          };
          templateVersions.set(row.id, version);
        }
        if (row.assignment_id && row.session_id && row.session_name) {
          version.assignments.push({
            completed_count: row.completed_count,
            due_at: row.due_at?.toISOString() ?? null,
            id: row.assignment_id,
            session_id: row.session_id,
            session_name: row.session_name,
            total_count: row.total_count,
          });
        }
      }

      return templates.rows.map((row) => ({
        description: row.description,
        fields: row.draft_fields,
        id: row.id,
        name: row.name,
        published_versions: [...(versionsByTemplate.get(row.id)?.values() ?? [])],
        updated_at: row.updated_at.toISOString(),
        version: row.version,
      }));
    });
  }

  async createTemplate(
    context: FormsWriteContext,
    template: Omit<FormTemplateRecord, 'published_versions' | 'updated_at' | 'version'>,
  ): Promise<FormTemplateRecord> {
    return this.withTenant(context.organizationId, async (client) => {
      await client.query(
        `INSERT INTO form_templates (id, organization_id, name, description, draft_fields)
         VALUES ($1, $2, $3, $4, $5::jsonb)`,
        [
          template.id,
          context.organizationId,
          template.name,
          template.description,
          JSON.stringify(template.fields),
        ],
      );
      await this.audit(client, context, 'form_template.created', 'form_template', template.id, {});
      return {
        ...template,
        published_versions: [],
        updated_at: (await this.databaseTimestamp(client)).toISOString(),
        version: 1,
      };
    });
  }

  async updateTemplate(
    context: FormsWriteContext,
    templateId: string,
    update: { description: string; fields: FormFieldRecord[]; name: string; version: number },
  ): Promise<FormTemplateRecord> {
    return this.withTenant(context.organizationId, async (client) => {
      const result = await client.query<TemplateRow>(
        `UPDATE form_templates
         SET name = $3,
             description = $4,
             draft_fields = $5::jsonb,
             version = version + 1,
             updated_at = transaction_timestamp()
         WHERE organization_id = $1 AND id = $2 AND version = $6
         RETURNING id, name, description, draft_fields, version, updated_at`,
        [
          context.organizationId,
          templateId,
          update.name,
          update.description,
          JSON.stringify(update.fields),
          update.version,
        ],
      );
      if (!result.rows[0]) {
        const exists = await client.query(
          `SELECT 1 FROM form_templates WHERE organization_id = $1 AND id = $2`,
          [context.organizationId, templateId],
        );
        if (exists.rowCount === 0) throw new FormTemplateNotFoundError('Form template not found');
        throw new FormVersionConflictError('The form template changed; reload and try again');
      }
      await this.audit(client, context, 'form_template.updated', 'form_template', templateId, {
        previous_version: update.version,
      });
      const row = result.rows[0];
      return {
        description: row.description,
        fields: row.draft_fields,
        id: row.id,
        name: row.name,
        published_versions: [],
        updated_at: row.updated_at.toISOString(),
        version: row.version,
      };
    });
  }

  async publishTemplate(
    context: FormsWriteContext,
    templateId: string,
    expectedVersion: number,
    versionId: string,
    assignments: { dueAt: string | null; id: string; sessionId: string }[],
  ): Promise<void> {
    await this.withTenant(context.organizationId, async (client) => {
      const template = await client.query<TemplateRow>(
        `SELECT id, name, description, draft_fields, version, updated_at
         FROM form_templates
         WHERE organization_id = $1 AND id = $2
         FOR UPDATE`,
        [context.organizationId, templateId],
      );
      const row = template.rows[0];
      if (!row) throw new FormTemplateNotFoundError('Form template not found');
      if (row.version !== expectedVersion) {
        throw new FormVersionConflictError('The form template changed; reload and try again');
      }
      const sessionIds = assignments.map((assignment) => assignment.sessionId);
      const sessions = await client.query<{ id: string }>(
        `SELECT id FROM sessions WHERE organization_id = $1 AND id = ANY($2::uuid[])`,
        [context.organizationId, sessionIds],
      );
      if (sessions.rowCount !== sessionIds.length) {
        throw new FormTemplateNotFoundError('One or more selected sessions were not found');
      }
      const numberResult = await client.query<{ version_number: number }>(
        `SELECT COALESCE(max(version_number), 0)::integer + 1 AS version_number
         FROM form_versions
         WHERE organization_id = $1 AND template_id = $2`,
        [context.organizationId, templateId],
      );
      const versionNumber = numberResult.rows[0]?.version_number ?? 1;
      await client.query(
        `INSERT INTO form_versions (
           id, organization_id, template_id, version_number, name, description, fields, published_by
         ) VALUES ($1, $2, $3, $4, $5, $6, $7::jsonb, $8)`,
        [
          versionId,
          context.organizationId,
          templateId,
          versionNumber,
          row.name,
          row.description,
          JSON.stringify(row.draft_fields),
          context.actorId,
        ],
      );
      for (const assignment of assignments) {
        await client.query(
          `INSERT INTO form_assignments (
             id, organization_id, form_version_id, session_id, due_at
           ) VALUES ($1, $2, $3, $4, $5)`,
          [
            assignment.id,
            context.organizationId,
            versionId,
            assignment.sessionId,
            assignment.dueAt,
          ],
        );
      }
      await this.audit(client, context, 'form_version.published', 'form_version', versionId, {
        assigned_session_count: assignments.length,
        template_id: templateId,
        version_number: versionNumber,
      });
    });
  }

  async listParentObligations(
    organizationId: string,
    actorId: string,
  ): Promise<ParentFormObligationRecord[]> {
    return this.withTenant(organizationId, async (client) => {
      const result = await client.query<ObligationRow>(this.obligationQuery(), [
        organizationId,
        actorId,
      ]);
      return result.rows.map(obligation);
    });
  }

  async saveParentSubmission(
    context: FormsWriteContext,
    assignmentId: string,
    registrationId: string,
    update: {
      responses: Record<string, string | boolean>;
      signerName: string | null;
      status: 'DRAFT' | 'SUBMITTED';
      version: number;
    },
  ): Promise<FormSubmissionRecord> {
    return this.withTenant(context.organizationId, async (client) => {
      const obligationResult = await client.query<ObligationRow>(
        `${this.obligationQuery('AND fa.id = $3 AND r.id = $4')} FOR UPDATE OF r`,
        [context.organizationId, context.actorId, assignmentId, registrationId],
      );
      if (!obligationResult.rows[0]) {
        throw new FormObligationNotFoundError('Required form was not found');
      }
      const existing = await client.query<{
        id: string;
        status: 'DRAFT' | 'SUBMITTED';
        version: number;
      }>(
        `SELECT id, status, version
         FROM form_submissions
         WHERE organization_id = $1 AND assignment_id = $2 AND registration_id = $3
         FOR UPDATE`,
        [context.organizationId, assignmentId, registrationId],
      );
      const current = existing.rows[0];
      if ((current?.version ?? 0) !== update.version || current?.status === 'SUBMITTED') {
        throw new FormSubmissionConflictError(
          current?.status === 'SUBMITTED'
            ? 'Submitted forms cannot be changed'
            : 'The form draft changed; reload and try again',
        );
      }
      const submissionId = current?.id ?? randomUUID();
      const result = current
        ? await client.query<{
            responses: Record<string, string | boolean>;
            signer_name: string | null;
            status: 'DRAFT' | 'SUBMITTED';
            submitted_at: Date | null;
            version: number;
          }>(
            `UPDATE form_submissions
             SET responses = $4::jsonb,
                 signer_name = $5,
                 signer_actor_id = CASE WHEN $6 = 'SUBMITTED' THEN $7 ELSE NULL END,
                 status = $6,
                 submitted_at = CASE WHEN $6 = 'SUBMITTED' THEN transaction_timestamp() ELSE NULL END,
                 version = version + 1,
                 updated_at = transaction_timestamp()
             WHERE organization_id = $1 AND assignment_id = $2 AND registration_id = $3
             RETURNING responses, signer_name, status, submitted_at, version`,
            [
              context.organizationId,
              assignmentId,
              registrationId,
              JSON.stringify(update.responses),
              update.signerName,
              update.status,
              context.actorId,
            ],
          )
        : await client.query<{
            responses: Record<string, string | boolean>;
            signer_name: string | null;
            status: 'DRAFT' | 'SUBMITTED';
            submitted_at: Date | null;
            version: number;
          }>(
            `INSERT INTO form_submissions (
               id, organization_id, assignment_id, registration_id, responses, signer_name,
               signer_actor_id, status, submitted_at
             ) VALUES (
               $1, $2, $3, $4, $5::jsonb, $6,
               CASE WHEN $7 = 'SUBMITTED' THEN $8 ELSE NULL END,
               $7,
               CASE WHEN $7 = 'SUBMITTED' THEN transaction_timestamp() ELSE NULL END
             )
             RETURNING responses, signer_name, status, submitted_at, version`,
            [
              submissionId,
              context.organizationId,
              assignmentId,
              registrationId,
              JSON.stringify(update.responses),
              update.signerName,
              update.status,
              context.actorId,
            ],
          );
      const saved = result.rows[0]!;
      await this.audit(
        client,
        context,
        update.status === 'SUBMITTED' ? 'form_submission.submitted' : 'form_submission.draft_saved',
        'form_submission',
        submissionId,
        { assignment_id: assignmentId, registration_id: registrationId },
      );
      return {
        responses: saved.responses,
        signer_name: saved.signer_name,
        status: saved.status,
        submitted_at: saved.submitted_at?.toISOString() ?? null,
        version: saved.version,
      };
    });
  }

  private obligationQuery(extraWhere = ''): string {
    return `SELECT
      fa.id AS assignment_id,
      r.id AS registration_id,
      fv.name AS form_name,
      fv.description,
      fv.fields,
      fv.version_number AS form_version,
      fa.due_at,
      s.name AS session_name,
      concat(c.first_name, ' ', c.last_name) AS camper_name,
      fs.responses,
      fs.signer_name,
      fs.status,
      fs.submitted_at,
      fs.version AS submission_version
    FROM form_assignments fa
    JOIN form_versions fv
      ON fv.organization_id = fa.organization_id AND fv.id = fa.form_version_id
    JOIN sessions s
      ON s.organization_id = fa.organization_id AND s.id = fa.session_id
    JOIN registrations r
      ON r.organization_id = fa.organization_id AND r.session_id = fa.session_id
    JOIN campers c
      ON c.organization_id = r.organization_id AND c.id = r.camper_id
    LEFT JOIN form_submissions fs
      ON fs.organization_id = fa.organization_id
     AND fs.assignment_id = fa.id
     AND fs.registration_id = r.id
    WHERE fa.organization_id = $1
      AND r.status = 'CONFIRMED'
      AND EXISTS (
        SELECT 1
        FROM adults a
        WHERE a.organization_id = r.organization_id
          AND a.family_id = r.family_id
          AND a.identity_subject = $2
          AND a.can_manage_family
      )
      ${extraWhere}
    ORDER BY (fs.status = 'SUBMITTED') NULLS FIRST, fa.due_at NULLS LAST, s.starts_on, fv.name`;
  }

  private async databaseTimestamp(client: PoolClient): Promise<Date> {
    const result = await client.query<{ now: Date }>('SELECT transaction_timestamp() AS now');
    return result.rows[0]!.now;
  }

  private async audit(
    client: PoolClient,
    context: FormsWriteContext,
    action: string,
    targetType: string,
    targetId: string,
    details: Record<string, unknown>,
  ): Promise<void> {
    await client.query(
      `INSERT INTO audit_events (
         organization_id, actor_id, action, target_type, target_id, outcome, request_id, details
       ) VALUES ($1, $2, $3, $4, $5, 'SUCCESS', $6, $7::jsonb)`,
      [
        context.organizationId,
        context.actorId,
        action,
        targetType,
        targetId,
        context.requestId,
        JSON.stringify(details),
      ],
    );
  }
}
