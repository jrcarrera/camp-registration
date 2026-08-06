import { AlertCircle } from 'lucide-react';

import { WorkforceSessionRoster } from '../../../components/workforce-session-roster';
import { getSessions } from '../../../lib/api';

export const dynamic = 'force-dynamic';

export default async function WorkforceRosterPage() {
  try {
    const sessions = await getSessions();
    return <WorkforceSessionRoster sessions={sessions.sessions} />;
  } catch {
    return (
      <div className="notice noticeError" role="alert">
        <AlertCircle aria-hidden="true" size={18} /> The session workforce roster could not be
        loaded. Confirm that your role has camp staff or administrator access.
      </div>
    );
  }
}
