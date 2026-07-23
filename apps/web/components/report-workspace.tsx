'use client';

import type { SessionReportPreset, SessionSummary } from '@camp-registration/contracts';
import { ClipboardCheck, Download, TableProperties } from 'lucide-react';
import { useMemo, useState } from 'react';

const presets: Array<{
  description: string;
  icon: typeof TableProperties;
  label: string;
  value: SessionReportPreset;
}> = [
  {
    description:
      'Registration, attendance, authorized pickup, payment status, and balance columns for every attending or waitlisted camper.',
    icon: TableProperties,
    label: 'Session roster',
    value: 'SESSION_ROSTER',
  },
  {
    description:
      'A focused arrival and departure sheet containing confirmed campers, attendance state, and authorized pickup names.',
    icon: ClipboardCheck,
    label: 'Check-in sheet',
    value: 'CHECK_IN_SHEET',
  },
];

export function ReportWorkspace({ sessions }: { sessions: SessionSummary[] }) {
  const [sessionId, setSessionId] = useState(sessions[0]?.id ?? '');
  const [preset, setPreset] = useState<SessionReportPreset>('SESSION_ROSTER');
  const selectedSession = useMemo(
    () => sessions.find((session) => session.id === sessionId),
    [sessionId, sessions],
  );
  const selectedPreset = presets.find((option) => option.value === preset) ?? presets[0]!;
  const downloadHref = sessionId
    ? `/api/v1/reports/sessions/${encodeURIComponent(sessionId)}/export?preset=${preset}`
    : '#';

  return (
    <section className="contentSection reportWorkspace" aria-labelledby="report-builder-heading">
      <div className="sectionHeading">
        <div>
          <h2 id="report-builder-heading">Create an export</h2>
          <p className="sectionDescription">
            Choose a repeatable preset and session. Downloads are tenant-scoped and recorded in the
            audit trail.
          </p>
        </div>
      </div>

      {sessions.length === 0 ? (
        <p className="emptyStateText">Create a session before exporting an operational report.</p>
      ) : (
        <>
          <div className="reportControls">
            <label className="formField">
              <span>Session</span>
              <select value={sessionId} onChange={(event) => setSessionId(event.target.value)}>
                {sessions.map((session) => (
                  <option key={session.id} value={session.id}>
                    {session.name} · {session.code} · {session.starts_on}
                  </option>
                ))}
              </select>
            </label>
            <label className="formField">
              <span>Report preset</span>
              <select
                value={preset}
                onChange={(event) => setPreset(event.target.value as SessionReportPreset)}
              >
                {presets.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </label>
            <a
              aria-disabled={!sessionId}
              className={`buttonPrimary${sessionId ? '' : ' disabledLink'}`}
              download
              href={downloadHref}
            >
              <Download size={17} aria-hidden="true" />
              Download CSV
            </a>
          </div>

          <div className="reportPresetGrid" aria-label="Available report presets">
            {presets.map(({ description, icon: Icon, label, value }) => (
              <button
                aria-pressed={preset === value}
                className={`reportPresetCard${preset === value ? ' reportPresetCardSelected' : ''}`}
                key={value}
                onClick={() => setPreset(value)}
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

          <p className="reportSelectionSummary" aria-live="polite">
            <strong>{selectedPreset.label}</strong> for{' '}
            <strong>{selectedSession?.name ?? 'the selected session'}</strong> will export as UTF-8
            CSV for Excel, Numbers, or Google Sheets.
          </p>
        </>
      )}
    </section>
  );
}
