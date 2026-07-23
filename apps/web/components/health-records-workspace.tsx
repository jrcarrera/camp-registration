'use client';

import type {
  HealthDocumentReference,
  HealthRecord,
  HealthRecordCenter,
  HealthRecordSummary,
  ImmunizationStatus,
  ProblemResponse,
} from '@camp-registration/contracts';
import {
  AlertTriangle,
  CheckCircle2,
  Download,
  FileHeart,
  LockKeyhole,
  Save,
  Send,
  ShieldCheck,
} from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useMemo, useState, type FormEvent } from 'react';

interface Props {
  initialCenter: HealthRecordCenter;
  mode: 'parent' | 'staff';
  requestHeaders: Record<string, string>;
}

interface FormState {
  accessibility_needs: string;
  allergies: string;
  dietary_needs: string;
  documents: string;
  emergency_instructions: string;
  immunization_notes: string;
  immunization_status: ImmunizationStatus;
  medications: string;
}

const emptyForm: FormState = {
  accessibility_needs: '',
  allergies: '',
  dietary_needs: '',
  documents: '',
  emergency_instructions: '',
  immunization_notes: '',
  immunization_status: 'UNKNOWN',
  medications: '',
};

function lines(value: string): string[] {
  return value
    .split(/\r?\n/)
    .map((item) => item.trim())
    .filter(Boolean);
}

function documents(value: string): HealthDocumentReference[] {
  return lines(value).map((line) => {
    const [rawType, rawLabel, ...reference] = line.split('|');
    if (!rawLabel?.trim() || !reference.join('|').trim()) {
      throw new Error('Document references need a type, label, and private storage reference.');
    }
    const type = ['IMMUNIZATION', 'CARE_PLAN', 'MEDICATION_ORDER', 'OTHER'].includes(
      rawType?.trim().toUpperCase() ?? '',
    )
      ? ((rawType ?? '').trim().toUpperCase() as HealthDocumentReference['type'])
      : 'OTHER';
    return {
      label: rawLabel.trim(),
      storage_reference: reference.join('|').trim(),
      type,
    };
  });
}

function formFrom(record: HealthRecord): FormState {
  return {
    accessibility_needs: record.accessibility_needs.join('\n'),
    allergies: record.allergies.join('\n'),
    dietary_needs: record.dietary_needs.join('\n'),
    documents: record.document_references
      .map((document) => `${document.type}|${document.label}|${document.storage_reference}`)
      .join('\n'),
    emergency_instructions: record.emergency_instructions,
    immunization_notes: record.immunization_notes,
    immunization_status: record.immunization_status,
    medications: record.medications.join('\n'),
  };
}

function statusLabel(status: HealthRecordSummary['review_status']): string {
  return status.toLowerCase().replaceAll('_', ' ');
}

async function jsonRequest<T>(
  path: string,
  requestHeaders: Record<string, string>,
  init: RequestInit = {},
): Promise<T> {
  const response = await fetch(path, {
    ...init,
    cache: 'no-store',
    headers: { ...requestHeaders, ...(init.body ? { 'content-type': 'application/json' } : {}) },
  });
  if (!response.ok) {
    const problem = (await response.json().catch(() => null)) as ProblemResponse | null;
    throw new Error(problem?.message ?? 'The restricted health request failed.');
  }
  return (await response.json()) as T;
}

