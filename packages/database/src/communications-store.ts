import { randomUUID } from 'node:crypto';

import type { PoolClient } from 'pg';

import type { DatabaseClient } from './client.js';

export type CommunicationAudienceType =
  | 'SESSION_CONFIRMED'
  | 'SESSION_WAITLISTED'
  | 'MISSING_FORMS'
  | 'BALANCE_DUE';
export type CommunicationTemplateStatus = 'DRAFT' | 'ACTIVE' | 'ARCHIVED';

export interface CommunicationContext {
  actorId: string;
  organizationId: string;
  requestId: string;
}

export interface CommunicationAudienceRecord {
  audienceType: CommunicationAudienceType;
  sessionId: string | null;
}

export interface CommunicationTemplateRecord {
  body: string;
  description: string;
  id: string;
  name: string;
  status: CommunicationTemplateStatus;
  subject: string;
  updated_at: string;
  version: number;
}

export interface CommunicationCampaignRecord {
  audience_type: CommunicationAudienceType;
  created_at: string;
  delivered_count: number;
  failed_count: number;
  id: string;
  name: string;
  pending_count: number;
  queued_at: string | null;
  recipient_count: number;
  scheduled_for: string;
  session_id: string | null;
  session_name: string | null;
  status: 'SCHEDULED' | 'QUEUED' | 'CANCELLED';
  template_id: string;
  template_name: string;
  template_version: number;
}

export interface CommunicationDeliveryRecord {
  attempt_count: number;
  campaign_id: string;
  campaign_name: string;
  created_at: string;
  delivered_at: string | null;
  id: string;
  last_error: string | null;
  recipient_hint: string;
  status: 'PENDING' | 'PROCESSING' | 'DELIVERED' | 'FAILED';
}

export interface CommunicationsCenterRecord {
  campaigns: CommunicationCampaignRecord[];
  deliveries: CommunicationDeliveryRecord[];
  templates: CommunicationTemplateRecord[];
}

export interface CommunicationTemplateWrite {
  body: string;
  description: string;
  id: string;
  name: string;
  subject: string;
  version?: number;
}

export interface CommunicationCampaignWrite extends CommunicationAudienceRecord {
  bodySnapshot: string;
  id: string;
  name: string;
  scheduledFor: string;
  subjectSnapshot: string;
  templateId: string;
  templateVersion: number;
}

export class CommunicationNotFoundError extends Error {}
export class CommunicationVersionConflictError extends Error {}
export class CommunicationStateConflictError extends Error {}

interface TemplateRow extends Omit<CommunicationTemplateRecord, 'updated_at'> {
  updated_at: Date;
}

interface CampaignRow extends Omit<
  CommunicationCampaignRecord,
  'created_at' | 'queued_at' | 'scheduled_for'
> {
  created_at: Date;
  queued_at: Date | null;
  scheduled_for: Date;
}

interface DeliveryRow extends Omit<
  CommunicationDeliveryRecord,
  'created_at' | 'delivered_at' | 'recipient_hint'
> {
  created_at: Date;
  delivered_at: Date | null;
  recipient_email: string;
}

interface RecipientRow {
  balance_due_cents: number;
  camper_name: string;
  family_id: string;
  family_name: string;
  form_due_at: Date | null;
  recipient_email: string;
  registration_id: string;
  session_id: string;
  session_name: string;
  starts_on: string;
}

interface DueCampaignRow {
  body_snapshot: string;
  id: string;
  name: string;
  audience_type: CommunicationAudienceType;
  session_id: string | null;
  subject_snapshot: string;
}

function iso(value: Date | null): string | null {
  return value ? value.toISOString() : null;
}

function recipientHint(email: string): string {
  const separator = email.lastIndexOf('@');
  return separator >= 0 ? `***${email.slice(separator)}` : 'Address withheld';
}

function templateRecord(row: TemplateRow): CommunicationTemplateRecord {
  return { ...row, updated_at: row.updated_at.toISOString() };
}

function campaignRecord(row: CampaignRow): CommunicationCampaignRecord {
  return {
    ...row,
    created_at: row.created_at.toISOString(),
    queued_at: iso(row.queued_at),
    scheduled_for: row.scheduled_for.toISOString(),
  };
}

function deliveryRecord(row: DeliveryRow): CommunicationDeliveryRecord {
  const { recipient_email, ...delivery } = row;
  return {
    ...delivery,
    created_at: row.created_at.toISOString(),
    delivered_at: iso(row.delivered_at),
    recipient_hint: recipientHint(recipient_email),
  };
}

