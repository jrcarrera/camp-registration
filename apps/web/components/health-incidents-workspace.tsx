'use client';

import type {
  GuardianNotificationStatus,
  HealthIncident,
  HealthIncidentCenter,
  HealthIncidentSeverity,
  HealthIncidentSummary,
  HealthIncidentType,
  ProblemResponse,
} from '@camp-registration/contracts';
import {
  AlertTriangle,
  CheckCircle2,
  ClipboardPlus,
  FileWarning,
  LockKeyhole,
  MessageSquarePlus,
} from 'lucide-react';
import { useMemo, useState, type FormEvent } from 'react';

interface IncidentForm {
  candidate: string;
  care_given: string;
  guardian_notification_status: GuardianNotificationStatus;
  guardian_notified_at: string;
  guardian_notified_to: string;
  incident_type: HealthIncidentType;
  location: string;
  occurred_at: string;
  severity: HealthIncidentSeverity;
  summary: string;
}

interface Props {
  initialCenter: HealthIncidentCenter;
}

function localDateTime(date = new Date()): string {
  const offset = date.getTimezoneOffset() * 60_000;
  return new Date(date.getTime() - offset).toISOString().slice(0, 16);
}

const emptyForm: IncidentForm = {
  candidate: '',
  care_given: '',
  guardian_notification_status: 'PENDING',
  guardian_notified_at: '',
  guardian_notified_to: '',
  incident_type: 'INJURY',
  location: '',
  occurred_at: localDateTime(),
  severity: 'MINOR',
  summary: '',
};

function label(value: string): string {
  return value.toLowerCase().replaceAll('_', ' ');
}

function dateTime(value: string, timezone: string): string {
  return new Intl.DateTimeFormat('en-US', {
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
    month: 'short',
    timeZone: timezone,
    timeZoneName: 'short',
    year: 'numeric',
  }).format(new Date(value));
}

async function jsonRequest<T>(path: string, init: RequestInit = {}): Promise<T> {
  const request: RequestInit = {
    ...init,
    cache: 'no-store',
  };
  if (init.body) request.headers = { 'content-type': 'application/json' };
  const response = await fetch(path, request);
  if (!response.ok) {
    const problem = (await response.json().catch(() => null)) as ProblemResponse | null;
    throw new Error(problem?.message ?? 'The restricted incident request failed.');
  }
  return (await response.json()) as T;
}

