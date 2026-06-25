import { ArrowLeft } from 'lucide-react';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import type { RegisteredCamper } from '@camp-registration/contracts';

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
        <RegisteredCampers campers={session.registered_campers} />
      </>
    );
  } catch (error) {
    if (error instanceof ApiError && error.status === 404) notFound();
    throw error;
  }
}

function RegisteredCampers({ campers }: { campers: RegisteredCamper[] }) {
  return (
    <section className="contentSection" id="registered-campers" aria-labelledby="roster-heading">
      <div className="sectionHeading">
        <div>
          <h2 id="roster-heading">Registered Campers</h2>
          <p className="sectionDescription">{campers.length} confirmed campers</p>
        </div>
      </div>
      <div className="tableFrame">
        <table className="sessionsTable">
          <thead>
            <tr>
              <th>Camper</th>
              <th>Family</th>
              <th>Gender</th>
              <th>Grade</th>
              <th>Registered</th>
            </tr>
          </thead>
          <tbody>
            {campers.length === 0 ? (
              <tr>
                <td className="emptyState" colSpan={5}>
                  <strong>No registered campers</strong>
                  <span>Confirmed registrations will appear here.</span>
                </td>
              </tr>
            ) : (
              campers.map((camper) => (
                <tr key={camper.registration_id}>
                  <td>
                    <Link
                      className="sessionLink"
                      href={`/families/${camper.family_id}#camper-${camper.camper_id}`}
                    >
                      <strong>
                        {camper.preferred_name ?? camper.first_name} {camper.last_name}
                      </strong>
                      <span>{camper.birth_date}</span>
                    </Link>
                  </td>
                  <td>{camper.family_name}</td>
                  <td>{camper.gender ?? 'Not specified'}</td>
                  <td>{camper.school_grade ?? 'Not set'}</td>
                  <td>{new Date(camper.registered_at).toLocaleDateString('en-US')}</td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </section>
  );
}
