'use client';

import type {
  OperationalReportCenter,
  OperationalReportDefaultFormat,
  OperationalReportFilters,
  OperationalReportPreset,
  OperationalReportPreview,
  OperationalReportView,
  ProblemResponse,
  SessionSummary,
} from '@camp-registration/contracts';
import {
  ClipboardCheck,
  ContactRound,
  Download,
  FileSpreadsheet,
  ListChecks,
  Printer,
  Save,
  Tags,
  Trash2,
  Users,
  WalletCards,
} from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useMemo, useState, type FormEvent } from 'react';

const presets: Array<{
  description: string;
  icon: typeof Users;
  label: string;
  value: OperationalReportPreset;
}> = [
  {
    description: 'Registration, payment, readiness projection, and session columns across camps.',
    icon: Users,
    label: 'Cross-session roster',
    value: 'SESSION_ROSTER',
  },
  {
    description: 'Confirmed campers with arrival, departure, pickup, and attendance columns.',
    icon: ClipboardCheck,
    label: 'Check-in sheet',
    value: 'CHECK_IN_SHEET',
  },
  {
    description: 'Family adults, email, phone, and emergency-contact details.',
    icon: ContactRound,
    label: 'Contact list',
    value: 'CONTACT_LIST',
  },
  {
    description: 'Confirmed registrations with an amount still due.',
    icon: WalletCards,
    label: 'Balances due',
    value: 'BALANCE_DUE',
  },
  {
    description: 'Waitlisted campers and the operational family contacts for each registration.',
    icon: Users,
    label: 'Waitlist',
    value: 'WAITLIST',
  },
  {
    description: 'Assigned, submitted, and missing forms without exposing response content.',
    icon: ListChecks,
    label: 'Form readiness',
    value: 'READINESS',
  },
  {
    description: 'Latest attendance state, timestamps, pickup, and staff note.',
    icon: ClipboardCheck,
    label: 'Attendance activity',
    value: 'ATTENDANCE',
  },
  {
    description: 'Print-oriented authorized-pickup and emergency-contact sheet.',
    icon: Printer,
    label: 'Pickup sheet',
    value: 'PICKUP_SHEET',
  },
  {
    description: 'Compact printable cards for confirmed campers and their sessions.',
    icon: Tags,
    label: 'Camper labels',
    value: 'CAMPER_LABELS',
  },
];

const emptyFilters: OperationalReportFilters = {
  end_date: null,
  registration_status: 'ALL',
  session_ids: [],
  start_date: null,
};

async function request(path: string, init: RequestInit): Promise<Response> {
  const response = await fetch(path, {
    ...init,
    headers: { 'content-type': 'application/json', ...init.headers },
  });
  if (!response.ok) {
    const problem = (await response.json().catch(() => null)) as ProblemResponse | null;
    throw new Error(problem?.message ?? 'The reporting request failed.');
  }
  return response;
}

function exportHref(
  preset: OperationalReportPreset,
  format: Exclude<OperationalReportDefaultFormat, 'PRINT'>,
  filters: OperationalReportFilters,
): string {
  const query = new URLSearchParams({ format, preset });
  if (filters.session_ids.length) query.set('session_ids', filters.session_ids.join(','));
  if (filters.start_date) query.set('start_date', filters.start_date);
  if (filters.end_date) query.set('end_date', filters.end_date);
  if (filters.registration_status !== 'ALL') {
    query.set('registration_status', filters.registration_status);
  }
  return `/api/v1/reports/export?${query}`;
}

