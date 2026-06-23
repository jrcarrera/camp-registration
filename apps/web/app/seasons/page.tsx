import type { CatalogContext, SessionSummary } from '@camp-registration/contracts';
import { AlertCircle, ChevronRight, Plus } from 'lucide-react';
import Link from 'next/link';

import { getCatalog, getSessions } from '../../lib/api';

export const dynamic = 'force-dynamic';

export default async function SeasonsPage() {
  let seasons: CatalogContext['seasons'] = [];
  let sessions: SessionSummary[] = [];
  let errorMessage: string | null = null;

  try {
    const [catalog, response] = await Promise.all([getCatalog(), getSessions()]);
    seasons = catalog.seasons;
    sessions = response.sessions;
  } catch {
    errorMessage = 'Season data could not be loaded. Confirm that the local API is running.';
  }

  const seasonRows = seasons.map((season) => {
    const seasonSessions = sessions.filter((session) => session.season_id === season.id);
    const scheduledSessions = seasonSessions.filter(
      (session) => session.status !== 'CANCELLED' && session.status !== 'ARCHIVED',
    );
    return {
      ...season,
      scheduledCapacity: scheduledSessions.reduce((total, session) => total + session.capacity, 0),
      scheduledCount: scheduledSessions.length,
      sessionCount: seasonSessions.length,
    };
  });

  return (
    <>
      <header className="pageHeader">
        <div>
          <p className="contextLabel">Catalog management</p>
          <h1>Seasons</h1>
          <p className="pageDescription">
            Create registration seasons and review how many camp weeks are attached to each one.
          </p>
        </div>
        <Link className="buttonPrimary" href="/seasons/new">
          <Plus size={17} aria-hidden="true" />
          Add season
        </Link>
      </header>

      {errorMessage && (
        <div className="notice noticeError" role="alert">
          <AlertCircle size={18} aria-hidden="true" />
          {errorMessage}
        </div>
      )}

      <section className="contentSection seasonsManagement" aria-label="Camp seasons">
        <div className="listSummary">
          <strong>{seasons.length} seasons</strong>
          <span>{sessions.length} total sessions</span>
        </div>
        <div className="tableFrame">
          <table className="programsTable seasonsTable">
            <thead>
              <tr>
                <th>Season</th>
                <th>Year</th>
                <th>Sessions</th>
                <th>Scheduled spaces</th>
                {seasonRows.length > 0 && (
                  <th className="actionColumn" scope="col">
                    <span className="srOnly">Open</span>
                  </th>
                )}
              </tr>
            </thead>
            <tbody>
              {seasonRows.map((season) => (
                <tr key={season.id}>
                  <td data-label="Season">
                    <Link className="sessionLink" href={`/sessions?seasonId=${season.id}`}>
                      <strong>{season.name}</strong>
                    </Link>
                  </td>
                  <td data-label="Year">{season.year}</td>
                  <td data-label="Sessions">
                    {season.scheduledCount} scheduled / {season.sessionCount} total
                  </td>
                  <td data-label="Scheduled spaces">{season.scheduledCapacity}</td>
                  <td className="rowAction">
                    <Link
                      href={`/sessions?seasonId=${season.id}`}
                      aria-label={`View ${season.name}`}
                    >
                      <ChevronRight size={18} aria-hidden="true" />
                    </Link>
                  </td>
                </tr>
              ))}
              {seasonRows.length === 0 && !errorMessage && (
                <tr>
                  <td className="emptyState" colSpan={5}>
                    <strong>No seasons yet</strong>
                    <span>Add a season before creating sessions.</span>
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>
    </>
  );
}
