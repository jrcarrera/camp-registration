import { AlertCircle } from 'lucide-react';

import { HealthRecordsWorkspace } from '../../../components/health-records-workspace';
import { getParentApiHeaders, getParentHealthRecords } from '../../../lib/api';

export const dynamic = 'force-dynamic';

export default async function ParentHealthRecordsPage() {
  const requestHeaders = getParentApiHeaders();
  try {
    const center = await getParentHealthRecords(requestHeaders);
    return (
      <>
        <header className="pageHeader">
          <div>
            <p className="contextLabel">Parent portal</p>
            <h1>Camper health records</h1>
            <p className="pageDescription">
              Keep allergies, medications, immunizations, and care instructions current before camp.
            </p>
          </div>
        </header>
        <HealthRecordsWorkspace
          initialCenter={center}
          mode="parent"
          requestHeaders={requestHeaders}
        />
      </>
    );
  } catch {
    return (
      <div className="notice noticeError" role="alert">
        <AlertCircle size={18} /> Camper health records could not be loaded.
      </div>
    );
  }
}