export function HealthRecordsWorkspace({ initialCenter, mode, requestHeaders }: Props) {
  const router = useRouter();
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [record, setRecord] = useState<HealthRecord | null>(null);
  const [form, setForm] = useState<FormState>(emptyForm);
  const [reviewMessage, setReviewMessage] = useState('');
  const [search, setSearch] = useState('');
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [tone, setTone] = useState<'error' | 'success'>('success');
  const selectedSummary = useMemo(
    () => initialCenter.records.find((item) => item.camper_id === selectedId) ?? null,
    [initialCenter.records, selectedId],
  );
  const filteredRecords = useMemo(() => {
    const query = search.trim().toLowerCase();
    if (!query) return initialCenter.records;
    return initialCenter.records.filter((item) =>
      `${item.camper_name} ${item.family_name} ${item.session_names.join(' ')}`
        .toLowerCase()
        .includes(query),
    );
  }, [initialCenter.records, search]);
  const visibleRecords = filteredRecords.slice(0, 30);

  function focusEditor() {
    requestAnimationFrame(() => {
      document.getElementById('health-record-editor')?.scrollIntoView({
        behavior: 'smooth',
        block: 'start',
      });
    });
  }

  async function select(summary: HealthRecordSummary) {
    setSelectedId(summary.camper_id);
    setMessage(null);
    focusEditor();
    if (!summary.record_id) {
      setRecord(null);
      setForm(emptyForm);
      return;
    }
    setBusy(true);
    try {
      const loaded = await jsonRequest<HealthRecord>(
        `/api/v1/health-records/campers/${summary.camper_id}`,
        requestHeaders,
      );
      setRecord(loaded);
      setForm(formFrom(loaded));
      setReviewMessage(loaded.review_message);
    } catch (error) {
      setTone('error');
      setMessage(error instanceof Error ? error.message : 'Health record could not be opened.');
    } finally {
      setBusy(false);
    }
  }

  function update<K extends keyof FormState>(key: K, value: FormState[K]) {
    setForm((current) => ({ ...current, [key]: value }));
  }

  async function save(event: FormEvent) {
    event.preventDefault();
    if (!selectedId) return;
    setBusy(true);
    setMessage(null);
    try {
      const saved = await jsonRequest<HealthRecord>(
        `/api/v1/health-records/campers/${selectedId}`,
        requestHeaders,
        {
          body: JSON.stringify({
            accessibility_needs: lines(form.accessibility_needs),
            allergies: lines(form.allergies),
            dietary_needs: lines(form.dietary_needs),
            document_references: documents(form.documents),
            emergency_instructions: form.emergency_instructions,
            immunization_notes: form.immunization_notes,
            immunization_status: form.immunization_status,
            medications: lines(form.medications),
            ...(record ? { version: record.version } : {}),
          }),
          method: 'PUT',
        },
      );
      setRecord(saved);
      setForm(formFrom(saved));
      setTone('success');
      setMessage('Protected health record saved as a draft.');
      router.refresh();
    } catch (error) {
      setTone('error');
      setMessage(error instanceof Error ? error.message : 'Health record could not be saved.');
    } finally {
      setBusy(false);
    }
  }

  async function submit() {
    if (!selectedId || !record) return;
    setBusy(true);
    try {
      const submitted = await jsonRequest<HealthRecord>(
        `/api/v1/health-records/campers/${selectedId}/submit`,
        requestHeaders,
        { body: JSON.stringify({ version: record.version }), method: 'POST' },
      );
      setRecord(submitted);
      setTone('success');
      setMessage('Health record submitted for pre-arrival review.');
      router.refresh();
    } catch (error) {
      setTone('error');
      setMessage(error instanceof Error ? error.message : 'Health record could not be submitted.');
    } finally {
      setBusy(false);
    }
  }

  async function review(status: 'APPROVED' | 'NEEDS_CHANGES') {
    if (!selectedId || !record) return;
    setBusy(true);
    try {
      const reviewed = await jsonRequest<HealthRecord>(
        `/api/v1/health-records/campers/${selectedId}/review`,
        requestHeaders,
        {
          body: JSON.stringify({
            review_message: reviewMessage,
            status,
            version: record.version,
          }),
          method: 'POST',
        },
      );
      setRecord(reviewed);
      setTone('success');
      setMessage(status === 'APPROVED' ? 'Health record approved.' : 'Changes requested.');
      router.refresh();
    } catch (error) {
      setTone('error');
      setMessage(error instanceof Error ? error.message : 'Review could not be saved.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="healthWorkspace">
      <section className="contentSection healthPrivacyNotice" aria-label="Restricted data notice">
        <LockKeyhole size={20} aria-hidden="true" />
        <div>
          <strong>Restricted health data</strong>
          <p>
            Records are encrypted separately. Opening, changing, reviewing, and exporting them is
            audited. Do not enter government, insurance, or payment identifiers.
          </p>
        </div>
        {mode === 'staff' && (
          <a className="buttonSecondary" href="/api/v1/health-records/export">
            <Download size={16} aria-hidden="true" /> Restricted CSV
          </a>
        )}
      </section>

      <div className="healthWorkspaceGrid">
        <section className="contentSection healthRecordList" aria-labelledby="health-list-heading">
          <div className="sectionHeader">
            <div>
              <p className="contextLabel">{mode === 'staff' ? 'Review queue' : 'My campers'}</p>
              <h2 id="health-list-heading">Health readiness</h2>
            </div>
            <span className="statusBadge">{initialCenter.records.length} campers</span>
          </div>
          <label className="formField healthSearchField">
            <span>Find a camper</span>
            <input
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Search camper, family, or session"
              type="search"
              value={search}
            />
          </label>
          {initialCenter.records.length === 0 ? (
            <p>No campers are available for this account.</p>
          ) : (
            <div className="healthSummaryStack">
              {visibleRecords.map((summary) => (
                <button
                  className={`healthSummaryButton${selectedId === summary.camper_id ? ' selected' : ''}`}
                  key={summary.camper_id}
                  onClick={() => void select(summary)}
                  type="button"
                >
                  <span>
                    <strong>{summary.camper_name}</strong>
                    <small>{summary.family_name}</small>
                  </span>
                  <span className={`statusBadge status-${summary.review_status.toLowerCase()}`}>
                    {statusLabel(summary.review_status)}
                  </span>
                  <small>
                    {[
                      summary.has_allergies && 'Allergies',
                      summary.has_medications && 'Medications',
                      summary.has_emergency_instructions && 'Instructions',
                    ]
                      .filter(Boolean)
                      .join(' · ') || 'No clinical flags'}
                  </small>
                </button>
              ))}
              {filteredRecords.length > visibleRecords.length && (
                <p className="healthListLimit">
                  Showing the first {visibleRecords.length} matches. Refine the search to find a
                  specific camper.
                </p>
              )}
            </div>
          )}
        </section>

        <section
          className="contentSection healthRecordEditor"
          id="health-record-editor"
          aria-live="polite"
        >
          {!selectedSummary ? (
            <div className="healthEmptySelection">
              <FileHeart size={32} aria-hidden="true" />
              <h2>Select a camper</h2>
              <p>Plaintext health details are only loaded after you open one record.</p>
            </div>
          ) : (
            <>
              <div className="sectionHeader">
                <div>
                  <p className="contextLabel">{selectedSummary.family_name}</p>
                  <h2>{selectedSummary.camper_name}</h2>
                </div>
                {record && (
                  <span className={`statusBadge status-${record.review_status.toLowerCase()}`}>
                    {statusLabel(record.review_status)}
                  </span>
                )}
              </div>

              {message && (
                <div className={`notice ${tone === 'error' ? 'noticeError' : 'noticeSuccess'}`}>
                  {tone === 'error' ? (
                    <AlertTriangle size={18} aria-hidden="true" />
                  ) : (
                    <CheckCircle2 size={18} aria-hidden="true" />
                  )}
                  {message}
                </div>
              )}

              <form onSubmit={save}>
                <div className="fieldGrid">
                  <label className="formField">
                    <span>Allergies</span>
                    <textarea
                      onChange={(event) => update('allergies', event.target.value)}
                      placeholder="One allergy per line"
                      value={form.allergies}
                    />
                  </label>
                  <label className="formField">
                    <span>Medications</span>
                    <textarea
                      onChange={(event) => update('medications', event.target.value)}
                      placeholder="One medication per line"
                      value={form.medications}
                    />
                  </label>
                  <label className="formField">
                    <span>Dietary needs</span>
                    <textarea
                      onChange={(event) => update('dietary_needs', event.target.value)}
                      placeholder="One need per line"
                      value={form.dietary_needs}
                    />
                  </label>
                  <label className="formField">
                    <span>Accessibility and support needs</span>
                    <textarea
                      onChange={(event) => update('accessibility_needs', event.target.value)}
                      placeholder="One need per line"
                      value={form.accessibility_needs}
                    />
                  </label>
                  <label className="formField">
                    <span>Immunization status</span>
                    <select
                      onChange={(event) =>
                        update('immunization_status', event.target.value as ImmunizationStatus)
                      }
                      value={form.immunization_status}
                    >
                      <option value="UNKNOWN">Not provided</option>
                      <option value="CURRENT">Current</option>
                      <option value="INCOMPLETE">Incomplete</option>
                      <option value="EXEMPT">Exempt</option>
                    </select>
                  </label>
                  <label className="formField">
                    <span>Immunization notes</span>
                    <textarea
                      onChange={(event) => update('immunization_notes', event.target.value)}
                      value={form.immunization_notes}
                    />
                  </label>
                </div>
                <label className="formField">
                  <span>Emergency and care instructions</span>
                  <textarea
                    onChange={(event) => update('emergency_instructions', event.target.value)}
                    value={form.emergency_instructions}
                  />
                </label>
                <label className="formField">
                  <span>Private document references</span>
                  <textarea
                    onChange={(event) => update('documents', event.target.value)}
                    placeholder="CARE_PLAN|Asthma plan|private/health/document-id"
                    value={form.documents}
                  />
                  <small>One per line: type | label | private storage reference</small>
                </label>
                <div className="inlineActions">
                  <button className="buttonPrimary" disabled={busy} type="submit">
                    <Save size={16} aria-hidden="true" /> {busy ? 'Saving…' : 'Save draft'}
                  </button>
                  {record && mode === 'parent' && (
                    <button
                      className="buttonSecondary"
                      disabled={busy}
                      onClick={() => void submit()}
                      type="button"
                    >
                      <Send size={16} aria-hidden="true" /> Submit for review
                    </button>
                  )}
                </div>
              </form>

              {record?.review_message && mode === 'parent' && (
                <div className="notice">
                  <ShieldCheck size={18} aria-hidden="true" />
                  <div>
                    <strong>Staff review</strong>
                    <p>{record.review_message}</p>
                  </div>
                </div>
              )}

              {record && mode === 'staff' && (
                <div className="healthReviewPanel">
                  <label className="formField">
                    <span>Parent-facing review message</span>
                    <textarea
                      onChange={(event) => setReviewMessage(event.target.value)}
                      value={reviewMessage}
                    />
                  </label>
                  <div className="inlineActions">
                    <button
                      className="buttonPrimary"
                      disabled={busy}
                      onClick={() => void review('APPROVED')}
                      type="button"
                    >
                      <CheckCircle2 size={16} aria-hidden="true" /> Approve
                    </button>
                    <button
                      className="buttonSecondary"
                      disabled={busy}
                      onClick={() => void review('NEEDS_CHANGES')}
                      type="button"
                    >
                      Request changes
                    </button>
                  </div>
                </div>
              )}
            </>
          )}
        </section>
      </div>
    </div>
  );
}
