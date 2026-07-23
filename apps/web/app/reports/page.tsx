import { AlertCircle } from 'lucide-react';

import { ReportWorkspace } from '../../components/report-workspace';
import { getReports, getSessions } from '../../lib/api';

export const dynamic = 'force-dynamic';

export default async function ReportsPage() {
  try {
    const [sessionResponse, reportCenter] = await Promise.all([getSessions(), getReports()]);
    const sessions = sessionResponse.sessions
      .filter((session) => session.status !== 'ARCHIVED' && session.status !== 'CANCELLED')
      .sort((left, right) => left.starts_on.localeCompare(right.starts_on));

    return (
      <>
        <header className="pageHeader">
          <div>
            <p className="contextLabel">Camp operations</p>
            <h1>Reports and exports</h1>
            <p className="pageDescription">
              Turn live session data into consistent files for arrival, rosters, and daily staff
              workflows.
            </p>
          </div>
        </header>
        <ReportWorkspace initialCenter={reportCenter} sessions={sessions} />
      </>
    );
  } catch {
    return (
      <div className="notice noticeError" role="alert">
        <AlertCircle size={18} /> Report data could not be loaded.
      </div>
    );
  }
}
