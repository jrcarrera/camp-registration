import { AlertCircle } from 'lucide-react';

import { AssistanceReviewWorkspace } from '../../components/assistance-review-workspace';
import { getFinancialAssistance } from '../../lib/api';

export const dynamic = 'force-dynamic';

export default async function FinancialAssistancePage() {
  try {
    const { applications } = await getFinancialAssistance();
    return (
      <>
        <header className="pageHeader">
          <div>
            <p className="contextLabel">Registration finance</p>
            <h1>Financial assistance</h1>
            <p className="pageDescription">
              Review parent requests and create bounded, auditable awards.
            </p>
          </div>
        </header>
        <AssistanceReviewWorkspace initial={applications} />
      </>
    );
  } catch {
    return (
      <>
        <header className="pageHeader">
          <div>
            <p className="contextLabel">Registration finance</p>
            <h1>Financial assistance</h1>
          </div>
        </header>
        <div className="notice noticeError" role="alert">
          <AlertCircle size={18} /> Assistance applications could not be loaded.
        </div>
      </>
    );
  }
}
