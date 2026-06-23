import { ArrowLeft } from 'lucide-react';
import Link from 'next/link';
import { notFound } from 'next/navigation';

import { SessionEditor } from '../../../components/session-editor';
import { ApiError, getCatalog, getSession } from '../../../lib/api';

export const dynamic = 'force-dynamic';

export default async function SessionEditorPage({
  params,
}: {
  params: Promise<{ sessionId: string }>;
}) {
  const { sessionId } = await params;

  try {
    const [catalog, session] = await Promise.all([getCatalog(), getSession(sessionId)]);
    const sessionSeason = catalog.seasons.find((season) => season.id === session.season_id);
    return (
      <>
        <Link className="backLink" href="/sessions">
          <ArrowLeft size={16} aria-hidden="true" />
          Sessions
        </Link>
        <header className="editorHeader">
          <div>
            <p className="contextLabel">{session.code}</p>
            <h1>{session.name}</h1>
            <p className="pageDescription">
              Edit week configuration for {sessionSeason?.name ?? 'the selected season'}.
            </p>
          </div>
          <span className={`statusBadge status${session.status.toLowerCase()}`}>
            {session.status.charAt(0) + session.status.slice(1).toLowerCase()}
          </span>
        </header>
        <SessionEditor programs={catalog.programs} seasons={catalog.seasons} session={session} />
      </>
    );
  } catch (error) {
    if (error instanceof ApiError && error.status === 404) notFound();
    throw error;
  }
}
