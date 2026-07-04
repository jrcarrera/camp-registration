import { ArrowLeft, ClipboardCheck } from 'lucide-react';
import Link from 'next/link';
import { notFound } from 'next/navigation';

import { SessionCheckInDesk } from '../../../../components/session-check-in-desk';
import { ApiError, getSession } from '../../../../lib/api';

export const dynamic = 'force-dynamic';

export default async function CheckInDeskPage({
  params,
}: {
  params: Promise<{ sessionId: string }>;
}) {
  const { sessionId } = await params;

  try {
    const session = await getSession(sessionId);

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
              Fast attendance and pickup workflow for {session.name}.
            </p>
          </div>
          <Link className="buttonSecondary" href={`/sessions/${session.id}`}>
            <ClipboardCheck size={17} aria-hidden="true" />
            Session setup
          </Link>
        </header>
        <SessionCheckInDesk session={session} />
      </>
    );
  } catch (error) {
    if (error instanceof ApiError && error.status === 404) notFound();
    throw error;
  }
}
