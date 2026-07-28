import { ArrowLeft, ClipboardCheck } from 'lucide-react';
import Link from 'next/link';
import { notFound } from 'next/navigation';

import { SessionCheckInDesk } from '../../../../components/session-check-in-desk';
import { ApiError, getSession, getSessionAttendanceSummary } from '../../../../lib/api';

export const dynamic = 'force-dynamic';

function initialAttendanceDate(startsOn: string, endsOn: string): string {
  const today = new Date().toISOString().slice(0, 10);
  if (today < startsOn) return startsOn;
  if (today > endsOn) return endsOn;
  return today;
}

export default async function CheckInDeskPage({
  params,
}: {
  params: Promise<{ sessionId: string }>;
}) {
  const { sessionId } = await params;

  try {
    const summary = await getSessionAttendanceSummary(sessionId);
    const attendanceDate = initialAttendanceDate(summary.starts_on, summary.ends_on);
    const session = await getSession(sessionId, attendanceDate);

    return (
      <>
        <Link className="backLink" href={`/sessions/${session.id}`}>
          <ArrowLeft size={16} aria-hidden="true" />
          Session roster
        </Link>
        <header className="editorHeader checkInHeader">
          <div>
            <p className="contextLabel">{session.code}</p>
            <h1 id="check-in-desk-heading">Check-in desk</h1>
            <p className="pageDescription">
              Daily roll call, attendance history, and pickup for {session.name}.
            </p>
          </div>
          <Link className="buttonSecondary" href={`/sessions/${session.id}`}>
            <ClipboardCheck size={17} aria-hidden="true" />
            Session setup
          </Link>
        </header>
        <SessionCheckInDesk
          initialAttendanceDate={attendanceDate}
          initialSummary={summary}
          session={session}
        />
      </>
    );
  } catch (error) {
    if (error instanceof ApiError && error.status === 404) notFound();
    throw error;
  }
}