export function ReportWorkspace({
  initialCenter,
  sessions,
}: {
  initialCenter: OperationalReportCenter;
  sessions: SessionSummary[];
}) {
  const router = useRouter();
  const [preset, setPreset] = useState<OperationalReportPreset>('SESSION_ROSTER');
  const [format, setFormat] = useState<OperationalReportDefaultFormat>('CSV');
  const [filters, setFilters] = useState<OperationalReportFilters>(emptyFilters);
  const [preview, setPreview] = useState<OperationalReportPreview | null>(null);
  const [previewBusy, setPreviewBusy] = useState(false);
  const [savedViewId, setSavedViewId] = useState('');
  const [viewName, setViewName] = useState('');
  const [viewBusy, setViewBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const selectedPreset = presets.find((option) => option.value === preset) ?? presets[0]!;
  const selectedView = useMemo(
    () => initialCenter.saved_views.find((view) => view.id === savedViewId),
    [initialCenter.saved_views, savedViewId],
  );

  function updateFilters(update: Partial<OperationalReportFilters>) {
    setFilters((current) => ({ ...current, ...update }));
    setPreview(null);
  }

  function toggleSession(sessionId: string) {
    updateFilters({
      session_ids: filters.session_ids.includes(sessionId)
        ? filters.session_ids.filter((id) => id !== sessionId)
        : [...filters.session_ids, sessionId],
    });
  }

  function applyView(view: OperationalReportView) {
    setSavedViewId(view.id);
    setViewName(view.name);
    setPreset(view.preset);
    setFormat(view.default_format);
    setFilters(view.filters);
    setPreview(null);
    setMessage(`Loaded “${view.name}”.`);
  }

  async function loadPreview() {
    setPreviewBusy(true);
    setMessage(null);
    try {
      const response = await request('/api/v1/reports/preview', {
        body: JSON.stringify({ filters, full: format === 'PRINT', preset }),
        method: 'POST',
      });
      const result = (await response.json()) as OperationalReportPreview;
      setPreview(result);
      setMessage(`${result.row_count} report rows currently match.`);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Report preview failed.');
    } finally {
      setPreviewBusy(false);
    }
  }

  async function saveView(event: FormEvent) {
    event.preventDefault();
    setViewBusy(true);
    setMessage(null);
    try {
      const response = await request('/api/v1/reports/views', {
        body: JSON.stringify({ default_format: format, filters, name: viewName, preset }),
        method: 'POST',
      });
      const created = (await response.json()) as OperationalReportView;
      setSavedViewId(created.id);
      setMessage('Saved report view created.');
      router.refresh();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Saved view could not be created.');
    } finally {
      setViewBusy(false);
    }
  }

  async function updateView() {
    if (!selectedView) return;
    setViewBusy(true);
    setMessage(null);
    try {
      await request(`/api/v1/reports/views/${selectedView.id}`, {
        body: JSON.stringify({
          default_format: format,
          filters,
          name: viewName,
          preset,
          version: selectedView.version,
        }),
        method: 'PATCH',
      });
      setMessage('Saved report view updated.');
      router.refresh();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Saved view could not be updated.');
    } finally {
      setViewBusy(false);
    }
  }

  async function deleteView() {
    if (!selectedView) return;
    setViewBusy(true);
    setMessage(null);
    try {
      await request(`/api/v1/reports/views/${selectedView.id}`, { method: 'DELETE' });
      setSavedViewId('');
      setViewName('');
      setMessage('Saved report view deleted.');
      router.refresh();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Saved view could not be deleted.');
    } finally {
      setViewBusy(false);
    }
  }

  return (
    <div className="reportingCenter">
      <section className="contentSection savedReportViews" aria-labelledby="saved-reports-heading">
        <div className="sectionHeading">
          <div>
            <h2 id="saved-reports-heading">Saved views</h2>
            <p className="sectionDescription">
              Reuse tenant-scoped session, date, status, preset, and output choices.
            </p>
          </div>
        </div>
        {initialCenter.saved_views.length === 0 ? (
          <p className="emptyStateText">No report views have been saved yet.</p>
        ) : (
          <div className="savedReportGrid">
            {initialCenter.saved_views.map((view) => (
              <button
                aria-pressed={savedViewId === view.id}
                className="savedReportCard"
                key={view.id}
                onClick={() => applyView(view)}
                type="button"
              >
                <strong>{view.name}</strong>
                <span>
                  {presets.find((option) => option.value === view.preset)?.label} ·{' '}
                  {view.default_format}
                </span>
              </button>
            ))}
          </div>
        )}
      </section>

      <section
        className="contentSection reportWorkspace reportBuilder"
        aria-labelledby="report-builder-heading"
      >
        <div className="sectionHeading">
          <div>
            <h2 id="report-builder-heading">Build an operational report</h2>
            <p className="sectionDescription">
              Preview live tenant data, export CSV or native Excel, or prepare a print layout.
            </p>
          </div>
        </div>

        <div className="reportPresetGrid" aria-label="Available report presets">
          {presets.map(({ description, icon: Icon, label, value }) => (
            <button
              aria-pressed={preset === value}
              className={`reportPresetCard${preset === value ? ' reportPresetCardSelected' : ''}`}
              key={value}
              onClick={() => {
                setPreset(value);
                setPreview(null);
              }}
              type="button"
            >
              <span className="reportPresetIcon">
                <Icon size={20} aria-hidden="true" />
              </span>
              <span>
                <strong>{label}</strong>
                <small>{description}</small>
              </span>
            </button>
          ))}
        </div>

        <div className="reportFilterGrid">
          <label className="formField">
            <span>Registration status</span>
            <select
              value={filters.registration_status}
              onChange={(event) =>
                updateFilters({
                  registration_status: event.target
                    .value as OperationalReportFilters['registration_status'],
                })
              }
            >
              <option value="ALL">All statuses</option>
              <option value="CONFIRMED">Confirmed</option>
              <option value="WAITLISTED">Waitlisted</option>
              <option value="CANCELLED">Cancelled</option>
            </select>
          </label>
          <label className="formField">
            <span>Sessions starting on or after</span>
            <input
              type="date"
              value={filters.start_date ?? ''}
              onChange={(event) => updateFilters({ start_date: event.target.value || null })}
            />
          </label>
          <label className="formField">
            <span>Sessions starting on or before</span>
            <input
              type="date"
              value={filters.end_date ?? ''}
              onChange={(event) => updateFilters({ end_date: event.target.value || null })}
            />
          </label>
          <label className="formField">
            <span>Output</span>
            <select
              value={format}
              onChange={(event) => setFormat(event.target.value as OperationalReportDefaultFormat)}
            >
              <option value="CSV">CSV</option>
              <option value="XLSX">Excel workbook (.xlsx)</option>
              <option value="PRINT">Print layout</option>
            </select>
          </label>
        </div>

        <fieldset className="reportSessionFilter">
          <legend>Sessions</legend>
          <div className="reportSessionChoices">
            {sessions.map((session) => (
              <label key={session.id}>
                <input
                  checked={filters.session_ids.includes(session.id)}
                  onChange={() => toggleSession(session.id)}
                  type="checkbox"
                />
                <span>{session.name}</span>
                <small>{session.starts_on}</small>
              </label>
            ))}
          </div>
          <p>
            {filters.session_ids.length ? `${filters.session_ids.length} selected` : 'All sessions'}
          </p>
        </fieldset>

        <div className="reportActions">
          <button
            className="buttonSecondary"
            disabled={previewBusy}
            onClick={() => void loadPreview()}
            type="button"
          >
            <FileSpreadsheet size={17} aria-hidden="true" />
            {previewBusy ? 'Loading preview…' : 'Preview report'}
          </button>
          {format === 'PRINT' ? (
            <button
              className="buttonPrimary"
              disabled={!preview}
              onClick={() => window.print()}
              type="button"
            >
              <Printer size={17} aria-hidden="true" /> Print preview
            </button>
          ) : (
            <a className="buttonPrimary" download href={exportHref(preset, format, filters)}>
              <Download size={17} aria-hidden="true" /> Download {format}
            </a>
          )}
        </div>

        <form className="reportSaveForm" onSubmit={saveView}>
          <label className="formField">
            <span>Saved view name</span>
            <input
              maxLength={120}
              onChange={(event) => setViewName(event.target.value)}
              placeholder="Example: Next 30 days — readiness"
              required
              value={viewName}
            />
          </label>
          <button className="buttonSecondary" disabled={viewBusy} type="submit">
            <Save size={17} aria-hidden="true" /> Save as new
          </button>
          {selectedView?.can_edit ? (
            <>
              <button
                className="buttonSecondary"
                disabled={viewBusy}
                onClick={() => void updateView()}
                type="button"
              >
                Update view
              </button>
              <button
                className="dangerButton"
                disabled={viewBusy}
                onClick={() => void deleteView()}
                type="button"
              >
                <Trash2 size={17} aria-hidden="true" /> Delete
              </button>
            </>
          ) : null}
        </form>

        <p className="reportSelectionSummary" aria-live="polite">
          <strong>{selectedPreset.label}</strong> ·{' '}
          {message ?? 'Preview to confirm the live row count.'}
        </p>
      </section>

      <section className="contentSection reportPreview" aria-labelledby="report-preview-heading">
        <div className="sectionHeading">
          <div>
            <p className="contextLabel">Private operational data</p>
            <h2 id="report-preview-heading">{preview?.title ?? 'Report preview'}</h2>
            <p className="sectionDescription">
              {preview
                ? `${preview.row_count} matching rows${preview.truncated ? '; preview limited to 100' : ''}.`
                : 'Generate a preview to inspect printable and exported columns.'}
            </p>
          </div>
        </div>
        {!preview ? (
          <p className="emptyStateText">No preview loaded.</p>
        ) : preset === 'CAMPER_LABELS' ? (
          <div className="reportLabelGrid">
            {preview.rows.map((row, index) => (
              <article className="reportLabel" key={index}>
                <strong>{row.camper}</strong>
                {row.preferred_name ? <span>Goes by {row.preferred_name}</span> : null}
                <span>{row.session}</span>
                <small>{row.session_dates}</small>
                <small>{row.family} family</small>
              </article>
            ))}
          </div>
        ) : (
          <div className="reportPreviewTableWrap">
            <table className="dataTable reportPreviewTable">
              <thead>
                <tr>
                  {preview.columns.map((column) => (
                    <th key={column.key} scope="col">
                      {column.label}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {preview.rows.map((row, index) => (
                  <tr key={index}>
                    {preview.columns.map((column) => (
                      <td key={column.key}>{row[column.key] ?? '—'}</td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}
