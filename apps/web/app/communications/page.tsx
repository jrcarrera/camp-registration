import { AlertCircle } from 'lucide-react';

import { CommunicationsWorkspace } from '../../components/communications-workspace';
import { getCommunications, getSessions } from '../../lib/api';

export const dynamic = 'force-dynamic';

export default async function CommunicationsPage() {
  try {
    const [center, sessions] = await Promise.all([getCommunications(), getSessions()]);
    return (
      <>
        <header className="pageHeader">
          <div>
            <p className="contextLabel">Family engagement</p>
            <h1>Lifecycle communications</h1>
            <p className="pageDescription">
              Build reusable operational messages, preview recipients, and schedule delivery from
              one auditable workspace.
            </p>
          </div>
        </header>
        <CommunicationsWorkspace
          initialCenter={center}
          sessions={sessions.sessions.filter(
            (session) => session.status !== 'ARCHIVED' && session.status !== 'CANCELLED',
          )}
        />
      </>
    );
  } catch {
    return (
      <div className="notice noticeError" role="alert">
        <AlertCircle size={18} /> Communications could not be loaded.
      </div>
    );
  }
}
