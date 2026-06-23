import type { SessionSummary } from '@camp-registration/contracts';
import { AlertCircle, CheckCircle2 } from 'lucide-react';

import { SessionTable } from '../components/session-table';
import { getCatalog, getSessions } from '../lib/api';

export const dynamic = 'force-dynamic';

export default async function HomePage() {
  let sessions: SessionSummary[] = [];
  let seasonName = 'Summer 2027';
  let loadError = false;

  try {
    const [catalog, response] = await Promise.all([getCatalog(), getSessions()]);
    sessions = response.sessions;
    seasonName = catalog.seasons[0]?.name ?? seasonName;
  } catch {
    loadError = true;
  }

  const metrics = [
    {
      label: 'Registered campers',
      tone: 'green',
      value: String(sessions.reduce((total, session) => total + session.registered_count, 0)),
    },
    {
      label: 'Published sessions',
      tone: 'blue',
      value: String(sessions.filter(({ status }) => status === 'PUBLISHED').length),
    },
    { label: 'Forms incomplete', tone: 'amber', value: '0' },
    { label: 'Balances due', tone: 'coral', value: '$0' },
  ];

  return (
    <>
      <header className="topbar">
        <div>
          <p className="contextLabel">Organization workspace</p>
          <h1>Camp Registration</h1>
        </div>
        <label className="seasonControl">
          <span>Season</span>
          <select defaultValue="active" aria-label="Active season">
            <option value="active">{seasonName}</option>
          </select>
        </label>
      </header>

      <section className="metricStrip" aria-label="Registration summary">
        {metrics.map((metric) => (
          <div className="metric" key={metric.label}>
            <span className={`metricAccent ${metric.tone}`} aria-hidden="true" />
            <div>
              <strong>{metric.value}</strong>
              <span>{metric.label}</span>
            </div>
          </div>
        ))}
      </section>

      <section className="contentSection" id="sessions">
        <div className="sectionHeading">
          <div>
            <p className="contextLabel">Current season</p>
            <h2>Sessions</h2>
          </div>
          <div className={`systemStatus${loadError ? ' systemStatusError' : ''}`} role="status">
            {loadError ? (
              <>
                <AlertCircle size={17} aria-hidden="true" />
                Session data unavailable
              </>
            ) : (
              <>
                <CheckCircle2 size={17} aria-hidden="true" />
                Local system ready
              </>
            )}
          </div>
        </div>

        <SessionTable sessions={sessions} />
      </section>

      <section className="operationalGrid" aria-label="Operational queues">
        <div className="queueSection" id="campers">
          <p className="contextLabel">Enrollment</p>
          <h2>Registration queue</h2>
          <p>No registrations require review.</p>
        </div>
        <div className="queueSection" id="health">
          <p className="contextLabel">Restricted access</p>
          <h2>Health forms</h2>
          <p>No health forms require review.</p>
        </div>
      </section>
    </>
  );
}