function dollars(cents: number): string {
  return new Intl.NumberFormat('en-US', { currency: 'USD', style: 'currency' }).format(cents / 100);
}

function render(value: string, recipient: RecipientRow): string {
  const replacements: Record<string, string> = {
    balance_due: dollars(recipient.balance_due_cents),
    camper_name: recipient.camper_name,
    family_name: recipient.family_name,
    form_due_date: recipient.form_due_at?.toISOString().slice(0, 10) ?? 'as soon as possible',
    portal_url: '{{portal_url}}',
    session_name: recipient.session_name,
    session_start_date: recipient.starts_on,
  };
  return value.replace(/\{\{([a-z_]+)\}\}/g, (match, key: string) => replacements[key] ?? match);
}

export class CommunicationsStore {
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

  async listOrganizationIds(): Promise<string[]> {
    const result = await this.database.pool.query<{ organization_id: string }>(
      'SELECT organization_id FROM list_communication_worker_organizations()',
    );
    return result.rows.map((row) => row.organization_id);
  }

  async getCenter(organizationId: string): Promise<CommunicationsCenterRecord> {
    return this.withTenant(organizationId, async (client) => {
      const templates = await client.query<TemplateRow>(
        `SELECT id, name, description, subject, body, status, version, updated_at
         FROM communication_templates
         WHERE organization_id = $1
         ORDER BY status = 'ACTIVE' DESC, lower(name), id`,
        [organizationId],
      );
      const campaigns = await client.query<CampaignRow>(
        `SELECT
           campaign.id,
           campaign.template_id,
           campaign.template_version,
           template.name AS template_name,
           campaign.session_id,
           session.name AS session_name,
           campaign.name,
           campaign.audience_type,
           campaign.scheduled_for,
           campaign.status,
           campaign.recipient_count,
           campaign.queued_at,
           campaign.created_at,
           count(outbox.id) FILTER (WHERE outbox.status IN ('PENDING', 'PROCESSING'))::integer AS pending_count,
           count(outbox.id) FILTER (WHERE outbox.status = 'DELIVERED')::integer AS delivered_count,
           count(outbox.id) FILTER (WHERE outbox.status = 'FAILED')::integer AS failed_count
         FROM communication_campaigns campaign
         JOIN communication_templates template
           ON template.organization_id = campaign.organization_id AND template.id = campaign.template_id
         LEFT JOIN sessions session
           ON session.organization_id = campaign.organization_id AND session.id = campaign.session_id
         LEFT JOIN notification_outbox outbox
           ON outbox.organization_id = campaign.organization_id
          AND outbox.communication_campaign_id = campaign.id
         WHERE campaign.organization_id = $1
         GROUP BY campaign.id, template.name, session.name
         ORDER BY campaign.created_at DESC, campaign.id DESC
         LIMIT 100`,
        [organizationId],
      );
      const deliveries = await client.query<DeliveryRow>(
        `SELECT
           outbox.id,
           outbox.communication_campaign_id AS campaign_id,
           campaign.name AS campaign_name,
           outbox.status,
           outbox.attempt_count,
           outbox.recipient_email,
           outbox.delivered_at,
           outbox.last_error,
           outbox.created_at
         FROM notification_outbox outbox
         JOIN communication_campaigns campaign
           ON campaign.organization_id = outbox.organization_id
          AND campaign.id = outbox.communication_campaign_id
         WHERE outbox.organization_id = $1
         ORDER BY outbox.created_at DESC, outbox.id DESC
         LIMIT 100`,
        [organizationId],
      );
      return {
        campaigns: campaigns.rows.map(campaignRecord),
        deliveries: deliveries.rows.map(deliveryRecord),
        templates: templates.rows.map(templateRecord),
      };
    });
  }

  async createTemplate(
    context: CommunicationContext,
    template: CommunicationTemplateWrite,
  ): Promise<CommunicationTemplateRecord> {
    return this.withTenant(context.organizationId, async (client) => {
      const result = await client.query<TemplateRow>(
        `INSERT INTO communication_templates (
           id, organization_id, name, description, subject, body, created_by
         ) VALUES ($1,$2,$3,$4,$5,$6,$7)
         RETURNING id, name, description, subject, body, status, version, updated_at`,
        [
          template.id,
          context.organizationId,
          template.name,
          template.description,
          template.subject,
          template.body,
          context.actorId,
        ],
      );
      await this.audit(
        client,
        context,
        'communication.template_created',
        'communication_template',
        template.id,
        {},
      );
      return templateRecord(result.rows[0]!);
    });
  }

