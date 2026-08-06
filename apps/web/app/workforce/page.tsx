import { AlertCircle } from 'lucide-react';

import { WorkforceAdministrationWorkspace } from '../../components/workforce-administration-workspace';
import { getCatalog, getSessions, getWorkforce } from '../../lib/api';

export const dynamic = 'force-dynamic';

export default async function WorkforcePage() {
  try {
    const [catalog, workforce, sessions] = await Promise.all([
      getCatalog(),
      getWorkforce(),
      getSessions(),
    ]);
    return (
      <WorkforceAdministrationWorkspace
        initial={workforce}
        seasons={catalog.seasons}
        sessions={sessions.sessions}
      />
    );
  } catch {
    return (
      <div className="notice noticeError" role="alert">
        <AlertCircle aria-hidden="true" size={18} /> Workforce administration could not be loaded.
        Confirm that your role has camp or organization administrator access and verified MFA.
      </div>
    );
  }
}
