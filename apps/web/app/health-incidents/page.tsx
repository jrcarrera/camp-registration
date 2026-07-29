import { AlertCircle } from 'lucide-react';

import { HealthIncidentsWorkspace } from '../../components/health-incidents-workspace';
import { getHealthIncidents } from '../../lib/api';

export const dynamic = 'force-dynamic';

export default async function HealthIncidentsPage() {
  try {
    const center = await getHealthIncidents();
    return (
      <>
        <header className="pageHeader">
          <div>
            <p className="contextLabel">Restricted operations</p>
            <h1>Incident and injury log</h1>
            <p className="pageDescription">
              Record camper incidents, append follow-up notes, and close the timeline without
              rewriting its history.
            </p>
          </div>
        </header>
        <HealthIncidentsWorkspace initialCenter={center} />
      </>
    );
  } catch {
    return (
      <div className="notice noticeError" role="alert">
        <AlertCircle size={18} /> Restricted incidents could not be loaded.
      </div>
    );
  }
}
