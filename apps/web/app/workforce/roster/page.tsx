import { AlertCircle } from 'lucide-react';

import { WorkforceSessionRoster } from '../../../components/workforce-session-roster';
import { getSessionWorkforceRoster, getSessions } from '../../../lib/api';

export const dynamic = 'force-dynamic';

export default async function WorkforceRosterPage() {
  try {
    const sessions = await getSessions();
    const initialRoster = sessions.sessions[0]
      ? await getSessionWorkforceRoster(sessions.sessions[0].id)
      : null;
    return <WorkforceSessionRoster initialRoster={initialRoster} sessions={sessions.sessions} />;
  } catch {
    return (
      <div className="notice noticeError" role="alert">
        <AlertCircle aria-hidden="true" size={18} /> The session workforce roster could not be
        loaded. Confirm that your role has camp staff or administrator access.
      </div>
    );
  }
}
