import { AlertCircle } from 'lucide-react';

import { ReportWorkspace } from '../../components/report-workspace';
import { SeasonComparisonPanel } from '../../components/season-comparison-panel';
import {
  getReports,
  getSeasonComparison,
  getSeasonComparisonOptions,
  getSessions,
} from '../../lib/api';

export const dynamic = 'force-dynamic';

export default async function ReportsPage() {
  try {
    const [sessionResponse, reportCenter, comparisonOptions] = await Promise.all([
      getSessions().catch(() => null),
      getReports().catch(() => null),
      getSeasonComparisonOptions().catch(() => null),
    ]);
    if (!reportCenter && !comparisonOptions) {
      throw new Error('Report access is not permitted');
    }
    const sessions = (sessionResponse?.sessions ?? [])
      .filter((session) => session.status !== 'ARCHIVED' && session.status !== 'CANCELLED')
      .sort((left, right) => left.starts_on.localeCompare(right.starts_on));
    const seasons = comparisonOptions?.seasons ?? [];
    const initialComparison =
      seasons[0] && seasons[1]
        ? await getSeasonComparison(seasons[0].id, seasons[1].id).catch(() => null)
        : null;

    return (
      <>
        <header className="pageHeader">
          <div>
            <p className="contextLabel">Camp operations</p>
            <h1>Reports and exports</h1>
            <p className="pageDescription">
              Compare season performance and turn live session data into consistent operational
              files.
            </p>
          </div>
        </header>
        {comparisonOptions ? (
          <SeasonComparisonPanel initialComparison={initialComparison} seasons={seasons} />
        ) : null}
        {reportCenter ? <ReportWorkspace initialCenter={reportCenter} sessions={sessions} /> : null}
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
