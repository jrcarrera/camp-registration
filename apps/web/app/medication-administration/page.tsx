import { AlertCircle } from 'lucide-react';

import { MedicationAdministrationWorkspace } from '../../components/medication-administration-workspace';
import { getMedicationAdministration } from '../../lib/api';

export const dynamic = 'force-dynamic';

export default async function MedicationAdministrationPage() {
  try {
    const center = await getMedicationAdministration();
    return (
      <>
        <header className="pageHeader">
          <div>
            <p className="contextLabel">Restricted operations</p>
            <h1>Medication administration</h1>
            <p className="pageDescription">
              Run scheduled and as-needed medication rounds with encrypted orders, duplicate-dose
              protection, and an append-only outcome history.
            </p>
          </div>
        </header>
        <MedicationAdministrationWorkspace initialCenter={center} />
      </>
    );
  } catch {
    return (
      <div className="notice noticeError" role="alert">
        <AlertCircle size={18} /> Medication administration could not be loaded.
      </div>
    );
  }
}
