import { ArrowLeft } from 'lucide-react';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import type { RegisteredCamper } from '@camp-registration/contracts';

import { SessionEditor } from '../../../components/session-editor';
import { WaitlistPromoteButton } from '../../../components/waitlist-promote-button';
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
        <RegisteredCampers
          availableCount={session.available_count}
          campers={session.registered_campers}
          sessionId={session.id}
        />
      </>
    );
  } catch (error) {
    if (error instanceof ApiError && error.status === 404) notFound();
    throw error;
  }
}

function RegisteredCampers({
  availableCount,
  campers,
  sessionId,
}: {
  availableCount: number;
  campers: RegisteredCamper[];
  sessionId: string;
}) {
  const confirmedCount = campers.filter((camper) => camper.status === 'CONFIRMED').length;
  const waitlistedCount = campers.filter((camper) => camper.status === 'WAITLISTED').length;

  return (
    <section className="contentSection" id="registered-campers" aria-labelledby="roster-heading">
      <div className="sectionHeading">
        <div>
          <h2 id="roster-heading">Campers</h2>
          <p className="sectionDescription">
            {confirmedCount} attending, {waitlistedCount} waitlisted
          </p>
        </div>
        <WaitlistPromoteButton
          disabled={waitlistedCount === 0 || availableCount === 0}
          sessionId={sessionId}
        />
      </div>
      <div className="tableFrame">
        <table className="sessionsTable">
          <thead>
            <tr>
              <th>Camper</th>
              <th>Family</th>
              <th>Gender</th>
              <th>Grade</th>
              <th>Status</th>
              <th>Source</th>
              <th>Registered</th>
            </tr>
          </thead>
          <tbody>
            {campers.length === 0 ? (
              <tr>
                <td className="emptyState" colSpan={7}>
                  <strong>No campers</strong>
                  <span>Confirmed and waitlisted campers will appear here.</span>
                </td>
              </tr>
            ) : (
              campers.map((camper) => (
                <tr
                  className={camper.status === 'WAITLISTED' ? 'rosterRowWaitlisted' : undefined}
                  key={camper.registration_id}
                >
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
                  <td data-label="Family">{camper.family_name}</td>
                  <td data-label="Gender">{camper.gender ?? 'Not specified'}</td>
                  <td data-label="Grade">{camper.school_grade ?? 'Not set'}</td>
                  <td data-label="Status">
                    <span
                      className={`registrationStatus registrationStatus${camper.status.toLowerCase()}`}
                    >
                      {camper.status === 'CONFIRMED' ? 'Attending' : 'Waitlisted'}
                    </span>
                  </td>
                  <td data-label="Source">{camper.source === 'ADMIN' ? 'Admin' : 'Parent'}</td>
                  <td data-label="Registered">
                    {new Date(camper.registered_at).toLocaleDateString('en-US')}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </section>
  );
}