  async updateTemplate(
    context: CommunicationContext,
    templateId: string,
    template: CommunicationTemplateWrite & { version: number },
  ): Promise<CommunicationTemplateRecord> {
    return this.withTenant(context.organizationId, async (client) => {
      const result = await client.query<TemplateRow>(
        `UPDATE communication_templates
         SET name = $3, description = $4, subject = $5, body = $6,
             version = version + 1, updated_at = transaction_timestamp()
         WHERE organization_id = $1 AND id = $2 AND version = $7 AND status <> 'ARCHIVED'
         RETURNING id, name, description, subject, body, status, version, updated_at`,
        [
          context.organizationId,
          templateId,
          template.name,
          template.description,
          template.subject,
          template.body,
          template.version,
        ],
      );
      if (!result.rows[0]) {
        const exists = await client.query(
          'SELECT 1 FROM communication_templates WHERE organization_id = $1 AND id = $2',
          [context.organizationId, templateId],
        );
        if (!exists.rows[0])
          throw new CommunicationNotFoundError('Communication template not found');
        throw new CommunicationVersionConflictError(
          'Communication template changed; reload and try again',
        );
      }
      await this.audit(
        client,
        context,
        'communication.template_updated',
        'communication_template',
        templateId,
        {},
      );
      return templateRecord(result.rows[0]);
    });
  }

  async setTemplateStatus(
    context: CommunicationContext,
    templateId: string,
    version: number,
    status: CommunicationTemplateStatus,
  ): Promise<CommunicationTemplateRecord> {
    return this.withTenant(context.organizationId, async (client) => {
      const result = await client.query<TemplateRow>(
        `UPDATE communication_templates
         SET status = $4, version = version + 1, updated_at = transaction_timestamp()
         WHERE organization_id = $1 AND id = $2 AND version = $3
         RETURNING id, name, description, subject, body, status, version, updated_at`,
        [context.organizationId, templateId, version, status],
      );
      if (!result.rows[0]) {
        const exists = await client.query(
          'SELECT 1 FROM communication_templates WHERE organization_id = $1 AND id = $2',
          [context.organizationId, templateId],
        );
        if (!exists.rows[0])
          throw new CommunicationNotFoundError('Communication template not found');
        throw new CommunicationVersionConflictError(
          'Communication template changed; reload and try again',
        );
      }
      await this.audit(
        client,
        context,
        `communication.template_${status.toLowerCase()}`,
        'communication_template',
        templateId,
        {},
      );
      return templateRecord(result.rows[0]);
    });
  }

  async countAudience(
    organizationId: string,
    audience: CommunicationAudienceRecord,
  ): Promise<number> {
    return this.withTenant(organizationId, async (client) => {
      const recipients = await this.listRecipients(client, organizationId, audience);
      return recipients.length;
    });
  }

  async createCampaign(
    context: CommunicationContext,
    campaign: CommunicationCampaignWrite,
  ): Promise<CommunicationCampaignRecord> {
    return this.withTenant(context.organizationId, async (client) => {
      const template = await client.query<{
        name: string;
        status: CommunicationTemplateStatus;
        version: number;
      }>(
        `SELECT name, status, version FROM communication_templates
         WHERE organization_id = $1 AND id = $2`,
        [context.organizationId, campaign.templateId],
      );
      if (!template.rows[0])
        throw new CommunicationNotFoundError('Communication template not found');
      if (template.rows[0].status !== 'ACTIVE') {
        throw new CommunicationStateConflictError('Activate the template before scheduling it');
      }
      if (template.rows[0].version !== campaign.templateVersion) {
        throw new CommunicationVersionConflictError(
          'Communication template changed; reload before scheduling',
        );
      }
      if (campaign.sessionId) {
        const session = await client.query(
          'SELECT 1 FROM sessions WHERE organization_id = $1 AND id = $2',
          [context.organizationId, campaign.sessionId],
        );
        if (!session.rows[0]) throw new CommunicationNotFoundError('Session not found');
      }
      const result = await client.query<CampaignRow>(
        `INSERT INTO communication_campaigns (
           id, organization_id, template_id, template_version, session_id, name, audience_type,
           subject_snapshot, body_snapshot, scheduled_for, created_by
         ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)
         RETURNING id, template_id, template_version, $12::text AS template_name, session_id,
           (SELECT name FROM sessions WHERE organization_id = $2 AND id = $5) AS session_name,
           name, audience_type, scheduled_for, status, recipient_count, queued_at, created_at,
           0::integer AS pending_count, 0::integer AS delivered_count, 0::integer AS failed_count`,
        [
          campaign.id,
          context.organizationId,
          campaign.templateId,
          campaign.templateVersion,
          campaign.sessionId,
          campaign.name,
          campaign.audienceType,
          campaign.subjectSnapshot,
          campaign.bodySnapshot,
          campaign.scheduledFor,
          context.actorId,
          template.rows[0].name,
        ],
      );
      await this.audit(
        client,
        context,
        'communication.campaign_scheduled',
        'communication_campaign',
        campaign.id,
        {
          audience_type: campaign.audienceType,
          scheduled_for: campaign.scheduledFor,
          session_id: campaign.sessionId,
        },
      );
      return campaignRecord(result.rows[0]!);
    });
  }