export function HealthIncidentsWorkspace({ initialCenter }: Props) {
  const [incidents, setIncidents] = useState(initialCenter.incidents);
  const [form, setForm] = useState<IncidentForm>(emptyForm);
  const [selected, setSelected] = useState<HealthIncident | null>(null);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<'ALL' | 'OPEN' | 'RESOLVED'>('ALL');
  const [followUp, setFollowUp] = useState('');
  const [resolution, setResolution] = useState('');
  const [guardianName, setGuardianName] = useState('');
  const [guardianNotifiedAt, setGuardianNotifiedAt] = useState('');
  const [guardianNote, setGuardianNote] = useState('');
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [tone, setTone] = useState<'error' | 'success'>('success');

  const visibleIncidents = useMemo(() => {
    const query = search.trim().toLowerCase();
    return incidents.filter(
      (incident) =>
        (statusFilter === 'ALL' || incident.status === statusFilter) &&
        (!query ||
          `${incident.camper_name} ${incident.session_name} ${incident.incident_type} ${incident.severity}`
            .toLowerCase()
            .includes(query)),
    );
  }, [incidents, search, statusFilter]);

  function update<K extends keyof IncidentForm>(key: K, value: IncidentForm[K]) {
    setForm((current) => ({ ...current, [key]: value }));
  }

  function replaceSummary(incident: HealthIncident) {
    const summary: HealthIncidentSummary = incident;
    setIncidents((current) => {
      const remaining = current.filter((item) => item.id !== incident.id);
      return [summary, ...remaining].sort((left, right) => {
        if (left.status !== right.status) return left.status === 'OPEN' ? -1 : 1;
        return right.occurred_at.localeCompare(left.occurred_at);
      });
    });
  }

  function showError(error: unknown, fallback: string) {
    setTone('error');
    setMessage(error instanceof Error ? error.message : fallback);
  }

  async function create(event: FormEvent) {
    event.preventDefault();
    const [camperId, sessionId] = form.candidate.split('|');
    if (!camperId || !sessionId) {
      showError(null, 'Select a camper and session.');
      return;
    }
    setBusy(true);
    setMessage(null);
    try {
      const incident = await jsonRequest<HealthIncident>('/api/v1/health-incidents', {
        body: JSON.stringify({
          camper_id: camperId,
          care_given: form.care_given,
          guardian_notification_status: form.guardian_notification_status,
          ...(form.guardian_notification_status === 'NOTIFIED'
            ? {
                guardian_notified_at: new Date(form.guardian_notified_at).toISOString(),
                guardian_notified_to: form.guardian_notified_to,
              }
            : {}),
          incident_type: form.incident_type,
          location: form.location,
          occurred_at: new Date(form.occurred_at).toISOString(),
          session_id: sessionId,
          severity: form.severity,
          summary: form.summary,
        }),
        method: 'POST',
      });
      replaceSummary(incident);
      setSelected(incident);
      setForm({ ...emptyForm, occurred_at: localDateTime() });
      setTone('success');
      setMessage('Incident recorded in the restricted log.');
      requestAnimationFrame(() =>
        document.getElementById('incident-detail')?.scrollIntoView({
          behavior: 'smooth',
          block: 'start',
        }),
      );
    } catch (error) {
      showError(error, 'The incident could not be recorded.');
    } finally {
      setBusy(false);
    }
  }

  async function openIncident(incident: HealthIncidentSummary) {
    setBusy(true);
    setMessage(null);
    try {
      const detail = await jsonRequest<HealthIncident>(`/api/v1/health-incidents/${incident.id}`);
      setSelected(detail);
      requestAnimationFrame(() =>
        document.getElementById('incident-detail')?.scrollIntoView({
          behavior: 'smooth',
          block: 'start',
        }),
      );
    } catch (error) {
      showError(error, 'The incident could not be opened.');
    } finally {
      setBusy(false);
    }
  }

  async function addNote() {
    if (!selected) return;
    setBusy(true);
    setMessage(null);
    try {
      const updated = await jsonRequest<HealthIncident>(
        `/api/v1/health-incidents/${selected.id}/notes`,
        {
          body: JSON.stringify({ note: followUp, version: selected.version }),
          method: 'POST',
        },
      );
      setSelected(updated);
      replaceSummary(updated);
      setFollowUp('');
      setTone('success');
      setMessage('Follow-up note appended.');
    } catch (error) {
      showError(error, 'The follow-up note could not be added.');
    } finally {
      setBusy(false);
    }
  }

  async function recordGuardianNotification() {
    if (!selected) return;
    setBusy(true);
    setMessage(null);
    try {
      const updated = await jsonRequest<HealthIncident>(
        `/api/v1/health-incidents/${selected.id}/guardian-notifications`,
        {
          body: JSON.stringify({
            guardian_notified_at: new Date(guardianNotifiedAt).toISOString(),
            guardian_notified_to: guardianName,
            note: guardianNote,
            version: selected.version,
          }),
          method: 'POST',
        },
      );
      setSelected(updated);
      replaceSummary(updated);
      setGuardianName('');
      setGuardianNotifiedAt('');
      setGuardianNote('');
      setTone('success');
      setMessage('Guardian notification appended to the incident timeline.');
    } catch (error) {
      showError(error, 'The guardian notification could not be recorded.');
    } finally {
      setBusy(false);
    }
  }

  async function resolveIncident() {
    if (!selected) return;
    setBusy(true);
    setMessage(null);
    try {
      const updated = await jsonRequest<HealthIncident>(
        `/api/v1/health-incidents/${selected.id}/resolve`,
        {
          body: JSON.stringify({ resolution, version: selected.version }),
          method: 'POST',
        },
      );
      setSelected(updated);
      replaceSummary(updated);
      setResolution('');
      setTone('success');
      setMessage('Incident resolved with an append-only resolution entry.');
    } catch (error) {
      showError(error, 'The incident could not be resolved.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="incidentWorkspace">
      <section className="contentSection healthPrivacyNotice" aria-label="Restricted data notice">
        <LockKeyhole size={20} aria-hidden="true" />
        <div>
          <strong>Restricted incident data</strong>
          <p>
            Narrative details and timeline entries are encrypted. Every list, read, create,
            follow-up, and resolution is authorized and audited.
          </p>
        </div>
      </section>

      {message && (
        <div
          className={`notice ${tone === 'error' ? 'noticeError' : 'noticeSuccess'}`}
          role="status"
        >
          {tone === 'error' ? (
            <AlertTriangle size={18} aria-hidden="true" />
          ) : (
            <CheckCircle2 size={18} aria-hidden="true" />
          )}
          {message}
        </div>
      )}

      <section className="contentSection" aria-labelledby="incident-create-heading">
        <div className="sectionHeader">
          <div>
            <p className="contextLabel">Health center</p>
            <h2 id="incident-create-heading">Record an incident</h2>
          </div>
          <ClipboardPlus size={22} aria-hidden="true" />
        </div>
        <form className="incidentForm" onSubmit={create}>
          <label className="formField incidentCandidateField">
            <span>Camper and session</span>
            <select
              required
              value={form.candidate}
              onChange={(event) => update('candidate', event.target.value)}
            >
              <option value="">Select a confirmed camper</option>
              {initialCenter.candidates.map((candidate) => (
                <option
                  key={`${candidate.camper_id}|${candidate.session_id}`}
                  value={`${candidate.camper_id}|${candidate.session_id}`}
                >
                  {candidate.camper_name} — {candidate.session_name} ({candidate.family_name})
                </option>
              ))}
            </select>
          </label>
          <label className="formField">
            <span>Occurred at (your local time)</span>
            <input
              required
              type="datetime-local"
              value={form.occurred_at}
              onChange={(event) => update('occurred_at', event.target.value)}
            />
          </label>
          <label className="formField">
            <span>Incident type</span>
            <select
              value={form.incident_type}
              onChange={(event) =>
                update('incident_type', event.target.value as HealthIncidentType)
              }
            >
              <option value="INJURY">Injury</option>
              <option value="ILLNESS">Illness</option>
              <option value="SAFETY">Safety</option>
              <option value="BEHAVIORAL">Behavioral</option>
              <option value="OTHER">Other</option>
            </select>
          </label>
          <label className="formField">
            <span>Severity</span>
            <select
              value={form.severity}
              onChange={(event) => update('severity', event.target.value as HealthIncidentSeverity)}
            >
              <option value="MINOR">Minor</option>
              <option value="MODERATE">Moderate</option>
              <option value="SERIOUS">Serious</option>
            </select>
          </label>
          <label className="formField">
            <span>Location</span>
            <input
              required
              maxLength={200}
              value={form.location}
              onChange={(event) => update('location', event.target.value)}
            />
          </label>
          <label className="formField">
            <span>Guardian notification</span>
            <select
              value={form.guardian_notification_status}
              onChange={(event) =>
                update(
                  'guardian_notification_status',
                  event.target.value as GuardianNotificationStatus,
                )
              }
            >
              <option value="PENDING">Pending</option>
              <option value="NOTIFIED">Notified</option>
              <option value="NOT_REQUIRED">Not required</option>
            </select>
          </label>
          {form.guardian_notification_status === 'NOTIFIED' && (
            <>
              <label className="formField">
                <span>Guardian notified</span>
                <input
                  required
                  maxLength={200}
                  value={form.guardian_notified_to}
                  onChange={(event) => update('guardian_notified_to', event.target.value)}
                />
              </label>
              <label className="formField">
                <span>Guardian notified at</span>
                <input
                  required
                  type="datetime-local"
                  value={form.guardian_notified_at}
                  onChange={(event) => update('guardian_notified_at', event.target.value)}
                />
              </label>
            </>
          )}
          <label className="formField incidentNarrativeField">
            <span>What happened</span>
            <textarea
              required
              maxLength={4000}
              value={form.summary}
              onChange={(event) => update('summary', event.target.value)}
            />
          </label>
          <label className="formField incidentNarrativeField">
            <span>Care or immediate action</span>
            <textarea
              maxLength={4000}
              value={form.care_given}
              onChange={(event) => update('care_given', event.target.value)}
            />
          </label>
          <button className="buttonPrimary" disabled={busy} type="submit">
            <ClipboardPlus size={16} aria-hidden="true" />
            {busy ? 'Recording…' : 'Record incident'}
          </button>
        </form>
      </section>

      <div className="incidentCenterGrid">
        <section className="contentSection incidentList" aria-labelledby="incident-list-heading">
          <div className="sectionHeader">
            <div>
              <p className="contextLabel">Restricted timeline</p>
              <h2 id="incident-list-heading">Incident log</h2>
            </div>
            <span className="statusBadge">{visibleIncidents.length} incidents</span>
          </div>
          <div className="incidentFilters">
            <label className="formField">
              <span>Find an incident</span>
              <input
                type="search"
                placeholder="Camper, session, type, or severity"
                value={search}
                onChange={(event) => setSearch(event.target.value)}
              />
            </label>
            <label className="formField">
              <span>Status</span>
              <select
                value={statusFilter}
                onChange={(event) =>
                  setStatusFilter(event.target.value as 'ALL' | 'OPEN' | 'RESOLVED')
                }
              >
                <option value="ALL">All</option>
                <option value="OPEN">Open</option>
                <option value="RESOLVED">Resolved</option>
              </select>
            </label>
          </div>
          {visibleIncidents.length === 0 ? (
            <p>No incidents match these filters.</p>
          ) : (
            <div className="incidentSummaryStack">
              {visibleIncidents.map((incident) => (
                <button
                  className={`incidentSummaryButton${selected?.id === incident.id ? ' selected' : ''}`}
                  key={incident.id}
                  type="button"
                  onClick={() => void openIncident(incident)}
                >
                  <span>
                    <strong>{incident.camper_name}</strong>
                    <small>{incident.session_name}</small>
                  </span>
                  <span className={`statusBadge status-${incident.status.toLowerCase()}`}>
                    {label(incident.status)}
                  </span>
                  <small>
                    {label(incident.incident_type)} · {label(incident.severity)} ·{' '}
                    {dateTime(incident.occurred_at, initialCenter.timezone)}
                  </small>
                </button>
              ))}
            </div>
          )}
        </section>

        <section className="contentSection incidentDetail" id="incident-detail" aria-live="polite">
          {!selected ? (
            <div className="healthEmptySelection">
              <FileWarning size={32} aria-hidden="true" />
              <h2>Select an incident</h2>
              <p>Encrypted narrative and timeline entries load only after the record is opened.</p>
            </div>
          ) : (
            <>
              <div className="sectionHeader">
                <div>
                  <p className="contextLabel">{selected.session_name}</p>
                  <h2>{selected.camper_name}</h2>
                </div>
                <span className={`statusBadge status-${selected.status.toLowerCase()}`}>
                  {label(selected.status)}
                </span>
              </div>
              <dl className="incidentMetadata">
                <div>
                  <dt>Occurred</dt>
                  <dd>{dateTime(selected.occurred_at, initialCenter.timezone)}</dd>
                </div>
                <div>
                  <dt>Type / severity</dt>
                  <dd>
                    {label(selected.incident_type)} / {label(selected.severity)}
                  </dd>
                </div>
                <div>
                  <dt>Location</dt>
                  <dd>{selected.location}</dd>
                </div>
                <div>
                  <dt>Guardian</dt>
                  <dd>{label(selected.guardian_notification_status)}</dd>
                </div>
              </dl>
              <div className="incidentNarrative">
                <h3>What happened</h3>
                <p>{selected.summary}</p>
                <h3>Care or immediate action</h3>
                <p>{selected.care_given || 'No care details recorded.'}</p>
                {selected.guardian_notification_status === 'NOTIFIED' && (
                  <>
                    <h3>Guardian notification</h3>
                    <p>
                      {selected.guardian_notified_to} ·{' '}
                      {selected.guardian_notified_at
                        ? dateTime(selected.guardian_notified_at, initialCenter.timezone)
                        : 'Time not recorded'}
                    </p>
                  </>
                )}
              </div>
              <div className="incidentTimeline">
                <h3>Append-only timeline</h3>
                {selected.entries.length === 0 ? (
                  <p>No follow-up entries yet.</p>
                ) : (
                  <ol>
                    {selected.entries.map((entry) => (
                      <li key={entry.id}>
                        <span className="statusBadge">{label(entry.entry_type)}</span>
                        {entry.note && <p>{entry.note}</p>}
                        {entry.entry_type === 'GUARDIAN_NOTIFICATION' && (
                          <p>
                            {entry.guardian_notified_to} ·{' '}
                            {entry.guardian_notified_at
                              ? dateTime(entry.guardian_notified_at, initialCenter.timezone)
                              : 'Time not recorded'}
                          </p>
                        )}
                        <small>
                          {dateTime(entry.created_at, initialCenter.timezone)} · {entry.created_by}
                        </small>
                      </li>
                    ))}
                  </ol>
                )}
              </div>
              {selected.status === 'OPEN' && (
                <div className="incidentActions">
                  {selected.guardian_notification_status === 'PENDING' && (
                    <div className="incidentGuardianAction">
                      <h3>Complete guardian notification</h3>
                      <div className="incidentGuardianFields">
                        <label className="formField">
                          <span>Guardian notified</span>
                          <input
                            maxLength={200}
                            value={guardianName}
                            onChange={(event) => setGuardianName(event.target.value)}
                          />
                        </label>
                        <label className="formField">
                          <span>Guardian notified at</span>
                          <input
                            type="datetime-local"
                            value={guardianNotifiedAt}
                            onChange={(event) => setGuardianNotifiedAt(event.target.value)}
                          />
                        </label>
                        <label className="formField incidentGuardianNote">
                          <span>Notification note</span>
                          <textarea
                            maxLength={4000}
                            value={guardianNote}
                            onChange={(event) => setGuardianNote(event.target.value)}
                          />
                        </label>
                      </div>
                      <button
                        className="buttonSecondary"
                        disabled={busy || !guardianName.trim() || !guardianNotifiedAt}
                        type="button"
                        onClick={() => void recordGuardianNotification()}
                      >
                        <MessageSquarePlus size={16} aria-hidden="true" /> Record notification
                      </button>
                    </div>
                  )}
                  <label className="formField">
                    <span>Follow-up note</span>
                    <textarea
                      maxLength={4000}
                      value={followUp}
                      onChange={(event) => setFollowUp(event.target.value)}
                    />
                  </label>
                  <button
                    className="buttonSecondary"
                    disabled={busy || !followUp.trim()}
                    type="button"
                    onClick={() => void addNote()}
                  >
                    <MessageSquarePlus size={16} aria-hidden="true" /> Add follow-up
                  </button>
                  <label className="formField">
                    <span>Resolution</span>
                    <textarea
                      maxLength={4000}
                      value={resolution}
                      onChange={(event) => setResolution(event.target.value)}
                    />
                  </label>
                  <button
                    className="buttonPrimary"
                    disabled={busy || !resolution.trim()}
                    type="button"
                    onClick={() => void resolveIncident()}
                  >
                    <CheckCircle2 size={16} aria-hidden="true" /> Resolve incident
                  </button>
                </div>
              )}
            </>
          )}
        </section>
      </div>
    </div>
  );
}
