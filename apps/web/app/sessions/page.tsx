import type { SessionSummary } from '@camp-registration/contracts';
import { AlertCircle, Plus } from 'lucide-react';
import Link from 'next/link';

import { SessionTable } from '../../components/session-table';
import { getCatalog, getSessions } from '../../lib/api';

export const dynamic = 'force-dynamic';

export default async function SessionsPage() {
  let sessions: SessionSummary[] = [];
  let seasonName = 'Summer 2027';
  let errorMessage: string | null = null;

  try {
    const [catalog, response] = await Promise.all([getCatalog(), getSessions()]);
    sessions = response.sessions;
    seasonName = catalog.seasons[0]?.name ?? seasonName;
  } catch {
    errorMessage = 'Session data could not be loaded. Confirm that the local API is running.';
  }

  const scheduledSessions = sessions.filter(
    (session) => session.status !== 'CANCELLED' && session.status !== 'ARCHIVED',
  );
  const statusCounts = {
    archived: sessions.filter((session) => session.status === 'ARCHIVED').length,
    cancelled: sessions.filter((session) => session.status === 'CANCELLED').length,
    draft: sessions.filter((session) => session.status === 'DRAFT').length,
    published: sessions.filter((session) => session.status === 'PUBLISHED').length,
  };

  return (
    <>
      <header className="pageHeader">
        <div>
          <p className="contextLabel">Catalog management</p>
          <h1>Sessions</h1>
          <p className="pageDescription">
            Review dates, enrollment, capacity, and publication status.
          </p>
        </div>
        <div className="headerActions">
          <label className="seasonControl">
            <span>Season</span>
            <select defaultValue="active" aria-label="Active season">
              <option value="active">{seasonName}</option>
            </select>
          </label>
          <Link className="buttonPrimary" href="/sessions/new">
            <Plus size={17} aria-hidden="true" />
            Add session
          </Link>
        </div>
      </header>

      {errorMessage && (
        <div className="notice noticeError" role="alert">
          <AlertCircle size={18} aria-hidden="true" />
          {errorMessage}
        </div>
      )}

      <section className="contentSection sessionsManagement" aria-label="Camp sessions">
        <div className="listSummary">
          <strong>{scheduledSessions.length} scheduled weeks</strong>
          <span>
            {scheduledSessions.reduce((total, session) => total + session.capacity, 0)} scheduled
            spaces
          </span>
          <span>{statusCounts.published} published</span>
          <span>{statusCounts.draft} draft</span>
          {statusCounts.cancelled > 0 && <span>{statusCounts.cancelled} cancelled</span>}
          {statusCounts.archived > 0 && <span>{statusCounts.archived} archived</span>}
        </div>
        <SessionTable sessions={sessions} />
      </section>
    </>
  );
}
