import { AlertCircle } from 'lucide-react';

import { ParentAssistanceWorkspace } from '../../../components/parent-assistance-workspace';
import {
  getParentApiHeaders,
  getParentCatalog,
  getParentFamilies,
  getParentFamily,
  getParentFinancialAssistance,
} from '../../../lib/api';

export const dynamic = 'force-dynamic';

export default async function ParentAssistancePage() {
  const headers = getParentApiHeaders();
  try {
    const [catalog, families] = await Promise.all([
      getParentCatalog(headers),
      getParentFamilies(headers),
    ]);
    const family = families.families[0]
      ? await getParentFamily(families.families[0].id, headers)
      : null;
    const assistance = family
      ? await getParentFinancialAssistance(family.id, headers)
      : { applications: [] };
    return (
      <>
        <header className="pageHeader">
          <div>
            <p className="contextLabel">Parent portal</p>
            <h1>Financial assistance</h1>
            <p className="pageDescription">Apply for support and follow the review decision.</p>
          </div>
        </header>
        {family ? (
          <ParentAssistanceWorkspace
            applications={assistance.applications}
            family={family}
            headers={headers}
            seasons={catalog.seasons}
          />
        ) : (
          <section className="contentSection portalEmptyState">
            <h2>No linked family account</h2>
          </section>
        )}
      </>
    );
  } catch {
    return (
      <>
        <header className="pageHeader">
          <div>
            <p className="contextLabel">Parent portal</p>
            <h1>Financial assistance</h1>
          </div>
        </header>
        <div className="notice noticeError" role="alert">
          <AlertCircle size={18} /> Assistance information could not be loaded.
        </div>
      </>
    );
  }
}