  async cancelCampaign(context: CommunicationContext, campaignId: string): Promise<void> {
    await this.withTenant(context.organizationId, async (client) => {
      const result = await client.query(
        `UPDATE communication_campaigns
         SET status = 'CANCELLED', cancelled_at = transaction_timestamp(), updated_at = transaction_timestamp()
         WHERE organization_id = $1 AND id = $2 AND status = 'SCHEDULED'`,
        [context.organizationId, campaignId],
      );
      if (result.rowCount !== 1) {
        const exists = await client.query(
          'SELECT 1 FROM communication_campaigns WHERE organization_id = $1 AND id = $2',
          [context.organizationId, campaignId],
        );
        if (!exists.rows[0])
          throw new CommunicationNotFoundError('Communication campaign not found');
        throw new CommunicationStateConflictError('Only scheduled campaigns can be cancelled');
      }
      await this.audit(
        client,
        context,
        'communication.campaign_cancelled',
        'communication_campaign',
        campaignId,
        {},
      );
    });
  }

  async replayDelivery(context: CommunicationContext, deliveryId: string): Promise<void> {
    await this.withTenant(context.organizationId, async (client) => {
      const result = await client.query<{ communication_campaign_id: string }>(
        `UPDATE notification_outbox
         SET status = 'PENDING', available_at = transaction_timestamp(), last_error = NULL,
             locked_at = NULL, locked_by = NULL, updated_at = transaction_timestamp()
         WHERE organization_id = $1 AND id = $2
           AND communication_campaign_id IS NOT NULL AND status = 'FAILED'
         RETURNING communication_campaign_id`,
        [context.organizationId, deliveryId],
      );
      if (!result.rows[0]) {
        const exists = await client.query(
          'SELECT 1 FROM notification_outbox WHERE organization_id = $1 AND id = $2 AND communication_campaign_id IS NOT NULL',
          [context.organizationId, deliveryId],
        );
        if (!exists.rows[0])
          throw new CommunicationNotFoundError('Communication delivery not found');
        throw new CommunicationStateConflictError('Only failed deliveries can be replayed');
      }
      await this.audit(
        client,
        context,
        'communication.delivery_replayed',
        'communication_campaign',
        result.rows[0].communication_campaign_id,
        {
          delivery_id: deliveryId,
        },
      );
    });
  }

  async processDueCampaigns(organizationId: string, limit = 20): Promise<number> {
    return this.withTenant(organizationId, async (client) => {
      const due = await client.query<DueCampaignRow>(
        `SELECT id, name, audience_type, session_id, subject_snapshot, body_snapshot
         FROM communication_campaigns
         WHERE organization_id = $1 AND status = 'SCHEDULED'
           AND scheduled_for <= transaction_timestamp()
         ORDER BY scheduled_for, id
         LIMIT $2
         FOR UPDATE SKIP LOCKED`,
        [organizationId, limit],
      );
      let queued = 0;
      for (const campaign of due.rows) {
        const recipients = await this.listRecipients(client, organizationId, {
          audienceType: campaign.audience_type,
          sessionId: campaign.session_id,
        });
        let campaignCount = 0;
        for (const recipient of recipients) {
          const result = await client.query(
            `INSERT INTO notification_outbox (
               id, organization_id, family_id, session_id, registration_id,
               waitlist_offer_id, communication_campaign_id, notification_type,
               recipient_email, template_data, idempotency_key
             ) VALUES ($1,$2,$3,$4,$5,NULL,$6,'LIFECYCLE_MESSAGE',$7,$8::jsonb,$9)
             ON CONFLICT (organization_id, idempotency_key) DO NOTHING`,
            [
              randomUUID(),
              organizationId,
              recipient.family_id,
              recipient.session_id,
              recipient.registration_id,
              campaign.id,
              recipient.recipient_email,
              JSON.stringify({
                body: render(campaign.body_snapshot, recipient),
                portal_path: '/portal',
                subject: render(campaign.subject_snapshot, recipient),
              }),
              `communication:${campaign.id}:${recipient.registration_id}:${recipient.recipient_email.toLowerCase()}`,
            ],
          );
          campaignCount += result.rowCount ?? 0;
        }
        await client.query(
          `UPDATE communication_campaigns
           SET status = 'QUEUED', recipient_count = $3, queued_at = transaction_timestamp(),
               updated_at = transaction_timestamp()
           WHERE organization_id = $1 AND id = $2`,
          [organizationId, campaign.id, campaignCount],
        );
        await client.query(
          `INSERT INTO audit_events (
             organization_id, actor_id, action, target_type, target_id, outcome, request_id, details
           ) VALUES ($1,'system:communications-worker','communication.campaign_queued',
             'communication_campaign',$2,'success',$3,$4::jsonb)`,
          [
            organizationId,
            campaign.id,
            `communications-worker:${campaign.id}`,
            JSON.stringify({ recipient_count: campaignCount }),
          ],
        );
        queued += campaignCount;
      }
      return queued;
    });
  }

