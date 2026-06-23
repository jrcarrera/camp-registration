import type { CatalogContext, SessionSummary } from '@camp-registration/contracts';
import { AlertCircle, Plus } from 'lucide-react';
import Link from 'next/link';

import { SeasonSelector } from '../../components/season-selector';
import { SessionTable } from '../../components/session-table';
import { getCatalog, getSessions } from '../../lib/api';

export const dynamic = 'force-dynamic';

export default async function SessionsPage({
  searchParams,
}: {
  searchParams?: Promise<{ seasonId?: string }>;
}) {
  const requestedSeasonId = (await searchParams)?.seasonId;
  let sessions: SessionSummary[] = [];
  let seasons: CatalogContext['seasons'] = [];
  let selectedSeasonId: string | null = null;
  let errorMessage: string | null = null;

  try {
    const [catalog, response] = await Promise.all([getCatalog(), getSessions()]);
    seasons = catalog.seasons;
    const selectedSeason =
      seasons.find((season) => season.id === requestedSeasonId) ?? seasons[0] ?? null;
    selectedSeasonId = selectedSeason?.id ?? null;
    sessions = selectedSeasonId
      ? response.sessions.filter((session) => session.season_id === selectedSeasonId)
      : response.sessions;
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
          {selectedSeasonId && (
            <SeasonSelector seasons={seasons} selectedSeasonId={selectedSeasonId} />
          )}
          <Link
            className="buttonPrimary"
            href={selectedSeasonId ? `/sessions/new?seasonId=${selectedSeasonId}` : '/sessions/new'}
          >
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
