'use client';

import type {
  CommunicationAudienceType,
  CommunicationsCenter,
  CommunicationTemplate,
  ProblemResponse,
  SessionSummary,
} from '@camp-registration/contracts';
import {
  Archive,
  CalendarClock,
  CheckCircle2,
  Mail,
  Pencil,
  Play,
  RefreshCw,
  Send,
  Users,
} from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useEffect, useMemo, useState, type FormEvent } from 'react';

const audienceOptions: Array<{
  description: string;
  label: string;
  value: CommunicationAudienceType;
}> = [
  {
    description: 'Families with confirmed registrations in one session.',
    label: 'Confirmed campers',
    value: 'SESSION_CONFIRMED',
  },
  {
    description: 'Families currently waiting for a place in one session.',
    label: 'Waitlisted campers',
    value: 'SESSION_WAITLISTED',
  },
  {
    description: 'Confirmed families that still owe at least one assigned form.',
    label: 'Missing forms',
    value: 'MISSING_FORMS',
  },
  {
    description: 'Confirmed registrations with an outstanding balance, optionally by session.',
    label: 'Balances due',
    value: 'BALANCE_DUE',
  },
];

const variables = [
  '{{family_name}}',
  '{{camper_name}}',
  '{{session_name}}',
  '{{session_start_date}}',
  '{{form_due_date}}',
  '{{balance_due}}',
  '{{portal_url}}',
];

function localDateTime(minutes = 5): string {
  const date = new Date(Date.now() + minutes * 60_000);
  const offset = date.getTimezoneOffset() * 60_000;
  return new Date(date.valueOf() - offset).toISOString().slice(0, 16);
}

async function request(path: string, init: RequestInit): Promise<Response> {
  const response = await fetch(path, {
    ...init,
    headers: { 'content-type': 'application/json', ...init.headers },
  });
  if (!response.ok) {
    const problem = (await response.json().catch(() => null)) as ProblemResponse | null;
    throw new Error(problem?.message ?? 'The communications request failed.');
  }
  return response;
}

function formatDate(value: string | null): string {
  if (!value) return 'Not yet';
  return `${new Date(value).toLocaleString('en-US', { timeZone: 'UTC' })} UTC`;
}