  private async listRecipients(
    client: PoolClient,
    organizationId: string,
    audience: CommunicationAudienceRecord,
  ): Promise<RecipientRow[]> {
    const result = await client.query<RecipientRow>(
      `SELECT DISTINCT ON (registration.id, lower(adult.email))
         registration.id AS registration_id,
         registration.family_id,
         registration.session_id,
         adult.email AS recipient_email,
         family.family_name,
         concat_ws(' ', camper.first_name, camper.last_name) AS camper_name,
         session.name AS session_name,
         session.starts_on::text,
         COALESCE(balance.amount_paid_cents, 0)::integer,
         GREATEST(registration.price_cents - COALESCE(balance.amount_paid_cents, 0), 0)::integer AS balance_due_cents,
         missing_form.due_at AS form_due_at
       FROM registrations registration
       JOIN families family
         ON family.organization_id = registration.organization_id AND family.id = registration.family_id
       JOIN campers camper
         ON camper.organization_id = registration.organization_id AND camper.id = registration.camper_id
       JOIN sessions session
         ON session.organization_id = registration.organization_id AND session.id = registration.session_id
       JOIN adults adult
         ON adult.organization_id = registration.organization_id
        AND adult.family_id = registration.family_id
        AND adult.archived_at IS NULL
        AND adult.email IS NOT NULL
        AND adult.receives_operational_communication
        AND (adult.account_owner OR adult.can_register)
       LEFT JOIN LATERAL (
         SELECT COALESCE(sum(payment.amount_cents), 0)::integer AS amount_paid_cents
         FROM registration_payments payment
         WHERE payment.organization_id = registration.organization_id
           AND payment.registration_id = registration.id
       ) balance ON true
       LEFT JOIN LATERAL (
         SELECT count(*)::integer AS missing_count, min(assignment.due_at) AS due_at
         FROM form_assignments assignment
         WHERE assignment.organization_id = registration.organization_id
           AND assignment.session_id = registration.session_id
           AND NOT EXISTS (
             SELECT 1 FROM form_submissions submission
             WHERE submission.organization_id = assignment.organization_id
               AND submission.assignment_id = assignment.id
               AND submission.registration_id = registration.id
               AND submission.status = 'SUBMITTED'
           )
       ) missing_form ON true
       WHERE registration.organization_id = $1
         AND ($2::uuid IS NULL OR registration.session_id = $2)
         AND (
           ($3 = 'SESSION_CONFIRMED' AND registration.status = 'CONFIRMED')
           OR ($3 = 'SESSION_WAITLISTED' AND registration.status = 'WAITLISTED')
           OR ($3 = 'MISSING_FORMS' AND registration.status = 'CONFIRMED' AND missing_form.missing_count > 0)
           OR ($3 = 'BALANCE_DUE' AND registration.status = 'CONFIRMED'
             AND registration.price_cents > COALESCE(balance.amount_paid_cents, 0))
         )
       ORDER BY registration.id, lower(adult.email), adult.id`,
      [organizationId, audience.sessionId, audience.audienceType],
    );
    return result.rows;
  }

  private async audit(
    client: PoolClient,
    context: CommunicationContext,
    action: string,
    targetType: string,
    targetId: string,
    details: Record<string, unknown>,
  ): Promise<void> {
    await client.query(
      `INSERT INTO audit_events (
         organization_id, actor_id, action, target_type, target_id, outcome, request_id, details
       ) VALUES ($1,$2,$3,$4,$5,'success',$6,$7::jsonb)`,
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
