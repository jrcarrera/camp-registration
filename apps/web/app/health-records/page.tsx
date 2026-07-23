import { AlertCircle } from 'lucide-react';

import { HealthRecordsWorkspace } from '../../components/health-records-workspace';
import { getHealthRecords } from '../../lib/api';

export const dynamic = 'force-dynamic';

export default async function HealthRecordsPage() {
  try {
    const center = await getHealthRecords();
    return (
      <>
        <header className="pageHeader">
          <div>
            <p className="contextLabel">Restricted operations</p>
            <h1>Health records</h1>
            <p className="pageDescription">
              Review pre-arrival health submissions in a separately authorized and audited
              workspace.
            </p>
          </div>
        </header>
        <HealthRecordsWorkspace initialCenter={center} mode="staff" requestHeaders={{}} />
      </>
    );
  } catch {
    return (
      <div className="notice noticeError" role="alert">
        <AlertCircle size={18} /> Restricted health records could not be loaded.
      </div>
    );
  }
}