export function CommunicationsWorkspace({
  initialCenter,
  sessions,
}: {
  initialCenter: CommunicationsCenter;
  sessions: SessionSummary[];
}) {
  const router = useRouter();
  const [editing, setEditing] = useState<CommunicationTemplate | null>(null);
  const [templateName, setTemplateName] = useState('');
  const [description, setDescription] = useState('');
  const [subject, setSubject] = useState('Reminder for {{camper_name}}');
  const [body, setBody] = useState(
    'Hello {{family_name}},\n\nThis is a reminder for {{camper_name}} in {{session_name}}. Review your family portal: {{portal_url}}',
  );
  const [templateBusy, setTemplateBusy] = useState(false);
  const [templateMessage, setTemplateMessage] = useState<string | null>(null);

  const activeTemplates = initialCenter.templates.filter(
    (template) => template.status === 'ACTIVE',
  );
  const [campaignName, setCampaignName] = useState('');
  const [templateId, setTemplateId] = useState(activeTemplates[0]?.id ?? '');
  const [audienceType, setAudienceType] = useState<CommunicationAudienceType>('SESSION_CONFIRMED');
  const [sessionId, setSessionId] = useState(sessions[0]?.id ?? '');
  const [scheduledFor, setScheduledFor] = useState('');
  const [recipientCount, setRecipientCount] = useState<number | null>(null);
  const [campaignBusy, setCampaignBusy] = useState(false);
  const [campaignMessage, setCampaignMessage] = useState<string | null>(null);
  const selectedAudience = useMemo(
    () => audienceOptions.find((option) => option.value === audienceType)!,
    [audienceType],
  );

  useEffect(() => {
    setScheduledFor(localDateTime());
  }, []);

  function beginEdit(template: CommunicationTemplate) {
    setEditing(template);
    setTemplateName(template.name);
    setDescription(template.description);
    setSubject(template.subject);
    setBody(template.body);
    setTemplateMessage(null);
  }

  function resetTemplate() {
    setEditing(null);
    setTemplateName('');
    setDescription('');
    setSubject('Reminder for {{camper_name}}');
    setBody(
      'Hello {{family_name}},\n\nThis is a reminder for {{camper_name}} in {{session_name}}. Review your family portal: {{portal_url}}',
    );
  }

  async function saveTemplate(event: FormEvent) {
    event.preventDefault();
    setTemplateBusy(true);
    setTemplateMessage(null);
    try {
      await request(
        editing
          ? `/api/v1/communications/templates/${editing.id}`
          : '/api/v1/communications/templates',
        {
          body: JSON.stringify({
            body,
            description,
            name: templateName,
            subject,
            ...(editing ? { version: editing.version } : {}),
          }),
          method: editing ? 'PATCH' : 'POST',
        },
      );
      setTemplateMessage(editing ? 'Template updated.' : 'Template draft created.');
      resetTemplate();
      router.refresh();
    } catch (error) {
      setTemplateMessage(error instanceof Error ? error.message : 'Template could not be saved.');
    } finally {
      setTemplateBusy(false);
    }
  }

  async function changeTemplateStatus(
    template: CommunicationTemplate,
    action: 'activate' | 'archive',
  ) {
    setTemplateBusy(true);
    setTemplateMessage(null);
    try {
      await request(`/api/v1/communications/templates/${template.id}/${action}`, {
        body: JSON.stringify({ version: template.version }),
        method: 'POST',
      });
      setTemplateMessage(action === 'activate' ? 'Template activated.' : 'Template archived.');
      router.refresh();
    } catch (error) {
      setTemplateMessage(
        error instanceof Error ? error.message : 'Template status could not change.',
      );
    } finally {
      setTemplateBusy(false);
    }
  }

  function audiencePayload() {
    return {
      audience_type: audienceType,
      session_id: sessionId || null,
    };
  }

  async function previewAudience() {
    setCampaignBusy(true);
    setCampaignMessage(null);
    try {
      const response = await request('/api/v1/communications/audience-preview', {
        body: JSON.stringify(audiencePayload()),
        method: 'POST',
      });
      const preview = (await response.json()) as { recipient_count: number };
      setRecipientCount(preview.recipient_count);
    } catch (error) {
      setCampaignMessage(
        error instanceof Error ? error.message : 'Audience could not be previewed.',
      );
    } finally {
      setCampaignBusy(false);
    }
  }

  async function scheduleCampaign(event: FormEvent) {
    event.preventDefault();
    setCampaignBusy(true);
    setCampaignMessage(null);
    try {
      await request('/api/v1/communications/campaigns', {
        body: JSON.stringify({
          ...audiencePayload(),
          name: campaignName,
          scheduled_for: new Date(scheduledFor).toISOString(),
          template_id: templateId,
          template_version:
            activeTemplates.find((template) => template.id === templateId)?.version ?? 0,
        }),
        method: 'POST',
      });
      setCampaignMessage('Communication scheduled.');
      setCampaignName('');
      setRecipientCount(null);
      router.refresh();
    } catch (error) {
      setCampaignMessage(
        error instanceof Error ? error.message : 'Communication could not be scheduled.',
      );
    } finally {
      setCampaignBusy(false);
    }
  }

  async function action(path: string, success: string) {
    setCampaignBusy(true);
    setCampaignMessage(null);
    try {
      await request(path, { method: 'POST' });
      setCampaignMessage(success);
      router.refresh();
    } catch (error) {
      setCampaignMessage(
        error instanceof Error ? error.message : 'The action could not be completed.',
      );
    } finally {
      setCampaignBusy(false);
    }
  }

  return (
    <div className="communicationsStack">
      <section className="contentSection communicationComposer" aria-labelledby="template-heading">
        <div className="sectionHeading">
          <div>
            <h2 id="template-heading">Message templates</h2>
            <p className="sectionDescription">
              Templates are plain text, tenant-owned, and snapshotted when a campaign is scheduled.
            </p>
          </div>
        </div>
        <div className="communicationSplit">
          <form className="stackForm" onSubmit={saveTemplate}>
            <div className="formGrid">
              <label className="formField">
                <span>Template name</span>
                <input
                  maxLength={160}
                  onChange={(event) => setTemplateName(event.target.value)}
                  required
                  value={templateName}
                />
              </label>
              <label className="formField">
                <span>Description</span>
                <input
                  maxLength={1000}
                  onChange={(event) => setDescription(event.target.value)}
                  value={description}
                />
              </label>
            </div>
            <label className="formField">
              <span>Email subject</span>
              <input
                maxLength={200}
                onChange={(event) => setSubject(event.target.value)}
                required
                value={subject}
              />
            </label>
            <label className="formField">
              <span>Message</span>
              <textarea
                maxLength={10000}
                onChange={(event) => setBody(event.target.value)}
                required
                rows={9}
                value={body}
              />
            </label>
            <div className="variableList" aria-label="Available template variables">
              {variables.map((variable) => (
                <code key={variable}>{variable}</code>
              ))}
            </div>
            <div className="buttonRow">
              <button className="buttonPrimary" disabled={templateBusy} type="submit">
                {editing ? <Pencil size={17} /> : <Mail size={17} />}
                {editing ? 'Save changes' : 'Create draft'}
              </button>
              {editing ? (
                <button className="buttonSecondary" onClick={resetTemplate} type="button">
                  Cancel edit
                </button>
              ) : null}
            </div>
            {templateMessage ? (
              <p className="formStatus" role="status">
                {templateMessage}
              </p>
            ) : null}
          </form>

          <div className="templateList" aria-label="Communication templates">
            {initialCenter.templates.length === 0 ? (
              <p className="emptyStateText">Create the first reusable message template.</p>
            ) : (
              initialCenter.templates.map((template) => (
                <article className="templateCard" key={template.id}>
                  <div className="templateCardHeader">
                    <div>
                      <strong>{template.name}</strong>
                      <span className={`statusBadge status${template.status}`}>
                        {template.status.toLowerCase()}
                      </span>
                    </div>
                    <small>Version {template.version}</small>
                  </div>
                  <p>{template.subject}</p>
                  <small>{template.description || 'No description'}</small>
                  <div className="buttonRow compactButtons">
                    {template.status !== 'ARCHIVED' ? (
                      <button
                        className="buttonSecondary"
                        disabled={templateBusy}
                        onClick={() => beginEdit(template)}
                        type="button"
                      >
                        <Pencil size={15} /> Edit
                      </button>
                    ) : null}
                    {template.status === 'DRAFT' ? (
                      <button
                        className="buttonSecondary"
                        disabled={templateBusy}
                        onClick={() => void changeTemplateStatus(template, 'activate')}
                        type="button"
                      >
                        <Play size={15} /> Activate
                      </button>
                    ) : null}
                    {template.status !== 'ARCHIVED' ? (
                      <button
                        className="buttonGhost"
                        disabled={templateBusy}
                        onClick={() => void changeTemplateStatus(template, 'archive')}
                        type="button"
                      >
                        <Archive size={15} /> Archive
                      </button>
                    ) : null}
                  </div>
                </article>
              ))
            )}
          </div>
        </div>
      </section>

      <section className="contentSection" aria-labelledby="campaign-heading">
        <div className="sectionHeading">
          <div>
            <h2 id="campaign-heading">Schedule a communication</h2>
            <p className="sectionDescription">
              Preview the exact operational audience before delivery is queued.
            </p>
          </div>
        </div>
        <form className="stackForm" onSubmit={scheduleCampaign}>
          <div className="formGrid communicationCampaignGrid">
            <label className="formField">
              <span>Campaign name</span>
              <input
                maxLength={160}
                onChange={(event) => setCampaignName(event.target.value)}
                required
                value={campaignName}
              />
            </label>
            <label className="formField">
              <span>Active template</span>
              <select
                onChange={(event) => setTemplateId(event.target.value)}
                required
                value={templateId}
              >
                <option value="">Choose a template</option>
                {activeTemplates.map((template) => (
                  <option key={template.id} value={template.id}>
                    {template.name}
                  </option>
                ))}
              </select>
            </label>
            <label className="formField">
              <span>Audience</span>
              <select
                onChange={(event) => {
                  setAudienceType(event.target.value as CommunicationAudienceType);
                  setRecipientCount(null);
                }}
                value={audienceType}
              >
                {audienceOptions.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </label>
            <label className="formField">
              <span>Session {audienceType === 'BALANCE_DUE' ? '(optional)' : ''}</span>
              <select
                onChange={(event) => {
                  setSessionId(event.target.value);
                  setRecipientCount(null);
                }}
                required={audienceType !== 'BALANCE_DUE'}
                value={sessionId}
              >
                {audienceType === 'BALANCE_DUE' ? <option value="">All sessions</option> : null}
                {sessions.map((session) => (
                  <option key={session.id} value={session.id}>
                    {session.name} · {session.starts_on}
                  </option>
                ))}
              </select>
            </label>
            <label className="formField">
              <span>Send at</span>
              <input
                onChange={(event) => setScheduledFor(event.target.value)}
                required
                type="datetime-local"
                value={scheduledFor}
              />
            </label>
          </div>
          <p className="audienceDescription">
            <Users size={16} /> {selectedAudience.description}
          </p>
          <div className="buttonRow">
            <button
              className="buttonSecondary"
              disabled={campaignBusy}
              onClick={() => void previewAudience()}
              type="button"
            >
              <Users size={17} /> Preview recipients
            </button>
            <button
              className="buttonPrimary"
              disabled={campaignBusy || activeTemplates.length === 0}
              type="submit"
            >
              <Send size={17} /> Schedule message
            </button>
          </div>
          {recipientCount !== null ? (
            <p className="recipientPreview" role="status">
              <strong>{recipientCount}</strong> email{' '}
              {recipientCount === 1 ? 'delivery' : 'deliveries'} currently match.
            </p>
          ) : null}
          {campaignMessage ? (
            <p className="formStatus" role="status">
              {campaignMessage}
            </p>
          ) : null}
        </form>
      </section>

      <section className="contentSection" aria-labelledby="campaign-history-heading">
        <div className="sectionHeading">
          <div>
            <h2 id="campaign-history-heading">Campaign history</h2>
            <p className="sectionDescription">Scheduled work and aggregate delivery state.</p>
          </div>
        </div>
        {initialCenter.campaigns.length === 0 ? (
          <p className="emptyStateText">No lifecycle communications have been scheduled.</p>
        ) : (
          <div className="campaignList">
            {initialCenter.campaigns.map((campaign) => (
              <article className="campaignCard" key={campaign.id}>
                <div>
                  <strong>{campaign.name}</strong>
                  <small>
                    {campaign.template_name} · {campaign.session_name ?? 'All sessions'}
                  </small>
                </div>
                <div className="campaignTiming">
                  <CalendarClock size={16} />
                  <span>{formatDate(campaign.scheduled_for)}</span>
                </div>
                <div className="campaignMetrics">
                  <span>{campaign.recipient_count} recipients</span>
                  <span>{campaign.pending_count} pending</span>
                  <span>{campaign.delivered_count} delivered</span>
                  <span>{campaign.failed_count} failed</span>
                </div>
                <span className={`statusBadge status${campaign.status}`}>
                  {campaign.status.toLowerCase()}
                </span>
                {campaign.status === 'SCHEDULED' ? (
                  <button
                    className="buttonGhost"
                    disabled={campaignBusy}
                    onClick={() =>
                      void action(
                        `/api/v1/communications/campaigns/${campaign.id}/cancel`,
                        'Campaign cancelled.',
                      )
                    }
                    type="button"
                  >
                    Cancel
                  </button>
                ) : null}
              </article>
            ))}
          </div>
        )}
      </section>

      <section className="contentSection" aria-labelledby="delivery-heading">
        <div className="sectionHeading">
          <div>
            <h2 id="delivery-heading">Delivery timeline</h2>
            <p className="sectionDescription">
              Recipient addresses are masked; failed messages can be replayed with an audit event.
            </p>
          </div>
        </div>
        {initialCenter.deliveries.length === 0 ? (
          <p className="emptyStateText">
            Delivery activity will appear after a campaign is queued.
          </p>
        ) : (
          <div className="deliveryList">
            {initialCenter.deliveries.map((delivery) => (
              <article className="deliveryRow" key={delivery.id}>
                <span className="deliveryIcon">
                  {delivery.status === 'DELIVERED' ? (
                    <CheckCircle2 size={17} />
                  ) : (
                    <Mail size={17} />
                  )}
                </span>
                <div>
                  <strong>{delivery.campaign_name}</strong>
                  <small>
                    {delivery.recipient_hint} · {formatDate(delivery.created_at)}
                  </small>
                </div>
                <span className={`statusBadge status${delivery.status}`}>
                  {delivery.status.toLowerCase()}
                </span>
                <small>
                  {delivery.attempt_count} attempt{delivery.attempt_count === 1 ? '' : 's'}
                </small>
                {delivery.status === 'FAILED' ? (
                  <button
                    aria-label={`Replay failed delivery for ${delivery.campaign_name}`}
                    className="buttonGhost"
                    disabled={campaignBusy}
                    onClick={() =>
                      void action(
                        `/api/v1/communications/deliveries/${delivery.id}/replay`,
                        'Delivery queued again.',
                      )
                    }
                    type="button"
                  >
                    <RefreshCw size={15} /> Replay
                  </button>
                ) : null}
              </article>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
