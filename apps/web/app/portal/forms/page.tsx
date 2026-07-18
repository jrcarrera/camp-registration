import { AlertCircle, FileCheck2 } from 'lucide-react';

import { ParentFormsWorkspace } from '../../../components/parent-forms-workspace';
import { getParentApiHeaders, getParentForms } from '../../../lib/api';

export const dynamic = 'force-dynamic';

export default async function ParentFormsPage() {
  const requestHeaders = getParentApiHeaders();
  let errorMessage: string | null = null;
  let obligations = [] as Awaited<ReturnType<typeof getParentForms>>['obligations'];
  try {
    obligations = (await getParentForms(requestHeaders)).obligations;
  } catch {
    errorMessage = 'Your required forms could not be loaded.';
  }

  return (
    <>
      <header className="pageHeader">
        <div>
          <p className="contextLabel">Parent portal</p>
          <h1>Forms & waivers</h1>
          <p className="pageDescription">
            Complete the published requirements for each confirmed camp registration.
          </p>
        </div>
      </header>
      {errorMessage && (
        <div className="notice noticeError" role="alert">
          <AlertCircle size={18} aria-hidden="true" />
          {errorMessage}
        </div>
      )}
      {!errorMessage && obligations.length === 0 && (
        <section className="contentSection portalEmptyState" aria-label="No required forms">
          <FileCheck2 size={30} aria-hidden="true" />
          <h2>You’re all caught up</h2>
          <p>There are no published forms for your confirmed registrations.</p>
        </section>
      )}
      {!errorMessage && obligations.length > 0 && (
        <ParentFormsWorkspace initialObligations={obligations} requestHeaders={requestHeaders} />
      )}
    </>
  );
}
